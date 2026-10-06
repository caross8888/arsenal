// api/_whoami.js — "Who Am I?"(커리어 경로 퀴즈) 문제 은행 만들기
//
// `_` 접두어라 Vercel 함수로 배포되지 않고 import 전용이다. 운영 중에는 쓰지 않고, 로컬 스크립트
// (scripts/build_whoami.mjs --module)가 고정 문제 은행(_whoami_bank.js)을 만들 때만 쓴다.
//
// 흐름:
//  1) 위키백과 "List of Arsenal F.C. players" 3개 문서(100경기+ / 25–99 / 1–24)의 표에서
//     역대 1군 선수 목록(이름·아스날 기간·출전 수)을 뽑는다.
//  2) 이름으로 Fotmob 검색 → 후보의 선수 상세(playerData)에 아스날(9825) 경력이 있는지로
//     본인 확인 → 성인 커리어(careerHistory.careerItems.senior)를 정리한다.
//  3) 문제로 쓸 수 없는 선수(클럽 1개뿐, 날짜 빠짐 등)는 이유와 함께 걸러낸다.
// 한국어 이름은 영문 위키백과 문서의 한국어판 링크(langlinks)에서 가져오고, 없으면 영문 그대로.
//
// 네트워크 함수는 전부 fetchJSON(url, opts)을 인자로 받는다(스크립트가 파일 캐시 붙은 fetch를 넘긴다).

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
    // 세 번째 위치 인자가 있으면 그게 문서 제목이다(동명이인 구분용 "(footballer)" 등). 네 번째는
    // 정렬 키라 문서 제목으로 쓰면 안 된다({{sortname|Mesut|Özil||Ozil, Mesut}} — 세 번째가 비어 있다).
    const extra = (m[3] || '').split('|').slice(1).map(s => s.trim());
    const linkArg = extra[0] && !extra[0].includes('=') ? extra[0] : null;
    const nolink = extra.some(s => /^nolink\s*=/.test(s));
    const nat = /\{\{fba\|([^}|]*)/.exec(blk);
    // sortname 줄 자체에도 '||'가 있을 수 있다({{sortname|Cesc|Fàbregas||Fabregas, Cesc}} — 빈 인자).
    const line = blk.split('\n').find(l => l.includes('||') && !l.includes('sortname'));
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
  const last = fold(row.article ? row.article.replace(/\s*\([^)]*\)\s*$/, '') : row.name).split(' ').slice(-1)[0];
  const tried = new Set();
  // 위키백과 표 이름이 한 단어인 선수(Gabriel = 가브리엘 파울리스타)는 문서 제목으로도 찾는다.
  const article = row.article ? row.article.replace(/\s*\([^)]*\)\s*$/, '') : null;
  // 마지막으로 이름 첫 단어 — Fotmob엔 "Gabriel" 한 단어로만 있어 풀네임·성으로는 안 나온다.
  const firstWord = fold(row.name).split(' ')[0];
  for(const term of [row.name, article, fold(row.name), last, firstWord]){
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
    // 아스날 경력이 있고, 그 시작 연도가 위키백과와 맞는 후보만 본인으로 본다 — 성만으로 찾으면
    // 같은 성의 다른 아스날 선수가 먼저 걸린다(실측: Lee Dixon → Jaden Dixon, Gabriel(파울리스타)
    // → 가브리엘 마갈량이스, Alan Smith → Emile Smith Rowe).
    // 성이 안 맞는 후보도 본다 — Fotmob엔 한 단어 이름으로만 있는 선수가 있다(가브리엘 마갈량이스 =
    // "Gabriel"). 엉뚱한 사람은 아래 아스날 기간 대조가 걸러낸다.
    for(const c of cands.slice(0, 6)){
      const pd = await fetchJSON(`https://www.fotmob.com/api/data/playerData?id=${c.id}`);
      if(!careerEntries(pd).some(e => Number(e.teamId) === ARSENAL_ID)) continue;
      // 위키백과 표에 연도가 비어 있으면 대조할 근거가 없으니 이름이 똑같을 때만 인정한다
      // (실측: 연도 없는 "David Howat" 행이 성 검색으로 David Raya에 붙었다).
      if(!row.start && fold(c.name) !== fold(row.name)) continue;
      if(arsenalStartMatches(normalizeCareer(pd), row)) return {id: String(c.id), pd};
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
// 이름에 B·II가 안 붙는 2군도 있다(Barça Atlètic, Real Madrid Castilla, Jong Ajax, Juventus Next Gen).
const SIDE_TEAM_RE = /(\s(II|III|B|C)|\sU-?\d{2}|\sReserves?|\sYouth|\sAcademy|\sPrimavera|\sNext Gen)$|All[- ]?Stars?|Atl[eè]tic$|Castilla$|^Jong\s|Sub-?\d{2}/i;

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
    .sort((a, b) => String(a.start).localeCompare(String(b.start)))
    // 아직 시작 안 한 계약(임대 복귀 예정 등)은 뺀다(실측: 맷 터너 "→ Lyon 2027–").
    .filter(e => e.start <= new Date().toISOString());
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
function arsenalStartMatches(career, row){
  if(!row || !row.start) return true;
  const ars = career.filter(e => e.teamId === ARSENAL_ID && !e.loan);
  return !ars.length || ars.some(e => Math.abs(e.from - row.start) <= 3);
}

// row(위키백과의 아스날 기간)와 대조해 엉뚱한 사람이 걸렸거나 데이터가 깨진 경우를 거른다
// (실측: Steve Bould의 Fotmob 커리어가 "Arsenal 1341–1561 → Lommel 1688–1736"으로 깨져 있다).
export function rejectReason(career, row){
  if(!career.length) return 'Fotmob 커리어 없음';
  if(!career.some(e => e.teamId === ARSENAL_ID)) return '커리어에 아스날 없음';
  const now = new Date().getUTCFullYear();
  if(career.some(e => e.from < 1950 || e.from > now + 1 || (e.to != null && (e.to < e.from || e.to > now + 1)))){
    return '연도가 비정상';
  }
  if(!arsenalStartMatches(career, row)) return '위키백과 아스날 기간과 불일치';
  // 아스날 한 곳뿐인 원클럽맨(사카 등)도 문제로 쓴다 — 사용자 지정. 연도가 단서가 된다.
  if(career.some(e => !e.from)) return '연도 빠짐';
  if(career.length > 20) return '경로가 너무 김';
  return null;
}

// 현역/은퇴 판정. Fotmob의 status 필드만으로는 못 믿는다 — 은퇴한 시먼·월콧도 "active"로 오고,
// 감독이 된 선수(앙리·비에라)도 "active"다(감독으로서). 그래서 커리어로 판단한다:
//  - 지금 뛰는 클럽(active 항목)이 있으면 현역
//  - Fotmob이 retired/dead로 주거나, 감독이 됐거나, 마지막 클럽을 떠난 지 2년이 넘었으면 은퇴
//  - 그 밖(최근 1~2년 안에 클럽을 떠남)은 은퇴인지 무적 신분인지 알 수 없어 "소속팀 없음"
//    (실측 22명: 카솔라·파비안스키처럼 은퇴한 선수와 스털링·진첸코처럼 무적인 선수가 섞여 있다)
export function playerStatus(career, pd){
  if(career.some(e => e.active)) return 'active';
  const st = String((pd || {}).status || '');
  if(st === 'retired' || st === 'dead' || (pd || {}).isCoach) return 'retired';
  const lastEnd = Math.max(0, ...career.map(e => e.to || e.from || 0));
  return lastEnd <= new Date().getUTCFullYear() - 2 ? 'retired' : 'free';
}

// 한국어 위키백과 문서가 없는 선수의 한국어 표기(사용자 요청 — 영어 이름이 섞여 나왔다).
// 뉴스 번역 사전(_glossary.js)에 이미 있는 선수는 그 표기와 맞췄다(은와네리·다우먼·새먼·셋퍼드).
// 겹성은 사이트 표기(루이스-스켈리)처럼 하이픈으로 잇는다.
export const KO_NAME_OVERRIDES = {
  'Jérémie Aliadière': '제레미 알리아디에르', 'Ethan Nwaneri': '에단 은와네리', 'Luís Boa Morte': '루이스 보아 모르트',
  'Stuart Taylor': '스튜어트 테일러', 'Quincy Owusu-Abeyie': '퀸시 오우수-아베이에', 'Kaba Diawara': '카바 디아와라',
  'Max Dowman': '맥스 다우먼', 'Mark Randall': '마크 랜들', 'Henri Lansbury': '헨리 랜즈버리', 'Graham Stack': '그레이엄 스택',
  'Jay Emmanuel-Thomas': '제이 이매뉴얼-토머스', 'Marli Salmon': '말리 새먼', 'Sebastian Svärd': '세바스티안 스베르드',
  'Gavin Hoyte': '개빈 호이트', 'Gedion Zelalem': '게디온 젤라렘', 'Jerome Thomas': '제롬 토머스', 'Nacer Barazite': '나세르 바라지테',
  'Jay Simpson': '제이 심프슨', 'Josh Dasilva': '조시 다실바', 'Zech Medley': '제크 메들리', 'Martin Angha': '마르틴 앙하',
  'Thomas Eisfeld': '토마스 아이스펠트', 'Jernade Meade': '저네이드 미드', 'Chris Willock': '크리스 윌록',
  'Marcus McGuane': '마커스 맥과이언', 'Ben Sheaf': '벤 시프', 'Charlie Gilmour': '찰리 길모어', 'Tommy Setford': '토미 셋퍼드',
  'Nathan Butler-Oyedeji': '네이선 버틀러-오예데지', 'Andre Harriman-Annous': '안드레 해리먼-애너스', 'Ife Ibrahim': '이페 이브라힘',
  'Michal Papadopulos': '미할 파파도풀로스', 'Anthony Stokes': '앤서니 스톡스', 'Rui Fonte': '후이 폰트', 'Paul Rodgers': '폴 로저스',
  'Conor Henderson': '코너 헨더슨', 'Chuks Aneke': '척스 아네케', "Stefan O'Connor": '스테판 오코너',
  'Julio Pleguezuelo': '훌리오 플레게수엘로', 'Ben Cottrell': '벤 코트럴', 'Miguel Azeez': '미겔 아지즈', 'Jack Porter': '잭 포터',
  'Josh Nichols': '조시 니컬스', 'Maldini Kacurri': '말디니 카추리', 'Ismeal Kabia': '이스메일 카비아',
  'Brando Bailey-Joseph': '브랜도 베일리-조지프', 'Jaden Dixon': '제이든 딕슨', 'Theo Julienne': '테오 줄리앤',
};

// 한국어 위키백과 표기가 국내에서 흔히 쓰는 표기와 다른 선수 — 사용자가 고른 표기로 바꾼다.
// 퀴즈 보기 이름에만 쓴다(뉴스 번역 사전 _glossary.js는 나무위키 기준이라 따로 대조 후에 넣을 것).
export const KO_NAME_FIXES = {
  'Theo Walcott': '시오 월콧', 'Aaron Ramsey': '애런 램지', 'Aaron Ramsdale': '애런 램스데일',
  'Alexander Hleb': '알렉산드르 흘렙', 'Gilberto Silva': '질베르투 실바', 'Thomas Partey': '토마스 파티',
  'Pierre-Emerick Aubameyang': '피에르에메릭 오바메양', 'Alex Oxlade-Chamberlain': '알렉스 옥슬레이드체임벌린',
  'Alex Iwobi': '알렉스 이워비', 'Emile Smith Rowe': '에밀 스미스 로우', 'Mohamed Elneny': '모하메드 엘네니',
  'Johan Djourou': '요한 주루', 'Takehiro Tomiyasu': '토미야스 타케히로', 'Mathew Ryan': '매튜 라이언',
  'Matthew Connolly': '매튜 코널리', 'Willian': '윌리안', 'Neto': '네투',
};

// 선수 한 명 → 문제 한 개.
export function toQuestion(row, fm, koName){
  const career = normalizeCareer(fm.pd);
  const reason = rejectReason(career, row);
  const pd = fm.pd || {};
  const status = playerStatus(career, pd);
  return {
    reason,
    q: reason ? null : {
      id: fm.id,
      // 위키백과 표기를 우선한다 — Fotmob엔 "Gabriel"처럼 한 단어로만 있는 선수가 있다.
      name: row.name || pd.name,
      ko: KO_NAME_FIXES[row.name] || koName || KO_NAME_OVERRIDES[row.name] || null,
      nationality: row.nationality,
      pos: row.pos,
      arsenal: row.arsenalYears,
      since: row.start,   // 아스날 입단 연도 — 오답 보기를 비슷한 시대 선수로 뽑는 데 쓴다
      apps: row.apps,
      status,   // 'active' 현역 · 'retired' 은퇴 · 'free' 소속팀 없음(은퇴 여부 불확실)
      career: career.map(e => ({t: e.teamId, n: e.team, f: e.from, u: e.to, l: e.loan ? 1 : 0})),
    },
  };
}
