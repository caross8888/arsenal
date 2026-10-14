import assert from 'node:assert/strict';
import {penaltyPowerProfile,penaltyKickKind} from '../arsenal-dashboard/public/career/penalty-rules.js';
import crypto from 'node:crypto';
import * as S from '../arsenal-dashboard/api/_career_sim.js';
import {kickVerdict,shootoutFor} from '../arsenal-dashboard/api/_career_shootout.js';
const input={name:'김도윤',nation:'ENG',pos:'FW',card:0,foot:'오른발',body:'표준',num:10};
function fixture(seed,age=18,nation='ENG'){const c=S.createCareer({...input,nation},0,seed);Object.assign(c,{age,lv:3,club:S.clubByName('아스날'),ovr:90,peak:90,st:Array(5).fill(90),awoken:true,proAt:18,cEnd:35,ev:'coach'});return c;}
const choice={train:'균형',evPick:0,injPick:1};
function run(base,decisions={}){const c=structuredClone(base);c.penaltyMode=true;c.penaltyDecisions=decisions;const r=S.playSeason(c,choice);return {c,row:r.row};}
function pending(row){for(const w of row.national||[])for(const m of w.matches)if(m.pk?.pending)return {w,m,key:m.pk.key};return null;}
function finish(base,firstInput,firstKey){const decisions=firstKey?{[firstKey]:firstInput}:{};let r;for(let i=0;i<15;i++){r=run(base,decisions);const p=pending(r.row);if(!p)return r;decisions[p.key]={x:.25,y:.5,power:68};}throw Error('Unfinished shootouts');}
let success=0;for(let seed=1;seed<=10000;seed++)success+=+kickVerdict(seed,'test',{x:.25,y:.5,power:68}).scored;assert(success>7800&&success<8200);
for(const bad of [{x:NaN,y:.5,power:68},{x:-.1,y:.5,power:68},{x:.5,y:1.1,power:68},{x:.5,y:.5,power:101}])assert.throws(()=>kickVerdict(1,'test',bad));
assert.equal(kickVerdict(1,'test',{x:.5,y:.5,power:0}).kind,'weak');assert(['post','wide'].includes(kickVerdict(1,'test',{x:.5,y:.5,power:100}).kind));
for(const x of [0,.25,.5,.75,1])for(const y of [0,.2,.5,.8,1]){
 const input={x,y,power:68},center=penaltyPowerProfile(input).center;
 assert.equal(penaltyPowerProfile({...input,power:center}).chance,.8);
 let previous=0;
 for(let power=0;power<=center;power+=.25){const chance=penaltyPowerProfile({...input,power}).chance;assert(chance>=previous&&chance<=.8);previous=chance;}
 previous=.8;
 for(let power=center;power<=100;power+=.25){const chance=penaltyPowerProfile({...input,power}).chance;assert(chance<=previous&&chance>=0);previous=chance;}
 for(const boundary of [55,60,78,82])assert(Math.abs(penaltyPowerProfile({...input,power:boundary-.001}).chance-penaltyPowerProfile({...input,power:boundary+.001}).chance)<.001,'no success jumps at old boundaries');
 for(const power of [0,35,55,center,82,95,100]){
  const actual=kickVerdict(120,'shared',{x,y,power});assert.equal(actual.chance,penaltyPowerProfile({x,y,power}).chance);
 }
}
for(const power of [30,55,68,82,95]){
 let count=0;for(let seed=1;seed<=10000;seed++)count+=+kickVerdict(seed,'curve',{x:.25,y:.5,power}).scored;
 assert(Math.abs(count/10000-penaltyPowerProfile({x:.25,y:.5,power}).chance)<.02,'observed success follows displayed curve');
}
assert(penaltyPowerProfile({x:.25,y:.1,power:55}).chance<penaltyPowerProfile({x:.25,y:.8,power:55}).chance,'high targets demand greater power accuracy');
assert(penaltyPowerProfile({x:0,y:.5,power:55}).chance<penaltyPowerProfile({x:.5,y:.5,power:55}).chance,'corners demand greater power accuracy');
for(const [power,rolls,expected] of [[68,[.9,.1],'save'],[0,[.9,.1],'weak'],[100,[.9,.1,.2],'post'],[100,[.9,.1,.8],'wide']])assert.equal(penaltyKickKind({x:.25,y:.5,power},()=>rolls.shift()),expected);
console.log('PASS continuous power curve, 80% peak, server/display agreement, empirical probabilities, five verdict paths and input validation');
let flips=0,medalFlips=0,apiBase;
for(const [nation,age] of [['ENG',18],['KOR',22],['KOR',20]])for(let seed=1;seed<=400;seed++){
 const base=fixture(seed,age,nation),start=run(base),p=pending(start.row);if(!p)continue;
 if(!apiBase&&nation==='ENG'){const check=structuredClone(base);if(!S.playSeason(check,{train:'균형',evPick:0}).injury)apiBase=base;}
 const win=finish(base,{x:.25,y:.5,power:68},p.key),miss=finish(base,{x:.25,y:.5,power:0},p.key);
 for(const {c,row} of [win,miss]){
  assert.equal(c.hist.length,1);assert(!pending(row));assert.equal(row.apps,start.row.apps);assert.equal(row.goals,start.row.goals);assert.equal(row.ovr,start.row.ovr);
  const current=row.national.find(w=>w.id===p.w.id);assert.deepEqual(current.matches.slice(0,current.matches.findIndex(m=>m.stage===p.m.stage)),p.w.matches.slice(0,p.w.matches.findIndex(m=>m.stage===p.m.stage)));
  const senior=(row.national||[]).filter(w=>w.kind==='senior').flatMap(w=>w.matches);assert.equal(senior.filter(m=>m.played).length,row.caps);
  for(const [key,tot] of [['g','cg'],['a','ca'],['cs','ccs']])assert.equal(senior.reduce((n,m)=>n+(m.played?m[key]:0),0),c.tot[tot]||0);
  for(const w of row.national||[])if(w.bracket){assert.equal(w.bracket.winner===nation,w.won);for(const round of w.bracket.rounds)for(const tie of round.matches){assert([tie.a,tie.b].includes(tie.winner));if(tie.pk)assert.equal(tie.winner===nation,tie.pk.won);}
   w.bracket.rounds.forEach((round,i)=>{if(i)round.matches.forEach((m,j)=>assert.deepEqual([m.a,m.b],w.bracket.rounds[i-1].matches.slice(j*2,j*2+2).map(m=>m.winner)));});
   if(w.kind==='senior')assert.equal(w.won,row.hon.some(h=>h.n===w.name+' 우승'));
   else{assert.equal(w.place,row.international.place);assert.equal(w.medal,row.international.medal);assert.equal(c.military.status==='arts',w.name==='아시안게임'?w.place===1:w.place<=3);assert.equal(w.matches.filter(m=>m.played).length,c.tot.uCaps||0);}
  }
  assert(senior.every(m=>m.g+m.a<=m.our&&(!m.cs||m.their===0)));
 }
 const outcomes=r=>r.national.map(w=>[w.id,w.outcome,w.matches.map(m=>m.stage)]);if(JSON.stringify(outcomes(win.row))!==JSON.stringify(outcomes(miss.row)))flips++;
 if(win.c.military?.status!==miss.c.military?.status)medalFlips++;
}
assert(flips>20);assert(medalFlips>0);console.log('PASS shootout outcomes change progression and military qualification, records/club growth consistent', {flips,medalFlips});
process.env.WHOAMI_SECRET=crypto.randomBytes(32).toString('hex');
const {default:handler}=await import('../arsenal-dashboard/api/career.js');const {tokenCodec}=await import('../arsenal-dashboard/api/_token.js');const codec=tokenCodec('career-token-v1',{zip:true});
async function api(a,body){let status=200,data;await handler({method:'POST',query:{a},headers:{},body},{setHeader(){},status(s){status=s;return this;},json(d){data=d;return this;}});return {status,data};}
let r=await api('season',{token:codec.seal(apiBase),train:'균형',evPick:0});assert.equal(r.status,200);assert.equal(r.data.phase,'penalty');
let v=r.data;const saved=await api('view',{token:v.token});assert.deepEqual(saved.data,v);assert(!v.result);assert(!v.preview.hon);assert(!v.player.hist.length);
assert.equal((await api('next',{token:v.token})).status,400);assert.equal((await api('retire',{token:v.token})).status,400);
assert.equal((await api('penalty',{token:v.token,key:'wrong',x:.25,y:.5,power:68})).status,400);
assert.equal((await api('penalty',{token:v.token,key:v.shootout.key,x:2,y:.5,power:68})).status,400);
assert.equal((await api('penalty',{token:v.token,key:v.shootout.key,auto:true})).status,400);
const token=v.token;const one=await api('penalty',{token,key:v.shootout.key,x:.25,y:.5,power:68}),again=await api('penalty',{token,key:v.shootout.key,x:.25,y:.5,power:68});assert.deepEqual(one.data.penaltyResult,again.data.penaltyResult);v=one.data;
for(let i=0;v.phase==='penalty'&&i<15;i++){const out=await api('penalty',{token:v.token,key:v.shootout.key,x:.25,y:.5,power:68});assert.equal(out.status,200);v=out.data;}
assert.equal(v.phase,'result');assert.equal(v.player.hist.length,1);assert.equal((await api('penalty',{token:v.token,key:'finished',x:.25,y:.5,power:68})).status,400);
console.log('PASS encrypted pending save/resume, phase guards, input rejection, deterministic retry, single season finalization');
let injuryPending;
for(let seed=1;seed<=300&&!injuryPending;seed++){
 const c=fixture(seed),first=await api('season',{token:codec.seal(c),train:'균형',evPick:0});if(first.data.phase!=='injury')continue;
 assert(first.data.pre.national.every(w=>!w.knockout));const second=await api('season',{token:first.data.token,injPick:1});if(second.data.phase==='penalty')injuryPending=second.data;
}
assert(injuryPending);
while(injuryPending.phase==='penalty'){const r=await api('penalty',{token:injuryPending.token,key:injuryPending.shootout.key,x:.25,y:.5,power:68});assert.equal(r.status,200);injuryPending=r.data;}
assert.equal(injuryPending.phase,'result');assert.equal(injuryPending.player.hist.length,1);assert(injuryPending.result.row.injured>0);
console.log('PASS injury decision precedes shootouts; one final injury season, no premature tournament playback');
