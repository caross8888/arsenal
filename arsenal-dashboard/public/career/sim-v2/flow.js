// 결정적 커리어 진행. 네트워크·암호화·저장소 없이 서버와 브라우저가 공유한다.
import * as S from './sim.js';
import {kickVerdict} from '../sim-v1/shootout.js';
import {eventSeed} from '../sim-v1/seeds.js';
// 1·2버전 모두 API가 같은 입력 오류 클래스로 처리한다.
import {Bad} from '../sim-v1/flow.js';
export {Bad};
const bad=m=>{throw new Bad(m);};
const BAD_WORDS=/(시발|씨발|ㅅㅂ|병신|ㅂㅅ|좆|존나|개새|새끼|fuck|shit|bitch|nigg)/i;
const FEET=['오른발','왼발'];
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
function firstPenalty(row){for(const w of [...(row?.national||[]),...(row?.clubFinal?[row.clubFinal]:[])])for(const m of w.matches)if(m.pk?.pending)return {w,m};return null;}
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
 return {phase:'penalty',player:S.playerView(C),preview,shootout:{key:P.m.pk.key,cup:P.w.name,year:2027+C.age-15,window:P.w.id,stage:P.m.stage,nation:C.nation,opp:P.m.opp,...(P.w.kind==='club'?{kind:'club',ourName:P.w.club.n,theirName:P.w.opponent.n}:{}),our:P.m.our,their:P.m.their,prefix:{ours:P.m.pk.ours,theirs:P.m.pk.theirs,our:P.m.pk.our,their:P.m.pk.their}}};
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
// 시즌 계산을 마친 상태의 응답(승부차기 대기면 그 화면, 아니면 결과)
function seasonReply(C, r, seal, prefetch){
  if(!r.penalty){ delete C.pending; C.forced = r.forced; C.forcedWhy = r.forcedWhy; }
  return withStay(C, {token: seal(C), ...view(C)}, seal, prefetch);
}
// 잔류 미리 계산(사용자 지정 — 커리어 모드 요청 줄이기): 결과 화면에서 고를 게 없는 시즌(방출·특성 선택·강제 은퇴 아님)이면
// "잔류"로 넘긴 다음 시즌 준비 화면을 봉인해 같이 보낸다. 잔류를 고르면 화면이 next를 부르지 않고 이걸 쓴다.
// 서버가 낸 결과라 조작 여지가 없고, 이적을 고르거나 병역 결정을 바꾸면 예전처럼 next를 부른다.
function stayNext(C, seal){
  if(C.phase !== 'result' || C.forced || C.released || (C.traitOffer && C.traitOffer.length)) return null;
  const D = clone(C);
  S.nextSeason(D, null, null);
  delete D.forced; delete D.forcedWhy;
  return {token: seal(D), ...view(D)};
}
function withStay(C, out, seal, prefetch=true){ const s = prefetch && stayNext(C, seal); return s ? {...out, stayNext: s} : out; }


export {cleanInput, view, firstView, withStay};
function requirePhase(C,phases){if(!phases.includes(C.phase))bad('진행 순서가 맞지 않아요. 화면을 새로고침해 주세요.');}
export function step(C,a,body,{seal=()=>null,prefetch=true}={}){
 S.militaryView(C);
 if(C.phase==='result')S.refreshYouthRelease(C);
    if(a === 'service-return'){
      requirePhase(C,['prep']);try { S.regularReturn(C); } catch(e){ bad(e.message); }
      return ({token:seal(C),...view(C)});
    }

    if(a === 'scout'){
      requirePhase(C,['prep']);
      try { S.acceptScout(C); } catch(e){ bad(e.message); }
      return ({token:seal(C),...view(C)});
    }

    if(a === 'season'){
      requirePhase(C,['prep','injury']);
      // 부상 질문에 답하는 두 번째 호출은 첫 호출의 훈련·이벤트 선택을 그대로 쓴다(토큰에 남겨 둔 것)
      const choice = C.phase === 'injury' ? {...C.pending, injPick: Number(body.injPick)} : {train: body.train, evPick: Number(body.evPick), loanPick: Number(body.loanPick) || 0};
      if(C.phase === 'prep' && ![0, 1].includes(choice.evPick)) bad('이벤트 선택지를 골라 주세요.');
      if(C.phase === 'injury' && ![0, 1].includes(choice.injPick)) bad('부상 대처를 골라 주세요.');
      const r = advanceSeason(C, choice);
      if(r.penalty)return ({token:seal(C),...view(C)});
      if(r.injury){
        C.pending = {train: choice.train, evPick: choice.evPick};   // 임대 구단은 이미 C.loanClub에 정해졌다
        // 시즌 진행 화면이 부상 전까지도 숫자를 올릴 수 있게: 부상 처리를 어느 쪽으로 골라도 나오는 최소 기록.
        // (최종 기록은 이보다 작아지지 않아서, 부상 뒤 이어서 올라가도 숫자가 뒤로 가지 않는다) 상태는 건드리지 않는다.
        const rows = [0, 1].map(k => { const c = JSON.parse(JSON.stringify(C)); return S.playSeason(c, {...C.pending, injPick: k}).row; });
        const pre = rows.reduce((m, w) => m ? m.map((x, i) => Math.min(x, [w.apps, w.goals, w.ast, w.cs][i])) : [w.apps, w.goals, w.ast, w.cs], null);
        const games = rows[1].games;   // 시즌 진행 화면의 경기 칸 수
        const segments=rows[1].segments && rows[1].segments.map((seg,i)=>({...seg,...Object.fromEntries(['apps','starts','goals','ast','cs'].map(k=>[k,Math.min(seg[k],rows[0].segments[i][k])]))}));
        const national=(rows[1].national||[]).filter(w=>!w.knockout).filter(w=>(rows[0].national||[]).some(other=>other.id===w.id&&JSON.stringify(other)===JSON.stringify(w)));
        // 부상 답(두 갈래)을 미리 계산해 각각 봉인해 내려 준다 — 고른 쪽 토큰으로 이어 가면 두 번째 호출이 없다
        // (사용자 지정 — 커리어 모드 요청 줄이기). 둘 다 서버가 낸 결과라 조작 여지가 없고, 예전 방식(injPick 호출)도 그대로 받는다.
        const injOpts = prefetch ? [0, 1].map(k => { const D = clone(C); return seasonReply(D, advanceSeason(D, {...D.pending, injPick: k}), seal, prefetch); }) : undefined;
        return ({token: seal(C), ...view(C), pre: {national, apps: pre[0], goals: pre[1], ast: pre[2], cs: pre[3], games, ...(segments?{segments}:{})}, injOpts});
      }
      return (seasonReply(C, r, seal, prefetch));
    }

    if(a==='penalty'){
      requirePhase(C,['penalty']);const P=penaltyView(C).shootout;
      if(body.key!==P.key)bad('현재 승부차기를 다시 확인해 주세요.');
      const input={x:body.x,y:body.y,power:body.power};
      let outcome;try{outcome=kickVerdict(eventSeed(C),P.key,input);}catch(e){bad(e.message);}
      const decisions={...C.pendingSeason.decisions,[P.key]:input};
      advanceSeason(C,C.pendingSeason.choice,decisions);
      const v=view(C),row=v.preview||v.result.row,w=P.window==='club-final'?row.clubFinal:row.national.find(w=>w.id===P.window),m=w.matches.find(m=>m.stage===P.stage);
      return (withStay(C,{token:seal(C),...v,penaltyResult:{key:P.key,kick:outcome,pk:m.pk,stage:P.stage,window:P.window}},seal,prefetch));
    }

    if(a === 'military'){
      requirePhase(C,['result']);
      try { S.militaryAction(C,body.action); } catch(e){ bad(e.message); }
      return (withStay(C, {token:seal(C), ...view(C)},seal,prefetch));
    }

    if(a === 'next'){
      requirePhase(C,['result']);
      const pick = body.pick == null || body.pick === '' ? null : Number(body.pick);
      if(pick != null && !(Number.isInteger(pick) && C.offers[pick])) bad('제안을 다시 골라 주세요.');
      // 특성 제안이 있으면 반드시 하나를 고른다(강제 은퇴로 끝나는 시즌은 제외)
      const tp = body.trait == null || body.trait === '' ? null : Number(body.trait);
      if(C.traitOffer && C.traitOffer.length && !C.forced && !(Number.isInteger(tp) && C.traitOffer[tp])) bad('특성을 하나 골라 주세요.');
      const mv=S.militaryView(C);
      if(pick!=null && mv && (mv.selected || mv.service || mv.lastChance)) bad('병역 계획을 먼저 결정해 주세요.');
      S.nextSeason(C, pick, tp);
      delete C.forced; delete C.forcedWhy;
      return ({token: seal(C), ...view(C)});
    }

    if(a === 'retire'){
      requirePhase(C,['result','retired']);
      if(C.phase === 'result' && C.age < 29 && !C.forced) bad('29세부터 은퇴할 수 있어요.');
      S.retire(C);
      return ({token: seal(C), ...view(C)});
    }


 if(a==='view')return withStay(C,{token:seal(C),...view(C)},seal,prefetch);
 bad('진행 요청이 올바르지 않아요.');
}
