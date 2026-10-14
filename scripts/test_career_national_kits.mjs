import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NATIONS} from '../arsenal-dashboard/api/_career_data.js';
import {NATIONAL_POWER,nationalOpponentPool,nationalSchedule} from '../arsenal-dashboard/api/_career_international.js';
import '../arsenal-dashboard/public/career/match-playback.js';
const {nationalKits,selectMatchKits,kitColoursClash}=CareerMatchReplay;
const data=JSON.parse(readFileSync(new URL('../docs/career-mode/data/national-teams.json',import.meta.url)));
const codes=Object.keys(NATIONAL_POWER);
assert.deepEqual(Object.keys(nationalKits).sort(),codes.slice().sort(),'every supported opponent needs researched kits');
assert.deepEqual(data.teams.map(t=>t.code).sort(),codes.slice().sort());
assert.deepEqual(data.teams.filter(t=>t.selectable).map(t=>t.code).sort(),NATIONS.map(n=>n.id).sort());
for(const team of data.teams){
 assert(team.name&&team.confederation&&NATIONAL_POWER[team.code]);
 assert.equal(team.asianGamesEligible,team.confederation==='AFC'&&team.code!=='AUS');
 for(const kind of ['home','away']){
  const kit=team.kits[kind];assert(kit.verified&&kit.source.startsWith('https://www.footballkitarchive.com/'));
  assert(kit.title.toLowerCase().includes(kind+' kit'));assert(kit.colours&&Number(kit.season.slice(0,4))<=2026);
  assert.match(kit.body,/^#[0-9a-f]{6}$/);assert.equal(nationalKits[team.code][kind].body,kit.body);
  assert.equal(nationalKits[team.code][kind].pattern,undefined,'tokens use solid shirt colours');
 }
}
let checked=0;
for(const a of codes)for(const b of codes){
 if(a===b)continue; // A national team never faces itself.
 const selected=selectMatchKits(a,b),homeClash=kitColoursClash(nationalKits[a].home,nationalKits[b].home);
 assert(!kitColoursClash(...selected),'unresolved colour clash '+a+' / '+b);
 assert.equal(selected.filter(k=>k.type==='away').length,homeClash?1:0,'use both home kits unless they clash');
 selected.forEach((k,i)=>{const nation=i?b:a;assert.equal(k.nation,nation);assert.equal(k.body,nationalKits[nation][k.type].body);});checked++;
}
for(const [a,b] of [['KOR','NOR'],['ENG','GER'],['FRA','ITA']])assert.equal(selectMatchKits(a,b)[1].type,'away','similar home colours require a real away kit');
for(const [a,b] of [['BRA','JPN'],['KOR','ENG'],['GER','NGA'],['KOR','USA']])assert(selectMatchKits(a,b).every(k=>k.type==='home'),'distinct home kits should be retained');
console.log('PASS all',codes.length,'countries, 146 sourced kits and',checked,'pairings: solid palettes, both-home preference and one-team away switch');

const cups={'월드컵':'ENG','유로':'ENG','네이션스리그':'ENG','코파 아메리카':'BRA','아시안컵':'KOR','골드컵':'USA','아프리카 네이션스컵':'NGA','올림픽':'KOR','아시안게임':'KOR'};
const union=new Set(Object.keys(cups).flatMap(nationalOpponentPool));
assert.deepEqual([...union].sort(),codes.slice().sort(),'every opponent pool is covered');
assert(nationalOpponentPool('아시안컵').includes('AUS'));
assert(!nationalOpponentPool('아시안게임').includes('AUS'));
assert.deepEqual(nationalOpponentPool('네이션스리그'),nationalOpponentPool('유로'));
let tournaments=0;
for(const [cup,nation] of Object.entries(cups))for(let seed=1;seed<=30;seed++){
 const allowed=nationalOpponentPool(cup),age=['올림픽','아시안게임'].includes(cup);
 const args={seed,nation,year:2030,caps:age?0:12,cup:age?null:cup,cupApps:age?0:7,won:true};
 if(age)args.international={kind:cup==='아시안게임'?'asian':'olympic',name:cup,place:1,medal:true,award:{n:'금메달'}};
 const w=nationalSchedule(args).find(w=>w.knockout);
 assert(w.bracket);
 const opponents=[...w.matches.map(m=>m.opp),...w.bracket.rounds.flatMap(r=>r.matches.flatMap(m=>[m.a,m.b]))];
 for(const code of opponents){assert(allowed.includes(code),cup+': invalid opponent '+code);assert(nationalKits[code]&&NATIONAL_POWER[code],cup+': missing opponent info '+code);}
 tournaments++;
}
console.log('PASS',tournaments,'tournament samples: actual bracket opponents have strength and kits; Asian Games excludes Australia; Nations League uses Europe');
