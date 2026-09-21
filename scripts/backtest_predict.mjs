// scripts/backtest_predict.mjs — 경기 예측 모형 백테스트 (로컬 수동 실행)
//
//   node scripts/backtest_predict.mjs                  # 최근 두 시즌 평가
//   node scripts/backtest_predict.mjs 2025/2026        # 특정 시즌만
//   node scripts/backtest_predict.mjs --league 87      # 다른 리그(라리가 등)
//
// 왜 필요한가: 예측 모형에 변수를 더할 때마다 "정말 나아졌는지" 잴 방법이 없으면
// 계수를 감으로 정하게 된다. 이 스크립트는 지난 시즌 전 경기를 하루씩 되짚으며
// (그 경기 이전 정보만 써서) 예측하고, 실제 결과와 비교해 로그손실·브라이어
// 점수를 낸다. 모형 코드는 운영과 같은 arsenal-dashboard/api/_predict.js를 쓴다 —
// 여기서 좋아진 값이 운영에서 그대로 재현돼야 의미가 있다.
//
// 한계(결과 해석할 때 반드시 감안할 것):
//  - Fotmob 리그 응답엔 경기별 xG가 없어서 백테스트는 **득점 기반**으로만 돈다.
//    운영 모형은 xG 집계를 60% 섞으므로, 여기 절대 수치보다 "변수 추가 전후의
//    차이"를 보는 용도다.
//  - 휴식일도 그 리그 경기만으로 계산한다(컵·유럽대항전 제외). 실제 일정 밀집은
//    이보다 심하므로 일정 변수의 효과는 여기서 과소평가된다.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { PARAMS, scoreProbs, blendRatio, decayedForm, homeEdgeFrom, restFactor, lambdasFrom } from '../arsenal-dashboard/api/_predict.js';

const args = process.argv.slice(2);
// --params priorK=12,halfLifeDays=90 형태로 계수를 덮어쓴다. 튜닝 시즌에서 고른
// 값을 소스 수정 없이 검증 시즌에 그대로 적용해보기 위한 것.
const paramArg = (args.find(a => a.startsWith('--params=')) || '').split('=').slice(1).join('=')
  || (args.includes('--params') ? args[args.indexOf('--params') + 1] : '');
if(paramArg){
  for(const kv of paramArg.split(',')){
    const [k, v] = kv.split('=');
    if(k && v !== undefined && PARAMS[k.trim()] !== undefined) PARAMS[k.trim()] = Number(v);
  }
  console.log('계수 덮어쓰기:', paramArg);
}
const leagueId = Number((args.find(a => a.startsWith('--league')) || '').split('=')[1] || args[args.indexOf('--league') + 1]) || 47;
const wanted = args.filter(a => /^\d{4}\/\d{4}$/.test(a));

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
    out.push({
      id: String(m.id),
      utcTime: st.utcTime,
      round: Number(m.roundName) || null,
      homeId: String((m.home || {}).id), awayId: String((m.away || {}).id),
      homeName: (m.home || {}).shortName || (m.home || {}).name,
      awayName: (m.away || {}).shortName || (m.away || {}).name,
      homeGoals: Number(sc[1]), awayGoals: Number(sc[2]),
    });
  }
  out.sort((a, b) => new Date(a.utcTime) - new Date(b.utcTime));
  fs.writeFileSync(file, JSON.stringify(out));
  return out;
}

function seasonBefore(season){
  const [a, b] = season.split('/').map(Number);
  return `${a - 1}/${b - 1}`;
}

// 지난 시즌 전체를 "리그 평균 대비 배수"로 요약 — 이번 시즌 사전값이 된다.
function priorRatios(matches){
  const t = {};
  const touch = id => (t[id] = t[id] || {gf: 0, ga: 0, played: 0});
  matches.forEach(m => {
    const h = touch(m.homeId), a = touch(m.awayId);
    h.gf += m.homeGoals; h.ga += m.awayGoals; h.played++;
    a.gf += m.awayGoals; a.ga += m.homeGoals; a.played++;
  });
  const teamMatches = Object.values(t).reduce((s, x) => s + x.played, 0);
  const avg = teamMatches ? Object.values(t).reduce((s, x) => s + x.gf, 0) / teamMatches : 1.4;
  const out = {};
  for(const id of Object.keys(t)){
    const x = t[id];
    out[id] = {attack: (x.gf / x.played) / avg, defence: (x.ga / x.played) / avg, played: x.played};
  }
  return {ratios: out, avg};
}

// 모형 변형들 — 무엇을 켜고 끄는지가 곧 비교 대상이다.
const VARIANTS = [
  {key: 'A', name: '기존(평균으로 당김)',        usePrior: false, decay: false, rest: false},
  {key: 'B', name: '+ 지난 시즌 사전값',          usePrior: true,  decay: false, rest: false},
  {key: 'C', name: '+ 시간 감쇠',                 usePrior: true,  decay: true,  rest: false},
  {key: 'D', name: '+ 일정(휴식일·밀집)',         usePrior: true,  decay: true,  rest: true},
];

function newScore(){ return {n: 0, logloss: 0, brier: 0, hit: 0, buckets: {}}; }
function addScore(s, probs, actual, bucket){
  const p = [probs.home, probs.draw, probs.away];
  const y = [actual === 'H' ? 1 : 0, actual === 'D' ? 1 : 0, actual === 'A' ? 1 : 0];
  const pi = Math.max(p[y.indexOf(1)], 1e-9);
  s.n++;
  s.logloss += -Math.log(pi);
  s.brier += p.reduce((acc, v, i) => acc + (v - y[i]) ** 2, 0);
  s.hit += (p.indexOf(Math.max(...p)) === y.indexOf(1)) ? 1 : 0;
  const b = (s.buckets[bucket] = s.buckets[bucket] || {n: 0, logloss: 0});
  b.n++; b.logloss += -Math.log(pi);
}
const fin = s => ({n: s.n, logloss: s.logloss / s.n, brier: s.brier / s.n, acc: s.hit / s.n,
                   buckets: Object.fromEntries(Object.entries(s.buckets).map(([k, v]) => [k, v.logloss / v.n]))});

async function runSeason(season){
  const matches = await seasonMatches(season);
  const prevMatches = await seasonMatches(seasonBefore(season)).catch(() => []);
  const prior = priorRatios(prevMatches);
  if(!matches.length){ console.log(`${season}: 경기 없음`); return null; }

  const scores = Object.fromEntries(VARIANTS.map(v => [v.key, newScore()]));
  // 진행하며 쌓는 이번 시즌 기록
  const agg = {};            // id -> {gf,ga,played, homeGf,homeN, awayGf,awayN, dates:[]}
  const touch = id => (agg[id] = agg[id] || {gf: 0, ga: 0, played: 0, homeGf: 0, homeN: 0, awayGf: 0, awayN: 0, dates: []});
  let totalGoals = 0, totalTeamMatches = 0;

  for(let i = 0; i < matches.length; i++){
    const m = matches[i];
    const H = touch(m.homeId), A = touch(m.awayId);
    const played = Math.min(H.played, A.played);
    // 양 팀 모두 최소 1경기는 치른 뒤부터 평가한다(0경기면 사전값만 남아 비교가 무의미).
    const evaluate = H.played >= 1 && A.played >= 1;

    if(evaluate){
      const leagueAvg = totalTeamMatches ? totalGoals / totalTeamMatches : prior.avg;
      const homeAvg = totalTeamMatches ? Object.values(agg).reduce((s, x) => s + x.homeGf, 0) / Math.max(Object.values(agg).reduce((s, x) => s + x.homeN, 0), 1) : leagueAvg;
      const awayAvg = totalTeamMatches ? Object.values(agg).reduce((s, x) => s + x.awayGf, 0) / Math.max(Object.values(agg).reduce((s, x) => s + x.awayN, 0), 1) : leagueAvg;
      const he = homeEdgeFrom(homeAvg, awayAvg, leagueAvg, totalTeamMatches);
      const decay = decayedForm(matches.slice(0, i), m.utcTime);

      const bucket = (m.round || 0) <= 6 ? 'R1-6' : (m.round || 0) <= 19 ? 'R7-19' : 'R20+';
      const actual = m.homeGoals > m.awayGoals ? 'H' : m.homeGoals === m.awayGoals ? 'D' : 'A';

      for(const v of VARIANTS){
        const side = (id, st) => {
          const d = decay[id] || {};
          const pr = prior.ratios[id];
          const common = {curPlayed: st.played, leagueAvg, usePrior: v.usePrior, params: PARAMS};
          const attack = blendRatio({...common,
            curXgRate: null,
            curDecayRate: v.decay ? d.gfPerMatch : (st.played ? st.gf / st.played : null),
            prevRatio: pr ? pr.attack : null});
          const defence = blendRatio({...common, isDefence: true,
            curXgRate: null,
            curDecayRate: v.decay ? d.gaPerMatch : (st.played ? st.ga / st.played : null),
            prevRatio: pr ? pr.defence : null});
          return {attack, defence};
        };
        const hs = side(m.homeId, H), as = side(m.awayId, A);
        let hRest = null, aRest = null;
        if(v.rest){
          const kickoff = new Date(m.utcTime).getTime();
          const restOf = st => {
            if(!st.dates.length) return null;
            const last = st.dates[st.dates.length - 1];
            const days = (kickoff - last) / 86400000;
            const win = st.dates.filter(t => kickoff - t <= PARAMS.congestionWindowDays * 86400000).length;
            return restFactor(days, win);
          };
          hRest = restOf(H); aRest = restOf(A);
        }
        const lam = lambdasFrom({leagueAvg,
          homeAttack: hs.attack, homeDefence: hs.defence,
          awayAttack: as.attack, awayDefence: as.defence,
          homeFactor: he.homeFactor, awayFactor: he.awayFactor,
          homeRest: hRest, awayRest: aRest});
        const r = scoreProbs(lam.home, lam.away);
        addScore(scores[v.key], r.probs, actual, bucket);
      }
    }

    // 결과 반영(항상 예측 이후에)
    H.gf += m.homeGoals; H.ga += m.awayGoals; H.played++; H.homeGf += m.homeGoals; H.homeN++;
    A.gf += m.awayGoals; A.ga += m.homeGoals; A.played++; A.awayGf += m.awayGoals; A.awayN++;
    H.dates.push(new Date(m.utcTime).getTime());
    A.dates.push(new Date(m.utcTime).getTime());
    totalGoals += m.homeGoals + m.awayGoals;
    totalTeamMatches += 2;
  }
  return {season, scores: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, fin(v)]))};
}

const seasons = wanted.length ? wanted : ['2025/2026', '2024/2025'];
const results = [];
for(const s of seasons){
  const r = await runSeason(s);
  if(r) results.push(r);
}

const pad = (s, n) => String(s).padEnd(n);
const num = (v, d = 4) => v.toFixed(d);
console.log(`\n리그 ${leagueId} · 평가 시즌: ${results.map(r => r.season).join(', ')}`);
console.log('로그손실(낮을수록 좋음) / 브라이어(낮을수록) / 적중률(높을수록)\n');
for(const r of results){
  console.log(`■ ${r.season}  (${r.scores.A.n}경기)`);
  console.log(`   ${pad('변형', 24)} ${pad('로그손실', 10)} ${pad('브라이어', 10)} ${pad('적중률', 8)} 라운드별 로그손실`);
  for(const v of VARIANTS){
    const s = r.scores[v.key];
    const bk = ['R1-6', 'R7-19', 'R20+'].filter(b => s.buckets[b] != null).map(b => `${b} ${num(s.buckets[b], 3)}`).join('  ');
    console.log(`   ${pad(v.key + '. ' + v.name, 24)} ${pad(num(s.logloss), 10)} ${pad(num(s.brier), 10)} ${pad(num(s.acc * 100, 1) + '%', 8)} ${bk}`);
  }
  const base = r.scores.A.logloss, best = r.scores.D.logloss;
  console.log(`   → A 대비 D 개선: ${num((base - best) / base * 100, 2)}%\n`);
}
console.log('참고: 항상 33/33/33으로 찍으면 로그손실 1.0986. 이보다 낮아야 의미가 있다.');
