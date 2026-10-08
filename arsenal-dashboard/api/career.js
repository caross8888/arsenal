// api/career.js — 미니게임 "커리어 모드"(선수 한 명의 커리어 키우기)
//
// 계산은 전부 _career_sim.js(서버)에서 하고, 진행 상태는 암호화 토큰(_token.js, deflate)으로 브라우저와 주고받는다.
// KV는 랭킹에만 쓴다(submit/board/card). 숨은 재능·구단 명성 숫자·발롱 점수 같은 숨김 값은
// 응답에 넣지 않는다(토큰은 암호화라 안 보인다). 설계는 docs/career-mode/implementation.md.
//
//   POST ?a=new     {name, nation, foot, pos, card, num, dream}  → {token, clubs}      첫 구단 3곳
//   POST ?a=join    {token, pick}                                 → {token, player, prep}
//   POST ?a=season  {token, train, evPick[, injPick]}             → {token, injury} | {token, player, result}
//   POST ?a=next    {token, pick?, trait?}                                → {token, player, prep} | {token, card}(은퇴)
//   POST ?a=retire  {token}                                       → {token, card}
//   POST ?a=view    {token}                                       → 지금 단계 화면(이어 하기)
//   POST ?a=submit  {token} + Authorization: Bearer <승부예측 토큰> → {registered, rank, best, improved, key}
//   GET  ?a=board                                                 → 역대 TOP 100(30초 CDN 캐시)
//   GET  ?a=card&k=<계정 키>                                      → 그 계정의 대표 은퇴 카드
//   GET  ?a=meta                                                  → 화면용 고정 데이터(국가·카드·스탯·이름·구단 이름/id, 명성 없음)

import crypto from 'crypto';
import { tokenCodec } from './_token.js';
import { readToken } from './_account.js';
import * as S from './_career_sim.js';

const {ready: tokenReady, seal, open} = tokenCodec('career-token-v1', {zip: true});
const FORMAT = 1;   // 토큰 형식 버전(밸런스 버전이 아니다 — 필드 구조가 바뀔 때만 올리고 옛 값은 읽을 때 채운다)

const BAD_WORDS = /(시발|씨발|ㅅㅂ|병신|ㅂㅅ|좆|존나|개새|새끼|fuck|shit|bitch|nigg)/i;
const FEET = ['오른발', '왼발'];

let META = null;
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

// ── 랭킹(KV) ─────────────────────────────────────────────────────────
// career:board:v1  정렬 집합, 멤버 '@{계정 키}', 점수 = 커리어 점수. 계정당 최고 커리어 하나, 상위 1,000개만.
// career:card:{키}  그 계정 대표 커리어의 은퇴 카드(cardView) JSON — 랭킹에서 눌러 열어 본다.
// career:sum        해시 {키: 랭킹 한 줄 요약 JSON} — 랭킹 100줄을 HMGET 한 번으로 그린다.
// career:done:{id}  같은 커리어 두 번 등록 방지(30일) / career:reg:{YYYY-MM} 월 등록 수(무료 한도 보호).
const BOARD_KEY = 'career:board:v1', BOARD_KEEP = 1000, BOARD_SHOW = 100, MONTHLY_REG_CAP = 20000, ACCT = '@';
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
// 랭킹 한 줄 요약: 대표 업적(발롱도르·월드컵·챔스·리그 우승·득점왕 중 있는 것 셋)
const TOP_HON = [['발롱도르', /^발롱도르$/], ['월드컵 우승', /월드컵 우승/], ['챔피언스리그 우승', /챔피언스리그 우승/], ['리그 우승', /리그 우승$/], ['득점왕', /득점왕/]];
const summaryOf = card => ({nm: card.name, nat: card.nation, pos: card.pos, card: card.card, peak: card.peak,
  hon: TOP_HON.map(([n, re]) => [n, card.honors.filter(h => re.test(h[0])).length]).filter(x => x[1]).slice(0, 3)});
let _board = null, _boardAt = 0;
async function readBoard(){
  if(_board && Date.now() - _boardAt < 30 * 1000) return _board;
  const flat = await kv('ZRANGE', BOARD_KEY, 0, BOARD_SHOW - 1, 'REV', 'WITHSCORES') || [];
  const top = [];
  for(let i = 0; i + 1 < flat.length; i += 2) top.push({key: String(flat[i]).slice(1), score: Number(flat[i + 1])});
  if(top.length){
    const keys = top.map(r => r.key);
    const [names, sums] = await Promise.all([kv('HMGET', 'pk:names', ...keys), kv('HMGET', 'career:sum', ...keys)]);
    top.forEach((r, i) => { r.nick = (names || [])[i] || r.key; try { Object.assign(r, JSON.parse((sums || [])[i] || '{}')); } catch(_){} });
  }
  _board = {top}; _boardAt = Date.now();
  return _board;
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
  return {name, nation, foot, pos, card, num, dream};
}

// 토큰 → 상태. 단계가 맞지 않으면 거부.
function load(token, phases){
  const st = open(token);
  if(!st || !st.v) bad('커리어 정보가 올바르지 않아요. 새로 시작해 주세요.');
  if(phases && !phases.includes(st.phase)) bad('진행 순서가 맞지 않아요. 화면을 새로고침해 주세요.');
  return st;
}

const clubView = c => ({n: c.n, id: c.id, nat: c.nat});
const firstView = (input, seed) => S.firstClubs(input.nation, input.pos, input.card, seed).map(o => ({...clubView(o.club), kind: o.kind, chance: o.chance, grow: o.grow}));
// 시즌 결과 화면(숨김 값 없음). 지난 결과(last)는 토큰에 결과 화면용으로 남겨 둔다 — 이어 하기에서 다시 그린다.
const resultView = C => {
  const r = C.hist[C.hist.length - 1];
  return {row: r, offers: S.offersView(C), stay: S.stayView(C), traitOffer: (C.traitOffer||[]).map(id => S.traitView(id, C.pos)),
          released: !!C.released, forced: !!C.forced, forcedWhy: C.forcedWhy || null, canRetire: C.age >= 29};
};

// 지금 단계에 맞는 화면 데이터
function view(C){
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
    if(a === 'meta'){
      res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
      return res.json(META || (META = {
        nations: S.NATIONS, stats: S.STATS, names: S.NAMES,
        cards: Object.fromEntries(Object.entries(S.CARDS).map(([p, cs]) => [p, cs.map((c, i) => { const st = S.startStats(p, i); return {n: c.n, d: c.d, w: c.w, st, ovr: S.ovrOf(st, c.w)}; })])),
        // 꿈의 구단 고르기용 — 명성 숫자는 빼고 이름·엠블럼 id만(국가 안에서는 명성 순)
        clubs: Object.fromEntries(Object.entries(S.CLUBS).map(([k, cs]) => [k, cs.map(c => [c[0], c[2]])])),
        // 특성 이름 → 아이콘 id(img/traits/{id}.svg). 예전 은퇴 카드엔 이름만 저장돼 있어 이걸로 아이콘을 찾는다
        traitIds: Object.fromEntries([...S.CTRAITS, ...S.TRAITS].map(t => [t.n, t.id]))}));
    }
    if(a === 'board'){
      if(!kvReady()) return res.json({top: []});
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=30');
      return res.json(await readBoard());
    }
    if(a === 'card'){
      const k = String(req.query.k || '').slice(0, 64);
      if(!k || !kvReady()) return res.status(404).json({error: '카드를 찾을 수 없어요.'});
      const [raw, nick] = await Promise.all([kv('GET', `career:card:${k}`), kv('HGET', 'pk:names', k)]);
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

    if(a === 'season'){
      const C = load(body.token, ['prep', 'injury']);
      // 부상 질문에 답하는 두 번째 호출은 첫 호출의 훈련·이벤트 선택을 그대로 쓴다(토큰에 남겨 둔 것)
      const choice = C.phase === 'injury' ? {...C.pending, injPick: Number(body.injPick)} : {train: body.train, evPick: Number(body.evPick)};
      if(C.phase === 'prep' && ![0, 1].includes(choice.evPick)) bad('이벤트 선택지를 골라 주세요.');
      if(C.phase === 'injury' && ![0, 1].includes(choice.injPick)) bad('부상 대처를 골라 주세요.');
      const r = S.playSeason(C, choice);
      if(r.injury){
        C.pending = {train: choice.train, evPick: choice.evPick};
        // 시즌 진행 화면이 부상 전까지도 숫자를 올릴 수 있게: 부상 처리를 어느 쪽으로 골라도 나오는 최소 기록.
        // (최종 기록은 이보다 작아지지 않아서, 부상 뒤 이어서 올라가도 숫자가 뒤로 가지 않는다) 상태는 건드리지 않는다.
        const pre = [0, 1].map(k => { const c = JSON.parse(JSON.stringify(C)); return S.playSeason(c, {...C.pending, injPick: k}).row; })
          .reduce((m, w) => m ? m.map((x, i) => Math.min(x, [w.apps, w.goals, w.ast, w.cs][i])) : [w.apps, w.goals, w.ast, w.cs], null);
        return res.json({token: seal(C), ...view(C), pre: {apps: pre[0], goals: pre[1], ast: pre[2], cs: pre[3]}});
      }
      delete C.pending;
      C.forced = r.forced; C.forcedWhy = r.forcedWhy;
      return res.json({token: seal(C), ...view(C)});
    }

    if(a === 'next'){
      const C = load(body.token, ['result']);
      const pick = body.pick == null || body.pick === '' ? null : Number(body.pick);
      if(pick != null && !(Number.isInteger(pick) && C.offers[pick])) bad('제안을 다시 골라 주세요.');
      // 특성 제안이 있으면 반드시 하나를 고른다(강제 은퇴로 끝나는 시즌은 제외)
      const tp = body.trait == null || body.trait === '' ? null : Number(body.trait);
      if(C.traitOffer && C.traitOffer.length && !C.forced && !(Number.isInteger(tp) && C.traitOffer[tp])) bad('특성을 하나 골라 주세요.');
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
      const member = ACCT + acct.k, score = C.score;
      const prev = Number(await kv('ZSCORE', BOARD_KEY, member)) || 0;
      if(score > prev){
        const card = S.cardView(C);
        await kv('SET', `career:card:${acct.k}`, JSON.stringify(card));
        await kv('HSET', 'career:sum', acct.k, JSON.stringify(summaryOf(card)));
        await kv('ZADD', BOARD_KEY, score, member);
        // 1,000위 밖으로 밀린 계정은 카드·요약도 지운다
        const out = await kv('ZRANGE', BOARD_KEY, 0, -(BOARD_KEEP + 1)) || [];
        if(out.length){
          const ks = out.map(m => String(m).slice(1));
          await kv('ZREM', BOARD_KEY, ...out);
          await kv('DEL', ...ks.map(k => `career:card:${k}`));
          await kv('HDEL', 'career:sum', ...ks);
        }
        _board = null;
      }
      const rank = await kv('ZREVRANK', BOARD_KEY, member);
      return res.json(rank == null ? {registered: false, outside: true}
        : {registered: true, rank: rank + 1, key: acct.k, score, best: Math.max(prev, score), improved: score > prev});
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
