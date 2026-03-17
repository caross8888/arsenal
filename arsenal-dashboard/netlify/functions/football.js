// netlify/functions/football.js
// 프록시: football-data.org API (무료 플랜, 하루 10콜)
// 브라우저에서 API 키 노출 없이 서버에서 호출

const BASE = 'https://api.football-data.org/v4';
const ARSENAL_ID = 57; // Arsenal FC team ID
const HEADERS = { 'X-Auth-Token': process.env.FOOTBALL_DATA_KEY };

// 결과 캐시 (메모리, Function warm 상태 유지 시)
const cache = {};
const TTL = 60 * 60 * 1000; // 1시간

function cached(key, data) {
  cache[key] = { data, ts: Date.now() };
}
function getCache(key) {
  const c = cache[key];
  if (c && Date.now() - c.ts < TTL) return c.data;
  return null;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600',
  };

  const type = event.queryStringParameters?.type || 'fixtures';

  // 캐시 히트
  const hit = getCache(type);
  if (hit) return { statusCode: 200, headers, body: JSON.stringify(hit) };

  try {
    let url, result;

    if (type === 'fixtures') {
      // 최근 5경기 + 다음 5경기
      const now = new Date();
      const pastDate = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const futureDate = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      url = `${BASE}/teams/${ARSENAL_ID}/matches?dateFrom=${pastDate}&dateTo=${futureDate}&limit=12`;

      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`football-data: ${res.status}`);
      const json = await res.json();

      result = {
        matches: json.matches.map(m => ({
          id: m.id,
          competition: m.competition.name,
          competitionCode: m.competition.code,
          date: m.utcDate,
          status: m.status,
          homeTeam: { name: m.homeTeam.name, shortName: m.homeTeam.shortName, crest: m.homeTeam.crest },
          awayTeam: { name: m.awayTeam.name, shortName: m.awayTeam.shortName, crest: m.awayTeam.crest },
          score: m.score,
          venue: m.venue,
        }))
      };

    } else if (type === 'standings') {
      // PL 순위 (PL: PL)
      url = `${BASE}/competitions/PL/standings`;
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`football-data: ${res.status}`);
      const json = await res.json();

      const table = json.standings[0].table;
      result = {
        season: json.season.currentMatchday,
        standings: table.slice(0, 8).map(row => ({
          position: row.position,
          team: { id: row.team.id, name: row.team.name, shortName: row.team.shortName, crest: row.team.crest },
          playedGames: row.playedGames,
          won: row.won,
          draw: row.draw,
          lost: row.lost,
          points: row.points,
          goalsFor: row.goalsFor,
          goalsAgainst: row.goalsAgainst,
          goalDifference: row.goalDifference,
          isArsenal: row.team.id === ARSENAL_ID,
        }))
      };

    } else if (type === 'squad') {
      url = `${BASE}/teams/${ARSENAL_ID}`;
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`football-data: ${res.status}`);
      const json = await res.json();

      result = {
        squad: json.squad.map(p => ({
          id: p.id,
          name: p.name,
          position: p.position,
          dateOfBirth: p.dateOfBirth,
          nationality: p.nationality,
          shirtNumber: p.shirtNumber,
        }))
      };
    }

    cached(type, result);
    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message, type }),
    };
  }
};
