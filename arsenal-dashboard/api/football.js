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
      if(!KEY) return res.status(500).json({error:'FOOTBALL_DATA_KEY 없음'});
      const delay = ms => new Promise(r => setTimeout(r, ms));
      const fetchComp = async (comp) => {
        try {
          const r = await fetch(
            `${BASE}/competitions/${comp}/matches?status=SCHEDULED,TIMED,IN_PLAY,PAUSED,FINISHED&limit=38`,
            {headers:H, signal:AbortSignal.timeout(8000)}
          );
          if(!r.ok) return {matches:[]};
          return r.json();
        } catch(_){ return {matches:[]}; }
      };
      const plData = await fetchComp('PL');
      await delay(600);
      const clData = await fetchComp('CL');
      await delay(600);
      const facData = await fetchComp('FAC');

      const allMatches = [plData,clData,facData]
        .flatMap(j=>j.matches||[])
        .filter(m=>m.homeTeam?.id===ARSENAL_ID||m.awayTeam?.id===ARSENAL_ID);

      const mapMatch = m=>({
        id:m.id, competition:m.competition?.name||'',
        competitionCode:m.competition?.code||'PL',
        date:m.utcDate, status:m.status,
        homeTeam:{id:m.homeTeam?.id,name:m.homeTeam?.name||'',shortName:m.homeTeam?.shortName||'',crest:m.homeTeam?.crest||''},
        awayTeam:{id:m.awayTeam?.id,name:m.awayTeam?.name||'',shortName:m.awayTeam?.shortName||'',crest:m.awayTeam?.crest||''},
        score:m.score, venue:m.venue||'',
      });

      result = {
        matches:[
          ...allMatches.filter(m=>['SCHEDULED','TIMED','IN_PLAY','PAUSED'].includes(m.status)).sort((a,b)=>new Date(a.utcDate)-new Date(b.utcDate)).slice(0,3).map(mapMatch),
          ...allMatches.filter(m=>m.status==='FINISHED').sort((a,b)=>new Date(b.utcDate)-new Date(a.utcDate)).slice(0,3).map(mapMatch),
        ]
      };

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
      // ── Step 1: football-data.org에서 공식 1군 스쿼드 이름 목록 ──
      const officialNames = new Set();
      if(KEY){
        try{
          const sqRes = await fetch(`${BASE}/teams/${ARSENAL_ID}`,{headers:H,signal:AbortSignal.timeout(5000)});
          if(sqRes.ok){
            const sqJson = await sqRes.json();
            (sqJson.squad||[]).forEach(p=>{
              // 전체 이름 + 성 + 이름 첫글자 조합으로 Set에 추가
              officialNames.add(p.name.toLowerCase());
              const parts = p.name.split(' ');
              if(parts.length>1){
                officialNames.add(parts[parts.length-1].toLowerCase()); // 성
                officialNames.add(parts[0].toLowerCase()); // 이름
              }
            });
          }
        }catch(_){}
      }

      // ── Step 2: FPL에서 아스날 선수 데이터 ──
      const fplRes = await fetch(FPL_URL,{headers:FPL_HEADERS,signal:AbortSignal.timeout(8000)});
      if(!fplRes.ok) throw new Error(`FPL API: ${fplRes.status}`);
      const fplJson = await fplRes.json();

      // football-data 국적 매핑
      const nationalityMap = {};
      if(KEY){
        try{
          const sqRes = await fetch(`${BASE}/teams/${ARSENAL_ID}`,{headers:H,signal:AbortSignal.timeout(5000)});
          if(sqRes.ok){
            const sqJson = await sqRes.json();
            (sqJson.squad||[]).forEach(p=>{
              nationalityMap[p.name.toLowerCase()] = p.nationality;
              const parts = p.name.split(' ');
              if(parts.length>1) nationalityMap[parts[parts.length-1].toLowerCase()] = p.nationality;
            });
          }
        }catch(_){}
      }

      const isOfficialSquad = (p) => {
        const fullName = `${p.first_name} ${p.second_name}`.toLowerCase();
        const lastName = p.second_name.toLowerCase();
        const webName = p.web_name.toLowerCase();
        return officialNames.has(fullName) || officialNames.has(lastName) || officialNames.has(webName);
      };

      const players = fplJson.elements
        .filter(p => {
          if(p.team !== ARSENAL_FPL_ID) return false;
          // 임대/방출 제외
          if(p.news && LOAN_KEYWORDS.test(p.news)) return false;
          // 포함 조건:
          // (A) football-data 공식 1군 스쿼드에 있음 → 무조건 포함
          // (B) 공식 스쿼드에 없어도 minutes > 0 → 유소년 중 1군 경기 출전자
          return isOfficialSquad(p) || p.minutes > 0;
        })
        .map(p => {
          const fullName = `${p.first_name} ${p.second_name}`;
          const lastName = p.second_name.toLowerCase();
          const nationality = nationalityMap[fullName.toLowerCase()]
            || nationalityMap[lastName] || '';
          const photoId = p.photo ? p.photo.replace('.jpg','') : null;
          return {
            id: p.id,
            name: p.web_name,
            fullName,
            nationality,
            posGroup: FPL_POS[p.element_type]||'MF',
            goals: p.goals_scored,
            assists: p.assists,
            appearances: Math.round(p.minutes/90),
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
