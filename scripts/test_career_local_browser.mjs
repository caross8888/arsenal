// 실제 Chromium에서 로컬 계산·저장 복원·API 요청 수와 Node 서버 재생을 대조한다.
// 실행 환경에 Playwright와 Chromium이 필요. PLAYWRIGHT_MODULE / CHROMIUM_PATH로 위치 지정 가능.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {replay} from '../arsenal-dashboard/public/career/sim-v1/local.js';
import {makeCase} from './lib/career-reroll-cases.mjs';
process.env.WHOAMI_SECRET='test-only-secret';delete process.env.KV_REST_API_URL;
const {default:handler}=await import('../arsenal-dashboard/api/career.js');
let playwright;try{playwright=await import(process.env.PLAYWRIGHT_MODULE||'playwright');}catch(e){
 if(process.env.PLAYWRIGHT_MODULE)throw e;
 playwright=await import(pathToFileURL('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
}
const root=resolve(new URL('..',import.meta.url).pathname),requests=[];
const server=createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/api/career'){
  requests.push(u.searchParams.get('a'));let raw='';for await(const chunk of req)raw+=chunk;
  const body=raw?JSON.parse(raw):{};
  return handler({method:req.method,query:Object.fromEntries(u.searchParams),headers:req.headers,body},{setHeader(k,v){res.setHeader(k,v);},status(n){res.statusCode=n;return this;},json(v){res.end(JSON.stringify(v));},end(v){res.end(v);}});
 }
 let rel=u.pathname;
 if(!rel.startsWith('/scripts/')&&!rel.startsWith('/arsenal-dashboard/'))rel='/arsenal-dashboard/public'+(rel==='/'?'/index.html':rel);
 const file=resolve(root,'.'+rel);
 if(!file.startsWith(root+'/')||!existsSync(file)){res.statusCode=404;return res.end();}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp'})[extname(file)]||'application/octet-stream');
 res.end(readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
 await page.goto(base,{waitUntil:'domcontentloaded'});
 const count=Number(process.env.REROLL_CASES)||2000;
 for(let start=0;start<count;start+=50){
  const cases=await page.evaluate(async({start,count})=>{const {runCases}=await import('/scripts/lib/career-reroll-cases.mjs');return runCases(count,start);},{start,count:Math.min(50,count-start)});
  for(const c of cases)assert.deepEqual(replay(c.record),c.state,'Chromium state == Node server replay');
  if((start+50)%500===0)console.log('Browser replay:',start+50);
 }
 const sample=makeCase(11);
 await page.evaluate(async({record})=>{
  await crMeta();
  const v=await crApi('new',record.input);if(!v.token.startsWith('career-local-v1:'))throw Error('new must be local');
  let v2=await crApi('join',{token:v.token,pick:0});
  v2=await crApi('season',{token:v2.token,train:'균형',evPick:0,loanPick:0});
  crStore(v2);if(crSaved().tok!==v2.token)throw Error('local persistence');
 },sample);
 assert.deepEqual(requests,[],'new/join/season/meta use zero APIs');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{const old=crSaved();const v=await crApi('view',{token:old.tok});if(v.player.age!==15)throw Error('local resume');});
 assert.deepEqual(requests,[],'local resume does not call server');
 await page.evaluate(async({record})=>{
  const M=await crLocalModule();let v=await crApi('new',record.input);
  // 고정된 시드로 만든 실제 유스 선택 기록을 화면 API 경유로 끝까지 진행한다.
  v=M.localCall('new',record.input,record.seed);
  for(const {a,...b} of record.choices)v=await crApi(a,{token:v.token,...b});
  const prev=v.token,look=JSON.stringify(crAvLook(v.player));crStore(v);
  v=await crApi('next',{token:prev,pick:null,trait:v.result.traitOffer.length?0:null});
  if(v.phase!=='prep'||v.player.age!==19||v.token.startsWith('career-local-v1:'))throw Error('commit boundary');
  if(JSON.stringify(crAvLook(v.player))!==look)throw Error('appearance changed at commit');
  crStore(v);const restored=await crApi('view',{token:crSaved().tok});if(restored.player.age!==19)throw Error('server resume');
 },sample);
 assert.deepEqual(requests,['commit','view'],'continue uses exactly one commit; adult resume uses existing view');
 console.log(`PASS actual Chromium: ${count} browser/server state comparisons, 390px UI runtime, zero youth API requests, save/reload, one commit, encrypted adult resume`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
