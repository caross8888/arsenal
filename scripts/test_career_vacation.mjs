import assert from 'node:assert/strict';
import * as S from '../arsenal-dashboard/api/_career_sim.js';
import * as R from '../arsenal-dashboard/api/_career_relationship.js';
import * as T from '../arsenal-dashboard/api/_career_relationship_travel.js';
import {tokenCodec} from '../arsenal-dashboard/api/_token.js';
const input={name:'여행테스트',nation:'ENG',pos:'FW',card:0,foot:'오른발',body:'표준',num:9};
function make(nation='ENG',remote=false){
 const c=S.createCareer({...input,nation},0,8);Object.assign(c,{age:24,phase:'result',hist:[{age:24,youth:false,apps:25}],offers:[],traitOffer:null});
 c.relationship=R.createRelationship(nation);Object.assign(c.relationship,{status:'dating',affinity:80,datingAge:20,introDone:true});
 c.club=S.clubByName(remote?(nation==='ENG'?'플라멩구':'아스날'):(nation==='ENG'?'아스날':nation==='BRA'?'플라멩구':nation==='KOR'?'울산 현대':c.club.n));return c;
}
const voices=new Set();
for(const nation of ['KOR','BRA','NGA','ENG'])for(const remote of [false,true])for(const destination of [0,1]){
 const c=make(nation,remote),before=structuredClone(c),plan=T.vacationEvent(c);assert(plan);voices.add(plan.d.split('\n우리 이동편')[0]);assert.equal(plan.id,'friend:vacation-plan');assert.equal(plan.a.length,3);
 assert.throws(()=>T.completeVacation(c,3));assert.throws(()=>T.completeVacation(c,'0'));T.completeVacation(c,destination);assert.equal(c.relationship.affinity,80,'planning is not completing a trip');assert(T.vacationPending(c));assert.throws(()=>S.nextSeason(c,null,0),/휴가/);
 const restored=structuredClone(c),trip=T.vacationEvent(restored);assert.equal(trip.wardrobe,destination?'ski':'beach');assert.equal(trip.channel,'story');assert(!trip.remote);assert.equal(trip.friend.longDistance,R.isDistant(c));assert.equal(trip.a.length,1);assert(trip.script.story.length>=15);assert.deepEqual([...new Set(trip.script.story.map(line=>line[5]).filter(Boolean))],[destination?'lodge':'sunset']);assert(trip.script.story.slice(-3).every(line=>line[4]==='message'),'return-home contact uses the phone');
 for(const pick of [0,1]){const branch=structuredClone(restored);T.completeVacation(branch,pick);assert.equal(branch.relationship.affinity,86);assert.equal(branch.relationship.residence,before.relationship.residence);assert.equal(branch.relationship.status,'dating');assert(!T.vacationPending(branch));assert.equal(T.vacationEvent(branch),null);assert.throws(()=>T.completeVacation(branch,pick));assert.deepEqual(branch.hist,before.hist);assert.deepEqual(branch.st,before.st);assert.deepEqual(branch.tot,before.tot);assert.deepEqual(branch.offers,before.offers);branch.age+=2;assert.equal(T.vacationEvent(branch),null);branch.age++;const remaining=T.vacationEvent(branch);assert.deepEqual(remaining.destinations,[destination?'beach':'ski',null]);assert.equal(remaining.a.length,2);T.completeVacation(branch,0);assert.equal(branch.relationship.vacation.destination,destination?'beach':'ski');T.completeVacation(branch,1);branch.age+=3;assert.equal(T.vacationEvent(branch),null,'both travel events finish after one occurrence each');}
 const skip=structuredClone(before);T.completeVacation(skip,2);assert.equal(skip.relationship.affinity,80);assert(!skip.relationship.vacation);assert.equal(T.vacationEvent(skip),null);
}
assert.equal(voices.size,4);
for(const override of [{age:17},{phase:'prep'},{phase:'injury'},{phase:'penalty'},{phase:'retired'},{forced:true},{bodyOut:true},{age:40}])assert.equal(T.vacationEvent(Object.assign(make(),override)),null);
for(const status of ['friend','close','separated']){const c=make();c.relationship.status=status;assert.equal(T.vacationEvent(c),null);}
const legacy=make();legacy.relationship.lastVacation={age:20,destination:'beach',pick:0};assert.deepEqual(T.vacationEvent(legacy).destinations,['ski',null]);T.completeVacation(legacy,1);assert.equal(legacy.relationship.affinity,80);assert.deepEqual(legacy.relationship.vacationsDone,['beach']);legacy.age+=3;assert.deepEqual(T.vacationEvent(legacy).destinations,['ski',null],'declining the remaining destination never erases completed trips');
const both=make();both.relationship.vacationsDone=['beach','ski'];assert.equal(T.vacationEvent(both),null);
const old=make();delete old.relationship;assert.equal(T.vacationEvent(old),null);
const debut=make();debut.relationship.pendingDebut=true;assert.equal(T.vacationEvent(debut),null);
const soldier=make('KOR');soldier.military={status:'regular',left:18,home:{...soldier.club}};assert.equal(T.vacationEvent(soldier),null);
const injury=make();injury.hist[0].injured=true;T.completeVacation(injury,1);assert(T.vacationEvent(injury).script.story.some(line=>line[1].includes('무리해서 타지 않고')));
const spouse=make();spouse.relationship.status='married';spouse.relationship.affinity=99;T.completeVacation(spouse,0);T.completeVacation(spouse,0);assert.equal(spouse.relationship.affinity,100);assert.equal(spouse.relationship.status,'married');
console.log('PASS four voices × domestic/long-distance × beach/ski × linear story/cutscene; adult couple eligibility, once per destination and legacy migration, cooldown/decline, saved plan/arrival/return messages, residence and football invariants, service/injury handling');
process.env.WHOAMI_SECRET='vacation-test-only';const codec=tokenCodec('career-token-v1',{zip:true});const {default:handler}=await import('../arsenal-dashboard/api/career.js');
async function api(a,body){let status=200,data;await handler({method:'POST',query:{a},body,headers:{}},{setHeader(){},status(n){status=n;return this;},json(v){data=v;}});return {status,data};}
// Use a real completed season for API response/football data, not synthetic result rows.
const c=S.createCareer(input,0,8);Object.assign(c,{age:30,lv:3,proAt:18,ovr:78,peak:78,st:Array(5).fill(78),ev:'coach'});Object.assign(c.relationship,{introDone:true,status:'dating',affinity:80,datingAge:21,prepAge:30});S.playSeason(c,{train:'균형',evPick:0,injPick:1});if(c.relationship.pendingDebut)R.applyRelationship(c,'friend:debut',1);c.forced=false;const original=codec.seal(c),affinity=c.relationship.affinity;
assert.equal((await api('friend-vacation',{token:original,pick:99})).status,400);
const planned=await api('friend-vacation',{token:original,pick:1});assert.equal(planned.status,200);assert.equal(planned.data.friendVacation.id,'friend:vacation-trip');assert.equal(planned.data.player.relationship.affinity,affinity);
assert.deepEqual((await api('view',{token:planned.data.token})).data,planned.data);
assert.equal((await api('next',{token:planned.data.token,trait:0})).status,400);assert.equal((await api('retire',{token:planned.data.token})).status,400);
const done=await api('friend-vacation',{token:planned.data.token,pick:1});assert.equal(done.status,200);assert.equal(done.data.friendVacation,null);assert.equal(done.data.player.relationship.affinity,Math.min(100,affinity+6));assert.deepEqual(codec.open(done.data.token).tot,c.tot);assert.equal((await api('friend-vacation',{token:done.data.token,pick:0})).status,400);
const persisted=codec.open(done.data.token);persisted.age+=3;const remainingView=await api('view',{token:codec.seal(persisted)});assert.deepEqual(remainingView.data.friendVacation.destinations,['beach',null]);const postponeRemaining=await api('friend-vacation',{token:remainingView.data.token,pick:1});assert.equal(postponeRemaining.status,200);assert.deepEqual(codec.open(postponeRemaining.data.token).relationship.vacationsDone,['ski']);assert.equal(postponeRemaining.data.player.relationship.affinity,Math.min(100,affinity+6));
const skipped=await api('friend-vacation',{token:original,pick:2});assert.equal(skipped.status,200);assert.equal(skipped.data.friendVacation,null);assert.equal(skipped.data.player.relationship.affinity,affinity);
const prep=structuredClone(c);prep.phase='prep';assert.equal((await api('friend-vacation',{token:codec.seal(prep),pick:0})).status,400);
console.log('PASS signed API: result-only plan → saved trip → completion, reload, next/retire pending-trip guards, invalid/repeated choices, neutral skip and unchanged football records');
