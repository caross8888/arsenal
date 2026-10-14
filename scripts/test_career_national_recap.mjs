import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as S from '../arsenal-dashboard/api/_career_sim.js';
import {NATIONAL_REACTION_GROUPS} from '../arsenal-dashboard/api/_career_international.js';
const html=fs.readFileSync(new URL('../arsenal-dashboard/public/index.html',import.meta.url),'utf8');
const ctx=vm.createContext({});
vm.runInContext(html.slice(html.indexOf('var CR_RX='),html.indexOf('function crReactionBtnHtml')),ctx);
vm.runInContext(html.match(/function crSfRng\(seed\)[^\n]+/)[0],ctx);
ctx.CR_NAT_NAME={};ctx.CR_FAN_ID=['local_fan'];
ctx.crNat=id=>S.NATIONS.find(n=>n.id===id)||{n:id};
let seed=1;ctx.crSfSeed=()=>seed;
const input={name:'김도윤',nation:'ENG',pos:'FW',card:0,foot:'오른발',body:'표준',num:9};
const c=S.createCareer(input,0,13);Object.assign(c,{age:19,lv:3,club:S.clubByName('아스날'),ovr:90,peak:90,st:Array(5).fill(90),awoken:true,proAt:18,cEnd:35});
const r=S.playSeason(c,{train:'균형',evPick:0,injPick:1}).row;
ctx.CR={v:{player:S.playerView(c),result:{row:r}},meta:{nationalReactionGroups:NATIONAL_REACTION_GROUPS,club:{'아스날':{nat:'ENG'}}}};
const regular=ctx.crNationalReactionEvents(r).find(e=>e.type==='regular');assert(regular);
assert.equal(regular.matches.length,r.national.filter(w=>!w.knockout).flatMap(w=>w.matches).length);
assert.equal(ctx.crNationalReactionEvents({...r,national:[]}).filter(e=>e.type==='regular').length,0);
const regularOutput=ctx.crNationalReaction(regular);
assert(regularOutput.news.body.includes('일반 A매치'));
assert.equal(regularOutput.sns.length,5);
assert(!/메달|체육요원|기대 성적/.test(JSON.stringify(regularOutput)),'ordinary windows must not borrow medal/tournament copy');
assert.equal(regular.matches.filter(m=>m.played).length,r.caps);
const base={cup:'월드컵',nation:'ENG',year:2030,month:'6월',type:'critic',award:'16강 탈락',result:'16강 탈락',expected:'4강',age:false};
const match={played:true,g:0,a:0,cs:0,opp:'JPN',stage:'16강',our:0,their:1};
let bundles=0;
for(const name of ['김도윤','김민주'])for(const type of ['historic','praise','fair','critic','qualify','medal','win','regular'])for(const kind of ['scorer','creator','defender','quiet','squad','appearances']){
 ctx.CR.v.player.name=name;ctx.CR.v.player.pos=kind==='defender'?'DF':'FW';
 const m={...match,g:kind==='scorer'?3:kind==='appearances'?1:0,a:kind==='creator'?3:0,cs:kind==='defender'?1:0,their:kind==='defender'?0:1,played:kind!=='squad'};
 m.our=m.g+m.a;
 const e={...base,type,cup:type==='regular'?'A매치':'월드컵',award:['qualify','medal'].includes(type)?'금메달':type==='win'?'우승':base.award,result:type==='win'?'우승':type==='historic'?'준우승':type==='praise'?'8강 탈락':base.result,expected:['praise','fair'].includes(type)?'16강':base.expected,matches:[m]};
 for(seed=1;seed<=40;seed++){
  e.year=2030+seed;const x=ctx.crNationalReaction(e),text=JSON.stringify(x);
  assert(!/\{[a-zA-Z가-힣]+\}|탈락로|탈락면|월드컵는|김도윤와|김민주은|신부후보 아이돌/.test(text),text);
  assert.equal(x.sns.length,5);assert.deepEqual(x,ctx.crNationalReaction(e),'reopening must preserve reactions');
  if(kind==='scorer')assert(x.news.body.includes('3골'));
  if(kind==='creator')assert(x.news.body.includes('3도움'));
  if(kind==='defender')assert(x.news.body.includes('무실점'));
  if(kind==='quiet')assert(x.news.body.includes('골과 도움은 기록하지 못했다'));
  if(kind==='squad')assert(x.news.body.includes('출전 기록을 남기지 못했다'));
  if(kind==='appearances')assert(x.news.body.includes('1골'));
  bundles++;
 }
}
for(const won of [true,false]){
 const x=ctx.crNationalReaction({...base,matches:[{...match,our:1,their:1,pk:{won,pending:false}}]});
 assert(x.news.body.includes('승부차기에서 '+(won?'승리':'패')));
}
assert(ctx.crNationalReaction({...base,matches:[{...match,our:0,their:0}]}).news.body.includes('양 팀 모두 득점 없이'));
assert(ctx.crNationalReaction({...base,matches:[{...match,our:2,their:2}]}).news.body.includes('2–2 무승부'));
const old=ctx.crNationalReaction({...base,matches:null});assert(!/0경기|0골|0도움/.test(old.news.body),'legacy records without match data must not invent zeros');
const mixed=ctx.crNationalReactionEvents({...r,national:[...r.national,{knockout:true,name:'월드컵',nation:'ENG',outcome:'16강 탈락',matches:[{...match,g:99}]}]});
assert(!mixed.find(e=>e.type==='regular').matches.some(m=>m.g===99),'regular recap excludes tournament matches');
assert(ctx.crNationalOutcomeVoices('regular')['덕수'].some(t=>t.includes('아이돌 신부후보 순위')));
for(const [i,m]of [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].entries())if(m[1].trim())new vm.Script(m[1],{filename:'index-inline-'+i});
console.log('PASS '+bundles+' reaction bundles: deterministic copy, player records, ordinary recap separated from cups, PK wins/losses, draws and legacy saves');
