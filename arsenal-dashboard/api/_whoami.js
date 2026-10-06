// api/_whoami.js — "Who Am I?"(커리어 경로 퀴즈) 문제 은행 만들기
//
// `_` 접두어라 Vercel 함수로 배포되지 않고 import 전용이다. 운영(크론)과 로컬 스크립트
// (scripts/build_whoami.mjs)가 같은 코드로 문제 은행을 만들게 하려고 분리했다.
//
// 흐름:
//  1) 위키백과 "List of Arsenal F.C. players" 3개 문서(100경기+ / 25–99 / 1–24)의 표에서
//     역대 1군 선수 목록(이름·아스날 기간·출전 수)을 뽑는다.
//  2) 이름으로 Fotmob 검색 → 후보의 선수 상세(playerData)에 아스날(9825) 경력이 있는지로
//     본인 확인 → 성인 커리어(careerHistory.careerItems.senior)를 정리한다.
//  3) 문제로 쓸 수 없는 선수(클럽 1개뿐, 날짜 빠짐 등)는 이유와 함께 걸러낸다.
// 한국어 이름은 영문 위키백과 문서의 한국어판 링크(langlinks)에서 가져오고, 없으면 영문 그대로.
//
// 네트워크 함수는 전부 fetchJSON(url, opts)을 인자로 받는다 — 운영은 타임아웃 붙은 fetch,
// 로컬 스크립트는 파일 캐시 붙은 fetch를 넘긴다.

export const ARSENAL_ID = 9825;
export const WIKI_PAGES = [
  'List_of_Arsenal_F.C._players',
  'List_of_Arsenal_F.C._players_(25–99_appearances)',
  'List_of_Arsenal_F.C._players_(1–24_appearances)',
];
// 위키미디어는 연락 가능한 User-Agent를 요구한다(없으면 429/403).
export const WIKI_UA = 'ArsenalDashboardBot/1.0 (https://github.com/caross8888/arsenal)';
// 이 해 이후까지 아스날에서 뛴 선수만 — 그 전 선수는 Fotmob 커리어가 비어 있는 경우가 많고,
// 엠블럼 퀴즈로 알아볼 사람도 드물다.
export const MIN_END_YEAR = 1995;

export const crestUrl = id => `https://images.fotmob.com/image_resources/logo/teamlogo/${id}.png`;

// ── 1) 위키백과 표 파싱 ─────────────────────────────────────────────────
// 행 모양: !scope=row|{{sortname|Bukayo|Saka}} / |align="left"|{{fba|England}} /
//          |FW||2018–||272||47||319||84   (리그 출전·기타 출전·합계 출전·합계 득점)
export function parseWikiList(wikitext){
  const rows = [];
  for(const blk of wikitext.split('\n|-')){
    const m = /\{\{sortname\|([^|}]*)\|([^|}]*)((?:\|[^}]*)?)\}\}/.exec(blk);
    if(!m) continue;
    const first = m[1].trim(), last = m[2].trim();
    // 세 번째 위치 인자가 있으면 그게 문서 제목이다(동명이인 구분용 "(footballer)" 등).
    const extra = (m[3] || '').split('|').map(s => s.trim()).filter(Boolean);
    const linkArg = extra.find(s => !s.includes('='));
    const nolink = extra.some(s => /^nolink\s*=/.test(s));
    const nat = /\{\{fba\|([^}|]*)/.exec(blk);
    const line = blk.split('\n').find(l => l.includes('||'));
    if(!line) continue;
    const cells = line.replace(/^\|/, '').split('||').map(c => c.trim());
    const years = cells[1] ? cells[1].replace(/<[^>]*>|\{\{[^}]*\}\}/g, '') : '';
    const ys = (years.match(/\d{4}/g) || []).map(Number);
    const ongoing = /[–-]\s*$/.test(years);
    const nums = cells.slice(2).map(c => Number(c.replace(/[^0-9]/g, '')) || 0);
    rows.push({
      name: `${first} ${last}`.trim(),
      article: nolink ? null : (linkArg || `${first} ${last}`.trim()),
      nationality: nat ? nat[1].trim() : '',
      pos: cells[0] || '',
      arsenalYears: years,
      start: ys[0] || null,
      end: ongoing ? null : (ys[ys.length - 1] || null),
      apps: nums[2] || 0,
    });
  }
  return rows;
}

export async function fetchWikiPlayers(fetchJSON){
  const all = [];
  for(const page of WIKI_PAGES){
    const url = 'https://en.wikipedia.org/w/api.php?action=parse&prop=wikitext&format=json&redirects=1&page='
      + encodeURIComponent(page);
    const j = await fetchJSON(url, {wiki: true});
    const text = (((j || {}).parse || {}).wikitext || {})['*'] || '';
    all.push(...parseWikiList(text));
  }
  // 같은 선수가 두 문서에 걸쳐 있을 일은 없지만, 혹시 몰라 이름 기준으로 하나만 남긴다.
  const seen = new Set();
  return all.filter(r => !seen.has(r.name) && seen.add(r.name));
}

export const isModern = r => r.end === null || r.end >= MIN_END_YEAR;

// 영문 문서 제목 → 한국어 문서 제목(50개씩 묶어서 조회).
export async function fetchKoNames(fetchJSON, articles){
  const out = {};
  const list = [...new Set(articles.filter(Boolean))];
  for(let i = 0; i < list.length; i += 50){
    const chunk = list.slice(i, i + 50);
    const url = 'https://en.wikipedia.org/w/api.php?action=query&prop=langlinks&lllang=ko&lllimit=500'
      + '&redirects=1&format=json&formatversion=2&titles=' + encodeURIComponent(chunk.join('|'));
    const j = await fetchJSON(url, {wiki: true});
    const q = (j || {}).query || {};
    // 리다이렉트·정규화로 제목이 바뀐 경우 원래 제목으로 되돌려 붙인다.
    const back = {};
    for(const r of [...(q.normalized || []), ...(q.redirects || [])]) back[r.to] = back[r.from] || r.from;
    for(const p of (q.pages || [])){
      const ko = ((p.langlinks || [])[0] || {}).title;
      if(!ko) continue;
      const orig = back[p.title] || p.title;
      // 문서 제목의 괄호 설명("(축구 선수)")은 뗀다.
      out[orig] = ko.replace(/\s*\([^)]*\)\s*$/, '');
    }
  }
  return out;
}

// ── 2) Fotmob 본인 확인 + 커리어 정리 ────────────────────────────────────
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

// 감독이 된 선수(앙리·파브레가스·아담스)는 검색에서 isCoach:true로 오지만 선수 커리어도
// 그대로 있어서 거르지 않는다. 풀네임으로 안 나오면(실측: Paul Merson은 0건) 성만으로 다시 찾는다.
export async function resolveFotmob(fetchJSON, row){
  const last = fold(row.name).split(' ').slice(-1)[0];
  const tried = new Set();
  for(const term of [row.name, fold(row.name), last]){
    if(!term || tried.has(term)) continue;
    tried.add(term);
    const sug = await fetchJSON(`https://www.fotmob.com/api/data/search/suggest?term=${encodeURIComponent(term)}`);
    const cands = [];
    for(const g of (sug || [])) for(const s of (g.suggestions || [])){
      if(s.type === 'player' && !cands.some(c => c.id === s.id)) cands.push(s);
    }
    // 성이 같은 후보를 앞으로 — 검색은 비슷한 이름(Rico Henry ↔ Thierry Henry)도 섞어 준다.
    const hit = c => fold(c.name).split(' ').includes(last) ? 1 : 0;
    cands.sort((a, b) => hit(b) - hit(a));
    for(const c of cands.filter(hit).slice(0, 4)){
      const pd = await fetchJSON(`https://www.fotmob.com/api/data/playerData?id=${c.id}`);
      if(careerEntries(pd).some(e => Number(e.teamId) === ARSENAL_ID)) return {id: String(c.id), pd};
    }
  }
  return null;
}

function careerEntries(pd){
  const ci = (((pd || {}).careerHistory || {}).careerItems || {}).senior || {};
  return Array.isArray(ci.teamEntries) ? ci.teamEntries : [];
}

const yearOf = d => (d ? Number(String(d).slice(0, 4)) : null);
// 2군·유스·올스타 팀은 경로에서 뺀다 — 1군 경로를 흐리기만 한다(Hamburger SV II, St. Johnstone B,
// MLS All-Stars). 아스날 자신은 이름이 "Arsenal"이라 걸리지 않는다.
const SIDE_TEAM_RE = /(\s(II|III|B|C)|\sU-?\d{2}|\sReserves?|\sYouth|\sAcademy)$|All[- ]?Stars?/i;

// 화면에 그대로 쓸 경로: 오래된 것부터, 같은 팀이 연달아 나오면 한 칸으로 합친다.
export function normalizeCareer(pd){
  const raw = careerEntries(pd)
    .filter(e => e.teamId && e.startDate && (e.teamGender || 'male') === 'male' && !SIDE_TEAM_RE.test(e.team || ''))
    .map(e => ({
      teamId: Number(e.teamId),
      team: e.team || '',
      from: yearOf(e.startDate),
      to: e.active ? null : yearOf(e.endDate),
      loan: /loan/i.test(((e.transferType || {}).localizationKey) || '')
        && !/back_from_loan/i.test(((e.transferType || {}).localizationKey) || ''),
      active: !!e.active,
      start: e.startDate,
    }))
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const out = [];
  for(const e of raw){
    const prev = out[out.length - 1];
    if(prev && prev.teamId === e.teamId && prev.loan === e.loan){
      prev.to = e.to; prev.active = e.active;
      continue;
    }
    out.push({teamId: e.teamId, team: e.team, from: e.from, to: e.to, loan: e.loan, active: e.active});
  }
  return out;
}

// ── 3) 검사 ─────────────────────────────────────────────────────────────
// 문제로 못 쓰는 이유를 돌려준다(쓸 수 있으면 null).
export function rejectReason(career){
  if(!career.length) return 'Fotmob 커리어 없음';
  if(!career.some(e => e.teamId === ARSENAL_ID)) return '커리어에 아스날 없음';
  const clubs = new Set(career.map(e => e.teamId));
  if(clubs.size < 2) return '클럽이 1곳뿐';
  if(career.some(e => !e.from)) return '연도 빠짐';
  if(career.length > 20) return '경로가 너무 김';
  return null;
}

// 선수 한 명 → 문제 한 개.
export function toQuestion(row, fm, koName){
  const career = normalizeCareer(fm.pd);
  const reason = rejectReason(career);
  const pd = fm.pd || {};
  const retired = !career.some(e => e.active);
  return {
    reason,
    q: reason ? null : {
      id: fm.id,
      name: pd.name || row.name,
      ko: koName || null,
      nationality: row.nationality,
      pos: row.pos,
      arsenal: row.arsenalYears,
      apps: row.apps,
      retired,
      career: career.map(e => ({t: e.teamId, n: e.team, f: e.from, u: e.to, l: e.loan ? 1 : 0})),
    },
  };
}
