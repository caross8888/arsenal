import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import * as S from '../arsenal-dashboard/api/_career_sim.js';
import {championsFinal,clubFinalExpectation} from '../arsenal-dashboard/api/_career_club_final.js';
import {shootoutFor} from '../arsenal-dashboard/api/_career_shootout.js';
import '../arsenal-dashboard/public/career/match-playback.js';
const input={name:'김도윤',nation:'ENG',pos:'FW',card:0,foot:'오른발',body:'표준',num:9};
function fixture(seed,club='아스날',age=19){const c=S.createCareer(input,0,seed);Object.assign(c,{age,lv:3,club:S.clubByName(club),ovr:90,peak:90,st:Array(5).fill(90),awoken:true,proAt:18,cEnd:40,ev:'talk',penaltyMode:true});c.uclNext=c.club.n;return c;}
const choice={train:'균형',evPick:1,injPick:1};
let finals=0,pendingBase,finalBase,flipping;
for(let seed=1;seed<=1000;seed++){
 const base=fixture(seed),c=structuredClone(base),r=S.playSeason(c,choice).row,w=r.clubFinal;
 if(!w)continue;finals++;finalBase=base;const m=w.matches[0];
 assert.equal(w.kind,'club');assert(w.singleMatch);assert.equal(w.matches.length,1);assert.equal(m.stage,'결승');assert.notEqual(w.club.n,w.opponent.n);
 assert(m.g+m.a<=m.our);assert(m.g<=w.goals&&m.a<=w.ast);assert(m.played||(!m.g&&!m.a&&!m.cs));
 assert(!(r.national||[]).some(n=>n.id===w.id),'club final must not enter national windows or records');
 assert.equal(r.hon.some(h=>h.n==='챔피언스리그 우승'),w.won);assert.equal(c.tot.apps,r.apps,'no extra league appearances from the final');
 assert.equal(c.tot.caps,(r.national||[]).filter(w=>w.kind==='senior').flatMap(w=>w.matches).filter(m=>m.played).length);
 const plan=globalThis.CareerMatchReplay.highlights(m,{player:input.name});assert.equal(plan.our,m.our);assert.equal(plan.their,m.their);
 if(w.pending){assert(m.pk.pending);assert.equal(m.our,m.their);pendingBase??=base;
  const yes=shootoutFor(base.seed,m.pk.key,{x:.25,y:.5,power:68}),no=shootoutFor(base.seed,m.pk.key,{x:.5,y:.5,power:0});
  if(yes.won!==no.won)flipping??={base,key:m.pk.key};
 }else assert.equal(w.won,m.pk?m.pk.won:m.our>m.their);
}
assert(finals>100&&pendingBase&&flipping);
for(const nation of ['BRA','KOR','JPN','USA']){const c=fixture(13);c.club={...c.club,nat:nation};assert.equal(S.playSeason(c,choice).row.clubFinal,undefined);}
const youth=fixture(13);youth.lv=1;assert.equal(S.playSeason(youth,choice).row.clubFinal,undefined);
assert.equal(clubFinalExpectation({r:96}),'title');assert.equal(clubFinalExpectation({r:89}),'contender');assert.equal(clubFinalExpectation({r:82}),'underdog');
// Direct model keeps selected final appearance records a subset of existing Champions League stats.
for(const pos of ['FW','MF','DF'])for(const injured of [0,20]){
 const w=championsFinal({seed:7,year:2031,club:S.clubByName('아스날'),baselineWin:true,winChance:.16,apps:30,starts:25,injured,goals:0,ast:0,pos});
 assert.equal(w.matches[0].g,0);assert.equal(w.matches[0].a,0);if(injured)assert(!w.matches[0].played);
}
const kits=globalThis.CareerMatchReplay.selectClubMatchKits(['#ffffff'],['#ffffff']);assert(!globalThis.CareerMatchReplay.kitColoursClash(...kits));
process.env.WHOAMI_SECRET=crypto.randomBytes(32).toString('hex');
const {default:handler}=await import('../arsenal-dashboard/api/career.js');const {tokenCodec}=await import('../arsenal-dashboard/api/_token.js');const codec=tokenCodec('career-token-v1',{zip:true});
async function api(a,body,expected=200){let status=200,data;await handler({method:'POST',query:{a},headers:{},body},{setHeader(){},status(s){status=s;return this;},json(d){data=d;return this;}});assert.equal(status,expected,JSON.stringify(data));return data;}
const initial=await api('season',{token:codec.seal(flipping.base),train:'균형',evPick:1});
let v=initial;if(v.phase==='injury')v=await api('season',{token:v.token,injPick:1});
assert.equal(v.phase,'penalty');assert.equal(v.shootout.window,'club-final');assert.equal(v.shootout.ourName,'아스날');assert.equal(v.preview.hon,undefined);assert(v.preview.clubFinal.pending);
assert.deepEqual(await api('view',{token:v.token}),v);await api('next',{token:v.token},400);
const results=[];for(const power of [68,0]){
 const out=await api('penalty',{token:v.token,key:v.shootout.key,x:power?.25:.5,y:.5,power});
 assert.equal(out.phase,'result');const w=out.result.row.clubFinal;
 assert.equal(w.won,out.penaltyResult.pk.won);assert.equal(out.result.row.hon.some(h=>h.n==='챔피언스리그 우승'),w.won);assert.equal(out.player.hist.length,1);
 const resumed=await api('view',{token:out.token});assert.deepEqual(resumed.result,out.result);assert.deepEqual(resumed.player,out.player);results.push(w.won);
}
assert.notEqual(...results,'the player kick must affect both the final result and its trophy');
// National shootouts resolve before the season-end club final; no extra history rows.
let mixedBase;
for(let seed=1;seed<=1000&&!mixedBase;seed++){
 const base=fixture(seed,'아스날',18),r=S.playSeason(structuredClone(base),{...choice,evPick:0}).row;
 if(r.clubFinal?.pending&&(r.national||[]).some(w=>w.matches.some(m=>m.pk?.pending)))mixedBase=base;
}
assert(mixedBase);
let mixed=await api('season',{token:codec.seal(mixedBase),train:'균형',evPick:0});
if(mixed.phase==='injury')mixed=await api('season',{token:mixed.token,injPick:1});
assert.notEqual(mixed.shootout.window,'club-final');let sawFinal=false;
for(let i=0;mixed.phase==='penalty'&&i<20;i++){
 const final=mixed.shootout.window==='club-final';if(sawFinal)assert(final,'club final must be the last unresolved fixture');sawFinal ||= final;
 mixed=await api('penalty',{token:mixed.token,key:mixed.shootout.key,x:.25,y:.5,power:68});
}
assert(sawFinal);assert.equal(mixed.phase,'result');assert.equal(mixed.player.hist.length,1);
assert.equal(mixed.result.row.hon.some(h=>h.n==='챔피언스리그 우승'),mixed.result.row.clubFinal.won);
// Reactions use club prestige, names and actual final records, without national-team copy.
const html=fs.readFileSync(new URL('../arsenal-dashboard/public/index.html',import.meta.url),'utf8'),ctx=vm.createContext({});
vm.runInContext(html.slice(html.indexOf('var CR_RX='),html.indexOf('function crReactionBtnHtml')),ctx);vm.runInContext(html.match(/function crSfRng\(seed\)[^\n]+/)[0],ctx);ctx.CR_FAN_ID=['fan'];ctx.CR={v:{player:{name:'김도윤',pos:'FW'}}};
let reactions=0;
for(const expectation of ['title','contender','underdog'])for(const won of [true,false])for(let year=2030;year<=2050;year++){
 const w={year,expectation,won,outcome:won?'우승':'준우승',club:{n:'브렌트퍼드'},opponent:{n:'레알 마드리드'},matches:[{played:true,our:won?2:1,their:won?1:2,g:1,a:0,cs:0}]};
 const x=ctx.crClubFinalReaction(w);assert.deepEqual(x,ctx.crClubFinalReaction(w));assert.equal(x.sns.length,5);assert(!/대표팀|국대|체육요원|\{[a-zA-Z가-힣]+\}/.test(JSON.stringify(x)));assert(x.news.body.includes('1골'));
 if(!won)assert((expectation==='underdog'?/기대|발판/:expectation==='title'?/우승|정상/:/성과|경쟁력/).test(x.news.body));reactions++;
}
assert.equal(ctx.crClubFinalReaction({pending:true}),null);
console.log('PASS '+finals+' finals: one match, trophy/score/records consistent, national stats isolated, European senior clubs only; API PK changes trophy with stable save/resume; '+reactions+' prestige-based reaction bundles');
