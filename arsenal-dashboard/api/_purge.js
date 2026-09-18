// api/_purge.js — 이적한 선수의 playerSeason 캐시 정리 (엔드포인트 아님)
//
// `_` 접두사라 Vercel이 함수로 배포하지 않는다. api/maintenance.js(연 1회 크론)와
// scripts/kv_purge_players.mjs(로컬 드라이런)가 이 모듈 하나를 같이 쓴다 — 안전장치가
// 두 벌로 갈라져 한쪽만 고쳐지는 걸 막으려는 것.
//
// 왜 지우나
//   playerSeason:{선수id}:{시즌}은 "직전 시즌(끝나서 다시 안 바뀌는)" 스탯이라 아스날 선수는
//   TTL 없이 영구 저장한다 — 한 번 긁어오면 Fotmob을 다시 안 부른다. 남아 있는 선수는 시즌마다
//   키가 하나씩 붙는 게 의도지만, 이적해서 나간 선수의 키는 아무도 다시 안 읽는다
//   (이 데이터는 선수 상세모달의 "직전 시즌" 조회에서만 쓰이고, 그 모달은 스쿼드에서 연다).
//   키 하나가 최대 170KB대라 match: 캐시보다 빨리 커진다.
//
// 건드리지 않는 것
//   타팀 선수 키는 football.js가 5년 TTL로 저장한다(리더보드 선수 순위에서 열어본 선수도
//   최근 5년 기록은 보이게 하려는 것). 그 키까지 지우면 매년 5월에 그 방침이 무너지므로,
//   여기서는 만료가 없는 키(=아스날 선수로 저장된 것)만 대상으로 삼는다.

const ARSENAL_TEAM_ID = 9825; // Fotmob 팀 ID (football.js와 같은 값)
const MIN_SQUAD = 20;         // 이보다 적게 내려오면 명단을 못 믿는다
const CLUB_BATCH = 8;         // 소속 확인 동시 요청 수 (크론 실행시간 상한 대비)
const FOTMOB_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
};

// 아스날 1군/U21/U18만 "우리 소속". 팀명이 Arsenal로 시작한다고 다 우리가 아니다 —
// Arsenal de Sarandí(아르헨티나), Arsenal Tula(러시아) 같은 동명 클럽이 있어서
// football.js의 isArsenalTeam도 같은 이유로 이름을 정규화해 비교한다.
const isOurClub = name => /^arsenal(\s+u\d+)?$/i.test(String(name || '').trim());

async function fotmobJson(url) {
  const r = await fetch(url, { headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`Fotmob ${r.status}`);
  return r.json();
}

/**
 * @param {(...args:any[])=>Promise<any>} kv  Upstash REST 커맨드 실행기(["SCAN",...] 형태)
 * @param {{apply?:boolean, withSizes?:boolean}} opts
 * @returns {Promise<{ok:boolean, reason?:string, squad:number, scanned:number, kept:number,
 *                     stale:Array<{key:string,id:string,season:string,name?:string,club?:string,bytes?:number}>,
 *                     deleted:number, bytes:number}>}
 */
export async function purgePlayerSeasons(kv, opts = {}) {
  const apply = !!opts.apply;
  const report = { ok: false, squad: 0, scanned: 0, kept: 0, stale: [], deleted: 0, bytes: 0, warnings: [] };

  // ── 1. 현재 1군 스쿼드 ──
  // KV의 firstTeamRoster는 TTL이 있어 비어 있을 수 있으니 Fotmob에서 직접 받는다.
  const tj = await fotmobJson(`https://www.fotmob.com/api/data/teams?id=${ARSENAL_TEAM_ID}`);
  const squad = ((tj.squad && tj.squad.squad) || [])
    .filter(g => !/coach/i.test(g.title || ''))
    .flatMap(g => g.members || []);
  const squadIds = new Set(squad.map(p => String(p.id)));
  report.squad = squadIds.size;

  // Fotmob이 일시적으로 빈/불완전한 명단을 주면 전원이 "이적"으로 보여 통째로 날아간다.
  if (squadIds.size < MIN_SQUAD) {
    report.reason = `스쿼드가 ${squadIds.size}명(최소 ${MIN_SQUAD})이라 중단 — 응답이 불완전할 때 전부 지우는 사고 방지`;
    return report;
  }

  // ── 2. playerSeason 키 스캔 ──
  let cursor = '0';
  const keys = [];
  do {
    const [next, batch] = await kv('SCAN', cursor, 'MATCH', 'playerSeason:*', 'COUNT', '500');
    cursor = next;
    keys.push(...batch);
  } while (cursor !== '0');
  report.scanned = keys.length;

  const candidates = [];
  for (const key of keys) {
    // playerSeason:{id}:{시즌} — 시즌명("2025/2026")에 '/'가 들어있어 뒤에서 자르지 않는다.
    const m = key.match(/^playerSeason:(\d+):(.+)$/);
    if (!m) { report.warnings.push(`형식이 다른 키 건너뜀: ${key}`); continue; }
    if (squadIds.has(m[1])) { report.kept++; continue; }
    // 만료가 걸린 키는 타팀 선수다(football.js가 5년 TTL로 저장). 이 정리 작업이 건드리면
    // "타팀도 최근 5년 기록은 본다"는 방침이 매년 5월에 무너지므로, 영구 저장된 키만 본다.
    // TTL: -1이면 만료 없음(=아스날 선수로 저장), -2면 키 없음, 그 외는 남은 초.
    let ttl = -1;
    try { ttl = await kv('TTL', key); } catch (_) {}
    if (typeof ttl === 'number' && ttl >= 0) { report.kept++; continue; }
    candidates.push({ key, id: m[1], season: m[2] });
  }

  // ── 3. 1군에 없는 선수만 현 소속팀 확인 ──
  // "1군 명단에 없음 = 이적"으로 보면 안 된다(실측: 첫 드라이런에서 아스날 U21/U18 선수
  // 3명이 삭제 대상으로 잡혔다 — Fotmob 1군 스쿼드엔 유스가 없다).
  for (let i = 0; i < candidates.length; i += CLUB_BATCH) {
    await Promise.all(candidates.slice(i, i + CLUB_BATCH).map(async c => {
      try {
        const pd = await fotmobJson(`https://www.fotmob.com/api/data/playerData?id=${c.id}`);
        c.name = pd.name || '';
        c.club = (pd.primaryTeam && pd.primaryTeam.teamName) || null;
      } catch (_) { c.club = null; }
    }));
  }
  for (const c of candidates) {
    if (c.club == null) {
      // 조회 실패를 "이적"으로 단정하지 않는다 — 삭제는 되돌릴 수 없으므로 남긴다.
      report.warnings.push(`소속 확인 실패, 유지: ${c.key}`);
      report.kept++;
      continue;
    }
    if (isOurClub(c.club)) { report.kept++; continue; }
    report.stale.push(c);
  }

  // ── 4. 크기(선택) — 로컬 드라이런에서 얼마나 회수되는지 보여주기 위한 것 ──
  if (opts.withSizes) {
    for (const s of report.stale) {
      try { const n = await kv('STRLEN', s.key); if (typeof n === 'number') { s.bytes = n; report.bytes += n; } } catch (_) {}
    }
    report.stale.sort((a, b) => (b.bytes || 0) - (a.bytes || 0));
  }

  // ── 5. 삭제 ──
  if (apply) {
    for (const s of report.stale) { await kv('DEL', s.key); report.deleted++; }
  }
  report.ok = true;
  return report;
}

/**
 * 타팀 경기 상세(match:)에 1년 만료를 걸어준다.
 *
 * 아스날 경기는 "최근 결과"에서 과거 시즌까지 다시 열 수 있어 영구 보관하지만, 타팀 경기는
 * 리더보드 라운드 패널에서만 닿고 그 패널이 이번 시즌만 보여줘서 다음 시즌이면 진입점이
 * 없어진다. match.js가 이제 저장 시점에 1년 TTL을 걸지만, 그 이전에 영구로 저장된 키가
 * 남아 있어서(라운드 패널을 붙인 뒤 쌓인 것들) 여기서 한 번 정리한다.
 *
 * 지우지 않고 만료만 거는 이유: 되돌릴 수 없는 삭제보다 안전하고, 1년 안에 다시 열면
 * 그대로 캐시로 쓰인다. 만료가 이미 걸린 키는 건너뛰므로 여러 번 돌려도 안전하다.
 *
 * @param {(...args:any[])=>Promise<any>} kv
 * @param {{apply?:boolean}} opts
 */
export async function expireOtherTeamMatches(kv, opts = {}) {
  const apply = !!opts.apply;
  const TTL = 365 * 24 * 60 * 60;
  const report = { scanned: 0, permanent: 0, ours: 0, targets: [], expired: 0, bytes: 0, warnings: [] };

  let cursor = '0';
  const keys = [];
  do {
    const [next, batch] = await kv('SCAN', cursor, 'MATCH', 'match:*', 'COUNT', '500');
    cursor = next;
    keys.push(...batch);
  } while (cursor !== '0');
  report.scanned = keys.length;

  for (const key of keys) {
    let ttl = -1;
    try { ttl = await kv('TTL', key); } catch (_) { continue; }
    if (typeof ttl === 'number' && ttl >= 0) continue;   // 이미 만료가 걸린 키
    report.permanent++;

    let data = null;
    try { const raw = await kv('GET', key); data = raw ? JSON.parse(raw) : null; } catch (_) {}
    if (!data) { report.warnings.push(`읽기 실패, 건너뜀: ${key}`); continue; }
    if (isArsenalMatch(data)) { report.ours++; continue; }

    const t = { key, home: data.homeTeam?.name || '', away: data.awayTeam?.name || '', date: (data.utcDate || '').slice(0, 10) };
    try { const n = await kv('STRLEN', key); if (typeof n === 'number') { t.bytes = n; report.bytes += n; } } catch (_) {}
    report.targets.push(t);
  }

  if (apply) {
    for (const t of report.targets) { await kv('EXPIRE', t.key, String(TTL)); report.expired++; }
  }
  return report;
}

// 아스날 경기 판정 — match.js의 같은 이름 함수와 같은 규칙(동명 클럽 제외).
function isArsenalMatch(data) {
  const ours = n => /^arsenal(\s+u\d+)?$/i.test(String(n || '').trim());
  return ours(data?.homeTeam?.name) || ours(data?.awayTeam?.name);
}

export { MIN_SQUAD, isOurClub };
