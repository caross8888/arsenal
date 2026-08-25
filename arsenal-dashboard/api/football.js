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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');

  const type = req.query.type || 'fixtures';
  const nocache = req.query.nocache;
  // injuries는 team 파라미터로 아스날 외 다른 팀도 조회할 수 있어 캐시 키에
  // team을 같이 섞는다 — 안 그러면 아스날 조회 캐시를 상대팀 조회가 그대로
  // 돌려받거나 덮어써버린다.
  const teamParam = req.query.team || '';
  const cacheKey = type + (teamParam ? ('_'+teamParam) : '');
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

      // players.json로 현재 스쿼드 이름 목록 확보 — 아스날 조회일 때만 의미
      // 있다(스쿼드에 있는 선수인지 교차검증하는 용도). 상대팀은 이 스쿼드
      // 데이터가 없으니 필터를 건너뛴다.
      let squadNames = new Set();
      if(!isOpponentTeam){
        try {
          const pjRes = await fetch('https://arsenal-seven.vercel.app/data/players.json', {signal: AbortSignal.timeout(8000)});
          if(pjRes.ok) {
            const pjData = await pjRes.json();
            (pjData.players || []).forEach(p => {
              squadNames.add(p.name.toLowerCase());
              const parts = p.name.split(' ');
              if(parts.length > 1) squadNames.add(parts[parts.length-1].toLowerCase());
            });
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
      // players.json (Fotmob 기반) 직접 사용
      const pjRes = await fetch('https://arsenal-seven.vercel.app/data/players.json', {signal: AbortSignal.timeout(8000)});
      if(!pjRes.ok) throw new Error('players.json 로드 실패');
      const pjData = await pjRes.json();

      result = {
        squad: (pjData.players || []).map(p => ({
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
          photo:       p.localPhoto || p.fotmobPhoto || `https://images.fotmob.com/image_resources/playerimages/${p.id}.png`,
          stats:       p.stats || {},
          traits:      p.traits || null,
          shotmap:     p.shotmap || [],
          heatmap:     p.heatmap || [],
          competitions: p.competitions || {},
          career:      p.career || [],
          season:      p.season || '',
        }))
      };
    }

    if(!nocache) setCache(cacheKey, result);
    return res.json(result);

  } catch(err){
    return res.status(500).json({error: err.message});
  }
}
