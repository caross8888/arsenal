import assert from 'node:assert/strict';
import {quoteSalary,FX} from '../arsenal-dashboard/api/_career_finance.js';
import {ALL,clubByName} from '../arsenal-dashboard/api/_career_sim.js';
import {WAGE_PROFILES} from '../arsenal-dashboard/api/_career_wages.js';
const quote=(name,ovr,age=26,extra={},options={})=>quoteSalary({ovr,age,pos:'FW',hist:[],...extra},clubByName(name),age,options);
const close=(value,target,tolerance)=>assert(Math.abs(value/target-1)<=tolerance,`${value} is outside ${(tolerance*100)}% of reference ${target}`);
// These are pay-scale anchors, NOT assignments of game OVR to real players.
// Capology estimated gross fixed weekly salaries: Arsenal core ~260–300k;
// Manchester City's exceptional top earner ~525k. See calibration source list.
close(quote('아스날',90).weekly,280000,.1);
close(quote('맨체스터 시티',99).weekly,525000,.03);
assert(quote('아스날',95).weekly>quote('아스날',90).weekly);
assert(quote('아스날',99).weekly>quote('아스날',95).weekly);
// K League base-pay anchors are domestic base averages, not bonus-inclusive totals.
close(quote('울산 HD',60).annual,477339000,.01);
close(quote('대전 하나 시티즌',54).annual,396607000,.01);
assert(quote('대전 하나 시티즌',60).annual>quote('전북 현대',60).annual,'spending must not follow the sporting reputation order');
// MLS 2026 official $25m basic salary / ECB audit USD 1.1195 per EUR.
close(quote('인터 마이애미',99).annualEUR,25000000/1.1195,.03);
// J1 2026 adult floor and first-pro base ceiling (under-19 floor exception).
for(const age of [19,26,35])for(const ovr of [30,40,50])assert(quote('비셀 고베',ovr,age).annual>=4800000);
for(const ovr of [40,60,80,99]){const p=quote('비셀 고베',ovr,19,{}, {first:true});assert(p.annual>=4800000&&p.annual<=12000000);}
const usa=ALL.find(c=>c.nat==='USA');
for(const age of [19,26,35]){
 const q=quoteSalary({ovr:30,age,pos:'DF',hist:[]},usa,age);
 assert(q.annualEUR*1.1195>=(age<=25?88025:113400));
}
// All playable employers, not only handpicked flagship clubs: ordinary pay is
// monotonic and in range, while top-end OVR must retain useful differentiation.
let quotes=0;
for(const club of ALL.filter(c=>c.n!=='김천 상무')){
 let previous=0;
 for(let ovr=30;ovr<=99;ovr++){
  const q=quoteSalary({ovr,age:26,pos:'MF',hist:[]},club,26);
  assert(Number.isFinite(q.annualEUR)&&q.annualEUR>0);
  assert(q.annualEUR>=previous,'higher OVR reduced salary: '+club.n);previous=q.annualEUR;
  assert(q.annualEUR<=WAGE_PROFILES[club.nat][3]+100);
  assert.equal(q.annual,Math.round(q.annualEUR*FX[q.currency]));quotes++;
 }
 const p=ovr=>quoteSalary({ovr,age:26,pos:'FW',hist:[]},club,26).annualEUR;
 assert(p(99)>p(95)&&p(95)>p(90),'top OVRs collapsed: '+club.n);
}
// First-contract pay transitions smoothly through the league anchor.
const a=quote('아스날',74.99,19,{}, {first:true}),b=quote('아스날',75.01,19,{}, {first:true});
assert(b.annualEUR/a.annualEUR<1.01);
console.log('PASS calibrated pay scale:',quotes,'quotes across',ALL.length-1,'clubs; actual-source anchors, J1/MLS floors, independent spending, smooth first contracts and distinct elite salaries');
