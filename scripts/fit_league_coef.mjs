// scripts/fit_league_coef.mjs — 리그 수준 계수 실측 (로컬 수동 실행)
//
//   node scripts/fit_league_coef.mjs
//
// 결과를 arsenal-dashboard/api/football.js의 LEAGUE_COEF에 옮겨 적는다.
// 시즌이 두어 개 더 쌓이면 다시 돌려 갱신할 것.
import fs from 'fs';
import os from 'os';
import path from 'path';

const CACHE = path.join(os.tmpdir(), 'arsenal-coef-cache');
const HEADERS = {'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.fotmob.com/'};
fs.mkdirSync(CACHE, {recursive: true});
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJSON(url, key){
  const f = path.join(CACHE, key + '.json');
  if(fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  const j = await (await fetch(url, {headers: HEADERS})).json();
  fs.writeFileSync(f, JSON.stringify(j));
  await sleep(120);
  return j;
}

// 대회 경기 목록
async function compMatches(leagueId, season){
  const j = await getJSON(`https://www.fotmob.com/api/data/leagues?id=${leagueId}&season=${encodeURIComponent(season)}`, `comp${leagueId}_${season.replace('/', '-')}`);
  const out = [];
  for(const m of (((j.fixtures || {}).allMatches) || [])){
    const st = m.status || {};
    if(!st.finished || st.cancelled) continue;
    const sc = /^(\d+)\s*-\s*(\d+)$/.exec(String(st.scoreStr || '').trim());
    if(!sc) continue;
    // 리그페이즈만 — 녹아웃은 홈/원정 2차전 구조라 성격이 다르다
    const round = String(m.roundName || m.round || '');
    out.push({homeId: String((m.home || {}).id), awayId: String((m.away || {}).id),
      homeGoals: +sc[1], awayGoals: +sc[2], round});
  }
  return out;
}
// 팀 → 자국 리그 id
async function teamLeague(teamId){
  const j = await getJSON(`https://www.fotmob.com/api/data/teams?id=${teamId}`, `team${teamId}`);
  const tables = (j.table || []).map(x => x.data || {}).filter(d => d.leagueId);
  const dom = tables.find(d => d.ccode && d.ccode !== 'INT') || tables[0] || {};
  return dom.leagueId ? {id: dom.leagueId, name: dom.leagueName || String(dom.leagueId)} : null;
}
// 자국 리그 시즌 테이블 → 팀별 리그평균 대비 공격/실점 배수
async function domesticRatios(leagueId, season){
  const j = await getJSON(`https://www.fotmob.com/api/data/leagues?id=${leagueId}&season=${encodeURIComponent(season)}`, `dom${leagueId}_${season.replace('/', '-')}`);
  const tb = (((j.table || [])[0] || {}).data || {}).table || {};
  const rows = [];
  (tb.all || []).forEach(t => {
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(String(t.scoresStr || '').trim());
    if(!m || !t.played) return;
    rows.push({id: String(t.id || t.teamId), played: t.played, gf: +m[1], ga: +m[2]});
  });
  if(!rows.length) return null;
  const tm = rows.reduce((a, r) => a + r.played, 0);
  const avg = rows.reduce((a, r) => a + r.gf, 0) / tm;
  const out = {avg, teams: {}};
  rows.forEach(r => { out.teams[r.id] = {att: (r.gf / r.played) / avg, def: (r.ga / r.played) / avg}; });
  return out;
}

const COMPS = [{id: 42, name: 'UCL'}, {id: 73, name: 'UEL'}, {id: 10216, name: 'UECL'}];
const SEASONS = ['2024/2025', '2025/2026'];

// 1) 대회 경기 모으기
const raw = [];
for(const c of COMPS) for(const s of SEASONS){
  try { (await compMatches(c.id, s)).forEach(m => raw.push({...m, comp: c.name, season: s})); }
  catch(e){ console.log(`  ${c.name} ${s} 실패: ${e.message}`); }
}
console.log(`유럽대항전 종료 경기: ${raw.length}개`);

// 2) 팀 → 자국 리그
const teamIds = [...new Set(raw.flatMap(m => [m.homeId, m.awayId]))];
console.log(`등장 팀: ${teamIds.length}개 — 자국 리그 조회 중...`);
const league = {};
for(const id of teamIds){
  try { league[id] = await teamLeague(id); } catch(e){ league[id] = null; }
}

// 3) 각 시즌·리그 테이블
const need = new Set();
raw.forEach(m => { for(const id of [m.homeId, m.awayId]){ const L = league[id]; if(L) need.add(L.id + '|' + m.season); } });
const dom = {};
for(const k of need){
  const [lid, season] = k.split('|');
  try { dom[k] = await domesticRatios(lid, season); } catch(e){ dom[k] = null; }
}

// 4) 쓸 수 있는 경기만 남기기
const data = [];
for(const m of raw){
  const Lh = league[m.homeId], La = league[m.awayId];
  if(!Lh || !La || Lh.id === La.id) continue;        // 같은 리그끼리는 계수 추정에 쓸모없음
  const dh = dom[Lh.id + '|' + m.season], da = dom[La.id + '|' + m.season];
  if(!dh || !da) continue;
  const th = dh.teams[m.homeId], ta = da.teams[m.awayId];
  if(!th || !ta) continue;
  data.push({...m, Lh: Lh.id, La: La.id, nameH: Lh.name, nameA: La.name, th, ta});
}
console.log(`계수 추정에 쓸 교차리그 경기: ${data.length}개\n`);

// 5) μ와 홈 보정
const totalGoals = data.reduce((a, m) => a + m.homeGoals + m.awayGoals, 0);
const mu = totalGoals / (data.length * 2);
const homeMu = data.reduce((a, m) => a + m.homeGoals, 0) / data.length;
const awayMu = data.reduce((a, m) => a + m.awayGoals, 0) / data.length;
const homeF = homeMu / mu, awayF = awayMu / mu;
console.log(`대회 평균 득점 ${mu.toFixed(2)} (홈 ${homeMu.toFixed(2)} / 원정 ${awayMu.toFixed(2)})`);

// 6) 반복 적합 — 감마(배수 압축)를 같이 찾는다
//
// 자국 리그 '평균 대비 배수'를 그대로 곱하면 약한 리그의 절대 강팀이 과대평가된다
// (바이에른의 분데스리가 배수는 2배가 넘는데, 상대가 약해서 부풀려진 값이다).
// 그래서 배수를 log 공간에서 눌러준다: 실효배수 = 배수^gamma (gamma<1이면 극단값이
// 1 쪽으로 당겨진다). gamma도 감이 아니라 실제 교차리그 결과의 우도로 고른다.
const leagues = [...new Set(data.flatMap(m => [m.Lh, m.La]))];
const names = {};
data.forEach(m => { names[m.Lh] = m.nameH; names[m.La] = m.nameA; });
const lnFact = n => { let acc = 0; for(let i2 = 2; i2 <= n; i2++) acc += Math.log(i2); return acc; };
const poissonLL = (k, lam) => k * Math.log(Math.max(lam, 1e-9)) - lam - lnFact(k);

function fitCoefs(gamma){
  const cf = Object.fromEntries(leagues.map(l => [l, 1]));
  const g = r => Math.pow(Math.max(r, 0.05), gamma);
  const pr = m => ({
    h: mu * (g(m.th.att) * cf[m.Lh]) * (g(m.ta.def) / cf[m.La]) * homeF,
    a: mu * (g(m.ta.att) * cf[m.La]) * (g(m.th.def) / cf[m.Lh]) * awayF,
  });
  for(let it = 0; it < 400; it++){
    const scored = {}, sPred = {}, conc = {}, cPred = {};
    leagues.forEach(l => { scored[l] = sPred[l] = conc[l] = cPred[l] = 0; });
    for(const m of data){
      const p = pr(m);
      scored[m.Lh] += m.homeGoals; sPred[m.Lh] += p.h; conc[m.Lh] += m.awayGoals; cPred[m.Lh] += p.a;
      scored[m.La] += m.awayGoals; sPred[m.La] += p.a; conc[m.La] += m.homeGoals; cPred[m.La] += p.h;
    }
    for(const l of leagues){
      if(sPred[l] <= 0 || cPred[l] <= 0) continue;
      const up = (scored[l] / sPred[l]) * (cPred[l] / conc[l] || 1);
      cf[l] *= Math.pow(up, 0.06);
      cf[l] = Math.min(Math.max(cf[l], 0.4), 2.2);
    }
    const base = cf[47] || 1;                    // EPL = 1.0 기준으로 정규화
    leagues.forEach(l => { cf[l] /= base; });
  }
  let ll = 0;
  for(const m of data){ const p = pr(m); ll += poissonLL(m.homeGoals, p.h) + poissonLL(m.awayGoals, p.a); }
  return {coef: cf, ll};
}

console.log('감마(배수 압축) 탐색 — 교차리그 경기의 포아송 우도 기준');
let bestFit = null;
for(let gamma = 0.30; gamma <= 1.0001; gamma += 0.05){
  const r = fitCoefs(gamma);
  const mark = !bestFit || r.ll > bestFit.ll ? ' <=' : '';
  console.log('   gamma ' + gamma.toFixed(2) + '   로그우도 ' + r.ll.toFixed(1) + mark);
  if(!bestFit || r.ll > bestFit.ll) bestFit = {gamma, ...r};
}
console.log('');
console.log('→ 최적 gamma ' + bestFit.gamma.toFixed(2) + ' (1.00 = 압축 없음)');
console.log('');
const coef = bestFit.coef;
const GAMMA = bestFit.gamma;

// 7) 표본 수로 평균(1.0) 쪽으로 보정 — 경기 적은 리그는 믿을 수 없다
const games = {};
leagues.forEach(l => { games[l] = 0; });
data.forEach(m => { games[m.Lh]++; games[m.La]++; });
// 표본이 적은 리그를 1.0(= EPL과 동급)으로 당기면 말이 안 된다. 잘 적합된 리그들의
// 중앙값 쪽으로 당긴다 — "모르는 리그는 중간쯤"이 합리적인 사전값이다.
const K = 30;
const solid = leagues.filter(l => games[l] >= 40).map(l => coef[l]).sort((a, b) => a - b);
const target = solid.length ? solid[Math.floor(solid.length / 2)] : 0.7;
console.log(`표본 보정 기준값(잘 적합된 리그 중앙값): ${target.toFixed(3)}
`);
const rows = leagues.map(l => {
  const w = games[l] / (games[l] + K);
  return {id: l, name: names[l], n: games[l], fit: coef[l], final: target + w * (coef[l] - target)};
}).sort((a, b) => b.final - a.final);

const CURRENT = {47: 1.00, 87: 0.97, 55: 0.95, 54: 0.94, 53: 0.88, 57: 0.82, 61: 0.82, 40: 0.78, 71: 0.76, 48: 0.75, 64: 0.70};
console.log('리그          경기수   적합값   표본보정   현재 코드   차이');
for(const r of rows){
  if(r.n < 8) continue;
  const cur = CURRENT[r.id];
  console.log(`${String(r.name).padEnd(22)} ${String(r.n).padStart(4)}   ${r.fit.toFixed(3)}    ${r.final.toFixed(3)}     ${cur != null ? cur.toFixed(2) : '  —  '}     ${cur != null ? (r.final - cur >= 0 ? '+' : '') + (r.final - cur).toFixed(2) : ''}`);
}
console.log('\n코드에 넣을 형태 (gamma ' + GAMMA.toFixed(2) + '):');
console.log('const LEAGUE_COEF = {');
for(const r of rows){ if(r.n >= 8) console.log(`  ${r.id}: ${r.final.toFixed(2)},   // ${r.name} (교차리그 ${r.n}경기)`); }
console.log('};');
