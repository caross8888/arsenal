import assert from 'node:assert/strict';
import * as R from '../arsenal-dashboard/api/_career_relationship.js';
import {PROFILES} from '../arsenal-dashboard/api/_career_relationship_dialogue.js';
import * as S from '../arsenal-dashboard/api/_career_sim.js';
import {tokenCodec} from '../arsenal-dashboard/api/_token.js';
const input={name:'관계테스트',nation:'ENG',pos:'FW',card:0,foot:'오른발',body:'표준',num:9};
const make=(nation='ENG',age=21)=>{const c=S.createCareer({...input,nation},0,8);c.age=age;c.ev='coach';c.relationship.introDone=true;return c;};
function choose(c,pick=0){let ev=S.relationshipPrepView(c);assert(ev.intro||ev.event);if(ev.event?.id==='friend:visit'){S.completeRelationshipPrep(c,0);ev=S.relationshipPrepView(c);}S.completeRelationshipPrep(c,pick);return ev.intro||ev.event;}
function nextYear(c){c.age++;c.phase='prep';}
const regions={KOR:'asia',JPN:'asia',BRA:'south',ARG:'south',NGA:'africa',ENG:'europe',USA:'europe'};
for(const [nation,region] of Object.entries(regions))assert.equal(R.createRelationship(nation).region,region);
assert.equal(R.createRelationship('JPN').name,'유이');assert.equal(R.relationshipView({}),null);
const voices=new Set(),goals=new Set();
for(const nation of ['KOR','BRA','NGA','ENG']){
 const c=make(nation,15);c.relationship.introDone=false;
 const home=R.introEvent(c);voices.add(home.d);goals.add(home.friend.goal);assert.equal(home.friend.affinity,40);
 c.club=S.clubByName(nation==='ENG'?'플라멩구':'아스날');
 const away=R.introEvent(c);assert.notEqual(away.d,home.d);assert.equal(away.friend.homeNation,nation);assert(away.friend.longDistance);
 c.age=22;c.relationship.introDone=true;const contact=R.routineEvent(c);assert(contact.meeting&&contact.remote&&contact.meeting.remote===false,'remote dates need a travel invitation and arrival before a physical scene');assert.match(contact.d,/가려고|가고 싶어|갈 수 있는|보러 가고/);assert.match(contact.meeting.lines[0][1],/일정.*방문|방문.*날짜/);
}
assert.equal(voices.size,4);assert.equal(goals.size,4);
let abroadChecked=false;
for(let seed=1;seed<=200&&!abroadChecked;seed++){
 const list=S.firstClubs('KOR','FW',0,seed),index=list.findIndex(x=>x.kind==='해외');if(index<0)continue;
 const c=S.createCareer({...input,nation:'KOR'},index,seed);assert.equal(c.relationship.region,'asia');assert(R.introEvent(c).friend.longDistance);assert.match(R.introEvent(c).d,/도착|숙소/);abroadChecked=true;
}
assert(abroadChecked);console.log('PASS four distinct profiles/voices/goals; domestic/foreign youth starts, fixed hometown identity and distance-safe routines');

for(const [status,old,min] of [['friend',0,40],['dating',2,65],['married',3,85]]){
 const c=make();c.relationship={version:3,region:'europe',name:'에밀리',status,affinity:old,done:['debut'],prepAge:21};
 R.ensureRelationship(c);assert(c.relationship.affinity>=min);const saved=structuredClone(c.relationship);R.ensureRelationship(c);assert.deepEqual(c.relationship,saved);assert.equal(c.relationship.prepAge,21);
}
for(const key of ['confession','proposal']){
 const c=make('ENG',key==='confession'?23:28);c.ev='friend:'+key;c.relationship={version:3,region:'europe',name:'에밀리',status:key==='proposal'?'dating':'close',affinity:2,done:['debut','outing'],lastAge:21};
 const prep=S.relationshipPrepView(c);assert(prep.event);choose(c,0);assert(!c.ev.startsWith('friend:'),'old ineligible prep events must not trap the save');
 const pending=make('ENG',28);pending.phase='injury';pending.ev='friend:'+key;pending.relationship={version:3,region:'europe',name:'에밀리',status:key==='proposal'?'dating':'close',affinity:2,done:['debut','outing'],lastAge:21};
 R.ensureRelationship(pending);R.applyRelationship(pending,pending.ev,0);assert.equal(pending.relationship.status,key==='proposal'?'married':'dating');assert(!pending.relationship.legacyPendingChoice);
}
const ex=make('ENG',22);ex.relationship.status='separated';R.prepareDebut(ex,{youth:false,apps:1});assert(!ex.relationship.pendingDebut,'an ex never appears for a later first senior match');
const soldier=make('KOR',27);soldier.military={status:'regular',left:18,home:{...soldier.club}};Object.assign(soldier.relationship,{status:'dating',datingAge:22,affinity:80,unresolved:2,lastAge:24});
assert.equal(S.relationshipPrepView(soldier).event.channel,'call');assert(S.relationshipPrepView(soldier).event.remote);
const points=make('ENG',16);assert.equal(points.relationship.affinity,40);choose(points,0);assert.equal(points.relationship.affinity,46,'meaningful meeting +6');
nextYear(points);const beforeDecline=points.relationship.affinity;choose(points,1);assert.equal(points.relationship.affinity,beforeDecline,'polite refusal is neutral');
const ceiling=make('ENG',20);ceiling.relationship.affinity=99;choose(ceiling,0);assert.equal(ceiling.relationship.affinity,100);
const floor=make('ENG',18);floor.relationship.affinity=2;const negative=choose(floor,1);assert(negative.goalTopic);assert.equal(floor.relationship.affinity,0);
const consent=make('ENG',17);consent.relationship.affinity=100;assert.notEqual(R.dueRelationship(consent),'confession');nextYear(consent);assert.equal(R.dueRelationship(consent),'confession');choose(consent,1);assert.notEqual(consent.relationship.status,'dating');nextYear(consent);assert.notEqual(R.dueRelationship(consent),'confession','declining confession cannot auto-date/repeat next year');
const pair=make('ENG',21);pair.relationship.affinity=65;choose(pair,0);assert.equal(pair.relationship.status,'dating');assert.equal(pair.relationship.datingAge,21);
pair.age=22;pair.relationship.affinity=100;pair.relationship.futureAgreement=true;assert.notEqual(R.dueRelationship(pair),'proposal','minimum two years dating');
pair.age=23;pair.relationship.affinity=84;assert.notEqual(R.dueRelationship(pair),'proposal');pair.relationship.affinity=85;assert.equal(R.dueRelationship(pair),'proposal');choose(pair,0);assert.equal(pair.relationship.status,'married');
assert.equal(pair.relationship.affinity,95);assert.equal(pair.relationship.marriedAge,23);
console.log('PASS 0–100 affinity, explicit event weights, neutral respectful refusal, clamp, adult/consent gates, marriage 85 + two years + future agreement');

function dating(nation='ENG'){const c=make(nation,25);Object.assign(c.relationship,{status:'dating',affinity:90,datingAge:21,lastAge:21,done:['debut','outing','confession'],futureAgreement:true});return c;}
const move=dating();const hometown=move.relationship.residence;
R.recordRelationshipTransfer(move,'ENG','ENG');assert(!move.relationship.foreign);
move.club=S.clubByName('플라멩구');R.recordRelationshipTransfer(move,'ENG','BRA');assert.equal(R.dueRelationship(move),'foreign');assert.equal(move.relationship.affinity,90);
const ev=choose(move,1);assert.equal(ev.a.length,3);assert.equal(move.relationship.residence,hometown,'an invitation never teleports the partner');
nextYear(move);assert.equal(R.dueRelationship(move),'future');const unwilling=S.relationshipPrepView(move).event;assert.equal(unwilling.canMove,false,'affinity 95 alone cannot override personal goals');choose(move,0);assert.equal(move.relationship.residence,hometown);
move.age+=2;move.relationship.prepAge=null;move.relationship.goalSupport=PROFILES.europe.moveSupport;move.relationship.moveDiscussion={nation:'BRA',age:move.age-1};
assert(S.relationshipPrepView(move).event.canMove);choose(move,0);assert.equal(move.relationship.residence,'BRA');assert(!R.relationshipView(move).longDistance);
move.club=S.clubByName('아스날');R.recordRelationshipTransfer(move,'BRA','ENG');nextYear(move);assert.equal(R.dueRelationship(move),'foreign','every completed international move can raise a new discussion');
const revisit=dating();revisit.club=S.clubByName('플라멩구');Object.assign(revisit.relationship,{futurePlan:'independent',lastFutureAge:22,goalSupport:2});
assert.equal(R.dueRelationship(revisit),'future','a previously deferred relocation can be discussed again when personal plans are ready');
assert(R.relationshipEvent(revisit,'friend:future').canMove);
const long=dating();long.relationship.residence='BRA';long.club=S.clubByName('아스날');R.recordRelationshipTransfer(long,'KOR','ENG');assert.match(R.relationshipEvent(long,'friend:foreign').t,/거리/);
const returns=dating();returns.club=S.clubByName('아스날');returns.relationship.residence='ENG';R.recordRelationshipTransfer(returns,'BRA','ENG');assert.match(R.relationshipEvent(returns,'friend:foreign').t,/가까워/);assert(!R.relationshipEvent(returns,'friend:foreign').a[0].includes('장거리'));
const ended=dating();ended.club=S.clubByName('플라멩구');R.recordRelationshipTransfer(ended,'ENG','BRA');choose(ended,2);assert.equal(ended.relationship.status,'separated');
console.log('PASS actual international move only, repeated transfers, changed long-distance/return-home dialogue, independent goals, explicit mutual relocation, breakup choice');

const promise=dating();promise.club=S.clubByName('플라멩구');R.recordRelationshipTransfer(promise,'ENG','BRA');choose(promise,0);assert(promise.relationship.promise);
const affinity=promise.relationship.affinity;promise.age+=1;R.relationshipView(promise);assert.equal(promise.relationship.affinity,affinity,'elapsed offscreen time never means a broken promise');
assert.equal(R.dueRelationship(promise),'followup');choose(promise,1);assert.equal(promise.relationship.brokenPromises,0,'honest rescheduling does not count as a breach');
nextYear(promise);choose(promise,2);assert.equal(promise.relationship.brokenPromises,1);assert.equal(promise.relationship.lastChange.delta,-12);
nextYear(promise);choose(promise,2);assert.equal(promise.relationship.unresolved,2);
nextYear(promise);assert.equal(R.dueRelationship(promise),'crisis');choose(promise,1);assert.equal(promise.relationship.status,'dating','a first conflict does not immediately force separation');
nextYear(promise);const final=S.relationshipPrepView(promise).event;assert(final.partnerEnds);choose(promise,0);assert.equal(promise.relationship.status,'separated','partner may end relationship after ignored repeated conflicts');
const repair=dating();repair.relationship.affinity=25;repair.relationship.unresolved=2;choose(repair,0);assert.equal(repair.relationship.status,'dating');assert.equal(repair.relationship.unresolved,0);assert(repair.relationship.promise);
nextYear(repair);choose(repair,0);assert.equal(repair.relationship.fulfilledPromises,1);assert.equal(repair.relationship.affinity,43);
for(const nation of ['KOR','BRA','NGA','ENG']){
 const c=make(nation,21);c.club=S.clubByName(nation==='ENG'?'플라멩구':'아스날');c.relationship.affinity=65;
 const home=c.relationship.residence,invite=S.relationshipPrepView(c).event;
 assert.equal(invite.id,'friend:visit');assert.equal(invite.visitFor,'confession');assert.equal(invite.channel,'message');
 assert.throws(()=>R.applyRelationship(c,'friend:confession',0),/방문/,'cannot skip the visit invitation');
 const deferred=structuredClone(c);S.completeRelationshipPrep(deferred,1);assert.equal(deferred.relationship.status,'close');assert.equal(deferred.relationship.affinity,65);assert(!deferred.relationship.done.includes('confession'));assert.equal(S.relationshipPrepView(deferred).event,null);
 nextYear(deferred);assert.equal(S.relationshipPrepView(deferred).event.id,'friend:visit','deferring a visit is not rejecting the confession');
 S.completeRelationshipPrep(c,0);assert.notEqual(c.relationship.prepAge,c.age);assert.equal(c.relationship.affinity,65);assert.equal(c.relationship.status,'close');
 const restored=structuredClone(c),scene=S.relationshipPrepView(restored).event;assert.equal(scene.id,'friend:confession');assert.equal(scene.remote,false);assert.equal(scene.channel,'scene');assert(scene.friend.longDistance);assert.match(scene.script.before[0][1],/訪問|방문/);
 assert.equal(scene.friend.residence,home);S.completeRelationshipPrep(restored,0);assert.equal(restored.relationship.status,'dating');assert.equal(restored.relationship.affinity,73);assert.equal(restored.relationship.residence,home);assert(!restored.relationship.visit);assert.equal(restored.relationship.lastVisitAge,21);
 const no=structuredClone(c);S.completeRelationshipPrep(no,1);assert.equal(no.relationship.status,'friend');assert(no.relationship.confessionDeclined);
 const proposal=dating(nation);proposal.club=c.club;const invitation=S.relationshipPrepView(proposal).event;assert.equal(invitation.visitFor,'proposal');S.completeRelationshipPrep(proposal,0);assert.equal(S.relationshipPrepView(proposal).event.remote,false);S.completeRelationshipPrep(proposal,0);assert.equal(proposal.relationship.status,'married');assert.equal(proposal.relationship.residence,home);
 for(const age of [16,19,22,25]){
  const daily=make(nation,age);daily.club=c.club;const visit=R.routineEvent(daily);assert(visit.meeting&&visit.meeting.remote===false);assert.match(visit.meeting.lines[0][1],age<18?/귀국/:/방문/);
  const before=daily.relationship.affinity;R.applyRoutine(daily,visit,1);assert.equal(daily.relationship.affinity,before);assert.equal(daily.relationship.lastVisitAge,undefined);
 }
 const outing=make(nation,20);outing.club=c.club;outing.relationship.affinity=60;const walk=R.relationshipEvent(outing,'friend:outing');assert(walk.remote&&walk.meeting.remote===false);assert(!walk.d.includes('걷자'));assert.match(walk.meeting.lines[0][1],/방문/);
 const follow=dating(nation);follow.club=c.club;follow.relationship.promise={reviewAge:25};const met=R.relationshipEvent(follow,'friend:followup');assert.deepEqual(met.meeting.picks,[0]);assert(met.script.after[1].length);assert.equal(met.meeting.remote,false);
 const military=R.routineEvent(follow,true);assert(!military.meeting);assert(military.remote);
}
console.log('PASS four-region visits: saved invitation → arrival → in-person confession/proposal; neutral deferral/retry, explicit refusal, unchanged residence, youth home visits, adult visiting dates, promised reunions and service calls');

console.log('PASS saved promise/fulfillment/rescheduling/breach history, personality penalties, repair branch and earned partner-initiated breakup; no passive/random decay');

for(const remote of [false,true]){
 const c=make('ENG',19);if(remote)c.club=S.clubByName('플라멩구');
 R.prepareDebut(c,{youth:true,apps:20});assert(!c.relationship.pendingDebut);R.prepareDebut(c,{youth:false,apps:0});assert(!c.relationship.pendingDebut);
 R.prepareDebut(c,{youth:false,apps:1});assert(c.relationship.pendingDebut);assert.equal(c.relationship.debutMode,remote?'remote':'stadium');assert.equal(R.debutEvent(c).remote,remote);
 const before=c.relationship.affinity;R.applyRelationship(c,'friend:debut',0);assert.equal(c.relationship.affinity,before+6);R.applyRelationship(c,'friend:debut',0);assert.equal(c.relationship.affinity,before+6,'checkpoint retry is idempotent');
}
const football=make('ENG',23);Object.assign(football,{lv:3,proAt:18,num:9,ovr:75,peak:75,st:Array(5).fill(75)});football.relationship.affinity=70;
const yes=structuredClone(football),no=structuredClone(football);choose(yes,0);choose(no,1);
const y=S.playSeason(yes,{train:'균형',evPick:0,injPick:1}).row,n=S.playSeason(no,{train:'균형',evPick:0,injPick:1}).row;
for(const key of ['apps','starts','goals','ast','ovr','injured','rating','rank'])assert.equal(y[key],n[key],key);
const old=make();delete old.relationship;S.playSeason(old,{train:'균형',evPick:0,injPick:1});S.nextSeason(old,null,0);assert.equal(S.playerView(old).relationship,null);
console.log('PASS debut is actual senior appearance only; local attendance vs remote viewing; checkpoint retry, unchanged football results and relationship-free legacy saves');

let married=0,annual=0,foreign=0;
for(let seed=1;seed<=60;seed++){
 const c=S.createCareer({...input,nation:['KOR','JPN','BRA','NGA','ENG'][seed%5]},0,seed);
 for(let year=0;year<27&&c.phase!=='retired';year++){
  const prep=S.prepView(c);assert(prep.friendIntro||prep.friendEvent);const career=prep.event.id;
  if(prep.friendEvent?.id==='friend:foreign')foreign++;
  choose(c,0);annual++;assert.equal(c.relationship.prepAge,c.age);assert.equal(S.prepView(c).friendEvent,null);assert.equal(S.prepView(c).friendIntro,null);assert.equal(S.prepView(c).event.id,career);
  S.playSeason(c,{train:'균형',evPick:0,injPick:1});if(c.relationship.pendingDebut)R.applyRelationship(c,'friend:debut',0);
  if(c.military?.status==='pending'&&c.age===27)S.militaryAction(c,'regular');
  S.nextSeason(c,c.released&&c.offers.length?0:null,0);assert(c.relationship.affinity>=0&&c.relationship.affinity<=100);assert(c.relationship.records.length<=12);
 }
 if(c.relationship.status==='married')married++;
 const card=S.cardView(c);assert.equal(card.relationship.id,c.relationship.region);
}
assert(married>0);console.log('PASS 60 full careers:',annual,'annual choices;',married,'married;',foreign,'actual foreign-move discussions; no duplicate choices or football-event replacement');

process.env.WHOAMI_SECRET='relationship-unit-test-only';const codec=tokenCodec('career-token-v1',{zip:true});
const {default:handler}=await import('../arsenal-dashboard/api/career.js');
async function api(action,body){let status=200,data;await handler({method:'POST',query:{a:action},body,headers:{}},{setHeader(){},status(n){status=n;return this;},json(v){data=v;}});return {status,data};}
const intro=S.createCareer(input,0,8),token=codec.seal(intro),career=S.prepView(intro).event.id;
assert.equal((await api('season',{token,train:'균형',evPick:0})).status,400);assert.equal((await api('friend-prep',{token,pick:3})).status,400);
const reply=await api('friend-prep',{token,pick:2});assert.equal(reply.status,200);assert.equal(reply.data.player.relationship.affinity,43);assert.equal(reply.data.prep.event.id,career);assert.equal(reply.data.prep.selected,null);assert.equal(reply.data.prep.friendEvent,null);
assert.equal((await api('friend-prep',{token:reply.data.token,pick:0})).status,400);
assert.deepEqual((await api('view',{token:reply.data.token})).data,reply.data);
const traveling=make('ENG',21);traveling.club=S.clubByName('플라멩구');traveling.relationship.affinity=65;
const invitationReply=await api('friend-prep',{token:codec.seal(traveling),pick:0});assert.equal(invitationReply.status,200);assert.equal(invitationReply.data.prep.friendEvent.id,'friend:confession');assert.equal(invitationReply.data.prep.friendEvent.remote,false);assert.equal(invitationReply.data.player.relationship.status,'close');assert.equal(invitationReply.data.player.relationship.affinity,65);
assert.equal((await api('season',{token:invitationReply.data.token,train:'균형',evPick:0})).status,400,'a visit invitation does not bypass the actual confession choice');
const reloadVisit=await api('view',{token:invitationReply.data.token});assert.deepEqual(reloadVisit.data,invitationReply.data);
const inPerson=await api('friend-prep',{token:reloadVisit.data.token,pick:0});assert.equal(inPerson.status,200);assert.equal(inPerson.data.player.relationship.status,'dating');assert.equal(inPerson.data.prep.friendEvent,null);assert.equal(inPerson.data.player.relationship.residence,'ENG');
const postpone=await api('friend-prep',{token:codec.seal(traveling),pick:1});assert.equal(postpone.status,200);assert.equal(postpone.data.prep.friendEvent,null);assert.notEqual(postpone.data.player.relationship.status,'dating');assert.equal(postpone.data.player.relationship.affinity,65);
const callup=make('ENG',22);Object.assign(callup,{lv:3,proAt:18,num:9,ovr:90,peak:90,st:Array(5).fill(90),ev:'natcall'});callup.relationship.affinity=70;
assert(S.nationalCallupPlan(callup));choose(callup,0);assert.equal(S.prepView(callup).event.id,'natcall');
const loan=make('ENG',21);loan.ev='loan';loan.loanClubs=[S.clubByName('플라멩구')];choose(loan,0);assert.equal(loan.ev,'loan');assert.equal(loan.loanClubs[0].n,'플라멩구');
const first=make('ENG',19);Object.assign(first,{lv:3,proAt:18,num:9,ovr:78,peak:78,st:Array(5).fill(78)});first.relationship.prepAge=first.age;
S.playSeason(first,{train:'균형',evPick:0,injPick:1});assert(first.relationship.pendingDebut);
const t=codec.seal(first);assert.equal((await api('next',{token:t})).status,400);assert.equal((await api('friend-debut',{token:t,pick:2})).status,400);
const ack=await api('friend-debut',{token:t,pick:0});assert.equal(ack.status,200);assert(!codec.open(ack.data.token).relationship.pendingDebut);assert.deepEqual(codec.open(ack.data.token).tot,first.tot);assert.equal((await api('friend-debut',{token:ack.data.token,pick:0})).status,400);
let injury=false;
for(let seed=1;seed<=80&&!injury;seed++){
 const c=make('ENG',19);Object.assign(c,{seed,lv:3,proAt:18,num:9,ovr:78,peak:78,st:Array(5).fill(78)});c.relationship.prepAge=c.age;
 const r=await api('season',{token:codec.seal(c),train:'균형',evPick:0});
 if(r.data.phase==='injury'&&r.data.player.relationship.pendingDebut){
  assert(r.data.friendDebut);const a=await api('friend-debut',{token:r.data.token,pick:1});assert.equal(a.status,200);const done=await api('season',{token:a.data.token,injPick:1});assert.equal(done.status,200);assert.equal(codec.open(done.data.token).relationship.done.filter(x=>x==='debut').length,1);injury=true;
 }
}
assert(injury);
console.log('PASS signed API: annual-first guard, score persistence/reload, repeat and invalid pick rejection, call-up/loan preservation, debut result/injury acknowledgment and unchanged records');
