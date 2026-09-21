// scripts/backtest_sweep.mjs — 예측 모형 계수 튜닝 (로컬 수동 실행)
//
//   node scripts/backtest_sweep.mjs            # 주요 계수 훑기
//   node scripts/backtest_sweep.mjs priorK     # 하나만
//
// backtest_predict.mjs가 "변수를 더하면 나아지나"를 본다면, 이쪽은 "그 변수의
// 계수를 얼마로 둘까"를 데이터로 정한다. 감으로 정한 기본값(priorK 8, 반감기 60일
// 등)이 정말 최선인지 확인하는 용도다. 평가 지표는 로그손실(낮을수록 좋음).
//
// 한계는 backtest_predict.mjs와 같다 — 경기별 xG가 없어 득점 기반으로만 돈다.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { PARAMS, scoreProbs, blendRatio, decayedForm, homeEdgeFrom, restFactor, lambdasFrom } from '../arsenal-dashboard/api/_predict.js';

const leagueId = 47;
// --seasons 2023/2024,2024/2025 로 튜닝에 쓸 시즌을 고른다. 계수를 고른 시즌과
// 성능을 재는 시즌이 같으면 과적합이라 점수가 실제보다 좋게 나온다 — 검증 시즌은
// 여기서 빼두고 backtest_predict.mjs 쪽에서만 쓴다.
const seasonArg = (process.argv.find(x => x.startsWith('--seasons=')) || '').split('=')[1]
  || (process.argv.includes('--seasons') ? process.argv[process.argv.indexOf('--seasons') + 1] : '');
const SEASONS = seasonArg ? seasonArg.split(',').map(x => x.trim()) : ['2025/2026', '2024/2025', '2023/2024'];
const CACHE_DIR = path.join(os.tmpdir(), 'arsenal-backtest-cache');
const HEADERS = {'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.fotmob.com/'};

async function seasonMatches(season){
  fs.mkdirSync(CACHE_DIR, {recursive: true});
  const file = path.join(CACHE_DIR, `l${leagueId}_${season.replace('/', '-')}.json`);
  if(fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const url = `https://www.fotmob.com/api/data/leagues?id=${leagueId}&season=${encodeURIComponent(season)}`;
  const j = await (await fetch(url, {headers: HEADERS})).json();
  const all = ((j.fixtures || {}).allMatches) || [];
  const out = [];
  for(const m of all){
    const st = m.status || {};
    if(!st.finished || st.cancelled) continue;
    const sc = /^(\d+)\s*-\s*(\d+)$/.exec(String(st.scoreStr || '').trim());
    if(!sc) continue;
    out.push({id: String(m.id), utcTime: st.utcTime, round: Number(m.roundName) || null,
      homeId: String((m.home || {}).id), awayId: String((m.away || {}).id),
      homeGoals: Number(sc[1]), awayGoals: Number(sc[2])});
  }
  out.sort((a, b) => new Date(a.utcTime) - new Date(b.utcTime));
  fs.writeFileSync(file, JSON.stringify(out));
  return out;
}
const seasonBefore = s => { const [a, b] = s.split('/').map(Number); return `${a - 1}/${b - 1}`; };

function priorRatios(matches){
  const t = {};
  const touch = id => (t[id] = t[id] || {gf: 0, ga: 0, played: 0});
  matches.forEach(m => {
    const h = touch(m.homeId), a = touch(m.awayId);
    h.gf += m.homeGoals; h.ga += m.awayGoals; h.played++;
    a.gf += m.awayGoals; a.ga += m.homeGoals; a.played++;
  });
  const tm = Object.values(t).reduce((s, x) => s + x.played, 0);
  const avg = tm ? Object.values(t).reduce((s, x) => s + x.gf, 0) / tm : 1.4;
  const out = {};
  for(const id of Object.keys(t)){
    const x = t[id];
    out[id] = {attack: (x.gf / x.played) / avg, defence: (x.ga / x.played) / avg};
  }
  return {ratios: out, avg};
}

// 한 시즌을 params로 평가 → 평균 로그손실
async function evalSeason(season, params, cache){
  const matches = cache[season] || (cache[season] = await seasonMatches(season));
  const prevKey = seasonBefore(season);
  const prevMatches = cache[prevKey] || (cache[prevKey] = await seasonMatches(prevKey).catch(() => []));
  const prior = priorRatios(prevMatches);

  const agg = {};
  const touch = id => (agg[id] = agg[id] || {gf: 0, ga: 0, played: 0, homeGf: 0, homeN: 0, awayGf: 0, awayN: 0, dates: []});
  let totalGoals = 0, totalTeamMatches = 0, sumLL = 0, n = 0, sumEarly = 0, nEarly = 0;

  for(let i = 0; i < matches.length; i++){
    const m = matches[i];
    const H = touch(m.homeId), A = touch(m.awayId);
    if(H.played >= 1 && A.played >= 1){
      const leagueAvg = totalTeamMatches ? totalGoals / totalTeamMatches : prior.avg;
      const hN = Object.values(agg).reduce((s, x) => s + x.homeN, 0) || 1;
      const aN = Object.values(agg).reduce((s, x) => s + x.awayN, 0) || 1;
      const homeAvg = Object.values(agg).reduce((s, x) => s + x.homeGf, 0) / hN;
      const awayAvg = Object.values(agg).reduce((s, x) => s + x.awayGf, 0) / aN;
      const he = homeEdgeFrom(homeAvg, awayAvg, leagueAvg, totalTeamMatches, params);
      const decay = decayedForm(matches.slice(0, i), m.utcTime, params);

      const side = (id, st) => {
        const d = decay[id] || {};
        const pr = prior.ratios[id];
        const common = {curPlayed: st.played, leagueAvg, usePrior: true, params};
        return {
          attack: blendRatio({...common, curXgRate: null, curDecayRate: d.gfPerMatch, prevRatio: pr ? pr.attack : null}),
          defence: blendRatio({...common, isDefence: true, curXgRate: null, curDecayRate: d.gaPerMatch, prevRatio: pr ? pr.defence : null}),
        };
      };
      const hs = side(m.homeId, H), as = side(m.awayId, A);
      const kickoff = new Date(m.utcTime).getTime();
      const restOf = st => {
        if(!st.dates.length) return null;
        const last = st.dates[st.dates.length - 1];
        const win = st.dates.filter(t => kickoff - t <= params.congestionWindowDays * 86400000).length;
        return restFactor((kickoff - last) / 86400000, win, params);
      };
      const lam = lambdasFrom({leagueAvg,
        homeAttack: hs.attack, homeDefence: hs.defence, awayAttack: as.attack, awayDefence: as.defence,
        homeFactor: he.homeFactor, awayFactor: he.awayFactor,
        homeRest: restOf(H), awayRest: restOf(A)});
      const r = scoreProbs(lam.home, lam.away, params.dcRho);
      const actual = m.homeGoals > m.awayGoals ? 'home' : m.homeGoals === m.awayGoals ? 'draw' : 'away';
      const ll = -Math.log(Math.max(r.probs[actual], 1e-9));
      sumLL += ll; n++;
      if((m.round || 99) <= 6){ sumEarly += ll; nEarly++; }
    }
    H.gf += m.homeGoals; H.ga += m.awayGoals; H.played++; H.homeGf += m.homeGoals; H.homeN++;
    A.gf += m.awayGoals; A.ga += m.homeGoals; A.played++; A.awayGf += m.awayGoals; A.awayN++;
    H.dates.push(new Date(m.utcTime).getTime());
    A.dates.push(new Date(m.utcTime).getTime());
    totalGoals += m.homeGoals + m.awayGoals; totalTeamMatches += 2;
  }
  return {logloss: sumLL / n, early: nEarly ? sumEarly / nEarly : null, n};
}

async function evalAll(params, cache){
  let sum = 0, cnt = 0, eSum = 0, eCnt = 0;
  for(const s of SEASONS){
    const r = await evalSeason(s, params, cache);
    sum += r.logloss * r.n; cnt += r.n;
    if(r.early != null){ eSum += r.early; eCnt++; }
  }
  return {logloss: sum / cnt, early: eCnt ? eSum / eCnt : null};
}

const GRIDS = {
  priorK:            [3, 5, 8, 12, 18, 26],
  halfLifeDays:      [20, 30, 45, 60, 90, 150, 100000],
  dcRho:             [-0.20, -0.16, -0.13, -0.08, -0.04, 0],
  homeEdgePrior:     [0.08, 0.12, 0.15, 0.18, 0.22],
  restPenaltyPerDay: [0, 0.01, 0.02, 0.035, 0.05],
  congestionPenalty: [0, 0.01, 0.015, 0.03],
  promotedAttack:    [0.55, 0.62, 0.68, 0.72, 0.75, 0.80, 0.85],
  promotedDefence:   [1.15, 1.30, 1.40, 1.50, 1.65, 1.80],
  xgWeight:          [0, 0.3, 0.6, 1.0],
  promotedPriorK:    [2, 3, 5, 8, 12, 20],
};

const only = process.argv.slice(2).filter(a => GRIDS[a]);
console.log('튜닝 시즌:', SEASONS.join(', '));
const keys = only.length ? only : Object.keys(GRIDS);
const cache = {};
const base = await evalAll(PARAMS, cache);
console.log(`\n기준값(현재 계수): 로그손실 ${base.logloss.toFixed(4)} (시즌 초 6R ${base.early.toFixed(4)})`);
console.log(`평가: 리그 ${leagueId}, ${SEASONS.join(' / ')}\n`);

for(const key of keys){
  console.log(`■ ${key} (현재 ${PARAMS[key]})`);
  let best = null;
  for(const v of GRIDS[key]){
    const p = {...PARAMS, [key]: v};
    const r = await evalAll(p, cache);
    const diff = (base.logloss - r.logloss) / base.logloss * 100;
    const mark = v === PARAMS[key] ? ' ←현재' : '';
    console.log(`   ${String(v).padStart(8)}  로그손실 ${r.logloss.toFixed(4)}  (초반 ${r.early.toFixed(4)})  ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}%${mark}`);
    if(!best || r.logloss < best.ll) best = {v, ll: r.logloss};
  }
  console.log(`   → 최적 ${best.v} (${best.ll.toFixed(4)})\n`);
}
