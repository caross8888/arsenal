// Node와 브라우저가 같은 시드·입력·행동 기록을 사용한다.
import {makeCase} from './career-reroll-cases.mjs';
import * as L3 from '../../arsenal-dashboard/public/career/sim-v3/local.js';
import * as S3 from '../../arsenal-dashboard/public/career/sim-v3/sim.js';
import * as F3 from '../../arsenal-dashboard/public/career/sim-v3/flow.js';
export const copy=v=>JSON.parse(JSON.stringify(v));
export function youthCase(i){const record=makeCase(i,2).record;record.version=3;const C=L3.replay(record);return {...record,next:{pick:null,trait:C.traitOffer?.length?0:null}};}
export function makeAdultCase(i,root){
 const record=root?null:youthCase(i),C=root?copy(root):L3.replay(record);
 if(!root){C.seed2=Math.imul(i+11,2246822519)>>>0;C.id='test-'+i;C.localAdult=3;F3.step(C,'next',record.next,{prefetch:false,reply:false});}
 const initial=copy(C),choices=[],rng=S3.mulberry((C.seed^12345)>>>0),tags=new Set();
 for(let n=0;n<L3.MAX_ADULT_ACTIONS&&C.phase!=='retired';n++){
  const v=F3.view(C);let a,b={};
  if(v.phase==='prep'){
   const m=v.prep.military;
   if(m?.service?.kind==='regular'&&!m.service.fullRegular){a='service-return';tags.add('service-return');}
   else if(v.prep.event.id==='scout'&&!C.scoutMove&&rng()<.5){a='scout';tags.add('scout');}
   else{a='season';b={train:v.prep.trainOpts[Math.floor(rng()*v.prep.trainOpts.length)],evPick:rng()<.5?0:1,loanPick:Math.floor(rng()*Math.max(1,v.prep.loanClubs?.length||0))};tags.add(v.prep.event.id);}
  }else if(v.phase==='injury'){a='season';b={injPick:rng()<.5?0:1};tags.add('injury');}
  else if(v.phase==='penalty'){a='penalty';b={key:v.shootout.key,x:rng(),y:rng(),power:rng()*100};tags.add('penalty');}
  else if(v.phase==='result'){
   const m=v.player.military;
   if(m?.canRegular&&(m.lastChance||C.age===20&&i%2===0)){a='military';b={action:'regular'};tags.add('regular');}
   else if(m?.canApply&&C.age===21&&i%2===1){a='military';b={action:'apply'};tags.add('apply');}
   else if(C.age>=33&&!C.forced&&rng()<.15){a='retire';tags.add('retire');}
   else{a='next';b={pick:!m?.selected&&!m?.service&&!m?.lastChance&&!C.forced&&C.offers?.length&&(C.released||rng()<.4)?Math.floor(rng()*C.offers.length):null,trait:C.traitOffer?.length&&!C.forced?Math.floor(rng()*C.traitOffer.length):null};}
  }else throw Error('알 수 없는 단계 '+C.phase);
  L3.validateAdultAction(C,a,b);choices.push({a,...b});F3.step(C,a,b,{prefetch:false});
 }
 if(C.phase!=='retired')throw Error('커리어가 끝나지 않았어요: '+i);
 return {record,root:initial,choices,state:copy(C),tags:[...tags]};
}
