// api/football.js — Vercel Serverless Function
const FPL_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';
const ARSENAL_FPL_ID = 1;
const ARSENAL_TEAM_ID = 9825; // Fotmob 팀 ID
const FPL_POS = {1:'GK',2:'DF',3:'MF',4:'FW'};
const LOAN_KEYWORDS = /loan|loaned|joined|transferred|released|left the club/i;

// Fotmob 선수 ID 매핑 (사진: images.fotmob.com/image_resources/playerimages/{id}.png)
const FOTMOB_IDS = {
  'raya':          562727,
  'arrizabalaga':  317564,
  'meslier':       952029,
  'setford':       1243239,
  'saliba':        955406,
  'mosquera':      1298907,
  'white':         776151,
  'hincapie':      1137667,
  'gabriel':       795179,
  'timber':        942381,
  'konsa':         710159,
  'calafiori':     1105912,
  'skelly':        1406436,
  'degaard':       534670,
  'eze':           818975,
  'vieira':        1025462,
  'nwaneri':       1254234,
  'merino':        574645,
  'zubimendi':     1031325,
  'guimaraes':     850354,
  'rice':          654096,
  'dowman':        1635773,
  'saka':          961995,
  'jesus':         576165,
  'martinelli':    1021586,
  'gyokeres':      664500,
  'tzolis':        1157237,
  'madueke':       1084981,
  'nelson':        748382,
  'havertz':       749736,
};

function getFotmobId(p) {
  const web = p.web_name.toLowerCase().replace(/[^a-z]/g, '');
  const second = p.second_name.toLowerCase().replace(/[^a-z]/g, '');
  const full = (p.first_name + ' ' + p.second_name).toLowerCase().replace(/[^a-z ]/g, '');
  for (const [key, id] of Object.entries(FOTMOB_IDS)) {
    const k = key.replace(/[^a-z]/g, '');
    if (web.includes(k) || second.includes(k) || k.includes(second) || full.includes(k)) {
      return id;
    }
  }
  return null;
}

const cache = {};
const TTL = 60 * 60 * 1000;
// 리더보드는 경기 끝나고 스탯 반영을 더 빨리 보여주기 위해 캐시를 짧게 둔다
const TTL_OVERRIDES = { leaders: 10 * 60 * 1000 };
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
      body: JSON.stringify(['SET', `player:${id}`, JSON.stringify(data), 'EX', String(KV_TTL_SEC)]),
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
async function kvSetPlayerSeason(id, seasonName, data){
  if(!KV_URL || !KV_TOKEN) return;
  try {
    await fetch(KV_URL, {
      method: 'POST',
      headers: {Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json'},
      body: JSON.stringify(['SET', `playerSeason:${id}:${seasonName}`, JSON.stringify(data)]),
      signal: AbortSignal.timeout(5000),
    });
  } catch(e){ /* 캐시 저장 실패는 무시 */ }
}

// ── 1군 스쿼드 명단 — 스크래퍼(Playwright) 없이 Fotmob 팀 API로 실시간
// 조회. players.json처럼 사람이 로컬에서 스크립트를 돌려야 갱신되는
// 정적 스냅샷이 아니라, 매 요청마다(단 KV 캐시 유효 시간 내엔 캐시로)
// Fotmob이 그 시점에 들고 있는 실제 1군 명단을 그대로 반영한다 —
// 이적생이 Fotmob 팀 페이지에 올라오는 즉시 여기도 반영됨.
const KV_TTL_ROSTER_SEC = 6 * 60 * 60; // 6시간 — 매 요청마다 Fotmob을 때리지 않으면서도 꽤 최신을 유지
const FIRST_TEAM_ID = 9825;
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
async function kvSetJSON(key, data, ttlSec){
  if(!KV_URL || !KV_TOKEN) return;
  try {
    await fetch(KV_URL, {
      method: 'POST',
      headers: {Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json'},
      body: JSON.stringify(['SET', key, JSON.stringify(data), 'EX', String(ttlSec)]),
      signal: AbortSignal.timeout(5000),
    });
  } catch(e){ /* 캐시 저장 실패는 무시 */ }
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

async function fetchFirstTeamRosterLive(){
  const cached = await kvGetJSON('firstTeamRoster');
  if(cached) return cached;
  const r = await fetch(`https://www.fotmob.com/api/data/teams?id=${FIRST_TEAM_ID}`, {headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(8000)});
  if(!r.ok) throw new Error('Fotmob 팀 API 로드 실패');
  const data = await r.json();
  const groups = (data.squad && data.squad.squad) || [];
  const roster = groups
    .filter(g => g.title !== 'coach')
    .flatMap(g => g.members)
    .map(mapLiveSquadMember);
  await kvSetJSON('firstTeamRoster', roster, KV_TTL_ROSTER_SEC);
  return roster;
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
  const cacheKey = type + (teamParam ? ('_'+teamParam) : '') + (idParam ? ('_'+idParam) : '') + (seasonParam ? ('_'+seasonParam) : '');
  res.setHeader('Cache-Control', `public, max-age=${Math.floor(getTTL(type)/1000)}`);

  if(!nocache){
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
  const fmtDate = d => d.toISOString().slice(0,10).replace(/-/g,'');
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
  // soccer/all 검색은 전 세계 모든 "Arsenal" 이름 클럽(아르헨티나 Arsenal de Sarandí 등)까지
  // 걸러내므로, ID 일치만 인정하는 엄격한 필터를 별도로 사용
  const isArsenalStrict = m =>
    m.homeTeam?.id === ARSENAL_ESPN_ID || m.awayTeam?.id === ARSENAL_ESPN_ID;

  try {
    let result;

    if(type === 'fixtures'){
      // 시즌 종료(5월 31일)까지 조회 — 1~5월(시즌 중)이면 올해 5월,
      // 6~12월(오프시즌 또는 새 시즌 진행 중)이면 다음 해 5월
      const seasonEndYear = now.getMonth() + 1 <= 5 ? now.getFullYear() : now.getFullYear() + 1;
      const futureEnd = fmtDate(new Date(seasonEndYear, 4, 31));
      // ESPN team/schedule는 season 파라미터 없으면 자체 "현재 시즌" 포인터를 쓰는데,
      // 다음 시즌 일정이 아직 없는 오프시즌엔 그게 빈 시즌을 가리켜 직전 시즌 결과가 통째로 빠짐.
      // 8월 이전이면 작년 8월에 시작한 시즌이 아직 "현재/직전" 시즌이므로 명시적으로 지정.
      const currentSeasonYear = now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
      // 새 시즌 시작 직후(8월)엔 아직 경기가 없을 수 있어 직전 시즌도 함께 조회 —
      // 그 외 기간엔 currentSeasonYear 하나로 충분하므로 불필요한 조회를 피함.
      const seasonsToFetch = now.getMonth() === 7 ? [currentSeasonYear, currentSeasonYear - 1] : [currentSeasonYear];

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

          const todayStr = fmtDate(now);
          const br = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${todayStr}-${futureEnd}&limit=500`,
            {signal: AbortSignal.timeout(8000)}
          );
          const bj = br.ok ? await br.json() : {events:[]};
          const future = (bj.events||[]).map(e => parseEvent(e, name, short)).filter(isArsenal);

          return [...past, ...future];
        } catch(_){ return []; }
      };

      // 에미레이츠컵처럼 매년 이름이 바뀌는 단독 브랜드 프리시즌 대회는
      // club.friendly 슬러그로 조회되지 않음(ESPN이 별도 리그로 분류) —
      // 근시일 60일을 soccer/all 스코어보드로 7일 단위 보강 조회해서 채움
      const fetchAllRange = async (startStr, endStr) => {
        try {
          const r = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=${startStr}-${endStr}&limit=1000`,
            {signal: AbortSignal.timeout(8000)}
          );
          const j = r.ok ? await r.json() : {events:[]};
          return (j.events||[]).map(e => {
            const note = e.competitions?.[0]?.altGameNote;
            const name = note ? note.split(',')[0].trim() : 'Friendly';
            return parseEvent(e, name, 'FR');
          }).filter(isArsenalStrict);
        } catch(_){ return []; }
      };

      // 과거 30일(off=-30)부터 미래 59일까지 — 에미레이츠컵처럼 이미 끝난
      // 브랜드 프리시즌 친선전도 결과로 잡히도록 과거 방향도 함께 훑는다.
      // (예전엔 off=0부터라 어제 끝난 경기조차 누락되는 문제가 있었음)
      const nearWindowChunks = [];
      for(let off=-30; off<60; off+=7){
        const s = new Date(now); s.setDate(s.getDate()+off);
        const e = new Date(now); e.setDate(e.getDate()+Math.min(off+6,59));
        nearWindowChunks.push([fmtDate(s), fmtDate(e)]);
      }

      const [results, extraResults] = await Promise.all([
        Promise.all(SLUGS.map(fetchSlug)),
        Promise.all(nearWindowChunks.map(([s,e]) => fetchAllRange(s,e))),
      ]);
      const seen = new Set();
      const allMatches = [...results.flat(), ...extraResults.flat()].filter(m => {
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
      // 완결된 시즌 데이터는 절대 안 바뀌므로 기본 캐시(1시간)로 충분히 재사용됨.
      const requestedSeason = parseInt(req.query.season, 10);
      if(!requestedSeason) return res.status(400).json({error:'season 파라미터가 필요합니다'});
      const cacheKey = `results_${requestedSeason}`;
      if(!nocache){
        const hit = getCache(cacheKey);
        if(hit) return res.json(hit);
      }

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

      // 에미레이츠컵처럼 매년 이름이 바뀌는 브랜드 프리시즌 대회는 SLUGS로 안
      // 잡히므로(위 type==='fixtures'의 근시일 보강 조회와 동일한 이유), 여기서도
      // 놓치지 않도록 해당 시즌 프리시즌 기간(7~8월)만 soccer/all로 보강 조회한다.
      // 시즌 전체(365일)를 훑기엔 비용이 크고, 브랜드 친선전은 실제로 이 기간에만 열림.
      const fetchSeasonAllRange = async (startStr, endStr) => {
        try {
          const r = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=${startStr}-${endStr}&limit=1000`,
            {signal: AbortSignal.timeout(8000)}
          );
          const j = r.ok ? await r.json() : {events:[]};
          return (j.events||[]).map(e => {
            const note = e.competitions?.[0]?.altGameNote;
            const name = note ? note.split(',')[0].trim() : 'Friendly';
            return parseEvent(e, name, 'FR');
          }).filter(isArsenalStrict);
        } catch(_){ return []; }
      };
      const preseasonChunks = [];
      const preseasonStart = new Date(Date.UTC(requestedSeason, 6, 1)); // 7월 1일
      const preseasonEnd = new Date(Date.UTC(requestedSeason, 7, 31));  // 8월 31일
      for(let d = new Date(preseasonStart); d <= preseasonEnd; d.setUTCDate(d.getUTCDate()+7)){
        const chunkEnd = new Date(Math.min(new Date(d).setUTCDate(d.getUTCDate()+6), preseasonEnd.getTime()));
        preseasonChunks.push([fmtDate(d), fmtDate(chunkEnd)]);
      }

      const [seasonResults, preseasonResults] = await Promise.all([
        Promise.all(SLUGS.map(fetchSeasonSlug)),
        Promise.all(preseasonChunks.map(([s,e]) => fetchSeasonAllRange(s,e))),
      ]);
      const seenSeason = new Set();
      const seasonMatches = [...seasonResults.flat(), ...preseasonResults.flat()].filter(m => {
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
      if(seasonMatches.length > 0) setCache(cacheKey, payload);
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
      // 순위표 옆 "라운드별 EPL 전체 결과" 패널용 — ESPN 원본엔 라운드(매치위크)
      // 번호가 아예 없다. 처음엔 "아스날이 그 라운드에 뛴 날짜" 앞뒤 며칠을
      // 스코어보드로 훑는 방식이었는데, 박싱데이처럼 라운드 간격이 좁아지거나
      // UEFA 대항전 때문에 팀마다 다음 리그 경기가 서로 다른 주에 열리면
      // 날짜 창이 다른 라운드 경기를 같이 집어오거나 일부를 놓치는 문제가
      // 있었다 — 대신 시즌 전체 380경기를 한 번에 받아서, 각 팀이 "몇 번째
      // 치르는 PL 경기인지" 순번을 세어 라운드를 매긴다(아스날 자기 경기만
      // 세던 프론트의 assignPlRounds와 같은 원리를 20개 팀 전체에 적용) —
      // 날짜 간격과 무관하게 항상 정확하다.
      const roundCacheKey = 'roundResults_season';
      let seasonData = nocache ? null : getCache(roundCacheKey);
      if(!seasonData){
        const seasonEndYear = now.getMonth() + 1 <= 5 ? now.getFullYear() : now.getFullYear() + 1;
        const currentSeasonYear = now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
        const seasonStart = fmtDate(new Date(currentSeasonYear, 7, 1));
        const seasonEnd = fmtDate(new Date(seasonEndYear, 4, 31));
        const sr = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=${seasonStart}-${seasonEnd}&limit=500`,
          {signal: AbortSignal.timeout(10000)}
        );
        if(!sr.ok) throw new Error(`ESPN season scoreboard: ${sr.status}`);
        const sj = await sr.json();
        const allSeasonMatches = (sj.events||[])
          .map(e => parseEvent(e, 'Premier League', 'PL'))
          .sort((a,b) => new Date(a.utcDate) - new Date(b.utcDate));
        const teamCount = {};
        let maxRound = 0, latestFinishedRound = 0;
        for(const m of allSeasonMatches){
          const hId = m.homeTeam.id, aId = m.awayTeam.id;
          teamCount[hId] = (teamCount[hId]||0) + 1;
          teamCount[aId] = (teamCount[aId]||0) + 1;
          m.round = teamCount[hId];
          if(m.round > maxRound) maxRound = m.round;
          if(m.status === 'FINISHED' && m.round > latestFinishedRound) latestFinishedRound = m.round;
        }
        seasonData = {matches: allSeasonMatches, maxRound: maxRound || 38, latestFinishedRound: latestFinishedRound || 1};
        if(allSeasonMatches.length > 0) setCache(roundCacheKey, seasonData);
      }
      const requestedRound = parseInt(req.query.round, 10) || seasonData.latestFinishedRound;
      const roundMatches = seasonData.matches.filter(m => m.round === requestedRound);
      return res.json({
        round: requestedRound,
        maxRound: seasonData.maxRound,
        latestFinishedRound: seasonData.latestFinishedRound,
        matches: roundMatches,
      });

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
            fetch('https://arsenal-seven.vercel.app/data/players.json', {signal: AbortSignal.timeout(8000)}),
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
        // 프리미어리그 소속이 아닌 상대 — FPL에 데이터 자체가 없다
        result = { injured: [], availableCount: 0, teamFound: false };
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
      const pjPromise = fetch('https://arsenal-seven.vercel.app/data/players.json', {signal: AbortSignal.timeout(8000)})
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
            });
          }
          return p;
        }).map(p => ({
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
          season:      p.season || '',
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
      // season=prev — 직전 시즌(항상 완결된, 다시 안 바뀌는 데이터) 조회.
      // 값이 안 변하니 KV에 한 번 저장해두면 이후엔 Fotmob을 다시 안 부른다.
      const wantPrevSeason = req.query.season === 'prev';
      const nowForSeason = new Date();
      const curSeasonStartYear = nowForSeason.getMonth() + 1 >= 8 ? nowForSeason.getFullYear() : nowForSeason.getFullYear() - 1;
      const prevSeasonName = `${curSeasonStartYear - 1}/${curSeasonStartYear}`;
      if(wantPrevSeason){
        const cached = await kvGetPlayerSeason(playerId, prevSeasonName);
        if(cached) return res.json(cached);
      }

      const pdRes = await fetch(`https://www.fotmob.com/api/data/playerData?id=${playerId}`, {headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(8000)});
      if(!pdRes.ok) throw new Error('Fotmob playerData 로드 실패');
      const pd = await pdRes.json();

      // Fotmob 대회명 → 우리 코드(SENIOR_COMPS/YOUTH_COMPS) 매핑. 여기 없는
      // 대회(월드컵, 네이션스리그 등 국가대표 경기 등)는 그냥 무시한다.
      const COMP_NAME_TO_CODE = {
        'Premier League': 'PL',
        'Champions League': 'UCL',
        'FA Cup': 'FAC',
        'EFL Cup': 'EFL',
        'Premier League 2': 'PL2',
        'EFL Trophy': 'EFLT',
        'UEFA Youth League': 'UYL',
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
      const expectedSeasonName = wantPrevSeason ? prevSeasonName : `${curSeasonStartYear}/${curSeasonStartYear + 1}`;
      const currentSeason = (pd.statSeasons || []).find(s => s.seasonName === expectedSeasonName);
      const compEntries = {}; // code -> {entryId, name}
      (currentSeason?.tournaments || []).forEach(t => {
        const code = COMP_NAME_TO_CODE[t.name];
        if(code) compEntries[code] = {entryId: t.entryId, name: t.name};
      });

      const codes = Object.keys(compEntries);
      const statsResults = await Promise.all(codes.map(code =>
        fetch(`https://www.fotmob.com/api/data/playerStats?playerId=${playerId}&seasonId=${compEntries[code].entryId}&isFirstSeason=false`, {headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(8000)})
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      ));

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
          minutesPlayed:numOf(findStat(combined, 'minutes_played')),
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

      // GK는 topStatCard/statsSection에 minutes_played가 아예 없어서(실측 확인)
      // 0으로 잡힌다 — mainLeague.stats(현재 메인 리그 한정)엔 있으니 그걸로
      // 메인 리그 항목만 보정한다. 다른 대회는 이 API 응답 자체에 값이 없어
      // 그대로 '-' 로 보인다(프론트가 0/undefined를 '-'로 렌더링, 기존 동작).
      const mainLeagueCode = codes.find(c => compEntries[c].entryId.endsWith('-0'));
      if(mainLeagueCode && competitions[mainLeagueCode] && !competitions[mainLeagueCode].minutesPlayed){
        // mainLeague.stats는 topStatCard/statsSection과 다르게 값이
        // statValue가 아니라 value 필드에 들어있다.
        const mlStat = (pd.mainLeague?.stats || []).find(i => i.localizedTitleId === 'minutes_played');
        if(mlStat && mlStat.value) competitions[mainLeagueCode].minutesPlayed = numOf(mlStat.value);
      }

      const career = (((pd.careerHistory || {}).careerItems || {}).senior || {}).teamEntries || [];

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

      result = {
        id: Number(playerId),
        preferredFoot,
        contractEnd,
        competitions,
        shotmap,
        heatmap,
        // pd.traits는 Fotmob playerData 응답의 최상위 필드라 시즌별로
        // 나뉘어 내려오지 않는다(statSeasons 밖) — 시즌 출전 기록 유무와
        // 무관하게 있는 그대로 노출한다(currentSeason으로 게이팅하지 않음).
        traits: normalizeTraits(pd.traits) || null,
        career: career.map(t => ({
          team: t.team,
          startDate: t.startDate,
          endDate: t.endDate,
          active: !!t.active,
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
        const CHANGE_FIELDS = ['competitions', 'shotmap', 'heatmap', 'career'];
        result.changedOther = !prevResult || CHANGE_FIELDS.some(k => JSON.stringify(prevResult[k]) !== JSON.stringify(result[k]));
        result.changedTraits = !prevResult || JSON.stringify(prevResult.traits) !== JSON.stringify(result.traits);
      }
      // KV에 저장 — 실패해도 이번 응답엔 영향 없게 await는 하되 에러는
      // kvSetPlayer(Player)Season 내부에서 이미 삼킨다. 직전 시즌(완결,
      // 안 바뀜)은 영구 저장, 이번 시즌(계속 바뀜)은 기존처럼 7일 TTL.
      if(wantPrevSeason) await kvSetPlayerSeason(playerId, prevSeasonName, result);
      else await kvSetPlayer(playerId, result);
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

    if(!nocache) setCache(cacheKey, result);
    return res.json(result);

  } catch(err){
    return res.status(500).json({error: err.message});
  }
}
