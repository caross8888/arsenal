// api/football.js — Vercel Serverless Function
const BASE = 'https://api.football-data.org/v4';
const FPL_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';
const ARSENAL_ID = 57;
const ARSENAL_FPL_ID = 1;
const FPL_POS = {1:'GK',2:'DF',3:'MF',4:'FW'};
const LOAN_KEYWORDS = /loan|loaned|joined|transferred|released|left the club/i;



const cache = {};
const TTL = 60 * 60 * 1000;
function getCache(k){const c=cache[k];return(c&&Date.now()-c.ts<TTL)?c.data:null;}
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
          tbd:         status?.id === '5' || status?.description === 'Postponed' ? 'postponed' : status?.id === '6' || status?.description === 'Canceled' ? 'canceled' : status?.id === '8' ? 'tbd' : null,
          homeTeam: {
            id:    homeId,
            name:  home?.team?.displayName || home?.team?.name,
            crest: home?.team?.logo || (homeId ? `https://a.espncdn.com/i/teamlogos/soccer/500/${homeId}.png` : null),
          },
          awayTeam: {
            id:    awayId,
            name:  away?.team?.displayName || away?.team?.name,
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

    } else if(type === 'squad'){
      // FPL API (이름+사진 기준) + players.json (풋몹 스탯, web_name으로 매칭)
      const [pjRes, fplRes] = await Promise.all([
        fetch('https://arsenal-seven.vercel.app/data/players.json', {signal: AbortSignal.timeout(8000)}),
        fetch('https://fantasy.premierleague.com/api/bootstrap-static/', {headers: FPL_HEADERS, signal: AbortSignal.timeout(8000)}),
      ]);

      const norm = s => (s||'').toLowerCase().replace(/[^a-z]/g,'');

      // 풋몹 스탯 맵: 이름 파트별로 인덱싱
      const fmMap = {};
      if(pjRes.ok){
        const pjData = await pjRes.json();
        (pjData.players || []).forEach(p => {
          // 풋몹 이름의 각 파트를 키로 등록
          p.name.split(' ').forEach(part => {
            const k = norm(part);
            if(k.length > 2) fmMap[k] = fmMap[k] ? [...fmMap[k], p] : [p];
          });
          fmMap[norm(p.name)] = [p]; // 풀네임도 등록
        });
      }

      if(!fplRes.ok) throw new Error('FPL API 실패');
      const fplData = await fplRes.json();
      const FPL_POS_MAP = {1:'GK',2:'DF',3:'MF',4:'FW'};

      const arsenalPlayers = (fplData.elements || []).filter(p => p.team === ARSENAL_FPL_ID);
      result = {
        squad: arsenalPlayers.map(p => {
          const photo   = `https://resources.premierleague.com/premierleague/photos/players/250x250/p${p.code}.png`;
          // web_name 우선 매칭 (가장 고유) → 성 → 이름
          const webKey  = norm(p.web_name);
          const lastKey = norm(p.second_name);
          const firstKey= norm(p.first_name);
          const fullKey = norm(p.first_name + p.second_name);

          // 후보 목록에서 1개면 바로 사용, 여러개면 fullKey로 재시도
          let fm = {};
          const candidates = fmMap[webKey] || fmMap[fullKey] || fmMap[lastKey] || fmMap[firstKey] || [];
          if(candidates.length === 1) fm = candidates[0];
          else if(candidates.length > 1){
            // 풀네임으로 재시도
            const byFull = fmMap[fullKey];
            if(byFull && byFull.length === 1) fm = byFull[0];
            else fm = candidates[0]; // 그래도 여러개면 첫번째
          }

          return {
            id:            p.id,
            fotmobId:      fm.id || null,
            name:          p.web_name,
            fullName:      `${p.first_name} ${p.second_name}`,
            nationality:   fm.nationality || '',
            posGroup:      FPL_POS_MAP[p.element_type] || 'MF',
            position:      fm.position || '',
            positionLabel: fm.positionLabel || '',
            jersey:        p.squad_number || fm.jersey || '',
            photo,
            goals:       fm.competitions ? Object.values(fm.competitions).reduce((s,c)=>s+(c.goals||0),0) : (p.goals_scored||0),
            assists:     fm.competitions ? Object.values(fm.competitions).reduce((s,c)=>s+(c.assists||0),0) : (p.assists||0),
            appearances: fm.competitions ? Object.values(fm.competitions).reduce((s,c)=>s+(c.appearances||0),0) : 0,
            starts:      fm.competitions ? Object.values(fm.competitions).reduce((s,c)=>s+(c.starts||0),0) : 0,
            minutes:     fm.competitions ? Object.values(fm.competitions).reduce((s,c)=>s+(c.minutesPlayed||0),0) : (p.minutes||0),
            yellowCards: fm.competitions ? Object.values(fm.competitions).reduce((s,c)=>s+(c.yellowCards||0),0) : (p.yellow_cards||0),
            redCards:    fm.competitions ? Object.values(fm.competitions).reduce((s,c)=>s+(c.redCards||0),0) : (p.red_cards||0),
            competitions: fm.competitions || {},
            stats:        fm.stats || {},
            traits:       fm.traits || null,
            career:       fm.career || [],
          };
        })
      };
    }

    if(!nocache) setCache(type, result);
    return res.json(result);

  } catch(err){
    return res.status(500).json({error: err.message});
  }
}
