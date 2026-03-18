// api/match.js — ESPN 경기 상세

const SLUG_MAP = {
  PL:  'eng.1',
  UCL: 'uefa.champions',
  EFL: 'eng.league_cup',
  FAC: 'eng.fa',
};

const cache = {};
const TTL = 5 * 60 * 1000;

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
      try {
        const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${s}/summary?event=${eventId}`;
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(7000),
        });
        if (!r.ok) continue;
        const data = await r.json();
        if (data && (data.header || data.boxscore || data.plays)) {
          raw = data;
          break;
        }
      } catch (_) {}
    }

    if (!raw) return res.status(404).json({ error: 'match not found - tried slugs: ' + slugsToTry.join(',') + ' for event: ' + eventId });

    // ── 팀 정보 (header 또는 boxscore에서) ──
    const comp = raw.header?.competitions?.[0];
    const bsTeams = raw.boxscore?.teams || [];

    const getTeam = (homeAway) => {
      // header에서
      const hTeam = comp?.competitors?.find(c => c.homeAway === homeAway);
      // boxscore에서
      const bTeam = bsTeams.find(t => t.homeAway === homeAway);
      const teamData = hTeam?.team || bTeam?.team || {};
      const id = teamData.id || hTeam?.id;
      return {
        id,
        name:  teamData.displayName || teamData.name || '',
        crest: teamData.logo || (id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png` : null),
        score: parseInt(hTeam?.score || comp?.status?.type?.shortDetail?.split('-')?.[0] || 0),
        statistics: bTeam?.statistics || [],
      };
    };

    const home = getTeam('home');
    const away = getTeam('away');

    // ── 스탯 파싱 (boxscore.teams[].statistics) ──
    const STAT_KEY_MAP = {
      // ESPN 필드명 → 우리 키
      'possessionPct':         'possessionPct',
      'possession':            'possessionPct',
      'Possession':            'possessionPct',
      'totalShots':            'totalShots',
      'shots':                 'totalShots',
      'Shots':                 'totalShots',
      'shotsOnTarget':         'shotsOnTarget',
      'shotsonTarget':         'shotsOnTarget',
      'onTargetShotCount':     'shotsOnTarget',
      'Shots on Target':       'shotsOnTarget',
      'passingAccuracy':       'passingAccuracy',
      'passAccuracy':          'passingAccuracy',
      'PassAccuracy':          'passingAccuracy',
      'cornerKicks':           'cornerKicks',
      'corners':               'cornerKicks',
      'Corners':               'cornerKicks',
      'offsides':              'offsides',
      'Offsides':              'offsides',
      'yellowCards':           'yellowCards',
      'yellowCard':            'yellowCards',
      'YellowCards':           'yellowCards',
      'redCards':              'redCards',
      'redCard':               'redCards',
      'RedCards':              'redCards',
    };

    function parseStats(statistics) {
      const result = {};
      for (const stat of (statistics || [])) {
        const name = stat.name || stat.abbreviation || stat.label || '';
        const mapped = STAT_KEY_MAP[name];
        if (mapped && !result[mapped]) {
          result[mapped] = stat.displayValue ?? stat.value ?? '0';
        }
        // label/text 기반 fallback
        const label = (stat.label || stat.text || '').toLowerCase();
        if (!result.possessionPct && label.includes('possess'))
          result.possessionPct = stat.displayValue ?? stat.value ?? '0';
        if (!result.totalShots && /^shots?$/.test(label))
          result.totalShots = stat.displayValue ?? stat.value ?? '0';
        if (!result.shotsOnTarget && label.includes('on target'))
          result.shotsOnTarget = stat.displayValue ?? stat.value ?? '0';
        if (!result.passingAccuracy && label.includes('pass') && (label.includes('acc') || label.includes('pct') || label.includes('%')))
          result.passingAccuracy = stat.displayValue ?? stat.value ?? '0';
        if (!result.cornerKicks && label.includes('corner'))
          result.cornerKicks = stat.displayValue ?? stat.value ?? '0';
        if (!result.offsides && label.includes('offside'))
          result.offsides = stat.displayValue ?? stat.value ?? '0';
        if (!result.yellowCards && label.includes('yellow'))
          result.yellowCards = stat.displayValue ?? stat.value ?? '0';
        if (!result.redCards && label.includes('red'))
          result.redCards = stat.displayValue ?? stat.value ?? '0';
      }
      return result;
    }

    home.stats = parseStats(home.statistics);
    away.stats = parseStats(away.statistics);

    // ── 이벤트 타임라인 ──
    // ESPN 축구는 keyMoments 또는 plays에서 이벤트 추출
    const events = [];
    const keyMoments = raw.keyMoments || raw.keyEvents || [];
    const plays = raw.plays || [];

    // keyMoments 우선 (있으면 더 깔끔)
    const eventSource = keyMoments.length ? keyMoments : plays;

    for (const ev of eventSource) {
      const typeText = (ev.type?.text || ev.type?.id || ev.text || '').toLowerCase();
      const isPenGoal = typeText.includes('penalty - scored') || typeText.includes('penalty scored');
      const isGoal    = (typeText.includes('goal') || isPenGoal) && !typeText.includes('disallow') && !typeText.includes('no goal') && !typeText.includes('miss') && !typeText.includes('saved');
      const isOwnGoal = typeText.includes('own goal') || typeText.includes('own-goal');
      const isRed = typeText.includes('red card') || typeText.includes('straight red') || typeText.includes('second yellow');

      if (!isGoal && !isOwnGoal && !isRed) continue;

      // 분 추출
      const min = ev.clock?.displayValue
        || ev.period?.clock?.displayValue
        || ev.time?.displayValue
        || (ev.period?.number === 2 ? '45+?' : '?');

      // 선수명
      const player = ev.participants?.[0]?.athlete?.displayName
        || ev.athlete?.displayName
        || ev.text?.split(' ')?.[0]
        || '';

      // 팀
      const evTeamId = ev.team?.id || ev.teamId;
      const homeAway = evTeamId === home.id ? 'home' : 'away';

      events.push({
        minute:  min,
        type:    isOwnGoal ? 'own_goal' : isPenGoal ? 'pen_goal' : isGoal ? 'goal' : 'red_card',
        player,
        homeAway,
      });
    }

    // score 재확인 (header score가 없으면 boxscore에서)
    if (!home.score && !away.score && comp) {
      const hComp = comp.competitors?.find(c => c.homeAway === 'home');
      const aComp = comp.competitors?.find(c => c.homeAway === 'away');
      home.score = parseInt(hComp?.score || 0);
      away.score = parseInt(aComp?.score || 0);
    }

    // ── 경기장 ──
    const venue = raw.header?.competitions?.[0]?.venue?.fullName
      || raw.gameInfo?.venue?.fullName
      || raw.venue?.fullName
      || null;

    // ── 선수 스탯 ──
    function parsePlayers(competitor) {
      const roster = competitor?.roster || competitor?.athletes || [];
      return roster.slice(0, 14).map(p => {
        const ath = p.athlete || p;
        const stats = {};
        for (const s of (p.stats || p.statistics || [])) {
          const n = (s.name || s.abbreviation || '').toLowerCase();
          if (n.includes('rating') || n === 'rat') stats.rating = s.displayValue || s.value;
          if (n === 'shots' || n === 'totalshots') stats.shots = s.displayValue || s.value;
          if (n.includes('passacc') || n.includes('pass%')) stats.passAccuracy = s.displayValue || s.value;
          if (n.includes('dribble') || n === 'drb') stats.dribbles = s.displayValue || s.value;
          if (n.includes('tackle') || n === 'tck') stats.tackles = s.displayValue || s.value;
        }
        return {
          name:     ath.displayName || ath.shortName || ath.name || '',
          jersey:   ath.jersey || p.jersey || '',
          position: (ath.position?.abbreviation || ath.position?.displayAbbreviation || ''),
          stats,
        };
      }).filter(p => p.name);
    }

    const players = {
      home: parsePlayers(bsTeams.find(t => t.homeAway === 'home')),
      away: parsePlayers(bsTeams.find(t => t.homeAway === 'away')),
    };

    const result = {
      eventId,
      venue,
      homeTeam: { id: home.id, name: home.name, crest: home.crest, score: home.score, stats: home.stats },
      awayTeam: { id: away.id, name: away.name, crest: away.crest, score: away.score, stats: away.stats },
      events,
      players,
      status: comp?.status?.type?.description || '',
    };

    cache[cacheKey] = { data: result, ts: Date.now() };
    return res.json(result);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
