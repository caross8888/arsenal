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
  'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
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
          status:      finished ? 'FINISHED' : live ? 'IN_PLAY' : 'SCHEDULED',
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
          // 완료 경기: schedule API
          const sr = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/teams/${ARSENAL_ESPN_ID}/schedule`,
            {signal: AbortSignal.timeout(8000)}
          );
          const sj = sr.ok ? await sr.json() : {events:[]};
          const past = (sj.events||[]).map(e => parseEvent(e, name, short)).filter(isArsenal);

          // 예정 경기: scoreboard API (오늘~시즌 종료)
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

      // 중복 제거 (id 기준)
      const seen = new Set();
      const allMatches = results.flat().filter(m => {
        if(seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });

      // 날짜순 정렬
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
      const officialNames = new Set();
      if(KEY){
        try{
          const sqRes = await fetch(`${BASE}/teams/${ARSENAL_ID}`,{headers:H,signal:AbortSignal.timeout(5000)});
          if(sqRes.ok){
            const sqJson = await sqRes.json();
            (sqJson.squad||[]).forEach(p=>{
              officialNames.add(p.name.toLowerCase());
              p.name.toLowerCase().split(' ').forEach(word => {
                if(word.length > 2) officialNames.add(word);
              });
            });
          }
        }catch(_){}
      }

      const fplRes = await fetch(FPL_URL,{headers:FPL_HEADERS,signal:AbortSignal.timeout(8000)});
      if(!fplRes.ok) throw new Error(`FPL API: ${fplRes.status}`);
      const fplJson = await fplRes.json();

      const nationalityMap = {};
      if(KEY){
        try{
          const sqRes = await fetch(`${BASE}/teams/${ARSENAL_ID}`,{headers:H,signal:AbortSignal.timeout(5000)});
          if(sqRes.ok){
            const sqJson = await sqRes.json();
            (sqJson.squad||[]).forEach(p=>{
              nationalityMap[p.name.toLowerCase()] = p.nationality;
              p.name.toLowerCase().split(' ').forEach(word => {
                if(word.length > 2) nationalityMap[word] = p.nationality;
              });
            });
          }
        }catch(_){}
      }

      // Fotmob 명단 기반 필터
      const FOTMOB_NAMES = [
        'kepa','raya','setford','white','saliba','gabriel','timber',
        'calafiori','hincapie','mosquera','lewis-skelly','lewis skelly','salmon',
        'odegaard','ødegaard','merino','zubimendi','rice','norgaard','nørgaard',
        'dowman','eze','saka','madueke','martinelli','trossard','jesus',
        'havertz','gyokeres','gyökeres',
      ];
      const isInFotmob = (p) => {
        const full = (p.first_name+' '+p.second_name).toLowerCase();
        const web = p.web_name.toLowerCase();
        const second = p.second_name.toLowerCase();
        return FOTMOB_NAMES.some(n =>
          full.includes(n) || web.includes(n) || second.includes(n)
        );
      };

      const players = fplJson.elements
        .filter(p => {
          if(p.team !== ARSENAL_FPL_ID) return false;
          if(p.news && LOAN_KEYWORDS.test(p.news)) return false;
          return isInFotmob(p);
        })
        .map(p => {
          const fullName = `${p.first_name} ${p.second_name}`;
          const lastName = p.second_name.toLowerCase();
          const nationality = nationalityMap[fullName.toLowerCase()]
            || nationalityMap[lastName] || '';
          const photoId = p.photo ? p.photo.replace('.jpg','') : null;
          return {
            id: p.id,
            fplId: p.id,
            name: p.web_name,
            fullName,
            nationality,
            posGroup: FPL_POS[p.element_type]||'MF',
            goals: p.goals_scored,
            assists: p.assists,
            appearances: Math.max(1, Math.round(p.minutes/90)),
            starts: p.starts || 0,
            minutes: p.minutes,
            yellowCards: p.yellow_cards,
            redCards: p.red_cards,
            xG: parseFloat(p.expected_goals)||0,
            xA: parseFloat(p.expected_assists)||0,
            xGI: parseFloat(p.expected_goal_involvements)||0,
            creativity: parseFloat(p.creativity)||0,
            threat: parseFloat(p.threat)||0,
            influence: parseFloat(p.influence)||0,
            ictIndex: parseFloat(p.ict_index)||0,
            form: parseFloat(p.form)||0,
            bonus: p.bonus||0,
            totalPoints: p.total_points||0,
            photo: photoId
              ? `https://resources.premierleague.com/premierleague/photos/players/110x140/p${photoId}.png`
              : null,
          };
        })
        .sort((a,b)=>({GK:0,DF:1,MF:2,FW:3}[a.posGroup]??9)-({GK:0,DF:1,MF:2,FW:3}[b.posGroup]??9));

      result = {squad: players};
    }

    if(!nocache) setCache(type, result);
    return res.json(result);

  } catch(err){
    return res.status(500).json({error: err.message});
  }
}
