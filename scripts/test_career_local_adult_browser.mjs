// 실제 Chromium·Firefox·WebKit에서 고정 기록을 끝까지 재생하고 Node 기준 해시와 대조한다.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
let pw;try{pw=await import(process.env.PLAYWRIGHT_MODULE||'playwright');}catch(e){if(process.env.PLAYWRIGHT_MODULE)throw e;pw=await import(pathToFileURL('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);}
const root=resolve('arsenal-dashboard/public'),requests=[];
const server=createServer((req,res)=>{
 const file=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);requests.push(req.url);
 if(!file.startsWith(root+'/')||!existsSync(file)){res.statusCode=404;return res.end();}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json'})[extname(file)]||'application/octet-stream');res.end(readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
try{
 for(const engine of (process.env.CAREER_BROWSERS||'chromium,firefox,webkit').split(',')){
  let browser;try{browser=await pw[engine].launch({headless:true,...(engine==='chromium'?{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']}:{})});}
  catch(e){console.error(`${engine} 실행 실패. 먼저 npx playwright install --with-deps ${engine} 실행 후 재시도해 주세요.`);throw e;}
  try{
   const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
   await page.goto(base+'/career/verification/local-adult.html');await page.waitForFunction(()=>window.CAREER_VERIFY);
   const result=await page.evaluate(async()=>CAREER_VERIFY.runVerification());assert.equal(result.total,300);assert.equal(result.passed,result.total,JSON.stringify(result.failures));assert.equal(errors.length,0,JSON.stringify(errors));assert(!requests.some(r=>r.startsWith('/api/')),'성인 로컬 검증 API 0회');
   console.log(`PASS ${engine}: ${result.passed}/${result.total} complete adult careers, exact Node/V8 stateDigest, 390px, API 0`);
  }finally{await browser.close();}
 }
}finally{await new Promise(r=>server.close(r));}
