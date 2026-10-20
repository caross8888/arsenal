// Cloudflare 복제 사이트의 Worker — Vercel 형식 API(arsenal-dashboard/api/*.js)를 코드 그대로 돌리는 변환 층.
// /api/* 만 여기로 온다(wrangler.jsonc의 run_worker_first). 나머지는 정적 파일로 바로 나가서 요청 수에 안 잡힌다.
// 핸들러는 Vercel처럼 (req, res)를 받는다 — req.query·headers·body·method, res.status·setHeader·json·end만 쓴다.
import career from '../arsenal-dashboard/api/career.js';
import football from '../arsenal-dashboard/api/football.js';
import game from '../arsenal-dashboard/api/game.js';
import holidays from '../arsenal-dashboard/api/holidays.js';
import maintenance from '../arsenal-dashboard/api/maintenance.js';
import match from '../arsenal-dashboard/api/match.js';
import news from '../arsenal-dashboard/api/news.js';
import pick from '../arsenal-dashboard/api/pick.js';
import preview_ai from '../arsenal-dashboard/api/preview_ai.js';
import social from '../arsenal-dashboard/api/social.js';
import videos from '../arsenal-dashboard/api/videos.js';
import {runSnapshots} from './snapshots.js';

const HANDLERS = {career, football, game, holidays, maintenance, match, news, pick, preview_ai, social, videos};

// 핸들러가 자기 사이트의 정적 파일(/data/players.json 등)을 fetch로 받는 곳이 있다. workers.dev에서
// Worker가 자기 주소를 다시 부르면 막히므로, 같은 주소의 /api 밖 요청은 정적 파일 저장소(ASSETS)에서 바로 꺼낸다.
let patched = false;
function patchSelfFetch(env, host){
  if(patched) return;
  patched = true;
  const outer = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    try {
      const u = new URL(typeof input === 'string' ? input : input.url);
      if(u.host === host && !u.pathname.startsWith('/api/')) return env.ASSETS.fetch(new Request(u, init));
    } catch(_){}
    return outer(input, init);
  };
}

async function readBody(request){
  if(request.method === 'GET' || request.method === 'HEAD') return undefined;
  const text = await request.text();
  if(!text) return undefined;
  if(/json/i.test(request.headers.get('content-type') || '')){ try { return JSON.parse(text); } catch(_){ return text; } }
  return text;
}

function vercelReq(request, url, body){
  const headers = {};
  for(const [k, v] of request.headers) headers[k.toLowerCase()] = v;
  const ip = headers['cf-connecting-ip'];
  if(ip){ headers['x-real-ip'] = ip; headers['x-forwarded-for'] = ip; }
  headers.host = url.host;
  headers['x-forwarded-host'] = url.host;
  const query = {};
  for(const [k, v] of url.searchParams) query[k] = k in query ? [].concat(query[k], v) : v;
  return {method: request.method, url: url.pathname + url.search, headers, query, body};
}

function vercelRes(){
  let done;
  const finished = new Promise(r => { done = r; });
  const headers = new Headers();
  const res = {
    statusCode: 200,
    setHeader(k, v){ headers.set(k, Array.isArray(v) ? v.join(', ') : String(v)); return res; },
    getHeader(k){ return headers.get(k); },
    status(c){ res.statusCode = c; return res; },
    json(o){ if(!headers.has('content-type')) headers.set('content-type', 'application/json; charset=utf-8'); done(JSON.stringify(o)); return res; },
    send(x){ if(x !== null && typeof x === 'object' && !(x instanceof Uint8Array)) return res.json(x); done(x); return res; },
    end(x){ done(x); return res; },
  };
  return {res, headers, finished};
}

// 크론(wrangler.jsonc의 triggers.crons) → Vercel 크론과 같은 모양으로 핸들러를 부른다.
// Vercel처럼 Authorization: Bearer CRON_SECRET을 붙인다(핸들러는 이것만 통과시킨다).
// 무료 플랜은 Worker당 크론 5개까지라 주기는 cron 식 한 줄로 쓴다(Vercel에선 시각만 다른 24개로 "매시 1회"를 만들었다).
const CRONS = {
  // 5분마다(사용자 지정 — 결장자가 바뀌면 새 해설이 곧 나와야 한다). 화면의 즉시 생성(on=1)은 Cloudflare에서
  // 방문자가 떠나면 30초 안에 끊겨 90초 걸리는 생성을 못 마쳤다(실측: 잠금만 5분 걸린 채 해설 없음). 크론은 끝까지 돈다.
  '*/5 * * * *': {name: 'preview_ai', query: {}},
  '0 4 25 5 *': {name: 'maintenance', query: {}},
  // 1분마다 공용 데이터 파일 갱신(snapshots.js) — 보관 시간이 지난 항목만 다시 만든다.
  '* * * * *': {snapshot: true},
};
// 크론엔 요청 주소가 없다. 핸들러가 자기 정적 파일(/data/players.json)을 부를 때 쓸 주소 —
// patchSelfFetch가 이 주소를 ASSETS로 돌리므로 실제로 밖으로 나가진 않는다.
const CRON_HOST = 'arsenal.caross8888.workers.dev';

// 크론 안에서 핸들러 하나를 불러 JSON 응답을 받는다(200이 아니면 null).
async function callHandler(name, query){
  const req = {method: 'GET', url: `/api/${name}`, query, body: undefined, headers: {host: CRON_HOST, 'x-forwarded-host': CRON_HOST}};
  const {res, headers, finished} = vercelRes();
  await Promise.resolve(HANDLERS[name](req, res)).then(() => res.end());
  const body = await finished;
  // 핸들러가 "저장하지 말라"고 한 응답(출처 전부 실패한 빈 목록 등)은 파일로 올리지 않는다 — CDN이 받던 규칙과 같다
  if(res.statusCode !== 200 || body == null || /no-store|private/i.test(headers.get('cache-control') || '')) return null;
  try { return JSON.parse(typeof body === 'string' ? body : new TextDecoder().decode(body)); } catch(_){ return null; }
}

async function runCron(cron, env){
  const job = CRONS[cron];
  if(!job) return console.error('알 수 없는 크론', cron);
  patchSelfFetch(env, CRON_HOST);
  process.env.VERCEL_PROJECT_PRODUCTION_URL ||= CRON_HOST;
  if(job.snapshot) return runSnapshots(env.DATA, callHandler);
  const secret = env.CRON_SECRET || process.env.CRON_SECRET || '';
  const req = {method: 'GET', url: `/api/${job.name}`, query: job.query, body: undefined,
    headers: {authorization: `Bearer ${secret}`, host: CRON_HOST, 'x-forwarded-host': CRON_HOST}};
  const {res, finished} = vercelRes();
  await Promise.resolve(HANDLERS[job.name](req, res)).then(() => res.end());
  const body = await finished;
  // 결과(짧은 리포트)는 관찰 가능성 로그에서 본다. 실패 코드면 error로 남겨 눈에 띄게 한다.
  (res.statusCode >= 400 ? console.error : console.log)(job.name, res.statusCode, String(body ?? '').slice(0, 1500));
}

// ── 가장자리 캐시(Vercel CDN 대신) ──
// Worker 응답은 Cloudflare CDN에 자동으로 안 남아서, Vercel에선 CDN이 받아 주던 요청(득점 순위 4초 등)이
// 매번 핸들러까지 왔다. 핸들러가 붙이는 Cache-Control의 s-maxage(공유 캐시 보관 시간)를 Vercel CDN처럼 따라
// Cache API에 보관한다. 데이터센터마다 따로 보관된다. workers.dev 주소에선 Cache API가 동작하지 않는다(자기 도메인 전용).
// stale-while-revalidate도 흉내 낸다 — 보관 시간이 지났으면 옛 응답을 바로 주고 뒤에서 한 번 새로 만든다.
// 로그인 헤더·쿠키가 있는 요청과 GET이 아닌 요청은 건너뛴다(사람마다 다른 응답일 수 있다).
const EDGE = {stored: 'x-edge-stored', fresh: 'x-edge-fresh', cc: 'x-edge-cc'};
const refreshing = new Set();

function edgePolicy(cc){
  cc = String(cc || '').toLowerCase();
  if(!/\bpublic\b/.test(cc) || /no-store|private|no-cache/.test(cc)) return null;
  const s = /s-maxage=(\d+)/.exec(cc), w = /stale-while-revalidate=(\d+)/.exec(cc);
  const fresh = s ? Number(s[1]) : 0;
  return fresh > 0 ? {fresh, keep: fresh + (w ? Number(w[1]) : 0)} : null;
}

// 핸들러를 Vercel 형식으로 실행해 Response를 만든다.
async function runHandler(request, url, name, handler, ctx){
  const {res, headers, finished} = vercelRes();
  try {
    const req = vercelReq(request, url, await readBody(request));
    const run = Promise.resolve(handler(req, res)).then(() => res.end());
    // 방문자가 응답 전에 떠나면(앱 닫기·탭 이동) Cloudflare는 Worker를 그 자리에서 끊는다. Vercel 함수는
    // 끝까지 돈다. 번역처럼 "외부 유료 호출 → KV 저장" 순서인 일은 저장 전에 끊기면 돈만 내고 결과를
    // 잃어서, 다음 방문 때 같은 글을 또 번역한다. waitUntil로 연결이 끊겨도 핸들러는 끝까지 돌게 한다.
    ctx?.waitUntil(run.catch(() => {}));
    const body = await Promise.race([finished, run.then(() => finished)]);
    return new Response(request.method === 'HEAD' ? null : body ?? null, {status: res.statusCode, headers});
  } catch(e){
    console.error(name, e && e.stack || e);
    return Response.json({error: '서버 오류가 났어요. 잠시 후 다시 시도해 주세요.'}, {status: 500});
  }
}

// 캐시에 넣을 사본: 보관 시간(keep)을 max-age로 바꿔 Cache API가 그만큼 들고 있게 하고, 원래 헤더는 따로 적어 둔다.
async function edgePut(key, resp, policy){
  const h = new Headers(resp.headers);
  h.set(EDGE.cc, resp.headers.get('cache-control') || '');
  h.set(EDGE.stored, String(Date.now()));
  h.set(EDGE.fresh, String(policy.fresh));
  h.set('cache-control', `public, max-age=${policy.keep}`);
  const body = await resp.clone().arrayBuffer();
  try {
    await caches.default.put(key, new Response(body, {status: resp.status, headers: h}));
  } catch(e){ console.warn('[edge] put 실패 ' + (e && e.message) + ' ' + key.url); }
}

// 방문자에게 줄 응답: 내부 헤더를 지우고 원래 Cache-Control(브라우저용 max-age)을 되돌린다.
function edgeOut(hit, state){
  const h = new Headers(hit.headers);
  h.set('cache-control', h.get(EDGE.cc) || 'no-store');
  for(const k of Object.values(EDGE)) h.delete(k);
  h.set('x-edge-cache', state);
  return new Response(hit.body, {status: hit.status, headers: h});
}

export default {
  async scheduled(event, env, ctx){
    ctx.waitUntil(runCron(event.cron, env));
  },
  async fetch(request, env, ctx){
    const url = new URL(request.url);
    patchSelfFetch(env, url.host);
    const name = url.pathname.replace(/^\/api\//, '').replace(/\/+$/, '');
    const handler = HANDLERS[name];
    if(!handler) return Response.json({error: 'unknown endpoint'}, {status: 404});

    const edge = request.method === 'GET' && !request.headers.has('authorization') && !request.headers.has('cookie')
      && typeof caches !== 'undefined' && !url.hostname.endsWith('.workers.dev');
    if(!edge) return runHandler(request, url, name, handler, ctx);

    const key = new Request(url.toString(), {method: 'GET'});
    let hit = null;
    try { hit = await caches.default.match(key); } catch(e){ console.warn('[edge] match 실패 ' + (e && e.message)); }
    if(hit){
      const age = Date.now() - Number(hit.headers.get(EDGE.stored) || 0);
      if(age <= Number(hit.headers.get(EDGE.fresh) || 0) * 1000) return edgeOut(hit, 'HIT');
      // 보관 시간이 지난 응답 — 바로 주고, 이 인스턴스에서 아직 안 했으면 뒤에서 새로 만든다.
      if(!refreshing.has(key.url)){
        refreshing.add(key.url);
        ctx.waitUntil(runHandler(new Request(key), url, name, handler, ctx).then(r => {
          const p = r.status === 200 && edgePolicy(r.headers.get('cache-control'));
          return p ? edgePut(key, r, p) : null;
        }).catch(() => {}).finally(() => refreshing.delete(key.url)));
      }
      return edgeOut(hit, 'STALE');
    }
    const resp = await runHandler(request, url, name, handler, ctx);
    const policy = resp.status === 200 && edgePolicy(resp.headers.get('cache-control'));
    if(policy) ctx.waitUntil(edgePut(key, resp, policy).catch(e => console.warn('[edge] ' + (e && e.message))));
    resp.headers.set('x-edge-cache', 'MISS');
    return resp;
  },
};
