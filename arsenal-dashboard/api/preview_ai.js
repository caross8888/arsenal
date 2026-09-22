// api/preview_ai.js — 다가오는 경기의 AI 해설을 미리 만들어 두는 크론
//
// vercel.json의 crons가 하루 한 번 부른다. 모달을 열 때 생성하면 그 경기를 처음 여는
// 사람이 매번 1~3초를 기다리는데, 이 앱은 사용자가 사실상 한 명이라 "처음 여는 사람"이
// 늘 본인이다. 그래서 미리 만들어 KV에 넣어두고, 모달은 읽기만 한다.
//
// 키(predAI:*)에는 생성에 쓴 수치의 해시가 같이 들어간다 — 부상자나 일정이 바뀌어
// 예측 숫자가 달라지면 해시가 달라져서 다음 크론 때 자연히 다시 만들어진다.
//
// 삭제는 안 하지만 외부 API(Gemini) 할당량을 쓰는 엔드포인트라 maintenance.js와
// 같은 기준으로 CRON_SECRET을 요구한다(미설정이면 거부).

import { generatePreview, AI_ENABLED } from './_ai.js';
import { predictAiKey } from './_predict.js';
import footballHandler from './football.js';

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const AI_TTL_SEC = 14 * 24 * 60 * 60;   // 경기가 지나면 쓸모없다
// 앞으로 이 기간 안에 열리는 경기를 만든다. 처음엔 10일로 뒀다가, A매치 휴식기에
// 다음 경기가 18일 뒤라 대상이 0건이 되는 걸 겪었다(실측: 2026-09-22 기준 다음 경기
// 10/10). 기간을 넉넉히 잡고, 그래도 비면 가장 가까운 경기 몇 개는 무조건 포함한다 —
// 수치가 바뀌면 키가 달라져 어차피 다시 만들어지므로 일찍 만들어두는 손해가 없다.
const HORIZON_DAYS = 21;
const MIN_MATCHES = 2;

// football.js를 HTTP로 다시 부르지 않고 함수로 직접 호출한다.
// 처음엔 `https://${req.headers.host}/api/football`로 자기 자신을 불렀는데, 크론이
// 배포 URL(arsenal-xxxx.vercel.app)에서 돌면 그 호스트는 Deployment Protection이
// 걸려 있어서 JSON 대신 로그인 페이지가 돌아온다 → 파싱 실패 → 500(실측).
// 직접 호출하면 인증도, 네트워크 왕복도, 자기 자신에 대한 부하도 없다.
async function callFootball(query){
  let payload = null;
  const res = {
    setHeader(){}, status(){ return this; },
    json(d){ payload = d; return this; },
  };
  await footballHandler({query, headers: {}}, res);
  return payload;
}

async function kv(...args){
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: {Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json'},
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(10000),
  });
  const j = await r.json();
  if(j.error) throw new Error(`KV ${args[0]}: ${j.error}`);
  return j.result;
}

export default async function handler(req, res){
  const secret = process.env.CRON_SECRET;
  if(!secret) return res.status(503).json({error: 'CRON_SECRET 미설정'});
  if(req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({error: 'unauthorized'});
  if(!KV_URL || !KV_TOKEN) return res.status(503).json({error: 'KV 자격증명 없음'});
  if(!AI_ENABLED) return res.status(503).json({error: 'GEMINI_API_KEY 미설정'});

  const dry = !!req.query.dry;
  const report = {checked: 0, generated: 0, cached: 0, failed: 0, matches: []};

  try {
    const fx = await callFootball({type: 'fixtures'});
    const now = Date.now();
    const horizon = now + HORIZON_DAYS * 24 * 60 * 60 * 1000;
    const future = (fx.matches || [])
      .filter(m => m.status !== 'FINISHED' && new Date(m.utcDate || m.date).getTime() > now)
      .sort((a, b) => new Date(a.utcDate || a.date) - new Date(b.utcDate || b.date));
    const within = future.filter(m => new Date(m.utcDate || m.date).getTime() < horizon);
    const upcoming = within.length >= MIN_MATCHES ? within : future.slice(0, MIN_MATCHES);
    report.horizonDays = HORIZON_DAYS;
    report.upcoming = upcoming.length;

    for(const m of upcoming){
      const home = (m.homeTeam || {}).id, away = (m.awayTeam || {}).id;
      if(!home || !away) continue;
      report.checked++;
      const p = await callFootball({
        type: 'predict', home: String(home), away: String(away),
        league: m.leagueId ? String(m.leagueId) : undefined,
        date: m.utcDate || undefined,
      });
      if(!p || !p.available){ report.matches.push({id: m.id, skip: '예측 불가'}); continue; }

      const key = predictAiKey(p);
      const hit = await kv('GET', key);
      if(hit){ report.cached++; report.matches.push({id: m.id, key, cached: true}); continue; }
      if(dry){ report.matches.push({id: m.id, key, would: '생성'}); continue; }

      const text = await generatePreview(p);
      if(!text){ report.failed++; report.matches.push({id: m.id, key, failed: true}); continue; }
      await kv('SET', key, text, 'EX', String(AI_TTL_SEC));
      report.generated++;
      report.matches.push({id: m.id, key, text});
    }
    return res.json(report);
  } catch(err){
    return res.status(500).json({error: err.message, report});
  }
}
