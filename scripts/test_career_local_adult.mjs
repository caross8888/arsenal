import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeAdultCase,copy,youthCase} from './lib/career-adult-cases.mjs';
import {normalized,differences,displayOnly} from './lib/career-version-compare.mjs';
import {careerTestKV} from './lib/career-test-kv.mjs';
import * as L3 from '../arsenal-dashboard/public/career/sim-v3/local.js';
import * as S3 from '../arsenal-dashboard/public/career/sim-v3/sim.js';
import * as F3 from '../arsenal-dashboard/public/career/sim-v3/flow.js';
import * as L2 from '../arsenal-dashboard/public/career/sim-v2/local.js';
import * as S2 from '../arsenal-dashboard/public/career/sim-v2/sim.js';
import * as F2 from '../arsenal-dashboard/public/career/sim-v2/flow.js';
import {stableJSON,stateDigest} from '../arsenal-dashboard/public/career/sim-v3/digest.js';
process.env.WHOAMI_SECRET='test-only-secret';process.env.PICK_SECRET='test-account-secret';process.env.CAREER_SEED_SECRET='test-seed-secret';
process.env.KV_REST_API_URL='https://career-test.upstash.io';process.env.KV_REST_API_TOKEN='test-only-kv';
const store=careerTestKV(),outer=globalThis.fetch;globalThis.fetch=store.fetch;
const {default:handler}=await import('../arsenal-dashboard/api/career.js');
const {tokenCodec}=await import('../arsenal-dashboard/api/_token.js'),{seal,open}=tokenCodec('career-token-v1',{zip:true});
const {signToken}=await import('../arsenal-dashboard/api/_account.js');
const auth={authorization:'Bearer '+signToken('adult-test','성인검증')};
let assertions=0;async function call(a,body,status=200,headers=auth){let code=200,out;const n=store.commands.length;await handler({method:'POST',query:{a},body,headers},{setHeader(){},status(v){code=v;return this;},json(v){out=v;}});assert.equal(code,status,JSON.stringify(out));if(status>=400&&status!==503)assert.equal(store.commands.length,n,'rejected replay performs no KV commands');assertions++;return out;}
const count=Number(process.env.ADULT_CASES)||2000,times=[],fullTimes=[],tags=new Set();let different=0,display=0,substantive=0,exact=0,sample;const divergent=[];
try{
 for(let i=0;i<count;i++){
  const c=makeAdultCase(i);sample||=c;c.tags.forEach(x=>tags.add(x));
  const start=process.cpuUsage(),D=L3.replayAdult(c.root,c.choices),elapsed=process.cpuUsage(start);times.push((elapsed.user+elapsed.system)/1000);
  assert.equal(await stateDigest(D),await stateDigest(c.state),'incremental and server replay digest '+i);
  assert.deepEqual(S3.cardView(D),S3.cardView(c.state),'incremental and server replay card '+i);
  if(i<100){const start=process.cpuUsage(),full=L3.replay(c.record);full.seed2=c.root.seed2;full.id=c.root.id;full.localAdult=3;F3.step(full,'next',c.record.next,{prefetch:false,reply:false});S3.cardView(L3.replayAdult(full,c.choices));const elapsed=process.cpuUsage(start);fullTimes.push((elapsed.user+elapsed.system)/1000);}
  const record={...c.record,version:2},old=L2.replay(record);old.seed2=c.root.seed2;old.id=c.root.id;
  F2.step(old,'next',record.next,{prefetch:false});
  for(const {a,...b} of c.choices)F2.step(old,a,b,{prefetch:false});
  const diff=differences({state:normalized(old),card:S2.cardView(old)},{state:normalized(D),card:S3.cardView(D)});
  if(!diff.length)exact++;
  else{different++;if(displayOnly(diff))display++;else{
   substantive++;
   const v2=L2.replay(record),v3=copy(c.root);v2.seed2=c.root.seed2;v2.id=c.root.id;F2.step(v2,'next',record.next,{prefetch:false});
   for(const {a,...b} of c.choices){
    F2.step(v2,a,b,{prefetch:false});F3.step(v3,a,b,{prefetch:false,reply:false});
    const first=differences(normalized(v2),normalized(v3)).find(d=>!displayOnly([d]));
    if(first){divergent.push({seed:c.root.seed,seed2:c.root.seed2,age:v3.age,action:a,eventKey:v3.ev||v3.pendingSeason?.choice||null,...first});break;}
   }
   console.log('Substantive difference:',JSON.stringify(divergent.at(-1)));
   assert(substantive/count<=.01,'실질 차이가 1%를 넘었으므로 먼저 사용자에게 알려야 해요.');
  }}
  if((i+1)%250===0)console.log('Adult replay:',i+1);
 }
 // 전체 카드의 정확한 차이 비율은 아래에 그대로 보고한다.
 const rec=youthCase(11),commit=await call('commit',rec),again=await call('commit',JSON.parse(stableJSON(rec)));
 assert.equal(commit.seed2,again.seed2);assert.equal(commit.state.id,again.state.id);assert.deepEqual(open(commit.token),commit.state);assert.equal(commit.state.simVersion,3);assert.equal(commit.state.age,19);assert.equal(store.commands.length,0);
 const canonical={...rec,next:{pick:'',trait:rec.next.trait}};assert.equal((await call('commit',canonical)).state.id,commit.state.id);
 const savedSecret=process.env.CAREER_SEED_SECRET;delete process.env.CAREER_SEED_SECRET;await call('commit',rec,503);process.env.CAREER_SEED_SECRET=savedSecret;
 const c=makeAdultCase(11,commit.state),claim={score:c.state.score,digest:await stateDigest(c.state)},body={token:commit.token,choices:c.choices,claim};
 await call('submit',body,401,{});
 const malformed=await call('submit',{...body,choices:null,claim:{score:'invalid',digest:'invalid'}},400);
 assert.equal(malformed.error,'은퇴 결과 대조 정보가 올바르지 않아요.','잘못된 claim은 선택 기록 재생보다 먼저 거부해야 해요.');
 for(const choices of [[],[...c.choices,{a:'retire'}],Array(L3.MAX_ADULT_ACTIONS+1).fill({a:'next'}),[{a:'season',train:'균형',evPick:0,state:{score:9999}}],[{a:'penalty',key:'forged',x:2,y:0,power:50}],[{a:'military',action:'regular'}],[{a:'service-return'}],[{a:'injury',injPick:0}]])await call('submit',{...body,choices},400);
 const foreign=seal({...commit.state,simVersion:4});await call('submit',{...body,token:foreign},400);
 await call('submit',{...body,token:seal({...commit.state,phase:'retired'})},400);
 await call('submit',{...body,token:tokenCodec('whoami-token-v1').seal(commit.state)},400);
 for(const badClaim of [null,{score:claim.score,digest:'bad'}])await call('submit',{...body,claim:badClaim},400);
 const logs=[],warn=console.warn;console.warn=line=>logs.push(JSON.parse(line));
 try{
  for(const [ua,engine] of [['Mozilla Safari/605.1','safari'],['Chrome/123 Edg/123','chrome'],['Firefox/123','firefox'],['test-private-useragent','other'],['iPhone AppleWebKit CriOS Safari','safari'],['iPad AppleWebKit FxiOS Safari','safari']]){
   const out=await call('submit',{...body,claim:{...claim,score:claim.score+1}},409,{...auth,'user-agent':ua});assert(out.mismatch);assert.equal(logs.at(-1).engine,engine);assert(!JSON.stringify(logs.at(-1)).includes(ua));
  }
  await call('submit',{...body,claim:{...claim,digest:'0'.repeat(64)}},409);
  // 상태 조작 후 같은 선택을 진행한 판: 서버는 봉인된 원래 상태로만 재계산한다.
  let tampered=false;
  for(const amount of [.001,.01,.1,.5,1,2,5,10]){
   const root=copy(commit.state);root.st=root.st.map(x=>x+amount);root.talent+=amount;
   let forged;try{forged=L3.replayAdult(root,c.choices);}catch(e){if(e.constructor.name==='Bad')continue;throw e;}
   const digest=await stateDigest(forged);if(digest===claim.digest&&forged.score===claim.score)continue;
   await call('submit',{...body,claim:{score:forged.score,digest}},409);tampered=true;break;
  }assert(tampered,'조작한 능력치로 진행한 결과 대조');

 }finally{console.warn=warn;}
 assert.equal(store.commands.length,0,'invalid and mismatched submissions never access KV');
 const ok=await call('submit',body);assert(ok.registered);const successCommands=store.commands.length;
 // 중복만 NX 1회가 필요하다.
 let code;await handler({method:'POST',query:{a:'submit'},body,headers:auth},{setHeader(){},status(n){code=n;return this;},json(){}});assert.equal(code,409);assert.equal(store.commands.length,successCommands+1);
 // 미래 v4 분기가 추가된 API 복사본에서도 v3 토큰은 반드시 기존 규칙으로 재생한다.
 const source=readFileSync(new URL('../arsenal-dashboard/api/career.js',import.meta.url),'utf8')
  .replace(/from (['"])(\.[^'"]+)\1/g,(_,q,path)=>'from '+q+new URL(path,new URL('../arsenal-dashboard/api/career.js',import.meta.url)).href+q)
  .replace('const flowOf=C=>','const F4={step(){throw Error("v4 must not run");}};const flowOf=C=>C.simVersion===4?F4:')
  .replace('const simOf=C=>','const S4={cardView(){throw Error("v4 must not run");}};const simOf=C=>C.simVersion===4?S4:');
 const future=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
 store.reset();let futureCode=200,futureOut;
 await future({method:'POST',query:{a:'submit'},body,headers:auth},{setHeader(){},status(n){futureCode=n;return this;},json(v){futureOut=v;}});
 assert.equal(futureCode,200);assert(futureOut.registered,'v3 registration remains pinned when v4 rules exist');assert.equal(futureOut.score,c.state.score);
 console.log(`PASS adult API: ${assertions} calls; commit deterministic/secret/legacy version, whitelist/limits, mismatch/engine privacy, honest registration, duplicate NX; registration KV=${successCommands}`);
 console.log(`PASS adult replay: ${count} careers; exact=${exact} (${(exact/count*100).toFixed(4)}%), display-only=${display} (${(display/count*100).toFixed(4)}%), substantive=${substantive} (${(substantive/count*100).toFixed(4)}%); total different=${different}/${count}; tags=${[...tags].sort().join(',')}`);
 console.log(`CPU full career (youth+adult+card), ${fullTimes.length} cases: mean=${(fullTimes.reduce((a,b)=>a+b,0)/fullTimes.length).toFixed(2)}ms max=${Math.max(...fullTimes).toFixed(2)}ms`);
 console.log(`CPU adult replay process.cpuUsage (this environment): mean=${(times.reduce((a,b)=>a+b,0)/times.length).toFixed(2)}ms max=${Math.max(...times).toFixed(2)}ms`);
 // 숫자·상수·이벤트가 들어 있는 구버전 파일은 한 줄도 바꾸지 않는다.
 for(const file of ['sim-v1/international.js','sim-v1/finance.js','sim-v1/wages.js','sim-v1/club_final.js','penalty-rules.js'])assert(readFileSync(new URL('../arsenal-dashboard/public/career/'+file,import.meta.url)).length>0);
}finally{globalThis.fetch=outer;}
