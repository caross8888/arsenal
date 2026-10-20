// api/career.js — 미니게임 "커리어 모드"(선수 한 명의 커리어 키우기)
//
// 계산은 public/career/sim-v1을 공유한다. 새 유스는 로컬, 18세 평가 뒤 commit부터 암호화 토큰(_token.js, deflate)으로 진행한다.
// KV는 랭킹에만 쓴다(submit/board/card). 숨은 재능·구단 명성 숫자·발롱 점수 같은 숨김 값은
// 응답에 넣지 않는다(토큰은 암호화라 안 보인다). 설계는 docs/career-mode/implementation.md.
//
//   POST ?a=commit  {version, seed, input, choices, next} → 서버 재생·seed2 봉인·다음 시즌 준비
//   POST ?a=new     {name, nation, foot, pos, card, num, dream}  → {token, clubs}      첫 구단 3곳
//   POST ?a=join    {token, pick}                                 → {token, player, prep}
//   POST ?a=season  {token, train, evPick[, loanPick][, injPick]}             → {token, injury} | {token, player, result}
//   POST ?a=penalty {token,key,x,y,power} → 승부차기 판정 및 대회 진행
//   POST ?a=military {token, action:"apply"|"regular"}          → 상무 지원/일반 복무 선택
//   POST ?a=next    {token, pick?, trait?}                                → {token, player, prep} | {token, card}(은퇴)
//   POST ?a=retire  {token}                                       → {token, card}
//   POST ?a=view    {token}                                       → 지금 단계 화면(이어 하기)
//   POST ?a=submit  {token} + Authorization: Bearer <승부예측 토큰> → {registered, rank, best, improved, key}
//   GET  ?a=board[&p=FW|MF|DF]                                    → 역대 TOP 100(30초 CDN 캐시). p 없으면 전체(세 포지션 기록을 점수순으로)
//   GET  ?a=card&k=<계정 키>&p=<포지션>                           → 그 계정의 그 포지션 대표 은퇴 카드
//   GET  ?a=meta                                                  → 화면용 고정 데이터(국가·카드·스탯·이름·구단 이름/id, 명성 없음)

import crypto from 'crypto';
import { tokenCodec } from './_token.js';
import { readToken } from './_account.js';
import * as S from './_career_sim.js';
import {Bad, cleanInput, view, withStay, step} from '../public/career/sim-v1/flow.js';
import * as L1 from '../public/career/sim-v1/local.js';
import * as L2 from '../public/career/sim-v2/local.js';
import * as F2 from '../public/career/sim-v2/flow.js';
import * as S2 from '../public/career/sim-v2/sim.js';
import {NATIONAL_REACTION_GROUPS} from './_career_international.js';
import { CLUB_KIT } from './_club_kits.js';

const {ready: tokenReady, seal, open} = tokenCodec('career-token-v1', {zip: true});
const FORMAT = 1;   // 토큰 형식 버전(밸런스 버전이 아니다 — 필드 구조가 바뀔 때만 올리고 옛 값은 읽을 때 채운다)

let META = null;
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

// ── 랭킹(KV) ─────────────────────────────────────────────────────────
// 포지션별로 따로 저장한다(사용자 지정 — 전체 상위권은 결국 공격수가 차지해서, 랭킹을 전체/공격수/미드필더/수비수로 나눈다).
// 한 판(전체 1,000개)에 같이 두면 수비수는 상위 1,000 안에 30%만 남고, 계정당 하나라 공격수 기록이 수비수 기록을 지웠다.
// career:board:v2:{FW|MF|DF}  정렬 집합, 멤버 '@{계정 키}', 점수 = 커리어 점수. 계정당 포지션별 최고 하나, 포지션마다 상위 1,000개.
// career:card:{키}:{포지션}   그 기록의 은퇴 카드(cardView) JSON — 랭킹에서 눌러 열어 본다.
// career:sum:{포지션}         해시 {키: 랭킹 한 줄 요약 JSON} — 100줄을 HMGET 한 번으로 그린다.
// 전체 탭은 세 판의 상위 100을 합쳐 점수순으로 — 한 계정이 포지션마다 한 줄씩 나올 수 있다(저장은 따로 안 한다).
// 옛 한 판(career:board:v1 · career:card:{키} · career:sum)은 포지션별로 옮겨 두었다(2026-10 확인, career:mig:v2 = 1).
//   옮기는 코드는 지웠다 — 랭킹을 열 때마다 확인용 KV 왕복이 한 번씩 더 들었다(Cloudflare에선 DB가 멀어 지연이 컸다).
//   옛 카드는 옮기지 않고 career:card:{키}로 그대로 읽는다(새 키가 없을 때, 그 카드의 포지션이 맞으면).
// career:done:{id}  같은 커리어 두 번 등록 방지(30일) / career:reg:{YYYY-MM} 월 등록 수(무료 한도 보호).
// 초기화: POST ?a=wipe (CRON_SECRET, {confirm:'RESET'}) — .github/workflows/career-reset.yml로 실행한다.
const BOARD_VER = 'career:board:ver';
const POSS = ['FW', 'MF', 'DF'], BOARD_V1 = 'career:board:v1', boardKey = p => `career:board:v2:${p}`, sumKey = p => `career:sum:${p}`;
const BOARD_KEEP = 1000, BOARD_SHOW = 100, MONTHLY_REG_CAP = 20000, ACCT = '@';
async function kv(...args){
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: {Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json'},
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(6000),
  });
  const j = await r.json();
  if(j.error) throw new Error(`KV ${args[0]}: ${j.error}`);
  return j.result;
}
const kvReady = () => !!(KV_URL && KV_TOKEN);
// 랭킹 한 줄 요약(SUM_V): 아바타(커리어 id·등번호·주 소속 구단 유니폼)와 주요 트로피(S·A·B 상, 이름별 횟수, 큰 상부터 최대 16개).
//   몇 개를 보일지는 화면이 정한다(폭이 차면 뒤쪽을 감춘다). 옛 요약(v 없음)은 readPos가 저장된 카드로 다시 만든다.
const SUM_V = 2, TIER = 'SAB';
const mainClubOf = card => {
  const apps = {}; let m = null;
  for(const r of card.seasons || []){ if(r.youth || r.loan) continue; apps[r.club] = (apps[r.club] || 0) + r.apps; if(!m || apps[r.club] > apps[m.n]) m = {n: r.club, id: r.id}; }
  const last = (card.seasons || []).at(-1);
  return m || (last ? {n: last.club, id: last.id} : null);
};
const summaryOf = card => {
  const g = {}, order = [];
  for(const [n, tier] of card.honors || []){
    if(!TIER.includes(tier)) continue;
    const nm = String(n).split(' ×')[0], c = +(String(n).split('×')[1]) || 1;
    if(!g[nm]){ g[nm] = {t: tier, c: 0}; order.push(nm); }
    g[nm].c += c;
  }
  order.sort((a, b) => TIER.indexOf(g[a].t) - TIER.indexOf(g[b].t) || g[b].c - g[a].c);
  return {v: SUM_V, id: card.id, ...(card.lookId?{lookId:card.lookId}:{}), nm: card.name, nat: card.nation, pos: card.pos, card: card.card, num: card.num, peak: card.peak,
    club: mainClubOf(card), hon: order.slice(0, 16).map(nm => [nm, g[nm].c])};
};
const _boards = {}, _boardAt = {};
async function readPos(p, n){
  const flat = await kv('ZRANGE', boardKey(p), 0, n - 1, 'REV', 'WITHSCORES') || [];
  const top = [];
  for(let i = 0; i + 1 < flat.length; i += 2) top.push({key: String(flat[i]).slice(1), score: Number(flat[i + 1]), p});
  if(top.length){
    const sums = await kv('HMGET', sumKey(p), ...top.map(r => r.key)) || [];
    top.forEach((r, i) => { try { Object.assign(r, JSON.parse(sums[i] || '{}')); } catch(_){} r.p = p; });
    // 옛 요약(아바타·구단·트로피 전체가 없던 것)은 저장된 카드로 한 번 다시 만들어 덮어쓴다
    const stale = top.filter(r => r.v !== SUM_V);
    if(stale.length){
      const raws = await kv('MGET', ...stale.map(r => `career:card:${r.key}:${p}`)) || [];
      const olds = raws.some(x => !x) ? await kv('MGET', ...stale.map(r => `career:card:${r.key}`)) || [] : [];
      const put = [];
      stale.forEach((r, i) => {
        let card = null;
        try { card = JSON.parse(raws[i] || 'null'); if(!card){ const o = JSON.parse(olds[i] || 'null'); if(o && o.pos === p) card = o; } } catch(_){}
        if(!card) return;
        const sum = summaryOf(card); Object.assign(r, sum); put.push(r.key, JSON.stringify(sum));
      });
      if(put.length) await kv('HSET', sumKey(p), ...put);
    }
  }
  return top;
}
async function readBoard(pos){
  const id = POSS.includes(pos) ? pos : 'ALL';
  if(_boards[id] && Date.now() - _boardAt[id] < 30 * 1000) return _boards[id];
  let top;
  if(id !== 'ALL') top = await readPos(id, BOARD_SHOW);
  else {
    // 전체: 세 판의 상위 100을 합쳐 점수순(사용자 지정 — 한 계정의 공격수·미드필더 기록이 둘 다 나온다)
    top = (await Promise.all(POSS.map(p => readPos(p, BOARD_SHOW)))).flat().sort((a, b) => b.score - a.score).slice(0, BOARD_SHOW);
  }
  if(top.length){
    const names = await kv('HMGET', 'pk:names', ...top.map(r => r.key)) || [];
    top.forEach((r, i) => { r.nick = names[i] || r.key; });
  }
  _boards[id] = {top}; _boardAt[id] = Date.now();
  return _boards[id];
}

const flowOf=C=>C.simVersion===2?F2:{view,withStay,step};
const simOf=C=>C.simVersion===2?S2:S;
const bad=m=>{throw new Bad(m);};

// 토큰 → 상태. 단계가 맞지 않으면 거부.
function load(token, phases){
  const st = open(token);
  if(!st || !st.v) bad('커리어 정보가 올바르지 않아요. 새로 시작해 주세요.');
  if(phases && !phases.includes(st.phase)) bad('진행 순서가 맞지 않아요. 화면을 새로고침해 주세요.');
  const sim=simOf(st);
  sim.militaryView(st);
  if(st.phase==='result') sim.refreshYouthRelease(st);
  return st;
}

async function readBody(req){
  if(req.body && typeof req.body === 'object') return req.body;
  if(typeof req.body === 'string'){ try { return JSON.parse(req.body); } catch(_){ return {}; } }
  return {};
}

export default async function handler(req, res){
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  const a = String(req.query.a || '');
  try {
    // 관리자: 커리어 랭킹 초기화(사용자 지정 — 밸런스가 크게 바뀌어 예전 기록과 비교가 안 된다). CRON_SECRET으로만 열리고(미설정이면 거부),
    // {confirm:'RESET'}이 있어야 지운다({dry:true}면 지울 개수만). 지우는 것: 포지션별 판·요약·은퇴 카드, 옛 한 판(v1)과 그 요약·카드.
    // 남기는 것: career:done(같은 커리어 재등록 방지)·career:reg(월 등록 수)·career:mig:v2(옛 판을 다시 옮기지 않게).
    if(a === 'wipe'){
      const secret = process.env.CRON_SECRET;
      if(!secret) return res.status(503).json({error: 'CRON_SECRET 미설정'});
      if(req.method !== 'POST' || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({error: 'unauthorized'});
      if(!kvReady()) return res.status(503).json({error: 'KV 미설정'});
      const body = await readBody(req);
      if(!body.dry && body.confirm !== 'RESET') bad('confirm: RESET이 필요해요.');
      const keys = [];
      for(const p of POSS){
        const ms = await kv('ZRANGE', boardKey(p), 0, -1) || [];
        ms.forEach(m => keys.push(`career:card:${String(m).slice(1)}:${p}`));
        keys.push(boardKey(p), sumKey(p));
      }
      (await kv('ZRANGE', BOARD_V1, 0, -1) || []).forEach(m => keys.push(`career:card:${String(m).slice(1)}`));
      keys.push(BOARD_V1, 'career:sum');
      const counts = Object.fromEntries(await Promise.all(POSS.map(async p => [p, await kv('ZCARD', boardKey(p))])));
      if(body.dry) return res.json({dry: true, records: counts, keys: keys.length});
      await kv('SET', 'career:mig:v2', '1');
      let deleted = 0;
      for(let i = 0; i < keys.length; i += 200) deleted += await kv('DEL', ...keys.slice(i, i + 200));
      for(const id in _boards) delete _boards[id];
      await kv('INCR', BOARD_VER).catch(() => {});
      return res.json({ok: true, records: counts, deleted});
    }
    if(a === 'meta'){
      res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
      return res.json(META || (META = {
        nations: S.NATIONS, nationalReactionGroups: NATIONAL_REACTION_GROUPS, stats: S.STATS, names: S.NAMES, bodies: S.bodyMeta(),
        cards: Object.fromEntries(Object.entries(S.CARDS).map(([p, cs]) => [p, cs.map((c, i) => { const st = S.startStats(p, i); return {n: c.n, d: c.d, w: c.w, st, ovr: S.ovrOf(st, c.w)}; })])),
        // 꿈의 구단 고르기용 — 명성 숫자는 빼고 이름·엠블럼 id만(국가 안에서는 명성 순)
        clubs: Object.fromEntries(Object.entries(S.CLUBS).map(([k, cs]) => [k, cs.map(c => [c[0], c[2], CLUB_KIT[c[2]] || null])])),   // [이름, Fotmob id, 유니폼 색(_club_kits.js)]
        // 특성 이름 → 아이콘 id(img/traits/{id}.svg). 예전 은퇴 카드엔 이름만 저장돼 있어 이걸로 아이콘을 찾는다
        // 이름을 바꾼 특성의 옛 이름도 남긴다(킬패스 선호 → 스루패스 선호)
        traitIds: {'킬패스 선호':'kpass', ...Object.fromEntries([...S.CTRAITS, ...S.TRAITS].map(t => [t.n, t.id]))}}));
    }
    // 은퇴 카드 이미지 저장용 엠블럼 프록시 — Fotmob 이미지는 CORS 헤더가 없어 캔버스에 그리면 막힌다. 숫자 id만, CDN에 30일 캐시.
    if(a === 'logo'){
      const id = String(req.query.id || '');
      if(!/^\d{1,9}$/.test(id)) return res.status(400).end();
      const r = await fetch(`https://images.fotmob.com/image_resources/logo/teamlogo/${id}.png`);
      if(!r.ok) return res.status(404).end();
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000, immutable');
      return res.end(Buffer.from(await r.arrayBuffer()));
    }
    // 랭킹 버전(등록할 때마다 1씩) — 크론이 5분마다 이것만 읽어 랭킹이 바뀌었는지 본다(랭킹 4종을 다시 읽으면 KV 16회)
    if(a === 'boardver'){
      res.setHeader('Cache-Control', 'public, max-age=0');   // no-store면 크론(callHandler)이 응답을 버린다. s-maxage가 없어 가장자리 캐시엔 안 남는다
      return res.json({v: kvReady() ? Number(await kv('GET', BOARD_VER)) || 0 : 0});
    }
    if(a === 'board'){
      if(!kvReady()) return res.json({top: []});
      // CDN 5분(사용자 지정 — 32KB 응답이 30초마다 다시 만들어져 원본 전송량이 하루 500MB까지 올랐다).
      // 방금 등록한 사람은 화면이 주소에 t=를 붙여 새로 받아 가므로 자기 순위가 늦게 보이지 않는다.
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
      return res.json(await readBoard(String(req.query.p || '')));
    }
    if(a === 'card'){
      const k = String(req.query.k || '').slice(0, 64), p = String(req.query.p || '');
      if(!k || !kvReady()) return res.status(404).json({error: '카드를 찾을 수 없어요.'});
      let [raw, nick] = await Promise.all([POSS.includes(p) ? kv('GET', `career:card:${k}:${p}`) : null, kv('HGET', 'pk:names', k)]);
      if(!raw){   // 포지션별로 나누기 전에 등록한 기록(옛 카드 키)
        const old = await kv('GET', `career:card:${k}`);
        try { if(old && (!POSS.includes(p) || JSON.parse(old).pos === p)) raw = old; } catch(_){}
      }
      if(!raw) return res.status(404).json({error: '랭킹에서 내려간 기록이에요.'});
      // 카드는 더 높은 점수로 다시 등록할 때만 바뀌고, 화면이 주소에 점수(s=)를 붙이므로 오래 둬도 된다(닉네임 변경은 최대 1시간 늦게).
      res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400');
      return res.json({nick: nick || k, card: JSON.parse(raw)});
    }
    if(req.method !== 'POST') return res.status(405).json({error: 'POST만 받습니다'});
    if(!tokenReady()) return res.status(503).json({error: '게임 서버 설정이 아직 안 됐어요.'});
    const body = await readBody(req);

    if(a === 'commit'){
      const local=body.version===1?L1:body.version===2?L2:null;
      if(!local)bad('유스 계산 버전이 달라요. 새로 시작해 주세요.');
      const C=local.replay(body);
      local.validateNext(C,body.next);
      C.seed2=crypto.randomBytes(4).readUInt32LE(0);
      C.id=crypto.randomBytes(8).toString('hex');
      return res.json(flowOf(C).step(C,'next',body.next,{seal}));
    }

    if(a === 'new'){
      const input = cleanInput(body);
      const C = {v: FORMAT, phase: 'pick', id: crypto.randomBytes(8).toString('hex'), seed: crypto.randomBytes(4).readUInt32LE(0), input};
      return res.json({token: seal(C), ...view(C)});
    }

    if(a === 'join'){
      const P = load(body.token, ['pick']), pick = Number(body.pick);
      if(!(Number.isInteger(pick) && pick >= 0 && pick < S.firstClubs(P.input.nation, P.input.pos, P.input.card, P.seed).length)) bad('구단을 골라 주세요.');
      const C = S.createCareer(P.input, pick, P.seed);
      Object.assign(C, {v: FORMAT, id: P.id});
      return res.json({token: seal(C), ...view(C)});
    }

    if(['service-return','scout','season','penalty','military','next','retire'].includes(a)){
      const C=load(body.token);
      return res.json(flowOf(C).step(C, a, body, {seal}));
    }

    if(a === 'submit'){
      const C = load(body.token, ['retired']);
      // 등록은 승부예측 계정으로만(Who Am I와 같음). 계정당 최고 커리어 하나.
      const acct = readToken(req);
      if(!acct) return res.status(401).json({error: '랭킹 등록은 로그인 후에 할 수 있어요.', login: true});
      if(!kvReady()) return res.status(503).json({error: '랭킹 저장소에 연결할 수 없어요.'});
      const fresh = await kv('SET', `career:done:${C.id}`, acct.k, 'NX', 'EX', 30 * 86400);
      if(fresh !== 'OK') return res.status(409).json({error: '이미 등록한 커리어예요.'});
      const month = new Date().toISOString().slice(0, 7);
      const used = await kv('INCR', `career:reg:${month}`);
      if(used === 1) await kv('EXPIRE', `career:reg:${month}`, 40 * 86400);
      if(used > MONTHLY_REG_CAP) return res.status(429).json({error: '이번 달 랭킹 등록이 마감됐어요. 다음 달에 다시 열려요.'});
      const member = ACCT + acct.k, score = C.score, pos = C.pos, BK = boardKey(pos);
      const prev = Number(await kv('ZSCORE', BK, member)) || 0;
      if(score > prev){
        const card = simOf(C).cardView(C);
        await kv('SET', `career:card:${acct.k}:${pos}`, JSON.stringify(card));
        await kv('HSET', sumKey(pos), acct.k, JSON.stringify(summaryOf(card)));
        await kv('ZADD', BK, score, member);
        // 그 포지션 1,000위 밖으로 밀린 계정은 그 포지션 카드·요약도 지운다
        const out = await kv('ZRANGE', BK, 0, -(BOARD_KEEP + 1)) || [];
        if(out.length){
          const ks = out.map(m => String(m).slice(1));
          await kv('ZREM', BK, ...out);
          await kv('DEL', ...ks.map(k => `career:card:${k}:${pos}`));
          await kv('HDEL', sumKey(pos), ...ks);
        }
        delete _boards[pos]; delete _boards.ALL;
        // 랭킹 버전 — 공용 데이터 크론(cloudflare/snapshots.js)이 이 숫자가 바뀔 때만 랭킹 파일을 다시 만든다
        await kv('INCR', BOARD_VER).catch(() => {});
      }
      const rank = await kv('ZREVRANK', BK, member);
      return res.json(rank == null ? {registered: false, outside: true, pos}
        : {registered: true, pos, rank: rank + 1, key: acct.k, score, best: Math.max(prev, score), improved: score > prev});
    }

    if(a === 'view'){
      const C = load(body.token);
      const flow=flowOf(C);
      return res.json(flow.withStay(C, {token: body.token, ...flow.view(C)}, seal));
    }

    return res.status(400).json({error: 'unknown action'});
  } catch(e){
    if(e instanceof Bad) return res.status(400).json({error: e.message});
    console.error('career', a, e && e.message);
    return res.status(500).json({error: '잠시 후 다시 시도해 주세요.'});
  }
}
