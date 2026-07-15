// api/football.js — Vercel Serverless Function
const BASE = 'https://api.football-data.org/v4';
const FPL_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';
const ARSENAL_ID = 57;
const ARSENAL_FPL_ID = 1;
const ARSENAL_TEAM_ID = 9825; // Fotmob 팀 ID
const FPL_POS = {1:'GK',2:'DF',3:'MF',4:'FW'};
const LOAN_KEYWORDS = /loan|loaned|joined|transferred|released|left the club/i;

// Fotmob 선수 ID 매핑 (사진: images.fotmob.com/image_resources/playerimages/{id}.png)
const FOTMOB_IDS = {
  'meslier':       952029,
  'raya':          562727,
  'arrizabalaga':  317564,
  'setford':       1243239,
  'hincapie':      1137667,
  'saliba':        955406,
  'mosquera':      1298907,
  'white':         776151,
  'gabriel':       795179,
  'timber':        942381,
  'calafiori':     1105912,
  'skelly':        1406436,
  'salmon':        1787525,
  'nwaneri':       1254234,
  'vieira':        1025462,
  'degaard':       534670,
  'eze':           818975,
  'nrgaard':       266520,
  'merino':        574645,
  'zubimendi':     1031325,
  'rice':          654096,
  'dowman':        1635773,
  'nelson':        748382,
  'saka':          961995,
  'jesus':         576165,
  'martinelli':    1021586,
  'gyokeres':      664500,
  'trossard':      318615,
  'madueke':       1084981,
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
  res.setHeader('Cache-Control', `public, max-age=${Math.floor(getTTL(type)/1000)}`);

  if(!nocache){
    const hit = getCache(type);
    if(hit) return res.json(hit);
  }

  const KEY = process.env.FOOTBALL_DATA_KEY;
  const H = KEY ? {'X-Auth-Token': KEY} : {};

  try {
    let result;

    if(type === 'fixtures'){
      const ARSENAL_ESPN_ID = '359';
      const SLUGS = [
        {slug:'eng.1',         name:'Premier League',   short:'PL'},
        {slug:'uefa.champions',name:'Champions League', short:'UCL'},
        {slug:'eng.league_cup',name:'EFL Cup',          short:'EFL'},
        {slug:'eng.fa',        name:'FA Cup',           short:'FAC'},
        {slug:'eng.charity',   name:'Community Shield', short:'CS'},
        {slug:'club.friendly', name:'Friendly',         short:'FR'},
      ];

      const now = new Date();
      const fmtDate = d => d.toISOString().slice(0,10).replace(/-/g,'');
      // 시즌 종료(5월 31일)까지 조회 — 1~5월(시즌 중)이면 올해 5월,
      // 6~12월(오프시즌 또는 새 시즌 진행 중)이면 다음 해 5월
      const seasonEndYear = now.getMonth() + 1 <= 5 ? now.getFullYear() : now.getFullYear() + 1;
      const futureEnd = fmtDate(new Date(seasonEndYear, 4, 31));

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
          status:      finished ? 'FINISHED' : live ? 'IN_PLAY' : 'SCHEDULED',
          clock:       live ? (() => {
            const raw = comp?.status?.displayClock || '';
            const period = comp?.status?.period || 1;
            // "67:34" → "67'" / "90+2:11" → "90+2'"
            const mm = raw.match(/^(\d{1,3}(?:\+\d+)?):/);
            if (mm) {
              const mins = parseInt(mm[1], 10);
              const base = period === 2 ? 45 : period === 3 ? 90 : period === 4 ? 105 : 0;
              return (base + mins) + "'";
            }
            return raw; // 이미 "67'" 등 포맷이면 그대로
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

      const fetchSlug = async ({slug, name, short}) => {
        try {
          const sr = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/teams/${ARSENAL_ESPN_ID}/schedule`,
            {signal: AbortSignal.timeout(8000)}
          );
          const sj = sr.ok ? await sr.json() : {events:[]};
          const past = (sj.events||[]).map(e => parseEvent(e, name, short)).filter(isArsenal);

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

      return res.json({matches: allMatches, finished, upcoming});

    } else if(type === 'standings'){
      if(!KEY) return res.status(500).json({error:'FOOTBALL_DATA_KEY 없음'});
      const r = await fetch(`${BASE}/competitions/PL/standings`,{headers:H,signal:AbortSignal.timeout(8000)});
      if(!r.ok) throw new Error(`football-data: ${r.status}`);
      const json = await r.json();
      result = {
        season: json.season?.currentMatchday,
        standings: (json.standings?.[0]?.table||[]).map(row=>({
          position:row.position,
          team:{id:row.team?.id,name:row.team?.name||'',shortName:row.team?.shortName||'',crest:row.team?.crest||''},
          playedGames:row.playedGames,won:row.won,draw:row.draw,lost:row.lost,
          points:row.points,goalsFor:row.goalsFor,goalsAgainst:row.goalsAgainst,
          goalDifference:row.goalDifference,isArsenal:row.team?.id===ARSENAL_ID,
        }))
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

        const mapRow = (row) => ({
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
          value:     row.StatValue,
        });

        // 새 시즌이 아직 시작 전이면 해당 시즌 통계 파일이 비어있으므로,
        // 데이터가 있는 첫 시즌(보통 직전 시즌)까지 순서대로 내려간다.
        const getTopN = async (statName, n) => {
          for(const link of seasonLinks){
            const list = await fetchStatList(link.TournamentId, statName);
            if(list && list.length) return list.slice(0, n).map(mapRow);
          }
          return [];
        };

        const [goals, assists, cleanSheets] = await Promise.all([
          getTopN('goals', 10),
          getTopN('goal_assist', 10),
          getTopN('clean_sheet', 10),
        ]);

        result = { goals, assists, cleanSheets };
      } catch(err) {
        const stale = getStale('leaders');
        if(stale) return res.json(stale);
        throw err;
      }

    } else if(type === 'injuries'){
      // players.json로 현재 스쿼드 이름 목록 확보
      let squadNames = new Set();
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
        const stale = getStale('injuries');
        if(stale) return res.json(stale);
        throw fplErr;
      }
      const arsenalPlayers = (fplData.elements || []).filter(p => p.team === ARSENAL_FPL_ID);
      const squadFilter = (p) => {
          if(squadNames.size === 0) return true;
          const webName = p.web_name.toLowerCase();
          const lastName = p.second_name.split(' ').pop().toLowerCase();
          const fullName = `${p.first_name} ${p.second_name}`.toLowerCase();
          return squadNames.has(webName) || squadNames.has(lastName) || squadNames.has(fullName);
      };
      const squadPlayers = arsenalPlayers.filter(squadFilter);
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
      result = { injured, availableCount };

    } else if(type === 'squad'){
      // players.json (Fotmob 기반) 직접 사용
      const pjRes = await fetch('https://arsenal-seven.vercel.app/data/players.json', {signal: AbortSignal.timeout(8000)});
      if(!pjRes.ok) throw new Error('players.json 로드 실패');
      const pjData = await pjRes.json();

      result = {
        squad: (pjData.players || []).map(p => ({
          id:          p.id,
          id:          p.id,
          fotmobId:    p.id,
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

    if(!nocache) setCache(type, result);
    return res.json(result);

  } catch(err){
    return res.status(500).json({error: err.message});
  }
}
