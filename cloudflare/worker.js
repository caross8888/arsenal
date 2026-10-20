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

export default {
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
