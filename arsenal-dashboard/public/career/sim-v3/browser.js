// v3 저장·화면 실행기. 봉인된 확정 상태와 실제 행동만 보관하고 진행 상태는 재생한다.
// 서버가 쓰는 local.js·flow.js 계산 규칙과 기존 v1/v2 파일은 바꾸지 않는다.
import * as Y from './local.js';
import {Bad,view,step} from './flow.js';
import {stateDigest} from './digest.js';
export const PREFIX=Y.PREFIX,VERSION=3;
const copy=v=>JSON.parse(JSON.stringify(v)),fail=m=>{throw new Bad(m);};
const MAX_BYTES=Y.MAX_ADULT_BYTES;
let cachedToken=null,cachedState=null;
function raw(token){
 if(typeof token!=='string'||!token.startsWith(PREFIX)||token.length>MAX_BYTES+PREFIX.length)fail('저장된 로컬 커리어를 읽을 수 없어요.');
 let r;try{r=JSON.parse(token.slice(PREFIX.length));}catch(_){fail('저장된 로컬 커리어를 읽을 수 없어요.');}
 if(!r||r.version!==VERSION||typeof r!=='object'||Array.isArray(r))fail('저장된 커리어 버전이 올바르지 않아요.');return r;
}
export function isAdult(token){return raw(token).stage==='adult';}
function adultRecord(token){
 const r=raw(token);
 if(r.stage!=='adult'||typeof r.token!=='string'||!r.token||!Number.isInteger(r.seed2)||r.seed2!==r.state?.seed2||r.state?.simVersion!==VERSION||!Array.isArray(r.choices)||r.choices.length>Y.MAX_ADULT_ACTIONS)fail('저장된 성인 커리어 형식이 올바르지 않아요.');
 if(new TextEncoder().encode(token.slice(PREFIX.length)).length>MAX_BYTES)fail('성인 선택 기록이 너무 길어요.');return r;
}
function encode(r){const data=JSON.stringify(r);if(new TextEncoder().encode(data).length>MAX_BYTES)fail('성인 선택 기록이 너무 길어요.');return PREFIX+data;}
function current(r,token){return token===cachedToken?copy(cachedState):Y.replayAdult(r.state,r.choices,{requireRetired:false});}
function remember(token,C){cachedToken=token;cachedState=copy(C);}
function youthReply(v){const r=raw(v.token);r.stage='youth';return {...v,token:PREFIX+JSON.stringify(r)};}
export const commitBody=Y.commitBody;
export function fromCommit(out){
 const r={version:VERSION,stage:'adult',token:out.token,seed2:out.seed2,state:copy(out.state),choices:[]};
 const token=encode(r),checked=adultRecord(token),C=Y.replayAdult(checked.state,[],{requireRetired:false});
 const v={token,...view(C)};remember(token,C);return v;
}
export function localCall(a,body={},seed){
 if(a==='new'||!isAdult(body.token))return youthReply(Y.localCall(a,body,seed));
 const r=adultRecord(body.token),C=current(r,body.token);
 if(a==='view'){const out={token:body.token,...view(C)};remember(body.token,C);return out;}
 const {token:ignored,...input}=body;
 Y.validateAdultAction(C,a,input);
 if(r.choices.length>=Y.MAX_ADULT_ACTIONS)fail('성인 선택 기록이 너무 길어요.');
 r.choices.push({a,...input});const token=encode(r);
 const out=step(C,a,input,{seal:()=>token,prefetch:false});remember(token,C);return out;
}
export async function submitBody(token){
 const r=adultRecord(token),C=current(r,token);
 if(C.phase!=='retired')fail('은퇴한 커리어만 등록할 수 있어요.');
 return {token:r.token,choices:r.choices,claim:{score:C.score,digest:await stateDigest(C)}};
}
