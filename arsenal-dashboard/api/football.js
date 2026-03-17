// api/football.js — Vercel Serverless Function
// Netlify: exports.handler = async(event) => {}
// Vercel:  export default async function(req, res) {}

const BASE = 'https://api.football-data.org/v4';
const ARSENAL_ID = 57;
const YOUTH_POSITIONS = ['Defence', 'Midfield', 'Offence'];

const cache = {};
const TTL = 30 * 60 * 1000;
function getCache(k) { const c = cache[k]; return (c && Date.now() - c.ts < TTL) ? c.data : null; }
function setCache(k, d) { cache[k] = { data: d, ts: Date.now() }; }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=1800');

  const type = req.query.type || 'fixtures';
  const nocache = req.query.nocache;

  if (!nocache) {
    const hit = getCache(type);
    if (hit) return res.json(hit);
  }

  const KEY = process.env.FOOTBALL_DATA_KEY;
  if (!KEY) return res.status(500).json({ error: 'FOOTBALL_DATA_KEY 환경변수 없음' });
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
      const r = await fetch(`${BASE}/competitions/PL/standings`, { headers: H });
      if (!r.ok) throw new Error(`football-data: ${r.status}`);
      const json = await r.json();
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
      const r = await fetch(`${BASE}/teams/${ARSENAL_ID}`, { headers: H });
      if (!r.ok) throw new Error(`football-data: ${r.status}`);
      const json = await r.json();
      result = {
        squad: (json.squad || [])
          .filter(p => p.position && p.position !== 'null' && !YOUTH_POSITIONS.includes(p.position))
          .map(p => ({ id: p.id, name: p.name, position: p.position, nationality: p.nationality, shirtNumber: p.shirtNumber }))
      };
    }

    if (!nocache) setCache(type, result);
    return res.json(result);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
