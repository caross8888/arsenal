// api/football.js — Vercel Serverless Function
import { applyGlossary } from './_glossary.js';
import { PARAMS, POS_LABEL, scoreProbs, blendRatio, decayedForm,
         homeEdgeFrom, restFactor, injuryFactors, lambdasFrom, predictAiKey } from './_predict.js';
const FPL_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';
const ARSENAL_FPL_ID = 1;
const ARSENAL_TEAM_ID = 9825; // Fotmob 팀 ID
const FPL_POS = {1:'GK',2:'DF',3:'MF',4:'FW'};
const LOAN_KEYWORDS = /loan|loaned|joined|transferred|released|left the club/i;

const cache = {};
const TTL = 60 * 60 * 1000;
// 리더보드는 경기 끝나고 스탯 반영을 더 빨리 보여주기 위해 캐시를 짧게 둔다.
// 순위표도 경기 종료 후 순위 반영이 늦지 않게 5분(사용자 지정 — 원래 1시간이라 최대 1시간 늦었다).
const TTL_OVERRIDES = { leaders: 10 * 60 * 1000, standings: 5 * 60 * 1000 };
// CDN 보관 시간(초) 예외 — 기본은 min(서버 TTL, 5분). 순위표는 1분(사용자 지정). CDN이 앞에서
// 막아주므로 방문자가 몰려도 함수 실행은 1분에 한 번 수준이다.
const CDN_SEC_OVERRIDES = { standings: 60 };
function getTTL(k){ return TTL_OVERRIDES[k] || TTL; }
function getCache(k){const c=cache[k];return(c&&Date.now()-c.ts<getTTL(k))?c.data:null;}
function getStale(k){const c=cache[k];return c?c.data:null;}
function setCache(k,d){cache[k]={data:d,ts:Date.now()};}

const FPL_HEADERS = {
  'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
  'Accept':'application/json',
  'Referer':'https://fantasy.premierleague.com/',
};

const FOTMOB_HEADERS = {
  'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
};

// ── 선수 상세(라이브 fetch 결과) 영구 캐시 — Upstash Redis REST API ──
// players.json(스크래퍼 스냅샷)은 안 건드리고, 선수를 열어볼 때마다 받아온
// 라이브 데이터를 여기 같이 저장해둔다 — 다음에 누가 스쿼드탭을 열면(아래
// squad 분기) 이 캐시에 있는 값으로 정적 스냅샷을 덮어써서 "처음 뜨는
// 화면"도 점점 최신에 가까워진다. 환경변수가 없으면(로컬에서 KV 연결 전
// 등) 전부 조용히 건너뛰어 기존 동작 그대로 유지한다.
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
// 선수 상세 저장 형식 버전(player:* / playerSeason:*) — 올리면 저장된 값을 무시하고
// 다시 받아 같은 키에 덮어쓴다. playerSeason은 영구 저장이라 잘못 들어간 값이
// 스스로는 안 고쳐지고, player:*(7일 TTL)도 응답에 필드가 추가되면(예: seasons)
// 옛 스냅샷을 그대로 내보내는 동안 프론트가 그 필드 없이 그려야 해서 같이 건다.
const PLAYER_SEASON_SCHEMA = 5;
const KV_TTL_SEC = 7 * 24 * 60 * 60; // 일주일 지나면 자동 만료 — 안 쓰는 선수 데이터가 무한정 안 쌓이게

async function kvSetPlayer(id, data){
  if(!KV_URL || !KV_TOKEN) return;
  try {
    // 경로에 key/value/옵션을 다 늘어놓는 방식은 EX 같은 옵션과 궁합이
    // 안 좋아서(실측으로 확인), 커맨드 전체를 JSON 배열로 보내는 표준
    // 파이프라인 방식을 쓴다: ["SET", key, value, "EX", seconds]
    await fetch(KV_URL, {
      method: 'POST',
      headers: {Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json'},
      // cachedAt — 이 스냅샷을 받아온 시각. 상세모달을 열 때 KV 값을 먼저
      // 즉시 내려주고(아래 playerDetail 분기), 프론트는 이 시각이 오래됐을
      // 때만 백그라운드로 최신값을 다시 요청한다.
      body: JSON.stringify(['SET', `player:${id}`, JSON.stringify(Object.assign({}, data, {cachedAt: Date.now(), schemaV: PLAYER_SEASON_SCHEMA})), 'EX', String(KV_TTL_SEC)]),
      signal: AbortSignal.timeout(5000),
    });
  } catch(e){ /* 캐시 저장 실패는 무시 — 응답 자체엔 영향 없어야 함 */ }
}

// squad 목록 전체(최대 수십 명)를 한 번에 조회 — 명령 수를 아끼려고 개별
// GET 대신 MGET 하나로 묶는다.
async function kvMGetPlayers(ids){
  if(!KV_URL || !KV_TOKEN || !ids.length) return {};
  try {
    const path = ids.map(id => `player:${id}`).join('/');
    const r = await fetch(`${KV_URL}/mget/${path}`, {
      headers: {Authorization: `Bearer ${KV_TOKEN}`},
      signal: AbortSignal.timeout(5000),
    });
    if(!r.ok) return {};
    const { result } = await r.json();
    const out = {};
    (result||[]).forEach((raw, i) => {
      if(!raw) return;
      try { out[ids[i]] = JSON.parse(raw); } catch(e){ /* 손상된 값은 무시 */ }
    });
    return out;
  } catch(e){ return {}; }
}

// 완료된 과거 시즌(예: 25-26) 스탯은 다시 안 바뀌는 고정값이라, player:{id}와
// 달리 TTL 없이 영구 저장한다 — 한 번 긁어오면 그 다음부턴 Fotmob을 다시
// 안 부르고 KV에서 그대로 돌려준다.
async function kvGetPlayerSeason(id, seasonName){
  if(!KV_URL || !KV_TOKEN) return null;
  try {
    // 시즌명("2025/2026")에 '/'가 들어있어서 REST 경로 방식(/get/{key})으로
    // 쓰면 그 슬래시가 경로 구분자로 잘못 해석돼 키를 못 찾는다(실측
    // 확인 — kvSetPlayerSeason처럼 파이프라인(POST + 커맨드 배열)으로
    // 보내야 키 안의 슬래시가 안전하게 처리된다.
    const r = await fetch(KV_URL, {
      method: 'POST',
      headers: {Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json'},
      body: JSON.stringify(['GET', `playerSeason:${id}:${seasonName}`]),
      signal: AbortSignal.timeout(5000),
    });
    if(!r.ok) return null;
    const { result } = await r.json();
    return result ? JSON.parse(result) : null;
  } catch(e){ return null; }
}
// ttlSec을 주면 그만큼 뒤 자동 만료, 안 주면 영구 저장.
// 아스날 선수는 영구(시즌마다 쌓여서 그 자체가 우리 앱의 기록이 된다), 타팀 선수는 5년 —
// 리더보드 선수 순위에서 열어본 타팀 선수도 "최근 5년에 뭘 했나"는 볼 수 있게 두되,
// 무한정 쌓이지는 않게 한다. 키 하나가 130~164KB라 5년 누적이 60MB대(한도 256MB)다.
async function kvSetPlayerSeason(id, seasonName, data, ttlSec){
  if(!KV_URL || !KV_TOKEN) return;
  try {
    const key = `playerSeason:${id}:${seasonName}`;
    const cmd = ttlSec
      ? ['SET', key, JSON.stringify(data), 'EX', String(ttlSec)]
      : ['SET', key, JSON.stringify(data)];
    await fetch(KV_URL, {
      method: 'POST',
      headers: {Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json'},
      body: JSON.stringify(cmd),
      signal: AbortSignal.timeout(5000),
    });
  } catch(e){ /* 캐시 저장 실패는 무시 */ }
}
const PLAYER_SEASON_TTL_OTHER = 5 * 365 * 24 * 60 * 60; // 타팀 선수 5년

// ── 1군 스쿼드 명단 — 스크래퍼(Playwright) 없이 Fotmob 팀 API로 실시간
// 조회. players.json처럼 사람이 로컬에서 스크립트를 돌려야 갱신되는
// 정적 스냅샷이 아니라, 매 요청마다(단 KV 캐시 유효 시간 내엔 캐시로)
// Fotmob이 그 시점에 들고 있는 실제 1군 명단을 그대로 반영한다 —
// 이적생이 Fotmob 팀 페이지에 올라오는 즉시 여기도 반영됨.
const KV_TTL_ROSTER_SEC = 6 * 60 * 60; // 6시간 — 매 요청마다 Fotmob을 때리지 않으면서도 꽤 최신을 유지
const FIRST_TEAM_ID = 9825;
const PL_LEAGUE_ID = 47; // Fotmob 프리미어리그 id — 팀 API의 table 배열에서 UCL과 구분용
const POS_GROUP_FROM_CODE = {
  GK: 'GK',
  CB: 'DF', RB: 'DF', LB: 'DF', RWB: 'DF', LWB: 'DF',
  CDM: 'MF', CM: 'MF', CAM: 'MF', RM: 'MF', LM: 'MF',
  RW: 'FW', LW: 'FW', ST: 'FW', CF: 'FW',
};

async function kvGetJSON(key){
  if(!KV_URL || !KV_TOKEN) return null;
  try {
    const r = await fetch(KV_URL, {
      method: 'POST',
      headers: {Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json'},
      body: JSON.stringify(['GET', key]),
      signal: AbortSignal.timeout(5000),
    });
    if(!r.ok) return null;
    const { result } = await r.json();
    return result ? JSON.parse(result) : null;
  } catch(e){ return null; }
}
// JSON이 아닌 값(예: AI 해설 문장)을 그대로 읽는다. kvGetJSON으로 읽으면 한글 문장을
// JSON.parse하다 실패하고, 그 실패를 조용히 null로 삼켜서 해설이 에러도 없이 사라졌다(실측).
async function kvGetRaw(key){
  if(!KV_URL || !KV_TOKEN) return null;
  try {
    const r = await fetch(KV_URL, {
      method: 'POST',
      headers: {Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json'},
      body: JSON.stringify(['GET', key]),
      signal: AbortSignal.timeout(5000),
    });
    if(!r.ok) return null;
    const { result } = await r.json();
    return typeof result === 'string' ? result : null;
  } catch(e){ return null; }
}
// ttlSec을 안 주면 만료 없이 영구 저장한다 — 끝난 시즌 결과처럼 두 번 다시
// 안 바뀌는 데이터용.
async function kvSetJSON(key, data, ttlSec){
  if(!KV_URL || !KV_TOKEN) return;
  try {
    const cmd = ttlSec
      ? ['SET', key, JSON.stringify(data), 'EX', String(ttlSec)]
      : ['SET', key, JSON.stringify(data)];
    await fetch(KV_URL, {
      method: 'POST',
      headers: {Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json'},
      body: JSON.stringify(cmd),
      signal: AbortSignal.timeout(5000),
    });
  } catch(e){ /* 캐시 저장 실패는 무시 */ }
}

// Fotmob 루머 데이터는 공개 API가 아니라 Next.js 내부 데이터 엔드포인트
// (/_next/data/{buildId}/...)로만 나온다 — buildId는 Fotmob이 새로 배포할
// 때마다 바뀌는 값이라 하드코딩할 수 없다. 팀 페이지 HTML 자체에 그 값이
// __NEXT_DATA__로 박혀있어서, 그걸 정규식으로 뽑아 KV에 몇 시간 캐싱해두고
// (배포 주기가 그렇게 잦지 않음) 매 요청마다 페이지를 새로 안 긁게 한다.
// 이 값이 만료돼서 실제 데이터 요청이 실패하면(배포로 buildId가 바뀐 경우)
// 호출부에서 캐시를 무시하고 한 번 더 새로 받아오게 되어 있다.
async function getFotmobBuildId(forceRefresh){
  if(!forceRefresh){
    const cached = await kvGetJSON('fotmobBuildId');
    if(cached) return cached;
  }
  const pageRes = await fetch('https://www.fotmob.com/teams/9825/transfers/arsenal', {headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(8000)});
  if(!pageRes.ok) throw new Error('Fotmob 페이지 로드 실패');
  const html = await pageRes.text();
  const m = html.match(/"buildId":"([^"]+)"/);
  if(!m) throw new Error('buildId를 찾을 수 없음');
  await kvSetJSON('fotmobBuildId', m[1], 12 * 60 * 60);
  return m[1];
}
async function fetchFotmobRumours(){
  const fetchWithBuildId = async buildId => {
    const url = `https://www.fotmob.com/_next/data/${buildId}/ko/teams/${FIRST_TEAM_ID}/transfers/arsenal.json?mode=rumour&lng=ko&id=${FIRST_TEAM_ID}&tab=transfers&slug=arsenal`;
    const r = await fetch(url, {headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(8000)});
    if(!r.ok) return null;
    const j = await r.json();
    const team = j.pageProps && j.pageProps.fallback && j.pageProps.fallback[`team-${FIRST_TEAM_ID}`];
    return (team && team.transfers && team.transfers.allRumours) || null;
  };
  try {
    const buildId = await getFotmobBuildId(false);
    let rumours = await fetchWithBuildId(buildId);
    if(!rumours){
      // 캐시된 buildId가 배포로 이미 바뀌었을 수 있음 — 한 번만 새로 받아서 재시도
      const freshBuildId = await getFotmobBuildId(true);
      rumours = await fetchWithBuildId(freshBuildId);
    }
    return rumours || [];
  } catch(e){ return []; }
}
// Fotmob 팀 API의 한 스쿼드 멤버 → 이 앱이 카드 목록에서 기대하는 모양으로
// 변환한다. 이 엔드포인트는 명단/등번호/포지션/나이/평점처럼 "목록 카드"에
// 필요한 값은 다 주지만, 계약만료/선호발/상세 대회별 기록/슛맵/히트맵/
// traits/커리어처럼 더 깊은 값은 없다 — 그런 값은 원래도 상세모달을 열 때
// type=playerDetail로 그때그때 라이브로 받아오던 것들이라(기존 동작),
// 목록 단계에선 빈 값으로 두고 상세모달 오픈 시 채워지는 흐름을 그대로 둔다.
function mapLiveSquadMember(m){
  const codes = (m.positionIdsDesc || '').split(',').map(s => s.trim()).filter(Boolean);
  const posShort = codes[0] || '';
  return {
    id: m.id,
    fotmobId: m.id,
    squadLevel: 'first',
    squadLevels: ['first'],
    name: m.name,
    fullName: m.name,
    nationality: m.cname || '',
    posGroup: POS_GROUP_FROM_CODE[posShort] || 'MF',
    position: posShort,
    positionLabel: posShort,
    jersey: m.shirtNumber ? String(m.shirtNumber) : '',
    age: m.age || null,
    height: m.height ? `${m.height} cm` : '',
    preferredFoot: '',
    contractEnd: null,
    marketValue: m.transferValue ? { value: m.transferValue, currency: 'EUR' } : null,
    goals: m.goals || 0,
    assists: m.assists || 0,
    appearances: 0,
    starts: 0,
    minutes: 0,
    yellowCards: m.ycards || 0,
    redCards: m.rcards || 0,
    rating: m.rating || null,
    photo: `https://images.fotmob.com/image_resources/playerimages/${m.id}.png`,
    stats: {},
    traits: null,
    shotmap: [],
    heatmap: [],
    competitions: {},
    career: [],
    season: '',
  };
}

// Fotmob 팀 API 응답 하나에 일정(fixtures)·순위표(table)·스쿼드(squad)·이적
// (transfers)·결장자(overview)가 전부 들어있다. 예전엔 용도별로 이 엔드포인트를
// 따로따로 때렸는데, 한 번 받아 KV에 넣고 나눠 쓰면 상류 호출이 그만큼 준다.
// 메모리 캐시가 아니라 KV를 쓰는 이유는 서버리스라 인스턴스마다 메모리가
// 따로 놀아서, 인스턴스가 여러 개 뜨면 캐시가 있으나 마나이기 때문이다.
// TTL이 짧은 건 라이브 경기 스코어가 이 응답에서 나오기 때문 — 로스터/이적은
// 이보다 훨씬 늦게 바뀌지만 같이 신선해지는 건 손해가 아니다.
// 이 응답은 600KB에 달해서 원본을 통째로 KV에 넣으면 안 된다 — 실측상 KV에서
// 되읽는 데만 2.6초가 걸려서(Fotmob 직접 호출 2.9초와 거의 차이 없음) 캐시 의미가
// 없고 Upstash 대역폭만 태운다. 그래서 원본은 인스턴스 메모리에만 잠깐 들고,
// KV에는 각 용도별로 가공된 작은 조각(fixtures 등)을 따로 저장한다.
// TTL은 라이브 경기 유무에 따라 다르게 준다 — 스코어가 실시간으로 바뀌는 건
// 경기 중뿐이고, 그 외 시간엔 30분을 써도 체감 차이가 없으면서 호출은 6배 준다.
const KV_TTL_SLICE_LIVE_SEC = 60;
const KV_TTL_SLICE_IDLE_SEC = 30 * 60;
const TEAM_PAYLOAD_MEM_TTL_MS = 60 * 1000;
const _teamPayloadMem = {};
async function fetchTeamPayload(teamId = FIRST_TEAM_ID){
  const hit = _teamPayloadMem[teamId];
  if(hit && Date.now() - hit.ts < TEAM_PAYLOAD_MEM_TTL_MS) return hit.data;
  const r = await fetch(`https://www.fotmob.com/api/data/teams?id=${teamId}`, {headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(8000)});
  if(!r.ok) throw new Error('Fotmob 팀 API 로드 실패');
  const data = await r.json();
  _teamPayloadMem[teamId] = {data, ts: Date.now()};
  return data;
}

// ESPN이 주던 note 문자열 대신 Fotmob legend의 순위 인덱스로 구간을 판정하되,
// 표시 색은 앱 팔레트로 통일한다(Fotmob 원색은 앱 전역 승리/패배색과 어긋난다).
function standingsZoneColor(title){
  if(!title) return null;
  if(/champions/i.test(title)) return '#22C55E';
  if(/europa/i.test(title)) return '#3B82F6';
  if(/conference/i.test(title)) return '#F59E0B';
  if(/relegation/i.test(title)) return '#EF4444';
  return null;
}
function mapFotmobStandings(teamPayload){
  const plTable = (teamPayload?.table || []).find(t => t?.data?.leagueId === PL_LEAGUE_ID);
  const rows = plTable?.data?.table?.all || [];
  if(!rows.length) return null;
  const legend = plTable?.data?.legend || [];
  const zoneOf = idx => legend.find(l => (l.indices || []).includes(idx)) || null;
  return rows.map((row, i) => {
    const [gf, ga] = String(row.scoresStr || '').split('-').map(n => parseInt(n, 10) || 0);
    const zone = zoneOf(i);
    return {
      position: row.idx,
      team: {
        id: String(row.id),
        name: row.name || '',
        shortName: row.shortName || row.name || '',
        crest: `https://images.fotmob.com/image_resources/logo/teamlogo/${row.id}.png`,
      },
      playedGames: row.played, won: row.wins, draw: row.draws, lost: row.losses,
      points: row.pts, goalsFor: gf, goalsAgainst: ga, goalDifference: row.goalConDiff,
      isArsenal: row.id === FIRST_TEAM_ID,
      zoneColor: standingsZoneColor(zone?.title) || zone?.color || null,
      zoneLabel: zone?.title || null,
    };
  }).sort((a,b) => a.position - b.position);
}

// 과거 시즌 일정 — 팀 API(teams?id=)는 현재 시즌만 주지만, 사이트가 "이전 경기"
// 버튼에 쓰는 pageableFixtures는 커서로 계속 거슬러 올라갈 수 있다. 커서는
// beforetimestamp를 직접 만들어 원하는 시점으로 바로 점프할 수 있어서, 시즌
// 끝(7/31)부터 시작해 시즌 시작(8/1) 이전이 나올 때까지 20건씩 모은다.
// 시즌당 3~4회 호출이지만 최초 1회뿐이고 이후엔 KV 영구 저장으로 끝난다.
async function fetchFotmobSeasonFixtures(seasonYear){
  const startMs = Date.UTC(seasonYear, 7, 1);
  const endMs   = Date.UTC(seasonYear + 1, 6, 31, 23, 59, 59);
  let url = `https://www.fotmob.com/api/data/pageableFixtures?teamId=${FIRST_TEAM_ID}`
    + `&cursor=${encodeURIComponent(`/prod/db/api/team/${FIRST_TEAM_ID}/fixture-by-date?beforetimestamp=${Math.floor(endMs/1000)}`)}`;
  const collected = [];
  for(let page = 0; page < 12; page++){   // 안전 상한 — 한 시즌은 보통 3~4페이지
    const r = await fetch(url, {headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(8000)});
    if(!r.ok) break;
    const j = await r.json();
    const batch = j.matches || [];
    if(!batch.length) break;
    collected.push(...batch);
    const oldest = batch.reduce((min, m) => {
      const t = new Date(m.status?.utcTime || 0).getTime();
      return (!min || t < min) ? t : min;
    }, 0);
    if(oldest && oldest < startMs) break;   // 시즌 시작 이전까지 닿았으면 끝
    if(!j.previous) break;
    url = `https://www.fotmob.com${j.previous}`;
  }
  const seen = new Set();
  return collected
    .map(mapFotmobFixture)
    .filter(m => {
      if(!m.utcDate || seen.has(m.id)) return false;
      const t = new Date(m.utcDate).getTime();
      if(t < startMs || t > endMs) return false;
      seen.add(m.id);
      return true;
    })
    .sort((a,b) => new Date(a.utcDate) - new Date(b.utcDate));
}

function sliceTtlFor(fixtures){
  const live = (fixtures || []).some(m => m.status === 'IN_PLAY');
  return live ? KV_TTL_SLICE_LIVE_SEC : KV_TTL_SLICE_IDLE_SEC;
}

// 팀 API 응답 하나에 일정·순위·스쿼드가 다 들어있으므로, 어느 탭이 먼저
// 불려서 이 응답을 받아오든 나머지 조각까지 한꺼번에 KV에 채워둔다. 그러면
// 일정 탭에서 스피너가 도는 그 순간 순위·선수단도 같이 준비돼서, 탭을
// 옮길 때 다시 로딩이 뜨지 않는다.
async function warmTeamSlices(teamPayload){
  try {
    const rawFixtures = teamPayload?.fixtures?.allFixtures?.fixtures || [];
    const fixtures = rawFixtures.map(mapFotmobFixture).filter(m => m.utcDate)
      .sort((a,b) => new Date(a.utcDate) - new Date(b.utcDate));
    const now = new Date();
    await attachCupRounds(fixtures, now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1);
    const ttl = sliceTtlFor(fixtures);
    const jobs = [];
    if(fixtures.length) jobs.push(kvSetJSON(`fixtures:v3:${FIRST_TEAM_ID}`, fixtures, ttl));

    const standings = mapFotmobStandings(teamPayload);
    if(standings && standings.length) jobs.push(kvSetJSON(`standings:${PL_LEAGUE_ID}`, standings, ttl));

    const groups = (teamPayload?.squad && teamPayload.squad.squad) || [];
    if(groups.length){
      const roster = groups.filter(g => g.title !== 'coach').flatMap(g => g.members).map(mapLiveSquadMember);
      if(roster.length) jobs.push(kvSetJSON('firstTeamRoster', roster, KV_TTL_ROSTER_SEC));
    }
    await Promise.all(jobs);
    return {fixtures, ttl};
  } catch(_){ return null; }
}

async function fetchFirstTeamRosterLive(){
  const cached = await kvGetJSON('firstTeamRoster');
  if(cached) return cached;
  const data = await fetchTeamPayload();
  const groups = (data.squad && data.squad.squad) || [];
  const roster = groups
    .filter(g => g.title !== 'coach')
    .flatMap(g => g.members)
    .map(mapLiveSquadMember);
  await kvSetJSON('firstTeamRoster', roster, KV_TTL_ROSTER_SEC);
  return roster;
}

// Fotmob 대회명 → 앱이 쓰는 (name, short) 쌍. 앱 전반이 short 코드로 대회를
// 구분하므로(대회 태그 색·선수 모달 탭 등) ESPN이 쓰던 코드를 그대로 유지한다.
// Fotmob 리그ID → 앱 대회코드. 이름보다 이걸 먼저 본다 — 같은 대회도 시기에 따라
// 이름이 바뀌어서(리그컵: 2015년까지 "League Cup", 이후 "EFL Cup") 이름으로만
// 매핑하면 옛 리그컵이 친선전(FR)으로 떨어졌다. 이름 부분일치로 때우면 반대로
// "Premier League Asia Trophy"(프리시즌)가 PL로, "Champions Cup"(ICC 프리시즌)이
// UCL로 잘못 잡힌다. 아래는 Fotmob에 아스날 경기가 있는 전 기간(2010-07~)을
// 훑어서 나온 공식 대회 ID 전부이고, 나머지(489 친선, 9408 ICC, 9543 아시아
// 트로피 등)는 전부 프리시즌이라 FR로 떨어지는 게 맞다.
const FOTMOB_COMP_BY_LEAGUE = {
  47:    {name:'Premier League',   short:'PL'},
  42:    {name:'Champions League', short:'UCL'},
  10611: {name:'Champions League', short:'UCL'},  // 예선·플레이오프 (2011~2014)
  73:    {name:'Europa League',    short:'EL'},
  133:   {name:'EFL Cup',          short:'EFL'},  // 2015년까지 이름이 "League Cup"
  132:   {name:'FA Cup',           short:'FAC'},
  247:   {name:'Community Shield', short:'CS'},
};
// leagueId가 없을 때를 위한 이름 폴백.
const FOTMOB_COMP_MAP = {
  'Premier League':   {name:'Premier League',   short:'PL'},
  'Champions League': {name:'Champions League', short:'UCL'},
  'Europa League':    {name:'Europa League',    short:'EL'},
  'EFL Cup':          {name:'EFL Cup',          short:'EFL'},
  'Carabao Cup':      {name:'EFL Cup',          short:'EFL'},
  'FA Cup':           {name:'FA Cup',           short:'FAC'},
  'Community Shield': {name:'Community Shield', short:'CS'},
  'Club Friendlies':  {name:'Friendly',         short:'FR'},
};

// ── 컵대회 라운드 ─────────────────────────────────────────────────────
// 팀 일정 API(teams?id=)의 tournament.stage는 모든 대회에서 빈 문자열이라
// 카드에 "리그페이즈/16강/3라운드"를 못 붙인다(ESPN 시절엔 ESPN이 줘서 됐는데
// Fotmob으로 옮기면서 빠졌다). 라운드는 리그 API(leagues?id=&season=)의
// fixtures.allMatches[].round에만 있어서, 일정에 등장하는 컵대회마다 한 번씩
// 불러 아스날 경기의 "경기ID → 라운드" 맵을 만든다. 리그 응답은 200~800KB라
// 통째로 두지 않고 이 맵(수백 바이트)만 KV에 둔다 — 끝난 시즌은 영구, 진행 중
// 시즌은 토너먼트 대진이 추가되므로 6시간.
// PL은 라운드를 프론트(assignPlRounds)가 날짜순으로 직접 매기고, 커뮤니티
// 실드는 단판이라 프론트가 대회코드만으로 "결승"을 붙이므로 대상에서 뺀다.
const ROUND_LEAGUES = new Set([42, 73, 133, 132]); // UCL, UEL, EFL컵, FA컵
const KV_TTL_ROUNDS_LIVE_SEC = 6 * 60 * 60;

function seasonStartYearOf(utcDate){
  const d = new Date(utcDate);
  return d.getUTCMonth() + 1 >= 8 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

async function fetchLeagueRounds(leagueId, seasonYear, isPast){
  const key = `rounds:${leagueId}:${seasonYear}`;
  const hit = await kvGetJSON(key);
  if(hit) return hit;
  try {
    const season = encodeURIComponent(`${seasonYear}/${seasonYear + 1}`);
    const r = await fetch(`https://www.fotmob.com/api/data/leagues?id=${leagueId}&season=${season}`,
      {headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(8000)});
    if(!r.ok) return {};
    const j = await r.json();
    const map = {};
    for(const m of (j.fixtures?.allMatches || [])){
      const ours = String(m.home?.id) === String(FIRST_TEAM_ID) || String(m.away?.id) === String(FIRST_TEAM_ID);
      if(ours && m.round != null) map[String(m.id)] = String(m.round);
    }
    if(Object.keys(map).length) await kvSetJSON(key, map, isPast ? undefined : KV_TTL_ROUNDS_LIVE_SEC);
    return map;
  } catch(_){ return {}; }
}

// Fotmob 라운드 표기 → 프론트 getRoundLabel이 읽는 토큰. 숫자 라운드는 대회에
// 따라 뜻이 다르다: 컵대회는 "N라운드", 챔스·유로파는 조별리그/리그페이즈의
// 경기 차수라 단계 이름으로 바꾼다(2024/25 개편부터 리그페이즈).
function normalizeCupRound(raw, leagueId, seasonYear){
  if(raw == null || raw === '') return null;
  const r = String(raw).toLowerCase();
  if(r === 'final') return 'final';
  if(r === '1/2') return 'semifinals';
  if(r === '1/4') return 'quarterfinals';
  if(r === '1/8') return 'roundof16';
  if(r === '1/16') return 'roundof32';
  if(r.startsWith('playoff')) return 'playoffround';
  if(/^\d+$/.test(r)){
    if(leagueId === 42 || leagueId === 73) return seasonYear >= 2024 ? 'leaguephase' : 'groupstage';
    return `round-${r}`;
  }
  return null;
}

// 일정 배열에 컵대회 라운드를 제자리에서 채운다. 실패하면 조용히 넘어간다 —
// 라운드는 부가 정보라 이것 때문에 일정 자체가 안 뜨면 안 된다.
async function attachCupRounds(fixtures, curSeasonYear){
  const groups = new Map();
  for(const m of fixtures || []){
    if(!ROUND_LEAGUES.has(m.leagueId) || !m.utcDate) continue;
    const sy = seasonStartYearOf(m.utcDate);
    const k = `${m.leagueId}:${sy}`;
    if(!groups.has(k)) groups.set(k, {leagueId: m.leagueId, seasonYear: sy, matches: []});
    groups.get(k).matches.push(m);
  }
  await Promise.all([...groups.values()].map(async g => {
    const map = await fetchLeagueRounds(g.leagueId, g.seasonYear, g.seasonYear < curSeasonYear);
    for(const m of g.matches){
      const round = normalizeCupRound(map[String(m.id)], g.leagueId, g.seasonYear);
      if(round) m.round = round;
    }
  }));
  return fixtures;
}

// Fotmob 팀 일정 1건 → ESPN parseEvent와 같은 모양으로. 프론트 계약(경기카드·
// 모달·라이브 폴링)이 전부 이 모양을 전제하므로 필드명을 그대로 맞춘다.
// ESPN에 있고 Fotmob 팀 일정엔 없는 값(venue, neutralSite)은 null로 두고,
// 경기 상세(matchDetails)에서 채운다.
// liveTime.short는 "37‎’‎"처럼 방향 제어문자(U+200E)가 섞여 온다 — 숫자만 뽑아
// 앱이 쓰던 "37'" 형태로 정규화한다. 팀 일정의 status와 경기 상세의
// header.status가 같은 모양이라 둘 다 이걸로 읽는다.
function liveClockOf(st){
  const lt = st?.liveTime || {};
  const mins = String(lt.short || '').match(/(\d+)/);
  const added = lt.addedTime ? `+${lt.addedTime}` : '';
  return {
    clock:  mins ? `${mins[1]}${added}'` : null,
    period: lt.basePeriod >= 90 ? 2 : 1,
    isHT:   /ht|half/i.test(String(lt.shortKey || lt.short || '')) || (!!st?.halfs?.firstHalfEnded && !st?.halfs?.secondHalfStarted),
  };
}

// 팀 일정 API의 라이브 시계는 거의 갱신되지 않는다 — 실측: 72분 진행 중인데
// 팀 일정은 liveTime "1'", 같은 시각 경기 상세(matchDetails)는 "72'". 그래서
// 라이브 경기만 경기 상세의 header.status로 시계·하프타임·스코어를 덮어쓴다.
// 목록 폴링(30초, 사용자마다)이 매번 상세를 부르지 않게 경기별로 20초 메모리 캐시.
const _liveHeaderCache = {};
async function refreshLiveFromDetails(matches){
  const live = (matches || []).filter(m => m.status === 'IN_PLAY');
  await Promise.all(live.map(async m => {
    try {
      let hdr = _liveHeaderCache[m.id];
      if(!hdr || Date.now() - hdr.ts > 20 * 1000){
        const r = await fetch(`https://www.fotmob.com/api/data/matchDetails?matchId=${m.id}`,
          {headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(5000)});
        if(!r.ok) return;
        const j = await r.json();
        if(!j?.header?.status) return;
        hdr = {status: j.header.status, teams: j.header.teams || [], ts: Date.now()};
        _liveHeaderCache[m.id] = hdr;
      }
      Object.assign(m, liveClockOf(hdr.status));
      const [h, a] = hdr.teams;
      if(typeof h?.score === 'number' && typeof a?.score === 'number'){
        m.score = {...(m.score || {}), fullTime: {home: h.score, away: a.score}};
      }
    } catch(_){ /* 실패하면 팀 일정 값 그대로 */ }
  }));
  return matches;
}

function mapFotmobFixture(m){
  const st = m.status || {};
  const finished = !!st.finished;
  const live = !!st.ongoing || (!!st.started && !finished);
  const tourObj = m.tournament || {};
  const tour = tourObj.name || '';
  const comp = FOTMOB_COMP_BY_LEAGUE[tourObj.leagueId] || FOTMOB_COMP_MAP[tour] || {name: tour || 'Friendly', short: 'FR'};
  const crest = id => id ? `https://images.fotmob.com/image_resources/logo/teamlogo/${id}.png` : null;
  const scoreOf = side => (finished || live) ? (typeof side?.score === 'number' ? side.score : null) : null;

  // 승부차기까지 간 경기는 home.score/away.score가 "정규(+연장) 골 + 승부차기 골"
  // 합산값으로 온다 — 실측: 코모전 정규 1-1·승부차기 4-3 → 5-4, 도르트문트전
  // 정규 2-3·승부차기 5-4 → 7-7. 정규 스코어는 status.scoreStr("1 - 1")에만 있어서
  // 거기서 뽑고, 승부차기 스코어는 합산값에서 빼서 따로 싣는다. 친선전은 결과와
  // 무관하게 승부차기를 하는 경우가 많아(2-3 패배 후 승부차기) 무승부 여부로
  // 판단하면 안 되고 reason으로만 판단한다. 경기 상세(matchDetails)의
  // header.teams[].score는 원래 정규 스코어라 이 문제는 팀 일정 API에만 있다.
  let fullTime = {home: scoreOf(m.home), away: scoreOf(m.away)};
  let penalties = null;
  const isPens = finished && (st.reason?.shortKey === 'penalties_short' || st.reason?.short === 'Pen');
  if(isPens && fullTime.home != null && fullTime.away != null){
    const reg = String(st.scoreStr || '').match(/(\d+)\s*-\s*(\d+)/);
    if(reg){
      const rh = +reg[1], ra = +reg[2];
      const ph = fullTime.home - rh, pa = fullTime.away - ra;
      fullTime = {home: rh, away: ra};
      if(ph >= 0 && pa >= 0) penalties = {home: ph, away: pa};
    }
  }

  let clock = null, period = null, isHT = false;
  if(live) ({clock, period, isHT} = liveClockOf(st));

  return {
    id:          String(m.id),
    fotmobId:    m.id,
    utcDate:     st.utcTime,
    competition: comp,
    // 팀 일정 API의 stage는 모든 대회에서 빈 문자열이라 여기선 라운드를 알 수
    // 없다 — 컵대회 라운드는 attachCupRounds가 리그 API에서 따로 채운다. 챔스
    // 예선(10611, 2011~2014)은 아스날이 치른 게 전부 플레이오프 라운드였다.
    round:       tourObj.leagueId === 10611 ? 'playoffround' : (tourObj.stage || null),
    leagueId:    tourObj.leagueId ?? null,
    neutralSite: false,
    venue:       null,
    status:      finished ? 'FINISHED' : live ? 'IN_PLAY' : 'SCHEDULED',
    clock,
    period,
    isHT,
    tbd:         st.cancelled ? 'canceled' : null,
    homeTeam: {id: m.home?.id != null ? String(m.home.id) : null, name: m.home?.name, crest: crest(m.home?.id)},
    awayTeam: {id: m.away?.id != null ? String(m.away.id) : null, name: m.away?.name, crest: crest(m.away?.id)},
    score: {fullTime, penalties},
  };
}

// 프리미어리그 밖 상대(챔피언스리그 등)는 FPL에 아예 없어서 부상 정보를 못 준다.
// Fotmob 팀 API의 overview.lastLineupStats.unavailable이 리그를 안 가리고 결장자를
// 주므로 그걸 폴백으로 쓴다 — 이적/로스터 조회에 이미 쓰는 엔드포인트라 새로 붙는
// 의존성은 없다. 실패하면 null을 돌려서 호출부가 기존 "정보 없음" 처리를 하게 둔다.
async function fetchFotmobTeamInjuries(teamName){
  try {
    const sr = await fetch(`https://apigw.fotmob.com/searchapi/suggest?term=${encodeURIComponent(teamName)}&lang=en`,
      {headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(8000)});
    if(!sr.ok) return null;
    const sd = await sr.json();
    let teamId = null;
    for(const block of (sd.teamSuggest || [])){
      for(const opt of (block.options || [])){
        if(opt.payload && opt.payload.id){ teamId = opt.payload.id; break; }
      }
      if(teamId) break;
    }
    if(!teamId) return null;

    const tr = await fetch(`https://www.fotmob.com/api/data/teams?id=${teamId}`,
      {headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(8000)});
    if(!tr.ok) return null;
    const td = await tr.json();
    const unavailable = (td.overview && td.overview.lastLineupStats && td.overview.lastLineupStats.unavailable) || [];

    // Fotmob은 type(injury/suspension)과 expectedReturn 문자열만 준다. FPL의
    // i/d/s/u 4단계 중 "출전 의심"은 expectedReturn === 'Doubtful'로만 구분된다.
    const injured = unavailable.map(p => {
      const u = p.unavailability || {};
      const ret = u.expectedReturn || '';
      const status = u.type === 'suspension' ? 's' : (ret === 'Doubtful' ? 'd' : 'i');
      return {
        id:       p.id,
        name:     p.name,
        fullName: p.name,
        position: '',
        photo:    `https://images.fotmob.com/image_resources/playerimages/${p.id}.png`,
        status,
        news:     ret,
        chance:   null,
      };
    });
    return injured;
  } catch(_){
    return null;
  }
}

// 같은 배포에 올라간 정적 파일(public/data/players.json 등)의 주소.
// 도메인을 코드에 박아두면 주소를 바꾸거나 옛 주소를 지울 때 스쿼드 데이터가
// 조용히 비므로, 요청이 들어온 호스트를 그대로 쓴다(로컬 vercel dev는 http).
// 호스트 헤더가 없는 경우(Node에서 핸들러 직접 호출 등)만 Vercel이 넣어주는
// 프로덕션 도메인으로 폴백한다. VERCEL_URL(배포별 고유 주소)은 쓰지 않는다 —
// Deployment Protection이 걸려 있으면 401이 난다.
function selfOrigin(req){
  const h = (req && req.headers) || {};
  const host = h['x-forwarded-host'] || h.host || process.env.VERCEL_PROJECT_PRODUCTION_URL || '';
  const proto = /^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https';
  return proto + '://' + host;
}

// ── 경기 예측(포아송 + 디슨-콜스) ────────────────────────────────────────
// 계산 자체는 _predict.js에 있다 — scripts/backtest_predict.mjs(검증)와 같은
// 코드를 써야 백테스트로 고른 계수가 운영에서 그대로 재현된다. 여기서는 Fotmob
// 응답을 그 함수들이 먹는 모양으로 만들고 캐싱하는 일만 한다.
//
// 팀 강도에 들어가는 것: 이번 시즌 xG 집계 + 최근 경기 가중 득점 + 지난 시즌
// 기록(사전값). 거기에 일정(휴식일·밀집)과 결장(포지션별)을 곱해 λ를 만든다.
// 유럽대항전은 상대가 다른 리그라 자국 리그 기록을 리그 수준 계수로 환산한 뒤
// 그 대회 자체 기록과 섞는다.
const LEAGUE_STRENGTH_TTL_SEC = 6 * 60 * 60;
const LEAGUE_PRIOR_TTL_SEC = 30 * 24 * 60 * 60;   // 지난 시즌 기록은 안 바뀐다
const TEAM_CONTEXT_TTL_SEC = 3 * 60 * 60;
const TEAM_CTX_SCHEMA = 5;        // 저장 형식(결장자 출처를 FPL/Fotmob squad로 교체) — 옆 캐시는 무시하고 다시 받는다
const LEAGUE_STRENGTH_SCHEMA = 2;

// 유럽대항전에서 자국 리그 기록을 환산할 때 쓰는 리그 수준 계수.
// 감으로 적은 값이 아니라 **실측값**이다 — UCL·유로파·컨퍼런스 리그페이즈의
// 교차리그 경기 511개(2024/25~2025/26)로 "자국 리그에서 이만큼 하는 팀이 다른 리그
// 팀을 만나면 실제로 몇 골 넣나"를 맞추는 배수를 최대우도로 적합했다
// (scripts/fit_league_coef.mjs). 경기 수가 적은 리그는 잘 적합된 리그들의 중앙값
// 쪽으로 당겼다.
//
// 두 가지 주의:
//  - 전체에 같은 수를 곱해도 λ에서 상쇄되므로(공격 ×coef, 상대 수비 ÷coef) 절대값이
//    아니라 **리그 간 비율**만 의미가 있다. EPL이 라리가보다 30% 높다는 게 요점.
//  - 이 값은 리그의 절대 수준만이 아니라 **리그 내 격차**도 같이 담는다. EPL은 상위·
//    하위 차이가 작아 강팀의 '리그 평균 대비 배수'가 실력을 과소평가하고, 격차가 큰
//    리그는 그 반대다. 모형이 필요로 하는 보정이 정확히 이것이라 의도된 성질이다.
const LEAGUE_COEF = {
  47:  0.96,  // Premier League   (교차리그 159경기)
  87:  0.78,  // LaLiga           (120경기)
  53:  0.78,  // Ligue 1          (104경기)
  54:  0.77,  // Bundesliga       (108경기)
  55:  0.74,  // Serie A          (117경기)
  61:  0.68,  // Liga Portugal    (75경기)
  196: 0.68,  // Ekstraklasa      (30경기)
  67:  0.66,  // Allsvenskan      (24경기)
  59:  0.66,  // Eliteserien      (34경기)
  71:  0.66,  // Süper Lig        (48경기)
  57:  0.65,  // Eredivisie       (81경기)
  252: 0.65,  // HNL              (15경기)
  212: 0.73,  // Nemzeti Bajnokság I (10경기)
  173: 0.73,  // Prva Liga        (9경기)
  // 아래 둘은 유럽대항전에 안 나와서 실측이 안 된다 — 위 눈금에 맞춘 추정값이다.
  40:  0.68,  // Belgian Pro League (추정)
  48:  0.60,  // Championship       (추정, 컵대회에서만 만난다)
};
// 자국 리그 '평균 대비 배수'를 다른 리그와 견줄 때 log 공간에서 눌러주는 지수.
// 이게 없으면 약한 리그의 절대 강팀이 과대평가된다 — 바이에른의 분데스리가 배수는
// 2배가 넘는데, 그건 상대가 약해서 부풀려진 값이라 유럽 무대에서 그대로 통하지 않는다.
// 실효배수 = 배수^0.55 로 누른다(실측: 교차리그 511경기 포아송 우도가 압축 없음보다
// 17.2 높다 — 통계적으로 뚜렷한 차이다). 같은 리그끼리 붙는 경기엔 적용하지 않는다.
const CROSS_LEAGUE_GAMMA = 0.55;
const LEAGUE_COEF_DEFAULT = 0.65;
const leagueCoef = id => LEAGUE_COEF[Number(id)] != null ? LEAGUE_COEF[Number(id)] : LEAGUE_COEF_DEFAULT;

function parseScoresStr(str){
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(String(str || '').trim());
  return m ? {gf: Number(m[1]), ga: Number(m[2])} : {gf: 0, ga: 0};
}
// "2026/2027" -> "2025/2026"
function seasonBefore(name){
  const m = /^(\d{4})\/(\d{4})$/.exec(String(name || ''));
  return m ? `${Number(m[1]) - 1}/${Number(m[2]) - 1}` : null;
}
// leagues 응답의 fixtures.allMatches → 종료 경기만 간단한 모양으로
function finishedMatchesOf(lg){
  const out = [];
  for(const m of (((lg.fixtures || {}).allMatches) || [])){
    const st = m.status || {};
    if(!st.finished || st.cancelled) continue;
    const sc = parseScoresStr(st.scoreStr);
    if(!st.utcTime) continue;
    out.push({utcTime: st.utcTime,
      homeId: String((m.home || {}).id), awayId: String((m.away || {}).id),
      homeGoals: sc.gf, awayGoals: sc.ga});
  }
  return out;
}

// 지난 시즌 팀별 "리그 평균 대비 배수" — 이번 시즌 사전값. 값이 안 바뀌니 길게 캐싱.
async function fetchLeaguePrior(leagueId, seasonName){
  if(!seasonName) return null;
  const key = `leaguePrior:${leagueId}:${seasonName}`;
  const cached = await kvGetJSON(key);
  if(cached) return cached;
  const r = await fetch(`https://www.fotmob.com/api/data/leagues?id=${leagueId}&season=${encodeURIComponent(seasonName)}`, {headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(8000)});
  if(!r.ok) return null;
  const lg = await r.json();
  const tb = (((lg.table || [])[0] || {}).data || {}).table || {};
  const rows = (tb.all || []).map(t => {
    const s = parseScoresStr(t.scoresStr);
    return {id: String(t.id || t.teamId), played: t.played || 0, gf: s.gf, ga: s.ga};
  }).filter(t => t.played > 0);
  // xG 테이블이 있으면 득점 대신 xG로 — 지난 시즌 사전값도 xG 쪽이 낫다.
  const xgById = {};
  (tb.xg || []).forEach(t => { if(t.played) xgById[String(t.id || t.teamId)] = {xg: t.xg, xgc: t.xgConceded, played: t.played}; });
  if(!rows.length) return null;
  const teamMatches = rows.reduce((a, t) => a + t.played, 0);
  const avg = rows.reduce((a, t) => a + t.gf, 0) / teamMatches;
  const xgAvgSrc = Object.values(xgById);
  const xgAvg = xgAvgSrc.length ? xgAvgSrc.reduce((a, t) => a + t.xg, 0) / xgAvgSrc.reduce((a, t) => a + t.played, 0) : null;
  const out = {season: seasonName, avg, teams: {}};
  rows.forEach(t => {
    const x = xgById[t.id];
    out.teams[t.id] = (x && xgAvg)
      ? {attack: (x.xg / x.played) / xgAvg, defence: (x.xgc / x.played) / xgAvg, played: x.played}
      : {attack: (t.gf / t.played) / avg, defence: (t.ga / t.played) / avg, played: t.played};
  });
  await kvSetJSON(key, out, LEAGUE_PRIOR_TTL_SEC);
  return out;
}

// 리그/대회 순위표 한 방(leagues?id=)으로 팀별 xG·홈/원정·전 경기 결과까지 받아
// 캐싱한다. 지난 시즌 사전값은 별도 키(영구에 가까운 TTL)로 따로 받는다.
async function fetchLeagueStrength(leagueId){
  const key = `leagueStrength:${leagueId}`;
  const cached = await kvGetJSON(key);
  if(cached && cached.schemaV === LEAGUE_STRENGTH_SCHEMA) return cached;

  const r = await fetch(`https://www.fotmob.com/api/data/leagues?id=${leagueId}`, {headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(8000)});
  if(!r.ok) return null;
  const lg = await r.json();
  const tb = (((lg.table || [])[0] || {}).data || {}).table || {};

  const teams = {};
  const touch = t => {
    const id = String(t.id || t.teamId || '');
    if(!id) return null;
    if(!teams[id]) teams[id] = {id, name: t.name || '', shortName: t.shortName || t.name || ''};
    return teams[id];
  };
  (tb.all || []).forEach(t => {
    const row = touch(t); if(!row) return;
    const s = parseScoresStr(t.scoresStr);
    row.played = t.played || 0; row.gf = s.gf; row.ga = s.ga;
    row.wins = t.wins || 0; row.draws = t.draws || 0; row.losses = t.losses || 0;
    row.position = t.idx || null;
  });
  const side = (arr, key2) => (arr || []).forEach(t => {
    const row = touch(t); if(!row) return;
    const s = parseScoresStr(t.scoresStr);
    row[key2] = {played: t.played || 0, gf: s.gf, ga: s.ga, wins: t.wins || 0, draws: t.draws || 0, losses: t.losses || 0};
  });
  side(tb.home, 'home');
  side(tb.away, 'away');
  (tb.xg || []).forEach(t => {
    const row = touch(t); if(!row) return;
    row.xg = t.xg || 0; row.xgConceded = t.xgConceded || 0;
  });

  const list = Object.values(teams).filter(t => (t.played || 0) > 0);
  if(!list.length) return null;
  const sum = f => list.reduce((a, t) => a + (f(t) || 0), 0);
  const totalTeamMatches = sum(t => t.played);
  const avgGoals = totalTeamMatches ? sum(t => t.gf) / totalTeamMatches : 1.4;
  const homeMatches = sum(t => (t.home || {}).played);
  const awayMatches = sum(t => (t.away || {}).played);
  const homeAvg = homeMatches ? sum(t => (t.home || {}).gf) / homeMatches : avgGoals;
  const awayAvg = awayMatches ? sum(t => (t.away || {}).gf) / awayMatches : avgGoals;
  const he = homeEdgeFrom(homeAvg, awayAvg, avgGoals, totalTeamMatches);

  // 최근 경기 가중(시간 감쇠) 득점 — 같은 응답의 전 경기 결과로 계산한다.
  const decay = decayedForm(finishedMatchesOf(lg), Date.now());

  const perMatch = (total, played) => (played > 0 ? total / played : 0);
  list.forEach(t => {
    t.xgFor = perMatch(t.xg != null ? t.xg : t.gf, t.played);
    t.xgAgainst = perMatch(t.xgConceded != null ? t.xgConceded : t.ga, t.played);
    const d = decay[t.id];
    t.decayFor = d ? d.gfPerMatch : null;
    t.decayAgainst = d ? d.gaPerMatch : null;
  });
  [...list].sort((a, b) => b.xgFor - a.xgFor).forEach((t, i) => { t.attackRank = i + 1; });
  [...list].sort((a, b) => a.xgAgainst - b.xgAgainst).forEach((t, i) => { t.defenceRank = i + 1; });

  // 지난 시즌 사전값(있으면)
  const seasonName = (((lg.table || [])[0] || {}).data || {}).selectedSeason || ((lg.details || {}).selectedSeason) || '';
  const prior = await fetchLeaguePrior(leagueId, seasonBefore(seasonName)).catch(() => null);

  const payload = {
    schemaV: LEAGUE_STRENGTH_SCHEMA,
    leagueId: Number(leagueId),
    leagueName: ((lg.details || {}).name) || '',
    season: seasonName,
    teamCount: list.length,
    avgGoals,
    homeFactor: he.homeFactor,
    awayFactor: he.awayFactor,
    homeEdge: he.edge,
    coef: leagueCoef(leagueId),
    prior: prior ? {season: prior.season, teams: prior.teams} : null,
    teams: Object.fromEntries(list.map(t => [t.id, t])),
    updatedAt: Date.now(),
  };
  await kvSetJSON(key, payload, LEAGUE_STRENGTH_TTL_SEC);
  return payload;
}

// 결장자 명단 — 출처가 둘이고 서로 놓치는 게 다르다(실측 2026-09-25 아스날):
//   FPL     : 살리바·화이트·라이스·하베르츠  (팀버·모스케라 없음)
//   Fotmob  : 살리바·화이트·모스케라·팀버·하베르츠  (라이스 없음)
// 프리미어리그 팀은 FPL을 쓴다 — 출전 확률(75%/50%/25%)까지 주므로 "출전 불확실"을
// 반반으로 뭉개지 않고 그대로 가중치에 넣을 수 있다. FPL에 없는 팀(유럽 클럽 등)은
// Fotmob을 본다.
//
// Fotmob 쪽은 lastLineupStats.unavailable이 아니라 squad를 봐야 한다 — 전자는 이름 그대로
// "직전 경기 시점"이라 그 뒤에 생긴 부상이 안 들어온다(실측: 하베르츠·팀버가 squad에만 있었다).
const FPL_ELEMENT_POS = {1: 0, 2: 1, 3: 2, 4: 3};          // GK/DF/MF/FW → 0~3
const SQUAD_GROUP_POS = {keepers: 0, defenders: 1, midfielders: 2, attackers: 3};
const normName = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const lastName = s => normName(s).split(/\s+/).pop();

// Fotmob 팀 응답에서 부상·결장자를 뽑는다. 시장가치는 squad에 없어서 직전 선발 명단에서
// 이름으로 찾아 붙인다(없으면 injuryFactors가 평균의 0.6배로 잡는다).
function fotmobSquadOut(t){
  const groups = ((t.squad || {}).squad) || ((t.overview || {}).squad) || [];
  const mvByName = {};
  (((t.overview || {}).lastLineupStats || {}).starters || []).forEach(st => {
    if(st.name) mvByName[normName(st.name)] = st.marketValue || 0;
  });
  const out = [];
  for(const g of groups){
    const gp = SQUAD_GROUP_POS[String(g.title || g.role || '').toLowerCase()];
    for(const m of (g.members || [])){
      if(!m.injured && !m.injury) continue;
      const ret = (m.injury || {}).expectedReturn || '';
      out.push({
        name: m.name || '',
        pos: (m.positionId != null && m.positionId >= 0 && m.positionId <= 3) ? m.positionId : (gp != null ? gp : 2),
        value: mvByName[normName(m.name)] || 0,
        type: 'injury',
        expectedReturn: ret,
        doubtful: /doubt/i.test(ret),
      });
    }
  }
  return out;
}

// FPL 결장자 — chance_of_playing_next_round를 "빠질 확률"로 뒤집어 가중치로 쓴다.
// 75% 출전 가능 → 0.25만 빠진 것으로 계산. 값이 없으면(상태만 i/s) 통째로 빠진 것.
async function fplTeamOut(teamName, mvByName){
  try{
    const r = await fetch(FPL_URL, {headers: FPL_HEADERS, signal: AbortSignal.timeout(8000)});
    if(!r.ok) return null;
    const d = await r.json();
    const needle = normName(teamName);
    const team = (d.teams || []).find(t =>
      normName(t.name) === needle || normName(t.name).includes(needle) || needle.includes(normName(t.name)) ||
      normName(t.short_name) === needle);
    if(!team) return null;                       // 프리미어리그 팀이 아니다 → 호출부가 Fotmob으로 간다
    return (d.elements || [])
      .filter(p => p.team === team.id)
      .filter(p => p.chance_of_playing_next_round !== null && p.chance_of_playing_next_round < 100)
      .filter(p => !LOAN_KEYWORDS.test(p.news || ''))
      .map(p => {
        const full = `${p.first_name} ${p.second_name}`;
        const chance = p.chance_of_playing_next_round;
        return {
          name: p.web_name || full,
          pos: FPL_ELEMENT_POS[p.element_type] != null ? FPL_ELEMENT_POS[p.element_type] : 2,
          value: mvByName[lastName(p.second_name)] || mvByName[normName(full)] || 0,
          type: p.status === 's' ? 'suspension' : 'injury',
          expectedReturn: p.news || '',
          doubtful: chance != null && chance > 0,
          missWeight: chance == null ? 1 : Math.min(Math.max(1 - chance / 100, 0), 1),
        };
      });
  }catch(_){ return null; }
}

// 팀의 자국 리그 id·결장자·일정 — 전부 teams?id= 한 응답에 들어있다.
async function fetchTeamContext(teamId){
  const key = `teamCtx:${teamId}`;
  const cached = await kvGetJSON(key);
  if(cached && cached.schemaV === TEAM_CTX_SCHEMA) return cached;

  const r = await fetch(`https://www.fotmob.com/api/data/teams?id=${teamId}`, {headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(8000)});
  if(!r.ok) return null;
  const t = await r.json();
  const tables = (t.table || []).map(x => x.data || {}).filter(d => d.leagueId);
  // ccode INT = 유럽대항전. 자국 리그는 그 외 항목.
  const domestic = tables.find(d => d.ccode && d.ccode !== 'INT') || tables[0] || {};
  const ls = ((t.overview || {}).lastLineupStats) || {};
  // 결장자 항목엔 포지션이 있을 때도 없을 때도 있다(실측: 살리바만 있고 벤 화이트·
  // 모스케라는 없음) — 같은 응답의 스쿼드에서 id로 찾아 메운다.
  const posById = {};
  (((t.squad || {}).squad) || []).forEach(g => (g.members || []).forEach(mem => {
    if(mem.id != null && mem.positionId != null && mem.positionId >= 0 && mem.positionId <= 3) posById[String(mem.id)] = mem.positionId;
  }));
  const posOf = pl => {
    if(pl.usualPlayingPositionId != null && pl.usualPlayingPositionId >= 0 && pl.usualPlayingPositionId <= 3) return pl.usualPlayingPositionId;
    const byId = posById[String(pl.id)];
    return byId != null ? byId : 2;   // 끝내 모르면 미드필더로 본다(득점·실점 영향이 중간)
  };
  // 일정 — 휴식일·2주 경기 수 계산용. 리그만이 아니라 컵·유럽대항전까지 다 들어있다.
  // 단 친선경기는 뺀다(사용자 지적): 주전이 25~30분만 뛰고 로테이션 선수에게 출전을
  // 나눠주는 경기라 피로도가 사실상 없는데, 그대로 세면 프리시즌에 "4일 휴식 + 2주
  // 4경기"처럼 잡혀 8월 경기 예측이 통째로 깎였다(실측: 아스날·릴 모두 8월 친선 4경기).
  // Fotmob은 친선을 leagueId 489(Club Friendlies)로 따로 매긴다.
  // 국가대표 경기(A매치)는 애초에 클럽 일정에 없고, 클럽 경기가 아니니 세지 않는다.
  const FRIENDLY_LEAGUE_ID = 489;
  const playedAt = [];
  // 최근 공식전 결과 — AI 해설의 "최근 흐름" 재료. 포아송 모형은 시즌 집계만 보고 이건
  // 안 쓰니, 해설이 모형 수치를 되풀이하는 걸 넘어 맥락을 줄 수 있는 몇 안 되는 정보다.
  const recent = [];
  for(const f of ((((t.fixtures || {}).allFixtures) || {}).fixtures || [])){
    const st = f.status || {};
    if(!st.finished || st.cancelled || !st.utcTime) continue;
    const tour = f.tournament || {};
    if(tour.leagueId === FRIENDLY_LEAGUE_ID || /friendl/i.test(tour.name || '')) continue;
    playedAt.push(new Date(st.utcTime).getTime());
    const home = f.home || {}, away = f.away || {};
    const isHome = String(home.id) === String(teamId);
    const gf = isHome ? home.score : away.score, ga = isHome ? away.score : home.score;
    if(gf == null || ga == null) continue;
    recent.push({
      at: st.utcTime, venue: isHome ? '홈' : '원정',
      opp: (isHome ? away.name : home.name) || '', comp: tour.name || '',
      gf, ga, res: gf > ga ? '승' : gf === ga ? '무' : '패',
    });
  }
  playedAt.sort((a, b) => a - b);
  recent.sort((a, b) => new Date(a.at) - new Date(b.at));
  const topOf = arr => {
    const x = (Array.isArray(arr) ? arr : (arr && arr.players) || [])[0];
    return x && x.name ? {name: x.name, value: x.value} : null;
  };
  const tp = ((t.overview || {}).topPlayers) || {};

  // 결장자: 프리미어리그 팀이면 FPL(출전 확률까지), 아니면 Fotmob squad.
  const mvByName = {};
  (ls.starters || []).forEach(st => { if(st.name){ mvByName[normName(st.name)] = st.marketValue || 0; mvByName[lastName(st.name)] = st.marketValue || 0; } });
  const teamName = ((t.details || {}).name) || '';
  const fplOut = teamName ? await fplTeamOut(teamName, mvByName) : null;
  const out = fplOut || fotmobSquadOut(t);

  const ctx = {
    id: String(teamId),
    name: ((t.details || {}).name) || '',
    schemaV: TEAM_CTX_SCHEMA,
    leagueId: domestic.leagueId || null,
    leagueName: domestic.leagueName || '',
    // 결장 비중의 분모가 되는 "직전 경기 선발 11명". Fotmob이 대회를 가리지 않고
    // 말 그대로 직전 경기를 주므로, 프리시즌에는 이게 친선 로테이션 XI일 수 있다
    // (그 경우 분모가 작아져 결장 영향이 과대평가된다). 대체할 다른 XI가 응답에
    // 없어서 그대로 쓰되, 8월 예측을 볼 때 감안할 것.
    xiValue: ls.totalStarterMarketValue || 0,
    starters: (ls.starters || []).map(st => ({pos: posOf(st), value: st.marketValue || 0})),
    out,
    playedAt,
    form: recent.slice(-5),
    // 팀 내 시즌 득점·도움·평점 1위 (Fotmob 팀 개요)
    topPlayers: {goals: topOf(tp.byGoals), assists: topOf(tp.byAssists), rating: topOf(tp.byRating)},
    updatedAt: Date.now(),
  };
  await kvSetJSON(key, ctx, TEAM_CONTEXT_TTL_SEC);
  return ctx;
}

// 팀 색(라이트/다크 모드별) — Fotmob이 모드마다 따로 준다. 흰색 유니폼 팀은 다크 모드
// #ffffff / 라이트 모드 #0060AA(리즈)처럼 이미 배경 대비를 고려한 값이라 그대로 쓴다.
// leaders의 'teamColors' 맵은 한 가지 색만 저장해서 따로 둔다. 팀 색은 거의 안 바뀌므로 30일.
async function fetchTeamColorsByMode(ids){
  const KEY = 'teamColorsByMode';
  const map = (await kvGetJSON(KEY)) || {};
  const missing = ids.map(String).filter(id => !map[id]);
  if(missing.length){
    await Promise.all(missing.map(async id => {
      try {
        const r = await fetch(`https://www.fotmob.com/api/data/teams?id=${id}`,
          {headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(8000)});
        if(!r.ok) return;
        const c = (await r.json())?.overview?.teamColors;
        if(c && (c.lightMode || c.darkMode)) map[id] = {light: c.lightMode || c.darkMode, dark: c.darkMode || c.lightMode};
      } catch(_){}
    }));
    await kvSetJSON(KEY, map, 30 * 24 * 60 * 60);
  }
  const out = {};
  ids.map(String).forEach(id => { if(map[id]) out[id] = map[id]; });
  return out;
}

// 킥오프 시각 기준 휴식일·최근 2주 경기 수
function restFor(ctx, kickoffMs){
  if(!ctx || !(ctx.playedAt || []).length || !kickoffMs) return null;
  const before = ctx.playedAt.filter(t => t < kickoffMs);
  if(!before.length) return null;
  const last = before[before.length - 1];
  const win = before.filter(t => kickoffMs - t <= PARAMS.congestionWindowDays * 86400000).length;
  return restFactor((kickoffMs - last) / 86400000, win);
}

// 한 팀의 "절대 기대득점/실점"(= 이 대회 평균 상대를 만났을 때의 값).
// 자국 리그 기록(리그 수준 계수로 환산) + 그 대회 자체 기록을 경기 수로 섞는다.
function teamAbsStrength(teamId, compStrength, domStrength){
  const id = String(teamId);
  const inComp = compStrength && compStrength.teams[id];
  const inDom  = domStrength  && domStrength.teams[id];
  if(!inComp && !inDom) return null;

  const ratioOf = (strength, row, usePrior) => {
    const prior = usePrior && strength.prior ? strength.prior.teams[id] : null;
    const attack = blendRatio({
      curXgRate: row.xgFor, curDecayRate: row.decayFor, curPlayed: row.played,
      prevRatio: prior ? prior.attack : null, leagueAvg: strength.avgGoals, usePrior,
    });
    const defence = blendRatio({
      curXgRate: row.xgAgainst, curDecayRate: row.decayAgainst, curPlayed: row.played,
      prevRatio: prior ? prior.defence : null, leagueAvg: strength.avgGoals, isDefence: true, usePrior,
    });
    return {attack, defence};
  };

  // 자국 리그: 사전값(지난 시즌) 사용 → 절대값으로 환산(리그 평균 × 리그 수준 계수).
  // 다른 리그 팀과 붙는 경기에서만 배수를 압축한다(CROSS_LEAGUE_GAMMA 주석 참고) —
  // 같은 리그 경기는 애초에 같은 상대 풀에서 잰 값이라 누를 이유가 없다.
  let domAbs = null;
  if(inDom){
    const r = ratioOf(domStrength, inDom, true);
    const coef = domStrength.coef;
    const cross = !!(compStrength && compStrength.leagueId !== domStrength.leagueId);
    const squash = x => cross ? Math.pow(Math.max(x, 0.05), CROSS_LEAGUE_GAMMA) : x;
    domAbs = {att: squash(r.attack) * domStrength.avgGoals * coef,
              def: squash(r.defence) * domStrength.avgGoals / coef,
              played: inDom.played};
  }
  // 대회 자체: 지난 시즌 사전값이 의미 없어서(조 편성이 매년 다름) 평균 쪽으로만 보정
  let compAbs = null;
  if(inComp){
    const r = ratioOf(compStrength, inComp, false);
    compAbs = {att: r.attack * compStrength.avgGoals, def: r.defence * compStrength.avgGoals, played: inComp.played};
  }

  let att, def, played, source;
  if(compAbs && domAbs){
    const sameLeague = compStrength.leagueId === domStrength.leagueId;
    if(sameLeague){ att = domAbs.att; def = domAbs.def; played = domAbs.played; source = 'league'; }
    else {
      const w = compAbs.played / (compAbs.played + PARAMS.compBlendK);
      att = w * compAbs.att + (1 - w) * domAbs.att;
      def = w * compAbs.def + (1 - w) * domAbs.def;
      played = compAbs.played + domAbs.played;
      source = 'blend';
    }
  } else if(compAbs){ att = compAbs.att; def = compAbs.def; played = compAbs.played; source = 'comp'; }
  else { att = domAbs.att; def = domAbs.def; played = domAbs.played; source = 'domestic'; }

  // 화면·서술에 쓰는 수치와 순위는 표본이 큰 자국 리그 쪽으로 통일한다 —
  // 대회 기록(UCL 1경기)에서 뽑으면 "경기당 기대득점 4.05" 같은 값이 나온다.
  const info = inDom || inComp;
  return {att, def, played, source,
          name: info.name, shortName: info.shortName, position: info.position,
          xgFor: info.xgFor, xgAgainst: info.xgAgainst,
          attackRank: info.attackRank, defenceRank: info.defenceRank,
          hasPrior: !!(inDom && domStrength.prior && domStrength.prior.teams[id]),
          record: null, leagueName: (inDom ? domStrength : compStrength).leagueName};
}

function predictMatch(opts){
  const {compStrength, homeId, awayId, homeDom, awayDom, homeCtx, awayCtx, kickoffMs} = opts;
  const base = compStrength || homeDom || awayDom;
  if(!base) return {available: false, reason: '리그 데이터 없음'};

  const H = teamAbsStrength(homeId, compStrength, homeDom);
  const A = teamAbsStrength(awayId, compStrength, awayDom);
  if(!H || !A) return {available: false, reason: '순위표에 없는 팀'};

  // 홈/원정 성적은 국내 리그 표에서 가져온다(대회 표는 경기 수가 너무 적다).
  const homeRow = (homeDom && homeDom.teams[String(homeId)]) || (compStrength && compStrength.teams[String(homeId)]);
  const awayRow = (awayDom && awayDom.teams[String(awayId)]) || (compStrength && compStrength.teams[String(awayId)]);
  H.record = homeRow && homeRow.home ? homeRow.home : null;
  A.record = awayRow && awayRow.away ? awayRow.away : null;

  const avg = base.avgGoals;
  const injH = injuryFactors(homeCtx), injA = injuryFactors(awayCtx);
  const restH = restFor(homeCtx, kickoffMs), restA = restFor(awayCtx, kickoffMs);
  const lam = lambdasFrom({
    leagueAvg: avg,
    homeAttack: H.att / avg, homeDefence: H.def / avg,
    awayAttack: A.att / avg, awayDefence: A.def / avg,
    homeFactor: base.homeFactor, awayFactor: base.awayFactor,
    homeRest: restH, awayRest: restA, homeInj: injH, awayInj: injA,
  });
  const r = scoreProbs(lam.home, lam.away);

  const ctxOf = id => String(id) === String(homeId) ? homeCtx : awayCtx;
  const side = (T, dom, inj, rest, id) => ({
    form: (ctxOf(id) || {}).form || [],
    topPlayers: (ctxOf(id) || {}).topPlayers || null,
    id: String(id),
    name: T.name, shortName: T.shortName, position: T.position,
    xgFor: T.xgFor, xgAgainst: T.xgAgainst,
    attackRank: T.attackRank, defenceRank: T.defenceRank,
    leagueName: (dom && dom.leagueName) || T.leagueName || '',
    record: T.record, played: T.played, source: T.source, hasPrior: T.hasPrior,
    injury: {attackFactor: inj.attackFactor, concedeFactor: inj.concedeFactor,
             lines: inj.lines, attackImpact: inj.attackImpact, concedeImpact: inj.concedeImpact, out: inj.out},
    rest: rest ? {days: Math.round(rest.daysRest * 10) / 10, matches14: rest.matches, penalty: rest.penalty} : null,
  });

  return {
    available: true,
    competition: {leagueId: base.leagueId, name: base.leagueName, avgGoals: avg,
                  homeFactor: base.homeFactor, awayFactor: base.awayFactor,
                  homeEdge: base.homeEdge, teamCount: base.teamCount},
    crossLeague: !!(homeDom && awayDom && homeDom.leagueId !== awayDom.leagueId),
    home: side(H, homeDom, injH, restH, homeId),
    away: side(A, awayDom, injA, restA, awayId),
    expected: {home: lam.home, away: lam.away},
    probs: r.probs,
    scorelines: r.scorelines.slice(0, 5),
    over25: r.over25, under25: r.under25, overLines: r.overLines, btts: r.btts, bttsNo: r.bttsNo,
    sample: {played: Math.min(H.played, A.played), priorK: PARAMS.priorK,
             prior: !!(H.hasPrior && A.hasPrior)},
  };
}

// 계산된 숫자만으로 한국어 분석문을 조립한다(LLM 없음, 비용 0, 같은 입력이면
// 항상 같은 문장). 숫자 자체가 근거라, 여기서 새로운 사실을 지어내지 않는다.
function predictNarrative(p){
  if(!p.available) return [];
  const pct = v => Math.round(v * 100);
  const two = v => v.toFixed(2);
  const rec = r => r ? `${r.wins}승 ${r.draws}무 ${r.losses}패` : '';
  const out = [];
  const hn = p.home.shortName, an = p.away.shortName;
  // 다른 리그 팀끼리 붙는 경기(유럽대항전)는 "리그 n위"가 서로 다른 리그 기준이라
  // 어느 리그인지 같이 적어야 오해가 없다.
  const at = t => p.crossLeague && t.leagueName ? `${t.leagueName} ` : '리그 ';

  // 팀 이름이 영문이라 "Arsenal은(는)" 같은 조사를 붙이면 어색해서 콜론으로 뗀다.
  out.push(`${hn}: 경기당 기대득점 ${two(p.home.xgFor)}(${at(p.home)}${p.home.attackRank}위), 기대실점 ${two(p.home.xgAgainst)}(${at(p.home)}${p.home.defenceRank}위).`);
  out.push(`${an}: 경기당 기대득점 ${two(p.away.xgFor)}(${at(p.away)}${p.away.attackRank}위), 기대실점 ${two(p.away.xgAgainst)}(${at(p.away)}${p.away.defenceRank}위).`);

  if(p.home.record && p.home.record.played) out.push(`${hn} 홈 성적 ${rec(p.home.record)} — ${p.home.record.played}경기 ${p.home.record.gf}득점 ${p.home.record.ga}실점.`);
  if(p.away.record && p.away.record.played) out.push(`${an} 원정 성적 ${rec(p.away.record)} — ${p.away.record.played}경기 ${p.away.record.gf}득점 ${p.away.record.ga}실점.`);

  // 결장 — 득점/실점 중 하나라도 3% 넘게 움직일 때만 언급한다.
  const injLine = (t, n) => {
    const inj = t.injury; if(!inj) return;
    const dAtk = Math.round((1 - inj.attackFactor) * 100);
    const dDef = Math.round((inj.concedeFactor - 1) * 100);
    if(dAtk < 3 && dDef < 3) return;
    const names = inj.out.map(o => o.name + (o.posLabel ? '(' + o.posLabel + (o.doubtful ? ', 불투명' : '') + ')' : '')).join(', ');
    const hit = inj.lines.map((sh, p2) => ({label: POS_LABEL[p2], sh})).filter(x => x.sh >= 0.2)
      .map(x => `${x.label} ${pct(x.sh)}%`).join(' · ');
    out.push(`${n} 결장 — ${names}.${hit ? ' 선발 기준 ' + hit + ' 이탈로' : ''} 기대득점 −${dAtk}%, 기대실점 +${dDef}% 반영했습니다.`);
  };
  injLine(p.home, hn);
  injLine(p.away, an);

  // 일정 — 휴식이 짧거나 2주에 경기가 몰린 쪽만 짚는다.
  const restLine = (t, n) => {
    if(!t.rest || t.rest.penalty < 0.015) return;
    const bits = [];
    if(t.rest.days != null && t.rest.days < PARAMS.restRef) bits.push(`직전 경기 후 ${t.rest.days}일 휴식`);
    if(t.rest.matches14 > PARAMS.congestionRef) bits.push(`최근 2주 ${t.rest.matches14}경기`);
    if(!bits.length) return;
    out.push(`${n} 일정 — ${bits.join(', ')}. 기대득점 −${pct(t.rest.penalty)}% 반영했습니다.`);
  };
  restLine(p.home, hn);
  restLine(p.away, an);

  const homeEdge = Math.round((p.competition.homeFactor / p.competition.awayFactor - 1) * 100);
  if(homeEdge >= 5) out.push(`올 시즌 ${p.competition.name || '이 대회'} 홈팀은 원정팀보다 경기당 ${homeEdge}% 더 득점하고 있습니다.`);

  // 결론 — 확률 차이를 말로 옮기기만 한다(기대 스코어·오버·BTTS는 화면에 따로 있다).
  const diff = p.probs.home - p.probs.away;
  const favName = diff >= 0 ? hn : an;
  const favP = pct(Math.max(p.probs.home, p.probs.away));
  const underP = pct(Math.min(p.probs.home, p.probs.away));
  const gap = Math.abs(diff);
  if(gap >= 0.25)      out.push(`종합하면 ${favName} 우세가 뚜렷합니다(승리 ${favP}% 대 ${underP}%).`);
  else if(gap >= 0.12) out.push(`종합하면 우세는 ${favName} 쪽이지만(${favP}%) 뒤집힐 여지도 남아 있습니다.`);
  else                 out.push(`두 팀 전력이 팽팽해 무승부 확률(${pct(p.probs.draw)}%)이 승패 못지않게 높습니다.`);

  const foe = diff >= 0 ? p.away : p.home;
  const foeName = diff >= 0 ? an : hn;
  if(foe.attackRank <= 8)       out.push(`다만 ${foeName}의 기대득점이 ${at(foe)}${foe.attackRank}위라, 무실점으로 끝나긴 어려운 상대입니다.`);
  else if(foe.defenceRank <= 8) out.push(`다만 ${foeName}의 기대실점이 ${at(foe)}${foe.defenceRank}위로 탄탄해, 다득점은 쉽지 않아 보입니다.`);

  if(p.crossLeague){
    out.push(`두 팀이 다른 리그라 자국 리그 기록을 리그 수준 보정을 거쳐 비교했고, ${p.competition.name || '대회'} 자체 기록도 경기 수만큼 반영했습니다.`);
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');

  const type = req.query.type || 'fixtures';
  const nocache = req.query.nocache;
  // injuries는 team 파라미터로 아스날 외 다른 팀도 조회할 수 있어 캐시 키에
  // team을 같이 섞는다 — 안 그러면 아스날 조회 캐시를 상대팀 조회가 그대로
  // 돌려받거나 덮어써버린다.
  const teamParam = req.query.team || '';
  // playerDetail은 선수마다 응답이 다르므로 id도 캐시 키에 섞는다 — 안 그러면
  // 첫 번째로 조회된 선수의 데이터를 다른 선수 조회가 그대로 돌려받는다.
  const idParam = req.query.id || '';
  // season=prev(지난 시즌)와 기본(이번 시즌) 요청이 id가 같다는 이유로 같은
  // cacheKey를 쓰면, 둘 중 먼저 도착한 쪽 응답을 서버 메모리 캐시가 그대로
  // 돌려버려서 시즌 토글이 실제로는 캐시된 "이번 시즌" 값만 반복해서 받는
  // 버그가 있었다(로컬에서는 파일 저장마다 함수가 다시 로드돼 안 드러났지만,
  // 실제 배포에서는 같은 인스턴스가 두 요청을 다 받아서 재현됐다).
  const seasonParam = req.query.season || '';
  // predict는 두 팀·대회·킥오프가 요청마다 다르다 — 이걸 키에 안 넣으면 처음 계산된
  // 한 경기의 예측이 1시간 동안 모든 경기에 그대로 재사용된다(실측: 릴전 예측이
  // 뮌헨전 카드에 그대로 나왔다. 팀 이름은 모달 쪽 데이터라 뮌헨인데 내용만 릴).
  const predictKey = type === 'predict'
    ? ['', req.query.home || '', req.query.away || '', req.query.league || '', req.query.date || ''].join('_')
    : '';
  const cacheKey = type + (teamParam ? ('_'+teamParam) : '') + (idParam ? ('_'+idParam) : '') + (seasonParam ? ('_'+seasonParam) : '') + predictKey;
  // playerDetail(이번 시즌)의 changedOther/changedTraits는 "지금 이 순간 KV
  // 기준으로 바뀌었는가"를 매 요청마다 새로 판정해야 하는 값이라, 응답
  // 자체를 1시간짜리 일반 캐시(서버 메모리 + 브라우저 Cache-Control)에
  // 태우면 안 된다 — 한 번 changed=true로 응답하고 나면(그 시점에 KV엔 이미
  // 새 기준값이 저장됐는데도) 캐시된 그 응답이 그대로 최대 1시간 동안
  // 재사용돼서, 그 사이 몇 번을 다시 열어도 "바뀜" 응답이 계속 재생되며
  // 페이드가 반복되는 버그가 있었다(직전 시즌 조회는 kvGetPlayerSeason으로
  // 별도의 영구 캐시를 쓰므로 영향 없음).
  const isLivePlayerDiff = type === 'playerDetail' && seasonParam !== 'prev';
  // predict도 1시간 메모리 캐시에 태우지 않는다 — 크론이 AI 해설을 새로 만들어도, 그 전에
  // 캐시된 "해설 없는" 응답이 최대 1시간 동안 계속 나간다. 무거운 부분(리그 강도·팀 문맥)은
  // 이미 KV에 캐시돼 있어서 매번 계산해도 KV 몇 번 읽는 게 전부다.
  const noMemCache = isLivePlayerDiff || type === 'predict';
  // CDN 캐시 — 같은 응답을 Vercel CDN이 잠깐 보관했다가 방문자들에게 나눠준다(외부 공유로 5분에
  // 7천 건이 몰렸을 때 /api/football은 전부 캐시 미적중이라 매번 함수가 돌았다). 브라우저는
  // max-age=0으로 매번 CDN에 확인만 하고(재방문 시 옛 데이터가 브라우저에 눌어붙지 않게),
  // CDN은 최대 5분(s-maxage) + 만료 뒤 10분은 옛 응답을 주면서 뒤에서 갱신(stale-while-revalidate).
  // 캐시하면 안 되는 것: nocache=1(라이브 폴링 등 "지금 값"이 필요한 호출), 이번 시즌 playerDetail
  // (요청마다 "바뀌었나"를 새로 판정). predict는 메모리 캐시는 안 타지만 CDN 5분은 괜찮다 —
  // 크론이 만든 AI 해설이 늦어도 5분 안에 반영된다.
  const cdnSec = CDN_SEC_OVERRIDES[type] || Math.min(Math.floor(getTTL(type)/1000), 300);
  res.setHeader('Cache-Control', (nocache || isLivePlayerDiff)
    ? 'no-store'
    : `public, max-age=0, s-maxage=${cdnSec}, stale-while-revalidate=600`);

  if(!nocache && !noMemCache){
    const hit = getCache(cacheKey);
    if(hit) return res.json(hit);
  }

  // fixtures/results 두 엔드포인트가 공유하는 조회 도구 모음
  const ARSENAL_ESPN_ID = '359';
  const SLUGS = [
    {slug:'eng.1',         name:'Premier League',   short:'PL'},
    {slug:'uefa.champions',name:'Champions League', short:'UCL'},
    {slug:'uefa.europa',   name:'Europa League',    short:'EL'},
    {slug:'eng.league_cup',name:'EFL Cup',          short:'EFL'},
    {slug:'eng.fa',        name:'FA Cup',           short:'FAC'},
    {slug:'eng.charity',   name:'Community Shield', short:'CS'},
    {slug:'club.friendly', name:'Friendly',         short:'FR'},
  ];
  const now = new Date();
  const parseEvent = (e, name, short) => {
    const comp = e.competitions?.[0];
    const home = comp?.competitors?.find(c => c.homeAway === 'home');
    const away = comp?.competitors?.find(c => c.homeAway === 'away');
    const status = comp?.status?.type;
    const finished = status?.completed || false;
    const live = status?.state === 'in';
    const homeScore = (finished||live) ? (parseInt(home?.score?.displayValue ?? home?.score ?? 0)||0) : null;
    const awayScore = (finished||live) ? (parseInt(away?.score?.displayValue ?? away?.score ?? 0)||0) : null;
    const homeId = home?.team?.id;
    const awayId = away?.team?.id;
    return {
      id:          e.id,
      utcDate:     e.date,
      competition: {name, short},
      round:       e.season?.slug||e.seasonType?.name?.toLowerCase()||null,
      neutralSite: !!comp?.neutralSite,
      venue:       comp?.venue?.fullName || null,
      status:      finished ? 'FINISHED' : live ? 'IN_PLAY' : 'SCHEDULED',
      clock:       live ? (() => {
        const raw = comp?.status?.displayClock || '';
        const period = comp?.status?.period || 1;
        const mm = raw.match(/^(\d{1,3}(?:\+\d+)?):/);
        if (mm) {
          const mins = parseInt(mm[1], 10);
          const base = period === 2 ? 45 : period === 3 ? 90 : period === 4 ? 105 : 0;
          return (base + mins) + "'";
        }
        return raw;
      })() : null,
      period:      live ? (comp?.status?.period||null) : null,
      isHT:        live && comp?.status?.type?.description === 'Halftime',
      tbd:         status?.id === '5' || status?.description === 'Postponed' ? 'postponed' : status?.id === '6' || status?.description === 'Canceled' ? 'canceled' : status?.id === '8' ? 'tbd' : null,
      homeTeam: {
        id:    homeId,
        name:  home?.team?.shortDisplayName || home?.team?.displayName || home?.team?.name,
        crest: home?.team?.logo || (homeId ? `https://a.espncdn.com/i/teamlogos/soccer/500/${homeId}.png` : null),
      },
      awayTeam: {
        id:    awayId,
        name:  away?.team?.shortDisplayName || away?.team?.displayName || away?.team?.name,
        crest: away?.team?.logo || (awayId ? `https://a.espncdn.com/i/teamlogos/soccer/500/${awayId}.png` : null),
      },
      score: {fullTime: {home: homeScore, away: awayScore}}
    };
  };
  const isArsenal = m =>
    m.homeTeam?.id === ARSENAL_ESPN_ID || m.awayTeam?.id === ARSENAL_ESPN_ID ||
    m.homeTeam?.name?.includes('Arsenal') || m.awayTeam?.name?.includes('Arsenal');
  try {
    let result;

    if(type === 'fixtures'){
      // 시즌 종료(5월 31일)까지 조회 — 1~5월(시즌 중)이면 올해 5월,
      // 6~12월(오프시즌 또는 새 시즌 진행 중)이면 다음 해 5월
      const seasonEndYear = now.getMonth() + 1 <= 5 ? now.getFullYear() : now.getFullYear() + 1;
      // ESPN team/schedule는 season 파라미터 없으면 자체 "현재 시즌" 포인터를 쓰는데,
      // 다음 시즌 일정이 아직 없는 오프시즌엔 그게 빈 시즌을 가리켜 직전 시즌 결과가 통째로 빠짐.
      // 8월 이전이면 작년 8월에 시작한 시즌이 아직 "현재/직전" 시즌이므로 명시적으로 지정.
      const currentSeasonYear = now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
      // 새 시즌 시작 직후(8월)엔 아직 경기가 없을 수 있어 직전 시즌도 함께 조회 —
      // 그 외 기간엔 currentSeasonYear 하나로 충분하므로 불필요한 조회를 피함.
      const seasonsToFetch = now.getMonth() === 7 ? [currentSeasonYear, currentSeasonYear - 1] : [currentSeasonYear];

      // ── Fotmob 우선 ──────────────────────────────────────────
      // 팀 API 한 번이면 시즌 전체 일정(친선 포함)이 대회명·스코어·라이브 분까지
      // 붙어서 온다. 아래 ESPN 경로는 폴백으로 남긴다 — Fotmob이 막히거나 응답이
      // 비면 그쪽으로 흘러가서 화면이 비지 않게.
      try {
        // 가공된 일정만 KV에 둔다(원본 600KB가 아니라 30KB 수준이라 되읽기가 빠르다)
        let fmMatches = nocache ? null : await kvGetJSON(`fixtures:v3:${FIRST_TEAM_ID}`);
        if(!fmMatches){
          const teamPayload = await fetchTeamPayload();
          // 일정만 만들지 않고 순위·선수단 조각까지 같이 채운다 — 지금 도는
          // 이 스피너 한 번으로 다른 탭들도 준비된다.
          const warmed = await warmTeamSlices(teamPayload);
          fmMatches = warmed && warmed.fixtures;
        }
        if(fmMatches && fmMatches.length){
          await refreshLiveFromDetails(fmMatches);
          return res.json({
            matches:  fmMatches,
            finished: fmMatches.filter(m => m.status === 'FINISHED'),
            upcoming: fmMatches.filter(m => m.status !== 'FINISHED'),
            seasonsFetched: seasonsToFetch,
            source: 'fotmob',
          });
        }
      } catch(_){ /* ESPN 폴백으로 진행 */ }

      const fetchSlug = async ({slug, name, short}) => {
        try {
          // 현재 시즌 + 직전 시즌을 함께 조회 — 시즌 경계(8월 1일) 직후 새 시즌
          // 경기가 아직 없을 때 "최근 결과"가 텅 비지 않고 직전 시즌 결과가
          // 자연스럽게 이어지도록 함(프론트는 날짜 역순으로만 표시하므로 안전)
          const schedResults = await Promise.all(seasonsToFetch.map(sy =>
            fetch(
              `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/teams/${ARSENAL_ESPN_ID}/schedule?season=${sy}`,
              {signal: AbortSignal.timeout(8000)}
            ).then(r => r.ok ? r.json() : {events:[]}).catch(() => ({events:[]}))
          ));
          const past = schedResults
            .flatMap(sj => (sj.events||[]).map(e => parseEvent(e, name, short)))
            .filter(isArsenal);

          // ESPN 스코어보드는 2026-09 기준 날짜 "범위"(YYYYMMDD-YYYYMMDD) 요청을 400으로 막았다 —
          // 단일 날짜·월(YYYYMM)·연도만 받는다. 남은 시즌을 달 단위로 나눠 받는다(대회 하나치라
          // 한 달이 수백 KB 수준이고, 1000경기 상한에도 안 걸린다).
          const futureMonths = [];
          for(let d = new Date(now.getFullYear(), now.getMonth(), 1), last = new Date(seasonEndYear, 4, 1);
              d <= last && futureMonths.length < 12; d.setMonth(d.getMonth()+1)){
            futureMonths.push(`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}`);
          }
          const monthResults = await Promise.all(futureMonths.map(ym =>
            fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${ym}&limit=500`,
              {signal: AbortSignal.timeout(8000)}
            ).then(r => r.ok ? r.json() : {events:[]}).catch(() => ({events:[]}))
          ));
          const future = monthResults
            .flatMap(bj => (bj.events||[]).map(e => parseEvent(e, name, short)))
            .filter(isArsenal);

          return [...past, ...future];
        } catch(_){ return []; }
      };

      // 에미레이츠컵처럼 매년 이름이 바뀌는 단독 브랜드 프리시즌 대회는 ESPN이 별도 리그로 분류해
      // club.friendly 슬러그로도, 팀 일정으로도 안 잡힌다 — 예전엔 근시일 90일을 soccer/all
      // 스코어보드로 7일 단위로 훑어 채웠는데, ESPN이 날짜 범위 요청을 막으면서(2026-09 확인: 400)
      // 이 보강 조회는 쓸 수 없게 됐다. 월 단위로 바꿔도 soccer/all은 1000경기 상한에 걸려 잘리고
      // (실측: 2026-08 조회에 도르트문트 친선전 누락), 날짜별로 쪼개면 하루 1.4MB라 두 달이면 80MB다.
      // 지금은 이 경로 자체가 Fotmob(팀 API, 브랜드 친선전 포함)이 막혔을 때만 타는 폴백이라 삭제한다.
      const results = await Promise.all(SLUGS.map(fetchSlug));
      const seen = new Set();
      const allMatches = results.flat().filter(m => {
        if(seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });

      allMatches.sort((a,b) => new Date(a.utcDate) - new Date(b.utcDate));
      const finished = allMatches.filter(m => m.status === 'FINISHED');
      const upcoming = allMatches.filter(m => m.status !== 'FINISHED');

      return res.json({matches: allMatches, finished, upcoming, seasonsFetched: seasonsToFetch});

    } else if(type === 'results'){
      // 연도·월 브라우징용 — 특정 시즌 하나의 종료된 경기만 조회.
      // Fotmob(pageableFixtures)이 우선이고 ESPN은 폴백이다. 예전엔 이 경로만
      // ESPN이었는데, 그러면 과거 경기 ID가 ESPN 것이 되어 상세 조회가 Fotmob에
      // 못 붙고 ESPN 폴백으로 떨어졌다 — ESPN은 옛 경기의 팀 스탯을 전부 0으로
      // 주고 선수 평점은 아예 없어서 점유율·xG·평점이 통째로 비어 보였다.
      const requestedSeason = parseInt(req.query.season, 10);
      if(!requestedSeason) return res.status(400).json({error:'season 파라미터가 필요합니다'});
      const cacheKey = `results_${requestedSeason}`;
      const curSeasonYear = now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
      const isPastSeason = requestedSeason < curSeasonYear;
      // 끝난 시즌은 브라우저에도 영구 캐싱시킨다 — 두 번째 방문부터는 네트워크
      // 요청 자체가 안 나가서 스피너가 원천적으로 안 뜬다. 클라이언트도 이때는
      // 캐시버스터(_=timestamp)를 안 붙여야 실제로 히트한다.
      if(isPastSeason) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      if(!nocache){
        const hit = getCache(cacheKey);
        if(hit) return res.json(hit);
        if(isPastSeason){
          const kvHit = await kvGetJSON(`results:v3:${requestedSeason}`);
          if(kvHit){ setCache(cacheKey, kvHit); return res.json(kvHit); }
        }
      }

      // ── Fotmob 우선 ──
      try {
        const fmSeason = await fetchFotmobSeasonFixtures(requestedSeason);
        const fmFinished = (fmSeason || []).filter(m => m.status === 'FINISHED');
        await attachCupRounds(fmFinished, curSeasonYear);
        if(fmFinished.length){
          const payload = {matches: fmFinished, season: requestedSeason, source: 'fotmob'};
          setCache(cacheKey, payload);
          if(isPastSeason) await kvSetJSON(`results:v3:${requestedSeason}`, payload);
          return res.json(payload);
        }
      } catch(_){ /* ESPN 폴백으로 진행 */ }

      const fetchSeasonSlug = async ({slug, name, short}) => {
        try {
          const r = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/teams/${ARSENAL_ESPN_ID}/schedule?season=${requestedSeason}`,
            {signal: AbortSignal.timeout(8000)}
          );
          const j = r.ok ? await r.json() : {events:[]};
          return (j.events||[]).map(e => parseEvent(e, name, short)).filter(isArsenal);
        } catch(_){ return []; }
      };

      // 프리시즌 브랜드 친선전(에미레이츠컵 등) 보강 조회는 위 type==='fixtures'와 같은 이유로
      // 삭제했다 — ESPN이 날짜 범위 요청을 막았고 월 단위는 1000경기 상한에 걸려 잘린다.
      const seasonResults = await Promise.all(SLUGS.map(fetchSeasonSlug));
      const seenSeason = new Set();
      const seasonMatches = seasonResults.flat().filter(m => {
        if(m.status !== 'FINISHED') return false;
        if(seenSeason.has(m.id)) return false;
        seenSeason.add(m.id);
        return true;
      });
      seasonMatches.sort((a,b) => new Date(a.utcDate) - new Date(b.utcDate));

      const payload = {season: requestedSeason, matches: seasonMatches};
      // ESPN 쪽 일시적 장애/타임아웃으로 SLUGS 전부(또는 대부분) 실패하면
      // seasonMatches가 통째로 비어버리는데, 그걸 그대로 캐시해버리면 실제로는
      // 존재하는 시즌 데이터가 1시간(TTL) 동안 "경기 없음"으로 고정돼버린다.
      // 이미 끝난 시즌이 진짜로 0경기일 일은 사실상 없으므로, 빈 결과는
      // 캐시하지 않고 다음 요청 때 다시 시도하게 둔다.
      if(seasonMatches.length > 0){
        setCache(cacheKey, payload);
        // 끝난 시즌 결과는 두 번 다시 안 바뀌므로 만료 없이 영구 저장 —
        // 이후 누가 그 달을 열어도 ESPN을 아예 안 부른다. 시즌당 30KB 수준이라
        // 수십 시즌을 모아도 1MB가 안 된다.
        if(isPastSeason) await kvSetJSON(`results:v3:${requestedSeason}`, payload);
      }
      return res.json(payload);

    } else if(type === 'teamOfTheWeek'){
      // 선수 순위 우측 패널용 "이주의 팀" — Fotmob이 자체 계산해서 라운드별로
      // 발행하는 전용 API를 그대로 쓴다(에디토리얼 이미지가 아니라 선수
      // ID/평점/포메이션 좌표까지 다 나오는 진짜 구조화 데이터, 실측 확인함).
      const seasonEndYear = now.getMonth() + 1 <= 5 ? now.getFullYear() : now.getFullYear() + 1;
      const currentSeasonYear = now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
      const seasonStr = `${currentSeasonYear}/${seasonEndYear}`;

      const roundsCacheKey = `totwRounds_${seasonStr}`;
      let roundsData = nocache ? null : getCache(roundsCacheKey);
      if(!roundsData){
        const rr = await fetch(
          `https://www.fotmob.com/api/data/team-of-the-week/rounds?leagueId=47&season=${encodeURIComponent(seasonStr)}`,
          {headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(8000)}
        );
        if(!rr.ok) throw new Error(`Fotmob totw rounds: ${rr.status}`);
        roundsData = await rr.json();
        if((roundsData.rounds||[]).length) setCache(roundsCacheKey, roundsData);
      }
      const roundNums = (roundsData.rounds || []).map(r => parseInt(r.roundId, 10)).filter(n => !isNaN(n));
      const maxRound = roundNums.length ? Math.max(...roundNums) : 1;
      const minRound = roundNums.length ? Math.min(...roundNums) : 1;
      const defaultRound = parseInt(roundsData.last?.roundId, 10) || maxRound;
      const requestedRound = parseInt(req.query.round, 10) || defaultRound;

      const teamCacheKey = `totwTeam_${seasonStr}_${requestedRound}`;
      let players = nocache ? null : getCache(teamCacheKey);
      if(!players){
        const tr = await fetch(
          `https://www.fotmob.com/api/data/team-of-the-week/team?leagueId=47&roundId=${requestedRound}&season=${encodeURIComponent(seasonStr)}`,
          {headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(8000)}
        );
        if(!tr.ok) throw new Error(`Fotmob totw team: ${tr.status}`);
        const rawPlayers = await tr.json();
        players = (rawPlayers || []).map(p => ({
          id: p.id,
          name: p.name?.fullName || '',
          rating: p.rating?.num || null,
          isTop: !!(p.rating?.isTop?.isTopRating),
          teamId: p.teamId,
          photo: `https://images.fotmob.com/image_resources/playerimages/${p.id}.png`,
          teamCrest: p.teamId ? `https://images.fotmob.com/image_resources/logo/teamlogo/${p.teamId}.png` : null,
          // Fotmob 좌표계는 y가 클수록 위(공격 방향) — 골키퍼(y 최소)가
          // 화면 아래쪽에 오도록 프론트에서 bottom:y*100%로 그대로 쓴다.
          x: p.verticalLayout?.x ?? 0.5,
          y: p.verticalLayout?.y ?? 0.5,
        }));
        if(players.length) setCache(teamCacheKey, players);
      }
      return res.json({ round: requestedRound, maxRound, minRound, players });

    } else if(type === 'roundResults'){
      // 순위표 옆 "라운드별 EPL 전체 결과" 패널용 — Fotmob 리그 일정에서 시즌 전체를 받는다.
      // 원래는 ESPN 스코어보드를 시즌 전체 날짜 범위로 받아, 각 팀이 "몇 번째 치르는 PL 경기인지"
      // 순번을 세어 라운드를 매겼다(ESPN 원본엔 라운드 번호가 아예 없다). 2026-09 기준 ESPN이
      // 날짜 범위(YYYYMMDD-YYYYMMDD) 요청을 400으로 막으면서 이 패널이 통째로 안 떴고, Fotmob은
      // 경기마다 라운드 번호를 직접 주므로 순번 세기(연기/재편성 때 어긋날 수 있음)도 필요 없다.
      const roundCacheKey = 'roundResults_season';
      // 이 패널은 진행 중 스코어와 LIVE 배지를 그린다. 그런데 시즌 일정을 통째로
      // 받아 한 키에 담는 구조라 기본 TTL(1시간)을 그대로 쓰면 최대 한 시간 묵은
      // 스코어가 나간다(끝난 경기가 LIVE로 남아있기도 한다). 라이브가 섞인 응답만
      // 1분짜리로 두고, 없을 때는(대부분의 시간) 예전대로 1시간이다.
      const ROUND_TTL_LIVE = 60 * 1000;
      const roundHit = nocache ? null : cache[roundCacheKey];
      const roundTtl = roundHit && roundHit.data && roundHit.data.hasLive ? ROUND_TTL_LIVE : getTTL(roundCacheKey);
      let seasonData = roundHit && Date.now() - roundHit.ts < roundTtl ? roundHit.data : null;
      if(!seasonData){
        const fr = await fetch('https://www.fotmob.com/api/data/leagues?id=47',
          {headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(10000)});
        if(!fr.ok) throw new Error(`Fotmob league fixtures: ${fr.status}`);
        const fj = await fr.json();
        const fmCrest = id => id ? `https://images.fotmob.com/image_resources/logo/teamlogo/${id}.png` : null;
        const allSeasonMatches = ((fj.fixtures && fj.fixtures.allMatches) || []).map(m => {
          const st = m.status || {};
          const sc = String(st.scoreStr||'').match(/(\d+)\s*-\s*(\d+)/);
          return {
            id: m.id,
            utcDate: st.utcTime,
            status: st.cancelled ? 'CANCELED' : st.finished ? 'FINISHED' : st.started ? 'IN_PLAY' : 'TIMED',
            round: parseInt(m.round, 10) || 0,
            homeTeam: {id: m.home?.id, name: m.home?.shortName || m.home?.name, crest: fmCrest(m.home?.id)},
            awayTeam: {id: m.away?.id, name: m.away?.shortName || m.away?.name, crest: fmCrest(m.away?.id)},
            score: {fullTime: {home: sc ? +sc[1] : null, away: sc ? +sc[2] : null}},
          };
        })
          .filter(m => m.utcDate && m.round)
          .sort((a,b) => new Date(a.utcDate) - new Date(b.utcDate));
        let maxRound = 0, latestFinishedRound = 0, hasLive = false;
        for(const m of allSeasonMatches){
          if(m.round > maxRound) maxRound = m.round;
          if(m.status === 'FINISHED' && m.round > latestFinishedRound) latestFinishedRound = m.round;
          if(m.status === 'IN_PLAY') hasLive = true;
        }
        seasonData = {matches: allSeasonMatches, maxRound: maxRound || 38, latestFinishedRound: latestFinishedRound || 1, hasLive};
        if(allSeasonMatches.length > 0) setCache(roundCacheKey, seasonData);
      }
      // CDN도 같은 기준으로 줌인다 — 서버 TTL만 줄이면 앞에서 CDN이 5분짜리 응답을
      // 계속 나눠줘서 효과가 없다. stale-while-revalidate도 라이브일 땐 짧게 둔다.
      if(!nocache){
        const liveNow = !!seasonData.hasLive;
        res.setHeader('Cache-Control',
          `public, max-age=0, s-maxage=${liveNow ? 60 : 300}, stale-while-revalidate=${liveNow ? 30 : 600}`);
      }
      const requestedRound = parseInt(req.query.round, 10) || seasonData.latestFinishedRound;
      const roundMatches = seasonData.matches.filter(m => m.round === requestedRound);
      return res.json({
        round: requestedRound,
        maxRound: seasonData.maxRound,
        latestFinishedRound: seasonData.latestFinishedRound,
        matches: roundMatches,
      });

    } else if(type === 'team'){
      // 순위표에서 팀을 누르면 뜨는 간략 팀 정보 — Fotmob 팀 API 한 번이면 순위·폼·다음 경기·
      // 팀 스탯·주요 선수·우승 이력·홈구장·감독이 전부 들어있다. 원본이 800KB라 쓰는 필드만
      // 추려 내려준다(10KB 수준). 상대 팀 20개가 각각 캐시되므로 TTL은 짧게 두지 않아도 된다.
      const teamId = String(req.query.id || '').replace(/\D/g,'');
      if(!teamId) return res.status(400).json({error:'id 파라미터가 필요합니다'});
      const teamCacheKey = `teamInfo_${teamId}`;
      const cached = nocache ? null : getCache(teamCacheKey);
      if(cached) return res.json(cached);

      const tr = await fetch(`https://www.fotmob.com/api/data/teams?id=${teamId}`,
        {headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(10000)});
      if(!tr.ok) throw new Error(`Fotmob team: ${tr.status}`);
      const tj = await tr.json();
      const ov = tj.overview || {};
      const plTable = (tj.table || []).find(t => t?.data?.leagueId === PL_LEAGUE_ID);
      const tableRow = ((plTable?.data?.table?.all) || []).find(r => String(r.id) === teamId) || {};
      const [gf, ga] = String(tableRow.scoresStr || '').split('-').map(n => parseInt(n, 10) || 0);
      // 팀 스탯은 리그 전체 순위와 함께 오므로(participant.rank) 값과 순위를 같이 담는다
      const statOf = header => {
        const s = (tj.stats?.teams || []).find(x => x.header === header);
        const p = s?.participant;
        return p ? {value: p.stat?.value ?? null, rank: p.rank ?? null} : null;
      };
      const topOf = key => {
        const list = (ov.topPlayers?.[key]?.players) || [];
        const p = list.find(x => String(x.teamId) === teamId) || null;
        return p ? {id: p.id, name: p.name, value: p.value} : null;
      };
      const coach = ((tj.squad?.squad || []).find(g => /coach/i.test(g.title || ''))?.members || [])[0] || null;
      const nm = ov.nextMatch;
      const payload = {
        id: teamId,
        name: tj.details?.name || '',
        shortName: tj.details?.shortName || '',
        crest: `https://images.fotmob.com/image_resources/logo/teamlogo/${teamId}.png`,
        color: tj.history?.teamColors?.darkMode || null,
        // 팀 색 위에 얹을 글자색 — Fotmob이 팀 색과 짝으로 준다(밝은 팀 색이면 어두운 글자)
        fontColor: tj.history?.teamColors?.fontDarkMode || null,
        table: {
          position: tableRow.idx ?? null, points: tableRow.pts ?? null, played: tableRow.played ?? null,
          won: tableRow.wins ?? null, draw: tableRow.draws ?? null, lost: tableRow.losses ?? null,
          goalsFor: gf, goalsAgainst: ga, goalDifference: tableRow.goalConDiff ?? null,
        },
        form: (ov.teamForm || []).slice(-5).map(f => f.resultString || ''),
        nextMatch: nm ? {
          opponent: nm.opponent?.name || '', opponentId: nm.opponent?.id || null,
          competition: nm.tournament?.name || '', utcDate: nm.status?.utcTime || null,
          home: String(nm.home?.id) === teamId,
        } : null,
        venue: ov.venue ? {
          name: ov.venue.widget?.name || '', city: ov.venue.widget?.city || '',
          capacity: (ov.venue.statPairs || []).find(p => p[0] === 'Capacity')?.[1] ?? null,
        } : null,
        coach: coach ? {id: coach.id, name: coach.name, age: coach.age ?? null, country: coach.cname || ''} : null,
        stats: {
          goalsPerMatch: statOf('Goals per match'), concededPerMatch: statOf('Goals conceded per match'),
          possession: statOf('Average possession'), cleanSheets: statOf('Clean sheets'),
          xg: statOf('Expected goals'), bigChances: statOf('Big chances'),
        },
        topPlayers: {rating: topOf('byRating'), goals: topOf('byGoals'), assists: topOf('byAssists')},
        // 선수단 — 같은 응답에 이미 들어있어 추가 호출이 없다. 이름·등번호·나이·국적·포지션만 추린다
        // (골/도움 등 기록은 이 모달에서 안 쓴다).
        squad: ((tj.squad?.squad) || [])
          .filter(g => !/coach/i.test(g.title || ''))
          .map(g => ({
            group: /keeper/i.test(g.title) ? 'GK' : /defend/i.test(g.title) ? 'DF' : /midfield/i.test(g.title) ? 'MF' : 'FW',
            players: (g.members || []).map(p => ({
              id: p.id, name: p.name, number: p.shirtNumber ?? null, age: p.age ?? null,
              country: p.cname || '', position: String(p.positionIdsDesc || '').split(',')[0] || '',
              injured: !!p.injury,
            })),
          }))
          .filter(g => g.players.length),
        trophies: ((tj.history?.trophyList) || [])
          .map(t => ({
            name: t.name?.[0] || '',
            won: parseInt(t.won?.[0], 10) || 0,
            // "2023/2024" 또는 "2023" 형태만 남긴다 — 클럽 월드컵처럼 "2023 Saudi Arabia"로 개최지가 붙어 온다
            lastSeason: (String(t.season_won?.[0] || '').split(',')[0].match(/\d{4}(?:\/\d{2,4})?/) || [''])[0],
          }))
          .filter(t => t.won > 0)
          .sort((a,b) => b.won - a.won)
          .slice(0, 8),
      };
      setCache(teamCacheKey, payload);
      return res.json(payload);

    } else if(type === 'standings'){
      // football-data.org 대신 ESPN 순위 엔드포인트를 쓴다 — 팀별 note 필드에
      // 유럽대항전 진출권/강등권 설명이 이미 계산되어 내려오므로(예:
      // "Champions League"), 우리 쪽에서 시즌마다 순위 구간을 하드코딩하지
      // 않아도 된다. 다만 ESPN이 주는 색상(챔스 #81D6AC vs 유로파 #B5E7CE)은
      // 둘 다 같은 계열의 초록이라 구분이 잘 안 되므로, 어떤 진출권인지
      // 자체는 ESPN 판단을 그대로 믿되 실제 표시 색은 우리 팔레트로 대체한다.
      const zoneColorFor = (description) => {
        if(!description) return null;
        if(/champions/i.test(description)) return '#22C55E'; // 앱 전역 승리색과 동일
        if(/europa/i.test(description)) return '#3B82F6';
        if(/conference/i.test(description)) return '#F59E0B';
        if(/relegation/i.test(description)) return '#EF4444'; // 앱 전역 패배색과 동일
        return null;
      };
      // ── Fotmob 우선 ──
      // 순위표는 일정과 같은 팀 API 응답(table)에 들어있어서 추가 호출이 없다.
      // 진출권/강등권 구간은 legend의 indices로 오므로 ESPN의 note 문자열 대신
      // 그걸 쓰되, 표시 색은 기존처럼 우리 팔레트로 통일한다.
      try {
        let fmStandings = nocache ? null : await kvGetJSON(`standings:${PL_LEAGUE_ID}`);
        if(!fmStandings){
          const teamPayload = await fetchTeamPayload();
          fmStandings = mapFotmobStandings(teamPayload);
          // 같은 응답에 들어있는 일정·선수단 조각도 같이 채워둔다
          await warmTeamSlices(teamPayload);
        }
        if(fmStandings && fmStandings.length){
          result = {
            season: fmStandings.reduce((mx, s) => Math.max(mx, s.playedGames || 0), 0),
            standings: fmStandings,
            source: 'fotmob',
          };
          if(!nocache) setCache(cacheKey, result);
          return res.json(result);
        }
      } catch(_){ /* ESPN 폴백으로 진행 */ }

      const r = await fetch('https://site.api.espn.com/apis/v2/sports/soccer/eng.1/standings', {signal:AbortSignal.timeout(8000)});
      if(!r.ok) throw new Error(`ESPN standings: ${r.status}`);
      const json = await r.json();
      const entries = json.children?.[0]?.standings?.entries || [];
      const statVal = (stats, name) => stats?.find(s => s.name === name)?.value ?? 0;
      const maxGamesPlayed = entries.reduce((max, e) => Math.max(max, statVal(e.stats, 'gamesPlayed')), 0);
      result = {
        season: maxGamesPlayed,
        standings: entries.map(e => ({
          position: statVal(e.stats, 'rank'),
          team: {id:e.team?.id, name:e.team?.displayName||'', shortName:e.team?.shortDisplayName||'', crest:e.team?.logos?.[0]?.href||''},
          playedGames: statVal(e.stats,'gamesPlayed'), won: statVal(e.stats,'wins'), draw: statVal(e.stats,'ties'), lost: statVal(e.stats,'losses'),
          points: statVal(e.stats,'points'), goalsFor: statVal(e.stats,'pointsFor'), goalsAgainst: statVal(e.stats,'pointsAgainst'),
          goalDifference: statVal(e.stats,'pointDifferential'), isArsenal: e.team?.id===ARSENAL_ESPN_ID,
          // 인식 못한 라벨이 나오면(향후 신설 대회 등) ESPN 원본색으로 폴백 —
          // ESPN이 가끔 "##RRGGBB"처럼 #을 중복으로 내려주는 경우가 있어 정리한다
          zoneColor: zoneColorFor(e.note?.description) || (e.note?.color ? '#'+e.note.color.replace(/^#+/,'') : null),
          zoneLabel: e.note?.description || null,
        })).sort((a,b)=>a.position-b.position)
      };

    } else if(type === 'leaders'){
      // EPL 전체 선수 득점/어시스트/클린시트 순위 — Fotmob 공식 리그 통계(topstats) 사용.
      // FPL bootstrap-static의 assists 필드는 공식 기록과 크게 어긋나서(예: 사카 10 vs 실제 5)
      // 대신 Fotmob이 자기 사이트에서 쓰는 stats/{leagueId}/season/{tournamentId}/{stat}.json을 그대로 가져온다.
      try {
        const pageRes = await fetch(
          'https://www.fotmob.com/leagues/47/stats/premier-league/players/goals',
          {headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(10000)}
        );
        if(!pageRes.ok) throw new Error(`Fotmob 페이지: ${pageRes.status}`);
        const html = await pageRes.text();
        const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
        if(!m) throw new Error('__NEXT_DATA__ 없음');
        const pageData = JSON.parse(m[1]);
        const seasonLinks = pageData?.props?.pageProps?.stats?.seasonStatLinks || [];
        if(!seasonLinks.length) throw new Error('시즌 목록 없음');

        const fetchStatList = async (tournamentId, statName) => {
          try {
            const r = await fetch(
              `https://data.fotmob.com/stats/47/season/${tournamentId}/${statName}.json`,
              {headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(10000)}
            );
            if(!r.ok) return null;
            const j = await r.json();
            return j?.TopLists?.[0]?.StatList || null;
          } catch(_){ return null; }
        };

        const mapRow = (row, decimals, useSubStat) => ({
          id:        row.ParticiantId,
          name:      row.ParticipantName,
          fullName:  row.ParticipantName,
          team: {
            name:      row.TeamName,
            shortName: row.TeamName,
            id:        row.TeamId,
            crest:     `https://images.fotmob.com/image_resources/logo/teamlogo/${row.TeamId}.png`,
          },
          photo:     `https://images.fotmob.com/image_resources/playerimages/${row.ParticiantId}.png`,
          position:  (row.Positions||[]).includes(11) ? 'GK' : '',
          isArsenal: row.TeamId === ARSENAL_TEAM_ID,
          value:     useSubStat
                       ? (decimals ? Number(row.SubStatValue).toFixed(decimals) : Math.round(row.SubStatValue))
                       : (decimals ? Number(row.StatValue).toFixed(decimals) : row.StatValue),
        });

        // 새 시즌이 아직 시작 전이면 해당 시즌 통계 파일이 비어있으므로,
        // 데이터가 있는 첫 시즌(보통 직전 시즌)까지 순서대로 내려간다.
        // useSubStat: Fotmob이 기본 제공하는 정렬은 "90분당 평균"(StatValue) 기준인데,
        // 선방처럼 SubStatValue가 실제 누적 총계인 스탯은 화면에도 누적 총계를
        // 보여줘야 하므로 정렬 자체를 SubStatValue 기준으로 다시 한다 — 안 그러면
        // "평균은 높지만 총량은 적은 선수"가 누적 순위 1위처럼 보이는 모순이 생긴다.
        const getTopN = async (statName, n, decimals, useSubStat) => {
          for(const link of seasonLinks){
            const list = await fetchStatList(link.TournamentId, statName);
            if(list && list.length){
              const sorted = useSubStat ? [...list].sort((a,b) => (b.SubStatValue||0) - (a.SubStatValue||0)) : list;
              return sorted.slice(0, n).map(row => mapRow(row, decimals, useSubStat));
            }
          }
          return [];
        };

        const [goals, assists, cleanSheets, rating, xg, shots, shotConv, saves, saveRate, cards] = await Promise.all([
          getTopN('goals', 10),
          getTopN('goal_assist', 10),
          getTopN('clean_sheet', 10),
          getTopN('rating', 10, 2),
          getTopN('expected_goals', 10, 1),
          getTopN('total_scoring_att', 10, 1),
          getTopN('total_scoring_att', 10, 1, true),
          getTopN('saves', 10, 0, true),
          getTopN('_save_percentage', 10, 1),
          getTopN('yellow_card', 10),
        ]);

        result = { goals, assists, cleanSheets, rating, xg, shots, shotConv, saves, saveRate, cards };

        // 팀 색 채우기 — 순위 행을 눌러 여는 선수 상세모달이 헤더/탭을 팀 색으로 칠하는데,
        // 선수 응답(playerDetail)에도 색이 있지만 그건 몇백 ms 뒤에 와서 처음엔 색 없이 뜬다.
        // 여기서 미리 실어 보내면 모달이 열리는 순간부터 팀 색이 적용된다.
        // Fotmob 순위 API엔 색이 없어서 팀 API로 받아야 하는데, 팀 색은 거의 안 바뀌므로
        // id→색 맵을 KV에 30일 캐시해두고 빠진 팀만 채운다(보통 0건, 새 팀이 올라오면 몇 건).
        try {
          const ids = [...new Set(Object.values(result).flat().map(p => p && p.team && p.team.id).filter(Boolean))];
          const colorMap = (await kvGetJSON('teamColors')) || {};
          const missing = ids.filter(id => !colorMap[id]);
          if(missing.length){
            await Promise.all(missing.map(async id => {
              try {
                const r = await fetch(`https://www.fotmob.com/api/data/teams?id=${id}`,
                  {headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(8000)});
                if(!r.ok) return;
                const j = await r.json();
                // 색은 overview.teamColors.lightMode에 있다(팀 상세모달 type=team이 쓰는 값과 동일)
                const c = j?.overview?.teamColors?.lightMode || j?.overview?.teamColors?.darkMode;
                if(c) colorMap[id] = c;
              } catch(_){}
            }));
            await kvSetJSON('teamColors', colorMap, 30 * 24 * 60 * 60);
          }
          Object.values(result).flat().forEach(p => {
            if(p && p.team && colorMap[p.team.id]) p.team.color = colorMap[p.team.id];
          });
        } catch(_){ /* 색은 있으면 좋은 값 — 실패해도 순위 자체엔 영향 없다 */ }
      } catch(err) {
        const stale = getStale('leaders');
        if(stale) return res.json(stale);
        throw err;
      }

    } else if(type === 'injuries'){
      // team 파라미터(ESPN 팀명, 예: "Coventry")가 오면 아스날 대신 그 팀의
      // FPL 부상 데이터를 찾는다 — 상대가 프리미어리그 소속이 아니면(챔피언십
      // 이하, 유럽 클럽 등) FPL에 해당 팀이 없어서 빈 목록을 돌려준다.
      let targetFplId = ARSENAL_FPL_ID;
      let isOpponentTeam = false;
      if(teamParam){
        isOpponentTeam = true;
        targetFplId = null; // 아래서 fplData.teams 조회 후 채움
      }

      // 현재 스쿼드 이름 목록 확보 — 아스날 조회일 때만 의미 있다(스쿼드에
      // 있는 선수인지 교차검증하는 용도). 상대팀은 이 스쿼드 데이터가 없으니
      // 필터를 건너뛴다. 1군은 players.json에 더 이상 없으므로(라이브 로스터로
      // 이관) 별도로 Fotmob 팀 API 조회 결과도 합쳐야 한다 — 안 그러면 1군
      // 부상자가 전부 "스쿼드에 없는 선수"로 걸러져 사라진다.
      let squadNames = new Set();
      if(!isOpponentTeam){
        const addName = name => {
          squadNames.add(name.toLowerCase());
          const parts = name.split(' ');
          if(parts.length > 1) squadNames.add(parts[parts.length-1].toLowerCase());
        };
        try {
          const [liveFirstTeam, pjRes] = await Promise.all([
            fetchFirstTeamRosterLive().catch(() => []),
            fetch(selfOrigin(req) + '/data/players.json', {signal: AbortSignal.timeout(8000)}),
          ]);
          liveFirstTeam.forEach(p => addName(p.name));
          if(pjRes.ok) {
            const pjData = await pjRes.json();
            (pjData.players || []).forEach(p => addName(p.name));
          }
        } catch(_){}
      }

      // FPL API에서 부상 선수 데이터
      let fplData;
      try {
        const fplRes = await fetch(FPL_URL, {headers: FPL_HEADERS, signal: AbortSignal.timeout(10000)});
        if(!fplRes.ok) throw new Error(`FPL API: ${fplRes.status}`);
        const fplText = await fplRes.text();
        if(!fplText || fplText.trim() === '') throw new Error('FPL 응답 빈 값');
        fplData = JSON.parse(fplText);
      } catch(fplErr) {
        // stale 캐시 fallback
        const stale = getStale(cacheKey);
        if(stale) return res.json(stale);
        throw fplErr;
      }

      if(isOpponentTeam){
        const needle = teamParam.toLowerCase();
        const match = (fplData.teams || []).find(t =>
          t.name.toLowerCase().includes(needle) || needle.includes(t.name.toLowerCase()) ||
          t.short_name.toLowerCase() === needle
        );
        targetFplId = match ? match.id : null;
      }

      if(targetFplId === null){
        // 프리미어리그 소속이 아닌 상대 — FPL에 데이터 자체가 없어 Fotmob으로 폴백
        const fotmobInjured = isOpponentTeam ? await fetchFotmobTeamInjuries(teamParam) : null;
        result = fotmobInjured
          ? { injured: fotmobInjured, availableCount: 0, teamFound: true, source: 'fotmob' }
          : { injured: [], availableCount: 0, teamFound: false };
      } else {
        const teamPlayers = (fplData.elements || []).filter(p => p.team === targetFplId);
        const squadFilter = (p) => {
            if(squadNames.size === 0) return true;
            const webName = p.web_name.toLowerCase();
            const lastName = p.second_name.split(' ').pop().toLowerCase();
            const fullName = `${p.first_name} ${p.second_name}`.toLowerCase();
            return squadNames.has(webName) || squadNames.has(lastName) || squadNames.has(fullName);
        };
        const squadPlayers = isOpponentTeam ? teamPlayers : teamPlayers.filter(squadFilter);
        const availableCount = squadPlayers.filter(p => p.chance_of_playing_next_round === null || p.chance_of_playing_next_round === 100).length;
        const injured = squadPlayers
          .filter(p => p.chance_of_playing_next_round !== null && p.chance_of_playing_next_round < 100)
          .filter(p => !LOAN_KEYWORDS.test(p.news || ''))
          .map(p => ({
            id:       p.id,
            name:     p.web_name,
            fullName: `${p.first_name} ${p.second_name}`,
            position: FPL_POS[p.element_type] || '',
            photo:    `https://resources.premierleague.com/premierleague/photos/players/250x250/p${p.code}.png`,
            status:   p.status === 'i' ? 'i' : p.status === 'd' ? 'd' : p.status === 's' ? 's' : 'u',
            news:     p.news || '',
            chance:   p.chance_of_playing_next_round,
          }));
        result = { injured, availableCount, teamFound: true };
      }

    } else if(type === 'squad'){
      // 1군은 스크래퍼 없이 Fotmob 팀 API로 실시간 조회(KV 6시간 캐시) —
      // 아카데미(U21/U18)는 아직 이 방식으로 못 옮겨서(Fotmob이 U18 스쿼드
      // 자체를 이 API로 안 줌) players.json 정적 스냅샷을 그대로 쓴다.
      // players.json 실패해도 1군 자체는 떠야 하므로 별도로 감싼다.
      // liveFirstTeam(KV 조회, 미스면 Fotmob까지)과 players.json fetch는
      // 서로 의존관계가 없는데 순서대로 await하면 시간이 그냥 더해져서
      // 느려진다 — 동시에 시작해서 병렬로 기다린다.
      const liveFirstTeamPromise = fetchFirstTeamRosterLive().catch(() => []); // 실패하면 아래 academy만이라도 노출
      const pjPromise = fetch(selfOrigin(req) + '/data/players.json', {signal: AbortSignal.timeout(8000)})
        .then(r => { if(!r.ok) throw new Error('players.json 로드 실패'); return r.json(); });
      const [liveFirstTeam, pjData] = await Promise.all([liveFirstTeamPromise, pjPromise]);
      const academyOnly = (pjData.players || []).filter(p => {
        const levels = p.squadLevels || [p.squadLevel || 'first'];
        return levels.indexOf('academy') !== -1 && levels.indexOf('first') === -1;
      });
      // 예전에 누군가(1군이든 아카데미든) 선수 상세를 열어봐서 KV에 라이브
      // 데이터가 남아있으면, 목록 단계에서부터 그걸 얹어서 내려준다 —
      // 안 하면 상세모달을 열 때마다 "목록엔 빈 값 → 상세 fetch로 처음
      // 채움" 과정을 거치는 동안 화면이 텅 빈 채로 몇 초씩 떠 있는다.
      // MGET 하나로 몰아서 선수 수만큼 명령을 안 쓰게 한다.
      const liveById = await kvMGetPlayers(academyOnly.map(p => p.id).concat(liveFirstTeam.map(p => p.id)));
      const liveFirstTeamFilled = liveFirstTeam.map(p => {
        const live = liveById[p.id];
        if(!live) return p;
        return Object.assign({}, p, {
          competitions: (live.competitions && Object.keys(live.competitions).length) ? live.competitions : p.competitions,
          traits: live.traits || p.traits,
          shotmap: (live.shotmap && live.shotmap.length) ? live.shotmap : p.shotmap,
          heatmap: (live.heatmap && live.heatmap.length) ? live.heatmap : p.heatmap,
          career: (live.career && live.career.length) ? live.career : p.career,
          // 계약만료/주사용발은 Fotmob 팀 API(1군 라이브 목록)엔 아예 없는
          // 값이라, 예전에 상세모달을 한 번이라도 열어봐서 KV에 남아있는
          // 경우에만 목록 카드 뱃지에 채울 수 있다 — 안 그러면 계약만료
          // 임박 뱃지가 "한 번도 안 열어본 선수는 영영 안 뜨는" 상태가 된다.
          contractEnd: live.contractEnd || p.contractEnd,
          preferredFoot: live.preferredFoot || p.preferredFoot,
        });
      });

      result = {
        squad: liveFirstTeamFilled.concat(academyOnly.map(p => {
          const live = liveById[p.id];
          if(live){
            p = Object.assign({}, p, {
              competitions: (live.competitions && Object.keys(live.competitions).length) ? live.competitions : p.competitions,
              traits: live.traits || p.traits,
              shotmap: (live.shotmap && live.shotmap.length) ? live.shotmap : p.shotmap,
              heatmap: (live.heatmap && live.heatmap.length) ? live.heatmap : p.heatmap,
              career: (live.career && live.career.length) ? live.career : p.career,
              youthCareer: (live.youthCareer && live.youthCareer.length) ? live.youthCareer : p.youthCareer,
            });
            // 실제 소속(Arsenal U21/U18) — 스냅샷엔 "아카데미"만 있어서, 상세모달이 처음엔 "Arsenal FC"로
            // 그렸다가 상세 응답이 오면 "Arsenal U21"로 바뀌었다. 한 번이라도 열린 선수는 KV에 프로필이
            // 있으니 목록에 실어 보내 처음부터 맞게 그린다. 유스팀 이름일 때만(출전 대회·나이로는
            // U21/U18이 구분되지 않아 추정은 하지 않는다 — 실측으로 둘 다 PL2·UYL에 17~18세가 섞여 있다).
            const lt = live.profile && live.profile.team;
            if(lt && /^Arsenal U\d\d$/.test(String(lt.name || '').trim())) p = Object.assign({}, p, {team: lt});
          }
          return p;
        }).map(p => ({
          ...(p.team ? {team: p.team} : {}),
          id:          p.id,
          fotmobId:    p.id,
          squadLevel:  p.squadLevel || 'first',
          squadLevels: p.squadLevels || [p.squadLevel || 'first'],
          name:        p.name,
          fullName:    p.name,
          nationality: p.nationality || '',
          posGroup:    p.posGroup || 'MF',
          position:    p.position || '',
          positionLabel: p.positionLabel || '',
          jersey:      p.jersey || '',
          age:         p.age || null,
          height:      p.height || '',
          preferredFoot: p.preferredFoot || '',
          contractEnd: p.contractEnd || null,
          marketValue: p.marketValue || null,
          goals:       p.stats?.goals?.value || 0,
          assists:     p.stats?.assists?.value || 0,
          appearances: p.stats?.matches_uppercase?.value || 0,
          starts:      p.stats?.player_started_matches?.value || 0,
          minutes:     p.stats?.minutes_played?.value || 0,
          yellowCards: p.stats?.yellow_cards?.value || 0,
          redCards:    p.stats?.red_cards?.value || 0,
          rating:      p.stats?.rating?.value || null,
          photo:       p.fotmobPhoto || `https://images.fotmob.com/image_resources/playerimages/${p.id}.png`,
          stats:       p.stats || {},
          traits:      p.traits || null,
          shotmap:     p.shotmap || [],
          heatmap:     p.heatmap || [],
          competitions: p.competitions || {},
          career:      p.career || [],
          // 유스 경력 — 시즌별 소속 표기에 쓴다(1군 경력만 보면 시즌 중간의 1군 등록 때문에
          // 그 시즌 내내 1군이었던 것처럼 보인다).
          youthCareer: p.youthCareer || [],
          season:      p.season || '',
          // 임대 나간 선수만 값이 있다(스크래퍼가 Fotmob primaryTeam.onLoan으로 판정) —
          // 카드의 "임대" 뱃지와 상세모달 소속 표기에 쓴다.
          loan:        p.loan || null,
        })))
      };
    } else if(type === 'playerDetail'){
      // 선수 상세모달(기록/경력 탭)을 위한 대회별 스탯·shotmap·heatmap·
      // traits·career를 Fotmob에서 그때그때 라이브로 가져온다 —
      // scripts/scrape_fotmob_local.py가 만드는 players.json의 competitions/
      // shotmap/heatmap/traits/career와 동일한 모양으로 맞춰서, 프론트
      // 렌더링 코드(기록/경력 탭)는 손 안 대고 데이터 출처만 바꾼다.
      const playerId = req.query.id;
      if(!playerId) throw new Error('id 파라미터 필요');
      // season — 안 주면 이번 시즌. 지난 시즌들은 "YYYY/YYYY"(일부 리그는
      // "YYYY")로 직접 지정한다. 'prev'는 드롭다운이 두 칸이던 시절의 이름이라
      // 아직 그 화면을 띄워둔 브라우저를 위해 남겨둔다(= 직전 시즌).
      // 끝난 시즌은 값이 다시 안 바뀌니 KV에 한 번 저장해두면 Fotmob을 다시 안 부른다.
      const nowForSeason = new Date();
      const curSeasonStartYear = nowForSeason.getMonth() + 1 >= 8 ? nowForSeason.getFullYear() : nowForSeason.getFullYear() - 1;
      const currentSeasonName = `${curSeasonStartYear}/${curSeasonStartYear + 1}`;
      const prevSeasonName = `${curSeasonStartYear - 1}/${curSeasonStartYear}`;
      const seasonReq = String(req.query.season || '').trim();
      const requestedSeasonName = seasonReq === 'prev' ? prevSeasonName
        : (/^\d{4}(\/\d{4})?$/.test(seasonReq) ? seasonReq : '');
      const wantPrevSeason = !!requestedSeasonName && requestedSeasonName !== currentSeasonName;
      if(wantPrevSeason){
        const cached = await kvGetPlayerSeason(playerId, requestedSeasonName);
        // 저장 형식이 바뀌면(schemaV) 저장된 값을 버리고 다시 받아 같은 키에
        // 덮어쓴다 — 영구 저장이라 한 번 잘못 들어간 값이 스스로는 안 고쳐진다.
        // v2: GK 출전시간을 pd.mainLeague(항상 현재 시즌)로 보정하던 걸 그
        //     시즌 자신의 per90 역산(deriveMinutes)으로 바꿨다.
        // v3: 클럽 대회를 화이트리스트(PL/UCL/FA컵/리그컵)로 거르던 걸 풀고,
        //     시즌 목록(seasons)을 응답에 같이 담기 시작했다.
        // v4: 대회별 스탯을 한꺼번에 던져 일부가 조용히 빠진 채 저장된 값 무효화.
        // v5: seasons가 이름 배열에서 {name,senior,youth} 배열로 바뀌었다.
        if(cached && cached.schemaV === PLAYER_SEASON_SCHEMA) return res.json(cached);
      }
      // 이번 시즌도 마지막으로 받아둔 스냅샷(player:{id}, 7일 TTL)이 있으면
      // 그걸 먼저 즉시 돌려준다 — Fotmob playerData 왕복이 2초 넘게 걸려서,
      // 타팀 선수(정적 스냅샷이 없어 채울 값이 아예 없는 쪽)는 그 사이
      // 상세모달이 통째로 로딩 상태로 떠 있었다. 프론트는 cachedAt이
      // 오래됐을 때만 nocache=1로 한 번 더 불러 조용히 갱신한다.
      // changed*는 "직전에 보던 값과 달라졌는가"라 캐시본엔 의미가 없다 —
      // 그대로 내보내면 예전 판정이 되살아나 괜히 페이드된다.
      if(!wantPrevSeason && !nocache){
        const cachedLive = await kvGetJSON('player:' + playerId);
        if(cachedLive && cachedLive.competitions && cachedLive.schemaV === PLAYER_SEASON_SCHEMA){
          return res.json(Object.assign({}, cachedLive, {
            changedOther: false,
            changedTraits: false,
            fromCache: true,
          }));
        }
      }

      const pdRes = await fetch(`https://www.fotmob.com/api/data/playerData?id=${playerId}`, {headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(8000)});
      if(!pdRes.ok) throw new Error('Fotmob playerData 로드 실패');
      const pd = await pdRes.json();

      // Fotmob 대회명 → 우리 코드. 자주 나오는 대회만 짧은 코드로 고정하고
      // (프론트가 'EPL'·'카라바오' 같은 한글 라벨을 이 코드로 붙인다), 나머지는
      // 대회명을 그대로 코드로 쓴다 — 시즌 드롭다운이 5년치가 되면서 해외 리그
      // (라리가·분데스리가·에레디비시…)와 컵대회(코파델레이·DFB포칼·슈퍼컵)가
      // 그대로 나와야 하는데, 예전처럼 화이트리스트로 거르면 이적해 온 선수의
      // 옛 시즌이 통째로 빈 화면이 된다(실측: 1군 16명 최근 5시즌에 32개 대회).
      // 이름 뒤에 조별 그룹이 붙는 대회(EFL Trophy Southern Grp. F 등)는
      // 접두어로 묶어서 같은 코드로 모은다.
      const COMP_CODE_RULES = [
        [/^Premier League$/i, 'PL'],
        [/^Champions League/i, 'UCL'],
        [/^Europa League/i, 'UEL'],
        [/^(Europa )?Conference League/i, 'UECL'],
        [/^FA Cup$/i, 'FAC'],
        // "League Cup"은 포르투갈(타사 다 리가) 같은 다른 나라 리그컵이라 안 묶는다
        // — 묶으면 요케레스 24/25 스포르팅 기록이 '카라바오'로 나온다(실측).
        [/^EFL Cup$/i, 'EFL'],
        [/^Community Shield$/i, 'CS'],
        [/^(UEFA )?Super Cup$/i, 'USC'],
        [/^FIFA Club World Cup$/i, 'CWC'],
        [/^Premier League 2/i, 'PL2'],
        [/^Premier League U18/i, 'PL18'],
        [/^EFL Trophy/i, 'EFLT'],
        [/^National League Cup/i, 'NLC'],
        [/^UEFA Youth League/i, 'UYL'],
      ];
      // 국가대표 대회는 클럽 기록에 섞이면 안 되니 제외한다(사용자 지정).
      // "Club World Cup"은 이름에 World Cup이 들어가지만 클럽 대회고,
      // "Europa"는 \b 덕분에 \beuro\b에 안 걸린다.
      const isNationalComp = name => {
        const n = String(name || '');
        if(/club world cup/i.test(n)) return false;
        return /\bworld cup\b/i.test(n)
          || /\beuro\b/i.test(n)
          || /nations league/i.test(n)
          || /copa am[eé]rica/i.test(n)
          || /olympic/i.test(n)
          || /africa cup|afcon|asian cup|gold cup|confederations cup/i.test(n)
          || /friendlies/i.test(n)
          || /^UEFA U\d+ Championship/i.test(n);
      };
      const compCodeFor = name => {
        for(const [re, code] of COMP_CODE_RULES){ if(re.test(name)) return code; }
        return name;
      };
      // statSeasons[0]이 "이번 시즌"이라고 가정했었는데, 실측 결과 이번 시즌
      // 출전 기록이 아직 없는 선수(예: 백업 GK)는 Fotmob이 애초에 이번
      // 시즌 항목 자체를 안 만들어서 index 0이 여전히 "작년 시즌"이다 —
      // 그걸 그대로 "이번 시즌"으로 오인해 작년 스탯(경기수 등)을 그대로
      // 노출하는 버그가 있었다. seasonName("YYYY/YYYY")을 실제 "지금" 기준
      // 시즌과 비교해서 정확히 일치하는 것만 쓰고(8월부터 다음 시즌으로
      // 침 — 다른 곳의 currentSeasonYear 계산과 동일 기준), 없으면(이번
      // 시즌 기록이 아예 없는 선수) currentSeason을 비워서 이번 시즌
      // 데이터가 없는 상태 그대로(경기/평점 등 미노출) 내려보낸다 — 작년
      // 시즌으로 조용히 폴백하지 않는다.
      const expectedSeasonName = wantPrevSeason ? requestedSeasonName : currentSeasonName;
      const currentSeason = (pd.statSeasons || []).find(s => s.seasonName === expectedSeasonName);
      const compEntries = {}; // code -> {entryId, name}
      (currentSeason?.tournaments || []).forEach(t => {
        if(isNationalComp(t.name)) return;
        const code = compCodeFor(t.name);
        // 조별 그룹이 나뉘어 같은 코드로 접히는 경우(EFL Trophy)는 먼저 온 것만 쓴다.
        if(!compEntries[code]) compEntries[code] = {entryId: t.entryId, name: t.name};
      });
      // 시즌 드롭다운용 목록 — 이 선수가 클럽 경기를 뛴 시즌만, 최신순.
      // 시즌마다 1군 기록/유스 기록이 있는지를 같이 표시한다: 상세모달은 연 레벨에
      // 맞는 대회만 그리므로, 데뷔 전 유스 기록밖에 없는 시즌을 1군 화면의 드롭다운에
      // 그대로 올리면 골라도 빈 화면이 나온다(루이스-스켈리 23/24는 PL2만, 22/23은
      // U18만 있어 1군 기준으론 볼 게 없다). 어느 쪽이 유스인지는 프론트의
      // YOUTH_COMPS와 같은 기준이다 — 한쪽만 고치면 어긋나니 같이 고칠 것.
      const YOUTH_CODES = new Set(['PL2', 'PL18', 'EFLT', 'NLC', 'UYL']);
      const pastSeasons = (pd.statSeasons || []).map(s => {
        const codes = (s.tournaments || []).filter(t => !isNationalComp(t.name)).map(t => compCodeFor(t.name));
        return {
          name:   s.seasonName,
          senior: codes.some(c => !YOUTH_CODES.has(c)),
          youth:  codes.some(c =>  YOUTH_CODES.has(c)),
        };
      }).filter(s => s.senior || s.youth);
      // 기록이 있는 시즌만 최신순으로 내려준다(사용자 지정) — 예전엔 이번 시즌을 기록이 없어도
      // 항상 끼워 넣었는데, 단일 연도 리그(스웨덴 등)로 임대 간 선수는 그 칸이 영영 비어서
      // "26-27"만 덩그러니 남았다. 시즌 이름은 Fotmob 표기 그대로다("2026/2027" 또는 "2026").
      const seasonList = pastSeasons.slice(0, 8);   // 레벨로 거른 뒤 프론트가 5개로 자른다

      const codes = Object.keys(compEntries);
      // 대회 하나당 요청 하나다. 화이트리스트를 풀면서 한 시즌에 7개까지 나올 수
      // 있게 됐는데, 그걸 한꺼번에 던지면 Fotmob이 일부를 떨군다(실측: 홀란드
      // 22/23 7개 중 5개가 빈손으로 돌아와 PL·슈퍼컵만 남았다). 3개씩 끊어
      // 보내고 실패한 건 한 번 더 시도한다.
      const fetchCompStats = async entryId => {
        for(let attempt = 0; attempt < 2; attempt++){
          try {
            const r = await fetch(`https://www.fotmob.com/api/data/playerStats?playerId=${playerId}&seasonId=${entryId}&isFirstSeason=false`, {headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(8000)});
            if(r.ok) return await r.json();
          } catch(e){ /* 타임아웃/네트워크 — 아래에서 재시도 */ }
          if(attempt === 0) await new Promise(res => setTimeout(res, 400));
        }
        return null;
      };
      const statsResults = [];
      for(let i = 0; i < codes.length; i += 3){
        const part = await Promise.all(codes.slice(i, i + 3).map(code => fetchCompStats(compEntries[code].entryId)));
        statsResults.push(...part);
      }
      // 하나라도 못 받았으면 그 시즌은 KV에 저장하지 않는다 — 끝난 시즌은 영구
      // 저장이라, 반쪽짜리를 한 번 넣으면 그대로 굳어버린다.
      const statsComplete = codes.length > 0 && statsResults.every(Boolean);

      const numOf = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
      // Fotmob의 traits.value는 0~1 비율로 내려오는데(실측 확인), 프론트
      // 레이더 차트(drawFotmobRadar)와 players.json 스냅샷은 둘 다 0~100
      // 퍼센트 정수를 기대한다 — 여기서 안 맞춰주면 레이더가 거의 0으로
      // 찌그러져 보인다.
      const normalizeTraits = traits => {
        if(!traits || !traits.items) return traits;
        return Object.assign({}, traits, {
          items: traits.items.map(it => Object.assign({}, it, {value: Math.round((it.value||0) * 100)})),
        });
      };
      const findStat = (items, id) => { const f = (items||[]).find(i => i.localizedTitleId === id); return f ? f.statValue : undefined; };
      // GK는 topStatCard/statsSection에 minutes_played가 아예 없다(실측 확인).
      // 대신 statsSection의 모든 항목이 원값(statValue)과 90분당 값(per90)을
      // 같이 주므로, 출전시간 = statValue / per90 * 90 으로 역산할 수 있다
      // (실측: 라야 25/26 PL은 어느 항목으로 계산해도 3330분 = 37경기).
      // 비율 스탯(선방률 등)은 statValue와 per90이 같은 값이라 90분이 나와서
      // 빼고, 반올림 노이즈(소수 둘째 자리에서 잘린 xA 등)가 섞여도 흔들리지
      // 않게 중앙값을 쓴다.
      const deriveMinutes = statsJson => {
        const items = ((statsJson && statsJson.statsSection && statsJson.statsSection.items) || [])
          .flatMap(g => g.items || []);
        const cands = [];
        for(const it of items){
          const tid = it.localizedTitleId || '';
          if(/percent|accuracy|rate/i.test(tid)) continue;
          const v = parseFloat(it.statValue), per90 = parseFloat(it.per90);
          if(!(v > 0) || !(per90 > 0)) continue;
          cands.push(v / per90 * 90);
        }
        if(!cands.length) return 0;
        cands.sort((x, y) => x - y);
        const mid = Math.floor(cands.length / 2);
        const median = cands.length % 2 ? cands[mid] : (cands[mid - 1] + cands[mid]) / 2;
        return Math.round(median);
      };
      // Fotmob shotmap의 eventType/isBlocked/isOnTarget/isOwnGoal 조합을 우리
      // 프론트(SHOT_EVENT_LABEL 등)가 쓰는 event 문자열로 단순화한다.
      const toShotEvent = s => {
        if(s.isOwnGoal) return 'ownGoal';
        if(s.eventType === 'Goal') return 'goal';
        // isBlocked가 isOnTarget보다 먼저다 — 골대 방향이었지만 막힌 슛(예:
        // AttemptSaved + isBlocked=true + isOnTarget=true 조합)도 실측 결과
        // "블록"으로 분류돼야 한다(온타깃으로 잘못 분류되면 아래 endX/endY
        // 계산도 골라인이 아니라 블록 지점 기준이어야 하는데 어긋난다).
        if(s.isBlocked) return 'blocked';
        if(s.isOnTarget) return 'onTarget';
        return 'miss';
      };
      // 슈팅맵의 방향선(슛 지점 → 도착 지점)이 쓰는 좌표 — 막힌 슛은 실제로
      // 막힌 지점(blockedX/Y)에서, 나머지는 골라인(x=PITCH_LEN) 위 실제
      // 골대를 통과한 지점(goalCrossedY)에서 멈춘다(정적 스냅샷과 실측
      // 대조로 확인한 규칙).
      const shotEnd = s => s.isBlocked
        ? {endX: s.blockedX, endY: s.blockedY}
        : {endX: 105, endY: s.goalCrossedY};

      const competitions = {};
      const shotmap = [];
      const heatmap = [];

      codes.forEach((code, i) => {
        const s = statsResults[i];
        if(!s) return;
        const top = (s.topStatCard && s.topStatCard.items) || [];
        const rest = ((s.statsSection && s.statsSection.items) || []).flatMap(g => g.items || []);
        const combined = top.concat(rest);
        competitions[code] = {
          name: compEntries[code].name,
          appearances:  numOf(findStat(combined, 'matches_uppercase')),
          starts:       numOf(findStat(combined, 'player_started_matches')),
          goals:        numOf(findStat(combined, 'goals')),
          assists:      numOf(findStat(combined, 'assists')),
          yellowCards:  numOf(findStat(combined, 'yellow_cards')),
          redCards:     numOf(findStat(combined, 'red_cards')),
          minutesPlayed:numOf(findStat(combined, 'minutes_played')) || deriveMinutes(s),
          cleanSheets:  numOf(findStat(combined, 'clean_sheet_title')),
          goalsConceded:numOf(findStat(combined, 'goals_conceded')),
          avgRating:    numOf(findStat(combined, 'rating')) || undefined,
          // Fotmob 선수 페이지의 "Season performance" 프로그레스바 섹션과
          // 동일한 데이터 — 카테고리(Shooting/Passing/...)별로 스탯마다
          // 원값(statValue)/90분당(per90)과 그 각각의 동료 대비 백분위
          // (percentileRank/percentileRankPer90)를 그대로 들고 온다. 실측
          // 결과 statsSection.items가 이미 이 그룹 구조 그대로다.
          perfGroups: ((s.statsSection && s.statsSection.items) || []).map(g => ({
            title: g.title,
            items: (g.items || []).map(it => ({
              title: it.title,
              statValue: it.statValue,
              per90: it.per90,
              percentileRank: it.percentileRank,
              percentileRankPer90: it.percentileRankPer90,
              statFormat: it.statFormat,
            })),
          })),
        };
        (s.shotmap || []).forEach(sh => shotmap.push({
          comp: code,
          x: sh.x, y: sh.y, min: sh.min,
          shotType: sh.shotType, situation: sh.situation,
          event: toShotEvent(sh),
          ...shotEnd(sh),
          xg: sh.expectedGoals, xgot: sh.expectedGoalsOnTarget,
          match: {
            home: sh.homeTeamName, away: sh.awayTeamName,
            homeId: sh.homeTeamId, awayId: sh.awayTeamId,
            homeScore: sh.homeScore, awayScore: sh.awayScore,
            date: sh.matchDate,
          },
        }));
        ((s.heatmap && s.heatmap.coordinates) || []).forEach(pt => heatmap.push({comp: code, x: pt.x, y: pt.y}));
      });

      // (예전엔 GK 출전시간을 pd.mainLeague.stats로 보정했는데, 그 값은 언제나
      // "지금 진행 중인 시즌"이라 season=prev 조회에도 현재 시즌 값이 붙었다 —
      // 그렇게 만들어진 지난 시즌 기록이 KV에 영구 저장돼서 라야 25/26 PL이
      // "37경기 90분"으로 굳어 있었다. 지금은 위 deriveMinutes가 그 시즌 자신의
      // per90에서 역산하므로 시즌이 섞이지 않는다.)

      const career = (((pd.careerHistory || {}).careerItems || {}).senior || {}).teamEntries || [];
      // 유스 경력(U21/U19/U18) — 시즌별 소속 표기에 쓴다. 아카데미 선수는 1군 등록이 시즌 중간에
      // 잠깐 생기기도 해서, 1군 경력만 보면 그 시즌 내내 1군이었던 것처럼 보인다(실측: 오닐의
      // 25-26 시즌 — 실제로는 대부분 U21인데 "Arsenal"로 떴다).
      const youthCareer = (((pd.careerHistory || {}).careerItems || {}).youth || {}).teamEntries || [];

      // 계약만료/주사용발 — 1군 목록(mapLiveSquadMember)은 이 값을 안 주므로
      // (Fotmob 팀 API엔 없음) 여기서 playerData 응답(pd.playerInformation/
      // pd.contractEnd)에서 뽑아 채운다. 기존 스크래퍼(parse_stats)가 같은
      // 엔드포인트에서 뽑던 로직과 동일.
      let preferredFoot = '';
      (pd.playerInformation || []).forEach(info => {
        const title = (info.title || '').toLowerCase();
        if(title === 'preferred foot' || title === 'foot'){
          preferredFoot = (info.value && info.value.fallback) || '';
        }
      });
      const contractEndRaw = (pd.contractEnd || {}).utcTime || '';
      const contractEnd = contractEndRaw ? contractEndRaw.slice(0,10) : null;

      // 기본 프로필 — 아스날 선수는 players.json이 이름·나이·국적·등번호를 갖고 있어서
      // 여태 안 실어 보냈지만, 리더보드 선수 순위에서 여는 타팀 선수는 그 출처가 없다.
      // 같은 playerData 응답에 다 들어있으므로 추가 호출 없이 꺼내 쓴다.
      const infoOf = t => {
        const it = (pd.playerInformation || []).find(i => (i.title||'').toLowerCase() === t);
        const v = it && it.value;
        return v ? (v.fallback !== undefined ? v.fallback : v.key) : null;
      };
      const numFromInfo = t => { const v = infoOf(t); const n = parseInt(String(v||'').replace(/[^\d]/g,''), 10); return isNaN(n) ? null : n; };
      const pt = pd.primaryTeam || {};
      const profile = {
        name:        pd.name || '',
        age:         numFromInfo('age'),
        nationality: infoOf('country') || '',
        shirtNumber: numFromInfo('shirt'),
        heightCm:    numFromInfo('height'),
        marketValue: infoOf('market value') || '',
        position:    pd.positionDescription?.primaryPosition?.label || '',
        team: pt.teamId ? {
          id:    pt.teamId,
          name:  pt.teamName || '',
          crest: `https://images.fotmob.com/image_resources/logo/teamlogo/${pt.teamId}.png`,
          // 헤더 색을 여기서 같이 내려주면 팀 API를 따로 부를 필요가 없다.
          color: pt.teamColors?.color || null,
        } : null,
        isArsenal: pt.teamId === ARSENAL_TEAM_ID,
      };

      result = {
        id: Number(playerId),
        profile,
        // season — 이 응답이 어느 시즌 기록인지, seasons — 드롭다운에 올릴 최근 5시즌.
        season: expectedSeasonName,
        seasons: seasonList,
        preferredFoot,
        contractEnd,
        competitions,
        shotmap,
        heatmap,
        // pd.traits는 Fotmob playerData 응답의 최상위 필드라 시즌별로
        // 나뉘어 내려오지 않는다(statSeasons 밖) — 시즌 출전 기록 유무와
        // 무관하게 있는 그대로 노출한다(currentSeason으로 게이팅하지 않음).
        traits: normalizeTraits(pd.traits) || null,
        youthCareer: youthCareer.map(t => ({
          team: t.team, teamId: t.teamId || null,
          startDate: t.startDate, endDate: t.endDate, active: !!t.active,
        })),
        career: career.map(t => ({
          team: t.team,
          // 팀 로고 주소를 만들 수 있게 id도 같이 — 시즌을 바꾸면 헤더 엠블럼도 그 시즌 팀으로 바뀐다.
          teamId: t.teamId || null,
          startDate: t.startDate,
          endDate: t.endDate,
          active: !!t.active,
          // Fotmob transferType — on_loan(임대) / back_from_loan(임대 복귀) / null(완전 이적).
          // 둘 다 'loan'이 들어 있어서 문자열만 보면 복귀까지 임대로 잡힌다(실측: 카비아).
          // 스크래퍼(players.json)와 같은 필드명으로 맞춰서 화면이 한 코드로 그린다.
          transfer: (function(k){ return /back|return/.test(k) ? 'return' : (/loan/.test(k) ? 'loan' : null); })(
            String(((t.transferType || {}).localizationKey || (t.transferType || {}).text || '')).toLowerCase()),
          appearances: t.appearances,
          goals: t.goals,
          assists: t.assists,
        })),
      };
      // 클라이언트(브라우저 메모리)만 보고 "바뀌었는지" 판단하면 새로고침할
      // 때마다 기준이 초기화돼서 실제로 안 바뀐 값도 매번 바뀐 것처럼
      // 페이드된다 — 여기서 KV에 저장된 "마지막으로 본 값"과 직접 비교해서
      // 진짜 변경 여부를 서버가 판정해 내려준다. 이 판정 기준은 새로고침·
      // 다른 기기 접속과 무관하게 KV에 영구적으로 남는다.
      if(!wantPrevSeason){
        const prevResult = await kvGetJSON('player:' + playerId);
        // competitions.perfGroups의 percentileRank/percentileRankPer90은 이
        // 선수 본인 기록이 아니라 리그 전체 동료들 대비 순위라서, 이 선수가
        // 아무것도 안 해도 다른 경기 결과만으로 계속 흔들린다(traits와 같은
        // 사정 — 위 normalizeTraits 주석 참고). 이걸 그대로 비교에 포함하면
        // 한 번 스탯이 실제로 바뀌어 changedOther=true가 뜬 뒤로, 그때 저장된
        // KV 스냅샷의 percentileRank와 다음 요청의 percentileRank가 계속
        // 어긋나서 실제로는 안 바뀐 선수도 열 때마다 계속 페이드되는 버그가
        // 있었다. 비교용 사본에서는 이 두 필드만 제거하고, 실제 응답
        // (result.competitions)엔 그대로 남겨서 화면 표시는 안 바뀐다.
        const stripPercentiles = comps => {
          const out = {};
          for(const code of Object.keys(comps||{})){
            const c = comps[code];
            out[code] = Object.assign({}, c, {
              perfGroups: (c.perfGroups||[]).map(g => Object.assign({}, g, {
                items: (g.items||[]).map(it => {
                  const { percentileRank, percentileRankPer90, ...rest } = it;
                  return rest;
                }),
              })),
            });
          }
          return out;
        };
        const CHANGE_FIELDS = ['competitions', 'shotmap', 'heatmap', 'career'];
        result.changedOther = !prevResult || CHANGE_FIELDS.some(k => {
          if(k === 'competitions') return JSON.stringify(stripPercentiles(prevResult[k])) !== JSON.stringify(stripPercentiles(result[k]));
          return JSON.stringify(prevResult[k]) !== JSON.stringify(result[k]);
        });
        result.changedTraits = !prevResult || JSON.stringify(prevResult.traits) !== JSON.stringify(result.traits);
      }
      // KV에 저장 — 실패해도 이번 응답엔 영향 없게 await는 하되 에러는
      // kvSetPlayer(Player)Season 내부에서 이미 삼킨다. 직전 시즌(완결,
      // 안 바뀜)은 영구 저장, 이번 시즌(계속 바뀜)은 기존처럼 7일 TTL.
      if(wantPrevSeason){
        if(statsComplete){
          // 소속은 Fotmob 선수 응답(primaryTeam)으로 판정한다 — 타팀 선수는 5년 뒤 자동 만료.
          const isOurs = (pd.primaryTeam || {}).teamId === ARSENAL_TEAM_ID;
          result.schemaV = PLAYER_SEASON_SCHEMA;
          await kvSetPlayerSeason(playerId, requestedSeasonName, result, isOurs ? null : PLAYER_SEASON_TTL_OTHER);
        }
        // 지난 시즌 응답을 player:{id}(이번 시즌 자리)에 넣으면 안 된다 — 여긴 아무것도 안 한다.
      }
      else await kvSetPlayer(playerId, result);
    } else if(type === 'predict'){
      // 예정 경기 승부 예측 — 프론트(예정 경기 상세모달)가 두 팀의 Fotmob 팀
      // id와 그 경기 대회의 leagueId를 넘긴다. 리그 강도표(6시간)·팀 문맥(3시간)
      // 모두 KV 캐시라, 보통은 외부 호출 없이 KV만 읽고 끝난다.
      const homeId = req.query.home, awayId = req.query.away;
      if(!homeId || !awayId) throw new Error('home/away 파라미터 필요');
      const compLeagueId = Number(req.query.league) || PL_LEAGUE_ID;
      const [homeCtx, awayCtx] = await Promise.all([
        fetchTeamContext(homeId).catch(() => null),
        fetchTeamContext(awayId).catch(() => null),
      ]);
      // 대회 순위표 + 두 팀의 자국 리그 순위표(같은 리그면 한 번만 받는다).
      const leagueIds = [...new Set([
        compLeagueId,
        (homeCtx || {}).leagueId,
        (awayCtx || {}).leagueId,
      ].filter(Boolean))];
      const tables = {};
      (await Promise.all(leagueIds.map(id => fetchLeagueStrength(id).catch(() => null))))
        .forEach((t, i2) => { if(t) tables[leagueIds[i2]] = t; });

      // 킥오프 시각 — 휴식일·최근 2주 경기 수 계산에 쓴다(없으면 일정 변수 생략).
      const kickoffMs = req.query.date ? new Date(req.query.date).getTime() : null;
      result = predictMatch({
        compStrength: tables[compLeagueId] || null,
        homeId, awayId,
        homeDom: tables[(homeCtx || {}).leagueId] || null,
        awayDom: tables[(awayCtx || {}).leagueId] || null,
        homeCtx, awayCtx,
        kickoffMs: Number.isFinite(kickoffMs) ? kickoffMs : null,
      });
      if(result.available){
        result.analysis = predictNarrative(result);
        // 확률 막대를 팀색으로 칠하는 데 쓴다 — 실패해도 프론트가 기본색으로 그린다.
        try {
          const colors = await fetchTeamColorsByMode([homeId, awayId]);
          if(colors[String(homeId)]) result.home.colors = colors[String(homeId)];
          if(colors[String(awayId)]) result.away.colors = colors[String(awayId)];
        } catch(_){}
        // AI 해설은 크론(api/preview_ai.js)이 미리 만들어 KV에 넣어둔다 — 여기선 읽기만
        // 한다. 없으면 없는 대로 두고, 프론트가 위 analysis(템플릿 문장)를 그대로 쓴다.
        try {
          const aiText = await kvGetRaw(predictAiKey(result));
          // 표기 통일(아스널→아스날, 외데가르드→외데고르 등)은 번역과 같은 사전을 쓰고,
          // 저장할 때가 아니라 내보낼 때 적용한다 — 사전을 고치면 이미 만든 해설까지
          // 재생성 없이 바로 교정된다(번역 파이프라인과 같은 원칙).
          if(typeof aiText === 'string' && aiText.trim()) result.aiText = applyGlossary(aiText.trim());
        } catch(e){ /* 해설 없음은 정상 동작 */ }
      }
    } else if(type === 'transfers'){
      // 이적시장 IN/OUT 요약 — Fotmob 팀 API(이미 스쿼드 라이브 목록에 쓰는
      // 그 엔드포인트)의 transfers 필드를 그대로 재사용한다. 이 필드는
      // "이번 창"만이 아니라 최근 1년치 전체를 담고 있어서(다단계 임대/
      // 완전이적이 중복으로도 잡힘), 지금이 이적시장 기간인지부터 판정하고
      // 그 기간 안에 들어오는 것만 걸러낸다. 프리미어리그 이적시장은
      // 시즌마다 정확한 날짜가 조금씩 바뀌지만(FIFA 큰 틀만 있고 리그가
      // 매년 확정), 대략 여름(6월~9월 초)/겨울(1월~2월 초) 범위로만
      // 판정해도 실사용에는 충분하다.
      // 확정 이적(공식 API)과 루머(비공식 내부 엔드포인트)는 서로 의존관계가
      // 없으니 병렬로 받는다 — 루머 쪽이 실패해도(위 fetchFotmobRumours가
      // 이미 삼켜서 빈 배열 반환) 확정 이적은 그대로 응답된다.
      const [teamRes, rumoursRaw] = await Promise.all([
        fetch(`https://www.fotmob.com/api/data/teams?id=${FIRST_TEAM_ID}`, {headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(8000)}),
        fetchFotmobRumours(),
      ]);
      if(!teamRes.ok) throw new Error('Fotmob 팀 API 로드 실패');
      const teamData = await teamRes.json();
      const transfersRaw = (teamData.transfers && teamData.transfers.data) || {};
      const rawIn = transfersRaw['Players in'] || [];
      const rawOut = transfersRaw['Players out'] || [];

      const nowD = new Date();
      const wy = nowD.getUTCFullYear();
      const WINDOWS = [
        { label: `${wy} 여름 이적시장`, start: Date.UTC(wy, 4, 1), end: Date.UTC(wy, 8, 8, 23, 59, 59) },
        { label: `${wy} 겨울 이적시장`, start: Date.UTC(wy, 0, 1), end: Date.UTC(wy, 1, 8, 23, 59, 59) },
      ];
      const nowMs = nowD.getTime();
      const activeWindow = WINDOWS.find(w => nowMs >= w.start && nowMs <= w.end) || null;

      const mapEntry = p => ({
        name: p.name,
        playerId: p.playerId,
        position: (p.position && p.position.label) || '',
        photo: p.playerId ? `https://images.fotmob.com/image_resources/playerimages/${p.playerId}.png` : null,
        date: p.transferDate,
        fromClub: p.fromClubFullName || p.fromClub || '',
        fromCrest: p.fromClubId ? `https://images.fotmob.com/image_resources/logo/teamlogo/${p.fromClubId}.png` : null,
        toClub: p.toClubFullName || p.toClub || '',
        toCrest: p.toClubId ? `https://images.fotmob.com/image_resources/logo/teamlogo/${p.toClubId}.png` : null,
        onLoan: !!p.onLoan,
        feeValue: (p.fee && p.fee.value) || null,
        feeFree: !!(p.fee && p.fee.localizedFeeText === 'transfer_type_free_transfer'),
      });
      const inWindow = arr => !activeWindow ? [] : arr.filter(p => {
        const t = new Date(p.transferDate).getTime();
        return t >= activeWindow.start && t <= activeWindow.end;
      });

      // 루머는 확정 이적과 달리 날짜로 "이번 창"만 거르지 않는다 — 마감일이
      // 다가올수록 다음 창(겨울) 루머가 미리 도는 경우도 많아서, Fotmob이
      // 이 팀 페이지에 지금 올려둔 루머 목록을 그대로 보여주는 쪽이 실제
      // 관심사(지금 도는 소문이 뭐냐)에 더 맞는다.
      const PROB_KO = { High: '유력', Medium: '보통', Low: '낮음' };
      const mapRumour = p => ({
        name: p.name,
        playerId: p.playerId,
        position: (p.position && p.position.label) || '',
        photo: p.playerId ? `https://images.fotmob.com/image_resources/playerimages/${p.playerId}.png` : null,
        date: p.transferDate,
        fromClub: p.fromClubFullName || p.fromClub || '',
        fromCrest: p.fromClubId ? `https://images.fotmob.com/image_resources/logo/teamlogo/${p.fromClubId}.png` : null,
        toClub: p.toClubFullName || p.toClub || '',
        toCrest: p.toClubId ? `https://images.fotmob.com/image_resources/logo/teamlogo/${p.toClubId}.png` : null,
        feeValue: (p.fee && p.fee.value) || null,
        probability: PROB_KO[p.probability] || null,
        sourceName: p.sourceName || '',
        sourceUrl: p.sourceUrl || '',
      });
      const rumoursMapped = (rumoursRaw || []).map(mapRumour).sort((a, b) => new Date(b.date) - new Date(a.date));

      result = {
        window: activeWindow ? { label: activeWindow.label } : null,
        in: inWindow(rawIn).map(mapEntry).sort((a, b) => new Date(b.date) - new Date(a.date)),
        out: inWindow(rawOut).map(mapEntry).sort((a, b) => new Date(b.date) - new Date(a.date)),
        rumourIn: rumoursMapped.filter(p => p.toClub === 'Arsenal'),
        rumourOut: rumoursMapped.filter(p => p.fromClub === 'Arsenal'),
      };
    } else if(type === 'managerStats'){
      // History 탭의 감독 경기수(현재 감독 한정 — 과거 감독들은
      // managers.json에 손으로 채운 최종 games 값이 이미 있음)를 시즌별
      // 전체 경기 목록을 다 받아와서 클라이언트가 직접 세는 대신, Fotmob
      // 감독 페이지가 이미 집계해둔 coachStats를 그대로 가져다 쓴다 —
      // 시즌 수만큼 반복 호출하던 것이 API 호출 1번으로 줄어든다.
      const coachId = req.query.id;
      if(!coachId) throw new Error('id 파라미터 필요');
      const cRes = await fetch(`https://www.fotmob.com/api/data/playerData?id=${coachId}`, {headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(8000)});
      if(!cRes.ok) throw new Error('Fotmob playerData 로드 실패');
      const cData = await cRes.json();
      // 현재 재임 중인 팀 항목이 activeCareerEntry — 아스날 감독이 맡고
      // 있는 동안엔 이게 아스날 항목이다(재임 종료 시 null이 되고
      // historicalCareerEntries로 옮겨감 — 그 경우도 대비해 팀명으로 찾는다).
      const active = (cData.coachStats || {}).activeCareerEntry;
      const historical = ((cData.coachStats || {}).historicalCareerEntries || []);
      const entry = (active && active.teamName === 'Arsenal') ? active
        : historical.find(e => e.teamName === 'Arsenal') || active || null;
      if(!entry) throw new Error('아스날 감독 기록을 찾을 수 없음');
      const arsenalHist = historical.find(e => e.teamName === 'Arsenal');
      const pointsPerGame = arsenalHist ? arsenalHist.pointsPerGame
        : (entry.matches ? (entry.wins * 3 + entry.draws) / entry.matches : 0);
      // 선수 상세모달과 같은 형태(키/주사용 발/국가)로 보여주기 위한 필드 —
      // 감독 데이터엔 계약기간 같은 필드는 없지만(market value가 null),
      // playerInformation에 이 셋은 들어있다.
      const findInfo = title => (cData.playerInformation || []).find(i => i.title === title);
      const heightInfo = findInfo('Height');
      const footInfo = findInfo('Preferred foot');
      const countryInfo = findInfo('Country');
      result = {
        matches: entry.matches || 0,
        wins: entry.wins || 0,
        draws: entry.draws || 0,
        losses: entry.losses || 0,
        pointsPerGame: Math.round(pointsPerGame * 100) / 100,
        birthDate: cData.birthDate?.utcTime || null,
        height: heightInfo?.value?.fallback || null,
        preferredFoot: footInfo?.value?.fallback || null,
        country: countryInfo?.value?.fallback || null,
        countryCode: countryInfo?.countryCode || null,
        // 선수단 카드용 경력(모든 감독 재임 클럽) — 캐러티커/코치 겸직 등으로
        // 과거 감독 항목이 없는 경우(아르테타처럼)엔 아스날 한 줄만 나온다.
        career: historical.map(e => ({
          teamName: e.teamName,
          startDate: e.startDate?.utcTime || null,
          endDate: e.endDate?.utcTime || null,
          matches: e.matches || 0,
          wins: e.wins || 0,
          draws: e.draws || 0,
          losses: e.losses || 0,
        })),
      };
    }

    if(!nocache && !noMemCache) setCache(cacheKey, result);
    return res.json(result);

  } catch(err){
    // 에러 응답은 CDN에 보관되면 안 된다(위에서 public 헤더를 먼저 붙여 두었다).
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({error: err.message});
  }
}
