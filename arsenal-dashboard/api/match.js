// api/match.js — ESPN 경기 상세 (골, 이벤트, 팀 스탯)

const SLUG_MAP = {
  PL:  'eng.1',
  UCL: 'uefa.champions',
  EFL: 'eng.league_cup',
  FAC: 'eng.fa',
};

const cache = {};
const TTL = 5 * 60 * 1000;

function findSlug(eventId) {
  // slug를 모를 경우 eng.1 먼저 시도 후 순회
  return Object.values(SLUG_MAP);
}

async function fetchSummary(slug, eventId) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/summary?event=${eventId}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) return null;
  const data = await r.json();
  // 유효한 응답인지 확인
  if (!data.header && !data.boxscore) return null;
  return data;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { id: eventId, slug } = req.query;
  if (!eventId) return res.status(400).json({ error: 'event id required' });

  const cacheKey = eventId;
  if (cache[cacheKey] && Date.now() - cache[cacheKey].ts < TTL) {
    return res.json(cache[cacheKey].data);
  }

  try {
    // slug 있으면 바로, 없으면 순회
    let raw = null;
    const slugsToTry = slug ? [slug] : Object.values(SLUG_MAP);
    for (const s of slugsToTry) {
      raw = await fetchSummary(s, eventId);
      if (raw) break;
    }
    if (!raw) return res.status(404).json({ error: 'match not found' });

    const comp   = raw.header?.competitions?.[0];
    const home   = comp?.competitors?.find(c => c.homeAway === 'home');
    const away   = comp?.competitors?.find(c => c.homeAway === 'away');

    // ── 골/이벤트 타임라인 ──
    const events = [];
    for (const play of (raw.plays || [])) {
      const type = play.type?.text || '';
      const isGoal     = /goal/i.test(type) && !/own/i.test(type) && !/disallow/i.test(type);
      const isOwnGoal  = /own.goal/i.test(type);
      const isRedCard  = /red.card|straight.red|second.yellow/i.test(type);
      const isYellow   = /yellow.card/i.test(type) && !/second/i.test(type);
      const isPenMiss  = /penalty.miss|pen.miss/i.test(type);

      if (!isGoal && !isOwnGoal && !isRedCard && !isYellow) continue;

      events.push({
        minute:    play.clock?.displayValue || play.period?.displayValue || '',
        type:      isGoal ? 'goal' : isOwnGoal ? 'own_goal' : isRedCard ? 'red_card' : 'yellow_card',
        player:    play.participants?.[0]?.athlete?.displayName || play.text || '',
        teamId:    play.team?.id || '',
        homeAway:  play.team?.id === home?.team?.id ? 'home' : 'away',
        isPenMiss,
      });
    }

    // ── 팀 스탯 ──
    const STAT_KEYS = {
      possessionPct:    '점유율',
      totalShots:       '슈팅',
      shotsOnTarget:    '유효슈팅',
      passingAccuracy:  '패스성공률',
      cornerKicks:      '코너킥',
      offsides:         '오프사이드',
      yellowCards:      '경고',
      redCards:         '퇴장',
    };

    function extractStats(competitor) {
      const stats = {};
      for (const s of (competitor?.statistics || [])) {
        const n = s.name || s.abbreviation || '';
        if (STAT_KEYS[n] !== undefined) {
          stats[n] = s.displayValue || s.value || '0';
        }
        // 다양한 키명 대응
        if (/possess/i.test(n))    stats.possessionPct   = s.displayValue || s.value || '0';
        if (/^shots$/i.test(n) || n==='totalShots') stats.totalShots = s.displayValue || s.value || '0';
        if (/shots.on/i.test(n))   stats.shotsOnTarget   = s.displayValue || s.value || '0';
        if (/pass.*acc/i.test(n) || /pass.*pct/i.test(n)) stats.passingAccuracy = s.displayValue || s.value || '0';
        if (/corner/i.test(n))     stats.cornerKicks     = s.displayValue || s.value || '0';
        if (/offside/i.test(n))    stats.offsides        = s.displayValue || s.value || '0';
        if (/yellow/i.test(n))     stats.yellowCards     = s.displayValue || s.value || '0';
        if (/red.card/i.test(n))   stats.redCards        = s.displayValue || s.value || '0';
      }
      return stats;
    }

    const result = {
      eventId,
      homeTeam: {
        id:    home?.team?.id,
        name:  home?.team?.displayName || home?.team?.name,
        crest: home?.team?.logo || (home?.team?.id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${home.team.id}.png` : null),
        score: home?.score || 0,
        stats: extractStats(home),
      },
      awayTeam: {
        id:    away?.team?.id,
        name:  away?.team?.displayName || away?.team?.name,
        crest: away?.team?.logo || (away?.team?.id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${away.team.id}.png` : null),
        score: away?.score || 0,
        stats: extractStats(away),
      },
      events,
      status: comp?.status?.type?.description || '',
    };

    cache[cacheKey] = { data: result, ts: Date.now() };
    return res.json(result);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
