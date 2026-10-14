// api/career.js — 미니게임 "커리어 모드"(선수 한 명의 커리어 키우기)
//
// 계산은 전부 _career_sim.js(서버)에서 하고, 진행 상태는 암호화 토큰(_token.js, deflate)으로 브라우저와 주고받는다.
// KV는 랭킹에만 쓴다(submit/board/card). 숨은 재능·구단 명성 숫자·발롱 점수 같은 숨김 값은
// 응답에 넣지 않는다(토큰은 암호화라 안 보인다). 설계는 docs/career-mode/implementation.md.
//
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
import {kickVerdict} from './_career_shootout.js';
import {NATIONAL_REACTION_GROUPS} from './_career_international.js';
import { CLUB_KIT } from './_club_kits.js';

const {ready: tokenReady, seal, open} = tokenCodec('career-token-v1', {zip: true});
const FORMAT = 1;   // 토큰 형식 버전(밸런스 버전이 아니다 — 필드 구조가 바뀔 때만 올리고 옛 값은 읽을 때 채운다)

const BAD_WORDS = /(시발|씨발|ㅅㅂ|병신|ㅂㅅ|좆|존나|개새|새끼|fuck|shit|bitch|nigg)/i;
const FEET = ['오른발', '왼발'];

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
// 옛 한 판(career:board:v1 · career:card:{키} · career:sum)은 처음 읽을 때 한 번 포지션별로 옮긴다(career:mig:v2 NX).
//   옛 카드는 옮기지 않고 career:card:{키}로 그대로 읽는다(새 키가 없을 때, 그 카드의 포지션이 맞으면).
// career:done:{id}  같은 커리어 두 번 등록 방지(30일) / career:reg:{YYYY-MM} 월 등록 수(무료 한도 보호).
// 초기화: POST ?a=wipe (CRON_SECRET, {confirm:'RESET'}) — .github/workflows/career-reset.yml로 실행한다.
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
  return {v: SUM_V, id: card.id, nm: card.name, nat: card.nation, pos: card.pos, card: card.card, num: card.num, peak: card.peak,
    club: mainClubOf(card), hon: order.slice(0, 16).map(nm => [nm, g[nm].c])};
};
// 옛 한 판 → 포지션별(한 번만). 옛 요약에 포지션이 있어서 그걸로 나눈다.
let _migrated = false;
async function migrateV1(){
  if(_migrated) return;
  if(await kv('SET', 'career:mig:v2', '1', 'NX') === 'OK'){
    const flat = await kv('ZRANGE', BOARD_V1, 0, -1, 'WITHSCORES') || [];
    if(flat.length){
      const sums = await kv('HGETALL', 'career:sum') || [], sum = {};
      for(let i = 0; i + 1 < sums.length; i += 2) sum[sums[i]] = sums[i + 1];
      const by = {FW: [], MF: [], DF: []}, hs = {FW: [], MF: [], DF: []};
      for(let i = 0; i + 1 < flat.length; i += 2){
        const k = String(flat[i]).slice(1); let pos = null;
        try { pos = JSON.parse(sum[k] || '{}').pos; } catch(_){}
        if(!by[pos]) continue;
        by[pos].push(Number(flat[i + 1]), flat[i]); hs[pos].push(k, sum[k]);
      }
      for(const p of POSS) if(by[p].length){ await kv('ZADD', boardKey(p), ...by[p]); await kv('HSET', sumKey(p), ...hs[p]); }
    }
  }
  _migrated = true;
}
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
  await migrateV1();
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

class Bad extends Error {}
const bad = m => { throw new Bad(m); };

function cleanInput(b){
  const name = String(b.name || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if(!name) bad('이름을 입력해 주세요.');
  if([...name].length > 12) bad('이름은 12자까지 쓸 수 있어요.');
  if(BAD_WORDS.test(name.replace(/\s/g, ''))) bad('쓸 수 없는 단어가 들어 있어요.');
  const nation = String(b.nation || '');
  if(!S.natInfo(nation)) bad('국적을 골라 주세요.');
  const foot = FEET.includes(b.foot) ? b.foot : bad('주발을 골라 주세요.');
  const pos = ['FW', 'MF', 'DF'].includes(b.pos) ? b.pos : bad('포지션을 골라 주세요.');
  const card = Number(b.card);
  if(!Number.isInteger(card) || !S.CARDS[pos][card]) bad('선수 유형을 골라 주세요.');
  const num = Number(b.num);
  if(!Number.isInteger(num) || num < 1 || num > 99) bad('등번호는 1~99예요.');
  const dream = b.dream == null || b.dream === '' ? null : String(b.dream);
  if(dream && !S.clubByName(dream)) bad('꿈의 구단을 다시 골라 주세요.');
  const body = S.BODIES.includes(b.body) ? b.body : bad('체형을 골라 주세요.');
  return {name, nation, foot, pos, card, num, dream, body};
}

// 토큰 → 상태. 단계가 맞지 않으면 거부.
function load(token, phases){
  const st = open(token);
  if(!st || !st.v) bad('커리어 정보가 올바르지 않아요. 새로 시작해 주세요.');
  if(phases && !phases.includes(st.phase)) bad('진행 순서가 맞지 않아요. 화면을 새로고침해 주세요.');
  S.militaryView(st);
  if(st.phase==='result') S.refreshYouthRelease(st);
  return st;
}

const clubView = c => ({n: c.n, id: c.id, nat: c.nat});
const firstView = (input, seed) => S.firstClubs(input.nation, input.pos, input.card, seed).map(o => ({...clubView(o.club), kind: o.kind, chance: o.chance, acad: o.acad}));
// 시즌 결과 화면(숨김 값 없음). 지난 결과(last)는 토큰에 결과 화면용으로 남겨 둔다 — 이어 하기에서 다시 그린다.
const resultView = C => {
  const r = C.hist[C.hist.length - 1];
  return {row: r, offers: S.offersView(C), stay: S.stayView(C), traitOffer: (C.traitOffer||[]).map(id => S.traitView(id, C.pos)),
          released: !!C.released, forced: !!C.forced, forcedWhy: C.forcedWhy || null, canRetire: C.age >= 29};
};

const clone=C=>JSON.parse(JSON.stringify(C));
function seasonDraft(C,choice,decisions={}){const D=clone(C);D.phase=C.pendingSeason?.phase||C.phase;delete D.pendingSeason;D.penaltyMode=true;D.penaltyDecisions=decisions;const r=S.playSeason(D,choice);return {D,r};}
function firstPenalty(row){for(const w of row?.national||[])for(const m of w.matches)if(m.pk?.pending)return {w,m};return null;}
function advanceSeason(C,choice,decisions={}){
 const base=clone(C),phase=C.pendingSeason?.phase||C.phase,{D,r}=seasonDraft(C,choice,decisions);
 if(!r.injury&&firstPenalty(r.row)){delete base.pendingSeason;Object.assign(C,base,{phase:'penalty',pendingSeason:{phase,choice,decisions}});return {penalty:true};}
 for(const k of Object.keys(C))delete C[k];Object.assign(C,D);
 if(!r.injury){C.forced=r.forced;C.forcedWhy=r.forcedWhy;delete C.pending;}return r;
}
function penaltyView(C){
 const {r}=seasonDraft(C,C.pendingSeason.choice,C.pendingSeason.decisions),P=firstPenalty(r.row);if(!P)throw Error('승부차기 상태가 올바르지 않습니다.');
 const preview=clone(r.row);delete preview.hon;delete preview.notes;delete preview.international;delete preview.bloom;delete preview.scout;delete preview.deltas;
 for(const w of preview.national||[])if(w.pending){w.outcome='승부차기 결과 대기';w.won=false;w.medal=false;w.qualified=false;delete w.place;if(w.bracket)w.bracket.winner=null;}
 return {phase:'penalty',player:S.playerView(C),preview,shootout:{key:P.m.pk.key,cup:P.w.name,year:2027+C.age-15,window:P.w.id,stage:P.m.stage,nation:C.nation,opp:P.m.opp,our:P.m.our,their:P.m.their,prefix:{ours:P.m.pk.ours,theirs:P.m.pk.theirs,our:P.m.pk.our,their:P.m.pk.their}}};
}

// 지금 단계에 맞는 화면 데이터
function view(C){
  if(C.phase === 'penalty')return penaltyView(C);
  if(C.phase === 'pick') return {phase: 'pick', clubs: firstView(C.input, C.seed)};
  if(C.phase === 'retired') return {phase: 'retired', card: S.cardView(C)};
  const player = S.playerView(C);
  if(C.phase === 'prep') return {phase: 'prep', player, prep: S.prepView(C)};
  if(C.phase === 'injury') return {phase: 'injury', player, prep: S.prepView(C), injury: injuryView(C.inj), pending: C.pending};
  return {phase: 'result', player, result: resultView(C)};
}
const injuryView = inj => ({name: inj.name, major: inj.major, games: inj.games});

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
    if(a === 'board'){
      if(!kvReady()) return res.json({top: []});
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=30');
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
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=30');
      return res.json({nick: nick || k, card: JSON.parse(raw)});
    }
    if(req.method !== 'POST') return res.status(405).json({error: 'POST만 받습니다'});
    if(!tokenReady()) return res.status(503).json({error: '게임 서버 설정이 아직 안 됐어요.'});
    const body = await readBody(req);

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

    if(a === 'service-return'){
      const C=load(body.token,['prep']);try { S.regularReturn(C); } catch(e){ bad(e.message); }
      return res.json({token:seal(C),...view(C)});
    }

    if(a === 'scout'){
      const C=load(body.token,['prep']);
      try { S.acceptScout(C); } catch(e){ bad(e.message); }
      return res.json({token:seal(C),...view(C)});
    }

    if(a === 'season'){
      const C = load(body.token, ['prep', 'injury']);
      // 부상 질문에 답하는 두 번째 호출은 첫 호출의 훈련·이벤트 선택을 그대로 쓴다(토큰에 남겨 둔 것)
      const choice = C.phase === 'injury' ? {...C.pending, injPick: Number(body.injPick)} : {train: body.train, evPick: Number(body.evPick), loanPick: Number(body.loanPick) || 0};
      if(C.phase === 'prep' && ![0, 1].includes(choice.evPick)) bad('이벤트 선택지를 골라 주세요.');
      if(C.phase === 'injury' && ![0, 1].includes(choice.injPick)) bad('부상 대처를 골라 주세요.');
      const r = advanceSeason(C, choice);
      if(r.penalty)return res.json({token:seal(C),...view(C)});
      if(r.injury){
        C.pending = {train: choice.train, evPick: choice.evPick};   // 임대 구단은 이미 C.loanClub에 정해졌다
        // 시즌 진행 화면이 부상 전까지도 숫자를 올릴 수 있게: 부상 처리를 어느 쪽으로 골라도 나오는 최소 기록.
        // (최종 기록은 이보다 작아지지 않아서, 부상 뒤 이어서 올라가도 숫자가 뒤로 가지 않는다) 상태는 건드리지 않는다.
        const rows = [0, 1].map(k => { const c = JSON.parse(JSON.stringify(C)); return S.playSeason(c, {...C.pending, injPick: k}).row; });
        const pre = rows.reduce((m, w) => m ? m.map((x, i) => Math.min(x, [w.apps, w.goals, w.ast, w.cs][i])) : [w.apps, w.goals, w.ast, w.cs], null);
        const games = rows[1].games;   // 시즌 진행 화면의 경기 칸 수
        const segments=rows[1].segments && rows[1].segments.map((seg,i)=>({...seg,...Object.fromEntries(['apps','starts','goals','ast','cs'].map(k=>[k,Math.min(seg[k],rows[0].segments[i][k])]))}));
        const national=(rows[1].national||[]).filter(w=>!w.knockout).filter(w=>(rows[0].national||[]).some(other=>other.id===w.id&&JSON.stringify(other)===JSON.stringify(w)));
        return res.json({token: seal(C), ...view(C), pre: {national, apps: pre[0], goals: pre[1], ast: pre[2], cs: pre[3], games, ...(segments?{segments}:{})}});
      }
      delete C.pending;
      C.forced = r.forced; C.forcedWhy = r.forcedWhy;
      return res.json({token: seal(C), ...view(C)});
    }

    if(a==='penalty'){
      const C=load(body.token,['penalty']),P=penaltyView(C).shootout;
      if(body.key!==P.key)bad('현재 승부차기를 다시 확인해 주세요.');
      const input={x:body.x,y:body.y,power:body.power};
      let outcome;try{outcome=kickVerdict(C.seed,P.key,input);}catch(e){bad(e.message);}
      const decisions={...C.pendingSeason.decisions,[P.key]:input};
      advanceSeason(C,C.pendingSeason.choice,decisions);
      const v=view(C),row=v.preview||v.result.row,w=row.national.find(w=>w.id===P.window),m=w.matches.find(m=>m.stage===P.stage);
      return res.json({token:seal(C),...v,penaltyResult:{key:P.key,kick:outcome,pk:m.pk,stage:P.stage,window:P.window}});
    }

    if(a === 'military'){
      const C=load(body.token,['result']);
      try { S.militaryAction(C,body.action); } catch(e){ bad(e.message); }
      return res.json({token:seal(C), ...view(C)});
    }

    if(a === 'next'){
      const C = load(body.token, ['result']);
      const pick = body.pick == null || body.pick === '' ? null : Number(body.pick);
      if(pick != null && !(Number.isInteger(pick) && C.offers[pick])) bad('제안을 다시 골라 주세요.');
      // 특성 제안이 있으면 반드시 하나를 고른다(강제 은퇴로 끝나는 시즌은 제외)
      const tp = body.trait == null || body.trait === '' ? null : Number(body.trait);
      if(C.traitOffer && C.traitOffer.length && !C.forced && !(Number.isInteger(tp) && C.traitOffer[tp])) bad('특성을 하나 골라 주세요.');
      const mv=S.militaryView(C);
      if(pick!=null && mv && (mv.selected || mv.service || mv.lastChance)) bad('병역 계획을 먼저 결정해 주세요.');
      S.nextSeason(C, pick, tp);
      delete C.forced; delete C.forcedWhy;
      return res.json({token: seal(C), ...view(C)});
    }

    if(a === 'retire'){
      const C = load(body.token, ['result', 'retired']);
      if(C.phase === 'result' && C.age < 29 && !C.forced) bad('29세부터 은퇴할 수 있어요.');
      S.retire(C);
      return res.json({token: seal(C), ...view(C)});
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
      await migrateV1();
      const member = ACCT + acct.k, score = C.score, pos = C.pos, BK = boardKey(pos);
      const prev = Number(await kv('ZSCORE', BK, member)) || 0;
      if(score > prev){
        const card = S.cardView(C);
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
      }
      const rank = await kv('ZREVRANK', BK, member);
      return res.json(rank == null ? {registered: false, outside: true, pos}
        : {registered: true, pos, rank: rank + 1, key: acct.k, score, best: Math.max(prev, score), improved: score > prev});
    }

    if(a === 'view'){
      const C = load(body.token);
      return res.json({token: body.token, ...view(C)});
    }

    return res.status(400).json({error: 'unknown action'});
  } catch(e){
    if(e instanceof Bad) return res.status(400).json({error: e.message});
    console.error('career', a, e && e.message);
    return res.status(500).json({error: '잠시 후 다시 시도해 주세요.'});
  }
}
