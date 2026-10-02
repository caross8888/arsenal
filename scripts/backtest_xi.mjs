// scripts/backtest_xi.mjs — 예상 선발 XI 백테스트 (로컬 수동 실행)
//
//   node scripts/backtest_xi.mjs                          # 아스날
//   node scripts/backtest_xi.mjs --teams 9825,8463,10260  # 여러 팀(Fotmob 팀 id)
//   node scripts/backtest_xi.mjs --params halfLifeMatches=4,cupWeight=0.3
//
// 지난 경기마다 "그 경기 이전 기록만" 써서 XI를 예측하고 실제 선발과 비교한다.
// 결장자는 그 경기의 Fotmob unavailable 명단을 쓴다(운영도 경기 전에 같은 명단을 본다).
// 예측 코드는 운영과 같은 arsenal-dashboard/api/_lineup.js — 여기서 좋아진 값이 운영에서
// 그대로 재현돼야 의미가 있다. 비교용으로 예전 방식(최근 3경기 복사 + 결장 자리만 교체)도 같이 돌린다.
//
// 지표:
//  - 선발 일치: 예측 11명 중 실제 선발에 든 인원(평균, /11)
//  - 자리 일치: 그중 실제로 선 자리와 예측 자리가 가까운(거리 < 0.15) 인원
//
// 한계(결과 해석할 때 감안할 것):
//  - Fotmob 팀 일정 응답엔 이번 시즌만 있어서 시즌 초엔 표본이 작다. 여러 팀을 같이 돌릴 것.
//  - 선수 프로필 포지션(겸업 판단)은 "지금" 받은 값이라 과거 시점 기준으로는 미래 정보가
//    살짝 섞인다. 영향은 겸업 선수 배치에 한정된다.
//  - 응답은 OS 임시 폴더에 캐시한다(arsenal-xi-cache). 새 경기를 반영하려면 그 폴더를 지울 것.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { PARAMS, predictXI, posInfoFromPlayerData, isCupMatch } from '../arsenal-dashboard/api/_lineup.js';

const args = process.argv.slice(2);
const argVal = name => {
  const eq = args.find(a => a.startsWith(`--${name}=`));
  if(eq) return eq.split('=').slice(1).join('=');
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : '';
};
const paramArg = argVal('params');
if(paramArg){
  for(const kv of paramArg.split(',')){
    const [k, v] = kv.split('=');
    if(k && v !== undefined && PARAMS[k.trim()] !== undefined) PARAMS[k.trim()] = Number(v);
  }
  console.log('계수 덮어쓰기:', paramArg);
}
const TEAMS = (argVal('teams') || '9825').split(',').map(s => s.trim()).filter(Boolean);
const MIN_HISTORY = 3;

const CACHE_DIR = path.join(os.tmpdir(), 'arsenal-xi-cache');
const HEADERS = {'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.fotmob.com/'};
async function cachedJSON(name, url){
  fs.mkdirSync(CACHE_DIR, {recursive: true});
  const file = path.join(CACHE_DIR, name + '.json');
  if(fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const r = await fetch(url, {headers: HEADERS});
  if(!r.ok) throw new Error(`Fotmob ${r.status} ${url}`);
  const j = await r.json();
  fs.writeFileSync(file, JSON.stringify(j));
  return j;
}

// football.js의 predxiMatchRecord와 같은 모양으로 만든다.
async function teamHistory(teamId){
  const td = await cachedJSON(`team_${teamId}`, `https://www.fotmob.com/api/data/teams?id=${teamId}`);
  const name = (td.details || {}).name || teamId;
  const all = ((td.fixtures || {}).allFixtures || {}).fixtures || [];
  const done = all.filter(f => {
    const st = f.status || {}, tour = f.tournament || {};
    return st.finished && !st.cancelled && tour.leagueId !== 489 && !/friendl/i.test(tour.name || '');
  });
  const recs = [];
  for(const f of done){
    const md = await cachedJSON(`md_${f.id}`, `https://www.fotmob.com/api/data/matchDetails?matchId=${f.id}`).catch(() => null);
    if(!md) continue;
    const L = (md.content || {}).lineup || {};
    const t = (L.homeTeam && String(L.homeTeam.id) === String(teamId)) ? L.homeTeam : L.awayTeam;
    const mp = p => ({id: String(p.id), name: p.name || '', num: p.shirtNumber ?? null, usual: p.usualPlayingPositionId ?? null});
    const starters = ((t && t.starters) || []).filter(p => p.horizontalLayout)
      .map(p => ({...mp(p), layout: {x: p.horizontalLayout.x, y: p.horizontalLayout.y}}));
    if(starters.length < 10) continue;
    recs.push({
      id: String(f.id), at: (f.status || {}).utcTime, leagueId: (f.tournament || {}).leagueId,
      tournament: (f.tournament || {}).name || '', opponent: ((f.opponent || {}).name) || '',
      formation: t.formation || null, starters,
      bench: (t.subs || []).map(mp), out: (t.unavailable || []).map(p => String(p.id)),
    });
  }
  return {name, recs};
}

async function posInfoFor(ids){
  const out = {};
  for(const id of ids){
    const pd = await cachedJSON(`pd_${id}`, `https://www.fotmob.com/api/data/playerData?id=${id}`).catch(() => null);
    out[id] = pd ? posInfoFromPlayerData(pd) : [];
  }
  return out;
}

// ── 예전 방식(비교 기준) — 운영에서 내린 코드를 그대로 옮겨 둔 것 ──
function legacyPredict(history, outIds){
  history = history.slice(-3);
  if(!history.length) return null;
  const fc = {};
  history.forEach((h, i) => { if(h.formation) fc[h.formation] = (fc[h.formation] || 0) + 1 + i * 0.01; });
  const top = Object.entries(fc).sort((a, b) => b[1] - a[1])[0];
  const formation = top ? top[0] : null;
  const base = (formation ? history.filter(h => h.formation === formation) : history).slice(-1)[0];
  const freq = {};
  history.forEach((h, i) => h.starters.forEach(p => {
    if(!freq[p.id]) freq[p.id] = {p, n: 0};
    freq[p.id].n += 1 + i * 0.1;
  }));
  const banned = new Set((outIds || []).map(String));
  const used = new Set(base.starters.filter(p => !banned.has(p.id)).map(p => p.id));
  const xi = base.starters.map(slot => {
    if(!banned.has(slot.id)) return {...slot};
    const pool = Object.values(freq).filter(f => !banned.has(f.p.id) && !used.has(f.p.id));
    const cand = pool.filter(f => f.p.usual === slot.usual).sort((a, b) => b.n - a.n)[0]
              || pool.sort((a, b) => b.n - a.n)[0];
    if(!cand) return {...slot};
    used.add(cand.p.id);
    return {...cand.p, layout: slot.layout};
  });
  return {formation, xi};
}

function grade(pred, actual){
  const act = new Map(actual.starters.map(p => [String(p.id), p.layout]));
  let inXI = 0, inSpot = 0;
  for(const p of pred.xi){
    const a = act.get(String(p.id));
    if(!a) continue;
    inXI++;
    if(Math.hypot(a.x - p.layout.x, a.y - p.layout.y) < 0.15) inSpot++;
  }
  return {inXI, inSpot};
}

const blank = () => ({legacy: {n: 0, xi: 0, spot: 0}, now: {n: 0, xi: 0, spot: 0}});
const total = blank(), cupTotal = blank();
for(const teamId of TEAMS){
  const {name, recs} = await teamHistory(teamId);
  const ids = [...new Set(recs.flatMap(r => [...r.starters, ...r.bench].map(p => p.id)))];
  const posInfo = await posInfoFor(ids);
  console.log(`\n== ${name} (${recs.length}경기) ==`);
  for(let k = MIN_HISTORY; k < recs.length; k++){
    const hist = recs.slice(0, k), actual = recs[k];
    // 컵 경기는 운영과 같이 컵대회 모드로 예측한다(로테이션 반영).
    const cup = isCupMatch(actual);
    const a = legacyPredict(hist, actual.out), b = predictXI(hist, actual.out, posInfo, {cup});
    if(!a || !b) continue;
    const ga = grade(a, actual), gb = grade(b, actual);
    for(const t of cup ? [total, cupTotal] : [total]){
      t.legacy.n++; t.legacy.xi += ga.inXI; t.legacy.spot += ga.inSpot;
      t.now.n++;    t.now.xi += gb.inXI;    t.now.spot += gb.inSpot;
    }
    console.log(`${(actual.at || '').slice(0, 10)} ${actual.opponent}${cup ? ' (컵)' : ''}`.padEnd(40)
      + ` 예전 ${ga.inXI}/11·자리 ${ga.inSpot}   새 ${gb.inXI}/11·자리 ${gb.inSpot}`);
  }
}
const avg = (t, k) => t.n ? (t[k] / t.n).toFixed(2) : '-';
console.log(`\n합계 ${total.now.n}경기`);
console.log(`  예전 방식: 선발 일치 ${avg(total.legacy, 'xi')}/11, 자리 일치 ${avg(total.legacy, 'spot')}`);
console.log(`  새 방식:   선발 일치 ${avg(total.now, 'xi')}/11, 자리 일치 ${avg(total.now, 'spot')}`);
if(cupTotal.now.n){
  console.log(`그중 컵대회 ${cupTotal.now.n}경기`);
  console.log(`  예전 방식: 선발 일치 ${avg(cupTotal.legacy, 'xi')}/11, 자리 일치 ${avg(cupTotal.legacy, 'spot')}`);
  console.log(`  새 방식:   선발 일치 ${avg(cupTotal.now, 'xi')}/11, 자리 일치 ${avg(cupTotal.now, 'spot')}`);
}
