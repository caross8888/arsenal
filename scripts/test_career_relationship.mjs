import assert from 'node:assert/strict';
import * as R from '../arsenal-dashboard/api/_career_relationship.js';
import * as S from '../arsenal-dashboard/api/_career_sim.js';
import {tokenCodec} from '../arsenal-dashboard/api/_token.js';

const input={name:'관계테스트',nation:'ENG',pos:'FW',card:0,foot:'오른발',body:'표준',num:9};
for(const [nation,region] of Object.entries({KOR:'asia',JPN:'asia',BRA:'south',ARG:'south',NGA:'africa',ENG:'europe',USA:'europe'}))assert.equal(R.createRelationship(nation).region,region);
assert.equal(R.createRelationship('JPN').name,'유이');
assert.equal(R.relationshipView({}),null,'old saves remain valid without inventing a prior relationship');
const c={age:19,hist:[{youth:true,apps:25}],relationship:R.createRelationship('KOR')};
assert.equal(R.dueRelationship(c),null,'youth appearances are not a pro debut');
c.hist.push({youth:false,apps:0});assert.equal(R.dueRelationship(c),null,'bench is not a debut');
R.prepareDebut(c,{youth:true,apps:25});assert(!c.relationship.pendingDebut);
R.prepareDebut(c,{youth:false,apps:0});assert(!c.relationship.pendingDebut);
R.prepareDebut(c,{youth:false,apps:1});assert(c.relationship.pendingDebut);
assert.equal(R.dueRelationship(c),null,'debut is a match checkpoint, never a next-season prep event');
c.hist.push({youth:false,apps:1});
R.applyRelationship(c,'friend:debut',0);assert.equal(c.relationship.affinity,1);
assert(!c.relationship.pendingDebut);
R.applyRelationship(c,'friend:debut',0);assert.equal(c.relationship.affinity,1,'retry cannot apply twice');
c.age=20;assert.equal(R.dueRelationship(c),null,'space relationship choices across seasons');
c.age=21;assert.equal(R.dueRelationship(c),'outing');R.applyRelationship(c,'friend:outing',0);
c.age=23;assert.equal(R.dueRelationship(c),'confession');R.applyRelationship(c,'friend:confession',0);
R.recordRelationshipTransfer(c,'KOR','KOR');assert(!c.relationship.foreign);
R.recordRelationshipTransfer(c,'KOR','ENG');c.age=25;assert.equal(R.dueRelationship(c),'foreign');
R.applyRelationship(c,'friend:foreign',0);assert.equal(c.relationship.status,'dating');
c.age=28;assert.equal(R.dueRelationship(c),'proposal');R.applyRelationship(c,'friend:proposal',0);
assert.equal(c.relationship.status,'married');assert.equal(R.dueRelationship({...c,age:35}),null);assert.equal(c.relationship.done.length,5);
const declined={age:23,relationship:R.createRelationship('ENG'),hist:[{youth:false,apps:1}]};
declined.relationship.done=['debut','outing'];declined.relationship.affinity=2;R.applyRelationship(declined,'friend:confession',1);
assert.equal(R.dueRelationship({...declined,age:30}),null,'friendship does not automatically become marriage');
const separated=structuredClone(declined);separated.relationship.status='dating';R.applyRelationship(separated,'friend:foreign',1);assert.equal(R.dueRelationship({...separated,age:30}),null);

// Verify actual simulation paths, injury resumption, protected call-ups and signed saves.
const base=S.createCareer(input,0,71);
Object.assign(base,{age:23,lv:3,proAt:18,num:9,ev:'friend:confession',ovr:60,st:Array(5).fill(60),peak:60});
base.relationship.done=['debut','outing'];base.relationship.affinity=2;
const yes=structuredClone(base),no=structuredClone(base);
const yr=S.playSeason(yes,{train:'균형',evPick:0,injPick:1}).row;
const nr=S.playSeason(no,{train:'균형',evPick:1,injPick:1}).row;
for(const key of ['apps','starts','goals','ast','ovr','injured','rating','rank'])assert.equal(yr[key],nr[key],`romance choice must not reroll football: ${key}`);
assert.equal(yes.relationship.status,'dating');assert.equal(no.relationship.status,'friend');
yes.offers=[{c:S.clubByName('플라멩구'),kind:'도전'}];S.nextSeason(yes,0,0);assert(yes.relationship.foreign,'completed cross-country move is recorded');
const old=S.createCareer(input,0,91);delete old.relationship;S.playSeason(old,{train:'균형',evPick:0,injPick:1});S.nextSeason(old,null,0);assert.equal(S.playerView(old).relationship,null);
let injuryTested=false;
for(let seed=1;seed<=100&&!injuryTested;seed++){
  const injured=structuredClone(base);injured.seed=seed;
  const first=S.playSeason(injured,{train:'균형',evPick:0});
  if(first.injury){
    assert(!injured.relationship.done.includes('confession'),'pending injury must not consume choice');
    S.playSeason(injured,{train:'균형',evPick:0,injPick:1});
    assert.equal(injured.relationship.done.filter(k=>k==='confession').length,1);injuryTested=true;
  }
}
assert(injuryTested);
const callup=structuredClone(base);Object.assign(callup,{age:20,ovr:90,peak:90,st:Array(5).fill(90)});
assert(S.nationalCallupPlan(callup));assert.equal(S.prepView(callup).event.id,'natcall','call-up keeps its mandatory decision slot');
process.env.WHOAMI_SECRET='relationship-test-only';
const codec=tokenCodec('career-token-v1',{zip:true});assert.deepEqual(codec.open(codec.seal(c)),c);
console.log('PASS relationship: regional casting, debut gates, five spaced decisions, friendship/marriage/breakup, completed transfer, unchanged football outcomes, injury resume, old saves and signed state');

// Full careers: accept relationship choices and check they remain bounded.
let married=0,events=0,annual=0;
for(let seed=1;seed<=60;seed++){
  const state=S.createCareer({...input,nation:['KOR','JPN','BRA','NGA','ENG'][seed%5]},0,seed);
  for(let year=0;year<26&&state.phase!=='retired';year++){
    let prep=S.prepView(state);
    assert(prep.friendIntro||prep.friendEvent,'every preparation year has a relationship choice');annual++;
    if(prep.friendIntro){S.completeRelationshipPrep(state,0);prep=S.prepView(state);}
    if(prep.friendEvent){
      const career=prep.event.id;events++;assert(prep.friendEvent.replies.length===2);
      S.completeRelationshipPrep(state,0);assert.equal(S.prepView(state).event.id,career,'relationship must not replace the career event');
    }
    assert.equal(state.relationship.prepAge,state.age);
    assert.equal(S.prepView(state).friendEvent,null,'annual choice cannot repeat after saving');
    S.playSeason(state,{train:'균형',evPick:0,injPick:1});
    if(state.relationship.pendingDebut){events++;R.applyRelationship(state,'friend:debut',0);}
    if(state.military?.status==='pending'&&state.age===27)S.militaryAction(state,'regular');
    S.nextSeason(state,state.released&&state.offers.length?0:null,0);
    assert(state.relationship.done.length<=5);
  }
  const card=S.cardView(state);assert.equal(card.relationship.id,state.relationship.region);
  if(card.relationship.status==='married'){married++;assert(card.relationship.marriedAge>=28);}
}
assert(married>0);console.log('PASS 60 complete careers:',events,'relationship decisions,',married,'married retirement cards');

// The match-time event must survive encrypted saves and block next season until seen.
const {default:handler}=await import('../arsenal-dashboard/api/career.js');
async function api(action,body){
  let status=200,data;
  await handler({method:'POST',query:{a:action},body,headers:{}},{setHeader(){},status(n){status=n;return this;},json(v){data=v;}});
  return {status,data};
}
const first=S.createCareer(input,0,5);
Object.assign(first,{age:19,lv:3,proAt:18,num:9,ev:'coach',ovr:78,peak:78,st:Array(5).fill(78)});
S.playSeason(first,{train:'균형',evPick:0,injPick:1});assert(first.relationship.pendingDebut);
const firstToken=codec.seal(first),before=structuredClone(first.tot);
assert.equal((await api('next',{token:firstToken})).status,400);
assert.equal((await api('friend-debut',{token:firstToken,pick:2})).status,400);
const finished=await api('friend-debut',{token:firstToken,pick:0});assert.equal(finished.status,200);
const saved=codec.open(finished.data.token);assert(!saved.relationship.pendingDebut);assert(saved.relationship.done.includes('debut'));assert.deepEqual(saved.tot,before);
assert.equal((await api('friend-debut',{token:finished.data.token,pick:0})).status,400);
const ongoing=structuredClone(first);ongoing.phase='prep';ongoing.hist=[];delete ongoing.relationship.pendingDebut;ongoing.relationship.prepAge=ongoing.age;
assert.equal((await api('friend-debut',{token:codec.seal(ongoing),pick:0})).status,400);
let injuryCheckpoint=false;
for(let seed=1;seed<=60&&!injuryCheckpoint;seed++){
  const test=structuredClone(ongoing);test.seed=seed;test.relationship.done=[];
  const response=await api('season',{token:codec.seal(test),train:'균형',evPick:0});
  if(response.data.phase==='injury'&&response.data.player.relationship.pendingDebut){
    assert(response.data.pre.apps>0);const ack=await api('friend-debut',{token:response.data.token,pick:1});assert.equal(ack.status,200);
    const resume=await api('season',{token:ack.data.token,injPick:1});assert.equal(resume.status,200);
    assert.equal(codec.open(resume.data.token).relationship.done.filter(k=>k==='debut').length,1);injuryCheckpoint=true;
  }
}
assert(injuryCheckpoint);console.log('PASS match checkpoint API: save/resume, invalid phases/picks, next-season guard, unchanged records, injury-before-finish acknowledgment');

const intro=S.createCareer(input,0,8),introToken=codec.seal(intro),careerEvent=S.prepView(intro).event.id;
assert.equal(S.prepView(intro).friendIntro.a.length,3);
assert.equal((await api('season',{token:introToken,train:'균형',evPick:0})).status,400,'intro must precede the season');
assert.equal((await api('friend-prep',{token:introToken,pick:3})).status,400);
const introReply=await api('friend-prep',{token:introToken,pick:2});assert.equal(introReply.status,200);
assert.equal(introReply.data.prep.friendIntro,null);assert.equal(introReply.data.prep.event.id,careerEvent);
assert.equal(introReply.data.prep.selected,null,'a messenger reply is not a season decision');
assert.equal(codec.open(introReply.data.token).relationship.introPick,2);
assert.equal((await api('friend-prep',{token:introReply.data.token,pick:0})).status,400,'intro is not repeated after a reload');
const paired=structuredClone(base);Object.assign(paired,{age:22,ovr:90,peak:90,st:Array(5).fill(90),ev:'natcall'});
paired.relationship.done=['debut'];paired.relationship.lastAge=19;
assert(S.nationalCallupPlan(paired));
const pairedPrep=S.prepView(paired);assert.equal(pairedPrep.friendEvent.id,'friend:outing');assert.equal(pairedPrep.event.id,'natcall');
const pairReply=await api('friend-prep',{token:codec.seal(paired),pick:0});assert.equal(pairReply.status,200);
assert.equal(pairReply.data.prep.friendEvent,null);assert.equal(pairReply.data.prep.event.id,'natcall');assert.equal(pairReply.data.prep.selected,null);
assert.equal(codec.open(pairReply.data.token).evPick,null);
const loan=structuredClone(base);loan.age=21;loan.ev='loan';loan.loanClubs=[S.clubByName('플라멩구')];loan.relationship.done=['debut'];loan.relationship.lastAge=19;
S.completeRelationshipPrep(loan,1);assert.equal(loan.ev,'loan');assert.equal(loan.loanClubs[0].n,'플라멩구','loan choices survive the preceding relationship event');
assert.equal((await api('friend-prep',{token:firstToken,pick:0})).status,400,'prep response cannot change a finished season');
console.log('PASS relationship-first order: intro reply/resume, separate season choice, call-up and loan preserved, phase guards');

for(const status of ['friend','close','dating','married','separated']){
  const state=S.createCareer(input,0,5);state.age=32;state.relationship.introDone=true;state.relationship.status=status;
  const event=S.prepView(state).friendEvent;assert(event.id.startsWith('friend:daily:'));
  assert.equal(event.channel,status==='separated'?'reflection':'message');
  const before=structuredClone(state.relationship.done);S.completeRelationshipPrep(state,1);
  assert.deepEqual(state.relationship.done,before);assert.equal(state.relationship.status,status);
  assert.equal(S.prepView(state).friendEvent,null);
  state.age++;assert(S.prepView(state).friendEvent);
}
console.log('PASS annual relationship choices:',annual,'seasons; all statuses including marriage/breakup, major-story cap independent, repeat guard and next-year renewal');
