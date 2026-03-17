// api/football.js — Vercel Serverless Function
const BASE = 'https://api.football-data.org/v4';
const FPL_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';
const ARSENAL_ID = 57;
const ARSENAL_FPL_ID = 1;
const FPL_POS = {1:'GK',2:'DF',3:'MF',4:'FW'};
const YOUTH_POSITIONS = ['Defence','Midfield','Offence'];

const cache = {};
const TTL = 60 * 60 * 1000; // 1시간 캐시 (429 방지)
function getCache(k){const c=cache[k];return(c&&Date.now()-c.ts<TTL)?c.data:null;}
function setCache(k,d){cache[k]={data:d,ts:Date.now()};}

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
      if(!KEY) return res.status(500).json({error:'FOOTBALL_DATA_KEY 없음'});

      // 429 방지: 병렬 대신 순차 조회 + 딜레이
      const delay = ms => new Promise(r => setTimeout(r, ms));
      const fetchComp = async (comp) => {
        const r = await fetch(
          `${BASE}/competitions/${comp}/matches?status=SCHEDULED,TIMED,IN_PLAY,PAUSED,FINISHED&limit=38`,
          {headers: H, signal: AbortSignal.timeout(8000)}
        );
        if(r.status === 429) return {matches:[], limited:true};
        if(!r.ok) return {matches:[]};
        return r.json();
      };

      // PL만 먼저, 나머지는 딜레이 후 순차
      const plData = await fetchComp('PL');
      await delay(600);
      const clData = await fetchComp('CL');
      await delay(600);
      const facData = await fetchComp('FAC');

      const allMatches = [plData, clData, facData]
        .flatMap(j => j.matches || [])
        .filter(m => m.homeTeam?.id === ARSENAL_ID || m.awayTeam?.id === ARSENAL_ID);

      const mapMatch = m => ({
        id: m.id,
        competition: m.competition?.name || '',
        competitionCode: m.competition?.code || 'PL',
        date: m.utcDate,
        status: m.status,
        homeTeam: {id:m.homeTeam?.id, name:m.homeTeam?.name||'', shortName:m.homeTeam?.shortName||'', crest:m.homeTeam?.crest||''},
        awayTeam: {id:m.awayTeam?.id, name:m.awayTeam?.name||'', shortName:m.awayTeam?.shortName||'', crest:m.awayTeam?.crest||''},
        score: m.score,
        venue: m.venue || '',
      });

      const upcoming = allMatches
        .filter(m => ['SCHEDULED','TIMED','IN_PLAY','PAUSED'].includes(m.status))
        .sort((a,b) => new Date(a.utcDate)-new Date(b.utcDate))
        .slice(0,3).map(mapMatch);

      const finished = allMatches
        .filter(m => m.status==='FINISHED')
        .sort((a,b) => new Date(b.utcDate)-new Date(a.utcDate))
        .slice(0,3).map(mapMatch);

      result = {matches:[...upcoming,...finished]};

    } else if(type === 'standings'){
      if(!KEY) return res.status(500).json({error:'FOOTBALL_DATA_KEY 없음'});
      const r = await fetch(`${BASE}/competitions/PL/standings`, {headers:H, signal:AbortSignal.timeout(8000)});
      if(!r.ok) throw new Error(`football-data: ${r.status}`);
      const json = await r.json();
      const table = json.standings?.[0]?.table || [];
      result = {
        season: json.season?.currentMatchday,
        standings: table.map(row => ({
          position: row.position,
          team: {id:row.team?.id, name:row.team?.name||'', shortName:row.team?.shortName||'', crest:row.team?.crest||''},
          playedGames:row.playedGames, won:row.won, draw:row.draw, lost:row.lost,
          points:row.points, goalsFor:row.goalsFor, goalsAgainst:row.goalsAgainst,
          goalDifference:row.goalDifference, isArsenal:row.team?.id===ARSENAL_ID,
        }))
      };

    } else if(type === 'squad'){
      // ── FPL API로 선수단 + 스탯 + 사진 ──
      const fplRes = await fetch(FPL_URL, {
        headers:{'User-Agent':'Arsenal-Dashboard/1.0'},
        signal: AbortSignal.timeout(8000),
      });
      if(!fplRes.ok) throw new Error(`FPL API: ${fplRes.status}`);
      const fplJson = await fplRes.json();

      // football-data.org로 국적 보완 (별도 API 호출)
      const squadMap = {};
      if(KEY){
        try{
          const sqRes = await fetch(`${BASE}/teams/${ARSENAL_ID}`,{headers:H,signal:AbortSignal.timeout(5000)});
          if(sqRes.ok){
            const sqJson = await sqRes.json();
            (sqJson.squad||[]).forEach(p=>{
              squadMap[p.name.toLowerCase()] = p;
              // 성(last name)으로도 매핑
              const parts = p.name.split(' ');
              if(parts.length>1) squadMap[parts[parts.length-1].toLowerCase()] = p;
            });
          }
        }catch(_){}
      }

      const arsenal = fplJson.teams.find(t=>t.id===ARSENAL_FPL_ID);
      if(!arsenal) throw new Error('Arsenal not found in FPL');

      const players = fplJson.elements
        .filter(p => p.team===ARSENAL_FPL_ID && p.minutes>0)
        .map(p => {
          const posGroup = FPL_POS[p.element_type]||'MF';
          const fullName = `${p.first_name} ${p.second_name}`;
          const lastName = p.second_name.toLowerCase();
          const fullLower = fullName.toLowerCase();
          const fdPlayer = squadMap[fullLower] || squadMap[lastName];
          const photoId = p.photo ? p.photo.replace('.jpg','') : null;
          return {
            id: p.id,
            name: p.web_name,
            fullName,
            nationality: fdPlayer?.nationality || '',
            posGroup,
            goals: p.goals_scored,
            assists: p.assists,
            appearances: p.minutes > 0 ? Math.max(1, Math.round(p.minutes/90)) : 0,
            minutes: p.minutes,
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
