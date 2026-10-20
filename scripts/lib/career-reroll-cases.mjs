// Node와 실제 브라우저에서 동일한 입력·선택 묶음을 실행한다.
import * as S from '../../arsenal-dashboard/public/career/sim-v1/sim.js';
import {localCall,decode,replay,lookId} from '../../arsenal-dashboard/public/career/sim-v1/local.js';
import {step,view} from '../../arsenal-dashboard/public/career/sim-v1/flow.js';
const copy=v=>JSON.parse(JSON.stringify(v));
export function makeCase(i){
 const seed=Math.imul(i+1,2654435761)>>>0,rng=S.mulberry(seed^123),pos=['FW','MF','DF'][i%3];
 const input={name:'로컬테스트',nation:S.NATIONS[i%S.NATIONS.length].id,foot:i%2?'왼발':'오른발',body:S.BODIES[i%S.BODIES.length],pos,card:i%S.CARDS[pos].length,num:1+i%99,dream:i%3?null:'아스날'};
 let v=localCall('new',input,seed),pick=Math.floor(rng()*v.clubs.length),C=S.createCareer(input,pick,seed),tags=[];
 C.lookId=lookId(seed);v=localCall('join',{token:v.token,pick});view(C);
 for(let n=0;n<80;n++){
  if(v.phase==='result'&&v.player.age===18){
   const record=decode(v.token),expected=replay(record);
   if(JSON.stringify(copy(C))!==JSON.stringify(copy(expected)))throw Error('incremental/replay mismatch '+i);
   return {record,state:copy(C),visible:copy(view(C)),tags};
  }
  let a,b={};
  if(v.phase==='prep'){
   tags.push(v.prep.event.id);if(v.player.club.nat!==input.nation)tags.push('abroad');
   if(v.prep.event.id==='scout'&&!C.scoutMove&&rng()<.5){a='scout';tags.push('scout-action');}
   else {a='season';b={train:v.prep.trainOpts[Math.floor(rng()*v.prep.trainOpts.length)],evPick:Math.floor(rng()*2),loanPick:Math.floor(rng()*Math.max(1,v.prep.loanClubs?.length||0))};}
  }else if(v.phase==='injury'){a='season';b={injPick:i%2};tags.push('injury'+b.injPick);}
  else if(v.phase==='penalty'){a='penalty';b={key:v.shootout.key,x:rng(),y:rng(),power:rng()*100};tags.push('penalty');}
  else if(v.phase==='result'){
   a='next';b={pick:v.result.released?0:v.result.offers.length&&rng()<.5?Math.floor(rng()*v.result.offers.length):null,trait:v.result.traitOffer.length?Math.floor(rng()*v.result.traitOffer.length):null};
   if(v.result.released)tags.push('released');
  }else throw Error('unexpected phase '+v.phase);
  step(C,a,b,{prefetch:false});v=localCall(a,{token:v.token,...b});
 }
 throw Error('youth did not finish '+i);
}
export function runCases(count,start=0){return Array.from({length:count},(_,k)=>makeCase(start+k));}
