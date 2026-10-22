import * as D from './detmath.js';
import {shootoutFor,penaltyKey} from './shootout.js';
// 기존 시즌의 대표팀 합계·수상을 경기별 일정으로 풀어낸다. 별도 시드라 성장/수상 난수를 바꾸지 않는다.
const EURO=['ENG','ESP','GER','ITA','FRA','POR','NED','BEL','NOR','CRO','SUI','DEN','SWE','AUT','POL','TUR'];
const POOLS={europe:EURO,america:['BRA','ARG','URU','COL','CHI','ECU','PER','VEN','BOL','USA','MEX','CAN','CRC','JAM','PAN','HAI'],asia:['KOR','JPN','AUS','IRN','KSA','QAT','IRQ','UZB','CHN','UAE','OMN','JOR','BHR','THA','IND','SYR'],africa:['NGA','SEN','MAR','EGY','GHA','CMR','CIV','TUN','ALG','RSA','ANG','COD','MLI','BFA','ZAM','KEN'],gold:['USA','MEX','CAN','CRC','JAM','PAN','SLV','HON','GUA','HAI','TTO','CUW','SUR','MTQ','CUB','DOM']};
const ALL=[...new Set(Object.values(POOLS).flat())].filter(n=>n!=='MTQ');
const REGULAR_WINDOWS=[['9월',.12],['10월',.23],['11월',.34],['3월',.72]];
const SENIOR_CUPS={ENG:'유로',ESP:'유로',GER:'유로',ITA:'유로',FRA:'유로',POR:'유로',NED:'유로',BEL:'유로',NOR:'유로',BRA:'코파 아메리카',ARG:'코파 아메리카',KOR:'아시안컵',JPN:'아시안컵',USA:'골드컵',NGA:'아프리카 네이션스컵'};
export function seniorNationalCalendar(nation,year){
 if(!SENIOR_CUPS[nation]||!Number.isInteger(year)||year<2027)return null;
 const cup=year%4===2?'월드컵':year%4===0?SENIOR_CUPS[nation]:null;
 const windows=REGULAR_WINDOWS.map(([month,at],i)=>({id:'senior-'+i,name:'A매치',year:i<3?year-1:year,month,at}));
 if(cup)windows.push({id:'senior-cup',name:cup,year,month:'6월',at:1,knockout:true});
 return {nation,year,cup,windows};
}
function random(seed,key){let h=seed>>>0;for(const c of key)h=Math.imul(h^c.charCodeAt(0),16777619);return ()=>{h+=0x6D2B79F5;let t=Math.imul(h^(h>>>15),h|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
export function nationalOpponentPool(cup){const teams=/유로|네이션스리그/.test(cup)?EURO:/코파/.test(cup)?POOLS.america:/아시안게임/.test(cup)?POOLS.asia.filter(n=>n!=='AUS'):/아시안/.test(cup)?POOLS.asia:/아프리카/.test(cup)?POOLS.africa:/골드/.test(cup)?POOLS.gold:/올림픽/.test(cup)?ALL.filter(n=>n!=='CUW'):ALL;return teams.slice();}
// 게임용 대표팀 전력. 모든 대회에서 강팀 우세를 반영하되 이변도 허용한다.
export const NATIONAL_POWER={ARG:94,FRA:94,ESP:93,BRA:92,ENG:91,POR:89,GER:88,NED:87,ITA:85,URU:84,CRO:83,BEL:82,COL:82,SUI:80,DEN:79,MAR:79,JPN:78,USA:77,MEX:77,KOR:76,AUT:76,SEN:76,ECU:75,NOR:75,TUR:75,AUS:74,IRN:74,NGA:74,SWE:74,POL:74,ALG:73,EGY:73,CIV:73,CAN:72,TUN:71,CMR:71,GHA:70,MLI:70,UZB:69,CRC:69,VEN:69,RSA:69,PER:68,CHI:68,KSA:67,QAT:66,IRQ:66,COD:66,JAM:65,PAN:65,JOR:64,BFA:64,ANG:63,ZAM:63,BOL:62,CHN:61,UAE:61,OMN:60,HON:60,GUA:58,THA:58,BHR:58,SLV:57,HAI:57,SYR:56,TTO:55,KEN:55,CUW:54,SUR:53,IND:52,MTQ:51,CUB:50,DOM:49};
export function nationalWinChance(a,b){return 1/(1+D.pow(10,((NATIONAL_POWER[b]||60)-(NATIONAL_POWER[a]||60))/25));}
// 선택 가능한 15개 국가는 같은 그룹 안에서 동일한 기대 성적·반응 기준을 쓴다.
export const NATIONAL_REACTION_GROUPS={
 title:{label:'우승 후보',nations:['ARG','BRA','FRA','ESP','ENG','GER','POR'],expected:{'월드컵':'4강','유로':'결승','코파 아메리카':'결승','올림픽':'결승'}},
 strong:{label:'강호',nations:['NED','ITA','BEL'],expected:{'월드컵':'8강','유로':'4강','올림픽':'4강'}},
 challenger:{label:'도전자',nations:['KOR','JPN','USA','NGA','NOR'],expected:{'월드컵':'16강','유로':'16강','아시안컵':'결승','골드컵':'결승','아프리카 네이션스컵':'4강','올림픽':'4강','아시안게임':'우승'}}
};
export function nationalReactionGroup(nation){return Object.keys(NATIONAL_REACTION_GROUPS).find(k=>NATIONAL_REACTION_GROUPS[k].nations.includes(nation))||null;}
export function nationalExpectation(nation,cup,age=false){
 const group=NATIONAL_REACTION_GROUPS[nationalReactionGroup(nation)];
 if(group&&group.expected[cup])return group.expected[cup];
 return age?'4강':cup==='월드컵'?'32강':'8강';
}
function weightedDraw(list,R){const weights=list.map(n=>D.exp(((NATIONAL_POWER[n]||60)-65)/12)),total=weights.reduce((a,b)=>a+b,0);let x=R()*total;for(let i=0;i<list.length;i++){x-=weights[i];if(x<=0)return list.splice(i,1)[0];}return list.pop();}
export function nationalSchedule({seed,nation,year,caps,goals,ast,cs,cup,cupApps,won,international,penalties=false,decisions={}}){
 const R=random(seed,'national-playback|'+year),windows=[];
 let cupStages=null,cupCount=0;
 if(cup&&cupApps){
  const wc=cup==='월드컵',stages=['조별리그 1차전','조별리그 2차전','조별리그 3차전',...(wc&&year>=2030?['32강']:[]),'16강','8강','4강','결승'];
  cupCount=3;
  if(won)cupCount=stages.length;
  else{
   const p=NATIONAL_POWER[nation]||60,groupFail=Math.max(.06,Math.min(.45,(95-p)/100));
   if(R()>=groupFail){cupCount=4;for(let i=3;i<stages.length-1;i++){const opposition=wc?[74,80,86,91][i-3]:[70,79,88][i-3];const chance=1/(1+D.pow(10,(opposition-p)/25));if(R()>=chance)break;cupCount++;}}
  }
  cupStages=stages.slice(0,cupCount);cupApps=Math.min(cupApps,cupCount);
 }
 // 조기 탈락으로 대회 출전이 줄면 나머지는 일반 A매치에 배분해 기존 시즌 합계를 유지한다.
 const regular=Math.max(0,caps-(cupApps||0)),months=REGULAR_WINDOWS;
 let left=regular;
 months.forEach(([month,at],i)=>{const apps=Math.ceil(left/(4-i));left-=apps;if(apps)windows.push({id:'senior-'+i,kind:'senior',name:'A매치',month,at,nation,apps,stages:Array.from({length:apps},(_,k)=>'A매치 '+(k+1)),outcome:'대표팀 일정 종료'});});
 if(cupStages){const stage=cupStages.at(-1),outcome=won?'우승':cupCount===3?'조별리그 탈락':stage==='결승'?'준우승':stage+' 탈락';windows.push({id:'senior-cup',kind:'senior',name:cup,month:'6월',at:1,nation,apps:cupApps,stages:cupStages,outcome,won,knockout:true});}
 if(international){
  const T=international,stages=['조별리그 1차전','조별리그 2차전','조별리그 3차전','8강','4강',T.place<=2?'결승':'동메달 결정전'];
  const count=T.place<=4?6:4;
  windows.push({id:'age-cup',kind:'age',name:T.name,month:T.kind==='asian'?'9월':'7월',at:T.kind==='asian'?.16:1,nation,apps:Math.min(5,count),stages:stages.slice(0,count),outcome:T.place+'위'+(T.medal?' · '+T.award.n:''),won:T.place===1,medal:T.medal,qualified:T.qualified,place:T.place,knockout:true});
 }
 // A대표 기록은 각 기간에 분배하며 시즌 합계와 정확히 일치한다. 연령별 대표 기록과는 분리한다.
 const senior=windows.filter(w=>w.kind==='senior');
 for(const w of windows){
  const opponents=nationalOpponentPool(w.name).filter(n=>n!==nation),order=Array.from({length:w.stages.length},(_,i)=>i); // 경기 순서는 고정
  const plays=order.slice().map(i=>[R(),i]).sort((a,b)=>a[0]-b[0]).slice(0,w.apps).map(x=>x[1]);
  w.matches=w.stages.map((stage,i)=>{const opp=opponents[Math.floor(R()*opponents.length)];let win=R()<nationalWinChance(nation,opp);if(w.knockout&&i>=3)win=i===w.stages.length-1?!/탈락|준우승/.test(w.outcome)&&!(w.place===2||w.place===4):!(w.place===3&&i===4);const their=win?Math.floor(R()*2):1+Math.floor(R()*3),our=win?their+1+Math.floor(R()*2):Math.max(0,their-1);return {stage,opp,played:plays.includes(i),our,their,g:0,a:0,cs:0};});
 }
 const played=senior.flatMap(w=>w.matches).filter(m=>m.played);
 for(const [key,n] of [['g',goals],['a',ast]])for(let i=0;i<(n||0)&&played.length;i++){const m=played[Math.floor(R()*played.length)];m[key]++;m.our=Math.max(m.our,m.g,m.a);}
 const lossMatch=(w,m)=>w.knockout&&((w.matches.at(-1)===m&&(/탈락|준우승/.test(w.outcome)||(w.place&&w.place!==1&&w.place!==3)))||((w.place===3||w.place===4)&&w.matches[4]===m));
 const clean=played.filter(m=>!senior.some(w=>lossMatch(w,m))).map(m=>[R(),m]).sort((a,b)=>a[0]-b[0]).slice(0,cs||0);
 for(const [,m] of clean){m.cs=1;m.their=0;}
 for(const w of windows)for(const m of w.matches){
  m.our=Math.max(m.our,m.g+m.a);
  if(lossMatch(w,m)&&m.our>=m.their)m.their=m.our+1;
  else if(w.knockout&&!lossMatch(w,m)&&m.stage!=='조별리그 3차전'&&w.matches.indexOf(m)>=3&&m.our<=m.their)m.our=m.their+1;
 }
 for(const w of windows)if(w.knockout){w.reactionGroup=nationalReactionGroup(nation);w.expectation=nationalExpectation(nation,w.name,w.kind==='age');w.bracket=bracketFor(w,seed,year,penalties,decisions);}
 windows.sort((a,b)=>a.at-b.at||(a.id<b.id?-1:a.id>b.id?1:0));
 return windows;
}

function bracketFor(w,seed,year,penalties=false,decisions={}){
 const stages=w.kind==='age'?['8강','4강','결승']:w.name==='월드컵'&&year>=2030?['32강','16강','8강','4강','결승']:['16강','8강','4강','결승'];
 const path=w.matches.filter(m=>stages.includes(m.stage));if(!path.length)return null;
 const R=random(seed,'bracket|'+year+'|'+w.name),size=D.pow(2,stages.length),available=nationalOpponentPool(w.name).filter(n=>n!==w.nation);
 // 본선 참가국과 상대 대진도 전력에 따라 뽑고 실제 이전 라운드 승자를 이어 붙인다.
 const candidates=available.slice(),draw=[];
 if(w.name==='월드컵'){const top=candidates.slice().sort((a,b)=>(NATIONAL_POWER[b]||60)-(NATIONAL_POWER[a]||60)).slice(0,15);for(const n of top){draw.push(n);candidates.splice(candidates.indexOf(n),1);}}
 while(draw.length<size-1)draw.push(weightedDraw(candidates,R));
 for(let i=draw.length-1;i>0;i--){const j=Math.floor(R()*(i+1));[draw[i],draw[j]]=[draw[j],draw[i]];}
 let teams=[w.nation,...draw];const rounds=[],actual=[],group=w.matches.filter(m=>m.stage.startsWith('조별'));let unresolved=false,semiLost=false;
 stages.forEach((stage,r)=>{
  const matches=[],winners=[];
  for(let j=0;j<teams.length;j+=2){
   const a=teams[j],b=teams[j+1],ours=a===w.nation||b===w.nation,known=ours?path.find(m=>m.stage===stage):null;
   let winner=R()<nationalWinChance(a,b)?a:b;
   let sa=winner===a?1+Math.floor(R()*3):Math.floor(R()*2),sb=winner===b?sa+1:Math.max(0,sa-1);
   if(known){known.opp=a===w.nation?b:a;sa=a===w.nation?known.our:known.their;sb=a===w.nation?known.their:known.our;winner=sa>sb?a:b;}
   let pk=null;
   if(ours&&penalties&&(!known||known.played)){const key=penaltyKey(year,w,stage);pk=shootoutFor(seed,key,unresolved?null:decisions[key]);if(pk){const tied=Math.max((known?.g||0)+(known?.a||0),Math.min(sa,sb));sa=sb=tied;if(pk.pending){unresolved=true;pk.key=key;}else winner=pk.won?w.nation:(a===w.nation?b:a);}}
   if(ours&&penalties){const m={...(known||{played:true,g:0,a:0,cs:0}),stage,opp:a===w.nation?b:a,our:a===w.nation?sa:sb,their:a===w.nation?sb:sa};if(pk){m.pk=pk;if(m.their)m.cs=0;}actual.push(m);if(stage==='4강'&&winner!==w.nation)semiLost=true;}
   matches.push({a,b,sa,sb,winner,ours:penalties?ours:!!known,...(pk?{pk}:{} )});winners.push(winner);
  }
  rounds.push({stage,matches});teams=winners;
 });
 if(penalties){
  w.matches=[...group,...actual];w.won=teams[0]===w.nation;
  const last=actual.at(-1);
  if(w.kind==='age'&&semiLost){const losers=rounds.at(-2).matches.map(m=>m.winner===m.a?m.b:m.a),opp=losers.find(n=>n!==w.nation),BR=random(seed,'bronze|'+year+'|'+w.name),win=w.place===3?true:w.place===4?false:BR()<nationalWinChance(w.nation,opp);let m={stage:'동메달 결정전',opp,played:true,our:win?2:1,their:win?1:2,g:0,a:0,cs:0};const key=penaltyKey(year,w,m.stage),pk=shootoutFor(seed,key,unresolved?null:decisions[key]);if(pk){m.our=m.their=1;m.pk=pk;if(pk.pending){pk.key=key;unresolved=true;}else m.won=pk.won;}w.matches.push(m);w.place=(m.pk&&!m.pk.pending?m.pk.won:win)?3:4;}
  else if(w.kind==='age')w.place=w.won?1:last?.stage==='결승'?2:5;
  if(w.kind==='age'){w.medal=w.place<=3;w.qualified=false;w.outcome=w.place+'위'+(w.medal?' · '+w.name+' '+({1:'금메달',2:'은메달',3:'동메달'}[w.place]):'');}
  else w.outcome=w.won?'우승':last?.stage==='결승'?'준우승':last.stage+' 탈락';
  w.apps=w.matches.filter(m=>m.played).length;w.pending=unresolved;
 }
 const bronze=w.matches.find(m=>m.stage==='동메달 결정전');
 if(bronze){const losers=rounds.at(-2).matches.map(m=>m.winner===m.a?m.b:m.a);bronze.opp=losers.find(n=>n!==w.nation);}
 return {rounds,winner:teams[0],...(bronze?{bronze}:{} )};
}
