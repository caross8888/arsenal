// API 하나가 실행 한 번에 외부 요청(fetch)·KV 명령을 몇 번 쓰는지 잰다 — 새 기능·API를 머지하기 전에 돌린다.
// Cloudflare 무료 플랜은 실행당 외부 요청 50번까지(Upstash KV 호출도 외부 요청이다). CLAUDE.md "백엔드 기준" 참고.
//
//   KV_REST_API_TOKEN=proxy-injected NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt \
//     node scripts/measure_api.mjs football '{"type":"predxi","match":"6106238"}'
//
// 출력: 총 외부 요청 수, 호스트별 수, KV 명령 종류별 수(키의 숫자는 #으로 묶음). 두 번 연속 재서 캐시 안/밖을 같이 본다.
// 주의: 실제 운영 KV를 읽고 쓴다(캐시를 채우는 정도). 쓰기 위주 API(등록·삭제)엔 쓰지 말 것.
const [name,q='{}',...flags]=process.argv.slice(2);
const option=k=>{const i=flags.indexOf(k);return i<0?null:flags[i+1];};
const fixture=flags.includes('--fixture-career-kv');
let testStore=null;
if(fixture){
 if(name!=='career')throw Error('커리어 측정 전용 저장소예요.');
 const {careerTestKV}=await import('./lib/career-test-kv.mjs');testStore=careerTestKV();
 process.env.KV_REST_API_URL='https://career-test.upstash.io';process.env.KV_REST_API_TOKEN='test-only-kv';process.env.PICK_SECRET='test-account-secret';
 console.log('측정 저장소: 메모리 테스트 KV(운영 접속 없음)');
}
const method=option('--method')||'GET';
if(method!=='GET'&&!fixture)throw Error('쓰기 경로 측정은 --fixture-career-kv로만 실행해 주세요.');
const body=option('--body-file')?JSON.parse((await import('node:fs')).readFileSync(option('--body-file'),'utf8')):undefined;
const headers={host:'coyg.co.kr'};
if(fixture){const {signToken}=await import('../arsenal-dashboard/api/_account.js');headers.authorization='Bearer '+signToken('measure-adult','측정전용');}
if(!name){ console.error('사용법: node scripts/measure_api.mjs <api 파일 이름> \'<query JSON>\''); process.exit(1); }
const outer = fixture?testStore.fetch:globalThis.fetch;
let hosts = {}, kv = {};
globalThis.fetch = (u, init) => {
  const s = String(u && u.url || u), host = new URL(s).host;
  hosts[host] = (hosts[host] || 0) + 1;
  if(/upstash\.io/.test(host)){
    let c = s.replace(/^https?:\/\/[^/]+\/?/, '').split('/')[0] || '?';
    try { const b = JSON.parse(init && init.body); c = Array.isArray(b[0]) ? 'PIPELINE(' + b.map(x => x[0]).join('+') + ')' : b[0] + ' ' + String(b[1] || '').replace(/\d+/g, '#').slice(0, 40); } catch(_){}
    kv[c] = (kv[c] || 0) + 1;
  }
  return outer(u, init);
};
const handler = (await import(new URL(`../arsenal-dashboard/api/${name}.js`, import.meta.url))).default;
for(const round of [1, 2]){
  hosts = {}; kv = {};
  const t = Date.now();
  let status=200;
  await new Promise(resolve => handler({method,query:JSON.parse(q),headers,body},
    {setHeader(){ return this; }, getHeader(){}, status(n){status=n;return this; }, json(){ resolve(); return this; }, send(){ resolve(); return this; }, end(){ resolve(); return this; }}));
  await new Promise(r => setTimeout(r, fixture?0:1500));   // 응답 뒤에 이어지는 저장까지 기다린다
  const total = Object.values(hosts).reduce((a, b) => a + b, 0);
  console.log(`[${round}회차] 외부 요청 ${total}회 (${Date.now() - t}ms, HTTP ${status})${total > 30 ? '  ⚠ 30회 초과 — 줄일 것' : ''}`);
  console.log('  호스트:', JSON.stringify(hosts));
  console.log('  KV:', JSON.stringify(Object.entries(kv).sort((a, b) => b[1] - a[1])));
}
