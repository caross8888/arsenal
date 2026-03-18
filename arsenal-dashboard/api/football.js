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
      const delay = ms => new Promise(r => setTimeout(r, ms));

      // ESPN API - 모든 대회 아스날 일정
      const ESPN_SLUGS = [
        {slug:'eng.1',        name:'Premier League',      short:'PL'},
        {slug:'uefa.champions',name:'Champions League',   short:'UCL'},
        {slug:'eng.league_cup',name:'EFL Cup',            short:'EFL'},
        {slug:'eng.fa',        name:'FA Cup',             short:'FAC'},
        {slug:'eng.community_shield', name:'Community Shield', short:'CS'},
        {slug:'fifa.cwc',     name:'Club World Cup',      short:'CWC'},
      ];

      const parseEvent = (e, name, short) => {
        const comp = e.competitions?.[0];
        const home = comp?.competitors?.find(c => c.homeAway === 'home');
        const away = comp?.competitors?.find(c => c.homeAway === 'away');
        const status = comp?.status?.type;
        const finished = status?.completed || false;
        const live = status?.state === 'in';
        const homeScore = (finished||live) ? (parseInt(home?.score?.displayValue ?? home?.score)||0) : null;
        const awayScore = (finished||live) ? (parseInt(away?.score?.displayValue ?? away?.score)||0) : null;
        return {
          id:          e.id,
          utcDate:     e.date,
          competition: {name, short},
          status:      finished ? 'FINISHED' : live ? 'IN_PLAY' : 'SCHEDULED',
          homeTeam:    {id: home?.team?.id, name: home?.team?.displayName, crest: home?.team?.logo},
          awayTeam:    {id: away?.team?.id, name: away?.team?.displayName, crest: away?.team?.logo},
          score:       {fullTime: {home: homeScore, away: awayScore}}
        };
      };

      const now = new Date();
      const fmtDate = d => d.toISOString().slice(0,10).replace(/-/g,'');
      const futureEnd = fmtDate(new Date(now.getFullYear(), 7, 31));

      const fetchESPN = async ({slug, name, short}) => {
        try {
          // 1) 완료 경기: schedule API
          const sr = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/teams/359/schedule`,
            {signal: AbortSignal.timeout(8000)}
          );
          const sj = sr.ok ? await sr.json() : {events:[]};
          const past = (sj.events||[]).map(e => parseEvent(e, name, short));

          // 2) 예정 경기: scoreboard API (오늘~시즌 종료)
          const br = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${fmtDate(now)}-${futureEnd}&limit=50`,
            {signal: AbortSignal.timeout(8000)}
          );
          const bj = br.ok ? await br.json() : {events:[]};
          const future = (bj.events||[]).map(e => parseEvent(e, name, short));

          return [...past, ...future];
        } catch(_){ return []; }
      };

      // 병렬 fetch
      const results = await Promise.all(ESPN_SLUGS.map(fetchESPN));
      const allMatches = results.flat();

      // 아스날(팀 ID 359) 경기만 필터 + 중복 제거
      const seen = new Set();
      const arsenalMatches = allMatches
        .filter(m =>
          m.homeTeam?.id === '359' || m.awayTeam?.id === '359' ||
          m.homeTeam?.name?.includes('Arsenal') || m.awayTeam?.name?.includes('Arsenal')
        )
        .filter(m => {
          if(seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        });

      // 날짜순 정렬
      arsenalMatches.sort((a,b) => new Date(a.utcDate) - new Date(b.utcDate));

      // 완료/예정 분리
      const finished = arsenalMatches.filter(m => m.status === 'FINISHED');
      const upcoming = arsenalMatches.filter(m => m.status !== 'FINISHED');

      return res.json({matches: arsenalMatches, finished, upcoming});

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
              officialNames.add(p.name.toLowerCase());
              // 모든 단어를 개별로 추가 (Kepa Arrizabalaga → kepa, arrizabalaga)
              p.name.toLowerCase().split(' ').forEach(word => {
                if(word.length > 2) officialNames.add(word);
              });
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
              p.name.toLowerCase().split(' ').forEach(word => {
                if(word.length > 2) nationalityMap[word] = p.nationality;
              });
            });
          }
        }catch(_){}
      }

      const isOfficialSquad = (p) => {
        const fullName = (p.first_name + ' ' + p.second_name).toLowerCase();
        const webName = p.web_name.toLowerCase();
        // FPL second_name도 단어별로 쪼개서 체크 (예: "Arrizabalaga Revuelta" → "arrizabalaga")
        const secondNameWords = p.second_name.toLowerCase().split(' ');
        const firstNameWords = p.first_name.toLowerCase().split(' ');
        return officialNames.has(fullName)
          || officialNames.has(webName)
          || secondNameWords.some(w => w.length > 2 && officialNames.has(w))
          || firstNameWords.some(w => w.length > 2 && officialNames.has(w));
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
          const apps = Math.max(1, Math.round(p.minutes/90));
          return {
            id: p.id,
            fplId: p.id,
            name: p.web_name,
            fullName,
            nationality,
            posGroup: FPL_POS[p.element_type]||'MF',
            // 기본 스탯
            goals: p.goals_scored,
            assists: p.assists,
            appearances: apps,
            starts: p.starts || 0,
            minutes: p.minutes,
            yellowCards: p.yellow_cards,
            redCards: p.red_cards,
            // FPL 고급 지표
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
