// netlify/functions/football.js
// football-data.org 무료 플랜
// UCL 포함 (공식 무료 지원) — /competitions/CL/matches 사용

const BASE = 'https://api.football-data.org/v4';
const ARSENAL_ID = 57;

const cache = {};
const TTL = 30 * 60 * 1000;
function getCache(k) { const c = cache[k]; return (c && Date.now() - c.ts < TTL) ? c.data : null; }
function setCache(k, d) { cache[k] = { data: d, ts: Date.now() }; }

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
      // PL + UCL + FAC 병렬 조회 (모두 football-data.org 무료 지원)
      // SCHEDULED, TIMED: 예정 / FINISHED: 종료 / IN_PLAY, PAUSED: 진행 중
      const COMPS = ['PL', 'CL', 'FAC'];

      const responses = await Promise.all(
        COMPS.map(comp =>
          fetch(`${BASE}/competitions/${comp}/matches?status=SCHEDULED,TIMED,IN_PLAY,PAUSED,FINISHED&limit=38`, { headers: H })
            .then(r => r.ok ? r.json() : { matches: [] })
            .catch(() => ({ matches: [] }))
        )
      );

      // 아스날 경기만 필터
      const allMatches = responses
        .flatMap(j => j.matches || [])
        .filter(m => m.homeTeam?.id === ARSENAL_ID || m.awayTeam?.id === ARSENAL_ID);

      const mapMatch = m => ({
        id: m.id,
        competition: m.competition?.name || '',
        competitionCode: m.competition?.code || 'PL',
        date: m.utcDate,
        status: m.status,
        homeTeam: {
          id: m.homeTeam?.id,
          name: m.homeTeam?.name || '',
          shortName: m.homeTeam?.shortName || '',
          crest: m.homeTeam?.crest || '',
        },
        awayTeam: {
          id: m.awayTeam?.id,
          name: m.awayTeam?.name || '',
          shortName: m.awayTeam?.shortName || '',
          crest: m.awayTeam?.crest || '',
        },
        score: m.score,
        venue: m.venue || '',
      });

      // 예정+진행: 날짜 오름차순, 가장 가까운 3개
      const upcoming = allMatches
        .filter(m => ['SCHEDULED', 'TIMED', 'IN_PLAY', 'PAUSED'].includes(m.status))
        .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))
        .slice(0, 3)
        .map(mapMatch);

      // 종료: 날짜 내림차순, 가장 최근 3개
      const finished = allMatches
        .filter(m => m.status === 'FINISHED')
        .sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate))
        .slice(0, 3)
        .map(mapMatch);

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
          team: {
            id: row.team?.id,
            name: row.team?.name || '',
            shortName: row.team?.shortName || '',
            crest: row.team?.crest || '',
          },
          playedGames: row.playedGames,
          won: row.won, draw: row.draw, lost: row.lost,
          points: row.points,
          goalsFor: row.goalsFor, goalsAgainst: row.goalsAgainst,
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
