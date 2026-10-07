// api/career.js — 미니게임 "커리어 모드"(선수 한 명의 커리어 키우기)
//
// 계산은 전부 _career_sim.js(서버)에서 하고, 진행 상태는 암호화 토큰(_token.js, deflate)으로 브라우저와 주고받는다.
// KV는 랭킹에만 쓴다(submit/board/card — 아직 없음). 숨은 재능·구단 명성 숫자·발롱 점수 같은 숨김 값은
// 응답에 넣지 않는다(토큰은 암호화라 안 보인다). 설계는 docs/career-mode/implementation.md.
//
//   POST ?a=new     {name, nation, foot, pos, card, num, dream}  → {token, clubs}      첫 구단 3곳
//   POST ?a=join    {token, pick}                                 → {token, player, prep}
//   POST ?a=season  {token, train, evPick[, injPick]}             → {token, injury} | {token, player, result}
//   POST ?a=next    {token, pick?}                                → {token, player, prep} | {token, card}(은퇴)
//   POST ?a=retire  {token}                                       → {token, card}
//   POST ?a=view    {token}                                       → 지금 단계 화면(이어 하기)
//   GET  ?a=meta                                                  → 화면용 고정 데이터(국가·카드·스탯·이름·구단 이름/id, 명성 없음)

import crypto from 'crypto';
import { tokenCodec } from './_token.js';
import * as S from './_career_sim.js';

const {ready: tokenReady, seal, open} = tokenCodec('career-token-v1', {zip: true});
const FORMAT = 1;   // 토큰 형식 버전(밸런스 버전이 아니다 — 필드 구조가 바뀔 때만 올리고 옛 값은 읽을 때 채운다)

const BAD_WORDS = /(시발|씨발|ㅅㅂ|병신|ㅂㅅ|좆|존나|개새|새끼|fuck|shit|bitch|nigg)/i;
const FEET = ['오른발', '왼발'];

let META = null;
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
const firstView = input => S.firstClubs(input.nation, input.pos, input.card).map(o => ({...clubView(o.club), kind: o.kind, chance: o.chance, grow: o.grow}));
// 시즌 결과 화면(숨김 값 없음). 지난 결과(last)는 토큰에 결과 화면용으로 남겨 둔다 — 이어 하기에서 다시 그린다.
const resultView = C => {
  const r = C.hist[C.hist.length - 1];
  return {row: r, offers: S.offersView(C),
          released: !!C.released, forced: !!C.forced, canRetire: C.age >= 29};
};

// 지금 단계에 맞는 화면 데이터
function view(C){
  if(C.phase === 'pick') return {phase: 'pick', clubs: firstView(C.input)};
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
        clubs: Object.fromEntries(Object.entries(S.CLUBS).map(([k, cs]) => [k, cs.map(c => [c[0], c[2]])]))}));
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
      if(![0, 1, 2].includes(pick)) bad('구단을 골라 주세요.');
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
        return res.json({token: seal(C), ...view(C)});
      }
      delete C.pending;
      C.forced = r.forced;
      return res.json({token: seal(C), ...view(C)});
    }

    if(a === 'next'){
      const C = load(body.token, ['result']);
      const pick = body.pick == null || body.pick === '' ? null : Number(body.pick);
      if(pick != null && !(Number.isInteger(pick) && C.offers[pick])) bad('제안을 다시 골라 주세요.');
      S.nextSeason(C, pick);
      delete C.forced;
      return res.json({token: seal(C), ...view(C)});
    }

    if(a === 'retire'){
      const C = load(body.token, ['result', 'retired']);
      if(C.phase === 'result' && C.age < 29 && !C.forced) bad('29세부터 은퇴할 수 있어요.');
      S.retire(C);
      return res.json({token: seal(C), ...view(C)});
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
