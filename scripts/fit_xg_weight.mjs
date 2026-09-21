// scripts/fit_xg_weight.mjs — xG 비중 실측 (로컬 수동 실행)
//
//   node scripts/fit_xg_weight.mjs
//
// 결과를 arsenal-dashboard/api/_predict.js의 xgWeight/xgWeightDefence에 옮겨 적는다.
import fs from 'fs';
import os from 'os';
import path from 'path';

const CACHE = path.join(os.tmpdir(), 'arsenal-xg-cache');
const HEADERS = {'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.fotmob.com/'};
fs.mkdirSync(CACHE, {recursive: true});

async function table(leagueId, season){
  const f = path.join(CACHE, `t${leagueId}_${season.replace('/', '-')}.json`);
  if(fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  const url = `https://www.fotmob.com/api/data/leagues?id=${leagueId}&season=${encodeURIComponent(season)}`;
  const j = await (await fetch(url, {headers: HEADERS})).json();
  const tb = (((j.table || [])[0] || {}).data || {}).table || {};
  const rows = {};
  (tb.all || []).forEach(t => {
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(String(t.scoresStr || '').trim());
    if(!m || !t.played) return;
    rows[String(t.id || t.teamId)] = {name: t.shortName || t.name, played: t.played, gf: +m[1], ga: +m[2]};
  });
  (tb.xg || []).forEach(t => {
    const id = String(t.id || t.teamId);
    if(rows[id] && t.played){ rows[id].xg = t.xg; rows[id].xgc = t.xgConceded; }
  });
  fs.writeFileSync(f, JSON.stringify(rows));
  return rows;
}

const LEAGUES = [
  {id: 47, name: 'Premier League'},
  {id: 87, name: 'LaLiga'},
  {id: 54, name: 'Bundesliga'},
  {id: 55, name: 'Serie A'},
  {id: 53, name: 'Ligue 1'},
];
const SEASONS = ['2022/2023', '2023/2024', '2024/2025', '2025/2026'];

// 각 시즌 → 다음 시즌으로 이어지는 팀들의 (이번 xG율, 이번 득점율) → (다음 득점율)
const rows = [];
for(const lg of LEAGUES){
  for(let i = 0; i + 1 < SEASONS.length; i++){
    let cur, nxt;
    try { cur = await table(lg.id, SEASONS[i]); nxt = await table(lg.id, SEASONS[i + 1]); }
    catch(e){ continue; }
    const avgOf = t => {
      const v = Object.values(t);
      const tm = v.reduce((a, x) => a + x.played, 0) || 1;
      return {
        goals: v.reduce((a, x) => a + x.gf, 0) / tm,
        xg: v.some(x => x.xg != null) ? v.filter(x => x.xg != null).reduce((a, x) => a + x.xg, 0) / v.filter(x => x.xg != null).reduce((a, x) => a + x.played, 0) : null,
        ga: v.reduce((a, x) => a + x.ga, 0) / tm,
        xgc: v.some(x => x.xgc != null) ? v.filter(x => x.xgc != null).reduce((a, x) => a + x.xgc, 0) / v.filter(x => x.xgc != null).reduce((a, x) => a + x.played, 0) : null,
      };
    };
    const ca = avgOf(cur), na = avgOf(nxt);
    if(ca.xg == null) continue;
    for(const id of Object.keys(cur)){
      const c = cur[id], n = nxt[id];
      if(!n || c.xg == null) continue;
      rows.push({
        league: lg.name, season: SEASONS[i], name: c.name,
        // 전부 "그 시즌 리그 평균 대비 배수"로 정규화해야 시즌·리그를 섞을 수 있다
        curGoals: (c.gf / c.played) / ca.goals,
        curXg:    (c.xg / c.played) / ca.xg,
        nextGoals:(n.gf / n.played) / na.goals,
        curGa:    (c.ga / c.played) / ca.ga,
        curXgc:   (c.xgc / c.played) / ca.xgc,
        nextGa:   (n.ga / n.played) / na.ga,
      });
    }
  }
}

console.log(`표본: ${rows.length}팀-시즌 (${LEAGUES.map(l => l.name).join(', ')} / ${SEASONS[0]}~${SEASONS[SEASONS.length - 1]})\n`);

function rmseFor(w, key){
  // key: 'attack' | 'defence'
  let se = 0;
  for(const r of rows){
    const pred = key === 'attack' ? w * r.curXg + (1 - w) * r.curGoals
                                  : w * r.curXgc + (1 - w) * r.curGa;
    const act = key === 'attack' ? r.nextGoals : r.nextGa;
    se += (pred - act) ** 2;
  }
  return Math.sqrt(se / rows.length);
}
function corr(a, b){
  const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for(let i = 0; i < n; i++){ num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return num / Math.sqrt(da * db);
}

for(const key of ['attack', 'defence']){
  const label = key === 'attack' ? '공격(다음 시즌 득점 예측)' : '수비(다음 시즌 실점 예측)';
  const curX = rows.map(r => key === 'attack' ? r.curXg : r.curXgc);
  const curG = rows.map(r => key === 'attack' ? r.curGoals : r.curGa);
  const nxt  = rows.map(r => key === 'attack' ? r.nextGoals : r.nextGa);
  console.log(`■ ${label}`);
  console.log(`   이번 시즌 xG 와의 상관계수   ${corr(curX, nxt).toFixed(3)}`);
  console.log(`   이번 시즌 득점 와의 상관계수 ${corr(curG, nxt).toFixed(3)}`);
  let best = null;
  for(let w = 0; w <= 1.0001; w += 0.05){
    const e = rmseFor(w, key);
    if(!best || e < best.e) best = {w, e};
  }
  const ws = [0, 0.25, 0.5, 0.6, 0.75, 1];
  console.log('   섞는 비중별 오차(RMSE): ' + ws.map(w => `w=${w} ${rmseFor(w, key).toFixed(4)}`).join('  '));
  console.log(`   → 최적 xG 비중 ${best.w.toFixed(2)} (RMSE ${best.e.toFixed(4)})\n`);
}
