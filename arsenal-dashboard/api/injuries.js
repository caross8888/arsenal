// api/injuries.js — Vercel Serverless Function
// FPL API 기반 현재 부상/결장 선수
// minutes > 0 필터 → 1군 + 1군 경기 출전 선수만 표시

const FPL_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';
const ARSENAL_TEAM_NAME = 'Arsenal';
const STATUS_LABEL = { 'i': '부상', 'd': '출전 의심', 's': '출장 정지', 'u': '결장' };
const POS_LABEL = { 1: 'GK', 2: 'DF', 3: 'MF', 4: 'FW' };

const cache = {};
const TTL = 15 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=900');

  if (cache.data && Date.now() - cache.ts < TTL) return res.json(cache.data);

  try {
    const r = await fetch(FPL_URL, {
      headers: { 'User-Agent': 'Arsenal-Dashboard/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`FPL API: ${r.status}`);
    const json = await r.json();

    const arsenalTeam = json.teams.find(t => t.name === ARSENAL_TEAM_NAME);
    if (!arsenalTeam) throw new Error('Arsenal not found');
    const arsenalId = arsenalTeam.id;

    const allArsenal = json.elements
      .filter(p => p.team === arsenalId)
      .map(p => ({
        id: p.id,
        name: p.web_name,
        fullName: `${p.first_name} ${p.second_name}`,
        status: p.status,
        statusLabel: STATUS_LABEL[p.status] || p.status,
        news: p.news || '',
        chanceOfPlaying: p.chance_of_playing_next_round,
        position: POS_LABEL[p.element_type] || '?',
        positionType: p.element_type,
        minutes: p.minutes,
      }));

    // 부상/결장 중 & 1군 출전 기록 있는 선수만 (minutes > 0)
    const injured = allArsenal
      .filter(p => p.status !== 'a' && p.minutes > 0)
      .sort((a, b) => ({ i: 0, d: 1, s: 2, u: 3 }[a.status] ?? 9) - ({ i: 0, d: 1, s: 2, u: 3 }[b.status] ?? 9));

    const result = {
      teamId: arsenalId,
      totalPlayers: allArsenal.length,
      injuredCount: injured.length,
      availableCount: allArsenal.filter(p => p.status === 'a' && p.minutes > 0).length,
      injured,
      updatedAt: new Date().toISOString(),
    };

    cache.data = result;
    cache.ts = Date.now();
    return res.json(result);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
