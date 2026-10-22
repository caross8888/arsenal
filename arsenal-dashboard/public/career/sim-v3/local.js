// 로컬 저장에는 원래 입력·시드·실제 선택만 기록한다. 서버는 이 기록을 재생한다.
import * as S from './sim.js';
import {Bad, cleanInput, view, step} from './flow.js';
export const VERSION=3;
export const PREFIX='career-local-v3:';
const MAX_ACTIONS=80, MAX_BYTES=24000;
const fail=m=>{throw new Bad(m);};
export const lookId=seed=>'youth|'+seed.toString(16);
export const isLocal=token=>typeof token==='string'&&token.startsWith(PREFIX);
export const atBoundary=C=>C.age===18&&C.phase==='result'&&!!C.scout18;
const index=(v,n)=>Number.isInteger(v)&&v>=0&&v<n;
const optional=v=>v==null||v==='';
export function validateNext(C,b){
 only(b,['pick','trait']);
 if(!b||typeof b!=='object'||Array.isArray(b))fail('다음 시즌 선택이 필요해요.');
 if(!optional(b.pick)&&!index(b.pick,C.offers?.length||0))fail('제안을 다시 골라 주세요.');
 if(!optional(b.trait)&&!index(b.trait,C.traitOffer?.length||0))fail('특성을 다시 골라 주세요.');
 if(C.traitOffer?.length&&!C.forced&&!index(b.trait,C.traitOffer.length))fail('특성을 하나 골라 주세요.');
}
function validateAction(C,a,b){
 if(!b||typeof b!=='object'||Array.isArray(b))fail('유스 선택 기록이 올바르지 않아요.');
 if(a==='season'){
  if(C.phase==='prep'){
   const p=S.prepView(C);
   if(!p.trainOpts.includes(b.train)||![0,1].includes(b.evPick))fail('훈련과 이벤트 선택을 확인해 주세요.');
   if(p.event.id==='loan'&&b.evPick===0&&!index(b.loanPick??0,p.loanClubs?.length||0))fail('임대 구단을 확인해 주세요.');
  }else if(C.phase!=='injury'||![0,1].includes(b.injPick))fail('부상 선택 순서를 확인해 주세요.');
 }else if(a==='next'){
  if(C.phase!=='result'||(C.age<=18&&atBoundary(C)))fail('18세 평가 이후에는 서버에서 계속해야 해요.');
  validateNext(C,b);
 }else if(a==='scout'){
  if(C.phase!=='prep'||C.ev!=='scout'||C.scoutMove)fail('현재 스카우트 제안이 없어요.');
 }else if(a==='penalty'){
  if(C.phase!=='penalty')fail('승부차기 순서가 맞지 않아요.');
 }else fail('허용되지 않은 유스 선택이에요.');
}
function recordOf(raw){
 if(!raw||raw.version!==VERSION||!Number.isInteger(raw.seed)||raw.seed<0||raw.seed>0xffffffff||!Array.isArray(raw.choices)||raw.choices.length>MAX_ACTIONS)fail('유스 기록 형식이 올바르지 않아요.');
 if(JSON.stringify(raw).length>MAX_BYTES)fail('유스 기록이 너무 길어요.');
 return {version:VERSION,seed:raw.seed,input:cleanInput(raw.input||{}),choices:raw.choices};
}
function play(record,requireBoundary){
 let C={v:1,seed:record.seed,phase:'pick',input:record.input};
 for(const entry of record.choices){
  if(!entry||typeof entry!=='object')fail('유스 선택 기록이 올바르지 않아요.');
  const {a,...b}=entry;
  if(C.phase==='pick'){
   only(b,['pick']);
   if(a!=='join'||!index(b.pick,S.firstClubs(record.input.nation,record.input.pos,record.input.card,record.seed).length))fail('첫 구단 선택이 올바르지 않아요.');
   C=S.createCareer(record.input,b.pick,record.seed);C.lookId=lookId(record.seed);
  }else{
   if(C.age>18||atBoundary(C)||C.phase==='retired')fail('유스 기록의 진행 범위를 벗어났어요.');
   if(!Object.hasOwn(FIELDS,a))fail('허용되지 않은 유스 선택이에요.');only(b,FIELDS[a]);
   validateAction(C,a,b);step(C,a,b,{prefetch:false,reply:false});
  }
 }
 if(requireBoundary&&!atBoundary(C))fail('18세 평가를 마친 뒤 계속할 수 있어요.');
 return C;
}
export function replay(raw){return play(recordOf(raw),true);}
export function canonicalYouth(raw,C){const record=recordOf(raw);C??=play(record,true);only(raw.next,['pick','trait']);validateNext(C,raw.next);return {...record,next:{pick:optional(raw.next.pick)?null:raw.next.pick,trait:optional(raw.next.trait)?null:raw.next.trait}};}
export function decode(token){
 if(!isLocal(token)||token.length>MAX_BYTES+PREFIX.length)fail('로컬 커리어 기록이 올바르지 않아요.');
 try{return recordOf(JSON.parse(token.slice(PREFIX.length)));}catch(e){if(e instanceof Bad)throw e;fail('저장된 유스 기록을 읽을 수 없어요.');}
}
const encode=r=>PREFIX+JSON.stringify(r);
export function commitBody(token,next){const record=decode(token),C=play(record,true);validateNext(C,next);return {...record,next};}
export function localCall(a,body={},seed){
 if(a==='new'){
  const input=cleanInput(body),r={version:VERSION,seed,input,choices:[]};recordOf(r);
  return {token:encode(r),...view({phase:'pick',seed,input})};
 }
 const r=decode(body.token),C=play(r,false);
 if(a==='view')return {token:body.token,...view(C)};
 const b={};
 // 입력값만 보관한다(토큰·상태·클라이언트 seed2는 재생하지 않는다).
 for(const k of ['pick','trait','train','evPick','loanPick','injPick','key','x','y','power'])if(body[k]!==undefined)b[k]=body[k];
 if(a==='join'){
  if(C.phase!=='pick'||!index(b.pick,S.firstClubs(r.input.nation,r.input.pos,r.input.card,r.seed).length))fail('첫 구단 선택이 올바르지 않아요.');
  const next=S.createCareer(r.input,b.pick,r.seed);next.lookId=lookId(r.seed);r.choices.push({a,...b});return {token:encode(r),...view(next)};
 }
 validateAction(C,a,b);r.choices.push({a,...b});
 return step(C,a,b,{seal:()=>encode(r),prefetch:false});
}

// 성인 기록은 확정 토큰을 시작점으로 재생한다. 진행 상태·카드는 입력으로 받지 않는다.
// 최대 32시즌 × 시즌당 64행동을 넘는 기록은 재생 전에 거부한다.
export const MAX_ADULT_ACTIONS=32*64,MAX_ADULT_BYTES=120000;
const FIELDS={season:['train','evPick','loanPick','injPick'],next:['pick','trait'],scout:[],penalty:['key','x','y','power'],military:['action'],'service-return':[],retire:[]};
function only(b,keys){if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!keys.includes(k)))fail('허용되지 않은 선택 입력이에요.');}
export function validateAdultAction(C,a,b){
 if(!Object.hasOwn(FIELDS,a))fail('허용되지 않은 성인 선택이에요.');only(b,FIELDS[a]);
 if(C.phase==='retired')fail('은퇴 뒤에는 선택을 추가할 수 없어요.');
 if(a==='military'){
  const m=S.militaryView(C);
  if(C.phase!=='result'||!(b.action==='apply'?m?.canApply:b.action==='regular'&&m?.canRegular))fail('병역 선택 순서를 확인해 주세요.');
 }else if(a==='service-return'){
  const m=S.militaryView(C);if(C.phase!=='prep'||!m?.service||m.service.kind!=='regular'||m.service.fullRegular)fail('복무 복귀 단계가 아니에요.');
 }else if(a==='retire'){
  if(C.phase!=='result'||(!C.forced&&C.age<29))fail('아직 은퇴할 수 없어요.');
 }else if(a==='penalty'){
  if(C.phase!=='penalty'||typeof b.key!=='string'||b.key.length>160||!Number.isFinite(b.x)||b.x<0||b.x>1||!Number.isFinite(b.y)||b.y<0||b.y>1||!Number.isFinite(b.power)||b.power<0||b.power>100)fail('승부차기 입력을 확인해 주세요.');
 }else if(a==='next'){
  if(C.phase!=='result')fail('시즌 종료 후 계속할 수 있어요.');validateNext(C,b);
 }else{
  if(a==='season'){
   only(b,C.phase==='injury'?['injPick']:['train','evPick','loanPick']);
   if(b.loanPick!==undefined&&(!Number.isInteger(b.loanPick)||b.loanPick<0))fail('임대 구단을 확인해 주세요.');
  }
  validateAction(C,a,b);
 }
}
export function replayAdult(root,choices,{requireRetired=true}={}){
 if(root?.simVersion!==VERSION||root.localAdult!==VERSION||root.phase!=='prep'||root.age!==19||!Number.isInteger(root.seed2)||typeof root.id!=='string')fail('성인 확정 토큰이 올바르지 않아요.');
 if(!Array.isArray(choices)||choices.length>MAX_ADULT_ACTIONS||JSON.stringify(choices).length>MAX_ADULT_BYTES)fail('성인 선택 기록이 너무 길거나 올바르지 않아요.');
 const C=JSON.parse(JSON.stringify(root));
 for(const entry of choices){
  if(!entry||typeof entry!=='object'||Array.isArray(entry)||typeof entry.a!=='string')fail('성인 선택 기록이 올바르지 않아요.');
  const {a,...b}=entry;validateAdultAction(C,a,b);step(C,a,b,{prefetch:false,reply:false});
 }
 if(requireRetired&&C.phase!=='retired')fail('은퇴한 커리어만 등록할 수 있어요.');return C;
}
