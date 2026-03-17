// netlify/functions/football.js
// football-data.org 프록시 (경기일정, 순위, 선수단)
// 무료 플랜: 하루 10콜 → 서버 캐싱으로 절약

const BASE = 'https://api.football-data.org/v4';
const ARSENAL_ID = 57;

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

  const FOOTBALL_KEY = process.env.FOOTBALL_DATA_KEY;
  if (!FOOTBALL_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'FOOTBALL_DATA_KEY 환경변수가 없습니다.' }) };

  const HEADS = { 'X-Auth-Token': FOOTBALL_KEY };

  try {
    let result;

    if (type === 'fixtures') {
      // 무료 플랜: dateFrom/dateTo 파라미터 사용 불가 → status 필터만 사용
      const [schedRes, finRes] = await Promise.all([
        fetch(`${BASE}/teams/${ARSENAL_ID}/matches?status=SCHEDULED,IN_PLAY,PAUSED&limit=6`, { headers: HEADS }),
        fetch(`${BASE}/teams/${ARSENAL_ID}/matches?status=FINISHED&limit=6`, { headers: HEADS }),
      ]);

      const schedJson = schedRes.ok ? await schedRes.json() : { matches: [] };
      const finJson = finRes.ok ? await finRes.json() : { matches: [] };

      const mapMatch = m => ({
        id: m.id,
        competition: m.competition.name,
        competitionCode: m.competition.code,
        date: m.utcDate,
        status: m.status,
        homeTeam: { name: m.homeTeam.name, shortName: m.homeTeam.shortName, crest: m.homeTeam.crest },
        awayTeam: { name: m.awayTeam.name, shortName: m.awayTeam.shortName, crest: m.awayTeam.crest },
        score: m.score,
        venue: m.venue,
      });

      // 예정: 가까운 순, 종료: 최신 순
      const scheduled = (schedJson.matches || []).map(mapMatch);
      const finished = (finJson.matches || []).map(mapMatch).reverse();

      result = { matches: [...scheduled, ...finished] };

    } else if (type === 'standings') {
      const res = await fetch(`${BASE}/competitions/PL/standings`, { headers: HEADS });
      if (!res.ok) throw new Error(`football-data: ${res.status}`);
      const json = await res.json();
      const table = json.standings[0].table;
      result = {
        season: json.season?.currentMatchday,
        standings: table.slice(0, 10).map(row => ({
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
      const res = await fetch(`${BASE}/teams/${ARSENAL_ID}`, { headers: HEADS });
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
