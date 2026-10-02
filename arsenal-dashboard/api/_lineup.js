// api/_lineup.js — 예상 선발 XI의 순수 계산부
//
// `_` 접두어라 Vercel 함수로 배포되지 않고 import 전용이다. football.js(운영)와
// scripts/backtest_xi.mjs(검증)가 같은 코드를 쓰게 하려고 분리했다 — _predict.js와 같은 이유.
//
// 예전 방식("최근 3경기 중 최빈 포메이션의 마지막 경기 XI를 복사하고 결장자 자리만 같은
// 포지션 최다 선발로 갈아끼움")의 구멍 셋을 메우려고 다시 짰다(사용자 지적):
//  1) 주전 판단 — 3경기 내내 부상이던 주전은 기록에 없어서 복귀해도 못 돌아왔고, 결장자가
//     아닌 자리는 손을 안 대서 주전 대신 뛰던 백업이 그대로 남았다.
//     → 이번 시즌 "선발률 = 선발 / 명단(선발+벤치)에 든 경기"로 본다. 부상으로 빠진 경기와
//       입단 전 경기는 분모에서 빠지므로, 복귀한 주전과 시즌 중 합류한 영입생 모두 제 몫을 받는다.
//  2) 겸업 포지션 — Fotmob usualPlayingPositionId는 GK/DF/MF/FW 네 갈래뿐이라
//     좌풀백 겸 미드필더(루이스-스켈리)나 윙/스트라이커 구분이 안 됐다.
//     → 이번 시즌 실제로 선 좌표들 + Fotmob 선수 프로필의 포지션 목록(주/부)으로 자리
//       적합도를 따로 매기고, 11자리를 한 번에 최적 배정(헝가리안)한다.
//  3) 로테이션 경기 — 리그컵 2군 라인업이 틀이 되기도 했다.
//     → 컵대회 경기는 가중치를 낮추고, 포메이션·틀은 주력 대회 경기에서 고른다.
//     반대로 예측할 경기가 컵대회면 이번 시즌 컵 경기의 로테이션 성향을 따른다(cupRates).
//
// "주전인가"는 이번 시즌만 본다(지난 시즌을 섞으면 이번 여름 영입생이 불리해진다).
// 지난 시즌 기록은 "어디에 설 수 있나"(선수 프로필의 포지션 목록)로만 들어온다.

export const PARAMS = {
  halfLifeMatches: 6,   // 최근 경기 가중 반감기(경기 수) — 6경기 전 경기가 절반
  cupWeight: 0.4,       // 국내 컵대회(로테이션이 잦다)의 가중치. 리그·유럽대항전은 1
  priorRate: 0.3,       // 선발률 사전값 — 표본이 적은 선수를 이 값 쪽으로 당긴다
  priorN: 1,            // 사전값의 무게(경기 수 환산)
  sigma: 0.09,          // 좌표 적합도 커널 폭(horizontalLayout 0~1 단위)
  roleWeight: 0.8,      // 프로필 포지션 적합도의 상한(실제로 선 좌표보다는 약한 근거)
  secondaryWeight: 0.8, // 프로필의 부 포지션은 주 포지션 대비 이 비율
  usualWeight: 0.35,    // 좌표도 프로필도 없을 때 usual(4갈래)만으로 주는 적합도
  // 예측할 경기가 컵대회일 때: 컵 경기 선발률을 리그 선발률 쪽으로 당기는 무게(경기 수 환산).
  // 1이면 이번 시즌 컵 경기 한 번만 있어도 그 경기의 로테이션이 리그 기록과 반반으로 섞인다.
  cupPriorN: 1,
};

// Fotmob 리그 id — 국내 컵대회(로테이션 경기). 다른 나라 컵은 이름으로도 잡는다.
const CUP_LEAGUE_IDS = new Set([132, 133, 247]);   // FA컵, EFL컵, 커뮤니티 실드
const CUP_NAME_RE = /\b(cup|pokal|copa|coupe|coppa|shield|supercup|super cup|trophy)\b/i;
const EURO_NAME_RE = /champions league|europa|conference/i;

export function isCupMatch(rec){
  if(CUP_LEAGUE_IDS.has(Number(rec.leagueId))) return true;
  const n = rec.tournament || '';
  return CUP_NAME_RE.test(n) && !EURO_NAME_RE.test(n);
}

// history는 오래된 것부터. 최근일수록, 주력 대회일수록 무겁다.
export function matchWeights(history, P = PARAMS){
  const last = history.length - 1;
  return history.map((h, i) =>
    (isCupMatch(h) ? P.cupWeight : 1) * Math.pow(0.5, (last - i) / P.halfLifeMatches));
}

// ── 역할(자리 종류) ─────────────────────────────────────────────────────
// 좌우는 구분하지 않는다 — 좌우는 실제로 선 좌표(spotFit)가 가려준다. 여기는
// "그 종류의 자리를 볼 수 있나"만 본다.
const ROLE_COMPAT = {
  'GK|GK': 1,
  'CB|CB': 1, 'FB|FB': 1, 'DM|DM': 1, 'CM|CM': 1, 'AM|AM': 1, 'W|W': 1, 'ST|ST': 1,
  'CB|FB': 0.5, 'CB|DM': 0.4,
  'FB|W': 0.35, 'FB|CM': 0.25, 'FB|DM': 0.25,
  'DM|CM': 0.8, 'CM|AM': 0.7, 'DM|AM': 0.4, 'CM|W': 0.3,
  'AM|W': 0.55, 'AM|ST': 0.5, 'W|ST': 0.5,
};
export function roleCompat(a, b){
  if(!a || !b) return 0;
  return ROLE_COMPAT[a + '|' + b] ?? ROLE_COMPAT[b + '|' + a] ?? 0;
}

// Fotmob 선수 프로필(positionDescription.positions[].strPos)의 key/label → 역할.
// 키 철자가 몇 가지로 오므로(centreback/centerback, 약어 라벨 등) 정규식으로 넓게 잡는다.
// 순서가 중요하다 — 'defensivemidfielder'가 'midfield'보다, 'wingback'이 'back'보다 먼저.
export function roleOfFotmobPos(key, label){
  const k = String(key || '').toLowerCase().replace(/[^a-z]/g, '');
  const l = String(label || '').toUpperCase().trim();
  if(/keeper/.test(k) || l === 'GK') return 'GK';
  if(/wingback|leftback|rightback|fullback/.test(k) || /^(LB|RB|LWB|RWB)$/.test(l)) return 'FB';
  if(/centreback|centerback|centraldefender/.test(k) || l === 'CB') return 'CB';
  if(/defensivemid/.test(k) || /^(DM|CDM)$/.test(l)) return 'DM';
  if(/attackingmid/.test(k) || /^(AM|CAM)$/.test(l)) return 'AM';
  if(/winger|leftmid|rightmid|wide/.test(k) || /^(LW|RW|LM|RM)$/.test(l)) return 'W';
  if(/striker|forward/.test(k) || /^(ST|CF)$/.test(l)) return 'ST';
  if(/midfield/.test(k) || l === 'CM') return 'CM';
  if(/defender|back/.test(k)) return 'CB';
  return null;
}

// 틀 경기의 선발 11명(좌표)에 자리 종류를 붙인다. 포메이션 문자열("4-2-3-1")의 줄 수대로
// 앞뒤(x) 순서로 끊어 줄을 나누고, 줄 안에서는 측면(|y-0.5|가 큰 쪽)이면 FB/W로 본다.
const WIDE = 0.25;
export function slotRoles(starters, formation){
  const roles = new Array(starters.length).fill(null);
  let gk = starters.findIndex(p => p.usual === 0);
  if(gk < 0) gk = starters.reduce((b, p, i) => (b < 0 || p.layout.x < starters[b].layout.x ? i : b), -1);
  if(gk >= 0) roles[gk] = 'GK';
  const field = starters.map((p, i) => i).filter(i => i !== gk)
    .sort((a, b) => starters[a].layout.x - starters[b].layout.x);
  let rows = String(formation || '').split('-').map(Number).filter(n => n > 0);
  if(rows.reduce((s, n) => s + n, 0) !== field.length) rows = guessRows(field.map(i => starters[i].layout.x));
  const back3 = rows[0] === 3;
  let at = 0;
  rows.forEach((n, r) => {
    const idx = field.slice(at, at + n); at += n;
    const first = r === 0, last = r === rows.length - 1;
    const mids = rows.length - 2;               // 수비·최전방 사이 줄 수
    idx.forEach(i => {
      const wide = Math.abs(starters[i].layout.y - 0.5) > WIDE;
      let role;
      if(first) role = wide ? 'FB' : 'CB';
      else if(last) role = wide ? 'W' : 'ST';
      else if(mids === 1) role = wide ? (back3 ? 'FB' : 'W') : 'CM';
      else if(r === 1) role = wide ? (back3 ? 'FB' : 'W') : 'DM';
      else if(r === rows.length - 2) role = wide ? 'W' : 'AM';
      else role = wide ? 'W' : 'CM';
      roles[i] = role;
    });
  });
  return roles;
}
// 포메이션 문자열이 없거나 인원과 안 맞으면 x 간격이 크게 벌어지는 곳에서 줄을 끊는다.
function guessRows(xs){
  if(!xs.length) return [];
  const rows = [1];
  for(let i = 1; i < xs.length; i++){
    if(xs[i] - xs[i - 1] > 0.06) rows.push(1); else rows[rows.length - 1]++;
  }
  return rows;
}

// ── 헝가리안(최소 비용 배정) ────────────────────────────────────────────
// cost[r][c] (행 ≤ 열). 각 행에 서로 다른 열 하나씩, 비용 합 최소. 반환: 행별 열 번호.
export function hungarian(cost){
  const n = cost.length, m = cost[0] ? cost[0].length : 0;
  if(!n || !m) return [];
  const INF = 1e18;
  const u = new Array(n + 1).fill(0), v = new Array(m + 1).fill(0);
  const p = new Array(m + 1).fill(0), way = new Array(m + 1).fill(0);
  for(let i = 1; i <= n; i++){
    p[0] = i;
    let j0 = 0;
    const minv = new Array(m + 1).fill(INF), used = new Array(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF, j1 = 0;
      for(let j = 1; j <= m; j++){
        if(used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if(cur < minv[j]){ minv[j] = cur; way[j] = j0; }
        if(minv[j] < delta){ delta = minv[j]; j1 = j; }
      }
      for(let j = 0; j <= m; j++){
        if(used[j]){ u[p[j]] += delta; v[j] -= delta; }
        else minv[j] -= delta;
      }
      j0 = j1;
    } while(p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while(j0);
  }
  const ans = new Array(n).fill(-1);
  for(let j = 1; j <= m; j++) if(p[j]) ans[p[j] - 1] = j - 1;
  return ans;
}

// ── 본체 ──────────────────────────────────────────────────────────────
// history: 이번 시즌 경기 기록(오래된 것부터). 각 항목:
//   {leagueId, tournament, formation, starters:[{id,name,num,usual,layout:{x,y}}],
//    bench:[{id,name,num,usual}]}
// outIds: 이번 경기 결장자 id 목록
// posInfo: {선수id: [{role, main, share}]} — 선수 프로필 포지션(없어도 된다)
// opts.cup: 예측할 경기가 국내 컵대회인가 — 그러면 로테이션을 반영한다(아래 "컵대회 모드").
export function predictXI(history, outIds, posInfo = {}, opts = {}, P = PARAMS){
  if(!history || !history.length) return null;
  const w = matchWeights(history, P);
  const banned = new Set((outIds || []).map(String));
  const cupMode = !!opts.cup;
  // 대회 구분 없이 최근성만 반영한 가중치 — 컵대회 모드에서 컵 경기끼리 비교할 때 쓴다.
  const last = history.length - 1;
  const wd = history.map((h, i) => Math.pow(0.5, (last - i) / P.halfLifeMatches));

  // 포메이션: 주력 대회 경기만으로 가중 최빈값(컵만 있으면 전부). 컵대회 모드면 이번
  // 시즌 컵 경기에서 고른다 — 로테이션 경기엔 포메이션도 바꾸는 팀이 있다. 컵 경기가
  // 아직 없으면 평소대로.
  const withF = history.map((h, i) => i).filter(i => history[i].formation);
  const core = withF.filter(i => !isCupMatch(history[i]));
  const cups = withF.filter(i => isCupMatch(history[i]));
  const pool = (cupMode && cups.length) ? cups : (core.length ? core : withF);
  const pw = (cupMode && cups.length) ? wd : w;
  const fc = {};
  pool.forEach(i => { fc[history[i].formation] = (fc[history[i].formation] || 0) + pw[i]; });
  const formation = Object.entries(fc).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  // 틀: 그 포메이션을 쓴 가장 최근 경기(위에서 고른 대회 묶음 안에서)의 자리 배치.
  const baseIdx = [...pool].reverse().find(i => history[i].formation === formation)
    ?? history.length - 1;
  const base = history[baseIdx];
  if(!base || base.starters.length < 10) return null;
  const roles = slotRoles(base.starters, base.formation);

  // 선수별 집계 — 선발률, 실제로 선 좌표들.
  const stat = {};
  const touch = p => (stat[p.id] = stat[p.id] || {p, S: 0, N: 0, spots: [], lastSeen: -1});
  history.forEach((h, i) => {
    h.starters.forEach(p => {
      const s = touch(p); s.S += w[i]; s.N += w[i]; s.p = {...s.p, ...p}; s.lastSeen = i;
      if(p.layout) s.spots.push({x: p.layout.x, y: p.layout.y, w: w[i]});
    });
    (h.bench || []).forEach(p => {
      const s = touch(p); s.N += w[i];
      if(i >= s.lastSeen){ s.p = {...p, layout: s.p.layout}; s.lastSeen = i; }
    });
  });
  const cands = Object.values(stat).filter(s => !banned.has(String(s.p.id)));
  if(cands.length < 11) return null;
  if(!cupMode){
    cands.forEach(s => { s.rate = (s.S + P.priorRate * P.priorN) / (s.N + P.priorN); });
  } else {
    cupRates(history, stat, wd, P);
    cands.forEach(s => { s.rate = s.cupRate; });
  }

  const fitOf = (s, slot, role) => {
    const isGK = s.p.usual === 0;
    if((role === 'GK') !== isGK) return 0;      // 골키퍼 자리는 골키퍼만, 필드는 필드만
    if(role === 'GK') return 1;
    let spot = 0;
    if(s.spots.length){
      const tw = s.spots.reduce((a, t) => a + t.w, 0);
      spot = s.spots.reduce((a, t) =>
        a + t.w * Math.exp(-((t.x - slot.x) ** 2 + (t.y - slot.y) ** 2) / (2 * P.sigma ** 2)), 0) / tw;
    }
    let prof = 0;
    for(const q of (posInfo[s.p.id] || [])){
      const k = q.main ? 1 : P.secondaryWeight * Math.min(1, 0.4 + (q.share || 0));
      prof = Math.max(prof, roleCompat(q.role, role) * k);
    }
    let usual = 0;
    if(!s.spots.length && !prof){
      const grp = {1: ['CB', 'FB'], 2: ['DM', 'CM', 'AM'], 3: ['W', 'ST', 'AM']}[s.p.usual] || [];
      usual = grp.includes(role) ? P.usualWeight : 0;
    }
    return Math.max(spot, P.roleWeight * prof, usual);
  };

  // 비용 = -(선발률 × 적합도). 행=자리 11개, 열=후보 전원.
  const slots = base.starters.map(p => p.layout);
  const score = slots.map((slot, r) => cands.map(s => s.rate * fitOf(s, slot, roles[r])));
  const pick = hungarian(score.map(row => row.map(v => -v)));

  const xi = base.starters.map((owner, r) => {
    const s = cands[pick[r]];
    if(!s) return {...owner, replaced: false, rate: 0};
    const same = String(s.p.id) === String(owner.id);
    return {
      id: String(s.p.id), name: s.p.name, num: s.p.num ?? null, usual: s.p.usual,
      layout: owner.layout, role: roles[r],
      rate: Math.round(s.rate * 100) / 100,
      fit: Math.round(fitOf(s, owner.layout, roles[r]) * 100) / 100,
      replaced: !same, replacedFor: same ? null : owner.name,
    };
  });
  return {formation, xi, baseIndex: baseIdx};
}

// ── 컵대회 모드 ─────────────────────────────────────────────────────────
// 컵 경기 선발률을 리그 선발률 쪽으로 당겨 섞는다: (컵 선발 + k×리그 선발률) / (컵 분모 + k).
// 리그 선발률은 리그·유럽대항전 경기만으로 따로 낸다(평소 선발률엔 컵 경기가 약하게 섞여 있다).
//
// 컵 분모는 평소와 다르다 — "그 경기 명단에 들었나"가 아니라 "그 경기에 뛸 수 있었나"로 센다.
// 로테이션의 가장 강한 신호는 주전이 아예 명단에서 빠지는 것인데, 명단 기준으로 세면 그 경기가
// 분모에서 통째로 사라져 신호가 안 남는다. 그래서 그 경기 전에 한 번이라도 명단에 들었고
// 그 경기 결장자 명단에 없는 선수는 전부 분모에 넣는다 — 쉬느라 빠진 주전은 0/1이 된다.
// 이번 시즌 컵 경기가 아직 없으면 리그 선발률 그대로라 평소 예측과 같다(팀 성향을 알 근거가 없다).
// 컵 경기의 최근성은 컵 경기끼리만 센다 — 컵 경기는 몇 주에 한 번이라, 사이에 낀 리그
// 경기 수로 깎으면 직전 컵 경기의 로테이션조차 리그 기록에 밀린다(실측: 컵 1경기 뒤 리그
// 3경기를 치르자 0.52 대 0.50으로 주전이 이겼다).
function cupRates(history, stat, wd, P){
  const cupIdx = history.map((h, i) => i).filter(i => isCupMatch(history[i]));
  const wc = {};
  cupIdx.forEach((i, k) => { wc[i] = Math.pow(0.5, (cupIdx.length - 1 - k) / P.halfLifeMatches); });
  const first = {};
  history.forEach((h, i) => [...h.starters, ...(h.bench || [])].forEach(p => {
    if(first[p.id] === undefined) first[p.id] = i;
  }));
  const acc = {};
  for(const id of Object.keys(stat)) acc[id] = {SL: 0, NL: 0, SC: 0, NC: 0};
  history.forEach((h, i) => {
    const started = new Set(h.starters.map(p => String(p.id)));
    if(!isCupMatch(h)){
      const inSquad = new Set([...h.starters, ...(h.bench || [])].map(p => String(p.id)));
      for(const id of inSquad){ if(!acc[id]) continue; acc[id].NL += wd[i]; if(started.has(id)) acc[id].SL += wd[i]; }
      return;
    }
    const out = new Set((h.out || []).map(String));
    for(const id of Object.keys(acc)){
      if(first[id] > i || out.has(id)) continue;
      acc[id].NC += wc[i];
      if(started.has(id)) acc[id].SC += wc[i];
    }
  });
  for(const [id, s] of Object.entries(stat)){
    const a = acc[id];
    const league = (a.SL + P.priorRate * P.priorN) / (a.NL + P.priorN);
    s.cupRate = (a.SC + P.cupPriorN * league) / (a.NC + P.cupPriorN);
  }
}

// 선수 프로필(playerData) → posInfo 한 명분. 응답 구조가 바뀌어도 죽지 않게 방어적으로 읽는다.
export function posInfoFromPlayerData(pd){
  const desc = (pd && pd.positionDescription) || {};
  const list = Array.isArray(desc.positions) ? desc.positions : [];
  const maxOcc = Math.max(1, ...list.map(q => Number(q.occurences ?? q.occurrences) || 0));
  const out = [];
  for(const q of list){
    const sp = q.strPos || {};
    const role = roleOfFotmobPos(sp.key || q.key, sp.label || q.label);
    if(!role) continue;
    const occ = Number(q.occurences ?? q.occurrences) || 0;
    out.push({role, main: !!q.isMainPosition, share: occ / maxOcc});
  }
  const prim = desc.primaryPosition || {};
  const pr = roleOfFotmobPos(prim.key, prim.label);
  if(pr && !out.some(q => q.main && q.role === pr)) out.push({role: pr, main: true, share: 1});
  return out;
}
