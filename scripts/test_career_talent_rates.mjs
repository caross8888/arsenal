import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {makeCase} from './lib/career-reroll-cases.mjs';
import * as S1 from '../arsenal-dashboard/public/career/sim-v1/sim.js';
import * as S2 from '../arsenal-dashboard/public/career/sim-v2/sim.js';
import {replay} from '../arsenal-dashboard/public/career/sim-v2/local.js';
process.env.WHOAMI_SECRET='test-only-secret';delete process.env.KV_REST_API_URL;
const {default:handler}=await import('../arsenal-dashboard/api/career.js');
const {tokenCodec}=await import('../arsenal-dashboard/api/_token.js');
const {open}=tokenCodec('career-token-v1',{zip:true});
const call=async(body,expected=200)=>{let code=200,out;await handler({method:'POST',query:{a:'commit'},headers:{},body},{setHeader(){},status(n){code=n;return this;},json(j){out=j;}});assert.equal(code,expected,JSON.stringify(out));return out;};
// Freeze deployed v1 sources: existing transcripts and cached browser modules must stay reproducible.
const deployedV1Hashes={"sim.js": "1034f7c86068b66f394d937fcae4cb083e960ec7b192ea5616a1bcb90837a8cd", "flow.js": "124243f05776c88e4fe19db9ce2221b8cfbc2517cae75f0bdd7cb87540c5c1d9", "local.js": "9f54def747c1b3c3f43a1b13d08c6ded0dcd175ddd3565f6f1977280de9b9eef"};
for(const [f,hash] of Object.entries(deployedV1Hashes)){
 const file=new URL('../arsenal-dashboard/public/career/sim-v1/'+f,import.meta.url);
 assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),hash,'deployed v1 unchanged '+f);
}
const eps=(x,y)=>assert(Math.abs(x-y)<1e-12,`${x} != ${y}`);
for(let b=0;b<=4;b++){
 const p=S2.talentThresholds(b),oldGen=.02+b*.00375,oldWonder=.131+b*.015;
 eps(p.gen-oldGen,.01);eps((p.wonder-p.gen)-oldWonder,.01);eps(p.prospect-p.wonder,.33);eps((1-p.prospect)-(1-oldGen-oldWonder-.33),-.02);
 // Seed roll distribution measures independent tiers, not cumulative cutoffs.
 const n=200000,counts=[0,0,0,0];
 for(let seed=0;seed<n;seed++){
  const tr=S1.mulberry(seed^S1.hashStr('talent'))();
  counts[tr<p.gen?0:tr<p.wonder?1:tr<p.prospect?2:3]++;
 }
 const expected=[.03+b*.00375,.141+b*.015,.33,1-(.03+b*.00375)-(.141+b*.015)-.33];
 expected.forEach((p,i)=>assert(Math.abs(counts[i]/n-p)<.003,'measured tier frequency'));
}
for(let i=0;i<2000;i++){
 const c=makeCase(i,2);assert.equal(c.state.simVersion,2);assert.deepEqual(replay(c.record),c.state);
 if(i<20){
  const next={pick:null,trait:c.state.traitOffer?.length?0:null},j=await call({...c.record,next}),C=open(j.token);
  assert.equal(C.simVersion,2);assert.equal(C.seed,c.record.seed);assert(Number.isInteger(C.seed2));assert.equal(j.player.age,19);
  for(const k of ['ovr','st','talent','tier','scout18','late','lookId'])assert.deepEqual(C[k],c.state[k],k+' retained after confirmation');
 }
}
const old=makeCase(11,1),next={pick:null,trait:old.state.traitOffer?.length?0:null};
const result=await call({...old.record,next});assert.equal(open(result.token).simVersion,undefined,'v1 records still use original rules');
// v3가 추가됐으므로 미지원 버전 검사는 다음 버전으로 유지한다.
await call({...old.record,version:4,next},400);
// A v2 invalid record must remain a 400 input error, not a different-class 500.
const invalid=structuredClone(makeCase(10,2).record);invalid.choices.find(c=>c.a==='season').train='invalid';await call({...invalid,next},400);
console.log('PASS talent rates: gen +1pp, wonder +1pp, prospect unchanged, normal -2pp; 1,000,000 sampled rolls; 2,000 v2 replays; v1 frozen and API version compatibility');
