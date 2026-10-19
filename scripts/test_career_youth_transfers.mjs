import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as S from '../arsenal-dashboard/api/_career_sim.js';
const input={name:'유스테스트',nation:'ENG',pos:'FW',card:0,foot:'오른발',body:'표준',num:9};
const fixture=(seed,age=15)=>{const c=S.createCareer(input,0,seed);c.age=age;c.lv=age===15?0:1;return c;};
const scout=fixture(3);scout.ev='scout';scout.scoutClub=S.clubByName('아스날');
const from=scout.club.n,target=scout.scoutClub.n;
assert.notEqual(from,target);
S.acceptScout(scout);assert.equal(S.playerView(scout).club.n,target);assert.equal(S.prepView(scout).selected,0);
assert.equal(scout.hist.length,0,'accepting a transfer must not consume a season');
S.acceptScout(scout);assert.equal(scout.scoutMove,from,'repeated acceptance must be idempotent');
const declined=fixture(3);declined.ev='scout';declined.scoutClub=S.clubByName('아스날');
S.playSeason(declined,{train:'균형',evPick:1,injPick:1});assert.equal(declined.club.n,from);assert.equal(declined.hist[0].club,from);
const row=S.playSeason(scout,{train:'균형',evPick:1,injPick:1}).row;
assert.equal(row.club,target);assert(row.team.startsWith(target));assert.equal(scout.club.n,target);assert(!scout.scoutMove);
assert(row.notes.some(n=>n.includes(from)&&n.includes(target)));
let released,kept;
for(let seed=1;seed<=500&&(!released||!kept);seed++){
 const c=fixture(seed,17);Object.assign(c,{club:S.clubByName('아스날'),ovr:52,peak:52,st:Array(5).fill(52),ev:'extra'});
 const r=S.playSeason(c,{train:'균형',evPick:1,injPick:1});
 if(r.released){released=c;assert(r.offers.length);assert.equal(c.hist[0].club,'아스날');}
 else if(c.last.starts/c.last.games<.4) kept=c;
}
assert(released&&kept);
const releaseTarget=released.offers[0].c.n;assert.notEqual(releaseTarget,released.club.n);
const next=structuredClone(released);S.nextSeason(next,0);assert.equal(next.club.n,releaseTarget);assert.equal(next.age,18);assert.equal(next.phase,'prep');
const stay=structuredClone(kept),keepClub=stay.club.n;S.nextSeason(stay,null);assert.equal(stay.club.n,keepClub,'a permitted stay must not cause a surprise release');
process.env.WHOAMI_SECRET=crypto.randomBytes(32).toString('hex');
const {default:handler}=await import('../arsenal-dashboard/api/career.js');
const {tokenCodec}=await import('../arsenal-dashboard/api/_token.js');const codec=tokenCodec('career-token-v1',{zip:true});
async function api(a,body){let status=200,data;await handler({method:'POST',query:{a},headers:{},body},{setHeader(){},status(s){status=s;return this;},json(d){data=d;return this;}});assert.equal(status,200,JSON.stringify(data));return data;}
const original=fixture(3);original.ev='scout';original.scoutClub=S.clubByName('아스날');
const intro=await api('friend-prep',{token:codec.seal(original),pick:0});
const accepted=await api('scout',{token:intro.token});assert.equal(accepted.player.club.n,target);assert.equal(accepted.prep.selected,0);
assert.deepEqual(await api('view',{token:accepted.token}),accepted);
let injuryChecked=false;
for(let seed=1;seed<=100&&!injuryChecked;seed++){
 const c=fixture(seed);c.ev='scout';c.scoutClub=S.clubByName('아스날');
 const contact=await api('friend-prep',{token:codec.seal(c),pick:0});
 const moved=await api('scout',{token:contact.token});
 const first=await api('season',{token:moved.token,train:'균형',evPick:0});
 if(first.phase!=='injury') continue;
 assert.equal(first.player.club.n,target);
 assert.equal((await api('view',{token:first.token})).player.club.n,target);
 const finished=await api('season',{token:first.token,injPick:1});
 assert.equal(finished.result.row.club,target);assert.equal(finished.player.hist.length,1);injuryChecked=true;
}
assert(injuryChecked,'exercise the injury save/resume path after a scout transfer');
let result=await api('season',{token:accepted.token,train:'균형',evPick:1});
if(result.phase==='injury'){assert.equal(result.player.club.n,target);result=await api('season',{token:result.token,injPick:1});}
assert.equal(result.result.row.club,target);assert.equal(result.player.hist[0][7],target);
// Legacy result tokens must expose and use the same new offer after reloading.
const legacy=structuredClone(released);delete legacy.youthReleased;legacy.released=false;legacy.offers=[];
const market=await api('view',{token:codec.seal(legacy)});assert(market.result.released);assert.equal(market.result.offers[0].n,releaseTarget);
const transferred=await api('next',{token:market.token,pick:0,trait:0});assert.equal(transferred.player.club.n,releaseTarget);
const invalid=fixture(3);assert.throws(()=>S.acceptScout(invalid));
console.log('PASS scout acceptance immediately updates player/save, remains accepted through season/injury, records use new club; refusal keeps old club');
console.log('PASS youth release announced before transfer window, new club is selectable, allowed stay preserves club, legacy saved results migrate correctly');
