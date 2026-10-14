/* 대표팀 경기 압축 중계. 확정된 경기 기록을 재생하며 승패를 새로 계산하지 않는다. */
(function(root){
'use strict';
const W=768,H=512,P={l:76,r:691,t:72,b:402},ASSET=root.CareerMatchAssetRoot||'/img/career-match/';
// BEGIN GENERATED NATIONAL KITS — scripts/collect_national_kits.py --render
const NATIONAL_KITS={"ARG":{"home":{"body":"#9dc9e9"},"away":{"body":"#343746"}},"FRA":{"home":{"body":"#153265"},"away":{"body":"#c9e7e2"}},"ESP":{"home":{"body":"#ef3439"},"away":{"body":"#e2e4d9"}},"BRA":{"home":{"body":"#e6d35a"},"away":{"body":"#182c45"}},"ENG":{"home":{"body":"#e9eef1"},"away":{"body":"#df0129"}},"POR":{"home":{"body":"#a93435"},"away":{"body":"#c4e2dc"}},"GER":{"home":{"body":"#eeeef3"},"away":{"body":"#213651"}},"NED":{"home":{"body":"#f96343"},"away":{"body":"#e7e8ea"}},"ITA":{"home":{"body":"#167ae5"},"away":{"body":"#e1e4ed"}},"URU":{"home":{"body":"#c8daef"},"away":{"body":"#192437"}},"CRO":{"home":{"body":"#e55356"},"away":{"body":"#0459a0"}},"BEL":{"home":{"body":"#d10e2d"},"away":{"body":"#bce6f9"}},"COL":{"home":{"body":"#f6dd57"},"away":{"body":"#06a5c2"}},"SUI":{"home":{"body":"#e41430"},"away":{"body":"#b9f2bb"}},"DEN":{"home":{"body":"#bc0c28"},"away":{"body":"#ccc9d0"}},"MAR":{"home":{"body":"#bf1536"},"away":{"body":"#f2e0c6"}},"JPN":{"home":{"body":"#233478"},"away":{"body":"#eeede9"}},"USA":{"home":{"body":"#f1efed"},"away":{"body":"#181d2e"}},"MEX":{"home":{"body":"#075c51"},"away":{"body":"#eae8ee"}},"KOR":{"home":{"body":"#f31840"},"away":{"body":"#cbbce4"}},"AUT":{"home":{"body":"#e82728"},"away":{"body":"#dceae9"}},"SEN":{"home":{"body":"#f3e8ed"},"away":{"body":"#037059"}},"ECU":{"home":{"body":"#ebb301"},"away":{"body":"#161429"}},"NOR":{"home":{"body":"#eb1929"},"away":{"body":"#141414"}},"TUR":{"home":{"body":"#e7e5ea"},"away":{"body":"#a52230"}},"AUS":{"home":{"body":"#fec744"},"away":{"body":"#026b80"}},"IRN":{"home":{"body":"#dedee0"},"away":{"body":"#d30c16"}},"NGA":{"home":{"body":"#26c060"},"away":{"body":"#ecebf0"}},"SWE":{"home":{"body":"#f7dc4d"},"away":{"body":"#0354b4"}},"POL":{"home":{"body":"#eae8ed"},"away":{"body":"#cb2440"}},"ALG":{"home":{"body":"#e2dbcf"},"away":{"body":"#089a8a"}},"EGY":{"home":{"body":"#c7343a"},"away":{"body":"#e8e7ec"}},"CIV":{"home":{"body":"#fd6513"},"away":{"body":"#eeecee"}},"CAN":{"home":{"body":"#bf0118"},"away":{"body":"#242424"}},"TUN":{"home":{"body":"#f1f1f1"},"away":{"body":"#e9001c"}},"CMR":{"home":{"body":"#274e3c"},"away":{"body":"#6a695d"}},"GHA":{"home":{"body":"#e8e9ea"},"away":{"body":"#f9d070"}},"MLI":{"home":{"body":"#93948a"},"away":{"body":"#c2b326"}},"UZB":{"home":{"body":"#204ab1"},"away":{"body":"#d2d2d2"}},"CRC":{"home":{"body":"#a81530"},"away":{"body":"#e0e8f2"}},"VEN":{"home":{"body":"#952946"},"away":{"body":"#e8e6e1"}},"RSA":{"home":{"body":"#f3d95b"},"away":{"body":"#126f5d"}},"PER":{"home":{"body":"#ac2d3a"},"away":{"body":"#18191d"}},"CHI":{"home":{"body":"#e41d2e"},"away":{"body":"#ebe2d8"}},"KSA":{"home":{"body":"#1e545d"},"away":{"body":"#eaedf6"}},"QAT":{"home":{"body":"#8e2a35"},"away":{"body":"#efeef5"}},"IRQ":{"home":{"body":"#f0f0f0"},"away":{"body":"#156949"}},"COD":{"home":{"body":"#70b2e4"},"away":{"body":"#f2f3f4"}},"JAM":{"home":{"body":"#f8c74b"},"away":{"body":"#404448"}},"PAN":{"home":{"body":"#ef3338"},"away":{"body":"#183e5f"}},"JOR":{"home":{"body":"#e4e6f1"},"away":{"body":"#d52a30"}},"BFA":{"home":{"body":"#006851"},"away":{"body":"#ebecec"}},"ANG":{"home":{"body":"#ea373c"},"away":{"body":"#2c2a2d"}},"ZAM":{"home":{"body":"#1c5e3a"},"away":{"body":"#de994e"}},"BOL":{"home":{"body":"#024a49"},"away":{"body":"#e6dce5"}},"CHN":{"home":{"body":"#f74f41"},"away":{"body":"#fbd742"}},"UAE":{"home":{"body":"#efeff1"},"away":{"body":"#d21f45"}},"OMN":{"home":{"body":"#c60f10"},"away":{"body":"#d9d9d9"}},"HON":{"home":{"body":"#034d9d"},"away":{"body":"#5ac9e2"}},"GUA":{"home":{"body":"#38a5d4"},"away":{"body":"#dedee8"}},"THA":{"home":{"body":"#263fd6"},"away":{"body":"#d4363c"}},"BHR":{"home":{"body":"#ba0110"},"away":{"body":"#e4e4e5"}},"SLV":{"home":{"body":"#155dc0"},"away":{"body":"#cddeee"}},"HAI":{"home":{"body":"#0164d8"},"away":{"body":"#eef7fc"}},"SYR":{"home":{"body":"#215142"},"away":{"body":"#dddde8"}},"TTO":{"home":{"body":"#c42d40"},"away":{"body":"#e6cfce"}},"KEN":{"home":{"body":"#b92828"},"away":{"body":"#dbdbdb"}},"CUW":{"home":{"body":"#2a41ac"},"away":{"body":"#f0e0a5"}},"SUR":{"home":{"body":"#ededf8"},"away":{"body":"#207d56"}},"IND":{"home":{"body":"#0155a6"},"away":{"body":"#f28546"}},"MTQ":{"home":{"body":"#181b16"},"away":{"body":"#a7100b"}},"CUB":{"home":{"body":"#9f1919"},"away":{"body":"#223a4e"}},"DOM":{"home":{"body":"#252e2a"},"away":{"body":"#fceafc"}}};
// END GENERATED NATIONAL KITS
const hexRGB=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
function kitPalette(kit){return [kit.body];}
function colourLab(hex){
 const [r,g,b]=hexRGB(hex).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
 const f=v=>v>.008856?Math.cbrt(v):7.787*v+16/116;
 const x=f((r*.4124+g*.3576+b*.1805)/.95047),y=f(r*.2126+g*.7152+b*.0722),z=f((r*.0193+g*.1192+b*.9505)/1.08883);
 return [116*y-16,500*(x-y),200*(y-z)];
}
function kitColoursClash(a,b){
 return kitPalette(a).some(c=>kitPalette(b).some(d=>{
  const x=colourLab(c),y=colourLab(d),difference=Math.hypot(...x.map((v,i)=>v-y[i]));
  const hue=v=>Math.atan2(v[2],v[1]),gap=Math.abs(Math.atan2(Math.sin(hue(x)-hue(y)),Math.cos(hue(x)-hue(y))));
  return difference<35||(Math.hypot(x[1],x[2])>12&&Math.hypot(y[1],y[2])>12&&gap<.6&&Math.abs(x[0]-y[0])<35);
 }));
}
function selectMatchKits(ours,theirs){
 const record=code=>NATIONAL_KITS[code]||{home:{body:'#e8c04a'},away:{body:'#f0eff3'}};
 const a=record(ours),b=record(theirs),tag=(kit,nation,type)=>({...kit,nation,type});
 if(!kitColoursClash(a.home,b.home))return [tag(a.home,ours,'home'),tag(b.home,theirs,'home')];
 if(!kitColoursClash(a.home,b.away))return [tag(a.home,ours,'home'),tag(b.away,theirs,'away')];
 // Keep only one team in an alternate kit if the visiting away colours clash as well.
 if(!kitColoursClash(a.away,b.home))return [tag(a.away,ours,'away'),tag(b.home,theirs,'home')];
 return [tag(a.home,ours,'home'),tag(b.away,theirs,'away')];
}
const PATTERNS=['combine','wing','counter','cutback','through','longshot','switch','lowcross','corner','dribble','chip','freekick','shortcorner','halfspace','farcut','rebound'];
let assetsPromise=null,assets=null;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function rng(key){let h=2166136261;for(const c of key)h=Math.imul(h^c.charCodeAt(0),16777619);return ()=>{h+=0x6D2B79F5;let t=Math.imul(h^(h>>>15),h|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
function highlights(match,context={}){
 const R=rng([context.year,context.nation,context.player,match.opp,match.stage,match.our,match.their,context.replayVariation||0].join('|'));
 const our=Math.max(0,Math.floor(match.our||0)),their=Math.max(0,Math.floor(match.their||0)),g=match.played?Math.min(our,match.g||0):0,a=match.played?Math.min(our-g,match.a||0):0;
 const events=[];
 for(let i=0;i<our;i++)events.push({team:0,kind:'goal',personal:i<g?'goal':i<g+a?'assist':null});
 for(let i=0;i<their;i++)events.push({team:1,kind:'goal',personal:null});
 // Scoreless games still have chances; these scenes never add goals or personal records.
 if(!events.length){const first=R()<.5?0:1;events.push({team:first,kind:'save',personal:null},{team:1-first,kind:'miss',personal:null},{team:1-first,kind:'save',personal:null});}
 for(let i=events.length-1;i>0;i--){const j=Math.floor(R()*(i+1));[events[i],events[j]]=[events[j],events[i]];}
 const end=match.pk?120:90,patterns=PATTERNS.filter(p=>p!=='farcut');let s0=0,s1=0,bag=[];
 const refill=()=>{bag=patterns.slice();for(let j=bag.length-1;j>0;j--){const k=Math.floor(R()*(j+1));[bag[j],bag[k]]=[bag[k],bag[j]];}};
 events.forEach((event,i)=>{
  if(!bag.length){refill();if(i&&bag.at(-1)===events[i-1].pattern)[bag[0],bag[bag.length-1]]=[bag.at(-1),bag[0]];}event.pattern=bag.pop();event.sceneSeed=Math.floor(R()*4294967296);event.variant=R()<.5?0:1;
  event.minute=Math.round((i+1)*(end-6)/(events.length+1)+(R()-.5)*(end-6)/(events.length+1)*.35)+3;
  event.goalY=46+R()*8;event.lane=R()<.5?18:82;const pool=finishOptions(playerRole(context));if(event.team===0&&event.personal==='goal'&&pool)event.pattern=chooseFinish(pool,R());const assists=assistOptions(playerRole(context));if(event.team===0&&event.personal==='assist'&&assists&&!assists.includes(event.pattern))event.pattern=assists[Math.floor(R()*assists.length)];
  if(event.kind==='goal'){if(event.team)s1++;else s0++;}event.score={our:s0,their:s1};
 });
 return {events,end,our,their,g,a,played:!!match.played};
}

const TIMES=[0,.18,.38,.58,.72,.84,1];
const mixPoint=(a,b,t)=>({x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t)});
// Continuous velocity through receiving points. Only a real turn/stop brakes an axis.
// Monotone Hermite tangents keep the path within its waypoints without overshoot.
function trackTangent(track,i,axis){
 const times=track.times||TIMES,last=track.length-1,secant=j=>(track[j+1][axis]-track[j][axis])/(times[j+1]-times[j]);
 if(i===0)return secant(0);if(i===last)return secant(last-1);
 const left=secant(i-1),right=secant(i);if(left*right<=0)return 0;
 const before=times[i]-times[i-1],after=times[i+1]-times[i],w1=2*after+before,w2=after+2*before;
 return (w1+w2)/(w1/left+w2/right);
}
function sampleTrack(track,t){
 const times=track.times||TIMES;let j=0;while(j<track.length-2&&t>times[j+1])j++;
 const duration=times[j+1]-times[j],v=clamp((t-times[j])/duration,0,1),v2=v*v,v3=v2*v;
 const sample=axis=>(2*v3-3*v2+1)*track[j][axis]+(v3-2*v2+v)*duration*trackTangent(track,j,axis)+(-2*v3+3*v2)*track[j+1][axis]+(v3-v2)*duration*trackTangent(track,j+1,axis);
 return {x:sample('x'),y:sample('y')};
}
const ROLE_CARDS={FW:['윙어','인사이드 포워드','포처','타깃맨','펄스나인'],MF:['박스투박스','공격형 미드필더','메짤라','딥라잉 플레이메이커','수비형 미드필더'],DF:['센터백','볼플레잉 센터백','스위퍼','풀백','윙백','인버티드 풀백']};
function playerRole(options={}){
 const name=options.role||(ROLE_CARDS[options.pos]||[])[options.card]||({FW:'포처',MF:'박스투박스',DF:'센터백'})[options.pos]||'포처';
 const left=options.foot==='왼발',wide=['윙어','인사이드 포워드','풀백','윙백','인버티드 풀백'].includes(name),inverted=name==='인사이드 포워드';
 // Right/left are relative to our team's attacking direction, including the second half.
 const flank=inverted?(left?'right':'left'):(left?'left':'right'),y=wide?(flank==='right'?82:18):name==='메짤라'?(left?32:68):50;
 const index=name==='윙어'||name==='인사이드 포워드'?(flank==='right'?10:8):['풀백','윙백','인버티드 풀백'].includes(name)?(flank==='right'?4:1):options.pos==='DF'?3:options.pos==='MF'?6:9;
 return {name,index,y,flank:wide?flank:null,foot:left?'왼발':'오른발'};
}
function rolePosition(role,u,defending=false){
 const name=role.name,wide=role.flank!==null;let x,y=role.y;
 if(['풀백','윙백','인버티드 풀백'].includes(name)){x=defending?22+u*4:40+u*(name==='윙백'?42:25);if(name==='인버티드 풀백'&&!defending)y=lerp(y,role.flank==='right'?57:43,u);}
 else if(name==='윙어'){x=defending?47-u*8:60+u*24;}
 else if(name==='인사이드 포워드'){x=defending?48-u*8:62+u*25;if(!defending)y=lerp(y,role.flank==='right'?55:45,u);}
 else if(name==='수비형 미드필더'||name==='딥라잉 플레이메이커')x=defending?34-u*4:36+u*16;
 else if(name==='공격형 미드필더')x=defending?49-u*7:58+u*22;
 else if(name==='메짤라')x=defending?41-u*5:48+u*27;
 else if(name==='박스투박스')x=defending?40-u*6:43+u*25;
 else if(name==='펄스나인')x=defending?53-u*4:58+u*17;
 else if(['센터백','볼플레잉 센터백','스위퍼'].includes(name)){x=defending?20+u*3:26+u*13;y=role.name==='스위퍼'?50:61;}
 else x=defending?55-u*5:65+u*25;
 return [x,y];
}

function finishOptions(role){
 if(['풀백','윙백'].includes(role.name))return [{pattern:'halfspace',weight:60},{pattern:'longshot',weight:15},{pattern:'farcut',weight:15},{pattern:'rebound',weight:10}];
 if(role.name==='인버티드 풀백')return [{pattern:'halfspace',weight:70},{pattern:'longshot',weight:20},{pattern:'rebound',weight:10}];
 if(['윙어','인사이드 포워드'].includes(role.name))return PATTERNS.map(pattern=>({pattern,weight:pattern==='farcut'?3:1}));
 if(['센터백','볼플레잉 센터백','스위퍼'].includes(role.name))return [{pattern:'corner',weight:65},{pattern:'shortcorner',weight:15},{pattern:'longshot',weight:5},{pattern:'rebound',weight:15}];
 if(['수비형 미드필더','딥라잉 플레이메이커'].includes(role.name))return [{pattern:'longshot',weight:65},{pattern:'corner',weight:10},{pattern:'shortcorner',weight:5},{pattern:'rebound',weight:20}];
 return null;
}
function assistOptions(role){
 if(['센터백','볼플레잉 센터백','스위퍼'].includes(role.name))return ['through','longshot','rebound'];
 if(['수비형 미드필더','딥라잉 플레이메이커','인버티드 풀백'].includes(role.name))return ['through','combine','longshot','rebound'];
 return null;
}
function chooseFinish(pool,value){const total=pool.reduce((n,p)=>n+p.weight,0);let pick=value*total;for(const item of pool){pick-=item.weight;if(pick<0)return item.pattern;}return pool.at(-1).pattern;}

function choreography(event,{heroIndex=9,role=null}={}){
 if(role&&event.team===0&&event.personal==='goal'&&event.pattern==='farcut'&&!['풀백','윙백','윙어','인사이드 포워드'].includes(role.name))throw new RangeError('Unsupported goal sequence for '+role.name);
 const allowed=role&&event.team===0&&event.personal==='goal'?finishOptions(role):null;if(allowed&&!allowed.some(p=>p.pattern===event.pattern))throw new RangeError('Unsupported goal sequence for '+role.name);
 if(role?.flank&&event.team===0&&event.personal){
  // Service side and receiving side differ: runners attack the far side of a low cross.
  const farReceiver=['wing','cutback','lowcross','switch','through','counter','combine','dribble','chip'];
  const opposite=event.personal==='goal'?farReceiver.includes(event.pattern):event.pattern==='farcut';
  event={...event,lane:opposite?100-role.y:role.y};
 }
 const variation=rng(String(event.sceneSeed??[event.pattern,event.minute,event.team,event.lane,event.variant].join('|')));
 const width=.88+variation()*.2,depth=.92+variation()*.1,offset=(variation()-.5)*9;

 const kickerFoot=event.pattern==='freekick'?(event.team===0&&event.personal==='goal'&&role?(role.foot||'오른발'):(variation()<.5?'오른발':'왼발')):null;
 const dir=(event.team===0?1:-1)*(event.minute>45?-1:1),top=event.pattern==='freekick'?kickerFoot==='오른발':event.lane<50,side=y=>top?y:100-y;
 const shooter=event.team===0&&event.personal==='goal'?heroIndex:event.team===0&&heroIndex===9?8:9;
 const passer=event.team===0&&event.personal==='assist'?heroIndex:(event.pattern==='halfspace'?[top?8:10,top?1:4,5,7]:[top?1:4,5,7]).find(i=>i!==shooter&&(event.team!==0||i!==heroIndex));
 const mid=[6,5,7].find(i=>i!==shooter&&i!==passer),link=[7,5,6].find(i=>i!==shooter&&i!==passer&&i!==mid);
 const cbLongShot=event.pattern==='longshot'&&event.team===0&&event.personal==='goal'&&role&&['센터백','볼플레잉 센터백','스위퍼'].includes(role.name);
 const frames=[],isSetPiece=['corner','shortcorner','rebound','freekick'].includes(event.pattern);
 for(let k=0;k<TIMES.length;k++){
  const u=Math.min(k,5)/5,attack=[[8,50],[40+u*35,side(13)],[28+u*19,39],[30+u*18,61],[43+u*15,side(72-u*17)],[43+u*17,side(31)],[45+u*23,51],[49+u*24,side(68)],[62+u*25,side(25)],[64+u*25,51],[59+u*24,side(76)]];
  // Ball-side fullback advances; the opposite fullback tucks inside behind midfield.
  if(!top){[attack[1],attack[4]]=[attack[4],attack[1]];}
  const defense=[[97,50],[76+u*13,side(15+u*11)],[80+u*12,side(40-u*4)],[78+u*12,side(59-u*5)],[74+u*12,side(82-u*12)],[62+u*17,side(24-u*5)],[64+u*18,46],[60+u*18,side(72-u*9)],[50+u*12,side(24)],[48+u*12,51],[52+u*11,side(77)]];
  if(isSetPiece){
   const rest=event.pattern==='freekick'?49:59;
   [[8,50],[rest,28],[86+u*5,41-u*3],[85+u*6,61+u*2],[rest+2,73],[75+u*3,30],[72+u*3,56],[85+u*6,71-u*5],[88+u*4,34+u*3],[88+u*5,52],[89+u*4,66-u*2]].forEach((v,id)=>attack[id]=[v[0],side(v[1])]);
   [[97,50],[95,33],[88+u*3,41],[89+u*2,59],[95,66],[85+u*2,32],[84+u*3,51],[87+u*2,70],[79+u*2,40],[64,54],[79+u*2,68]].forEach((v,id)=>defense[id]=[v[0],side(v[1])]);
  }
  if(cbLongShot){
   // A sustained attack has already pushed both lines up. The CB supports behind midfield.
   [[22,50],[74+u*4,16],[55+u*4,39],[55+u*4,61],[74+u*4,84],[71+u*3,33],[68+u*3,54],[76+u*3,67],[84+u*4,29],[88+u*3,51],[85+u*4,73]].forEach((v,id)=>attack[id]=[v[0],side(v[1])]);
   [[97,50],[88,25],[90,41],[90,59],[88,76],[83,33],[80,50],[83,67],[73,31],[66,51],[74,73]].forEach((v,id)=>defense[id]=[v[0],side(v[1])]);
  }
  frames.push({attack,defense});
 }
 const scripted=new Set();const set=(id,coords)=>{scripted.add(id);coords.forEach(([x,y],k)=>frames[k].attack[id]=[x,side(y)]);};
 const deepRebound=event.pattern==='rebound'&&event.team===0&&event.personal==='goal'&&role&&['풀백','윙백','인버티드 풀백','센터백','볼플레잉 센터백','스위퍼','수비형 미드필더','딥라잉 플레이메이커'].includes(role.name);
 let reboundStyle=event.personal==='assist'?'layoff':deepRebound?(event.reboundStyle==='edge-control'||!event.reboundStyle&&variation()>.5?'edge-control':'edge-first'):(event.reboundStyle==='layoff'||!event.reboundStyle&&variation()>.5?'layoff':'tap');
 let from,helper,reboundKicker=passer,freeKickSpot=null;
 if(event.pattern==='rebound'){
  // Players are already up for the set piece; only the second-ball receiver is held back.
  set(passer,[[99,1],[99,1],[99,1],[98,3],[97,5],[97,6],[97,6]]);
  set(mid,[[85,64],[87,62],[89,60],[93,58],[94,59],[95,60],[95,60]]);
  set(shooter,deepRebound?[[67,56],[67,56],[68,56],[69,55],[72,53],[74,51],[75,51]]:[[87,42],[88,43],[90,45],[91,47],[93,50],[94,51],[95,51]]);
  if(event.team===0&&event.personal==='assist'){
   reboundKicker=[1,4,8,10].find(i=>i!==shooter&&i!==passer&&i!==mid);set(reboundKicker,[[99,1],[99,1],[99,1],[98,3],[97,5],[97,6],[97,6]]);
   set(passer,role&&['풀백','윙백','인버티드 풀백','센터백','볼플레잉 센터백','스위퍼','수비형 미드필더','딥라잉 플레이메이커'].includes(role.name)?[[68,55],[68,55],[69,54],[71,53],[74,51],[76,50],[77,50]]:[[85,40],[86,41],[87,43],[88,46],[89,49],[91,50],[92,50]]);
  }
  if(deepRebound&&reboundStyle==='edge-control')set(shooter,[[68,43],[68,43],[69,43],[70,44],[73,47],[75,49],[76,50]]);
  if(reboundStyle==='layoff'&&event.personal!=='assist')set(link,[[88,62],[89,60],[90,58],[91,56],[92,54],[93,53],[93,53]]);
  from=passer;helper=mid;
 }else if(event.pattern==='farcut'){
  // Opposite flank delivery falls beyond the far post. Receiver stays wide,
  // controls it on the ground, then carries diagonally inside before striking.
  set(mid,[[61,64],[63,65],[67,66],[72,66],[76,64],[79,60],[79,60]]);
  set(passer,[[76,83],[79,83],[82,81],[84,78],[86,73],[88,68],[88,68]]);
  set(shooter,[[77,13],[78,14],[80,17],[82,25],[85,35],[88,44],[89,46]]);
  from=mid;helper=link;
 }else if(event.pattern==='halfspace'){
  // The wide player pins the fullback; a central striker pins the centre-back.
  // The scorer gives it inside and underlaps into that gap, receiving ahead of the winger.
  set(shooter,[[58,25],[61,27],[66,29],[74,30],[82,31],[85,32],[86,33]]);
  set(mid,[[63,40],[65,41],[67,41],[69,42],[71,43],[73,44],[74,44]]);
  set(passer,[[65,12],[67,12],[71,13],[76,13],[79,14],[82,15],[83,15]]);
  // Both flanks keep their width. If the winger is the scorer, his fullback supplies it.
  for(const [wing,fb,lateral] of [[8,1,14],[10,4,86]]){
   const wide=wing===shooter?fb:wing;
   if([shooter,mid,passer].includes(wide))continue;
   set(wide,TIMES.map((t,k)=>[65+Math.min(k,5)*3,top?lateral:100-lateral]));
  }
  const pin=[9,7,5,6].find(i=>![shooter,mid,passer].includes(i));
  set(pin,[[76,50],[79,50],[82,49],[85,49],[88,50],[90,50],[91,50]]);
  from=shooter;helper=mid;
 }else if(event.pattern==='wing'||event.pattern==='cutback'){
  // Winger holds width then releases overlapping fullback. Receiving forward attacks the gap.
  const winger=[8,10].find(i=>i!==shooter&&i!==passer);
  set(mid,[[40,42],[43,40],[48,38],[57,34],[69,35],[74,40],[74,40]]);
  set(winger,[[59,19],[61,19],[68,21],[76,25],[82,31],[86,38],[86,38]]);
  set(passer,[[45,11],[53,10],[66,10],[84,13],[90,17],[90,21],[90,21]]);
  set(shooter,[[65,55],[68,56],[73,57],[80,55],[87,event.pattern==='cutback'?56:47],[90,48],[91,48]]);
  from=mid;helper=winger;
  if(event.pattern==='cutback'){
   set(passer,[[52,12],[61,11],[77,10],[91,12],[95,16],[95,22],[95,22]]);
   set(shooter,[[62,65],[65,64],[69,62],[75,59],[81,55],[84,51],[85,51]]);
  }else if(event.variant){set(shooter,[[66,65],[69,66],[74,67],[81,65],[89,60],[92,54],[93,54]]);}
 }else if(event.pattern==='dribble'){
  set(passer,[[45,38],[50,40],[57,42],[64,43],[70,44],[75,46],[75,46]]);
  set(shooter,[[59,68],[62,64],[69,56],[77,62],[85,49],[90,48],[91,48]]);
  from=passer;helper=link;
 }else if(event.pattern==='chip'){
  set(passer,[[46,35],[52,37],[62,40],[71,43],[77,46],[82,48],[82,48]]);
  set(shooter,[[61,66],[65,63],[72,57],[80,52],[85,49],[87,49],[88,49]]);
  from=passer;helper=link;
 }else if(event.pattern==='freekick'){
  set(passer,[[68,43],[68,43],[68,43],[69,44],[70,46],[72,47],[72,47]]);
  const fx=62+variation()*8,fy=30+variation()*12;freeKickSpot={x:dir>0?fx:100-fx,y:dir>0?side(fy):100-side(fy)};set(shooter,[[fx-1.8,fy+2],[fx-1.8,fy+2],[fx-1.8,fy+2],[fx+.5,fy],[fx+3,fy],[fx+5,fy],[fx+6,fy]]);set(passer,[[fx,fy-6],[fx,fy-6],[fx,fy-6],[fx+1,fy-5],[fx+2,fy-4],[fx+4,fy-3],[fx+5,fy-3]]);
  from=shooter;helper=link;
 }else if(event.pattern==='shortcorner'){
  set(mid,[[99,1],[99,1],[99,1],[97,5],[94,12],[92,18],[92,18]]);
  set(passer,[[87,11],[87,11],[87,13],[89,19],[91,26],[92,29],[92,29]]);
  set(shooter,[[75,65],[77,63],[81,60],[86,55],[90,50],[93,49],[94,49]]);
  from=mid;helper=link;
 }else if(event.pattern==='longshot'){
  const zone=variation(),shootY=role?.flank?30+variation()*12:zone<.34?32+variation()*7:zone>.67?62+variation()*7:46+variation()*8,shootX=65+variation()*7;
  const feedY=shootY<50?shootY+19:shootY-19;
  set(mid,[[55,53],[59,49],[65,44],[71,40],[76,40],[79,43],[80,44]]);
  set(passer,[[shootX-1,feedY+4],[shootX+1,feedY+2],[shootX+5,feedY],[shootX+10,feedY-4],[shootX+13,feedY-7],[shootX+14,feedY-8],[shootX+14,feedY-8]]);
  set(shooter,[[shootX-6,shootY+4],[shootX-5,shootY+3],[shootX-4,shootY+2],[shootX-2,shootY+1],[shootX,shootY],[shootX+2,shootY],[shootX+3,shootY]]);
  if(cbLongShot){
   const supportX=56+variation()*3,supportY=43+variation()*14,edgeY=supportY<50?supportY+17:supportY-17;
   set(mid,[[76,52],[79,48],[83,42],[86,39],[88,41],[89,44],[90,45]]);
   set(passer,[[72,edgeY+8],[75,edgeY+5],[80,edgeY],[84,edgeY-5],[87,edgeY-8],[88,edgeY-9],[88,edgeY-9]]);
   set(shooter,[[supportX,supportY],[supportX+.5,supportY],[supportX+1,supportY],[supportX+2,supportY],[supportX+4,supportY],[supportX+6,supportY],[supportX+7,supportY]]);
  }
  from=mid;helper=link;
 }else if(event.pattern==='switch'){
  set(mid,[[42,75],[45,76],[50,77],[57,70],[64,62],[70,56],[70,56]]);
  set(passer,[[53,15],[58,14],[65,12],[79,13],[88,18],[90,23],[90,23]]);
  set(shooter,[[63,64],[67,62],[73,59],[80,56],[88,53],[91,50],[92,50]]);
  from=mid;helper=link;
 }else if(event.pattern==='lowcross'){
  set(mid,[[43,41],[47,39],[53,34],[61,29],[68,31],[74,36],[74,36]]);
  set(passer,[[54,16],[62,15],[73,14],[86,18],[92,26],[93,30],[93,30]]);
  const run=variation();set(shooter,run<.34?[[71,68],[73,64],[78,59],[84,55],[88,52],[90,50],[91,50]]:run>.67?[[70,76],[74,75],[81,72],[87,68],[93,64],[95,61],[96,60]]:[[69,63],[73,59],[80,49],[86,40],[92,35],[94,38],[95,40]]);
  const arrivalOffset=(variation()-.5)*9;frames.forEach((f,k)=>f.attack[shooter][1]+=(top?1:-1)*arrivalOffset*clamp(TIMES[k]/.6,0,1));
  from=mid;helper=link;
 }else if(event.pattern==='corner'){
  set(passer,[[99,1],[99,1],[99,1],[98,4],[96,8],[95,12],[95,12]]);
  set(shooter,[[79,63],[80,62],[83,60],[88,52],[92,46],[94,48],[95,48]]);
  set(mid,[[74,42],[77,40],[82,38],[87,35],[90,37],[92,40],[92,40]]);
  set(link,[[77,75],[80,70],[83,64],[87,61],[91,59],[93,56],[94,55]]);
  from=passer;helper=link;
 }else if(event.pattern==='counter'){
  set(mid,[[35,47],[42,44],[50,42],[58,43],[63,46],[67,48],[67,48]]);
  set(link,[[43,63],[51,60],[60,57],[70,53],[75,53],[80,51],[80,51]]);
  set(passer,[[47,28],[55,29],[65,30],[75,34],[81,38],[85,41],[85,41]]);
  set(shooter,[[53,55],[61,52],[70,50],[80,47],[88,46],[91,47],[91,47]]);
  from=mid;helper=link;
 }else if(event.pattern==='through'){
  set(mid,[[38,48],[43,48],[48,48],[56,47],[62,47],[68,47],[68,47]]);
  set(passer,[[52,34],[56,36],[64,39],[72,42],[76,45],[80,47],[80,47]]);
  set(shooter,[[65,64],[67,63],[75,60],[84,54],[89,50],[93,49],[94,49]]);
  from=mid;helper=link;
 }else{
  set(mid,[[41,43],[45,43],[50,44],[58,47],[64,49],[69,49],[69,49]]);
  set(link,[[49,62],[53,60],[61,57],[67,53],[73,53],[77,53],[77,53]]);
  set(passer,[[56,38],[59,39],[66,42],[73,47],[78,50],[82,51],[82,51]]);
  set(shooter,[[65,59],[67,58],[71,54],[78,49],[87,47],[90,48],[91,48]]);
  from=mid;helper=link;
 }
 if(role&&event.team===0&&event.personal==='assist'&&assistOptions(role)&&event.pattern!=='rebound'){
  const cb=['센터백','볼플레잉 센터백','스위퍼'].includes(role.name),start=cb?38:52,end=cb?54:68;
  set(passer,TIMES.map((t,k)=>[lerp(start,end,Math.min(k,5)/5),50+(role.y-50)*.3]));
 }
 if(event.pattern==='corner'||event.pattern==='shortcorner'){
  const run=variation();set(shooter,run<.34?[[82,55],[83,53],[86,49],[91,42],[95,42],[96,47],[96,49]]:run>.67?[[82,69],[83,68],[85,66],[90,64],[94,61],[95,55],[96,53]]:[[78,59],[80,58],[83,57],[87,54],[90,50],[92,51],[93,51]]);
 }
 if(event.pattern==='shortcorner'&&role&&event.team===0&&event.personal==='goal'&&['수비형 미드필더','딥라잉 플레이메이커'].includes(role.name)){
  // A supporting midfielder waits outside the crowd during the short exchange,
  // then arcs into the crossing lane. He never makes the striker's early goalmouth run.
  const run=variation(),near=run<.34,far=run>.67;
  const coords=near?[[79,49],[79,49],[80,48],[83,46],[89,43],[91,44],[92,46]]:far?[[79,65],[79,65],[80,64],[83,62],[89,60],[92,58],[93,57]]:[[78,60],[78,60],[79,59],[83,57],[88,53],[91,52],[92,52]];
  set(shooter,coords);
  // His marker turns and trails the late run instead of standing in an open-play line.
  const marker=near?2:3;frames.forEach((f,k)=>{const [x,y]=f.attack[shooter];f.defense[marker]=[x+(k<3?2:-2),y+(near?3:-3)];});
 }
 if(isSetPiece){
  const reserve=[1,4,5,6,7,8,10,2,3].filter(i=>![passer,shooter,mid,link,reboundKicker].includes(i)).slice(0,2);
  frames.forEach((f,k)=>reserve.forEach((id,j)=>f.attack[id]=[(event.pattern==='freekick'?48:59)+j*3+Math.min(k,5)*.3,side(j?72:28)]));
 }
 // A player follows one trajectory for the entire highlight. Involved actors
 // start at the scenario's real receiving/serving position; no mid-scene role blending.
 if(role&&event.team===0&&!isSetPiece&&!scripted.has(heroIndex))frames.forEach((f,k)=>f.attack[heroIndex]=rolePosition(role,Math.min(k,5)/5));
 // Vary the whole connected attack, rather than independently jittering players or the ball.
 if(!isSetPiece)frames.forEach(f=>f.attack.forEach((v,i)=>{if(!i)return;v[0]=clamp(100-(100-v[0])*depth,2,97);v[1]=clamp(50+(v[1]-50)*width+offset*Math.sin(Math.PI*v[0]/100),4,96);}));
 // Close down the ball flank, cover the lane, track the runner at different depths.
 const defenderNear=top?1:4,cover=top?2:3,far=top?3:2;
 const attackAt=(id,k)=>frames[k].attack[id];
 for(let k=0;k<TIMES.length;k++){
  const a=attackAt(passer,k),b=attackAt(shooter,k),u=Math.min(k,5)/5;
  if(isSetPiece){frames[k].defense[0]=[97,lerp(50,clamp(b[1],43,57),u*.4)];continue;}
  frames[k].defense[defenderNear]=[Math.min(98,Math.max(76,a[0]+4)),lerp(side(18),a[1]+(top?5:-5),u)];
  frames[k].defense[cover]=[lerp(81,93,u),lerp(side(39),b[1]-4,u)];
  frames[k].defense[far]=[lerp(79,91,u),lerp(side(63),side(60),u)];
  frames[k].defense[6]=[lerp(66,82,u),lerp(49,side(38),u)];
  frames[k].defense[0]=[97,lerp(50,clamp(b[1],43,57),u*(event.pattern==='longshot'?.2:.6))];
 }
 if(cbLongShot)frames.forEach((f,k)=>{
  const u=Math.min(k,5)/5,a=f.attack[passer],b=f.attack[mid];
  f.defense[defenderNear]=[a[0]+3,a[1]+(top?4:-4)];
  f.defense[cover]=[89+u*2,side(40)];f.defense[far]=[89+u*2,side(60)];
  f.defense[6]=[b[0]+3,b[1]+4];
 });
 if(event.pattern==='halfspace')frames.forEach((f,k)=>{
  // Match both flanks through the whole baseline path, not just its first frame.
  // A mirrored first-frame correction must never create a cross-pitch sprint in timing calibration.
  const u=Math.min(k,5)/5;f.defense[1]=[76+u*9,18+u*3];f.defense[4]=[76+u*9,82-u*3];f.defense[2]=[81+u*10,40-u*2];f.defense[3]=[81+u*10,60+u*2];
 });
 // Hold the set position until the strike; the reaction is timed from the actual shot below.
 frames[5].defense[0]=[...frames[4].defense[0]];frames[6].defense[0]=[...frames[4].defense[0]];
 if(event.pattern==='chip'){
  [[97,50],[96,50],[94,50],[92,50],[90,50],[90,51],[91,51]].forEach((v,k)=>frames[k].defense[0]=v);
 }
 if(event.pattern==='dribble'){
  [[70,58],[72,57],[76,58],[81,55],[85,56],[89,54],[89,54]].forEach(([x,y],k)=>frames[k].defense[cover]=[x,side(y)]);
 }
 if(event.pattern==='freekick'){
  // Compact wall and stationary ball before the run-up; defenders jump at release.
  const [sx,sy]=frames[0].attack[shooter],wx=lerp(sx,97,.43),wy=lerp(sy,50,.43);[5,6,7].forEach((id,j)=>frames.forEach((f,k)=>f.defense[id]=[wx+Math.max(0,k-3),wy+(j-1)*6]));
 }
 if(event.pattern==='rebound'){
  frames.forEach((f,k)=>{f.defense[0]=[97.09,50];[1,2,3,4].forEach((id,j)=>f.defense[id]=[91+(j%2)*2,side(34+j*11)]);});
  if(deepRebound){[[89,46],[90,48],[91.09,50],[90,51],[89,53],[88,54],[88,54]].forEach(([x,y],k)=>frames[k].defense[2]=[x,side(y)]);}
  else if(reboundStyle==='layoff'){
   // The collector has a defender directly closing the shot lane. The scorer remains free.
   const collector=event.personal==='assist'?passer:link;
   frames.forEach((f,k)=>{const [x,y]=f.attack[collector];f.defense[2]=[Math.min(97,x+3.6),y+3];f.defense[3]=[89,side(66)];});
  }
 }
 if(role&&event.team!==0&&!isSetPiece)frames.forEach((f,k)=>{const base=rolePosition(role,Math.min(k,5)/5,true);f.defense[heroIndex]=[100-base[0],100-base[1]];});
 const tracks=[];
 for(let team=0;team<2;team++)for(let i=0;i<11;i++)tracks.push({team,i,dir:team===event.team?dir:-dir,track:frames.map(f=>{const [x,y]=(team===event.team?f.attack:f.defense)[i];return {x:dir>0?x:100-x,y:dir>0?y:100-y};})});
 // Each attack has its own ball rhythm: wall return, early through ball,
 // fast counter with a long carry, floated cross, or late backward cutback.
 const pass=(from,to,release,end,type='pass')=>({from,to,release,end,type});
 let legs;
 const transform=([x,y])=>({x:dir>0?x:100-x,y:dir>0?side(y):100-side(y)}),blocked=transform(deepRebound?[88,50]:[94,50]);
 if(event.pattern==='rebound'){
  const assisted=event.team===0&&event.personal==='assist',contact=deepRebound?.38:.58;let collector=assisted?passer:reboundStyle==='layoff'?link:shooter;
  if(!assisted&&reboundStyle==='layoff'){
   const at=sampleTrack(tracks.find(p=>p.team===event.team&&p.i===collector).track,.69),distance=Math.min(...tracks.filter(p=>p.team!==event.team).map(p=>{const q=sampleTrack(p.track,.69);return Math.hypot((q.x-at.x)*(P.r-P.l)/100,(q.y-at.y)*(P.b-P.t)/100);}));
   if(distance>28){reboundStyle='tap';collector=shooter;}
  }
  const receive=deepRebound?(reboundStyle==='edge-control'?.52:.56):assisted?.65:reboundStyle==='layoff'?.66:.70;
  const clearance={...pass(helper,collector,contact,receive,'rebound'),origin:blocked};
  legs=deepRebound?[{...pass(reboundKicker,undefined,.10,contact,'cross'),target:blocked}]:[pass(reboundKicker,helper,.20,.44,'cross'),{...pass(helper,undefined,.48,contact,'blocked'),target:blocked}];
  legs.push(clearance);
  if(assisted||reboundStyle==='layoff')legs.push(pass(collector,shooter,assisted?.68:.69,.75,'layoff'));
  legs.push(pass(shooter,undefined,deepRebound?(reboundStyle==='edge-control'?.66:.58):reboundStyle==='tap'?.71:.76,.84,'shot'));
 }else if(event.pattern==='farcut')legs=[pass(from,passer,.15,.29),pass(passer,shooter,.34,.54,'cross'),pass(shooter,undefined,.76,.84,'shot')];
 else if(event.pattern==='halfspace')legs=[pass(shooter,helper,.10,.25),pass(helper,passer,.29,.44),pass(passer,shooter,.62,.72,'through'),pass(shooter,undefined,.75,.84,'shot')];
 else if(event.pattern==='combine')legs=[pass(from,passer,.12,.26),pass(passer,shooter,.32,.44),pass(shooter,passer,.46,.55),pass(passer,shooter,.60,.72),pass(shooter,undefined,.745,.84,'shot')];
 else if(event.pattern==='through')legs=[pass(from,passer,.16,.32),pass(passer,shooter,.37,.54,'through'),pass(shooter,undefined,.745,.84,'shot')];
 else if(event.pattern==='counter')legs=[pass(from,passer,.08,.27),pass(passer,shooter,.32,.48,'through'),pass(shooter,undefined,.745,.84,'shot')];
 else if(event.pattern==='cutback')legs=[pass(from,passer,.22,.45),pass(passer,shooter,.66,.76,'cutback'),pass(shooter,undefined,.775,.84,'shot')];
 else if(event.pattern==='dribble')legs=[pass(passer,shooter,.16,.31),pass(shooter,undefined,.745,.84,'shot')];
 else if(event.pattern==='chip')legs=[pass(passer,shooter,.22,.49,'through'),pass(shooter,undefined,.72,.84,'chip')];
 else if(event.pattern==='freekick')legs=event.team===0&&event.personal==='assist'?[pass(passer,shooter,.48,.55,'layoff'),pass(shooter,undefined,.59,.84,'freekick')]:[pass(shooter,undefined,.57,.84,'freekick')];
 else if(event.pattern==='shortcorner')legs=[pass(from,passer,.22,.39),pass(passer,shooter,.63,.74,'cross'),pass(shooter,undefined,.765,.84,'header')];
 else if(event.pattern==='longshot')legs=[pass(from,passer,.20,.43),pass(passer,shooter,.60,.70,cbLongShot?'cutback':'layoff'),pass(shooter,undefined,.735,.84,'shot')];
 else if(event.pattern==='switch')legs=[pass(from,passer,.16,.44,'lob'),pass(passer,shooter,.60,.72,'cross'),pass(shooter,undefined,.745,.84,'shot')];
 else if(event.pattern==='lowcross')legs=[pass(from,passer,.24,.47),pass(passer,shooter,.65,.74,'lowcross'),pass(shooter,undefined,.76,.84,'shot')];
 else if(event.pattern==='corner')legs=[pass(passer,shooter,.39,.72,'cross'),pass(shooter,undefined,.745,.84,'header')];
 else legs=[pass(from,helper,.23,.38),pass(helper,passer,.43,.58),pass(passer,shooter,.60,.72,'cross'),pass(shooter,undefined,.745,.84,'shot')];
 legs.forEach((leg,i)=>leg.start=i?legs[i-1].end:0);
 // Successful shots can finish left, centrally or right; placement is independent of the score.
 const variedShot=event.pattern==='longshot'||event.pattern==='freekick'||deepRebound,zone=variedShot?Math.floor(variation()*3):null;
 const goalY=variedShot?(zone===0?41+variation()*4:zone===1?48+variation()*4:55+variation()*3):event.goalY;
 const shotLift=variedShot&&zone===1?12+variation()*8:0;

 const scene={tracks,legs,dir,pattern:event.pattern,kickerFoot,freeKickSpot,freeKickCurve:kickerFoot?(kickerFoot==='오른발'?1:-1)*(2.4+variation()*1.2):0,shotZone:zone,shotLift,reboundDeep:!!deepRebound,cbLongShot:!!cbLongShot,reboundStyle,contact:event.pattern==='rebound'?{type:deepRebound?'clearance':'parry',team:1-event.team,id:deepRebound?2:0,time:deepRebound?.38:.58,point:blocked,height:deepRebound?6:0}:null,wall:event.pattern==='freekick',header:['corner','shortcorner'].includes(event.pattern)?shooter:null,team:event.team,goal:{x:dir>0?101: -1,y:dir>0?goalY:100-goalY}};
 scene.outcome=event.kind||'goal';
 if(scene.outcome==='save'){scene.goal={x:dir>0?96:4,y:dir>0?goalY:100-goalY};scene.shotLift=0;}
 if(scene.outcome==='miss'){const wide=event.lane<50?32:68;scene.goal={x:dir>0?102:-2,y:dir>0?wide:100-wide};scene.shotLift=0;}
 if(event.pattern==='freekick'){
  // The ball is placed once. Only the kicker moves during the run-up.
  const shot=legs.at(-1);shot.origin={...freeKickSpot};planFreeKickApproach(scene);
  if(legs.length>1){const tap=legs[0];tap.origin=possessionPoint(scene,tap.from,tap.release);tap.target={...shot.origin};}
 }
 if(event.pattern!=='chip'||scene.outcome==='save'){
  const shot=legs.at(-1),start=shot.release+(shot.end-shot.release)*.22,keeper=tracks.find(p=>p.team!==event.team&&p.i===0),at=sampleTrack(keeper.track,start);
  // Late push toward the ball: the shot passes beyond the reach, never behind a keeper fleeing it.
  scene.keeperReaction={start,end:scene.outcome==='save'?shot.end:shot.end+.12,at,to:scene.outcome==='save'?{...scene.goal}:{x:at.x+dir*.25,y:lerp(at.y,scene.goal.y,event.pattern==='longshot'||deepRebound?.32:.62)}};
 }
 coordinateInPlay(scene,{scripted,heroIndex,role,isSetPiece});scene.durationMs=motionDuration(scene);return scene;
}
// Approach from the outside of the kicking foot, using the actual launch tangent.
function planFreeKickApproach(scene){
 const shot=scene.legs.at(-1),origin=shot.origin,dx=(scene.goal.x-origin.x)*1.05,dy=(scene.goal.y-origin.y)*.68,length=Math.hypot(dx,dy),spin=scene.freeKickCurve;
 const launch={x:dx-dy/length*4*spin,y:dy+dx/length*4*spin};
 const angle=Math.atan2(launch.y,launch.x)+Math.sign(spin)*Math.PI/8,approach={x:Math.cos(angle),y:Math.sin(angle)};
 const pixelsPerMetre=Math.hypot(approach.x/1.05*(P.r-P.l)/100,approach.y/.68*(P.b-P.t)/100),lead=19/pixelsPerMetre;
 const at=distance=>({x:origin.x+approach.x*distance/1.05,y:origin.y+approach.y*distance/.68});
 const player=scene.tracks.find(p=>p.team===scene.team&&p.i===shot.from),ready=at(-lead-5.2),strike=at(-lead);
 player.track=[{...ready},{...ready},{...ready},strike,at(-lead+1.2),at(-lead+1.8),at(-lead+1.8)];
 player.track.times=[0,.18,shot.release-.19,shot.release,shot.release+.13,.84,1];
 scene.freeKickApproach={launch,approach,strike,ready};
 // The wall is positioned relative to the stationary ball, not the run-up starting point.
 const spot={x:scene.dir>0?origin.x:100-origin.x,y:scene.dir>0?origin.y:100-origin.y},wx=lerp(spot.x,97,.43),wy=lerp(spot.y,50,.43);
 for(const p of scene.tracks.filter(p=>p.team!==scene.team&&[5,6,7].includes(p.i)))p.track=TIMES.map((t,k)=>{const x=wx+Math.max(0,k-3),y=wy+(p.i-6)*6;return {x:scene.dir>0?x:100-x,y:scene.dir>0?y:100-y};});
}
// Reshape off-ball play around the actual ball phase, rather than sliding a fixed formation.
function coordinateInPlay(scene,{scripted,heroIndex,role,isSetPiece}){
 if(isSetPiece)return;
 const attack=scene.tracks.filter(p=>p.team===scene.team),defense=scene.tracks.filter(p=>p.team!==scene.team),canonical=p=>({x:scene.dir>0?p.x:100-p.x,y:scene.dir>0?p.y:100-p.y});
 if(role&&scene.team!==0&&[8,10].includes(heroIndex)){
  // Our highlighted winger keeps his own role flank; the other winger takes the opposite lane.
  const hero=defense.find(p=>p.i===heroIndex),other=defense.find(p=>p.i===(heroIndex===8?10:8)),heroSide=canonical(hero.track[0]).y,opposite=heroSide<50?76:24;
  other.track.forEach(point=>point.y=scene.dir>0?opposite:100-opposite);
 }
 const movementSeconds=motionDuration(scene)/1000,strike=scene.legs.at(-1).release;
 const ballPath=Array.from({length:167},(_,i)=>canonical(sampleScene(scene,Math.min(i/200,strike)).ball));
 const ballAt=t=>{const f=clamp(t*200,0,165.999),i=Math.floor(f);return mixPoint(ballPath[i],ballPath[i+1],f-i);};
 const territory=TIMES.map(t=>Math.max(...ballPath.slice(0,Math.floor(Math.min(t,.83)*200)+1).map(q=>q.x)));
 const original=new Map(scene.tracks.map(p=>[p, p.track.map(q=>({...q}))]));
 const assign=(p,points)=>{
  // A marker cannot chase the ball's passing speed; close the space with a limited running step.
  for(let k=1;k<points.length;k++){const previous=points[k-1],next=points[k],distance=Math.hypot((next.x-previous.x)*1.05,(next.y-previous.y)*.68),limit=5.5*movementSeconds*(TIMES[k]-TIMES[k-1]);if(distance>limit)points[k]=mixPoint(previous,next,limit/distance);}
  p.track=points.map(q=>({x:scene.dir>0?q.x:100-q.x,y:scene.dir>0?q.y:100-q.y}));
 };
 const protectedHero=p=>p.team===0&&p.i===heroIndex&&role;
 for(const p of attack){
  if(!p.i||scripted.has(p.i)||protectedHero(p))continue;
  const initial=canonical(original.get(p)[0]),left=initial.y<50;
  const points=TIMES.map((t,k)=>{
   const q=ballAt(t+(p.i>=8?.045:-(.025+p.i*.009))),progress=clamp(t/.72,0,1),flank=left?-1:1,ballSide=q.y<50?-1:1;let x,y;
   if(p.i===2||p.i===3){x=clamp(territory[k]-27,29,63);y=50+flank*12+(q.y-50)*.12;}
   else if(p.i===1||p.i===4){const overlap=flank===ballSide;x=clamp((overlap?q.x+8:territory[k]-11),40,92);y=overlap?50+flank*33:50+flank*17;}
   else if(p.i>=8){x=clamp(territory[k]+10+progress*4,initial.x,94);y=50+flank*(25-18*progress)+(q.y-50)*.18;}
   else{x=clamp(Math.max(territory[k]-16,q.x-8)+(p.i===7?6:0)+progress*3,initial.x-6,85);y=50+flank*16+(q.y-50)*.3;}
   const mix=clamp(t/.38,0,1);return {x:lerp(initial.x,x,mix),y:lerp(initial.y,y,mix)};
  });assign(p,points);
 }
 const scorer=scene.legs.at(-1).from,runner=attack.find(p=>p.i===scorer);
 for(const p of defense){
  if(!p.i||protectedHero(p))continue;
  const initial=canonical(original.get(p)[0]),left=initial.y<50,flank=left?-1:1;
  const points=TIMES.map((t,k)=>{
   const q=ballAt(t-(.02+p.i*.011)),r=canonical(sampleTrack(runner.track,clamp(t-(p.i%2)*.035,0,1))),ballSide=q.y<50?-1:1;let x,y;
   if(p.i===2||p.i===3){const nearest=(r.y<50?-1:1)===flank;x=clamp(nearest?r.x+3:q.x+17,76,95);y=nearest?r.y+flank*(scene.pattern==='halfspace'?-8:5):50+flank*13+(q.y-50)*.12;}
   else if(p.i===1||p.i===4){const pressing=flank===ballSide&&Math.abs(q.y-50)>16;x=clamp(q.x+(pressing?4:13),73,94);y=pressing?q.y+flank*4:50+flank*26;}
   else if(p.i>=5&&p.i<=7){
    // One midfielder presses outside the ball; the next protects the inside passing lane.
    if(p.i===6){x=clamp(q.x+8,55,90);y=q.y-ballSide*11;}
    else if(flank===ballSide){x=clamp(q.x+3,55,88);y=q.y+ballSide*5;}
    else{x=clamp(q.x-7,55,88);y=50+flank*23+(q.y-50)*.15;}
   }
   else if(p.i===9){x=clamp(q.x-18,45,79);y=50+(q.y-50)*.3;}
   else{x=clamp(q.x+(flank===ballSide?-21:-27),42,76);y=50+flank*24+(q.y-50)*.1;}

   const mix=clamp(t/.38,0,1);return {x:lerp(initial.x,x,mix),y:clamp(lerp(initial.y,y,mix),3,97)};
  });assign(p,points);
 }
}
// Screen-space facing follows a short continuous window of the player's path.
// The same foot point is used for carrying, releasing and receiving the ball.
function possessionPoint(scene,id,t){
 const p=scene.tracks.find(p=>p.team===scene.team&&p.i===id),at=sampleTrack(p.track,t),a=sampleTrack(p.track,clamp(t-.035,0,1)),b=sampleTrack(p.track,clamp(t+.035,0,1));
 const sx=(P.r-P.l)/100,sy=(P.b-P.t)/100,vx=(b.x-a.x)*sx,vy=(b.y-a.y)*sy,magnitude=Math.hypot(vx,vy),speed=magnitude>1e-6?magnitude:0;
 const upcoming=scene.legs.find(l=>l.from===id&&t<=l.release+.001),target=upcoming?.to!==undefined?sampleTrack(scene.tracks.find(p=>p.team===scene.team&&p.i===upcoming.to).track,upcoming.end):scene.goal;
 const tx=(target.x-at.x)*sx,ty=(target.y-at.y)*sy,n=Math.hypot(tx,ty)||1;
 // A backwards pass must not flip the carried ball through the player's body as he slows.
 const facingX=speed?vx/speed:scene.dir,facingY=speed?vy/speed:0,dot=(facingX*tx+facingY*ty)/n;
 const weight=Math.max(speed/(speed+1.2),speed?.75*clamp(-dot,0,1):0);
 let dx=(speed?vx/speed:scene.dir)*weight+(tx/n)*(1-weight),dy=(speed?vy/speed:0)*weight+(ty/n)*(1-weight),length=Math.hypot(dx,dy);
 if(length<.001){dx=scene.dir;dy=0;length=1;}
 return {x:at.x+dx/length*19/sx,y:at.y+dy/length*19/sy};
}

function sampleScene(scene,t){
 const jump=time=>scene.header!==null?Math.sin(Math.PI*clamp((time-.66)/.18,0,1))*8:0;
 const positions=scene.tracks.map(p=>({...p,...sampleTrack(p.track,t),jump:scene.contact?.type==='clearance'&&p.team===scene.contact.team&&p.i===scene.contact.id?Math.sin(Math.PI*clamp((t-.30)/.16,0,1))*6:p.team===scene.team&&p.i===scene.header?jump(t):scene.wall&&p.team!==scene.team&&[5,6,7].includes(p.i)?Math.sin(Math.PI*clamp((t-.57)/.13,0,1))*6:0}));
 if(scene.keeperReaction&&t>scene.keeperReaction.start){
  const reaction=scene.keeperReaction,f=clamp((t-reaction.start)/(reaction.end-reaction.start),0,1),u=f*f*(3-2*f),keeper=positions.find(p=>p.team!==scene.team&&p.i===0);
  Object.assign(keeper,mixPoint(reaction.at,reaction.to,u));
 }
 const actor=(id,time)=>possessionPoint(scene,id,time);
 const leg=scene.legs.find(l=>t<=l.end)||scene.legs.at(-1);let ball,height=0;
 if(t<=leg.release){ball=leg.origin?{...leg.origin}:actor(leg.from,t);if(leg.from===scene.header)height=jump(t);}
 else{
  const f=clamp((t-leg.release)/(leg.end-leg.release),0,1),a=leg.origin?{...leg.origin}:actor(leg.from,leg.release),b=leg.target?{...leg.target}:leg.to===undefined?scene.goal:actor(leg.to,leg.end);
  ball=mixPoint(a,b,f);
  if(leg.type==='cross'||leg.type==='lob'){height=Math.sin(Math.PI*f)*(leg.type==='lob'?38:28)+(leg.to===scene.header?f*jump(leg.end):0);ball.x+=scene.dir*Math.sin(Math.PI*f)*2;}
  if(leg.target&&leg.type==='cross'&&scene.contact?.type==='clearance')height+=f*scene.contact.height;
  if(leg.type==='rebound')height=(scene.contact?.height||0)*(1-f)+Math.sin(Math.PI*f)*8;
  if(leg.to===undefined&&(leg.type==='shot'||leg.type==='freekick'))height=scene.shotLift*f+(scene.shotLift?Math.sin(Math.PI*f)*6:0);
  if(leg.type==='chip')height=Math.sin(Math.PI*f)*36;
  if(leg.type==='freekick'){
   height=4*f*(1-f)*8+scene.shotLift*f;
   // A shallow quadratic arc distributes inside-foot curl over the entire flight.
   // Rotate a physical perpendicular to the shot line, including attacks toward the left goal.
   const dx=(b.x-a.x)*1.05,dy=(b.y-a.y)*.68,length=Math.hypot(dx,dy)||1,bend=4*f*(1-f)*scene.freeKickCurve;
   ball.x-=dy/length*bend/1.05;ball.y+=dx/length*bend/.68;
  }
  if(leg.type==='header')height=jump(leg.release)*(1-f)+Math.sin(Math.PI*f)*6;
  if(t>.84)ball=scene.goal;
 }
 return {positions,ball,height,leg:leg.type,delivery:leg.to!==undefined?leg:null};
}

function motionDuration(scene){
 let playerSpeed=0,ballSpeed=0,previous=sampleScene(scene,0);const steps=120;
 for(let i=1;i<=steps;i++){const next=sampleScene(scene,i/steps);
  next.positions.forEach((p,j)=>{const q=previous.positions[j];playerSpeed=Math.max(playerSpeed,Math.hypot((p.x-q.x)*1.05,(p.y-q.y)*.68)*steps);});
  ballSpeed=Math.max(ballSpeed,Math.hypot((next.ball.x-previous.ball.x)*1.05,(next.ball.y-previous.ball.y)*.68)*steps);previous=next;
 }
 return Math.ceil(Math.max(6.4,playerSpeed/9,ballSpeed/38)*1000);
}
// Speed up the build-up independently; the final ball flight retains its existing tempo.
function playbackTiming(scene){
 const base=scene.durationMs/1.25,release=scene.legs.at(-1).release,buildUpRate=1.25;
 return {durationMs:base*(release/buildUpRate+1-release),baseMs:base,release,buildUpRate};
}
function playbackProgress(scene,progress){
 const timing=playbackTiming(scene),elapsed=clamp(progress,0,1)*timing.durationMs,cut=timing.baseMs*timing.release/timing.buildUpRate;
 return clamp(elapsed<=cut?elapsed*timing.buildUpRate/timing.baseMs:timing.release+(elapsed-cut)/timing.baseMs,0,1);
}
function warm(){
 if(assetsPromise)return assetsPromise;
 assetsPromise=Promise.all(['pitch'].map(name=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{const done=im.decode?im.decode().catch(()=>{}):Promise.resolve();done.then(()=>resolve([name,im]));};im.onerror=reject;im.src=ASSET+name+'.webp?v=2';}))).then(list=>{assets=Object.fromEntries(list);return assets;}).catch(e=>{assetsPromise=null;throw e;});return assetsPromise;
}
const STYLE=`
.cr-live-match{overflow:hidden;border:1px solid var(--border-bright,#263341);border-radius:16px;background:#0c121a;color:var(--on-dark-header,#F0F2F7);text-align:left}
.cr-live-top{padding:14px 16px 10px}.cr-live-meta{display:flex;justify-content:space-between;gap:10px;font-size:11px;color:var(--gold,#C8A84B);font-weight:800;letter-spacing:.5px}.cr-live-score{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:9px}.cr-live-side{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:800}.cr-live-side img{width:22px!important;height:16px!important;object-fit:cover}.cr-live-score>strong{font-size:28px;white-space:nowrap;letter-spacing:2px;font-variant-numeric:tabular-nums}.cr-live-pitch{position:relative;aspect-ratio:3/2;overflow:hidden}.cr-live-pitch canvas{display:block;width:100%;height:100%;image-rendering:pixelated}.cr-live-banner{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;opacity:0;text-shadow:0 3px 0 #000,0 0 16px #000;transition:opacity .15s}.cr-live-banner.on{opacity:1}.cr-live-banner b{font-size:36px;color:var(--gold,#C8A84B);font-weight:900}.cr-live-banner.against b{color:#ef4444}.cr-live-banner small{font-size:12px;font-weight:700;color:#F0F2F7;margin-top:4px}.cr-live-progress{height:3px;background:#263341}.cr-live-progress i{display:block;width:100%;height:100%;background:var(--gold,#C8A84B);transform:scaleX(0);transform-origin:left}.cr-live-comment{padding:12px 14px;min-height:54px;display:flex;gap:9px;align-items:center;font-size:12px;line-height:1.6}.cr-live-comment>time{color:var(--gold,#C8A84B);font-weight:800;flex:none}.cr-live-actions{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:0 14px 12px;color:var(--on-dark-header-secondary,#b5bbc4);font-size:10px}.cr-live-actions>span{flex:1;min-width:0}.cr-live-actions button{flex:none;white-space:nowrap;border:1px solid var(--border-bright,#263341);background:none;color:var(--on-dark-header-secondary,#b5bbc4);border-radius:20px;padding:7px 12px;font:inherit;cursor:pointer}.cr-live-loading{position:absolute;inset:0;display:grid;place-items:center;background:#0c121a;color:var(--on-dark-header-secondary,#b5bbc4);font-size:12px}.cr-live-loading[hidden]{display:none}@media(prefers-reduced-motion:reduce){.cr-live-banner{transition:none}}
.cr-live-match{animation:crLiveIn 240ms ease both}.cr-live-banner.chance b{color:var(--on-dark-header,#F0F2F7)}
.cr-live-end{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:#0c121aeb;text-align:center;padding:12px;animation:crLiveIn 240ms ease both}.cr-live-end[hidden]{display:none}.cr-live-end>*{flex-shrink:0;max-width:100%}.cr-live-end .eyebrow{font-size:10px;line-height:1.3;letter-spacing:2px;color:var(--on-dark-header-secondary,#b5bbc4)}.cr-live-end .cr-live-verdict{font-size:clamp(28px,8vw,38px);line-height:1.1;font-weight:900;color:var(--gold,#C8A84B)}.cr-live-end[data-result="win"] .cr-live-verdict{color:#22C55E}.cr-live-end[data-result="loss"] .cr-live-verdict{color:#EF4444}.cr-live-end .final-score{font-size:clamp(24px,7vw,32px);line-height:1.1;font-weight:900;font-variant-numeric:tabular-nums}.cr-live-end .detail{font-size:11px;line-height:1.45;white-space:normal;color:var(--on-dark-header-secondary,#b5bbc4)}.cr-live-end button{border:1px solid var(--border-bright,#263341);border-radius:12px;background:var(--red-dark,#b50004);color:#fff;font:inherit;font-size:12px;font-weight:800;padding:10px 16px;cursor:pointer}
@keyframes crLiveIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@media(prefers-reduced-motion:reduce){.cr-live-match,.cr-live-end{animation:none}}
`;
function keeperColors(outfield){
 const rgb=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)),distance=(a,b)=>Math.hypot(...rgb(a).map((v,i)=>v-rgb(b)[i]));
 const palette=['#956ce4','#36bfae','#ef87b5','#65bded','#a6ce57'];
 let pair=[palette[0],palette[1]],best=-1;
 for(const a of palette)for(const b of palette){if(a===b)continue;const score=Math.min(distance(a,b),...outfield.flatMap(c=>[distance(a,c),distance(b,c)]));if(score>best){best=score;pair=[a,b];}}
 return pair;
}

function create(host,options={}){
 if(!document.getElementById('crLiveStyle')){const style=document.createElement('style');style.id='crLiveStyle';style.textContent=STYLE;document.head.append(style);}
 host.innerHTML='<section class="cr-live-match" aria-label="대표팀 경기 중계"><div class="cr-live-top"><div class="cr-live-meta"><span class="stage"></span><time class="clock">0′</time></div><div class="cr-live-score"><div class="cr-live-side">'+(options.ourFlag||'')+'<span>'+esc(options.ourName||'우리 대표팀')+'</span></div><strong class="scoreboard">0 : 0</strong><div class="cr-live-side"><span>'+esc(options.theirName||'상대 대표팀')+'</span>'+(options.theirFlag||'')+'</div></div></div><div class="cr-live-pitch"><canvas width="768" height="512" aria-label="선수와 공의 움직임을 보여주는 도트 중계"></canvas><div class="cr-live-banner" aria-live="polite"><b></b><small></small></div><div class="cr-live-loading">경기장 준비 중…</div></div><div class="cr-live-progress"><i></i></div><div class="cr-live-comment" aria-live="polite"><time>0′</time><span>킥오프를 준비합니다.</span></div><div class="cr-live-actions"><span>경기 하이라이트 · 내 선수는 금색 표시</span><button type="button">경기 건너뛰기</button></div></section>';
 const q=s=>host.querySelector(s),canvas=q('canvas'),ctx=canvas.getContext('2d');let live=null,raf=0,advanceTimer=0,disposed=false,pausedAt=null,tokens=new Map(),sceneIndex=-1,players=[],ballTrail=[];
 q('.cr-live-pitch').insertAdjacentHTML('beforeend','<div class="cr-live-end" hidden role="group" aria-label="경기 종료 결과" aria-live="polite"><span class="eyebrow"></span><strong class="cr-live-verdict"></strong><b class="final-score"></b><span class="detail"></span><button type="button"></button></div>');
 const role=playerRole(options),heroIndex=role.index;
 const kits=selectMatchKits(options.nation,options.opp),rgb=hexRGB;
 const goalkeepers=keeperColors(kits.flatMap(kitPalette));
 const baseNumbers=[1,2,3,4,5,6,8,7,11,9,10],ownNumbers=baseNumbers.slice();
 const number=Number(options.number)||baseNumbers[heroIndex],existing=ownNumbers.indexOf(number);if(existing>=0)ownNumbers[existing]=ownNumbers[heroIndex];ownNumbers[heroIndex]=number;
 function token(uniform,number){
  const kit=typeof uniform==='string'?{body:uniform}:uniform,key=[kit.body,number].join('|');if(tokens.has(key))return tokens.get(key);
  const c=document.createElement('canvas');c.width=c.height=32;const cx=c.getContext('2d'),soften=hex=>rgb(hex).map(v=>Math.round(v*.87+255*.13)),light=soften(kit.body),edge=light.map(v=>Math.round(v*.65));
  for(let y=0;y<32;y++)for(let x=0;x<32;x++){
   const d=Math.hypot(x-15.5,y-15.5);if(d>14)continue;
   const col=d>12.6?edge:light;cx.fillStyle='rgb('+col.join(',')+')';cx.fillRect(x,y,1,1);
  }
  cx.fillStyle='#fff4';cx.fillRect(8,6,7,2);cx.fillRect(6,8,2,4);cx.textAlign='center';cx.textBaseline='middle';cx.font='bold '+(number>9?16:19)+'px monospace';
  // Choose the clearer number colour against the actual softened token, including yellow/green shirts.
  const linear=light.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
  const luminance=linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
  cx.fillStyle=luminance>.179?'#111111':'#ffffff';
  cx.fillText(number,16,17);tokens.set(key,c);return c;
 }
 function world(x,y){return {x:lerp(P.l,P.r,x/100),y:lerp(P.t,P.b,y/100)};}
 function drawPlayer(p,hero){const pos=world(p.x,p.y);pos.y-=p.jump||0;const r=hero?16:15,num=p.team===0?ownNumbers[p.i]:baseNumbers[p.i];
  ctx.save();ctx.translate(Math.round(pos.x),Math.round(pos.y));ctx.fillStyle='#435a3d35';ctx.beginPath();ctx.ellipse(0,4+(p.jump||0),r,5,0,0,Math.PI*2);ctx.fill();if(hero){ctx.strokeStyle='#e5c76c';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,r+3,0,Math.PI*2);ctx.stroke();}
  ctx.drawImage(token(p.i===0?goalkeepers[p.team]:kits[p.team],num),-r,-r,r*2,r*2);ctx.restore();
  if(hero){ctx.save();ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#52634a';ctx.strokeText(options.player||'내 선수',pos.x,pos.y-r-8);ctx.fillStyle='#fff5c9';ctx.fillText(options.player||'내 선수',pos.x,pos.y-r-8);ctx.restore();}
 }

 function commentary(event,impact){
  const team=(event.team?options.theirName:options.ourName)||'대표팀',actor=event.personal==='goal'&&event.team===0?(options.player||'내 선수'):team;
  if(impact){
   if(event.kind==='save')return team+'의 슈팅! 골키퍼가 막아냅니다. 스코어는 그대로입니다.';
   if(event.kind==='miss')return team+'의 슈팅이 골문 옆으로 빗나갑니다. 득점 없이 경기가 이어집니다.';
   if(event.personal==='assist'&&event.team===0)return '골입니다! '+(options.player||'내 선수')+'의 패스를 받아 정확하게 마무리합니다!';
   return actor+', 골입니다! '+({counter:'빠른 역습이 골로 이어집니다!',wing:'올라온 크로스를 놓치지 않습니다!',cutback:'뒤로 내준 공에 달려들어 밀어 넣습니다!',through:'골키퍼와 맞선 찬스를 놓치지 않습니다!',combine:'동료와 주고받으며 수비를 뚫어냅니다!',longshot:'먼 거리에서 시원하게 골망을 흔듭니다!',switch:'반대편에서 올라온 크로스를 마무리합니다!',lowcross:'낮게 깔린 공에 발을 갖다 댑니다!',corner:'수비 사이에서 먼저 머리를 댑니다!',dribble:'직접 수비를 제치고 해결합니다!',chip:'골키퍼 위로 살짝 넘겨 넣습니다!',freekick:'감아 찬 공이 골망에 꽂힙니다!',shortcorner:'짧게 주고받은 뒤 머리로 마무리합니다!',halfspace:'수비 사이를 파고들어 깔끔하게 마무리합니다!',farcut:'반대편 공을 잡아 안쪽으로 들어온 뒤 마무리합니다!',rebound:'흘러나온 공을 끝까지 놓치지 않습니다!'}[event.pattern]);
  }
  const buildUp={wing:'측면에서 기회를 찾습니다. 바깥으로 동료가 올라옵니다!',cutback:'측면을 파고듭니다! 안쪽에서 동료가 기다리고 있습니다.',counter:'공을 빼앗았습니다! 빠르게 앞으로 나갑니다!',through:'수비 뒤에 공간이 있습니다. 침투하는 동료를 봅니다!',combine:'짧게 주고받습니다. 수비 사이로 파고드는데요!',longshot:'앞으로 연결합니다. 뒤에서 슈팅 기회를 엿봅니다!',switch:'반대편이 열렸습니다! 길게 넘겨줍니다!',lowcross:'측면으로 빠져나갑니다. 문전으로 동료가 들어갑니다!',corner:'코너킥입니다. 문전에서 자리를 다투고 있습니다!',dribble:'공을 잡고 직접 나갑니다. 수비가 붙습니다!',chip:'뒷공간을 노립니다. 골키퍼가 앞으로 나와 있는데요!',freekick:'프리킥 기회입니다. 키커가 골문을 바라봅니다.',shortcorner:'코너킥을 짧게 처리합니다. 올릴 공간을 찾습니다!',halfspace:'측면에서 폭을 벌립니다. 그 안쪽으로 동료가 파고듭니다!',farcut:'반대편으로 크게 넘깁니다. 공을 받을 준비를 합니다!',rebound:'문전으로 공을 올립니다. 흘러나올 공도 노리고 있습니다!'};
  if(event.pattern==='rebound')return team+', '+({'edge-first':'문전으로 공을 올립니다. 뒤쪽에서 기회를 엿봅니다!', 'edge-control':'문전에서 자리를 다툽니다. 박스 뒤에도 동료가 있습니다!',tap:'문전으로 올립니다! 골키퍼 앞에서 기회를 노립니다!',layoff:'문전으로 올립니다. 가까운 동료도 준비하고 있습니다!'}[live.scene.reboundStyle]);
  return team+', '+buildUp[event.pattern];
 }
 function paint(now){if(!live||live.ended||!assets||disposed)return;
  const elapsed=Math.max(0,now-live.start),found=live.ends.findIndex(end=>elapsed<end),index=found<0?live.plan.events.length-1:found,event=live.plan.events[index],progress=clamp((elapsed-(index?live.ends[index-1]:0))/live.durations[index],0,1),u=options.sceneMs?progress:playbackProgress(live.scenes[index],progress);
  if(index!==sceneIndex){sceneIndex=index;live.scene=live.scenes[index];ballTrail=[];q('.cr-live-banner').classList.remove('on');q('.cr-live-comment span').textContent=commentary(event,false);options.onScene?.(event);}
  const sampled=sampleScene(live.scene,u);players=sampled.positions;
  ctx.imageSmoothingEnabled=false;ctx.drawImage(assets.pitch,0,0,W,H);
  // Hide temporal cuts under a short replay dissolve; actor positions never snap inside a scene.
  const opacity=Math.min(clamp(u/.065,0,1),index===live.plan.events.length-1?1:clamp((1-u)/.055,0,1));ctx.save();ctx.globalAlpha=opacity;
  const hero=live.plan.played?players.find(p=>p.team===0&&p.i===heroIndex):null;
  players.slice().sort((a,b)=>a.y-b.y).forEach(player=>drawPlayer(player,player===hero));
  const ball=world(sampled.ball.x,sampled.ball.y),height=sampled.height;

  if(height>0&&sampled.delivery){ctx.strokeStyle='#efde9c88';ctx.setLineDash([3,4]);ctx.lineWidth=1;const leg=sampled.delivery,receiver=live.scene.tracks.find(p=>p.team===event.team&&p.i===leg.to),land=sampleTrack(receiver.track,leg.end),v=world(land.x,land.y);ctx.beginPath();ctx.ellipse(v.x,v.y,9,5,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
  ballTrail.push({x:ball.x,y:ball.y-height});if(ballTrail.length>7)ballTrail.shift();ctx.strokeStyle=height?'#fff5b899':'#eef2e955';ctx.lineWidth=height?2:1;ctx.beginPath();ballTrail.forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));ctx.stroke();ctx.fillStyle='#0005';ctx.beginPath();ctx.ellipse(ball.x,ball.y+2,3+height*.06,1.5+height*.025,0,0,Math.PI*2);ctx.fill();const size=3+height*.035;ctx.fillStyle='#f4f4e8';ctx.fillRect(Math.round(ball.x)-size,Math.round(ball.y-height)-size,size*2,size*2);ctx.fillStyle='#26313d';ctx.fillRect(Math.round(ball.x)-1,Math.round(ball.y-height)-1,2,2);ctx.restore();
  if(opacity<1){ctx.fillStyle='rgba(9,16,25,'+(1-opacity)+')';ctx.fillRect(0,0,W,H);ctx.fillStyle='#dfc574';ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.fillText('경기 하이라이트 · '+event.minute+'′',W/2,H/2);}
  const through=u>=.84?index:index-1;
  for(let j=(live.appliedIndex??-1)+1;j<=through;j++){
   const completed=live.plan.events[j];live.appliedIndex=j;live.score={...completed.score};q('.scoreboard').textContent=completed.score.our+' : '+completed.score.their;options.onEvent?.(completed);
   if(j===index){q('.cr-live-comment span').textContent=commentary(completed,true);const banner=q('.cr-live-banner'),goal=completed.kind==='goal';banner.classList.add('on');banner.classList.toggle('against',goal&&completed.team===1);banner.classList.toggle('chance',!goal);banner.querySelector('b').textContent=goal?(completed.team?'실점':'GOAL!'):completed.kind==='save'?'선방!':'빗나간 슈팅';banner.querySelector('small').textContent=!goal?'득점 없이 경기가 이어집니다':completed.personal==='goal'?(options.player||'내 선수')+' 득점':completed.personal==='assist'?(options.player||'내 선수')+' 도움':completed.team?options.theirName+' 득점':options.ourName+' 득점';}
  }
  q('.clock').textContent=event.minute+'′';q('.cr-live-comment time').textContent=event.minute+'′';q('.cr-live-progress i').style.transform='scaleX('+clamp(elapsed/live.totalMs,0,1)+')';
  if(elapsed>=live.totalMs)return finish();raf=requestAnimationFrame(paint);
 }
 function advance(){clearTimeout(advanceTimer);if(!live?.ended)return;const current=live;live=null;current.resolve({cancelled:false,plan:current.plan});}
 function finish(advanceImmediately=false){
  if(!live)return;if(live.ended){if(advanceImmediately)advance();return;}cancelAnimationFrame(raf);const current=live;
  for(let j=(current.appliedIndex??-1)+1;j<current.plan.events.length;j++){current.appliedIndex=j;options.onEvent?.(current.plan.events[j]);}
  current.ended=true;q('.cr-live-loading').hidden=true;const pending=!!current.match.pk?.pending,won=current.match.pk&&!pending?current.match.pk.won:current.plan.our>current.plan.their,lost=current.match.pk&&!pending?!current.match.pk.won:current.plan.our<current.plan.their;
  const label=pending?'무승부':won?'승리':lost?'패배':'무승부',detail=pending?'연장전까지 승부를 가리지 못했습니다. 승부차기를 준비합니다.':current.match.pk?'승부차기 '+current.match.pk.our+' – '+current.match.pk.their:options.nextStage?options.nextStage+' 경기로 이어집니다.':'대회 결과로 이어집니다.';
  q('.stage').textContent=current.match.stage+' · 경기 종료';q('.clock').textContent=current.plan.end+'′';q('.scoreboard').textContent=current.plan.our+' : '+current.plan.their;q('.cr-live-progress i').style.transform='scaleX(1)';q('.cr-live-banner').classList.remove('on');q('.cr-live-comment time').textContent=current.plan.end+'′';q('.cr-live-comment span').textContent='경기 종료 · '+label;
  const end=q('.cr-live-end');end.dataset.result=pending?'pending':won?'win':lost?'loss':'draw';end.querySelector('.eyebrow').textContent=(current.plan.end===120?'AFTER EXTRA TIME':'FULL TIME')+' · '+current.match.stage;end.querySelector('.cr-live-verdict').textContent=label;end.querySelector('.final-score').textContent=current.plan.our+' – '+current.plan.their;end.querySelector('.detail').textContent=detail;end.querySelector('button').textContent='승부차기 진행';end.querySelector('button').hidden=!pending;end.hidden=false;q('.cr-live-actions button').hidden=true;
  if(advanceImmediately)advance();else if(!pending)advanceTimer=setTimeout(advance,1800);
 }
 function cancel(){cancelAnimationFrame(raf);clearTimeout(advanceTimer);if(live){const current=live;live=null;current.resolve({cancelled:true});}}
 async function play(match,context={}){cancel();if(disposed)return {cancelled:true};const request={match,context,plan:highlights(match,{...options,...context,role:role.name})};let resolve;const result=new Promise(r=>resolve=r);if(options.previewReboundStyle)request.plan.events.forEach(e=>e.reboundStyle=options.previewReboundStyle);if(PATTERNS.includes(options.previewPattern))request.plan.events.forEach(e=>{const allowed=e.team===0&&e.personal==='goal'?finishOptions(role):null,assists=e.team===0&&e.personal==='assist'?assistOptions(role):null;if((!assists||assists.includes(options.previewPattern))&&(!allowed||allowed.some(p=>p.pattern===options.previewPattern))&&(options.previewPattern!=='farcut'||e.team!==0||e.personal!=='goal'||['풀백','윙백','윙어','인사이드 포워드'].includes(role.name)))e.pattern=options.previewPattern;});request.resolve=resolve;live=request;sceneIndex=-1;q('.stage').textContent=match.stage+' · 경기 하이라이트';q('.scoreboard').textContent='0 : 0';q('.cr-live-loading').hidden=false;
  try{await warm();}catch(e){if(live===request){q('.cr-live-loading').textContent='경기장 로딩 실패 · 기록으로 진행합니다.';finish();}return result;}
  if(live!==request||disposed||request.ended)return result;q('.cr-live-loading').hidden=true;q('.cr-live-end').hidden=true;q('.cr-live-actions button').hidden=false;q('.stage').textContent=match.stage+' · 경기 하이라이트';
  if(options.skip||matchMedia('(prefers-reduced-motion: reduce)').matches){finish(true);return result;}request.scenes=request.plan.events.map(e=>choreography(e,{heroIndex,role}));request.durations=request.scenes.map(s=>options.sceneMs||playbackTiming(s).durationMs);request.totalMs=0;request.ends=request.durations.map(ms=>request.totalMs+=ms);request.start=performance.now();request.last=request.start;pausedAt=document.hidden?request.start:null;if(!document.hidden)raf=requestAnimationFrame(paint);return result;
 }
 const visibility=()=>{if(document.hidden){pausedAt=performance.now();cancelAnimationFrame(raf);}else if(pausedAt!==null&&live?.start&&!live.ended){live.start+=performance.now()-pausedAt;live.last=performance.now();pausedAt=null;raf=requestAnimationFrame(paint);}};document.addEventListener('visibilitychange',visibility);
 q('.cr-live-actions button').onclick=e=>{e.stopPropagation();finish();};host.onclick=e=>e.stopPropagation();
 q('.cr-live-end button').onclick=e=>{e.stopPropagation();advance();};
 return {play,skip:()=>finish(true),cancel,destroy(){disposed=true;cancel();document.removeEventListener('visibilitychange',visibility);host.replaceChildren();},get state(){return live?{running:!live.ended,finished:!!live.ended,kits,event:sceneIndex,score:live.ended?{our:live.plan.our,their:live.plan.their}:live.score||{our:0,their:0},plan:live.plan,scene:live.scenes?.[sceneIndex],durationMs:live.durations?.[sceneIndex]}: {running:false};}};
}
root.CareerMatchReplay={patterns:PATTERNS,nationalKits:NATIONAL_KITS,kitColoursClash,selectMatchKits,playerRole,finishOptions,assistOptions,keeperColors,possessionPoint,playbackTiming,playbackProgress,highlights,choreography,sampleScene,warm,create};
})(globalThis);
