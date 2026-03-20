// api/football.js — Vercel Serverless Function
const BASE = 'https://api.football-data.org/v4';
const FPL_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';
const ARSENAL_ID = 57;
const ARSENAL_FPL_ID = 1;
const FPL_POS = {1:'GK',2:'DF',3:'MF',4:'FW'};
const LOAN_KEYWORDS = /loan|loaned|joined|transferred|released|left the club/i;

// Fotmob 선수 ID 매핑 (사진: images.fotmob.com/image_resources/playerimages/{id}.png)
const FOTMOB_IDS = {
  'kepa':        317564,  'raya':        562727,  'setford':     1243239,
  'white':       776151,  'saliba':      955406,  'gabriel':     795179,
  'timber':      942381,  'calafiori':   1105912, 'hincapie':    1137667,
  'mosquera':    1298907, 'lewis-skelly':1406436, 'salmon':      1787525,
  'odegaard':    534670,  'merino':      574645,  'zubimendi':   1031325,
  'rice':        654096,  'norgaard':    266520,  'dowman':      1635773,
  'eze':         818975,  'saka':        961995,  'madueke':     1084981,
  'martinelli':  1021586, 'trossard':    318615,  'jesus':       576165,
  'havertz':     749736,  'gyokeres':    664500,
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
function getCache(k){const c=cache[k];return(c&&Date.now()-c.ts<TTL)?c.data:null;}
function getStale(k){const c=cache[k];return c?c.data:null;}
function setCache(k,d){cache[k]={data:d,ts:Date.now()};}

const FPL_HEADERS = {
  'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
  'Accept':'application/json',
  'Referer':'https://fantasy.premierleague.com/',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Cache-Control','public, max-age=3600');

  const type = req.query.type || 'fixtures';
  const nocache = req.query.nocache;

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
      ];

      const now = new Date();
      const fmtDate = d => d.toISOString().slice(0,10).replace(/-/g,'');
      const futureEnd = fmtDate(new Date(now.getFullYear(), 7, 31));

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
          clock:       live ? (comp?.status?.displayClock||'') : null,
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
            `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${todayStr}-${futureEnd}&limit=50`,
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

    } else if(type === 'injuries'){
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
      const injured = arsenalPlayers
        .filter(p => p.chance_of_playing_next_round !== null && p.chance_of_playing_next_round < 100)
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
      result = { injured };

    } else if(type === 'squad'){
      // players.json (Fotmob 기반) 직접 사용
      const pjRes = await fetch('https://arsenal-seven.vercel.app/data/players.json', {signal: AbortSignal.timeout(8000)});
      if(!pjRes.ok) throw new Error('players.json 로드 실패');
      const pjData = await pjRes.json();

      result = {
        squad: (pjData.players || []).map(p => ({
          id:          p.id,
          fotmobId:    p.id,
          name:        p.name,
          fullName:    p.name,
          nationality: p.nationality || '',
          posGroup:    p.posGroup || 'MF',
          position:    p.position || '',
          positionLabel: p.positionLabel || '',
          goals:       p.stats?.goals || 0,
          assists:     p.stats?.assists || 0,
          appearances: p.stats?.appearances || 0,
          starts:      p.stats?.starts || 0,
          minutes:     p.stats?.minutesPlayed || 0,
          yellowCards: p.stats?.yellowCards || 0,
          redCards:    p.stats?.redCards || 0,
          xG:          p.stats?.xG || 0,
          xA:          p.stats?.xA || 0,
          photo:       `https://images.fotmob.com/image_resources/playerimages/${p.id}.png`,
        }))
      };
    }

    if(!nocache) setCache(type, result);
    return res.json(result);

  } catch(err){
    return res.status(500).json({error: err.message});
  }
}
