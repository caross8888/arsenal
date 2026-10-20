import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {makeCase} from './lib/career-reroll-cases.mjs';
import {replay,VERSION,localCall,PREFIX,commitBody} from '../arsenal-dashboard/public/career/sim-v1/local.js';
import {step,view} from '../arsenal-dashboard/public/career/sim-v1/flow.js';
import {eventSeed} from '../arsenal-dashboard/public/career/sim-v1/seeds.js';
process.env.WHOAMI_SECRET='test-only-secret';
delete process.env.KV_REST_API_URL;
const {default:handler}=await import('../arsenal-dashboard/api/career.js');
const {tokenCodec}=await import('../arsenal-dashboard/api/_token.js');
const {open,seal}=tokenCodec('career-token-v1',{zip:true});
const copy=v=>JSON.parse(JSON.stringify(v));
const call=async(a,body,expected=200)=>{let status=200,out;await handler({method:'POST',query:{a},headers:{},body},{setHeader(){},status(n){status=n;return this;},json(v){out=v;}});assert.equal(status,expected,JSON.stringify(out));return out;};
let sample,tags=new Set();const count=Number(process.env.REROLL_CASES)||2000;
for(let i=0;i<count;i++){
 const c=makeCase(i);sample||=c;c.tags.forEach(t=>tags.add(t));
 assert.deepEqual(replay(c.record),c.state);
 if(i<25){
  const r=c.record,original=replay(r),next={pick:null,trait:original.traitOffer?.length?0:null};
  const v=await call('commit',{...r,next,seed2:42,id:'forged',state:{ovr:999}}),C=open(v.token);
  assert.equal(C.seed,r.seed);assert(Number.isInteger(C.seed2));assert.match(C.id,/^[a-f0-9]{16}$/);assert.equal(C.age,19);
  assert(!JSON.stringify(v).includes('seed2'));assert(!v.token.startsWith(PREFIX));
  const expected=copy(original);expected.seed2=C.seed2;expected.id=C.id;step(expected,'next',next,{prefetch:false});
  assert.deepEqual(C,expected,'server ignores client state/id/seed2 and replays all input');
  for(const k of ['lookId','talent','tier','late','body','wf','st','ovr','youthPts','scout18'])assert.deepEqual(C[k],original[k],k+' remains unchanged');
  assert.deepEqual(view(open(v.token)),view(C));
  // 기존 토큰의 같은 결과 화면은 서버 시드를 새로 받지 않는다.
  const old={...copy(original),id:'legacy'};delete old.seed2;
  const legacy=await call('next',{token:seal(old),...next});assert(!('seed2' in open(legacy.token)));
 }
}
for(const tag of ['abroad','scout-action','injury0','injury1','loan','released','ftcall']){
 assert(tags.has(tag),'covered '+tag);
}
const r=sample.record,C=replay(r),next={pick:null,trait:C.traitOffer?.length?0:null};
const invalid=[{...r,seed:-1},{...r,seed:1.1},{...r,seed:2**32},{...r,version:0},{...r,choices:[]},{...r,choices:Array(81).fill({a:'view'})},{...r,choices:[{a:'join',pick:999}]},{...r,choices:[...r.choices,{a:'next',pick:null}]},{...r,choices:[...r.choices.slice(0,1),{a:'retire'}]}];
for(const b of invalid)await call('commit',{...b,next},400);
await call('commit',{...r,next:{pick:999}},400);
const badTrain=copy(r);badTrain.choices.find(x=>x.a==='season').train='FORGED';await call('commit',{...badTrain,next},400);
const badEv=copy(r);badEv.choices.find(x=>x.a==='season').evPick=5;await call('commit',{...badEv,next},400);
const badTrait=copy(r);badTrait.choices.find(x=>x.a==='next'&&x.trait!=null).trait=999;await call('commit',{...badTrait,next},400);
const tok=PREFIX+JSON.stringify(r);assert.deepEqual(commitBody(tok,next),{...r,next});assert.equal(localCall('view',{token:tok}).player.age,18);
assert.throws(()=>localCall('next',{token:tok,...next}));assert.throws(()=>localCall('view',{token:PREFIX+'invalid'}));
assert.equal(eventSeed({seed:123,seed2:0}),0);assert.equal(eventSeed({seed:123}),123);
let futures=[];
for(const seed2 of [0,1,2,3]){const D=copy(C);D.seed2=seed2;step(D,'next',next,{prefetch:false});step(D,'season',{train:'균형',evPick:0,loanPick:0},{prefetch:false});futures.push(JSON.stringify(D));}
assert(new Set(futures).size>1,'private seeds change future events');
let meta;await handler({query:{a:'meta'},headers:{},method:'GET'},{setHeader(){},json(v){meta=v;}});assert.deepEqual(JSON.parse(readFileSync(new URL('../arsenal-dashboard/public/career/sim-v1/meta.json',import.meta.url))),meta,'static meta must be regenerated after balance/data changes');
const times=[];for(let i=0;i<100;i++){const t=performance.now();replay(r);times.push(performance.now()-t);}times.sort((a,b)=>a-b);
console.log(`PASS local reroll: ${count} seeds, API commit/legacy/tamper/boundary checks; branches: ${[...tags].sort().join(', ')}`);
console.log(`Local Node replay wall time only (not Workers CPU): p50=${times[50].toFixed(2)}ms, p95=${times[95].toFixed(2)}ms`);
