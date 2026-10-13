import assert from 'node:assert/strict';
import * as S from '../arsenal-dashboard/api/_career_sim.js';
import {nationalSchedule,nationalWinChance,NATIONAL_POWER,nationalExpectation,NATIONAL_REACTION_GROUPS,nationalReactionGroup} from '../arsenal-dashboard/api/_career_international.js';
const sum=(ms,k)=>ms.reduce((n,m)=>n+(m.played?(m[k]||0):0),0);
const input={name:'대표팀테스트',nation:'ENG',pos:'FW',card:0,foot:'오른발',body:'표준',num:9};
for(let seed=1;seed<=1000;seed++){
 const args={seed,nation:'ENG',year:2030,caps:13,goals:8,ast:4,cs:5,cup:'월드컵',cupApps:5,won:seed%2===0};
 const windows=nationalSchedule(args),ms=windows.flatMap(w=>w.matches);
 assert.deepEqual(windows,nationalSchedule(args));
 assert.equal(ms.filter(m=>m.played).length,13);assert.equal(sum(ms,'g'),8);assert.equal(sum(ms,'a'),4);assert.equal(sum(ms,'cs'),5);
 assert(ms.every(m=>m.opp!=='ENG'&&m.g+m.a<=m.our&&(!m.cs||m.their===0)));
 const cup=windows.find(w=>w.name==='월드컵');
 assert.equal(cup.won,args.won);if(args.won)assert(cup.matches.slice(3).every(m=>m.our>m.their));else assert(cup.matches.at(-1).our<cup.matches.at(-1).their);
}
console.log('PASS 대표팀 합계·결정전·시드 일관성 1000개');
for(const nation of ['ENG','BRA','KOR','JPN','USA','NGA'])for(const age of [18,20,22,24]){
 const c=S.createCareer({...input,nation},0,13);Object.assign(c,{age,lv:3,club:S.clubByName('아스날'),ovr:90,peak:90,st:Array(5).fill(90),awoken:true,proAt:18,cEnd:35,ev:'coach'});
 const r=S.playSeason(c,{train:'균형',evPick:0,injPick:1}).row,windows=r.national||[],senior=windows.filter(w=>w.kind==='senior').flatMap(w=>w.matches),ageMs=windows.filter(w=>w.kind==='age').flatMap(w=>w.matches);
 assert.equal(senior.filter(m=>m.played).length,r.caps);assert.equal(sum(senior,'g'),c.tot.cg);assert.equal(sum(senior,'a'),c.tot.ca);assert.equal(sum(senior,'cs'),c.tot.ccs);
 assert.equal(ageMs.filter(m=>m.played).length,c.tot.uCaps||0);
 const cup=windows.find(w=>w.id==='senior-cup');if(cup)assert.equal(cup.won,r.hon.some(h=>h.n===cup.name+' 우승'));
 if(nation==='ENG'&&age===18)assert(cup?.name==='월드컵');
 if(nation==='NGA'&&age===20)assert(cup?.name==='아프리카 네이션스컵');
}
console.log('PASS 6개국 A대표·대륙대회·연령별 대표 기록과 실제 시즌 일치');
assert.deepEqual(nationalSchedule({seed:1,nation:'ENG',year:2027,caps:0,goals:0,ast:0,cs:0}),[]);
console.log('PASS 미차출 시즌에는 대표팀 진행 없음');
for(const name of ['월드컵','유로','코파 아메리카','아시안컵','골드컵','아프리카 네이션스컵'])for(let seed=1;seed<=100;seed++){
 const nation={'월드컵':'ENG','유로':'ENG','코파 아메리카':'BRA','아시안컵':'KOR','골드컵':'USA','아프리카 네이션스컵':'NGA'}[name];
 const w=nationalSchedule({seed,nation,year:2030,caps:10,goals:5,ast:2,cs:2,cup:name,cupApps:5,won:seed%2===0}).find(w=>w.id==='senior-cup'),b=w.bracket;
 if(!b){assert.equal(w.outcome,'조별리그 탈락');continue;}const teams=b.rounds[0].matches.flatMap(m=>[m.a,m.b]);assert(teams.every(Boolean));assert.equal(new Set(teams).size,teams.length);
 b.rounds.forEach((r,i)=>{assert.equal(r.matches.length,teams.length/2**(i+1));r.matches.forEach(m=>{assert([m.a,m.b].includes(m.winner));if(m.ours){const actual=w.matches.find(x=>x.stage===r.stage);assert.equal(m.sa,actual.our);assert.equal(m.sb,actual.their);} });if(i){assert.deepEqual(r.matches.flatMap(m=>[m.a,m.b]),b.rounds[i-1].matches.map(m=>m.winner));}});
 assert.equal(b.winner===nation,w.won);
}
console.log('PASS 6개 대회 실제 대진 연결·유일 참가국·진출/탈락·우승 600개');
for(const place of [1,2,3,4,5]){
 const international={kind:'olympic',name:'올림픽',year:2032,place,medal:place<=3,qualified:place<=3,award:{n:'메달'}};
 const w=nationalSchedule({seed:20,nation:'KOR',year:2032,caps:0,goals:0,ast:0,cs:0,international})[0],b=w.bracket;
 assert.equal(b.winner==='KOR',place===1);assert.equal(!!b.bronze,place===3||place===4);
 if(b.bronze){const sf=b.rounds[1].matches;const losers=sf.map(m=>m.winner===m.a?m.b:m.a);assert(losers.includes('KOR'));assert(losers.includes(b.bronze.opp));}
 if(place===5)assert(w.matches.at(-1).our<w.matches.at(-1).their);
}
console.log('PASS 올림픽 1~5위 진출 경로·4강 패배·실제 동메달 대진 연결');

assert(nationalWinChance('FRA','DOM')>.95);assert.equal(nationalWinChance('FRA','FRA'),.5);
assert.equal(nationalExpectation('KOR','월드컵'),'16강');
let power=0,finals=0,weak=0;for(let seed=1;seed<=2000;seed++){const w=nationalSchedule({seed,nation:'KOR',year:2030,caps:14,cup:'월드컵',cupApps:7,won:true}).find(w=>w.id==='senior-cup'),opp=w.matches.at(-1).opp;power+=NATIONAL_POWER[opp]||60;finals++;if((NATIONAL_POWER[opp]||60)<70)weak++;}
assert(power/finals>85);assert(weak/finals<.03);
console.log('PASS 전력 차이별 승률 · 한국 기대 16강 · 월드컵 결승 상대 전력 평균', (power/finals).toFixed(1), '약팀 비율', (weak/finals*100).toFixed(1)+'%');

const grouped=Object.values(NATIONAL_REACTION_GROUPS).flatMap(g=>g.nations);assert.equal(new Set(grouped).size,15);assert.deepEqual([...grouped].sort(),S.NATIONS.map(n=>n.id).sort());
assert.equal(nationalReactionGroup('KOR'),nationalReactionGroup('JPN'));
assert.equal(nationalExpectation('NGA','아프리카 네이션스컵'),'4강');
assert.equal(nationalExpectation('NOR','유로'),'16강');
console.log('PASS 실제 선택 국가 15개 전부 그룹 지정 · 일본/한국 같은 그룹 · 대륙대회 기대 반영');
