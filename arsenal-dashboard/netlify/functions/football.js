// netlify/functions/football.js
const BASE = 'https://api.football-data.org/v4';
const ARSENAL_ID = 57;

const cache = {};
const TTL = 30 * 60 * 1000;
function getCache(k) { const c = cache[k]; return (c && Date.now() - c.ts < TTL) ? c.data : null; }
function setCache(k, d) { cache[k] = { data: d, ts: Date.now() }; }

// 1군 선수로 보기 어려운 포지션 카테고리 (세부 포지션 없는 경우 = 유소년)
const YOUTH_POSITIONS = ['Defence', 'Midfield', 'Offence'];

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=1800',
  };

  const type = event.queryStringParameters?.type || 'fixtures';
  const nocache = event.queryStringParameters?.nocache;

  if (!nocache) {
    const hit = getCache(type);
    if (hit) return { statusCode: 200, headers, body: JSON.stringify(hit) };
  }

  const KEY = process.env.FOOTBALL_DATA_KEY;
  if (!KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'FOOTBALL_DATA_KEY 환경변수 없음' }) };
  const H = { 'X-Auth-Token': KEY };

  try {
    let result;

    if (type === 'fixtures') {
      const COMPS = ['PL', 'CL', 'FAC'];
      const responses = await Promise.all(
        COMPS.map(comp =>
          fetch(`${BASE}/competitions/${comp}/matches?status=SCHEDULED,TIMED,IN_PLAY,PAUSED,FINISHED&limit=38`, { headers: H })
            .then(r => r.ok ? r.json() : { matches: [] })
            .catch(() => ({ matches: [] }))
        )
      );

      const allMatches = responses
        .flatMap(j => j.matches || [])
        .filter(m => m.homeTeam?.id === ARSENAL_ID || m.awayTeam?.id === ARSENAL_ID);

      const mapMatch = m => ({
        id: m.id,
        competition: m.competition?.name || '',
        competitionCode: m.competition?.code || 'PL',
        date: m.utcDate,
        status: m.status,
        homeTeam: { id: m.homeTeam?.id, name: m.homeTeam?.name || '', shortName: m.homeTeam?.shortName || '', crest: m.homeTeam?.crest || '' },
        awayTeam: { id: m.awayTeam?.id, name: m.awayTeam?.name || '', shortName: m.awayTeam?.shortName || '', crest: m.awayTeam?.crest || '' },
        score: m.score,
        venue: m.venue || '',
      });

      const upcoming = allMatches
        .filter(m => ['SCHEDULED', 'TIMED', 'IN_PLAY', 'PAUSED'].includes(m.status))
        .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))
        .slice(0, 3).map(mapMatch);

      const finished = allMatches
        .filter(m => m.status === 'FINISHED')
        .sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate))
        .slice(0, 3).map(mapMatch);

      result = { matches: [...upcoming, ...finished] };

    } else if (type === 'standings') {
      const res = await fetch(`${BASE}/competitions/PL/standings`, { headers: H });
      if (!res.ok) throw new Error(`football-data: ${res.status}`);
      const json = await res.json();
      const table = json.standings?.[0]?.table || [];
      result = {
        season: json.season?.currentMatchday,
        standings: table.map(row => ({
          position: row.position,
          team: { id: row.team?.id, name: row.team?.name || '', shortName: row.team?.shortName || '', crest: row.team?.crest || '' },
          playedGames: row.playedGames, won: row.won, draw: row.draw, lost: row.lost,
          points: row.points, goalsFor: row.goalsFor, goalsAgainst: row.goalsAgainst,
          goalDifference: row.goalDifference, isArsenal: row.team?.id === ARSENAL_ID,
        }))
      };

    } else if (type === 'squad') {
      const res = await fetch(`${BASE}/teams/${ARSENAL_ID}`, { headers: H });
      if (!res.ok) throw new Error(`football-data: ${res.status}`);
      const json = await res.json();

      result = {
        squad: (json.squad || [])
          .filter(p => {
            // 포지션 없거나 null 문자열 제외
            if (!p.position || p.position === 'null') return false;
            // 세부 포지션 없는 카테고리 = 유소년/2군 제외
            if (YOUTH_POSITIONS.includes(p.position)) return false;
            return true;
          })
          .map(p => ({
            id: p.id, name: p.name, position: p.position,
            nationality: p.nationality, shirtNumber: p.shirtNumber,
          }))
      };
    }

    if (!nocache) setCache(type, result);
    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
