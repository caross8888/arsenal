// netlify/functions/football.js
// football-data.org 무료 플랜 호환
// /teams/{id}/matches → 유료 전용 (막힘)
// /competitions/{code}/matches → 무료 사용 가능

const BASE = 'https://api.football-data.org/v4';
const ARSENAL_ID = 57;

// 무료 플랜에서 쓸 수 있는 리그 코드
const FREE_COMPS = ['PL', 'CL', 'FAC', 'ELC'];

const cache = {};
const TTL = 60 * 60 * 1000; // 1시간
function getCache(k) { const c = cache[k]; return (c && Date.now() - c.ts < TTL) ? c.data : null; }
function setCache(k, d) { cache[k] = { data: d, ts: Date.now() }; }

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600',
  };

  const type = event.queryStringParameters?.type || 'fixtures';
  const hit = getCache(type);
  if (hit) return { statusCode: 200, headers, body: JSON.stringify(hit) };

  const KEY = process.env.FOOTBALL_DATA_KEY;
  if (!KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'FOOTBALL_DATA_KEY 환경변수 없음' }) };

  const H = { 'X-Auth-Token': KEY };

  try {
    let result;

    if (type === 'fixtures') {
      // PL 경기 가져오기 (팀 필터링)
      const res = await fetch(`${BASE}/competitions/PL/matches?status=SCHEDULED,IN_PLAY,PAUSED,FINISHED&limit=20`, { headers: H });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`football-data: ${res.status} - ${errText}`);
      }
      const json = await res.json();

      // 아스날 경기만 필터
      const allMatches = (json.matches || []).filter(m =>
        m.homeTeam?.id === ARSENAL_ID || m.awayTeam?.id === ARSENAL_ID
      );

      // 예정 경기: 가까운 순
      const upcoming = allMatches
        .filter(m => ['SCHEDULED','IN_PLAY','PAUSED'].includes(m.status))
        .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))
        .slice(0, 5);

      // 종료 경기: 최신 순
      const finished = allMatches
        .filter(m => m.status === 'FINISHED')
        .sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate))
        .slice(0, 5);

      const mapMatch = m => ({
        id: m.id,
        competition: m.competition?.name || 'Premier League',
        competitionCode: m.competition?.code || 'PL',
        date: m.utcDate,
        status: m.status,
        homeTeam: { id: m.homeTeam?.id, name: m.homeTeam?.name, shortName: m.homeTeam?.shortName, crest: m.homeTeam?.crest },
        awayTeam: { id: m.awayTeam?.id, name: m.awayTeam?.name, shortName: m.awayTeam?.shortName, crest: m.awayTeam?.crest },
        score: m.score,
        venue: m.venue,
      });

      result = { matches: [...upcoming, ...finished].map(mapMatch) };

    } else if (type === 'standings') {
      const res = await fetch(`${BASE}/competitions/PL/standings`, { headers: H });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`football-data: ${res.status} - ${errText}`);
      }
      const json = await res.json();
      const table = json.standings?.[0]?.table || [];

      result = {
        season: json.season?.currentMatchday,
        standings: table.slice(0, 10).map(row => ({
          position: row.position,
          team: {
            id: row.team?.id,
            name: row.team?.name,
            shortName: row.team?.shortName,
            crest: row.team?.crest,
          },
          playedGames: row.playedGames,
          won: row.won,
          draw: row.draw,
          lost: row.lost,
          points: row.points,
          goalsFor: row.goalsFor,
          goalsAgainst: row.goalsAgainst,
          goalDifference: row.goalDifference,
          isArsenal: row.team?.id === ARSENAL_ID,
        }))
      };

    } else if (type === 'squad') {
      const res = await fetch(`${BASE}/teams/${ARSENAL_ID}`, { headers: H });
      if (!res.ok) throw new Error(`football-data: ${res.status}`);
      const json = await res.json();
      result = {
        squad: (json.squad || []).map(p => ({
          id: p.id,
          name: p.name,
          position: p.position,
          nationality: p.nationality,
          shirtNumber: p.shirtNumber,
        }))
      };
    }

    setCache(type, result);
    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
