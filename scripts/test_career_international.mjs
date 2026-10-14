import assert from 'node:assert/strict';
import * as S from '../arsenal-dashboard/api/_career_sim.js';
import {tournamentView,resolveTournament} from '../arsenal-dashboard/api/_career_military.js';
import {nationalSchedule,seniorNationalCalendar,nationalWinChance,NATIONAL_POWER,nationalExpectation,NATIONAL_REACTION_GROUPS,nationalReactionGroup} from '../arsenal-dashboard/api/_career_international.js';
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
assert.equal(seniorNationalCalendar('ENG',2026),null);assert.equal(seniorNationalCalendar('UNKNOWN',2030),null);
let announced=0,ordinaryOnly=0;
for(const {id:nation} of S.NATIONS)for(const age of [18,19,20,21]){
 const c=S.createCareer({...input,nation},0,13);
 Object.assign(c,{age,lv:3,club:S.clubByName('아스날'),ovr:90,peak:90,st:Array(5).fill(90),awoken:true,proAt:18,cEnd:45,ev:'natcall'});c.tot.caps=10;
 const before=structuredClone(c),event=S.prepView(c).event;
 if(!S.nationalCallupPlan(c)){assert.notEqual(event.id,'natcall');assert.equal(S.EVENTS.find(e=>e.id==='natcall').ok(),false);const row=S.playSeason(c,{train:'균형',evPick:0,injPick:1}).row;assert(row.caps>0);assert(!(row.national||[]).some(w=>w.knockout));ordinaryOnly++;continue;}
 assert.equal(event.id,'natcall');assert.equal(S.EVENTS.find(e=>e.id==='natcall').ok(),true);assert(event.callup.windows.every(w=>w.knockout));
 assert.deepEqual(c,before,'preparing a call-up preview must not mutate the saved choice or season');
 assert.equal(event.callup.nation,nation);assert.equal(event.callup.year,2027+age-15);
 assert(event.d.includes(event.callup.nationName));if(event.callup.cup)assert(event.d.includes(event.callup.cup));
 const row=S.playSeason(c,{train:'균형',evPick:0,injPick:1}).row,actual=row.national.filter(w=>w.knockout);
 assert.equal(actual.length,event.callup.windows.length);
 for(const expected of event.callup.windows){const w=actual.find(w=>w.id===expected.id);assert(w);assert.equal(w.name,expected.name);assert.equal(w.month,expected.month);assert(w.matches.some(m=>m.played));}
 announced++;
}
for(const changes of [{age:17},{lv:2},{ovr:30},{nation:'UNKNOWN'},{military:{status:'regular',left:18,home:S.clubByName('아스날')}}]){
 const c=S.createCareer({...input,nation:'KOR'},0,13);Object.assign(c,{age:20,lv:3,ovr:90,ev:'natcall'},changes);c.tot.caps=10;
 assert.equal(S.nationalCallupPlan(c),null);
 if(changes.nation)continue;const ev=S.prepView(c).event;
 assert.notEqual(ev.id,'natcall');assert.equal(S.EVENTS.find(e=>e.id==='natcall').ok(),false);
}
let decliningCallups=0;
for(let seed=1;seed<=16;seed++){
 const c=S.createCareer({...input,nation:'KOR'},0,seed);Object.assign(c,{age:36,lv:3,club:S.clubByName('아스날'),ovr:65,peak:70,st:Array(5).fill(65),awoken:true,proAt:18,cEnd:45,ev:'natcall'});c.tot.caps=10;
 assert(S.prepView(c).event.callup);
 const row=S.playSeason(c,{train:'균형',evPick:0,injPick:1}).row;
 assert(row.caps>0,'an accepted announced call-up must not disappear when season-end ability declines');
 if(row.ovr<65)decliningCallups++;
 assert.equal(c.seasonCallup,undefined,'announced season state must be cleared after completing the season');
}
assert(decliningCallups>0);
assert.equal(ordinaryOnly,30);console.log('PASS 토너먼트 차출 안내',announced,'개 실제 대회 일치, 일반 A매치만 있는',ordinaryOnly,'개 시즌 이벤트 없음, 기량 하락 후 차출 유지');
let refusals=0,ageCallups=0;
for(const nation of ['ENG','BRA','KOR','JPN'])for(const age of [18,20,22])for(const seed of [1,7,13,47])for(const penaltyMode of [false,true]){
 const base=S.createCareer({...input,nation},0,seed);
 Object.assign(base,{age,lv:3,club:S.clubByName('아스날'),ovr:90,peak:90,st:Array(5).fill(90),awoken:true,proAt:18,cEnd:35,ev:'natcall',penaltyMode});
 Object.assign(base.tot,{caps:10,cg:3,ca:2,ccs:1});
 const resting=structuredClone(base),row=S.playSeason(resting,{train:'균형',evPick:1,injPick:1}).row;
 assert.equal(row.caps,0,'refusing call-up must mean no senior appearances');
 assert(!(row.national||[]).some(w=>w.kind==='senior'),'refusal must also exclude senior tournaments');
 for(const key of ['caps','cg','ca','ccs'])assert.equal(resting.tot[key],base.tot[key],'refusal must not add senior career records');
 assert(!row.hon.some(h=>/^(월드컵|유로|코파 아메리카|아시안컵|골드컵|아프리카 네이션스컵)/.test(h.n)),'no senior tournament awards without participation');
 assert(row.notes.some(n=>n.includes('대표팀 일정에는 참가하지 않았어요')));assert(!row.international);assert(!(row.national||[]).some(w=>w.kind==='age'));assert.equal(resting.tot.uCaps||0,base.tot.uCaps||0);
 const accepting=structuredClone(base),accepted=S.playSeason(accepting,{train:'균형',evPick:0,injPick:1}).row;
 assert(accepted.caps>0,'accepting call-up still produces senior appearances');
 assert((accepted.national||[]).some(w=>w.kind==='senior'));if(accepted.international)ageCallups++;
 refusals++;
}
assert(ageCallups>0);
console.log('PASS 통합 차출 거절',refusals,'개: 성인·연령별 모두 불참 및 통산 유지, 수락한 연령별 대회',ageCallups,'개 진행');
for(const {id:nation} of S.NATIONS)if(!['KOR','JPN'].includes(nation))for(const age of [18,22,26]){
 const c=S.createCareer({...input,nation},0,13);Object.assign(c,{age,lv:3,ovr:90});assert.equal(tournamentView(c),null,'Asian Games must be limited to Asian nations');
}
for(const nation of ['KOR','JPN','ENG'])for(const age of [18,20,22,24,26]){
 const c=S.createCareer({...input,nation},0,13);Object.assign(c,{age,lv:3,ovr:60});if(age>23)assert.equal(tournamentView(c),null,'over-age selection needs the wildcard threshold');
}
let ageOnly=0;
for(const [nation,age] of [['KOR',18],['JPN',18],['KOR',20],['JPN',20],['ENG',20]]){
 let base;
 for(let seed=1;seed<=128&&!base;seed++){const c=S.createCareer({...input,nation},0,seed);Object.assign(c,{age,lv:3,club:S.clubByName('아스날'),ovr:60,peak:60,st:Array(5).fill(60),awoken:true,proAt:18,cEnd:45,ev:'coach'});if(tournamentView(c))base=c;}
 assert(base,'need an eligible age-team fixture');const event=S.prepView(base).event;
 assert.equal(event.id,'natcall');assert.equal(event.callup.senior,false);assert.equal(event.callup.windows.length,1);assert.equal(event.callup.windows[0].kind,'age');assert.equal(event.callup.windows[0].wild,false);
 const yes=structuredClone(base),no=structuredClone(base),accepted=S.playSeason(yes,{train:'균형',evPick:0,injPick:1}).row,declined=S.playSeason(no,{train:'균형',evPick:1,injPick:1}).row;
 assert(accepted.international);assert(!(accepted.national||[]).some(w=>w.kind==='senior'&&w.knockout),'age call-up must not silently add an unannounced senior tournament');
 assert(!declined.international);assert(!(declined.national||[]).some(w=>w.knockout));assert.equal(no.tot.uCaps||0,0);
 const medalState=structuredClone(base),gold=resolveTournament(medalState,event.callup.ageTournament,7,1);
 assert.equal(gold.qualified,nation==='KOR','military qualification belongs only to Korean players');
 if(nation!=='KOR')assert.equal(medalState.military,undefined);
 ageOnly++;
}
let wildcard=false;for(let seed=1;seed<=128&&!wildcard;seed++){const c=S.createCareer({...input,nation:'JPN'},0,seed);Object.assign(c,{age:26,lv:3,ovr:90});const t=tournamentView(c);if(t){assert(t.wild);wildcard=true;}}
assert(wildcard);
console.log('PASS 연령별 단독 차출',ageOnly,'개 통합: 아시안게임 아시아권 제한, U-23·와일드카드, 거절 시 미참가, 한국만 병역 혜택');
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
