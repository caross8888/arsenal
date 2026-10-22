import * as D from './detmath.js';
import {eventSeed} from './seeds.js';
// All amounts are gross basic salary. Versioned, fixed game FX (local units / EUR).
// No live FX, shared simulation RNG, signing bonuses or transfer fees in earnings.
import {CLUBS} from '../sim-v1/data.js';
import {WAGE_PROFILES,CLUB_WAGE_INDEX,DEFAULT_WAGE_INDEX,WAGE_CURVE,ROLE_CURVE,MLS_CURVE,interpolateCurve,softenSalary,salaryFloor} from './wages.js';
const CLUB = new Map(Object.entries(CLUBS).flatMap(([nat,cs])=>cs.map(c=>[c[0],{n:c[0],r:c[1],nat}])));
export const FX = Object.freeze({EUR:1,GBP:.85,KRW:1500,JPY:160,USD:1.12});
// Familiar currencies keep their own; every other league is shown in USD.
const EURO=new Set(['ESP','GER','ITA','FRA','POR','NED','BEL']);
export const currencyOf = nat => nat==='ENG'?'GBP':nat==='KOR'?'KRW':nat==='JPN'?'JPY':!nat||EURO.has(nat)?'EUR':'USD';
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const findClub=c=>typeof c==='string'?CLUB.get(c):c;
export function contractLength(age,seed=0){
 let h=2166136261;for(const x of 'ct'+age){h^=x.charCodeAt(0);h=Math.imul(h,16777619);}
 let a=(seed^h)|0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;
 return (age<=27?5:age<=31?4:age<=34?3:2)+(((t^t>>>14)>>>0)/4294967296<.5?1:0);
}
function form(rows,pos){
 const recent=rows.filter(r=>!r.youth&&!r.service?.fullRegular&&r.apps>0).slice(-2);
 if(!recent.length)return 1;
 let sum=0,weight=0;
 recent.forEach((r,i)=>{const w=i===recent.length-1?2:1,apps=Math.max(1,r.apps),games=Math.max(apps,r.games||38);
  const output=pos==='DF'?(r.cs||0)/apps+(r.ast||0)/apps*.5:pos==='MF'?((r.goals||0)+(r.ast||0)*1.3)/apps:((r.goals||0)+(r.ast||0)*.7)/apps;
  // Position-specific output; rating is an extra signal only when archived.
  const target=pos==='DF'?.32:pos==='MF'?.4:.55;
  const f=clamp(1+(output-target)*.25+(r.rating?clamp(r.rating-6.8,-1,1)*.1:0)+(apps/games-.6)*.12,.8,1.2);
  sum+=f*w;weight+=w;
 });return sum/weight;
}
export function moneyView(annualEUR,club,previousEUR=null){
 const currency=currencyOf(findClub(club)?.nat),annual=Math.round(annualEUR*FX[currency]);
 return {v:1,currency,annualEUR,annual,weekly:annual/52,previousAnnual:previousEUR==null?null:Math.round(previousEUR*FX[currency]),change:previousEUR>0?Math.round((annualEUR/previousEUR-1)*1000)/10:null};
}
// Set the negotiated amount in the league's display currency, then derive
// EUR earnings from that amount. Existing signed contracts are never rounded again.
export function roundSalary(annualEUR,club,{minimumEUR=0,maximumEUR=Infinity}={}){
 const currency=currencyOf(findClub(club)?.nat),fx=FX[currency];
 const weekly=currency!=='KRW'&&currency!=='JPY',period=weekly?52:1;
 const amount=annualEUR*fx/period;
 const step=weekly?(amount<10000?100:500):currency==='KRW'?1000000:100000;
 const floor=Math.ceil(minimumEUR*fx/period/step)*step;
 const ceiling=Math.floor(maximumEUR*fx/period/step)*step;
 return clamp(Math.round(amount/step)*step,floor,ceiling)*period/fx;
}
export function quoteSalary(state,club=state.club,age=state.age,{first=false,until,previous=state.salary?.annualEUR??null}={}){
 club=findClub(club)||{n:String(club),nat:'ENG',r:65};
 const [anchor,base,,max]=WAGE_PROFILES[club.nat]||WAGE_PROFILES.ENG;
 const min=salaryFloor(club.nat,age),budget=CLUB_WAGE_INDEX[club.n]??DEFAULT_WAGE_INDEX[club.nat]??1;
 const ovr=Number.isFinite(state.ovr)?state.ovr:60;
 const ageFactor=age<21?.82:age>=35?.8:age>=32?.9:1;
 const firstFactor=first?interpolateCurve([[-45,.65],[-5,.75],[0,.9],[5,1],[70,1]],ovr-anchor):1;
 // Only the already revealed scouting grade affects young-player negotiations;
 // never expose hidden talent through an offer price.
 const potential=age<=23?({S:1.12,A:1.08,B:1.04}[state.scout18]||1):1;
 const ability=club.nat==='USA'?interpolateCurve(MLS_CURVE,ovr):base*interpolateCurve(WAGE_CURVE,ovr-anchor);
 // Sporting reputation describes the competition for a role only. The distinct
 // wage index describes the employer's spending; the two are not interchangeable.
 const role=base*interpolateCurve(ROLE_CURVE,ovr-((club.r||anchor+3)-3));
 const raw=Math.max(ability,role)*budget*form(state.hist||[],state.pos)*ageFactor*firstFactor*potential;
 // Local-currency rounding also respects the salary floor and J1 first-contract cap.
 const annualEUR=roundSalary(softenSalary(raw,max),club,{minimumEUR:min,maximumEUR:first&&club.nat==='JPN'?12000000/FX.JPY:max});
 return {...moneyView(annualEUR,club,previous),club:club.n,from:age,until:until??age+(first?4:contractLength(age,eventSeed(state))),type:first?'pro':'renew'};
}
// Reconstruct missing salaries chronologically, carrying the signed amount until
// the inferred expiry or a permanent move. Loans never create a new contract.
export function ensureFinance(state){
 if(state.financeVersion===1)return;
 let salary=null,history=[];
 for(const row of state.hist||[]){
  if(row.finance){if(row.finance.contract)salary=row.finance.contract;history.push(row);continue;}
  const club=findClub(row.loan?(salary?.club||state.club):row.club);
  if(!row.youth&&row.team!=='일반 복무'&&club){
   if(!salary||(!row.loan&&salary.club!==club.n)||row.age>=salary.until)salary=quoteSalary({...state,hist:history,ovr:row.ovrBefore??row.ovr,salary},club,row.age,{first:!salary});
   row.finance=seasonFinance(row,salary);
  }
  history.push(row);
 }
 state.salary=state.salary||(salary?{...salary,until:state.cEnd||salary.until}:null);state.financeVersion=1;
}
function seasonFinance(row,salary){
 // Club wages pause during military service. A return season contains six
 // civilian months. Military allowances are outside this basic club salary model.
 const months=row.service?clamp(12-row.service.months,0,12):row.team==='일반 복무'||row.club==='김천 상무'?0:12;
 return {contract:{...salary},months,earnedEUR:salary.annualEUR*months/12};
}
export function signSalary(state){
 ensureFinance(state);
 if(state.contract){const first=state.contract.type==='pro';state.salary={...quoteSalary(state,state.club,state.age,{first,until:state.cEnd}),type:state.contract.type};state.contract.finance=state.salary;}
 return state.salary;
}
export function financeState(state){
 if(state.financeVersion===1)return state;
 const copy=structuredClone(state);ensureFinance(copy);return copy;
}
export function contractView(state){
 if(!state.contract)return null;
 const c=state.contract;
 return {...c,finance:c.finance||quoteSalary(financeState(state),state.club,state.age,{first:c.type==='pro',until:state.cEnd})};
}
export function recordSalary(state,row){
 ensureFinance(state);
 if(row.finance||row.youth)return;
 if(!state.salary&&row.team!=='일반 복무')state.salary=quoteSalary(state,state.club,row.age,{first:true});
 if(state.salary)row.finance=seasonFinance(row,state.salary);
}
export function financeSummary(rows=[],pos='FW'){
 // Old leaderboard cards flatten return-season segments: one earnings year per age.
 const grouped=new Map();for(const original of rows){const row=structuredClone(original),old=grouped.get(row.age);if(!old)grouped.set(row.age,row);else if(old.loan&&!row.loan){if(old.club==='김천 상무')row.service={kind:'sangmu',months:6};grouped.set(row.age,row);}else if(row.club==='김천 상무')old.service={kind:'sangmu',months:6};}
 const state={pos,hist:[...grouped.values()].sort((a,b)=>a.age-b.age)};
 ensureFinance(state);let peak=null,total=0;
 for(const r of state.hist){const c=r.finance?.contract;if(c&&(!peak||c.annualEUR>peak.annualEUR))peak=c;total+=r.finance?.earnedEUR||0;}
 // The peak keeps its signed currency so rounded contract amounts are shown as agreed.
 // Lifetime income mixes currencies and stays in EUR.
 const best=peak&&{currency:peak.currency,annual:peak.annual,weekly:peak.weekly,annualEUR:peak.annualEUR};
 return {v:3,currency:'EUR',peak:best,peakWeekly:(peak?.annualEUR||0)/52,totalAnnualIncome:total};
}
export function marketQuote(state,club,age=state.age+1){
 club=findClub(club)||state.club;const o=state.ovr;
 const af=age<=23?1.15:age<=28?1:({29:.8,30:.6,31:.45,32:.32,33:.22}[age]||.12);
 const valueEUR=Math.round(2.2*D.exp((o-60)/7.5)*af*1000000*form(state.hist||[],state.pos)/1000)*1000;
 const remaining=Math.max(0,(state.cEnd||age)-age);
 const buyer=clamp(1+(club.r-(state.club?.r||club.r))*.006,.9,1.12);
 const feeEUR=remaining===0?0:Math.round(valueEUR*clamp(.65+remaining*.15,.8,1.3)*buyer/1000)*1000;
 const currency=currencyOf(club.nat);
 return {currency,value:Math.round(valueEUR*FX[currency]),fee:Math.round(feeEUR*FX[currency]),free:remaining===0};
}
