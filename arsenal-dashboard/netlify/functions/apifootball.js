// netlify/functions/apifootball.js
// 프록시: api-football.com (무료 플랜, 하루 100콜)
// 선수 세부 스탯, 부상 현황

const BASE = 'https://v3.football.api-sports.io';
const SEASON = 2024;
const ARSENAL_ID = 42; // Arsenal FC

async function apiFetch(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'x-rapidapi-host': 'v3.football.api-sports.io',
      'x-rapidapi-key': process.env.API_FOOTBALL_KEY,
    }
  });
  if (!res.ok) throw new Error(`api-football ${res.status}: ${path}`);
  return res.json();
}

// 메모리 캐시 (2시간)
const cache = {};
const TTL = 2 * 60 * 60 * 1000;
function getCache(k) {
  const c = cache[k];
  return (c && Date.now() - c.ts < TTL) ? c.data : null;
}
function setCache(k, d) { cache[k] = { data: d, ts: Date.now() }; }

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=7200',
  };

  const type = event.queryStringParameters?.type || 'players';

  const hit = getCache(type);
  if (hit) return { statusCode: 200, headers, body: JSON.stringify(hit) };

  try {
    let result;

    if (type === 'players') {
      // 선수 목록 + 시즌 스탯 (여러 페이지 있을 수 있지만 무료는 1페이지)
      const json = await apiFetch(`/players?team=${ARSENAL_ID}&season=${SEASON}`);
      result = {
        players: json.response.map(r => ({
          id: r.player.id,
          name: r.player.name,
          firstname: r.player.firstname,
          lastname: r.player.lastname,
          age: r.player.age,
          nationality: r.player.nationality,
          photo: r.player.photo,
          number: r.statistics[0]?.games?.number ?? null,
          position: r.statistics[0]?.games?.position ?? 'Unknown',
          appearances: r.statistics[0]?.games?.appearences ?? 0,
          goals: r.statistics[0]?.goals?.total ?? 0,
          assists: r.statistics[0]?.goals?.assists ?? 0,
          yellowCards: r.statistics[0]?.cards?.yellow ?? 0,
          redCards: r.statistics[0]?.cards?.red ?? 0,
          // GK 전용
          saves: r.statistics[0]?.goals?.saves ?? null,
          conceded: r.statistics[0]?.goals?.conceded ?? null,
          rating: r.statistics[0]?.games?.rating ? parseFloat(r.statistics[0].games.rating).toFixed(1) : null,
        }))
      };

    } else if (type === 'injuries') {
      // 이번 시즌 아스날 부상 목록
      const json = await apiFetch(`/injuries?team=${ARSENAL_ID}&season=${SEASON}`);
      result = {
        injuries: json.response.map(r => ({
          player: {
            id: r.player.id,
            name: r.player.name,
            photo: r.player.photo,
          },
          type: r.player.type,      // "Injury" | "Missing Fixture"
          reason: r.player.reason,  // "Hamstring", "Knee" 등
          fixture: {
            date: r.fixture.date,
            league: r.league.name,
          }
        }))
      };
    }

    setCache(type, result);
    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message, type }),
    };
  }
};
