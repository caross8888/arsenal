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
        if (data && (data.header || data.boxscore || data.plays)) { raw = data; break; }
      } catch (_) {}
    }
    if (!raw) return res.status(404).json({ error: 'match not found - tried slugs: ' + slugsToTry.join(',') + ' for event: ' + eventId });

    // ── 팀 정보 ──
    const comp = raw.header?.competitions?.[0];
    const bsTeams = raw.boxscore?.teams || [];
    const getTeam = (homeAway) => {
      const hTeam = comp?.competitors?.find(c => c.homeAway === homeAway);
      const bTeam = bsTeams.find(t => t.homeAway === homeAway);
      const teamData = hTeam?.team || bTeam?.team || {};
      const id = teamData.id || hTeam?.id;
      return {
        id,
        name: teamData.shortDisplayName || teamData.displayName || teamData.name || '',
        crest: teamData.logo || (id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png` : null),
        color: teamData.color ? '#'+teamData.color : null,
        alternateColor: teamData.alternateColor ? '#'+teamData.alternateColor : null,
        score: parseInt(hTeam?.score || comp?.status?.type?.shortDetail?.split('-')?.[0] || 0),
        statistics: bTeam?.statistics || [],
      };
    };
    const home = getTeam('home');
    const away = getTeam('away');

    // ── 스탯 파싱 ──
    // ESPN boxscore.teams[].statistics의 실제 raw 필드명 기준(실측 확인) +
    // 혹시 다른 대회/시기에 다르게 내려올 수 있는 변형 이름들을 같이 매핑.
    const STAT_KEY_MAP = {
      'possessionPct':'possessionPct','possession':'possessionPct','Possession':'possessionPct',
      'totalShots':'totalShots','shots':'totalShots','Shots':'totalShots',
      'shotsOnTarget':'shotsOnTarget','shotsonTarget':'shotsOnTarget','onTargetShotCount':'shotsOnTarget','Shots on Target':'shotsOnTarget',
      'shotPct':'shotAccuracy','shotAccuracy':'shotAccuracy',
      'blockedShots':'blockedShots',
      'penaltyKickGoals':'penaltyGoals',
      'penaltyKickShots':'penaltyShots',
      'passingAccuracy':'passingAccuracy','passAccuracy':'passingAccuracy','PassAccuracy':'passingAccuracy','passPct':'passingAccuracy',
      'accuratePasses':'passesCompleted',
      'totalPasses':'passesAttempted',
      'accurateCrosses':'crossesCompleted',
      'totalCrosses':'crossesAttempted',
      'crossPct':'crossAccuracy',
      'accurateLongBalls':'longBallsCompleted',
      'totalLongBalls':'longBallsAttempted',
      'longballPct':'longBallAccuracy',
      'saves':'saves',
      'effectiveTackles':'tacklesWon',
      'totalTackles':'tacklesAttempted',
      'tacklePct':'tackleAccuracy',
      'interceptions':'interceptions',
      'effectiveClearance':'clearances','totalClearance':'clearances',
      'cornerKicks':'cornerKicks','corners':'cornerKicks','Corners':'cornerKicks','wonCorners':'cornerKicks',
      'offsides':'offsides','Offsides':'offsides',
      'foulsCommitted':'foulsCommitted','fouls':'foulsCommitted',
      'yellowCards':'yellowCards','yellowCard':'yellowCards','YellowCards':'yellowCards',
      'redCards':'redCards','redCard':'redCards','RedCards':'redCards',
      'expectedGoals':'xG','xG':'xG','XG':'xG','Expected Goals':'xG','expectedgoals':'xG',
    };
    function parseStats(statistics) {
      const result = {};
      for (const stat of (statistics || [])) {
        const name = stat.name || stat.abbreviation || stat.label || '';
        const mapped = STAT_KEY_MAP[name];
        if (mapped) {
          if (!result[mapped]) result[mapped] = stat.displayValue ?? stat.value ?? '0';
          continue; // 이름으로 이미 정확히 매칭됐으면 아래 느슨한 라벨 추측은 건너뛴다 —
          // 안 그러면 예를 들어 "Accurate Passes"(성공 패스 개수) 항목이
          // label.includes('acc')에 걸려서 패스 성공률(passingAccuracy) 자리에
          // 잘못 들어가는 식의 오매칭이 생긴다(실제로 겪은 버그).
        }
        const label = (stat.label || stat.text || '').toLowerCase();
        if (!result.possessionPct && label.includes('possess')) result.possessionPct = stat.displayValue ?? stat.value ?? '0';
        if (!result.totalShots && /^shots?$/.test(label)) result.totalShots = stat.displayValue ?? stat.value ?? '0';
        if (!result.shotsOnTarget && label.includes('on target')) result.shotsOnTarget = stat.displayValue ?? stat.value ?? '0';
        if (!result.passingAccuracy && label.includes('pass') && (label.includes('acc')||label.includes('pct')||label.includes('%'))) result.passingAccuracy = stat.displayValue ?? stat.value ?? '0';
        if (!result.cornerKicks && label.includes('corner')) result.cornerKicks = stat.displayValue ?? stat.value ?? '0';
        if (!result.offsides && label.includes('offside')) result.offsides = stat.displayValue ?? stat.value ?? '0';
        if (!result.yellowCards && label.includes('yellow')) result.yellowCards = stat.displayValue ?? stat.value ?? '0';
        if (!result.redCards && label.includes('red')) result.redCards = stat.displayValue ?? stat.value ?? '0';
        if (!result.xG && (label.includes('expected goal') || label === 'xg')) result.xG = stat.displayValue ?? stat.value ?? null;
      }
      return result;
    }
    home.stats = parseStats(home.statistics);
    away.stats = parseStats(away.statistics);

    if (!Object.keys(home.stats).length || !Object.keys(away.stats).length) {
      const bsStats = raw.boxscore?.stats || [];
      for (const grp of bsStats) {
        for (const stat of (grp.stats || grp.statistics || [grp])) {
          const name = stat.name || stat.label || '';
          const mapped = STAT_KEY_MAP[name];
          const teams = stat.teams || stat.team || [];
          if (Array.isArray(teams) && teams.length >= 2) {
            const hVal = teams[0]?.displayValue ?? teams[0]?.value;
            const aVal = teams[1]?.displayValue ?? teams[1]?.value;
            if (mapped) {
              if (!home.stats[mapped] && hVal != null) home.stats[mapped] = String(hVal);
              if (!away.stats[mapped] && aVal != null) away.stats[mapped] = String(aVal);
            }
          }
        }
      }
    }

    // ── 선수 ID -> 짧은 이름(예: "K. Havertz") 매핑 ──
    // keyEvents/plays의 athlete 객체엔 shortName이 아예 없고 displayName(풀네임)만
    // 내려오는데, 같은 응답의 rosters 쪽엔 shortName이 있어서 ID로 가져온다.
    const athleteShortNameById = {};
    for (const rosterEntry of (raw.rosters || [])) {
      for (const p of (rosterEntry.roster || [])) {
        const ath = p.athlete;
        if (ath?.id && ath.shortName) athleteShortNameById[ath.id] = ath.shortName;
      }
    }

    // ── 이벤트 타임라인 ──
    const events = [];
    const keyMoments = raw.keyMoments || raw.keyEvents || [];
    const plays = raw.plays || [];
    const eventSource = keyMoments.length ? keyMoments : plays;
    for (const ev of eventSource) {
      const typeText = (ev.type?.text || ev.type?.id || ev.text || '').toLowerCase();
      const isPenGoal = typeText.includes('penalty - scored') || typeText.includes('penalty scored');
      const isGoal = (typeText.includes('goal') || isPenGoal) && !typeText.includes('disallow') && !typeText.includes('no goal') && !typeText.includes('miss') && !typeText.includes('saved');
      const isOwnGoal = typeText.includes('own goal') || typeText.includes('own-goal');
      const isRed = typeText.includes('red card') || typeText.includes('straight red') || typeText.includes('second yellow');
      if (!isGoal && !isOwnGoal && !isRed) continue;
      const rawMin = ev.clock?.displayValue || ev.period?.clock?.displayValue || ev.time?.displayValue || '';
      // ESPN은 "22:37" (MM:SS 경과시간) 포맷으로 내려옴 → "22'" 형태로 변환
      let min = rawMin;
      if (/^\d{1,2}:\d{2}$/.test(rawMin)) {
        const elapsed = parseInt(rawMin.split(':')[0], 10);
        const periodNum = ev.period?.number || 1;
        // 추가 시간 보정: 전반 45분 초과, 후반 90분 초과
        const base = periodNum === 2 ? 45 : periodNum === 3 ? 90 : periodNum === 4 ? 105 : 0;
        min = (base + elapsed) + "'";
      } else if (!min) {
        min = ev.period?.number === 2 ? '45+?' : '?';
      }
      const evAthleteId = ev.participants?.[0]?.athlete?.id || ev.athlete?.id;
      const player = (evAthleteId && athleteShortNameById[evAthleteId])
        || ev.participants?.[0]?.athlete?.shortName || ev.participants?.[0]?.athlete?.displayName
        || ev.athlete?.shortName || ev.athlete?.displayName || ev.text?.split(' ')?.[0] || '';
      const evTeamId = ev.team?.id || ev.teamId;
      // 타입 불일치 방지: 숫자/문자열 모두 문자열로 변환 후 비교
      const homeAway = String(evTeamId) === String(home.id) ? 'home' : 'away';
      events.push({ minute: min, type: isOwnGoal ? 'own_goal' : isPenGoal ? 'pen_goal' : isGoal ? 'goal' : 'red_card', player, homeAway });
    }

    if (!home.score && !away.score && comp) {
      const hComp = comp.competitors?.find(c => c.homeAway === 'home');
      const aComp = comp.competitors?.find(c => c.homeAway === 'away');
      home.score = parseInt(hComp?.score || 0);
      away.score = parseInt(aComp?.score || 0);
    }

    // ── 경기 코멘터리 (전체 텍스트 중계 피드) ──
    const teamNameToSide = {};
    for (const c of (comp?.competitors || [])) {
      const nm = c.team?.displayName || c.team?.name;
      if (nm) teamNameToSide[nm] = c.homeAway;
    }
    const commentary = (raw.commentary || [])
      .filter(c => c.text)
      .map(c => {
        const rawMin = c.play?.clock?.displayValue || c.time?.displayValue || '';
        const teamName = c.play?.team?.displayName;
        return {
          minute: rawMin || null,
          text: c.text,
          homeAway: teamName ? (teamNameToSide[teamName] || null) : null,
        };
      })
      .reverse(); // 최신 코멘터리가 위로 오도록

    const venue = raw.header?.competitions?.[0]?.venue?.fullName || raw.gameInfo?.venue?.fullName || raw.venue?.fullName || null;

    // ── 상대전적(H2H) ──
    // H2H는 항상 이 경기의 두 팀(home/away)끼리의 과거 맞대결이라, 이름은
    // seasonseries 쪽 team 객체(shortDisplayName 없음) 대신 위에서 이미 계산한
    // home/away의 이름(fixtures/results와 동일하게 shortDisplayName 우선)을
    // id로 매칭해 재사용한다 — 칸이 좁은 카드라 "Nottingham Forest" 같은
    // 풀네임 대신 "Nottm Forest" 식 축약명으로 통일하기 위함.
    const shortNameById = { [home.id]: home.name, [away.id]: away.name };
    const seasonSeriesRaw = (raw.seasonseries || [])[0] || null;
    const h2h = seasonSeriesRaw ? {
      summary: seasonSeriesRaw.summary || '',
      seriesScore: seasonSeriesRaw.seriesScore || '',
      events: (seasonSeriesRaw.events || []).slice(0, 5).map(e => {
        const hc = (e.competitors || []).find(c => c.homeAway === 'home') || {};
        const ac = (e.competitors || []).find(c => c.homeAway === 'away') || {};
        return {
          date: e.date || null,
          homeTeam: hc.team ? { id: hc.team.id, name: shortNameById[hc.team.id] || hc.team.displayName || hc.team.abbreviation, crest: hc.team.logo } : null,
          awayTeam: ac.team ? { id: ac.team.id, name: shortNameById[ac.team.id] || ac.team.displayName || ac.team.abbreviation, crest: ac.team.logo } : null,
          homeScore: hc.score, awayScore: ac.score,
        };
      }),
    } : null;

    // ── 양팀 최근 5경기 폼 ──
    const recentForm = (raw.lastFiveGames || []).map(t => ({
      teamId: t.team?.id,
      teamName: t.team?.displayName || t.team?.abbreviation || '',
      events: (t.events || []).slice(-5).map(ev => {
        // ESPN의 gameResult 필드를 그대로 믿지 않는다 — 프리시즌 친선경기
        // 몇 건에서 실제 스코어(홈/원정 점수)와 gameResult가 서로 어긋나는
        // 걸 확인했다(예: 2-3 패배인데 gameResult만 "W"). 같은 응답 안의
        // 스코어 필드는 정확하므로 거기서 직접 계산한다.
        const isHome = String(ev.homeTeamId) === String(t.team?.id);
        const ownScore = parseInt(isHome ? ev.homeTeamScore : ev.awayTeamScore, 10);
        const oppScore = parseInt(isHome ? ev.awayTeamScore : ev.homeTeamScore, 10);
        const result = (Number.isNaN(ownScore) || Number.isNaN(oppScore))
          ? (ev.gameResult || '')
          : (ownScore > oppScore ? 'W' : ownScore < oppScore ? 'L' : 'D');
        return {
          date: ev.gameDate || null,
          opponent: ev.opponent ? { name: ev.opponent.displayName || ev.opponent.abbreviation, crest: ev.opponent.logo } : null,
          score: ev.score || '',
          result,
          competition: ev.leagueAbbreviation || ev.competitionName || '',
        };
      }),
    }));

    // ── 주심 & 관중 ──
    const officials = raw.gameInfo?.officials || comp?.officials || [];
    const referee = officials.find(o => (o.position?.displayName || o.role || '').toLowerCase().includes('referee'))?.fullName
      || officials[0]?.fullName || null;
    const attendance = comp?.attendance || raw.gameInfo?.attendance || null;

    // ── 선수 스탯 ──
    function parsePlayers(rosterEntry) {
      const roster = rosterEntry?.roster || [];
      return roster.map(p => {
        const ath = p.athlete || {};
        const stats = {};
        for (const s of (p.stats || [])) {
          const n = (s.name || '').toLowerCase();
          if (n === 'totalgoals')     stats.goals = s.displayValue;
          if (n === 'shotsontarget')  stats.shotsOnTarget = s.displayValue;
          if (n === 'totalshots')     stats.shots = s.displayValue;
          if (n === 'goalassists')    stats.assists = s.displayValue;
          if (n === 'yellowcards')    stats.yellowCards = s.displayValue;
          if (n === 'redcards')       stats.redCards = s.displayValue;
          if (n === 'foulscommitted') stats.fouls = s.displayValue;
        }
        // 교체 시간 및 교체 선수
        const subPlay = (p.plays||[]).find(pl=>pl.substitution);
        const subTime = subPlay?.clock?.displayValue || null;
        const subForRaw = p.subbedOutFor ? {
          name: p.subbedOutFor.athlete?.shortName || p.subbedOutFor.athlete?.displayName || '',
          jersey: p.subbedOutFor.jersey || '',
        } : null;
        // shortName 없으면 "성" 앞글자 이니셜로 단축: "Gabriel Jesus" → "G Jesus"
        const subFor = subForRaw ? {
          name: (()=>{
            const n = subForRaw.name;
            const parts = n.split(' ');
            if(parts.length <= 1) return n;
            return parts[0][0] + ' ' + parts.slice(1).join(' ');
          })(),
          jersey: subForRaw.jersey,
        } : null;
        return {
          name:          ath.shortName || ath.displayName || '',
          jersey:        p.jersey || '',
          position:      p.position?.abbreviation || ath.position?.abbreviation || '',
          starter:       p.starter || false,
          formationPlace: p.formationPlace ? parseInt(p.formationPlace) : null,
          subbedOut:     p.subbedOut || false,
          subbedIn:      p.subbedIn || false,
          subTime,
          subFor,
          stats,
        };
      }).filter(p => p.name);
    }

    const rawRosters = raw.rosters || [];
    const homeRoster = rawRosters.find(t => t.homeAway === 'home');
    const awayRoster = rawRosters.find(t => t.homeAway === 'away');
    const players = {
      home: parsePlayers(homeRoster),
      away: parsePlayers(awayRoster),
      homeFormation: homeRoster?.formation || '',
      awayFormation: awayRoster?.formation || '',
      homeUniformColor: homeRoster?.uniform?.color ? '#'+homeRoster.uniform.color : null,
      awayUniformColor: awayRoster?.uniform?.color ? '#'+awayRoster.uniform.color : null,
    };

    // teamStats 배열 변환 (buildLiveDetail용)
    const STAT_DISPLAY = [
      // premierleague.com 공식 경기 스탯 페이지의 카테고리(Attack/Possession/
      // Defence/Discipline) 구성과 최대한 동일하게 맞춘 것 — 다만 PL은 Big
      // Chances/Shots Off Target/Shots In-Out the Box/Hit Woodwork/Through
      // Balls/Touches/Dribbles/Duels도 보여주는데 ESPN 원본엔 이 지표들이
      // 아예 없어서(실측 확인) 못 넣는다. PK 스탯은 반대로 ESPN엔 있지만
      // PL 스탯 페이지엔 안 나와서 PL 기준에 맞춰 뺐다.
      // dir: 'high'=값이 클수록 우세, 'low'=값이 작을수록 우세, 없으면 우열 비교 안 함
      // (예: 블락된 슈팅/시도성 스탯처럼 크다고 반드시 좋은 게 아닌 경우).
      // premierleague.com 실측 기준(오프사이드 5:0에서 0쪽에 강조 표시) — 파울류는
      // 전부 low.
      // 공격 (Attack)
      { key:'totalShots',      label:'슈팅',        cat:'공격', dir:'high' },
      { key:'shotsOnTarget',   label:'유효슈팅',      cat:'공격', dir:'high' },
      { key:'shotAccuracy',    label:'슈팅 정확도',    cat:'공격', dir:'high' },
      { key:'blockedShots',    label:'블락된 슈팅',    cat:'공격' },
      { key:'xG',              label:'xG',          cat:'공격', dir:'high' },
      { key:'cornerKicks',     label:'코너킥',        cat:'공격', dir:'high' },
      { key:'crossAccuracy',   label:'크로스 성공률',   cat:'공격', dir:'high' },
      { key:'crossesCompleted',label:'성공 크로스',    cat:'공격', dir:'high' },
      { key:'crossesAttempted',label:'시도 크로스',    cat:'공격' },
      // 점유 (Possession)
      { key:'possessionPct',   label:'점유율',        cat:'점유', dir:'high' },
      { key:'passingAccuracy', label:'패스 성공률',    cat:'점유', dir:'high' },
      { key:'passesCompleted', label:'성공 패스',      cat:'점유', dir:'high' },
      { key:'passesAttempted', label:'시도 패스',      cat:'점유' },
      { key:'longBallAccuracy',label:'롱패스 성공률',   cat:'점유', dir:'high' },
      { key:'longBallsCompleted',label:'성공 롱패스',  cat:'점유', dir:'high' },
      { key:'longBallsAttempted',label:'시도 롱패스',  cat:'점유' },
      // 수비 (Defence)
      { key:'saves',           label:'선방',         cat:'수비', dir:'high' },
      { key:'tackleAccuracy',  label:'태클 성공률',    cat:'수비', dir:'high' },
      { key:'tacklesWon',      label:'성공 태클',      cat:'수비', dir:'high' },
      { key:'tacklesAttempted',label:'시도 태클',      cat:'수비' },
      { key:'interceptions',   label:'인터셉트',      cat:'수비', dir:'high' },
      { key:'clearances',      label:'클리어런스',    cat:'수비', dir:'high' },
      // 징계 (Discipline) — 전부 적을수록 우세
      { key:'offsides',        label:'오프사이드',    cat:'징계', dir:'low' },
      { key:'foulsCommitted',  label:'파울',          cat:'징계', dir:'low' },
      { key:'yellowCards',     label:'경고',          cat:'징계', dir:'low' },
      { key:'redCards',        label:'퇴장',          cat:'징계', dir:'low' },
    ];
    // dir에 따라 어느 쪽이 우세한지 판정 — '%'/소수 문자열 다 파싱, 동률/dir
    // 없음/파싱 불가 시엔 강조 없음(null).
    function statWinner(dir, hv, av) {
      if (!dir) return null;
      const h = parseFloat(String(hv).replace('%', ''));
      const a = parseFloat(String(av).replace('%', ''));
      if (isNaN(h) || isNaN(a) || h === a) return null;
      return dir === 'low' ? (h < a ? 'home' : 'away') : (h > a ? 'home' : 'away');
    }
    // premierleague.com은 카테고리 분류 위에 "Top Stats"로 점유율/xG/슈팅/유효슈팅/
    // 코너킥/선방을 한 번 더 요약해서 보여준다(같은 스탯이 아래 카테고리에도
    // 중복 노출되는 것까지 동일). Big Chances는 PL에만 있고 ESPN 원본엔 없어서 제외.
    const TOP_STAT_ORDER = ['possessionPct','xG','totalShots','shotsOnTarget','cornerKicks','saves'];
    const topStats = TOP_STAT_ORDER
      .map(key => STAT_DISPLAY.find(s => s.key === key))
      .filter(s => s && (home.stats[s.key] != null || away.stats[s.key] != null))
      .map(s => {
        const hv = home.stats[s.key] ?? '0', av = away.stats[s.key] ?? '0';
        return { label: s.label, cat: '주요 스탯', home: hv, away: av, better: statWinner(s.dir, hv, av) };
      });
    const teamStats = [
      ...topStats,
      // 점유율은 위 주요 스탯에서 이미 큰 바로 보여주므로(PL도 동일) 카테고리
      // 목록에서는 중복 노출하지 않는다.
      ...STAT_DISPLAY
        .filter(s => s.key !== 'possessionPct' && (home.stats[s.key] != null || away.stats[s.key] != null))
        .map(s => {
          const hv = home.stats[s.key] ?? '0', av = away.stats[s.key] ?? '0';
          return { label: s.label, cat: s.cat, home: hv, away: av, better: statWinner(s.dir, hv, av) };
        })
    ];

    const result = {
      eventId,
      venue,
      referee,
      attendance,
      homeTeam: { id: home.id, name: home.name, crest: home.crest, score: home.score, stats: home.stats, color: home.color, alternateColor: home.alternateColor },
      awayTeam: { id: away.id, name: away.name, crest: away.crest, score: away.score, stats: away.stats, color: away.color, alternateColor: away.alternateColor },
      teamStats,
      events,
      commentary,
      players,
      h2h,
      recentForm,
      status: comp?.status?.type?.description || '',
    };

    cache[cacheKey] = { data: result, ts: Date.now() };
    return res.json(result);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
