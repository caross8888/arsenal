// api/match.js — ESPN 경기 상세
const SLUG_MAP = {
  PL:  'eng.1',
  UCL: 'uefa.champions',
  EFL: 'eng.league_cup',
  FAC: 'eng.fa',
};

const cache = {};
const TTL = 5 * 60 * 1000;

// 종료된 경기의 상세는 다시는 안 바뀐다 — 메모리 캐시(5분, 인스턴스별)로는
// 같은 경기를 계속 다시 받게 되므로 KV에 사실상 영구 저장한다. 한 번 누가
// 열어본 경기는 이후 모든 사용자에게 스피너 없이 즉시 뜬다.
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
async function kvGet(key){
  if(!KV_URL || !KV_TOKEN) return null;
  try {
    const r = await fetch(KV_URL, {
      method:'POST',
      headers:{Authorization:`Bearer ${KV_TOKEN}`,'Content-Type':'application/json'},
      body: JSON.stringify(['GET', key]),
      signal: AbortSignal.timeout(5000),
    });
    if(!r.ok) return null;
    const {result} = await r.json();
    return result ? JSON.parse(result) : null;
  } catch(_){ return null; }
}
// ttlSec이 없으면 만료 없이 영구 저장
async function kvSet(key, data, ttlSec){
  if(!KV_URL || !KV_TOKEN) return;
  try {
    const cmd = ttlSec
      ? ['SET', key, JSON.stringify(data), 'EX', String(ttlSec)]
      : ['SET', key, JSON.stringify(data)];
    await fetch(KV_URL, {
      method:'POST',
      headers:{Authorization:`Bearer ${KV_TOKEN}`,'Content-Type':'application/json'},
      body: JSON.stringify(cmd),
      signal: AbortSignal.timeout(5000),
    });
  } catch(_){}
}

const FOTMOB_HEADERS = {
  'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
};

// 일정 목록이 Fotmob 기반으로 바뀌면서 경기 id도 Fotmob 것(7자리)이 넘어온다.
// ESPN id(9자리)와 체계가 달라 그대로는 조회가 안 되므로, Fotmob id로 날짜와
// 양 팀 이름을 알아낸 뒤 그 날짜의 ESPN 스코어보드에서 같은 경기를 찾아
// ESPN id로 환산한다. 상세 데이터 자체를 Fotmob으로 옮기더라도 이 경로는
// ESPN 폴백용으로 계속 쓰인다.
async function resolveEspnIdFromFotmob(fotmobId){
  const r = await fetch(`https://www.fotmob.com/api/data/matchDetails?matchId=${fotmobId}`,
    {headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(8000)});
  if(!r.ok) return null;
  const d = await r.json();
  const g = d.general || {};
  const utc = g.matchTimeUTCDate || g.matchTimeUTC;
  if(!utc) return null;
  const dateStr = new Date(utc).toISOString().slice(0,10).replace(/-/g,'');
  const norm = s => String(s||'').toLowerCase().replace(/[^a-z]/g,'');
  const wanted = [norm(g.homeTeam?.name), norm(g.awayTeam?.name)].sort().join('|');

  const sr = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=${dateStr}&limit=1000`,
    {headers: {'User-Agent':'Mozilla/5.0'}, signal: AbortSignal.timeout(8000)});
  if(!sr.ok) return null;
  const sj = await sr.json();
  for(const e of (sj.events || [])){
    const cs = e.competitions?.[0]?.competitors || [];
    const names = cs.map(c => norm(c.team?.shortDisplayName || c.team?.displayName || c.team?.name)).sort().join('|');
    if(names === wanted) return e.id;
  }
  return null;
}

// ── Fotmob 경기 상세 ─────────────────────────────────────────
// ESPN엔 없는 xG·큰 기회·박스 내 터치·선수 평점이 여기서 들어온다.
// 출력 모양은 아래 ESPN 경로와 동일하게 맞춘다 — 프론트가 둘을 구분하지 않도록.
const FM_STAT_LABEL = {
  'Ball possession':'점유율', 'Expected goals (xG)':'xG', 'Total shots':'슈팅',
  'Shots on target':'유효슈팅', 'Shots off target':'유효슈팅 외', 'Blocked shots':'막힌 슈팅',
  'Shots inside box':'박스 안 슈팅', 'Shots outside box':'박스 밖 슈팅', 'Hit woodwork':'골대 강타',
  'Touches in opposition box':'박스 내 터치', 'Big chances':'큰 기회', 'Big chances missed':'큰 기회 놓침',
  'Accurate passes':'정확한 패스', 'Passes':'패스', 'Own half':'자기 진영 패스', 'Opposition half':'상대 진영 패스',
  'Accurate long balls':'정확한 롱볼', 'Accurate crosses':'정확한 크로스', 'Throws':'스로인',
  'Offsides':'오프사이드', 'Corners':'코너킥', 'Fouls committed':'반칙',
  'Yellow cards':'경고', 'Red cards':'퇴장', 'Tackles':'태클', 'Interceptions':'인터셉트',
  'Blocks':'블록', 'Clearances':'클리어링', 'Keeper saves':'선방',
  'Duels won':'경합 승리', 'Ground duels won':'지상 경합', 'Aerial duels won':'공중 경합',
  'Successful dribbles':'드리블 성공', 'xG open play':'xG(오픈플레이)', 'xG set play':'xG(세트피스)',
  'xG non-penalty':'xG(PK 제외)', 'xG on target (xGOT)':'xGOT',
  'Distance covered':'활동량', 'Sprinting distance':'스프린트 거리', 'Number of sprints':'스프린트 횟수',
};
const FM_GROUP_LABEL = {
  'Top stats':'주요 스탯', 'Shots':'슈팅', 'Expected goals (xG)':'기대 득점',
  'Passes':'패스', 'Defence':'수비', 'Duels':'경합', 'Discipline':'징계',
  'Physical performance':'활동량',
};
// 값이 낮을수록 좋은 항목(반칙·카드류)만 별도 표기 — 나머지는 높은 쪽이 우세
const FM_LOWER_IS_BETTER = new Set(['반칙','경고','퇴장','큰 기회 놓침']);
const FM_POS_BY_ID = {0:'GK', 1:'DF', 2:'MF', 3:'FW'};
// 거리 항목은 미터로 온다(팀 합계 116576 = 116.6km) — 그대로 두면 숫자가 의미
// 없으니 km로 환산해서 보여준다.
const FM_DISTANCE_LABELS = new Set(['활동량','스프린트 거리']);
const fmFormatStat = (label, v) => FM_DISTANCE_LABELS.has(label) && !isNaN(parseFloat(v))
  ? (parseFloat(v)/1000).toFixed(1)+'km'
  : String(v);

function fmStatWinner(label, hv, av){
  const num = v => parseFloat(String(v).replace('%','').replace(/[()]/g,' ').trim().split(' ')[0]);
  const h = num(hv), a = num(av);
  if(isNaN(h) || isNaN(a) || h === a) return null;
  return FM_LOWER_IS_BETTER.has(label) ? (h < a ? 'home' : 'away') : (h > a ? 'home' : 'away');
}

async function buildFromFotmob(matchId){
  const r = await fetch(`https://www.fotmob.com/api/data/matchDetails?matchId=${matchId}`,
    {headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(9000)});
  if(!r.ok) return null;
  const d = await r.json();
  const general = d.general || {};
  const header = d.header || {};
  const content = d.content || {};
  const mf = content.matchFacts || {};
  if(!general.matchId) return null;

  const teamsArr = header.teams || [];
  const crest = id => id ? `https://images.fotmob.com/image_resources/logo/teamlogo/${id}.png` : null;
  // teamColors는 {darkMode:{home,away}, lightMode:{...}} 형태로 중첩돼 있다 —
  // 예전엔 colors[side]로 바로 꺼내다 undefined가 나와서 피치 유니폼 색이
  // 통째로 빠졌다. 앱이 다크 기준이라 darkMode를 쓰고 lightMode로 폴백한다.
  const colors = general.teamColors || {};
  const colorOf = side => colors.darkMode?.[side] || colors.lightMode?.[side] || null;
  const mkTeam = (t, side) => ({
    id: t?.id != null ? String(t.id) : null,
    name: t?.name || '',
    crest: crest(t?.id),
    score: typeof t?.score === 'number' ? t.score : null,
    stats: {},
    color: colorOf(side),
    alternateColor: null,
  });
  const home = mkTeam(teamsArr[0], 'home');
  const away = mkTeam(teamsArr[1], 'away');

  // ── 팀 스탯 ──
  const groups = content.stats?.Periods?.All?.stats || [];
  const teamStats = [];
  for(const grp of groups){
    const cat = FM_GROUP_LABEL[grp.title] || grp.title || '';
    for(const it of (grp.stats || [])){
      const vals = it.stats || [];
      const hv = vals[0], av = vals[1];
      if(hv == null || av == null) continue;          // 그룹 헤더 행(값이 null)
      const label = FM_STAT_LABEL[it.title] || it.title;
      if(!label) continue;
      const hs = fmFormatStat(label, hv), as_ = fmFormatStat(label, av);
      teamStats.push({label, cat, home: hs, away: as_, better: fmStatWinner(label, hv, av)});
      home.stats[label] = hs;
      away.stats[label] = as_;
    }
  }

  // ── 이벤트(골/퇴장) ──
  const events = [];
  for(const ev of (mf.events?.events || [])){
    const type = String(ev.type || '');
    const isGoal = type === 'Goal';
    const isRed = type === 'Card' && /red/i.test(String(ev.card || ''));
    if(!isGoal && !isRed) continue;
    const own = /own/i.test(String(ev.goalDescription || ''));
    const pen = /penalty/i.test(String(ev.goalDescription || ''));
    const added = ev.overloadTime ? `+${ev.overloadTime}` : '';
    events.push({
      minute: `${ev.time}${added}'`,
      type: own ? 'own_goal' : pen ? 'pen_goal' : isGoal ? 'goal' : 'red_card',
      player: ev.nameStr || ev.player?.name || '',
      homeAway: ev.isHome ? 'home' : 'away',
    });
  }

  // ── 선수 ──
  // 개별 스탯은 lineup이 아니라 playerStats에 들어있어서 id로 합친다.
  const psById = content.playerStats || {};
  // 교체 상대(누구와 바뀌었는지)는 Substitution 이벤트의 swap 배열에만 있다 —
  // swap[0]이 투입, swap[1]이 아웃(라인업의 subIn/subOut 기록과 대조해 확인).
  // 선수 id → 상대 선수 {name, jersey}로 만들어 둔다.
  const shirtById = {};
  for(const side of ['homeTeam','awayTeam']){
    const t = content.lineup?.[side] || {};
    for(const p of [...(t.starters||[]), ...(t.subs||[])]) shirtById[String(p.id)] = p.shirtNumber;
  }
  const swapPartner = {};
  for(const ev of (mf.events?.events || [])){
    if(String(ev.type) !== 'Substitution') continue;
    const [inP, outP] = ev.swap || [];
    if(!inP || !outP) continue;
    const mk = q => ({name: q.name, jersey: shirtById[String(q.id)] != null ? String(shirtById[String(q.id)]) : ''});
    swapPartner[String(outP.id)] = mk(inP);   // 나간 선수 → 들어온 선수
    swapPartner[String(inP.id)]  = mk(outP);  // 들어온 선수 → 나간 선수
  }

  // 카드는 playerStats에 없고 이벤트에만 있어서 선수별로 집계해둔다.
  const cardsByPlayer = {};
  for(const ev of (mf.events?.events || [])){
    if(String(ev.type) !== 'Card') continue;
    const pid = String(ev.player?.id || '');
    if(!pid) continue;
    if(!cardsByPlayer[pid]) cardsByPlayer[pid] = {yellow: 0, red: 0};
    if(/red/i.test(String(ev.card || ''))) cardsByPlayer[pid].red++;
    else cardsByPlayer[pid].yellow++;
  }
  // 항목에 따라 key가 비어있는 것도 있어서(예: Shots on target) 영문 title로도 찾는다
  const statVal = (p, keyOrTitle) => {
    for(const grp of (p?.stats || [])){
      for(const [title, v] of Object.entries(grp.stats || {})){
        if(v?.key === keyOrTitle || title === keyOrTitle) return v?.stat?.value;
      }
    }
    return undefined;
  };
  const mapPlayer = (p, starter) => {
    const ps = psById[String(p.id)];
    const subEv = (p.performance?.substitutionEvents || []);
    const subIn = subEv.find(e => e.type === 'subIn');
    const subOut = subEv.find(e => e.type === 'subOut');
    const v = p.verticalLayout || {};
    return {
      name: p.name,
      jersey: p.shirtNumber != null ? String(p.shirtNumber) : '',
      // Fotmob은 포지션을 숫자로 준다(0=GK,1=DF,2=MF,3=FW). 프론트 getPosBadge가
      // GK/DF/MF/FW 문자열을 그대로 인식하므로 여기서 환산해 넘긴다.
      position: FM_POS_BY_ID[p.usualPlayingPositionId] || '',
      starter,
      formationPlace: null,
      // Fotmob은 포메이션 슬롯 번호 대신 정규화 좌표를 준다 — 프론트가 이걸
      // 그대로 쓰면 FORM_MAP에 없는 대형도 그릴 수 있다.
      layout: (starter && v.x != null) ? {x: v.x, y: v.y} : null,
      // lineup의 rating은 소수 1자리로 반올림된 값이고, playerStats에 2자리
      // 원본(8.39)이 있다. 최고평점자를 가릴 때 1자리로는 동점이 잦아서
      // 정밀한 쪽을 쓴다 — 화면에는 어차피 1자리로 표시한다.
      rating: statVal(ps, 'FotMob rating') ?? p.performance?.rating ?? null,
      subbedOut: !!subOut,
      subbedIn: !!subIn,
      subTime: subIn ? `${subIn.time}'` : subOut ? `${subOut.time}'` : null,
      subFor: swapPartner[String(p.id)] || null,
      stats: {
        goals: statVal(ps, 'goals'),
        assists: statVal(ps, 'assists'),
        shots: statVal(ps, 'total_shots'),
        shotsOnTarget: statVal(ps, 'Shots on target'),
        fouls: statVal(ps, 'fouls'),
        yellowCards: cardsByPlayer[String(p.id)]?.yellow,
        redCards: cardsByPlayer[String(p.id)]?.red,
      },
    };
  };
  const sidePlayers = side => {
    const t = content.lineup?.[side] || {};
    return [
      ...(t.starters || []).map(p => mapPlayer(p, true)),
      ...(t.subs || []).map(p => mapPlayer(p, false)),
    ].filter(p => p.name);
  };
  const players = {
    home: sidePlayers('homeTeam'),
    away: sidePlayers('awayTeam'),
    homeFormation: content.lineup?.homeTeam?.formation || '',
    awayFormation: content.lineup?.awayTeam?.formation || '',
  };

  // ── 상대 전적 ──
  const h2hRaw = content.h2h || {};
  // 최상위 finished는 항상 false로 오고 실제 값은 status.finished에 있다.
  // 배열은 최신순이라 앞에서부터 5개를 집으면 최근 맞대결이 된다.
  const h2hMatches = (h2hRaw.matches || []).filter(m => m.status?.finished).slice(0, 5);
  const h2h = h2hMatches.length ? {
    summary: Array.isArray(h2hRaw.summary) ? `${h2hRaw.summary[0]}승 ${h2hRaw.summary[1]}무 ${h2hRaw.summary[2]}패` : '',
    seriesScore: '',
    events: h2hMatches.map(m => {
      const [hs, as_] = String(m.status?.scoreStr || '').split(' - ');
      return {
        date: m.time?.utcTime || null,
        homeTeam: {id: String(m.home?.id), name: m.home?.name, crest: crest(m.home?.id)},
        awayTeam: {id: String(m.away?.id), name: m.away?.name, crest: crest(m.away?.id)},
        homeScore: hs ?? null, awayScore: as_ ?? null,
      };
    }),
  } : null;

  // ── 최근 5경기 폼 ──
  const recentForm = (mf.teamForm || []).map((formArr, i) => {
    const t = teamsArr[i] || {};
    return {
      teamId: t.id != null ? String(t.id) : null,
      teamName: t.name || '',
      events: (formArr || []).slice(-5).map(f => ({
        date: f.date?.utcTime || null,
        opponent: {name: (f.linkToMatch || '').split('/')[2] || '', crest: f.imageUrl || null},
        score: f.score || '',
        result: f.resultString || '',
      })),
    };
  });

  // 매치 도미넌스(모멘텀) — 분당 -100~100, 양수면 홈 우세. 오래된 경기는
  // Fotmob이 아예 안 주므로(2010년 경기 실측) 없으면 null로 넘겨 화면에서 숨긴다.
  const momentumRaw = content.momentum?.main?.data;
  const momentum = Array.isArray(momentumRaw) && momentumRaw.length
    ? momentumRaw.map(d => ({minute: d.minute, value: d.value}))
    : null;

  const ib = mf.infoBox || {};
  return {
    eventId: String(matchId),
    source: 'fotmob',
    utcDate: general.matchTimeUTCDate || general.matchTimeUTC || null,
    momentum,
    venue: ib.Stadium?.name || null,
    referee: ib.Referee?.text || null,
    attendance: ib.Attendance ?? null,
    homeTeam: home,
    awayTeam: away,
    teamStats,
    events,
    commentary: [],
    players,
    h2h,
    recentForm,
    status: general.finished ? 'Full Time' : general.started ? 'In Progress' : 'Scheduled',
  };
}

// Fotmob은 텍스트 중계를 공개 API로 주지 않는다(라이브 경기에서도 liveticker가
// 비어 있고, 실제 데이터가 있는 S3 경로는 403). 그래서 코멘터리만 ESPN에서
// 따로 가져온다 — 라이브 경기의 "코멘트" 탭을 열 때만 호출된다.
async function fetchEspnCommentary(eventId){
  let espnId = /^\d{9,}$/.test(String(eventId)) ? String(eventId) : await resolveEspnIdFromFotmob(eventId);
  if(!espnId) return [];
  for(const s of Object.values(SLUG_MAP)){
    try {
      const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${s}/summary?event=${espnId}`,
        {headers: {'User-Agent':'Mozilla/5.0'}, signal: AbortSignal.timeout(7000)});
      if(!r.ok) continue;
      const raw = await r.json();
      if(!raw?.commentary) continue;
      const comp = raw.header?.competitions?.[0];
      const teamNameToSide = {};
      for(const c of (comp?.competitors || [])){
        const nm = c.team?.displayName || c.team?.name;
        if(nm) teamNameToSide[nm] = c.homeAway;
      }
      return raw.commentary
        .filter(c => c.text)
        .map(c => ({
          minute: c.play?.clock?.displayValue || c.time?.displayValue || null,
          text: c.text,
          homeAway: c.play?.team?.displayName ? (teamNameToSide[c.play.team.displayName] || null) : null,
        }))
        .reverse();
    } catch(_){}
  }
  return [];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { id: eventId, slug } = req.query;
  if (!eventId) return res.status(400).json({ error: 'event id required' });

  // 코멘터리만 따로 (라이브 경기 "코멘트" 탭 전용, 지연 로드)
  if (req.query.commentary) {
    const ck = `commentary:${eventId}`;
    if (cache[ck] && Date.now() - cache[ck].ts < 60 * 1000) return res.json(cache[ck].data);
    const commentary = await fetchEspnCommentary(eventId);
    const payload = { commentary };
    cache[ck] = { data: payload, ts: Date.now() };
    return res.json(payload);
  }

  const cacheKey = eventId;
  if (cache[cacheKey] && Date.now() - cache[cacheKey].ts < TTL) {
    return res.json(cache[cacheKey].data);
  }

  try {
    // 종료 경기는 KV에 영구 보관되어 있으면 그대로 — Fotmob을 아예 안 부른다.
    const kvHit = await kvGet(`match:${eventId}`);
    if (kvHit) {
      cache[cacheKey] = { data: kvHit, ts: Date.now() };
      return res.json(kvHit);
    }

    // Fotmob 우선 — 실패하면 아래 ESPN 경로로 흘러간다(폴백).
    try {
      const fm = await buildFromFotmob(eventId);
      if (fm) {
        cache[cacheKey] = { data: fm, ts: Date.now() };
        // 종료 경기만 KV에 보관하되, 끝난 직후에는 선수 평점·스탯이 아직
        // 확정 전이라 그대로 굳히면 미완성 데이터가 영구히 남는다. 하루가
        // 지난 경기만 영구 저장하고, 갓 끝난 경기는 1시간짜리로 둔다.
        if (fm.status === 'Full Time') {
          const age = fm.utcDate ? Date.now() - new Date(fm.utcDate).getTime() : 0;
          const settled = age > 24 * 60 * 60 * 1000;
          await kvSet(`match:${eventId}`, fm, settled ? null : 60 * 60);
        }
        return res.json(fm);
      }
    } catch (_) {}

    let raw = null;
    let espnId = eventId;
    const slugsToTry = slug ? [slug] : Object.values(SLUG_MAP);
    for (const s of slugsToTry) {
      try {
        const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${s}/summary?event=${espnId}`;
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(7000),
        });
        if (!r.ok) continue;
        const data = await r.json();
        if (data && (data.header || data.boxscore || data.plays)) { raw = data; break; }
      } catch (_) {}
    }
    // ESPN id로 못 찾았으면 Fotmob id로 보고 환산해서 한 번 더 시도
    if (!raw) {
      try {
        const resolved = await resolveEspnIdFromFotmob(eventId);
        if (resolved) {
          espnId = resolved;
          for (const s of slugsToTry) {
            try {
              const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${s}/summary?event=${espnId}`, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                signal: AbortSignal.timeout(7000),
              });
              if (!r.ok) continue;
              const data = await r.json();
              if (data && (data.header || data.boxscore || data.plays)) { raw = data; break; }
            } catch (_) {}
          }
        }
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
