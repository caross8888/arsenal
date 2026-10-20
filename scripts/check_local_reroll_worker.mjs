// 별도 터미널에서 Wrangler를 8797 포트로 로컬 실행한 뒤 테스트 전용 키로 검사한다.
import assert from 'node:assert/strict';
import {makeCase} from './lib/career-reroll-cases.mjs';
import {tokenCodec} from '../arsenal-dashboard/api/_token.js';
const codec=tokenCodec('career-token-v1',{zip:true});
for(let i=0;i<25;i++){
 const c=makeCase(i),next={pick:null,trait:c.state.traitOffer?.length?0:null};
 const resp=await fetch('http://127.0.0.1:8797/api/career?a=commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...c.record,next})});
 const v=await resp.json();assert.equal(resp.status,200,JSON.stringify(v));assert.equal(v.phase,'prep');assert.equal(v.player.age,19);assert.equal(v.player.lookId,c.state.lookId);
 const C=codec.open(v.token);assert.equal(C.seed,c.record.seed);assert(Number.isInteger(C.seed2));
 const old={...c.state,id:'legacy-workerd'};delete old.lookId;
 const resume=await fetch('http://127.0.0.1:8797/api/career?a=view',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:codec.seal(old)})});
 const o=await resume.json();assert.equal(resume.status,200,JSON.stringify(o));assert.equal(o.player.age,18);
}
console.log('PASS local workerd: 25 commit paths and 25 legacy token resumes, Node/Workers AES-GCM+deflate compatibility');
