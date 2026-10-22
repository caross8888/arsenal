import assert from 'node:assert/strict';
import * as B from '../arsenal-dashboard/public/career/sim-v3/browser.js';
import * as Y from '../arsenal-dashboard/public/career/sim-v3/local.js';
import {stateDigest} from '../arsenal-dashboard/public/career/sim-v3/digest.js';
import {cardView} from '../arsenal-dashboard/public/career/sim-v3/sim.js';
import {makeAdultCase,copy,youthCase} from './lib/career-adult-cases.mjs';
const count=Number(process.env.ADULT_CASES)||2000;let maxBytes=0;
for(let i=0;i<count;i++){
 const c=makeAdultCase(i),sealed='sealed-test-'+i;
 let out=B.fromCommit({token:sealed,seed2:c.root.seed2,state:c.root});
 assert.equal(JSON.parse(out.token.slice(B.PREFIX.length)).stage,'adult');
 for(const {a,...b} of c.choices){out=B.localCall(a,{token:out.token,...b});assert(!out.stayNext&&!out.injOpts,'로컬 선택은 서버 미리 받기 토큰을 만들지 않는다.');}
 assert.equal(out.phase,'retired');assert.deepEqual(out.card,cardView(c.state));
 const body=await B.submitBody(out.token);assert.equal(body.token,sealed);assert.deepEqual(body.choices,c.choices);assert.equal(body.claim.digest,await stateDigest(Y.replayAdult(c.root,body.choices)));
 const record=JSON.parse(out.token.slice(B.PREFIX.length));assert.deepEqual(record.state,c.root,'저장하는 평문 상태는 확정 시점 그대로다.');
 maxBytes=Math.max(maxBytes,new TextEncoder().encode(out.token).length);
 if(i<25){const restored=await import(new URL('../arsenal-dashboard/public/career/sim-v3/browser.js?restore='+i,import.meta.url));assert.deepEqual(restored.localCall('view',{token:out.token}).card,out.card);}
 if((i+1)%250===0)console.log('Browser executor:',i+1);
}
const youth=youthCase(11);let out=B.localCall('new',youth.input,youth.seed);
assert.equal(JSON.parse(out.token.slice(B.PREFIX.length)).stage,'youth');
for(const {a,...b} of youth.choices)out=B.localCall(a,{token:out.token,...b});
assert.deepEqual(B.commitBody(out.token,youth.next),youth,'stage 표식은 기존 확정 HMAC 입력을 바꾸지 않는다.');
assert.throws(()=>B.localCall('view',{token:B.PREFIX+'not-json'}));
assert.throws(()=>B.localCall('view',{token:B.PREFIX+JSON.stringify({version:3,stage:'adult',token:'x',seed2:1,state:{seed2:2},choices:[]})}));
console.log(`PASS v3 browser executor: ${count} full careers, exact server digest/card, 25 cold restores, youth stage/HMAC compatibility, max record ${maxBytes} bytes`);
