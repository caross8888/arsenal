// 로컬 저장에는 원래 입력·시드·실제 선택만 기록한다. 서버는 이 기록을 재생한다.
import * as S from './sim.js';
import {Bad, cleanInput, view, step} from './flow.js';
export const VERSION=2;
export const PREFIX='career-local-v2:';
const MAX_ACTIONS=80, MAX_BYTES=24000;
const fail=m=>{throw new Bad(m);};
export const lookId=seed=>'youth|'+seed.toString(16);
export const isLocal=token=>typeof token==='string'&&token.startsWith(PREFIX);
export const atBoundary=C=>C.age===18&&C.phase==='result'&&!!C.scout18;
const index=(v,n)=>Number.isInteger(v)&&v>=0&&v<n;
const optional=v=>v==null||v==='';
export function validateNext(C,b){
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
  if(C.phase!=='result'||atBoundary(C))fail('18세 평가 이후에는 서버에서 계속해야 해요.');
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
   if(a!=='join'||!index(b.pick,S.firstClubs(record.input.nation,record.input.pos,record.input.card,record.seed).length))fail('첫 구단 선택이 올바르지 않아요.');
   C=S.createCareer(record.input,b.pick,record.seed);C.lookId=lookId(record.seed);
  }else{
   if(C.age>18||atBoundary(C)||C.phase==='retired')fail('유스 기록의 진행 범위를 벗어났어요.');
   validateAction(C,a,b);step(C,a,b,{prefetch:false});
  }
 }
 if(requireBoundary&&!atBoundary(C))fail('18세 평가를 마친 뒤 계속할 수 있어요.');
 return C;
}
export function replay(raw){return play(recordOf(raw),true);}
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
