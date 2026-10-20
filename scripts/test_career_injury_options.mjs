// 부상 답 미리 계산(injOpts): 고른 갈래가 예전 두 번째 호출(injPick)과 같은 결과여야 한다.
import assert from 'node:assert/strict';
process.env.WHOAMI_SECRET='test-only-secret';
const {default:handler}=await import('../arsenal-dashboard/api/career.js');
const call=async(a,body)=>{let out,status=200;await handler({method:'POST',query:{a},headers:{},body},{setHeader(){},status(n){status=n;return this;},json(v){out=v;},end(){}});if(status!==200)throw new Error(a+' '+status+' '+JSON.stringify(out));return out;};
const strip=v=>{const {token,injOpts,...rest}=v;return JSON.stringify(rest);};
let checked=0;
for(let t=0;t<40&&checked<6;t++){
  let v=await call('new',{name:'부상테스트'+t,nation:['ENG','KOR','BRA'][t%3],foot:'오른발',body:'표준',pos:['FW','MF','DF'][t%3],card:0,num:9,dream:null});
  v=await call('join',{token:v.token,pick:0});
  for(let s=0;s<22&&v.phase!=='retired';s++){
    if(v.phase==='prep'){ v=await call('season',{token:v.token,train:'균형',evPick:0,loanPick:0}); }
    if(v.phase==='penalty') break;
    if(v.phase==='injury'){
      assert(Array.isArray(v.injOpts)&&v.injOpts.length===2,'injury reply carries both outcomes');
      for(const k of [0,1]){ const old=await call('season',{token:v.token,injPick:k}); assert.equal(strip(v.injOpts[k]),strip(old),'pre-computed outcome '+k+' matches the injPick call'); }
      checked++; v=v.injOpts[s%2];
    }
    if(v.phase!=='result') break;
    const offers=v.result?.offers||[];
    v=await call('next',{token:v.token,pick:v.player?.released&&offers.length?0:null,trait:(v.result?.traitOffer||[]).length?0:null}).catch(()=>({phase:'retired'}));
  }
}
assert(checked>=3,'enough injuries checked: '+checked);
console.log(`PASS injury options: ${checked} injuries, both pre-computed outcomes equal the injPick call`);
