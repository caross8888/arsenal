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
// 무료 플랜은 Worker당 크론 5개까지라, Vercel에서 시각만 다른 24개로 만들던 "매시 1회"는 한 줄로 쓴다.
const CRONS = {
  '0 * * * *': {name: 'preview_ai', query: {}},
  '0 4 25 5 *': {name: 'maintenance', query: {}},
};
// 크론엔 요청 주소가 없다. 핸들러가 자기 정적 파일(/data/players.json)을 부를 때 쓸 주소 —
// patchSelfFetch가 이 주소를 ASSETS로 돌리므로 실제로 밖으로 나가진 않는다.
const CRON_HOST = 'arsenal.caross8888.workers.dev';

async function runCron(cron, env){
  const job = CRONS[cron];
  if(!job) return console.error('알 수 없는 크론', cron);
  patchSelfFetch(env, CRON_HOST);
  process.env.VERCEL_PROJECT_PRODUCTION_URL ||= CRON_HOST;
  const secret = env.CRON_SECRET || process.env.CRON_SECRET || '';
  const req = {method: 'GET', url: `/api/${job.name}`, query: job.query, body: undefined,
    headers: {authorization: `Bearer ${secret}`, host: CRON_HOST, 'x-forwarded-host': CRON_HOST}};
  const {res, finished} = vercelRes();
  await Promise.resolve(HANDLERS[job.name](req, res)).then(() => res.end());
  const body = await finished;
  // 결과(짧은 리포트)는 관찰 가능성 로그에서 본다. 실패 코드면 error로 남겨 눈에 띄게 한다.
  (res.statusCode >= 400 ? console.error : console.log)(job.name, res.statusCode, String(body ?? '').slice(0, 1500));
}

export default {
  async scheduled(event, env, ctx){
    ctx.waitUntil(runCron(event.cron, env));
  },
  async fetch(request, env){
    const url = new URL(request.url);
    patchSelfFetch(env, url.host);
    const name = url.pathname.replace(/^\/api\//, '').replace(/\/+$/, '');
    const handler = HANDLERS[name];
    if(!handler) return Response.json({error: 'unknown endpoint'}, {status: 404});
    const {res, headers, finished} = vercelRes();
    try {
      const req = vercelReq(request, url, await readBody(request));
      const run = Promise.resolve(handler(req, res)).then(() => res.end());
      const body = await Promise.race([finished, run.then(() => finished)]);
      return new Response(request.method === 'HEAD' ? null : body ?? null, {status: res.statusCode, headers});
    } catch(e){
      console.error(name, e && e.stack || e);
      return Response.json({error: '서버 오류가 났어요. 잠시 후 다시 시도해 주세요.'}, {status: 500});
    }
  },
};
