import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as S from '../arsenal-dashboard/api/_career_sim.js';
import * as M from '../arsenal-dashboard/api/_career_military.js';
const input={name:'병역테스트',nation:'KOR',pos:'MF',card:0,foot:'오른발',body:'표준',num:8,dream:'아스날'};
function fixture(seed=1,age=27,nation='KOR',ovr=76){
  const c=S.createCareer({...input,nation},0,seed);Object.assign(c,{age,lv:3,club:S.clubByName('FC 서울'),ovr,peak:ovr,st:Array(5).fill(ovr),awoken:true,proAt:18,num:8,cEnd:32,ev:'coach'});return c;
}
const play=c=>S.playSeason(c,{train:'균형',evPick:0,injPick:1});
const result=(seed=1,age=27,ovr=76)=>{const c=fixture(seed,age,'KOR',ovr);play(c);return c;};
let count=0;
function check(name,fn){fn();count++;console.log('PASS',name);}
check('상무는 유스·일반 이적·임대 후보에서 제외',()=>{
  for(let seed=1;seed<=300;seed++){
    assert(S.firstClubs('KOR','MF',0,seed).every(o=>o.club.n!==M.SANGMU));
    const c=fixture(seed,20,'KOR',57);c.dream=M.SANGMU;const r=play(c);assert(r.offers.every(o=>o.n!==M.SANGMU));
    const p=S.prepView(c);assert(!p.loanClubs?.some(o=>o.n===M.SANGMU));
  }
});
check('지원 자격·중복 지원·일반 이적 우회 방지',()=>{
  assert.throws(()=>S.militaryAction(fixture(),'apply'));
  for(const age of [18,28]){const c=result(2,age);assert.throws(()=>S.militaryAction(c,'apply'));}
  const foreign=fixture(2,26,'ENG');play(foreign);assert.throws(()=>S.militaryAction(foreign,'apply'));
  const c=result();const a=structuredClone(c),b=structuredClone(c);S.militaryAction(a,'apply');S.militaryAction(b,'apply');assert.equal(a.military.outcome,b.military.outcome);assert.throws(()=>S.militaryAction(a,'apply'));
  const locked=result();locked.offers=[{c:S.clubByName('아스날'),kind:'도전'}];assert.throws(()=>S.nextSeason(locked,0));
});
check('조건 충족 후 별도 면제 확률 없음 · AG 은메달은 대상 제외',()=>{
  let gold=false,silver=false;
  for(let seed=1;seed<100;seed++){
    const c=fixture(seed,22);const t={kind:'asian',year:2034,name:'아시안게임'};const r=M.resolveTournament(c,t,7);
    if(r.place===1){assert.equal(c.military.status,'arts');assert.equal(r.place,1);gold=true;}
    if(r.place===2){assert(r.medal);assert.equal(c.military.status,'pending');assert(!r.qualified);silver=true;}
  }assert(gold&&silver);
});
check('발탁 여부·성적은 반복 조회와 훈련 선택에 따라 리롤되지 않음',()=>{
  for(let seed=1;seed<=500;seed++){
    const c=fixture(seed,22);const a=M.tournamentView(c),b=M.tournamentView(c);assert.deepEqual(a,b);
    if(a){const x=structuredClone(c),y=structuredClone(c);x.train='강점 강화';y.train='약점 보완';assert.equal(M.resolveTournament(x,a,7).medal,M.resolveTournament(y,a,7).medal);}
  }
});
check('최종 명단 발탁 후 메달 확률 30~40% / 8~15%',()=>{
  for(const [kind,year,lo,hi] of [['asian',2034,.30,.40],['olympic',2032,.08,.15]]){
    let medals=0;for(let seed=1;seed<=12000;seed++){const c=fixture(seed,22);const r=M.resolveTournament(c,{kind,year,name:kind==='asian'?'아시안게임':'올림픽'},7);if(kind==='asian'?r.place===1:r.medal)medals++;}
    const rate=medals/12000;assert(rate>=lo&&rate<=hi,`${kind}: ${rate}`);console.log(' measured',kind,(rate*100).toFixed(2)+'%');
  }
});
check('상무 18개월 · 전역 시즌 양 팀 기록 합계·원소속 복귀',()=>{
  let c;for(let seed=1;seed<100;seed++){c=result(seed);S.militaryAction(c,'apply');if(c.military.choice==='sangmu')break;}
  assert.equal(c.military.choice,'sangmu');const original=c.club.n,oldTotal=c.tot.apps;
  S.nextSeason(c,null,0);assert.equal(c.age,28);assert.equal(S.playerView(c).club.n,M.SANGMU);const a=play(c);assert.equal(a.row.service.months,12);assert.equal(c.military.left,6);assert.equal(a.offers.length,0);
  S.nextSeason(c,null,0);assert.equal(S.playerView(c).club.n,M.SANGMU);const b=play(c);assert.equal(c.military.status,'completed');assert.equal(c.club.n,original);assert.equal(b.row.service.months,6);
  for(const k of ['games','apps','goals','ast','cs','starts'])assert.equal(b.row.segments.reduce((n,s)=>n+s[k],0),b.row[k]);
  assert.equal(c.tot.apps-oldTotal,a.row.apps+b.row.apps);assert.equal(c.hist.length,3);assert.equal(S.playerView(c).hist.length,4);
});
check('일반 복무는 0경기 · 대표팀·수상·훈련 없음 · 6개월 복귀 시즌',()=>{
  const c=result();S.militaryAction(c,'regular');const total=structuredClone(c.tot),ovr=c.ovr;
  S.nextSeason(c,null,0);assert(S.prepView(c).service.fullRegular);let r=play(c);assert.equal(r.row.games,0);assert.equal(r.row.apps,0);assert.equal(r.row.rank,null);assert.deepEqual(c.tot,total);assert.equal(c.ovr,ovr-1);assert.equal(r.row.hon.length,0);assert.equal(c.military.left,6);
  S.nextSeason(c,null,0);r=play(c);assert.equal(c.military.status,'completed');assert.equal(r.row.service.months,6);assert(r.row.games>0&&r.row.games<30);assert(c.tot.apps>total.apps);assert.equal(c.club.n,'FC 서울');
});
check('남은 6개월 먼저 전역 · 이벤트/나이/시즌 기록 보존 · 반 시즌 계산 동일',()=>{
 for(let seed=1;seed<=100;seed++){
  const c=result(seed);S.militaryAction(c,'regular');S.nextSeason(c,null,0);play(c);S.nextSeason(c,null,0);
  const legacy=structuredClone(c),age=c.age,ev=c.ev,total=structuredClone(c.tot),hist=c.hist.length;
  S.regularReturn(c);assert.equal(c.military.status,'completed');assert.equal(c.military.left,0);assert.equal(c.age,age);assert.equal(c.ev,ev);assert.deepEqual(c.tot,total);assert.equal(c.hist.length,hist);
  assert.equal(S.prepView(c).service,null);assert.equal(S.prepView(c).returnPeriod.months,6);assert.equal(S.prepView(c).international,null);
  const before=structuredClone(c);S.regularReturn(c);assert.deepEqual(c,before);
  const a=play(legacy),b=play(c);assert.deepEqual(b.row,a.row);assert.deepEqual(c.tot,legacy.tot);assert.equal(c.returnService,undefined);
 }
 const full=result();S.militaryAction(full,'regular');S.nextSeason(full,null,0);assert.throws(()=>S.regularReturn(full));assert.throws(()=>S.regularReturn(fixture(1,26,'ENG')));
});
check('체육요원·이행 완료·구형 저장 데이터',()=>{
  const arts=result();arts.military.status='arts';assert.throws(()=>S.militaryAction(arts,'apply'));S.nextSeason(arts,null,0);assert.equal(arts.military.status,'arts');
  const old=fixture(7,32);delete old.military;assert.equal(S.militaryView(old).status,'legacy');assert.equal(S.prepView(old).service,null);
  const young=fixture(7,26);delete young.military;assert.equal(S.militaryView(young).status,'pending');
  assert.equal(S.militaryView(fixture(7,26,'ENG')),null);
});
check('부상 중 재개해도 지원·대회·복무 상태 보존',()=>{
  const c=fixture(99,22);c.inj={name:'가벼운 부상',games:4,major:false};c.phase='injury';c.evPick=0;c.seasonTournament={kind:'asian',year:2034,name:'아시안게임',wild:false};
  const before=structuredClone(c);const a=S.playSeason(c,{train:'균형',evPick:0,injPick:1});const b=S.playSeason(before,{train:'균형',evPick:0,injPick:1});assert.deepEqual(a.row.international,b.row.international);
});
// 실제 API 암호화 토큰으로 재개·자격 검증. 외부 API나 운영 비밀값은 사용하지 않는다.
process.env.WHOAMI_SECRET='unit-test-only-'+crypto.randomBytes(16).toString('hex');
const {default:handler}=await import('../arsenal-dashboard/api/career.js');
const {tokenCodec}=await import('../arsenal-dashboard/api/_token.js');const codec=tokenCodec('career-token-v1',{zip:true});
async function api(a,body){let code=200,data;await handler({method:'POST',query:{a},body,headers:{}},{setHeader(){},status(c){code=c;return this;},json(d){data=d;return this;}});return {code,data};}
const c=result();const token=codec.seal(c);const applied=await api('military',{token,action:'regular'});assert.equal(applied.code,200);assert.equal(applied.data.player.military.selected,'regular');
// This synthetic career's only recorded season is also its first actual pro appearance.
const contact=await api('friend-debut',{token:applied.data.token,pick:1});assert.equal(contact.code,200);assert.equal(contact.data.player.military.selected,'regular');
const next=await api('next',{token:contact.data.token,pick:null,trait:0});assert.equal(next.code,200);assert.equal(next.data.prep.service.fullRegular,true);
assert.equal(next.data.prep.friendEvent.channel,'message');
const serviceReply=await api('friend-prep',{token:next.data.token,pick:1});assert.equal(serviceReply.code,200);assert.equal(serviceReply.data.prep.friendEvent,null);
const finished=await api('season',{token:serviceReply.data.token,train:'균형',evPick:0});assert.equal(finished.code,200);assert.equal(finished.data.result.row.apps,0);assert.equal(finished.data.player.military.left,6);
const bad=await api('military',{token:next.data.token,action:'apply'});assert.equal(bad.code,400);count++;console.log('PASS API 토큰 재개·부적절한 단계 거부');
const returnPrep=await api('next',{token:finished.data.token,pick:null,trait:0});assert.equal(returnPrep.data.prep.service.left,6);
const returned=await api('service-return',{token:returnPrep.data.token});assert.equal(returned.code,200);assert.equal(returned.data.player.military.status,'completed');assert.equal(returned.data.prep.service,null);assert.equal(returned.data.prep.returnPeriod.months,6);
const repeat=await api('service-return',{token:returned.data.token});assert.equal(repeat.code,200);assert.deepEqual(repeat.data.prep,returned.data.prep);
assert(returned.data.prep.friendEvent,'a due relationship event follows discharge before season preparation');
const ready=await api('friend-prep',{token:returned.data.token,pick:1});assert.equal(ready.code,200);assert.equal(ready.data.player.military.status,'completed');
const half=await api('season',{token:ready.data.token,train:'균형',evPick:0,injPick:1});assert.equal(half.code,200);assert.equal(half.data.result.row.service.months,6);assert(half.data.result.row.games>0&&half.data.result.row.games<30);
assert.equal((await api('service-return',{token:next.data.token})).code,400);assert.equal((await api('service-return',{token:half.data.token})).code,400);count++;console.log('PASS API 전역 먼저 처리 · 토큰 재개/중복 요청 안전 · 반 시즌 유지');
console.log(`${count} military scenarios passed`);
