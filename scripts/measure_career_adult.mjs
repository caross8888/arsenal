// 유효한 commit·submit을 운영 저장소 없이 measure_api로 잰다.
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {makeAdultCase,youthCase} from './lib/career-adult-cases.mjs';
import {stateDigest} from '../arsenal-dashboard/public/career/sim-v3/digest.js';
process.env.WHOAMI_SECRET='test-only-secret';process.env.CAREER_SEED_SECRET='test-seed-secret';delete process.env.KV_REST_API_URL;
const {tokenCodec}=await import('../arsenal-dashboard/api/_token.js'),{seal}=tokenCodec('career-token-v1',{zip:true});
const dir=mkdtempSync(join(tmpdir(),'career-adult-measure-'));
try{
 const c=makeAdultCase(11),bodies={commit:youthCase(11),submit:{token:seal(c.root),choices:c.choices,claim:{score:c.state.score,digest:await stateDigest(c.state)}}};
 for(const [a,body] of Object.entries(bodies)){
  const file=join(dir,a+'.json');writeFileSync(file,JSON.stringify(body));
  const args=['scripts/measure_api.mjs','career',JSON.stringify({a}),'--method','POST','--body-file',file,'--fixture-career-kv'];
  console.log('node '+args.map(s=>s.includes('{')?"'"+s+"'":s).join(' '));
  const result=spawnSync(process.execPath,args,{env:process.env,encoding:'utf8'});process.stdout.write(result.stdout);process.stderr.write(result.stderr);if(result.status!==0)process.exitCode=1;
 }
}finally{rmSync(dir,{recursive:true,force:true});}
