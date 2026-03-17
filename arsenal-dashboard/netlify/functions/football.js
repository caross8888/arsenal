// netlify/functions/football.js
const BASE = 'https://api.football-data.org/v4';
const ARSENAL_ID = 57;

const cache = {};
const TTL = 30 * 60 * 1000; // 30분 (예정경기는 자주 갱신)
function getCache(k) { const c = cache[k]; return (c && Date.now() - c.ts < TTL) ? c.data : null; }
function setCache(k, d) { cache[k] = { data: d, ts: Date.now() }; }

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=1800',
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
      // 무료 플랜: PL만 가능 (UCL/FAC는 403)
      // 최근 5경기 + 다음 5경기를 넉넉히 가져오기 위해
      // FINISHED 따로, SCHEDULED 따로 조회 (status 필터 없이 limit 늘리면 더 잘 나옴)
      const [finRes, schedRes] = await Promise.all([
        fetch(`${BASE}/teams/${ARSENAL_ID}/matches?status=FINISHED&limit=5`, { headers: H })
          .then(r => r.ok ? r.json() : { matches: [] })
          .catch(() => ({ matches: [] })),
        fetch(`${BASE}/teams/${ARSENAL_ID}/matches?status=SCHEDULED,TIMED&limit=5`, { headers: H })
          .then(r => r.ok ? r.json() : { matches: [] })
          .catch(() => ({ matches: [] })),
      ]);

      // 팀 엔드포인트가 막히면 PL 컴피티션으로 fallback
      let finMatches = (finRes.matches || []);
      let schedMatches = (schedRes.matches || []);

      // 팀 엔드포인트 실패 시 PL 전체에서 필터
      if (!finMatches.length && !schedMatches.length) {
        const plRes = await fetch(`${BASE}/competitions/PL/matches?limit=50`, { headers: H })
          .then(r => r.ok ? r.json() : { matches: [] })
          .catch(() => ({ matches: [] }));
        const allPL = (plRes.matches || []).filter(m =>
          m.homeTeam?.id === ARSENAL_ID || m.awayTeam?.id === ARSENAL_ID
        );
        finMatches = allPL.filter(m => m.status === 'FINISHED').sort((a,b) => new Date(b.utcDate) - new Date(a.utcDate)).slice(0, 3);
        schedMatches = allPL.filter(m => ['SCHEDULED','IN_PLAY','PAUSED'].includes(m.status)).sort((a,b) => new Date(a.utcDate) - new Date(b.utcDate)).slice(0, 3);
      }

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

      // 예정: 가장 가까운 순, 종료: 최신 순
      const upcoming = schedMatches
        .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))
        .slice(0, 3)
        .map(mapMatch);

      const finished = finMatches
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
        squad: (json.squad || []).map(p => ({
          id: p.id, name: p.name, position: p.position,
          nationality: p.nationality, shirtNumber: p.shirtNumber,
        }))
      };
    }

    setCache(type, result);
    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
