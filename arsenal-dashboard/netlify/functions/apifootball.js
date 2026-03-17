// netlify/functions/apifootball.js
// api-football.com 프록시 (선수 스탯, 부상)
// 무료 플랜: 하루 100콜

const BASE = 'https://v3.football.api-sports.io';
const SEASON = 2025; // 현재 진행 시즌
const ARSENAL_ID = 42;

const cache = {};
const TTL = 2 * 60 * 60 * 1000; // 2시간
function getCache(k) { const c = cache[k]; return (c && Date.now() - c.ts < TTL) ? c.data : null; }
function setCache(k, d) { cache[k] = { data: d, ts: Date.now() }; }

async function apiFetch(path, key) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'x-rapidapi-host': 'v3.football.api-sports.io',
      'x-rapidapi-key': key,
    }
  });
  if (!res.ok) throw new Error(`api-football ${res.status}: ${path}`);
  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length > 0) {
    throw new Error(JSON.stringify(json.errors));
  }
  return json;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=7200',
  };

  const type = event.queryStringParameters?.type || 'players';
  const hit = getCache(type);
  if (hit) return { statusCode: 200, headers, body: JSON.stringify(hit) };

  const API_KEY = process.env.API_FOOTBALL_KEY;
  if (!API_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'API_FOOTBALL_KEY 환경변수가 없습니다.' }) };

  try {
    let result;

    if (type === 'players') {
      const json = await apiFetch(`/players?team=${ARSENAL_ID}&season=${SEASON}`, API_KEY);
      result = {
        players: (json.response || []).map(r => ({
          id: r.player.id,
          name: r.player.name,
          age: r.player.age,
          nationality: r.player.nationality,
          photo: r.player.photo,
          number: r.statistics?.[0]?.games?.number ?? null,
          position: r.statistics?.[0]?.games?.position ?? 'Unknown',
          appearances: r.statistics?.[0]?.games?.appearences ?? 0,
          goals: r.statistics?.[0]?.goals?.total ?? 0,
          assists: r.statistics?.[0]?.goals?.assists ?? 0,
          yellowCards: r.statistics?.[0]?.cards?.yellow ?? 0,
          redCards: r.statistics?.[0]?.cards?.red ?? 0,
          saves: r.statistics?.[0]?.goals?.saves ?? null,
          conceded: r.statistics?.[0]?.goals?.conceded ?? null,
          rating: r.statistics?.[0]?.games?.rating
            ? parseFloat(r.statistics[0].games.rating).toFixed(1)
            : null,
        }))
      };

    } else if (type === 'injuries') {
      const json = await apiFetch(`/injuries?team=${ARSENAL_ID}&season=${SEASON}`, API_KEY);
      result = {
        injuries: (json.response || []).map(r => ({
          player: {
            id: r.player.id,
            name: r.player.name,
            photo: r.player.photo,
          },
          type: r.player.type,
          reason: r.player.reason,
          fixture: {
            date: r.fixture?.date,
            league: r.league?.name,
          }
        }))
      };
    }

    setCache(type, result);
    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
