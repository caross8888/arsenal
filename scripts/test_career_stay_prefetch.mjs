// 잔류 미리 계산(stayNext): 결과 응답에 실린 다음 시즌이 next(잔류) 호출 결과와 같아야 하고,
// 고를 게 있는 시즌(방출·특성 선택·강제 은퇴)엔 싣지 않는다.
import assert from 'node:assert/strict';
process.env.WHOAMI_SECRET='test-only-secret';
const {default:handler}=await import('../arsenal-dashboard/api/career.js');
const call=async(a,body)=>{let out,status=200;await handler({method:'POST',query:{a},headers:{},body},{setHeader(){},status(n){status=n;return this;},json(v){out=v;},end(){}});if(status!==200)throw new Error(a+' '+status+' '+JSON.stringify(out));return out;};
const strip=v=>{const {token,stayNext,injOpts,...rest}=v;return JSON.stringify(rest);};
let same=0, skipped=0, used=0;
for(let t=0;t<16;t++){
  let v=await call('new',{name:'잔류테스트'+t,nation:['ENG','KOR','BRA','JPN'][t%4],foot:'오른발',body:'표준',pos:['FW','MF','DF'][t%3],card:t%5,num:9,dream:null});
  v=await call('join',{token:v.token,pick:t%3});
  for(let s=0;s<26&&v.phase!=='retired';s++){
    if(v.phase==='prep') v=await call('season',{token:v.token,train:'균형',evPick:s%2,loanPick:0});
    if(v.phase==='injury') v=v.injOpts[s%2];
    if(v.phase==='penalty') break;
    if(v.phase!=='result') break;
    const R=v.result, choose=(R.traitOffer||[]).length;
    if(R.released||choose||R.forced){ assert(!v.stayNext,'no prefetch when a choice is required'); skipped++; }
    else {
      assert(v.stayNext,'prefetch when staying is possible');
      const real=await call('next',{token:v.token,pick:null,trait:null});
      assert.equal(strip(v.stayNext),strip(real),'prefetched stay equals next call'); same++;
    }
    if(v.stayNext&&s%3!==0){ v=v.stayNext; used++; continue; }
    const pick=R.released&&(R.offers||[]).length?0:(R.offers||[]).length&&s%3===0?0:null;
    try{ v=await call('next',{token:v.token,pick,trait:choose?0:null}); }catch(e){ if(/병역/.test(e.message)) v=await call('next',{token:v.token,pick:null,trait:choose?0:null}); else throw e; }
  }
}
assert(same>=40&&skipped>0&&used>0,`checked ${same} / skipped ${skipped} / used ${used}`);
console.log(`PASS stay prefetch: ${same} seasons equal the next call, ${skipped} seasons with a required choice skipped, ${used} continued from prefetch`);
