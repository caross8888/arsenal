// 대기만성: 시드로 약 18%, 18·21세 평가에 유형 표시, 24세 알림, 기존 커리어(플래그 없음)는 표준.
import assert from 'node:assert/strict';
import * as S from '../arsenal-dashboard/api/_career_sim.js';
let late=0, scoutLate=0, scoutStd=0, notes=0;
for(let t=0;t<1500;t++){
  const pos=['FW','MF','DF'][t%3];
  const C=S.createCareer({name:'a',nation:'ENG',foot:'오른발',pos,card:0,num:9},t%3,(t*2654435761)>>>0);
  if(C.late) late++;
  for(let g=0;g<12&&C.age<27;g++){
    let r=S.playSeason(C,{train:'균형',evPick:0});
    if(r.injury) r=S.playSeason(C,{injPick:1});
    if(r.row?.scout){ if(r.row.scout.late){assert(C.late,'only late bloomers are flagged');scoutLate++;} else {assert(!C.late);scoutStd++;} }
    if(r.row?.notes?.some(n=>n.includes('늦게 피는 재능'))){assert(C.late&&C.age===24);notes++;}
    if(r.forced||(C.released&&!r.offers.length)) break;
    S.nextSeason(C,C.released?0:null);
    if(C.phase==='retired') break;
  }
}
assert(late>1500*0.14&&late<1500*0.22,'about 18% late bloomers: '+late);
assert(scoutLate>0&&scoutStd>0&&notes>0);
console.log(`PASS late bloomer: ${late}/1500 careers, scouting hints ${scoutLate}, age-24 notes ${notes}`);
