// 기존 시즌의 대표팀 합계·수상을 경기별 일정으로 풀어낸다. 별도 시드라 성장/수상 난수를 바꾸지 않는다.
const EURO=['ENG','ESP','GER','ITA','FRA','POR','NED','BEL','NOR','CRO','SUI','DEN','SWE','AUT','POL','TUR'];
const POOLS={europe:EURO,america:['BRA','ARG','URU','COL','CHI','ECU','PER','VEN','BOL','USA','MEX','CAN','CRC','JAM','PAN','HAI'],asia:['KOR','JPN','AUS','IRN','KSA','QAT','IRQ','UZB','CHN','UAE','OMN','JOR','BHR','THA','IND','SYR'],africa:['NGA','SEN','MAR','EGY','GHA','CMR','CIV','TUN','ALG','RSA','ANG','COD','MLI','BFA','ZAM','KEN'],gold:['USA','MEX','CAN','CRC','JAM','PAN','SLV','HON','GUA','HAI','TTO','CUW','SUR','MTQ','CUB','DOM']};
const ALL=[...new Set(Object.values(POOLS).flat())].filter(n=>n!=='MTQ');
function random(seed,key){let h=seed>>>0;for(const c of key)h=Math.imul(h^c.charCodeAt(0),16777619);return ()=>{h+=0x6D2B79F5;let t=Math.imul(h^(h>>>15),h|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
function pool(cup){return /유로/.test(cup)?EURO:/코파/.test(cup)?POOLS.america:/아시안/.test(cup)?POOLS.asia:/아프리카/.test(cup)?POOLS.africa:/골드/.test(cup)?POOLS.gold:/올림픽/.test(cup)?ALL.filter(n=>n!=='CUW'):ALL;}
export function nationalSchedule({seed,nation,year,caps,goals,ast,cs,cup,cupApps,won,international}){
 const R=random(seed,'national-playback|'+year),windows=[];
 const regular=Math.max(0,caps-(cupApps||0)),months=[['9월',.12],['10월',.23],['11월',.34],['3월',.72]];
 let left=regular;
 months.forEach(([month,at],i)=>{const apps=Math.ceil(left/(4-i));left-=apps;if(apps)windows.push({id:'senior-'+i,kind:'senior',name:'A매치',month,at,nation,apps,stages:Array.from({length:apps},(_,k)=>'A매치 '+(k+1)),outcome:'대표팀 일정 종료'});});
 if(cup&&cupApps){
  const wc=cup==='월드컵',stages=['조별리그 1차전','조별리그 2차전','조별리그 3차전',...(wc&&year>=2030?['32강']:[]),'16강','8강','4강','결승'];
  // 선수 출전 수와 팀의 진출 라운드는 별개: 우승팀도 선수는 일부 경기에 결장할 수 있다.
  const count=won?stages.length:Math.min(stages.length,Math.max(3,cupApps+(R()<.3?1:0)));
  const stage=stages[count-1],outcome=won?'우승':count===3?'조별리그 탈락':stage==='결승'?'준우승':stage+' 탈락';
  windows.push({id:'senior-cup',kind:'senior',name:cup,month:'6월',at:1,nation,apps:cupApps,stages:stages.slice(0,count),outcome,won,knockout:true});
 }
 if(international){
  const T=international,stages=['조별리그 1차전','조별리그 2차전','조별리그 3차전','8강','4강',T.place<=2?'결승':'동메달 결정전'];
  const count=T.place<=4?6:4;
  windows.push({id:'age-cup',kind:'age',name:T.name,month:T.kind==='asian'?'9월':'7월',at:T.kind==='asian'?.16:1,nation,apps:Math.min(5,count),stages:stages.slice(0,count),outcome:T.place+'위'+(T.medal?' · '+T.award.n:''),won:T.place===1,medal:T.medal,qualified:T.qualified,place:T.place,knockout:true});
 }
 // A대표 기록은 각 기간에 분배하며 시즌 합계와 정확히 일치한다. 연령별 대표 기록과는 분리한다.
 const senior=windows.filter(w=>w.kind==='senior');
 for(const w of windows){
  const opponents=pool(w.name).filter(n=>n!==nation),order=Array.from({length:w.stages.length},(_,i)=>i); // 경기 순서는 고정
  const plays=order.slice().map(i=>[R(),i]).sort((a,b)=>a[0]-b[0]).slice(0,w.apps).map(x=>x[1]);
  w.matches=w.stages.map((stage,i)=>{let win=R()<.55;if(w.knockout&&i>=3)win=i===w.stages.length-1?!/탈락|준우승/.test(w.outcome)&&!(w.place===2||w.place===4):!(w.place===3&&i===4);const their=win?Math.floor(R()*2):1+Math.floor(R()*3),our=win?their+1+Math.floor(R()*2):Math.max(0,their-1);return {stage,opp:opponents[Math.floor(R()*opponents.length)],played:plays.includes(i),our,their,g:0,a:0,cs:0};});
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
 for(const w of windows)if(w.knockout)w.bracket=bracketFor(w,seed,year);
 windows.sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
 return windows;
}

function bracketFor(w,seed,year){
 const stages=w.kind==='age'?['8강','4강','결승']:w.name==='월드컵'&&year>=2030?['32강','16강','8강','4강','결승']:['16강','8강','4강','결승'];
 const path=w.matches.filter(m=>stages.includes(m.stage));if(!path.length)return null;
 const R=random(seed,'bracket|'+year+'|'+w.name),size=2**stages.length,available=pool(w.name).filter(n=>n!==w.nation);
 const used=new Set([w.nation]);
 for(const m of path){if(used.has(m.opp))m.opp=available.find(n=>!used.has(n));used.add(m.opp);}
 const bronze=w.matches.find(m=>m.stage==='동메달 결정전');
 if(bronze){if(used.has(bronze.opp))bronze.opp=available.find(n=>!used.has(n));used.add(bronze.opp);}
 const seeds=Array(size).fill(null),target={};seeds[0]=w.nation;
 path.forEach(m=>{const r=stages.indexOf(m.stage);seeds[2**r]=m.opp;target[m.opp]=r;});
 if(bronze){seeds[2**(stages.length-1)]=bronze.opp;target[bronze.opp]=stages.length-2;}
 const spare=available.filter(n=>!used.has(n)).map(n=>[R(),n]).sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
 seeds.forEach((n,i)=>{if(!n)seeds[i]=spare.shift();});
 let teams=seeds;const rounds=[];
 stages.forEach((stage,r)=>{
  const matches=[],winners=[];
  for(let j=0;j<teams.length;j+=2){
   const a=teams[j],b=teams[j+1],ours=a===w.nation||b===w.nation,known=ours?path.find(m=>m.stage===stage):null;
   let winner=R()<.5?a:b;
   if(target[a]>r)winner=a;if(target[b]>r)winner=b;
   if(bronze&&r===stages.length-2&&(a===bronze.opp||b===bronze.opp))winner=a===bronze.opp?b:a;
   let sa=winner===a?1+Math.floor(R()*3):Math.floor(R()*2),sb=winner===b?sa+1:Math.max(0,sa-1);
   if(known){sa=a===w.nation?known.our:known.their;sb=a===w.nation?known.their:known.our;winner=sa>sb?a:b;}
   matches.push({a,b,sa,sb,winner,ours:!!known});winners.push(winner);
  }
  rounds.push({stage,matches});teams=winners;
 });
 return {rounds,winner:teams[0],...(w.matches.some(m=>m.stage==='동메달 결정전')?{bronze:w.matches.find(m=>m.stage==='동메달 결정전')}:{} )};
}
