import assert from 'node:assert/strict';
import * as S from '../arsenal-dashboard/api/_career_sim.js';
import * as R from '../arsenal-dashboard/api/_career_relationship.js';
import * as A from '../arsenal-dashboard/api/_career_asia.js';
import * as T from '../arsenal-dashboard/api/_career_relationship_travel.js';
import * as J from '../arsenal-dashboard/api/_career_reporter.js';
import {MAIN,mainBefore,fireworksStory} from '../arsenal-dashboard/api/_career_asia_dialogue.js';
import {tokenCodec} from '../arsenal-dashboard/api/_token.js';
const input={name:'첫관객',nation:'KOR',pos:'FW',card:0,foot:'오른발',body:'표준',num:9};
function make(nation='KOR',age=16){const c=S.createCareer({...input,nation},0,8);c.age=age;c.ev='coach';c.relationship.introDone=true;return c;}
function year(c,age=c.age+1){c.age=age;c.phase='prep';}
function choose(c,pick=0){const ev=S.relationshipPrepView(c).event;assert(ev);S.completeRelationshipPrep(c,pick);return ev;}
const speech=ev=>JSON.stringify(ev.script);
for(const nation of ['KOR','JPN']){
 const c=make(nation,15);c.relationship.introDone=false;c.club=S.clubByName('아스날');
 const intro=S.relationshipPrepView(c).intro;assert.match(intro.d,/연습.*TV/);assert.equal(intro.a.length,3);S.completeRelationshipPrep(c,2);assert.equal(c.relationship.affinity,43);
 const home=c.relationship.residence;year(c);const before=JSON.stringify([c.st,c.rng,c.tot,c.club]);
 const scene=S.relationshipPrepView(c).event;assert.match(scene.id,/asia:main:old-bet/);assert.equal(scene.remote,false);assert.match(speech(scene),/고국으로 돌아왔다/);
 assert.equal(S.relationshipPrepView(c).event.id,scene.id);assert.equal(c.relationship.asiaStory.chapter,0,'view never completes a chapter');choose(c);assert.equal(c.relationship.asiaStory.chapter,1);assert.equal(c.relationship.residence,home);assert.equal(JSON.stringify([c.st,c.rng,c.tot,c.club]),before);assert.equal(S.relationshipPrepView(c).event,null);assert.throws(()=>choose(c));
}
const stalled=make();stalled.hist=[{youth:true,apps:0}];const successful=make();successful.hist=[{youth:false,apps:30},{youth:false,apps:25}];
assert.match(JSON.stringify(mainBefore(stalled,3)),/너도 출전 기다린다는/);
assert.match(JSON.stringify(mainBefore(successful,3)),/네 자리가 있잖아/);
const waiting=make('KOR',19);waiting.relationship.affinity=100;assert.notEqual(S.relationshipPrepView(waiting).event.id,'friend:confession','points cannot skip her story');
for(const [chapter,age,voiceFound] of [[2,19,false],[5,24,false],[7,27,true]]){
 const c=make('KOR',age);Object.assign(c.relationship,{lastAge:age,asiaStory:{version:1,chapter,support:8,voiceFound,seen:['practice-snack']}});
 const ev=S.relationshipPrepView(c).event;assert.equal(ev.id,'friend:asia:date:fireworks');assert.equal(ev.costume,'fireworks');
 const lines=fireworksStory(c),text=JSON.stringify(lines);assert.match(text,/역 앞에서 만났다/);assert.match(text,/집으로 돌아간 뒤/);assert.equal(lines.at(-1)[4],'message');
 if(chapter===2){assert.match(text,/후렴을 작게 따라/);assert(!text.includes('오늘은 무대 안 보고'));}
 if(chapter===5)assert.match(text,/오늘은 무대 안 보고/);
 if(voiceFound){assert.match(text,/우리 합주할 때도 불러/);assert(!text.includes('오늘은 무대 안 보고'));}
 const firstCG=lines.findIndex(line=>line[5]==='fireworks'),lastCG=lines.findLastIndex(line=>line[5]==='fireworks');assert(firstCG>0);assert.match(lines[firstCG][1],/첫 불꽃/);assert.match(lines[lastCG][1],/마지막 불꽃/);assert(lines.slice(firstCG,lastCG+1).every(line=>line[5]==='fireworks'));assert.equal(ev.script.story.at(-1)[4],'message','the closing narration stays in the return-home phone scene');
 choose(c);assert(c.relationship.asiaStory.seen.includes('fireworks'));assert.equal(c.relationship.asiaStory.chapter,chapter);
}
for(const nation of ['KOR','JPN'])for(const foreign of [false,true]){
 const c=make(nation,15);c.relationship.introDone=false;if(foreign)c.club=S.clubByName('아스날');const residence=c.relationship.residence;
 const ids=[],chapters=[],romance=[];
 for(let age=15;age<=38;age++){
  year(c,age);const prep=S.relationshipPrepView(c),football=S.prepView(c).event.id,priorResidence=c.relationship.residence;
  if(prep.intro)S.completeRelationshipPrep(c,0);
  else {const ev=prep.event;assert(ev);if(ev.asia){assert(!ids.includes(ev.id),'unique main/date episode');ids.push(ev.id);}if(ev.asia?.kind==='main')chapters.push(ev.asia.index);if(['friend:confession','friend:proposal'].includes(ev.id)){assert(age>=18);assert.equal(ev.remote,false);assert.match(speech(ev),/비시즌/);romance.push(ev.id);}choose(c);}
  assert.equal(c.relationship.prepAge,age);assert.equal(S.relationshipPrepView(c).event,null);assert.equal(S.prepView(c).event.id,football);if(!prep.event?.canMove)assert.equal(c.relationship.residence,priorResidence,'only explicit future agreement may relocate her');
 }
 assert.deepEqual(chapters,[0,1,2,3,4,5,6,7]);assert.equal(c.relationship.asiaStory.ending,'shared-stage');assert(c.relationship.asiaStory.voiceFound);assert(romance.includes('friend:confession'));assert(romance.includes('friend:proposal'));assert.equal(c.relationship.status,'married');
}
const cold=make('KOR',16);
for(let age=16;age<=36;age++){year(cold,age);const ev=S.relationshipPrepView(cold).event;choose(cold,ev.asia?.kind==='main'?1:0);}
assert.equal(cold.relationship.asiaStory.chapter,8);assert.equal(cold.relationship.asiaStory.ending,'own-stage');assert(!['dating','married'].includes(cold.relationship.status),'affinity alone does not erase repeatedly ignored boundaries');
const late=make('KOR',31);late.relationship.status='dating';late.relationship.datingAge=29;late.relationship.affinity=90;late.relationship.futureAgreement=true;choose(late);assert.equal(late.relationship.asiaStory.chapter,1,'old saves start the new arc without a false past completion');
const move=make('KOR',24);Object.assign(move.relationship,{status:'dating',datingAge:20,affinity:90,goalSupport:8,lastAge:20,futureAgreement:true,asiaStory:{chapter:5,seen:[],support:6,voiceFound:false}});move.club=S.clubByName('아스날');
R.recordRelationshipTransfer(move,'KOR','ENG');const transfer=S.relationshipPrepView(move).event;assert.equal(transfer.id,'friend:foreign');assert.equal(transfer.remote,false);choose(move,1);year(move);assert.equal(S.relationshipPrepView(move).event.canMove,false);choose(move);assert.equal(move.relationship.residence,'KOR');
for(const [from,to,homeClub,far] of [['KOR','ENG','아스날',true],['ENG','KOR','울산 HD',false],['ENG','BRA','플라멩구',true]])for(const pick of [0,1,2]){
 const c=make('KOR',24);Object.assign(c.relationship,{status:'dating',affinity:90,datingAge:20,lastAge:20});c.club=S.clubByName(homeClub);assert(c.club);R.recordRelationshipTransfer(c,from,to);
 const ev=S.relationshipPrepView(c).event;assert.equal(ev.id,'friend:foreign');assert.equal(ev.a.length,3);
 if(far){assert(!ev.t.includes('가까워진'));assert(!ev.a[0].includes('얼굴 자주'));assert.match(ev.d,/휴가|언제 볼/);}
 else{assert.equal(ev.t,'다시 가까워진 우리');assert.match(ev.d,/같은 나라/);assert(!ev.d.includes('같이 바로 갈'));assert(!speech(ev).includes('귀국할 수 있는 날짜'));assert.match(ev.a[1],/같이 사는/);}
 const oldHome=c.relationship.residence;choose(c,pick);assert.equal(c.relationship.residence,oldHome);assert(!c.relationship.foreign);if(pick===0)assert(c.relationship.promise);if(pick===1)assert(c.relationship.moveDiscussion);if(pick===2)assert.equal(c.relationship.status,'separated');
}
const visiting=make('KOR',24);visiting.club=S.clubByName('플라멩구');Object.assign(visiting.relationship,{status:'dating',affinity:90,datingAge:20});R.recordRelationshipTransfer(visiting,'ENG','BRA');visiting.relationship.visit={age:24,key:'foreign'};assert(!R.relationshipEvent(visiting,'friend:foreign').t.includes('가까워진'),'a local annual visit does not turn an overseas move into a return home');
for(const key of ['confession','proposal']){
 const c=make('KOR',key==='confession'?22:27);Object.assign(c.relationship,{affinity:90,status:key==='proposal'?'dating':'close',datingAge:22,futureAgreement:true,lastAge:20,asiaStory:{chapter:key==='proposal'?7:4,support:8,seen:[],voiceFound:key==='proposal'}});
 if(key==='proposal')c.relationship.asiaStory.ring={boughtAge:26};
 const ev=S.relationshipPrepView(c).event;assert.equal(ev.id,'friend:'+key);assert.equal(ev.outfit,1,'cardigan and burgundy skirt match both major CGs');
 if(key==='confession'){assert.match(speech(ev),/벤치에 나란히 앉았다/);assert(!speech(ev).includes('걷던 길에서 그녀가 걸음을 멈췄다'));assert.match(JSON.stringify(ev.script.after[0]),/더 앉아 있자/);}
}
function readyForRing(){const c=make('KOR',27);Object.assign(c.relationship,{status:'dating',affinity:90,datingAge:22,lastAge:24,futureAgreement:true,asiaStory:{version:1,chapter:7,seen:[],support:8,voiceFound:true}});return c;}
const shopping=readyForRing(),shop=S.relationshipPrepView(shopping).event;
assert.equal(shop.id,'friend:asia:ring');assert.equal(shop.questionSpeaker,'n');assert.equal(shop.questionCG.key,'ring');assert.deepEqual(shop.choiceSpeakers,['n','n']);assert(shop.script.after[0].every(line=>line[5]==='ring'));
choose(shopping);assert.deepEqual(shopping.relationship.asiaStory.ring,{boughtAge:27});assert.equal(shopping.relationship.affinity,90);assert.equal(shopping.relationship.status,'dating');assert.equal(shopping.relationship.lastVisitAge,undefined);assert.equal(S.relationshipPrepView(shopping).event,null,'purchase is the entire annual relationship event');
year(shopping);const proposal=S.relationshipPrepView(shopping).event;assert.equal(proposal.id,'friend:proposal','prepared proposal precedes the next ordinary/main scene');assert.equal(proposal.questionSpeaker,'n');assert.equal(proposal.choiceSpeakers[0],'p');assert.match(proposal.a[0],/결혼해 줄래/);assert(!proposal.d.includes('우리 결혼할까'));assert.equal(proposal.questionCG.expression,'waiting','calm bare hands before the player proposes');
assert.deepEqual([...new Set(proposal.script.after[0].map(line=>line[6]))],['surprised','tearful','happy']);const ringOn=proposal.script.after[0].findIndex(line=>line[1].includes('반지를 조심스럽게 끼워'));assert(ringOn>0);assert(proposal.script.after[0].slice(0,ringOn).every(line=>line[6]!=='happy'));assert(proposal.script.after[0].slice(ringOn).every(line=>line[6]==='happy'));assert(proposal.script.after[1].every(line=>line[6]==='waiting'));
const postponed=structuredClone(shopping);choose(postponed,1);assert.equal(postponed.relationship.status,'dating');assert.equal(postponed.relationship.asiaStory.ring.boughtAge,27);assert.equal(postponed.relationship.proposalAskedAge,28);assert.equal(postponed.relationship.affinity,90);assert.equal(postponed.relationship.asiaStory.ring.usedAge,undefined);
choose(shopping,0);assert.equal(shopping.relationship.status,'married');assert.equal(shopping.relationship.asiaStory.ring.usedAge,28);assert.equal(shopping.relationship.affinity,100);
const browse=readyForRing();choose(browse,1);assert(!browse.relationship.asiaStory.ring);assert.equal(browse.relationship.status,'dating');assert.equal(browse.relationship.affinity,90);assert.equal(browse.relationship.proposalAskedAge,27);
const unready=readyForRing();unready.relationship.futureAgreement=false;assert.notEqual(S.relationshipPrepView(unready).event.id,'friend:asia:ring');
const inService=readyForRing();inService.military={status:'regular',left:18,home:{...inService.club}};assert(!['friend:asia:ring','friend:proposal'].includes(S.relationshipPrepView(inService).event.id));
for(const kind of ['regular','sangmu'])for(const pick of [0,1]){
 const soldier=make('KOR',27);soldier.club=S.clubByName('아스날');soldier.military={status:kind,left:18,home:{...soldier.club}};
 const call=S.relationshipPrepView(soldier).event;assert.equal(call.id,'friend:asia:service-visit');assert(call.remote);assert.equal(call.friend.longDistance,false,'overseas home club is not the location during Korean service');assert.equal(call.backdrop,'military-visit');assert.equal(call.meeting.remote,false);assert.match(JSON.stringify(call.meeting.lines),/출입 확인.*면회/);assert.match(JSON.stringify(call.meeting.lines),/부대 안으로 복귀/);assert(!speech(call).includes('고국으로 돌아왔다'));
 const residence=soldier.relationship.residence;choose(soldier,pick);assert.equal(soldier.relationship.asiaStory.chapter,0,'military visit does not advance trainee story');assert.deepEqual(soldier.relationship.asiaStory.seen,[]);assert.equal(soldier.relationship.residence,residence);assert.equal(soldier.relationship.lastVisitAge,pick===0?27:undefined);assert.equal(soldier.relationship.affinity,pick===0?46:40);assert(!T.vacationEvent({...soldier,phase:'result'}));
 year(soldier);soldier.military.left=6;assert.equal(S.relationshipPrepView(soldier).event.id,'friend:asia:service-return-call');choose(soldier);assert.equal(soldier.relationship.asiaStory.chapter,0);
 year(soldier);soldier.military.status='completed';assert.equal(S.relationshipPrepView(soldier).event.id,'friend:asia:main:old-bet','the uncompleted chapter resumes after discharge');
}
const abroadFriend=make('KOR',27);abroadFriend.relationship.residence='ENG';abroadFriend.military={status:'regular',left:18,home:{...abroadFriend.club}};assert.equal(S.relationshipPrepView(abroadFriend).event.id,'friend:asia:service-unit-call');assert(!S.relationshipPrepView(abroadFriend).event.meeting,'no unexplained international visit');
const promised=make('KOR',27);promised.club=S.clubByName('아스날');Object.assign(promised.relationship,{status:'dating',affinity:90,datingAge:22,promise:{reviewAge:27},lastAge:24});promised.military={status:'regular',left:18,home:{...promised.club}};const follow=S.relationshipPrepView(promised).event;assert.equal(follow.id,'friend:followup');assert(follow.remote);assert(!follow.meeting);choose(promised);assert.equal(promised.relationship.lastVisitAge,undefined,'a phone promise in service is not a physical visit');assert.equal(promised.relationship.asiaStory.chapter,0);
const visitor=make('KOR',18);visitor.club=S.clubByName('아스날');const residence=visitor.relationship.residence;R.prepareDebut(visitor,{youth:true,apps:15});assert(!visitor.relationship.pendingDebut);R.prepareDebut(visitor,{youth:false,apps:1});assert.equal(visitor.relationship.debutMode,'stadium');assert.match(speech(R.debutEvent(visitor)),/비행기/);R.applyRelationship(visitor,'friend:debut',0);assert.equal(visitor.relationship.residence,residence);assert(visitor.relationship.done.includes('debut'));
const travel=make('KOR',28);Object.assign(travel.relationship,{status:'dating',datingAge:23,affinity:90});travel.phase='result';T.completeVacation(travel,0);const beach=T.vacationEvent(travel);assert.match(speech(beach),/노래|흥얼/);assert(!speech(beach).includes('무슨 곡인지 묻지 않고'),'before finding her voice, a song slips out rather than a performance request');travel.relationship.asiaStory={voiceFound:true};assert.match(speech(T.vacationEvent(travel)),/무슨 곡인지 묻지 않고/);T.completeVacation(travel,0);assert.deepEqual(travel.relationship.vacationsDone,['beach']);
console.log('PASS KOR/JPN homecoming, eight unique chapters, career-dependent comparison, eighteen non-looping dates, meaningful support/independent endings, consent and marriage, actual debut visit, service and independent residence/travel');

// Real football histories drive the same arc without replacing the annual career decision.
for(const nation of ['KOR','JPN'])for(let seed=1;seed<=12;seed++){
 const c=S.createCareer({...input,nation},0,seed);let count=0;
 while(c.phase!=='retired'&&count++<28){
  let pending=S.relationshipPrepView(c),football=S.prepView(c).event.id;assert(pending.intro||pending.event);S.completeRelationshipPrep(c,0);assert.equal(S.prepView(c).event.id,football);assert.equal(S.relationshipPrepView(c).event,null);
  S.playSeason(c,{train:'균형',evPick:0,injPick:1});if(c.relationship.pendingDebut)R.applyRelationship(c,'friend:debut',0);
  if(T.vacationEvent(c)){T.completeVacation(c,0);if(T.vacationPending(c))T.completeVacation(c,0);}
  if(c.military?.status==='pending'&&c.age===27)S.militaryAction(c,'regular');S.nextSeason(c,c.released&&c.offers.length?0:null,0);
 }
 assert.equal(c.phase,'retired');assert.equal(c.relationship.asiaStory.chapter,8);assert.equal(c.relationship.asiaStory.ending,'shared-stage');assert.equal(new Set(c.relationship.asiaStory.seen).size,c.relationship.asiaStory.seen.length);
}
process.env.WHOAMI_SECRET='asia-story-test-only';const codec=tokenCodec('career-token-v1',{zip:true});const {default:handler}=await import('../arsenal-dashboard/api/career.js');
async function api(a,body){let status=200,data;await handler({method:'POST',query:{a},body,headers:{}},{setHeader(){},status(n){status=n;return this;},json(v){data=v;}});return {status,data};}
const fresh=make('KOR',20),view=await api('view',{token:codec.seal(fresh)});assert.equal(view.data.prep.friendEvent.asia.index,0);assert.equal((await api('friend-prep',{token:view.data.token,pick:99})).status,400);assert.equal((await api('friend-prep',{token:view.data.token,pick:'0'})).status,400);
const done=await api('friend-prep',{token:view.data.token,pick:0});assert.equal(done.status,200);assert.equal(codec.open(done.data.token).relationship.asiaStory.chapter,1);assert.deepEqual((await api('view',{token:done.data.token})).data,done.data);assert.equal((await api('friend-prep',{token:done.data.token,pick:0})).status,400);
const ringView=await api('view',{token:codec.seal(readyForRing())});assert.equal(ringView.data.prep.friendEvent.id,'friend:asia:ring');const ringDone=await api('friend-prep',{token:ringView.data.token,pick:0});assert.equal(ringDone.status,200);assert.equal(codec.open(ringDone.data.token).relationship.status,'dating');assert.equal((await api('friend-prep',{token:ringDone.data.token,pick:0})).status,400);const nextRing=codec.open(ringDone.data.token);year(nextRing);const pv=await api('view',{token:codec.seal(nextRing)});assert.equal(pv.data.prep.friendEvent.id,'friend:proposal');assert.deepEqual((await api('view',{token:pv.data.token})).data,pv.data);const married=await api('friend-prep',{token:pv.data.token,pick:0});assert.equal(married.status,200);assert.equal(codec.open(married.data.token).relationship.status,'married');assert.equal(codec.open(married.data.token).relationship.asiaStory.ring.usedAge,28);
const serving=make('KOR',28);serving.military={status:'regular',left:18,home:{...serving.club}};const sv=await api('view',{token:codec.seal(serving)});assert.equal(sv.data.prep.friendEvent.id,'friend:asia:service-visit');const visitDone=await api('friend-prep',{token:sv.data.token,pick:0});assert.equal(visitDone.status,200);const restored=codec.open(visitDone.data.token);assert.equal(restored.relationship.asiaStory.chapter,0);assert.deepEqual(restored.relationship.asiaStory.serviceSeen,['visit']);assert.equal(restored.relationship.prepAge,28);assert.equal(restored.military.left,18);assert.equal((await api('friend-prep',{token:visitDone.data.token,pick:0})).status,400);
const journalist=make('KOR',21);journalist.ev='media';journalist.relationship.prepAge=journalist.age;J.completeIntro(journalist,0,0);J.completeWelcome(journalist,0);year(journalist);const route=S.relationshipPrepView(journalist).event;assert.equal(route.id,'relationship:route');S.completeRelationshipPrep(journalist,0);assert.match(S.relationshipPrepView(journalist).event.id,/friend:asia:/);choose(journalist);assert.equal(journalist.reporter.episode,0);year(journalist);S.completeRelationshipPrep(journalist,1);assert.match(S.relationshipPrepView(journalist).event.id,/reporter:episode:/);choose(journalist);assert.equal(journalist.relationship.asiaStory.chapter,1);
console.log('PASS 24 complete KOR/JPN careers, saved API chapters/reload/duplicate guards, existing football choices and reporter route selection');
