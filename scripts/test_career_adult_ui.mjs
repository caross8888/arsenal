// 실제 390px 화면에서 새 v3와 기존 v2를 함께 검증한다. 운영 서버·KV는 사용하지 않는다.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {careerTestKV} from './lib/career-test-kv.mjs';
import {youthCase,makeAdultCase} from './lib/career-adult-cases.mjs';
import {makeCase} from './lib/career-reroll-cases.mjs';
import {replayAdult} from '../arsenal-dashboard/public/career/sim-v3/local.js';
import {stateDigest} from '../arsenal-dashboard/public/career/sim-v3/digest.js';
import {cardView} from '../arsenal-dashboard/public/career/sim-v3/sim.js';
process.env.WHOAMI_SECRET='test-only-secret';process.env.CAREER_SEED_SECRET='test-seed-secret';process.env.PICK_SECRET='test-account-secret';process.env.KV_REST_API_URL='https://career-test.upstash.io';process.env.KV_REST_API_TOKEN='test-only-kv';
const kv=careerTestKV();globalThis.fetch=kv.fetch;
const {default:handler}=await import('../arsenal-dashboard/api/career.js'),{signToken}=await import('../arsenal-dashboard/api/_account.js');
const auth=signToken('ui-test','화면검증');
let pw;try{pw=await import(process.env.PLAYWRIGHT_MODULE||'playwright');}catch(_){pw=await import(pathToFileURL('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);}
const root=resolve('.'),calls=[];let mode='normal';
const server=createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/api/career'){
  let raw='';for await(const c of req)raw+=c;const body=raw?JSON.parse(raw):{},a=u.searchParams.get('a');calls.push({a,method:req.method});
  if(a==='submit'&&mode==='temporary'){res.statusCode=503;return res.end('<html>temporary error</html>');}
  if(a==='submit'&&mode==='disconnect')return req.socket.destroy();
  if(a==='submit'&&mode==='mismatch')body.claim.score++;
  if(a==='submit'&&mode==='invalid')body.claim=null;
  return handler({method:req.method,query:Object.fromEntries(u.searchParams),headers:req.headers,body},{setHeader(k,v){res.setHeader(k,v);},status(n){res.statusCode=n;return this;},json(v){res.end(JSON.stringify(v));},end(v){res.end(v);}});
 }
 let rel=u.pathname;if(!rel.startsWith('/scripts/')&&!rel.startsWith('/arsenal-dashboard/'))rel='/arsenal-dashboard/public'+(rel==='/'?'/index.html':rel);
 const file=resolve(root,'.'+rel);if(!file.startsWith(root+'/')||!existsSync(file)){res.statusCode=404;return res.end();}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.css':'text/css','.webp':'image/webp'})[extname(file)]||'application/octet-stream');res.end(readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const engine=process.env.CAREER_UI_BROWSER||'chromium';
const browser=await pw[engine].launch({headless:true,...(engine==='chromium'?{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']}:{})});
const posts=a=>calls.filter(c=>c.a===a&&c.method==='POST').length;
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
 await page.goto(base+'/#games',{waitUntil:'domcontentloaded'});
 const record=youthCase(11);
 await page.evaluate(async r=>{
  await crMeta();const M=await crLocalModule(3),started=await crApi('new',r.input);if(JSON.parse(started.token.slice(M.PREFIX.length)).stage!=='youth')throw Error('new v3 youth');
  let v=M.localCall('new',r.input,r.seed);for(const {a,...b}of r.choices)v=await crApi(a,{token:v.token,...b});crStore(v);CR.tok=v.token;
 },record);
 assert.equal(calls.length,0,'유스는 API 0회');
 const committed=await page.evaluate(async next=>{const v=await crApi('next',{token:crSaved().tok,...next});crStore(v);return JSON.parse(v.token.slice('career-local-v3:'.length));},record.next);
 assert.equal(posts('commit'),1);assert.equal(committed.stage,'adult');assert.equal(committed.state.simVersion,3);
 const c=makeAdultCase(11,committed.state),cut=10;
 await page.evaluate(async choices=>{let tok=crSaved().tok;for(const {a,...b}of choices){const v=await crApi(a,{token:tok,...b});tok=v.token;crStore(v);}},c.choices.slice(0,cut));
 assert.equal(calls.length,1,'성인 진행은 API 0회');
 const before=await page.evaluate(()=>crSaved().tok);await page.reload({waitUntil:'domcontentloaded'});
 assert.equal(await page.evaluate(()=>crSaved().tok),before);
 await page.evaluate(async()=>{await crMeta();const v=await crApi('view',{token:crSaved().tok});CR.v=v;CR.tok=v.token;});
 assert.equal(calls.length,1,'새로고침 복원도 API 0회');
 const retired=await page.evaluate(async choices=>{let v;for(const {a,...b}of choices){v=await crApi(a,{token:crSaved().tok,...b});crStore(v);}crShow(v);return {token:v.token,card:v.card};},c.choices.slice(cut));
 assert.equal(posts('commit'),1);assert.equal(posts('submit'),0);assert.equal(calls.length,1);
 assert.equal(await stateDigest(replayAdult(committed.state,c.choices)),await stateDigest(c.state));assert.deepEqual(retired.card,cardView(c.state),'실제 화면 은퇴 카드는 서버 재계산과 정확히 같다.');
 async function restore(clearError=true){
  await page.evaluate(async({token,auth,clearError})=>{localStorage.setItem(CR_KEY,token);if(clearError)localStorage.setItem(CR_INFO,JSON.stringify({phase:'retired'}));PK.tok=auth;PK.nick='화면검증';await crMeta();crShow(await crApi('view',{token}));},{token:retired.token,auth,clearError});
 }
 async function submit(){await page.evaluate(()=>crSubmit(document.querySelector('#gameRoot .cr-dock .gm-btn:last-child')));await page.waitForFunction(()=>!CR.busy);}
 await restore();mode='temporary';await submit();assert.equal(posts('submit'),1);
 assert.equal(await page.evaluate(()=>crSaved().tok),retired.token);assert.equal(await page.evaluate(()=>crSaved().info.regError.retry),true);await page.getByRole('button',{name:'잠시 후 다시 등록',exact:true}).waitFor();
 await page.reload({waitUntil:'domcontentloaded'});await restore(false);assert.equal(await page.evaluate(()=>crSaved().info.regError.retry),true);
 mode='disconnect';await submit();assert.equal(await page.evaluate(()=>crSaved().tok),retired.token);assert.equal(await page.evaluate(()=>crSaved().info.regError.retry),true);
 mode='normal';const n=posts('submit');await page.evaluate(()=>{const b=document.querySelector('#gameRoot .cr-dock .gm-btn:last-child');crSubmit(b);crSubmit(b);});await page.waitForFunction(()=>!CR.busy);assert.equal(posts('submit'),n+1,'연타는 등록 1회');assert.equal(await page.evaluate(()=>crSaved().info.reg),true);
 const attempts=posts('submit');await page.evaluate(()=>crRetired());assert.equal(posts('submit'),attempts,'은퇴 화면 재개방은 재등록하지 않는다.');
 for(const failure of ['mismatch','invalid']){
  mode=failure;await restore();await submit();assert.equal(await page.evaluate(()=>crSaved().info.regError.retry),false);assert(!await page.evaluate(()=>crSaved().info.reg));assert.equal(await page.evaluate(()=>crSaved().tok),retired.token);
  assert(await page.getByRole('button',{name:'등록할 수 없는 기록'}).isDisabled());const n=posts('submit');await page.evaluate(()=>crSubmit());assert.equal(posts('submit'),n,'400/불일치는 재시도하지 않는다.');
  await page.reload({waitUntil:'domcontentloaded'});await restore(false);assert(await page.getByRole('button',{name:'등록할 수 없는 기록'}).isDisabled());
 }
 mode='normal';await restore();await submit();assert.equal(await page.evaluate(()=>crSaved().info.reg),true,'중복 409는 기존처럼 등록 완료로 처리');
 // 옛 v2 유스는 v2 확정 후 서버 진행을 유지한다.
 const old=makeCase(11,2).record;
 await page.evaluate(async r=>{const M=await crLocalModule(2);let v=M.localCall('new',r.input,r.seed);for(const {a,...b}of r.choices)v=await crApi(a,{token:v.token,...b});const adult=await crApi('next',{token:v.token,pick:null,trait:v.result.traitOffer.length?0:null});if(adult.token.startsWith('career-local-v'))throw Error('v2 must stay encrypted');const restored=await crApi('view',{token:adult.token});if(restored.player.age!==19)throw Error('legacy resume');},old);
 assert.equal(posts('commit'),2);assert.equal(posts('view'),1);assert.equal(errors.length,0,JSON.stringify(errors));
 console.log('PASS '+engine+' adult 390px UI: youth 0, commit 1, all adult actions/reload/retirement 0, submit 1 per click; non-JSON 503 retry, 400/mismatch block+reload, duplicate 409, saved record preserved, v2 encrypted path, JS errors 0');
}finally{await browser.close();await new Promise(r=>server.close(r));}
