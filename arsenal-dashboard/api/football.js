// api/football.js — Vercel Serverless Function
const BASE = 'https://api.football-data.org/v4';
const FPL_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';
const ARSENAL_ID = 57;        // football-data.org
const ARSENAL_FPL_ID = 3;     // FPL

const cache = {};
const TTL = 30 * 60 * 1000;
function getCache(k) { const c = cache[k]; return (c && Date.now() - c.ts < TTL) ? c.data : null; }
function setCache(k, d) { cache[k] = { data: d, ts: Date.now() }; }

// FPL 포지션 타입
const FPL_POS = { 1: 'GK', 2: 'DF', 3: 'MF', 4: 'FW' };

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
  const H = KEY ? { 'X-Auth-Token': KEY } : {};

  try {
    let result;

    if (type === 'fixtures') {
      if (!KEY) return res.status(500).json({ error: 'FOOTBALL_DATA_KEY 없음' });
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
      if (!KEY) return res.status(500).json({ error: 'FOOTBALL_DATA_KEY 없음' });
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
      // FPL API로 선수단 + 스탯 가져오기
      // - 출전 기록(minutes > 0) 있는 선수만 → 1군 + 유소년 중 1군 출전자 포함
      // - goals_scored, assists → 공격포인트
      // - photo → FPL 공식 선수 사진
      const r = await fetch(FPL_URL, {
        headers: { 'User-Agent': 'Arsenal-Dashboard/1.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw new Error(`FPL API: ${r.status}`);
      const json = await r.json();

      // 국적 매핑 (FPL은 국적 코드만 줌 → football-data.org로 보완)
      // FPL에는 nationality 없으므로 이름 기반으로 매핑
      const squadMap = {};
      if (KEY) {
        try {
          const sqRes = await fetch(`${BASE}/teams/${ARSENAL_ID}`, { headers: H });
          if (sqRes.ok) {
            const sqJson = await sqRes.json();
            (sqJson.squad || []).forEach(p => { squadMap[p.name.toLowerCase()] = p; });
          }
        } catch (_) {}
      }

      const arsenal = json.teams.find(t => t.id === ARSENAL_FPL_ID);
      if (!arsenal) throw new Error('Arsenal not found in FPL');

      const players = json.elements
        .filter(p => p.team === ARSENAL_FPL_ID && p.minutes > 0) // 출전 기록 있는 선수만
        .map(p => {
          const posGroup = FPL_POS[p.element_type] || 'MF';
          const fullName = `${p.first_name} ${p.second_name}`;
          // football-data.org에서 국적 찾기
          const fdPlayer = squadMap[fullName.toLowerCase()] || squadMap[p.second_name.toLowerCase()];
          return {
            id: p.id,
            name: p.web_name,
            fullName,
            nationality: fdPlayer?.nationality || '',
            posGroup,          // GK / DF / MF / FW
            shirtNumber: fdPlayer?.shirtNumber || null,
            // 스탯
            goals: p.goals_scored,
            assists: p.assists,
            minutes: p.minutes,
            appearances: Math.round(p.minutes / 90),
            // FPL 공식 사진 URL
            photo: p.photo ? `https://resources.premierleague.com/premierleague/photos/players/110x140/p${p.photo.replace('.jpg','')}` : null,
          };
        })
        .sort((a, b) => {
          // 포지션 순 정렬: GK → DF → MF → FW
          const order = { GK: 0, DF: 1, MF: 2, FW: 3 };
          return (order[a.posGroup] ?? 9) - (order[b.posGroup] ?? 9);
        });

      result = { squad: players };

    }

    if (!nocache) setCache(type, result);
    return res.json(result);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
