import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import * as D from '../arsenal-dashboard/public/career/sim-v3/detmath.js';
const folder=new URL('../arsenal-dashboard/public/career/sim-v3/',import.meta.url),forbidden=/Math\s*\.\s*(?:exp|expm1|log|log1p|log2|log10|pow|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|hypot|cbrt)\s*\(|\*\*|\.\s*localeCompare\s*\(/;
let files=0;for(const f of readdirSync(folder).filter(f=>f.endsWith('.js')&&f!=='detmath.js')){assert(!forbidden.test(readFileSync(new URL(f,folder),'utf8')),f+'에 엔진별 함수가 다시 들어왔어요.');files++;}
let count=0,maxError=0;
for(let i=0;i<=20000;i++){
 const x=-30+i*60/20000,p=.1+i/20000*5;
 for(const [actual,expected] of [[D.exp(x),Math.exp(x)],[D.log(p),Math.log(p)],[D.cos(x/10),Math.cos(x/10)],[D.pow(p,1.5),Math.pow(p,1.5)],[D.pow(p,2),p*p]]){
  const error=Math.abs(actual-expected)/Math.max(1,Math.abs(expected));maxError=Math.max(maxError,error);assert(error<1e-13);count++;
 }
}
assert.equal(D.pow(0,0),1);assert.equal(D.pow(0,1.5),0);assert.equal(D.exp(-Infinity),0);assert.equal(D.exp(Infinity),Infinity);
console.log(`PASS determinism: ${files} files scanned; ${count} numeric comparisons, max relative/absolute error ${maxError}`);
