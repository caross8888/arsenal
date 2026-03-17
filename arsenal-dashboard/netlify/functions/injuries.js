// netlify/functions/injuries.js
// FPL (Fantasy Premier League) API 사용
// 완전 무료, 인증 없음, 현재 부상자 실시간 반영

const FPL_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';
const ARSENAL_TEAM_NAME = 'Arsenal';

const STATUS_LABEL = {
  'i': '부상',
  'd': '출전 의심',
  's': '출장 정지',
  'u': '결장',
};

const POS_LABEL = {
  1: 'GK',
  2: 'DF',
  3: 'MF',
  4: 'FW',
};

const cache = {};
const TTL = 15 * 60 * 1000; // 15분

exports.handler = async () => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=900',
  };

  if (cache.data && Date.now() - cache.ts < TTL) {
    return { statusCode: 200, headers, body: JSON.stringify(cache.data) };
  }

  try {
    const res = await fetch(FPL_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Arsenal-Dashboard/1.0)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`FPL API: ${res.status}`);
    const json = await res.json();

    // 아스날 팀 ID 찾기
    const arsenalTeam = json.teams.find(t => t.name === ARSENAL_TEAM_NAME);
    if (!arsenalTeam) throw new Error('Arsenal team not found in FPL data');

    const arsenalId = arsenalTeam.id;

    // 전체 아스날 선수
    const allArsenal = json.elements
      .filter(p => p.team === arsenalId)
      .map(p => ({
        id: p.id,
        name: p.web_name,
        fullName: `${p.first_name} ${p.second_name}`,
        status: p.status,         // a/i/d/s/u
        statusLabel: STATUS_LABEL[p.status] || p.status,
        news: p.news || '',
        newsAdded: p.news_added,
        chanceOfPlaying: p.chance_of_playing_next_round,
        position: POS_LABEL[p.element_type] || '?',
        positionType: p.element_type,
      }));

    // 부상/결장/의심 선수 (available 제외)
    const injured = allArsenal
      .filter(p => p.status !== 'a')
      .sort((a, b) => {
        // 심각도 순: injured > doubtful > suspended > unavailable
        const order = { i: 0, d: 1, s: 2, u: 3 };
        return (order[a.status] ?? 9) - (order[b.status] ?? 9);
      });

    const result = {
      teamId: arsenalId,
      totalPlayers: allArsenal.length,
      injuredCount: injured.length,
      availableCount: allArsenal.filter(p => p.status === 'a').length,
      injured,
      updatedAt: new Date().toISOString(),
    };

    cache.data = result;
    cache.ts = Date.now();

    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
