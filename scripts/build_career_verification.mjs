// 가상 선수의 고정 선택 기록과 Node 기준 해시를 만든다. 운영 토큰·비밀값은 넣지 않는다.
import {writeFileSync} from 'node:fs';
import {makeAdultCase} from './lib/career-adult-cases.mjs';
import {stateDigest} from '../arsenal-dashboard/public/career/sim-v3/digest.js';
const count=Number(process.env.VERIFY_CASES)||300,cases=[];
for(let i=0;i<count;i++){const c=makeAdultCase(i);cases.push({index:i,seed:c.root.seed,root:c.root,choices:c.choices,digest:await stateDigest(c.state)});}
const file=new URL('../arsenal-dashboard/public/career/verification/adult-cases-v3.json',import.meta.url);writeFileSync(file,JSON.stringify({simVersion:3,cases}));console.log('Verification fixtures:',count);
