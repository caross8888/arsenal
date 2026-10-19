import assert from 'node:assert/strict';
import * as S from '../arsenal-dashboard/api/_career_sim.js';
import * as R from '../arsenal-dashboard/api/_career_relationship.js';
import * as J from '../arsenal-dashboard/api/_career_reporter.js';
import * as T from '../arsenal-dashboard/api/_career_relationship_travel.js';
import {tokenCodec} from '../arsenal-dashboard/api/_token.js';
const input={name:'기자루트확인',nation:'ENG',pos:'FW',card:0,foot:'오른발',body:'표준',num:9};
function make(age=21){const c=S.createCareer(input,0,8);Object.assign(c,{age,ev:'media'});Object.assign(c.relationship,{introDone:true,prepAge:age});return c;}
function meet(c,pick=0){J.completeIntro(c,pick,1);if(pick===0)J.completeWelcome(c,0);return c;}
function year(c){c.age++;c.phase='prep';c.ev='coach';return c;}
function reporterStep(c){let e=S.relationshipPrepView(c).event;if(e.id==='relationship:route'){S.completeRelationshipPrep(c,1);e=S.relationshipPrepView(c).event;}return e;}
const no=make();meet(no,1);assert(!no.reporter.contact);assert.equal(J.welcomeEvent(no),null);year(no);assert(!S.relationshipPrepView(no).event.id.startsWith('reporter:'));
const c=make(),football=structuredClone({st:c.st,tot:c.tot,hist:c.hist,club:c.club});meet(c);assert.equal(c.reporter.affinity,43);assert.equal(J.interviewView(c),null);assert.throws(()=>J.completeIntro(c,0,1));assert.throws(()=>J.completeWelcome(c,0));
assert.deepEqual({st:c.st,tot:c.tot,hist:c.hist,club:c.club},football);
const episodes=[];for(let i=0;i<4;i++){year(c);const old=c.relationship.affinity,ev=reporterStep(c);assert(ev.id.startsWith('reporter:episode:'));episodes.push(ev.episode);S.completeRelationshipPrep(c,0);assert.equal(c.relationship.affinity,old);assert.equal(S.relationshipPrepView(c).event,null);assert.equal(c.reporter.status,i<1?'friend':'close');}
assert.equal(new Set(episodes).size,4);assert.equal(c.reporter.status,'close');assert.equal(c.reporter.affinity,67);
year(c);const confession=reporterStep(c);assert.equal(confession.id,'reporter:confession');assert(confession.questionCG);S.completeRelationshipPrep(c,0);assert.equal(c.activePartner,'reporter');assert.equal(c.reporter.status,'dating');assert.equal(J.partnerView(c).id,'reporter');assert.equal(c.relationship.status,'friend');
const seen=new Set(episodes);let proposal=false,foreign=false;
for(let i=0;i<12;i++){
 year(c);if(i===1){const from=c.club.nat;c.club=S.clubByName('플라멩구');J.recordTransfer(c,from,c.club.nat);assert(c.reporter.foreign);foreign=true;}
 const ev=reporterStep(c);if(ev.episode){assert(!seen.has(ev.episode));seen.add(ev.episode);}if(ev.id==='reporter:proposal')proposal=true;
 S.completeRelationshipPrep(c,0);assert.equal(S.relationshipPrepView(c).event,null);
}
assert(foreign&&proposal);assert.equal(c.reporter.status,'married');assert.equal(S.cardView(c).relationship.id,'reporter');assert.equal(S.cardView(c).relationship.label,'배우자');
c.age=35;c.phase='result';c.forced=false;c.bodyOut=false;c.hist.push({age:c.age,youth:false,apps:20});const homeTrips=structuredClone(c.relationship.vacationsDone||[]),reporterBefore=c.reporter.affinity;
let trip=T.vacationEvent(c);assert.equal(trip.friend.id,'reporter');T.completeVacation(c,0);trip=T.vacationEvent(c);assert.equal(trip.wardrobe,'beach');assert(trip.script.story.some(l=>l[5]==='sunset'));T.completeVacation(c,0);assert.deepEqual(c.reporter.vacationsDone,['beach']);assert.deepEqual(c.relationship.vacationsDone||[],homeTrips);assert.equal(c.reporter.affinity,Math.min(100,reporterBefore+6));c.age+=3;assert.deepEqual(T.vacationEvent(c).destinations,['ski',null]);
const attached=meet(make());Object.assign(attached.relationship,{status:'dating',affinity:90,datingAge:18,futureAgreement:true});for(let i=0;i<4;i++){year(attached);reporterStep(attached);S.completeRelationshipPrep(attached,0);}year(attached);assert.equal(reporterStep(attached).id,'reporter:boundary');const stay=structuredClone(attached);S.completeRelationshipPrep(stay,1);assert.equal(stay.relationship.status,'dating');assert(stay.reporter.romanceDeclined);S.completeRelationshipPrep(attached,0);assert.equal(attached.relationship.status,'separated');assert.notEqual(attached.reporter.status,'dating');year(attached);assert.equal(reporterStep(attached).id,'reporter:confession');S.completeRelationshipPrep(attached,0);assert.equal(attached.reporter.status,'dating');
const married=meet(make());married.relationship.status='married';year(married);assert.equal(J.preparation(married),null);
const minor=meet(make(16));minor.reporter.welcomePending=true;assert(!J.welcomeEvent(minor).script.story.flat().join(' ').includes('저녁'));J.completeWelcome(minor,0);year(minor);assert.equal(J.preparation(minor),null);
const chooseOld=meet(make());year(chooseOld);const beforeEpisode=chooseOld.reporter.episode;S.completeRelationshipPrep(chooseOld,0);assert(!S.relationshipPrepView(chooseOld).event.id.startsWith('reporter:'));S.completeRelationshipPrep(chooseOld,0);assert.equal(chooseOld.reporter.episode,beforeEpisode);
console.log('PASS intro consent, immediate message persistence, four unique slow-burn episodes, one annual meeting, no auto replacement, explicit breakup/confession, transfer/future/marriage/card, independent travel records, minor/married gates');
let wholeMet=0,wholeDating=0,wholeMarried=0;
for(let seed=1;seed<=12;seed++){
 const career=S.createCareer({...input,nation:['ENG','KOR','BRA','NGA'][seed%4]},0,seed);
 for(let yr=0;yr<27&&career.phase!=='retired';yr++){
  let pending=S.relationshipPrepView(career),reads=0;
  while((pending.intro||pending.event)&&reads++<5){
   const ev=pending.intro||pending.event;
   const pick=ev.id==='relationship:route'?1:ev.id==='friend:confession'?1:0;
   S.completeRelationshipPrep(career,pick);pending=S.relationshipPrepView(career);
  }
  assert(reads<5);assert.equal(career.relationship.prepAge,career.age);
  const iv=S.prepView(career).interview;let evPick=0;
  if(iv?.reporter){evPick=iv.a[0].k;J.completeIntro(career,0,evPick);J.completeWelcome(career,0);}
  S.playSeason(career,{train:'균형',evPick,injPick:1});if(career.relationship.pendingDebut)R.applyRelationship(career,'friend:debut',0);
  if(T.vacationEvent(career)){T.completeVacation(career,0);if(T.vacationPending(career))T.completeVacation(career,0);}
  if(career.military?.status==='pending'&&career.age===27)S.militaryAction(career,'regular');
  S.nextSeason(career,career.released&&career.offers.length?0:null,0);
  if(career.reporter?.status==='dating')wholeDating++;
 }
 if(career.reporter?.met)wholeMet++;if(career.reporter?.status==='married')wholeMarried++;
 if(career.reporter)assert.equal(new Set(career.reporter.done).size,career.reporter.done.length);
}
assert(wholeMet>0&&wholeDating>0&&wholeMarried>0);
console.log('PASS 12 full careers across four regions: real first interviews, slow-burn route, service, travel, marriage, no duplicate reporter episodes or annual football-event replacement');
process.env.WHOAMI_SECRET='reporter-test-only';const codec=tokenCodec('career-token-v1',{zip:true});const {default:handler}=await import('../arsenal-dashboard/api/career.js');
async function api(a,body){let status=200,data;await handler({method:'POST',query:{a},body,headers:{}},{setHeader(){},status(n){status=n;return this;},json(v){data=v;}});return {status,data};}
const original=make(),sealed=codec.seal(original);
assert.equal((await api('reporter-intro',{token:sealed,pick:'0',ivPick:1})).status,400);assert.equal((await api('reporter-intro',{token:sealed,pick:0,ivPick:9})).status,400);
const intro=await api('reporter-intro',{token:sealed,pick:0,ivPick:1});assert.equal(intro.status,200);assert.equal(intro.data.prep.friendEvent.id,'reporter:welcome');assert.equal(intro.data.prep.selected,1);assert.deepEqual((await api('view',{token:intro.data.token})).data,intro.data);assert.equal((await api('season',{token:intro.data.token,train:'균형',evPick:1})).status,400);
const welcome=await api('reporter-message',{token:intro.data.token,pick:0});assert.equal(welcome.status,200);assert.equal(welcome.data.prep.friendEvent,null);assert.equal(welcome.data.prep.selected,1);assert.equal((await api('reporter-message',{token:welcome.data.token,pick:0})).status,400);assert.equal((await api('reporter-intro',{token:welcome.data.token,pick:0,ivPick:1})).status,400);
const wrong=make();wrong.ev='coach';assert.equal((await api('reporter-intro',{token:codec.seal(wrong),pick:0,ivPick:1})).status,400);
const unready=make();delete unready.relationship.prepAge;assert.equal((await api('reporter-intro',{token:codec.seal(unready),pick:0,ivPick:1})).status,400);
const pending=codec.open(welcome.data.token);year(pending);let view=await api('view',{token:codec.seal(pending)});assert.equal(view.data.prep.friendEvent.id,'relationship:route');const selected=await api('friend-prep',{token:view.data.token,pick:1});assert.equal(selected.status,200);assert.equal(selected.data.prep.friendEvent.id,'reporter:episode:exclusive');const finished=await api('friend-prep',{token:selected.data.token,pick:0});assert.equal(finished.status,200);assert.equal(finished.data.prep.friendEvent,null);assert.equal(codec.open(finished.data.token).reporter.episode,1);assert.deepEqual((await api('view',{token:finished.data.token})).data,finished.data);assert.equal((await api('friend-prep',{token:finished.data.token,pick:0})).status,400);
console.log('PASS signed API: first-interview availability, invalid/direct/repeated request guards, persisted answer/message/selection/episode, reload, season gate and one annual completion');
