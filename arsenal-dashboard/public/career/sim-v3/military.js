import {eventSeed} from './seeds.js';
// 연령별 국제대회와 대한민국 남자 커리어의 병역. 기존 성장 이벤트와 별도 난수열을 사용한다.
import {CLUBS} from '../sim-v1/data.js';
import {nationalOpponentPool} from './international.js';
export const SANGMU = '김천 상무';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const year=C=>2027+C.age-15;
// 나라별 A대표 발탁 기준 — sim.js의 NAT_BAR와 같은 값(sim.js가 이 파일을 불러서 거꾸로 import하면 순환이 된다).
// 와일드카드(24세 이상)는 이 기준으로 본다: 고정 72였을 땐 한국 A대표 주전급(OVR 72)도 차출 12%였다(사용자 지정 2026-10).
const NAT_BAR={ENG:80,ESP:80,FRA:80,BRA:80,GER:80,ARG:80,ITA:77,POR:77,NED:76,BEL:76,NOR:71,USA:70,JPN:70,KOR:67,NGA:68};
const roll=(C,key)=>{let h=eventSeed(C)>>>0;for(const c of key)h=Math.imul(h^c.charCodeAt(0),16777619);h=(h+0x6D2B79F5)|0;let t=Math.imul(h^(h>>>15),h|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
const publicClub=c=>c?{n:c.n,id:c.id,nat:c.nat}:null;
const active=M=>M && ['sangmu','regular'].includes(M.status);
export function ensureMilitary(C){
  if(C.nation!=='KOR') return null;
  if(!C.military) C.military={status:C.age>=28?'legacy':'pending'};
  return C.military;
}
export function serviceView(C){
  const M=ensureMilitary(C);if(!active(M))return null;
  return {kind:M.status,months:Math.min(12,M.left),left:M.left,returning:M.left<=12,home:publicClub(M.home),fullRegular:M.status==='regular'&&M.left>=12};
}
export function militaryView(C){
  const M=ensureMilitary(C);if(!M)return null;
  const canApply=M.status==='pending'&&!M.choice&&C.age>=19&&C.age<=27&&M.appliedAge!==C.age&&(C.lv??3)===3;
  const labels={pending:'병역 미이행',arts:'체육요원',sangmu:'상무 복무 중',regular:'일반 복무 중',completed:'병역 이행 완료',legacy:'기존 커리어 · 병역 적용 제외'};
  return {status:M.status,label:labels[M.status],canApply,chance:canApply?Math.round(sangmuProbability(C)*100):null,canRegular:M.status==='pending'&&!M.choice&&C.age>=19,deadline:27,lastChance:M.status==='pending'&&C.age===27,
    selected:M.choice||null,left:M.left||0,home:publicClub(M.home),applied:M.appliedAge===C.age,outcome:M.appliedAge===C.age?M.outcome:null,
    returnNotice:M.returnAge===C.age?M.returnNotice:null,service:serviceView(C)};
}
export function tournamentView(C){
  if(C.age<18||(C.lv??3)<3||active(ensureMilitary(C)))return null;
  const y=year(C),kind=y%4===2?'asian':y%4===0?'olympic':null;if(!kind)return null;
  if(!nationalOpponentPool(kind==='asian'?'아시안게임':'올림픽').includes(C.nation))return null;
  const o=Math.round(C.ovr),wild=C.age>23,bar=NAT_BAR[C.nation]||75;
  if(o<(wild?bar:59))return null;
  const last=C.hist.at(-1),form=last&&last.apps>=10?clamp((last.rating-6.8)*.12,-.1,.1):0;
  const p=wild?clamp(.45+(o-bar)*.04+form,.15,.85):clamp(.30+(o-65)*.035+form,.05,.95);
  if(roll(C,'call|'+y+'|'+kind)>=p)return null;
  return {kind,year:y,name:kind==='asian'?'아시안게임':'올림픽',wild,callProbability:Math.round(p*100),medalRange:kind==='asian'?'금메달 50~70%':'메달 8~15%'};
}
export function resolveTournament(C,T,rating,actualPlace){
  if(!T)return null;
  const strength=clamp((C.ovr-60)/35+(rating-7)*.15,0,1),p=T.kind==='asian'?.50+.20*strength:.08+.07*strength;
  const qualifyingFinish=roll(C,'medal|'+T.year+'|'+T.kind)<p;
  const place=actualPlace??(T.kind==='asian'?(qualifyingFinish?1:2+Math.floor(roll(C,'place|'+T.year)*5)):(qualifyingFinish?1+Math.floor(roll(C,'place|'+T.year)*3):4+Math.floor(roll(C,'place|'+T.year)*5)));
  const medal=place<=3;
  const award=medal?{n:T.name+' '+({1:'금메달',2:'은메달',3:'동메달'}[place]),tier:place===1?'A':'B',kind:'nat'}:null;
  const M=ensureMilitary(C),qualified=!!M&&(T.kind==='asian'?place===1:place<=3)&&M.status==='pending';
  if(qualified){M.status='arts';M.at=T.year;M.award=award.n;delete M.choice;}
  return {...T,place,medal,probability:Math.round(p*100),qualified,award};
}
export function sangmuProbability(C){
  const r=C.hist.at(-1),o=Math.round(C.ovr);let p=o<60?.20:o<65?.35:o<70?.50:o<76?.70:.90;
  if(r){p+=r.apps>=25?.04:r.apps<10?-.12:0;p+=r.rating>=7.2?.03:r.rating&&r.rating<6.5?-.06:0;}
  p+=(roll(C,'position-demand|'+year(C)+'|'+C.pos)-.5)*.06;
  return clamp(p,.15,.95);
}
export function applyMilitary(C,action){
  const M=ensureMilitary(C),V=militaryView(C);
  if(C.phase!=='result'||!M)throw Error('시즌 종료 후 병역 계획을 선택해 주세요.');
  if(action==='apply'){
    if(!V.canApply)throw Error('현재 상무 지원 대상이 아니거나 이번 모집에 이미 지원했어요.');
    M.appliedAge=C.age;M.outcome=roll(C,'sangmu-selection|'+year(C))<sangmuProbability(C)?'accepted':'rejected';
    if(M.outcome==='accepted')M.choice='sangmu';
  }else if(action==='regular'){
    if(!V.canRegular)throw Error('현재 일반 복무를 신청할 수 없어요.');
    M.choice='regular';
  }else throw Error('병역 선택지를 다시 골라 주세요.');
  if(M.choice){C.offers=[];C.released=false;}
  return militaryView(C);
}
export function beginService(C){
  const M=ensureMilitary(C);if(!M||M.status!=='pending'||(!M.choice&&C.age<28))return false;
  M.home={...C.club};M.homeNum=C.num;M.homeEnd=C.cEnd;M.status=M.choice||'regular';M.left=18;M.startAge=C.age;delete M.choice;
  if(M.status==='sangmu'){const c=CLUBS.KOR.find(c=>c[0]===SANGMU);C.club={n:c[0],r:c[1],id:c[2],nat:'KOR'};if(!C.clubs.includes(SANGMU))C.clubs.push(SANGMU);}
  C.loanClub=null;delete C.loanClubs;C.lv=3;C.contract=null;C.released=false;return true;
}
// 남은 일반 복무를 먼저 마친 뒤 같은 시즌의 복귀 이벤트/훈련을 진행한다.
export function completeRegularReturn(C){
 const M=ensureMilitary(C);if(C.phase!=='prep')throw Error('복귀 시즌 준비 단계에서만 진행할 수 있어요.');
 if(C.returnService&&M?.status==='completed')return C.returnService;
 const service=serviceView(C);if(!service||service.kind!=='regular'||service.fullRegular)throw Error('남은 일반 복무 기간이 없어요.');
 C.returnService={...service};C.club={...M.home};C.num=M.homeNum??C.num;C.cEnd=M.homeEnd||C.age+1;
 M.left=0;M.status='completed';M.returnAge=C.age;M.returnNotice={from:'일반 복무',club:C.club.n,id:C.club.id,homeNum:C.num};
 return C.returnService;
}
export function finishServiceSeason(C,row){
  const M=ensureMilitary(C);if(!active(M)){if(C.returnService){row.service={kind:'regular',months:C.returnService.months,remaining:0,home:C.returnService.home.n};row.notes.push('병역 이행 완료! '+C.club.n+'에 복귀해 남은 시즌을 뛰었어요.');delete C.returnService;}return;}
  const kind=M.status,months=Math.min(12,M.left);row.service={kind,months,remaining:Math.max(0,M.left-months),home:M.home.n};
  M.left-=months;
  if(M.left<=0){
    const from=kind==='sangmu'?SANGMU:'일반 복무';C.club={...M.home};C.num=M.homeNum??C.num;C.cEnd=M.homeEnd||C.age+1;M.status='completed';
    M.returnAge=C.age;M.returnNotice={from,club:C.club.n,id:C.club.id,homeNum:C.num};
    row.notes.push('병역 이행 완료! '+C.club.n+'에 복귀해 남은 시즌을 뛰었어요.');
  }else row.notes.push((kind==='sangmu'?'상무':'일반')+' 복무 중 · 전역까지 '+M.left+'개월');
}
