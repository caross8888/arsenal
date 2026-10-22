import {replayAdult} from '../sim-v3/local.js';
import {stateDigest} from '../sim-v3/digest.js';
export async function runVerification({onProgress=()=>{},limit=Infinity}={}){
 const response=await fetch('./adult-cases-v3.json');if(!response.ok)throw Error('검증 자료를 불러오지 못했어요.');
 const data=await response.json(),cases=data.cases.slice(0,limit),failures=[];let passed=0;
 for(const c of cases){
  const state=replayAdult(c.root,c.choices),actual=await stateDigest(state);
  if(actual===c.digest)passed++;else failures.push({index:c.index,seed:c.seed,expected:c.digest,actual});
  onProgress({passed,total:cases.length,done:passed+failures.length,failures});
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 return {version:3,passed,total:cases.length,failures};
}
const button=document.querySelector('#run'),output=document.querySelector('#output');
button.onclick=async()=>{
 button.disabled=true;output.textContent='검증 중…';
 try{const result=await runVerification({onProgress:r=>{output.textContent=`${r.done} / ${r.total} 판 확인 · 일치 ${r.passed} · 불일치 ${r.failures.length}`;}});output.textContent=JSON.stringify(result,null,2);}
 catch(e){output.textContent=e.message;}finally{button.disabled=false;}
};
globalThis.CAREER_VERIFY={runVerification};
