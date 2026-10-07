// api/pick.js — 승부예측(프리미어리그 라운드 10경기 승·무·패)
//
//   GET  ?a=round[&r=N]                 → 라운드 경기·참여 비율(공개, CDN 60초 캐시)
//   GET  ?a=mine&r=N         (로그인)   → 그 라운드 내 예측
//   POST ?a=signup  {nick, pw}          → 가입 + 로그인 토큰
//   POST ?a=login   {nick, pw}          → 로그인 토큰
//   POST ?a=save    {round, picks}  (로그인) → 예측 저장(킥오프 지난 경기는 무시)
//   GET  ?a=board&m=season|YYYY-MM      → 랭킹 TOP 100(공개, CDN 60초 캐시)
//   GET  ?a=me      (로그인)            → 내 순위·점수(이번 달·시즌)
//   POST ?a=reset   {nick, pw}  (관리자, CRON_SECRET) → 비밀번호 초기화
//
// 규칙(사용자와 정한 것):
//  - 현재 라운드만 예측할 수 있다. 경기별로 킥오프 시각이 지나면 그 경기만 잠긴다(서버 시간 기준).
//  - 맞히면 1점, 라운드 전 경기를 다 맞히면 +3. 랭킹은 이번 달(KST 킥오프 날짜 기준)과 시즌 두 가지.
//  - 동점이면 적중률 → 먼저 저장한 사람.
//  - 닉네임 + 비밀번호 가입. 비밀번호는 scrypt 해시만 저장(원문은 어디에도 남기지 않는다 — 로그에도).
//
// KV 사용(무료 플랜 부담을 줄이려는 구조):
//  - 일정·결과는 Fotmob에서 받아 인스턴스 메모리에 5분 캐시(KV 안 씀).
//  - 로그인은 서명 토큰이라 확인에 KV를 안 쓴다. 가입·로그인할 때만 1~3회.
//  - 예측 저장 1회 저장당 2~3회. 참여 비율은 라운드 예측 해시를 통째로 읽어 계산(1회, 60초 캐시).
//  - 채점은 크론 없이, 경기가 끝난 뒤 누군가 랭킹·라운드를 처음 볼 때 한 번 한다.

import crypto from 'crypto';

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const FOTMOB_HEADERS = {'User-Agent': 'Mozilla/5.0'};
const PL_LEAGUE = 47;

const TOKEN_DAYS = 365;
const PW_MIN = 4, PW_MAX = 20, NICK_MAX = 12;
const FAIL_LIMIT = 5, FAIL_LOCK_SEC = 10 * 60;
const SIGNUP_PER_IP_DAY = 3;
const ALL_HIT_BONUS = 3;
const MAIN_BLOCK_DAYS = 4;   // 라운드의 "본 일정" — 중앙 킥오프 ±4일. 밖으로 밀린 경기는 연기 경기로 본다.

// 프리미어리그 팀 한국어 이름(Fotmob 팀 id). 없는 팀(승격팀 등)은 Fotmob 짧은 이름을 그대로 쓴다.
const KO_TEAM = {
  9825: '아스날', 8456: '맨시티', 8650: '리버풀', 8455: '첼시', 8586: '토트넘', 10260: '맨유', 10261: '뉴캐슬',
  10252: '애스턴 빌라', 10204: '브라이턴', 9937: '브렌트퍼드', 9826: '팰리스', 8668: '에버턴', 8678: '본머스',
  10203: '노팅엄', 9879: '풀럼', 8463: '리즈', 8472: '선덜랜드', 8669: '코번트리', 8667: '헐 시티', 9902: '입스위치',
  8654: '웨스트햄', 8602: '울버햄튼', 8191: '번리', 8197: '레스터', 8466: '사우샘프턴', 8346: '셰필드',
};

async function kv(...args){
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: {Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json'},
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(6000),
  });
  const j = await r.json();
  if(j.error) throw new Error(`KV ${args[0]}: ${j.error}`);
  return j.result;
}
// 여러 명령을 한 번의 HTTP로(명령 수는 그대로 센다 — 왕복만 줄인다).
async function kvPipe(cmds){
  if(!cmds.length) return [];
  const r = await fetch(KV_URL.replace(/\/$/, '') + '/pipeline', {
    method: 'POST',
    headers: {Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json'},
    body: JSON.stringify(cmds),
    signal: AbortSignal.timeout(10000),
  });
  return r.json();
}

// ── 일정 ───────────────────────────────────────────────────────────────
let _fx = null, _fxAt = 0;
async function getFixtures(){
  if(_fx && Date.now() - _fxAt < 5 * 60 * 1000) return _fx;
  const r = await fetch(`https://www.fotmob.com/api/data/leagues?id=${PL_LEAGUE}`, {headers: FOTMOB_HEADERS, signal: AbortSignal.timeout(9000)});
  if(!r.ok) throw new Error(`Fotmob ${r.status}`);
  const d = await r.json();
  const seasonName = String((d.details || {}).selectedSeason || '');           // "2026/2027"
  const season = seasonName.replace(/^(\d{4})\/\d{2}(\d{2})$/, '$1-$2') || 'unknown'; // "2026-27"
  const matches = (((d.fixtures || {}).allMatches) || []).map(m => {
    const st = m.status || {};
    const sc = /^(\d+)\s*-\s*(\d+)$/.exec(String(st.scoreStr || '').trim());
    const done = !!st.finished && !!sc;
    return {
      id: String(m.id), round: Number(m.roundName || m.round) || 0,
      kickoff: st.utcTime || null,
      home: {id: String((m.home || {}).id), name: teamName(m.home)},
      away: {id: String((m.away || {}).id), name: teamName(m.away)},
      started: !!st.started || !!st.finished,
      cancelled: !!st.cancelled,
      done,
      score: done ? `${sc[1]} : ${sc[2]}` : null,
      result: done ? (Number(sc[1]) > Number(sc[2]) ? 'H' : Number(sc[1]) < Number(sc[2]) ? 'A' : 'D') : null,
    };
  }).filter(m => m.round && m.kickoff);
  _fx = {season, matches, rounds: groupRounds(matches)};
  _fxAt = Date.now();
  return _fx;
}
function teamName(t){ t = t || {}; return KO_TEAM[Number(t.id)] || t.shortName || t.name || ''; }

// 라운드별 본 일정 범위를 잡는다 — 연기돼 몇 주 뒤로 밀린 경기가 그 라운드를 계속 "현재"로 붙잡지 않게.
function groupRounds(matches){
  const by = {};
  for(const m of matches) (by[m.round] = by[m.round] || []).push(m);
  const out = {};
  for(const [r, list] of Object.entries(by)){
    const ts = list.map(m => Date.parse(m.kickoff)).sort((a, b) => a - b);
    const mid = ts[Math.floor(ts.length / 2)];
    const win = MAIN_BLOCK_DAYS * 86400000;
    const main = list.filter(m => Math.abs(Date.parse(m.kickoff) - mid) <= win);
    out[r] = {
      round: Number(r), matches: list.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff)),
      start: Math.min(...main.map(m => Date.parse(m.kickoff))),
      lastMain: Math.max(...main.map(m => Date.parse(m.kickoff))),
    };
  }
  return out;
}
// 현재 라운드: 본 일정의 마지막 경기가 아직 시작 안 한 라운드 중 가장 빠른 것.
function currentRound(fx){
  const now = Date.now();
  const rs = Object.values(fx.rounds).sort((a, b) => a.round - b.round);
  const r = rs.find(x => x.lastMain > now);
  return r ? r.round : (rs.length ? rs[rs.length - 1].round : 1);
}
const isOpen = m => !m.started && !m.cancelled && Date.parse(m.kickoff) > Date.now();
// 월 랭킹은 한국 날짜 기준.
const kstMonth = iso => new Date(Date.parse(iso) + 9 * 3600000).toISOString().slice(0, 7);

// ── 계정 ───────────────────────────────────────────────────────────────
// 같은 닉네임 판정: 대소문자·공백·전각/반각 차이는 같은 닉네임으로 본다.
const normNick = s => String(s || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
const BAD_WORDS = /(시발|씨발|ㅅㅂ|병신|ㅂㅅ|좆|존나|개새|새끼|fuck|shit|bitch|nigg)/i;
function checkNick(s){
  const n = String(s || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if(!n) return {error: '닉네임을 입력해 주세요.'};
  if([...n].length > NICK_MAX) return {error: `닉네임은 ${NICK_MAX}자까지 쓸 수 있어요.`};
  if(BAD_WORDS.test(n.replace(/\s/g, ''))) return {error: '쓸 수 없는 단어가 들어 있어요.'};
  return {nick: n, key: normNick(n)};
}
function checkPw(pw, nick){
  pw = String(pw || '');
  if([...pw].length < PW_MIN || [...pw].length > PW_MAX) return `비밀번호는 ${PW_MIN}~${PW_MAX}자로 정해 주세요.`;
  if(nick && normNick(pw) === normNick(nick)) return '닉네임과 같은 비밀번호는 쓸 수 없어요.';
  return null;
}
function hashPw(pw, salt){
  return new Promise((ok, no) => crypto.scrypt(String(pw), salt, 32, {N: 16384, r: 8, p: 1}, (e, k) => e ? no(e) : ok(k.toString('hex'))));
}
function secretKey(){
  const base = process.env.PICK_SECRET || KV_TOKEN || process.env.CRON_SECRET;
  return base ? crypto.createHash('sha256').update('pick-token-v1:' + base).digest() : null;
}
function signToken(key, nick){
  const body = Buffer.from(JSON.stringify({k: key, n: nick, e: Date.now() + TOKEN_DAYS * 86400000})).toString('base64url');
  const sig = crypto.createHmac('sha256', secretKey()).update(body).digest('base64url');
  return body + '.' + sig;
}
function readToken(req){
  const m = /^Bearer\s+(.+)$/.exec(String(req.headers.authorization || ''));
  if(!m || !secretKey()) return null;
  const [body, sig] = m[1].split('.');
  if(!body || !sig) return null;
  const want = crypto.createHmac('sha256', secretKey()).update(body).digest('base64url');
  if(sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try {
    const t = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return t.e > Date.now() ? t : null;
  } catch(_){ return null; }
}
// 쓸 때마다 유효기간을 늘려준다(1년 → 사실상 다시 로그인할 일이 없게). 넉 달 이상 지난 토큰만 새로 준다.
const renew = t => (t.e - Date.now() < (TOKEN_DAYS - 120) * 86400000 ? signToken(t.k, t.n) : undefined);

function clientIp(req){
  return String(req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0] || 'unknown').trim();
}

// ── 채점 ───────────────────────────────────────────────────────────────
// 끝났는데 아직 채점 안 한 경기를 찾아 그 라운드 예측을 채점한다. 동시에 두 요청이 채점하지 않게 잠근다.
let _settledAt = 0;
async function settleIfNeeded(fx){
  if(Date.now() - _settledAt < 60 * 1000) return;
  _settledAt = Date.now();
  const S = fx.season;
  const done = fx.matches.filter(m => m.done);
  if(!done.length) return;
  const settled = new Set(JSON.parse(await kv('GET', `pk:settled:${S}`) || '[]'));
  const fresh = done.filter(m => !settled.has(m.id));
  if(!fresh.length) return;
  const lock = await kv('SET', `pk:lock:${S}`, '1', 'NX', 'EX', 60);
  if(lock !== 'OK') return;
  try {
    const byRound = {};
    for(const m of fresh) (byRound[m.round] = byRound[m.round] || []).push(m);
    const add = {};   // key → {season:{p,h,t}, months:{YYYY-MM:{p,h,t}}}
    const bump = (k, mon, p, h, t) => {
      const a = add[k] = add[k] || {p: 0, h: 0, t: 0, months: {}};
      a.p += p; a.h += h; a.t += t;
      const b = a.months[mon] = a.months[mon] || {p: 0, h: 0, t: 0};
      b.p += p; b.h += h; b.t += t;
    };
    for(const [r, list] of Object.entries(byRound)){
      const flat = await kv('HGETALL', `pk:r:${S}:${r}`) || [];
      const round = fx.rounds[r];
      const playable = round.matches.filter(m => !m.cancelled);
      // 이번 채점으로 라운드가 다 끝나는가(그래야 전 경기 적중 보너스를 줄 수 있다)
      const roundDone = playable.every(m => m.done);
      const lastMon = kstMonth(playable[playable.length - 1].kickoff);
      for(let i = 0; i + 1 < flat.length; i += 2){
        const key = flat[i];
        let rec; try { rec = JSON.parse(flat[i + 1]); } catch(_){ continue; }
        const picks = rec.p || {};
        for(const m of list){
          if(!picks[m.id]) continue;
          const hit = picks[m.id] === m.result ? 1 : 0;
          bump(key, kstMonth(m.kickoff), hit, hit, 1);
        }
        if(roundDone && playable.every(m => picks[m.id] && picks[m.id] === m.result)) bump(key, lastMon, ALL_HIT_BONUS, 0, 0);
      }
    }
    const cmds = [];
    for(const [key, a] of Object.entries(add)){
      cmds.push(['ZINCRBY', `pk:lb:${S}`, a.p, key]);
      cmds.push(['HINCRBY', `pk:st:${S}`, `${key}:h`, a.h], ['HINCRBY', `pk:st:${S}`, `${key}:t`, a.t]);
      for(const [mon, b] of Object.entries(a.months)){
        cmds.push(['ZINCRBY', `pk:lb:${S}:${mon}`, b.p, key]);
        cmds.push(['HINCRBY', `pk:st:${S}:${mon}`, `${key}:h`, b.h], ['HINCRBY', `pk:st:${S}:${mon}`, `${key}:t`, b.t]);
      }
    }
    for(const m of fresh) settled.add(m.id);
    cmds.push(['SET', `pk:settled:${S}`, JSON.stringify([...settled])]);
    await kvPipe(cmds);
    _board.clear();
  } finally {
    await kv('DEL', `pk:lock:${S}`).catch(() => {});
  }
}

// ── 비율 · 랭킹 캐시 ───────────────────────────────────────────────────
const _pct = new Map();   // round → {at, data}
async function roundPct(S, r){
  const hit = _pct.get(r);
  if(hit && Date.now() - hit.at < 60 * 1000) return hit.data;
  const flat = await kv('HGETALL', `pk:r:${S}:${r}`) || [];
  const cnt = {};
  for(let i = 1; i < flat.length; i += 2){
    let rec; try { rec = JSON.parse(flat[i]); } catch(_){ continue; }
    for(const [mid, v] of Object.entries(rec.p || {})){
      const c = cnt[mid] = cnt[mid] || {H: 0, D: 0, A: 0};
      if(c[v] != null) c[v]++;
    }
  }
  const data = {cnt, players: flat.length / 2};
  _pct.set(r, {at: Date.now(), data});
  return data;
}
const _board = new Map();
async function readBoard(S, scope){
  const id = scope === 'season' ? S : `${S}:${scope}`;
  const hit = _board.get(id);
  if(hit && Date.now() - hit.at < 60 * 1000) return hit.data;
  const flat = await kv('ZRANGE', `pk:lb:${id}`, 0, 199, 'REV', 'WITHSCORES') || [];
  const keys = [];
  for(let i = 0; i + 1 < flat.length; i += 2) keys.push([flat[i], Number(flat[i + 1])]);
  let rows = [];
  if(keys.length){
    const fields = keys.flatMap(([k]) => [`${k}:h`, `${k}:t`]);
    const [st, names, firsts] = await Promise.all([
      kv('HMGET', `pk:st:${id}`, ...fields),
      kv('HMGET', 'pk:names', ...keys.map(([k]) => k)),
      kv('HMGET', `pk:first:${S}`, ...keys.map(([k]) => k)),
    ]);
    rows = keys.map(([k, p], i) => {
      const h = Number(st[i * 2]) || 0, t = Number(st[i * 2 + 1]) || 0;
      return {key: k, name: names[i] || k, points: p, hit: h, total: t, acc: t ? h / t : 0, first: Number(firsts[i]) || Infinity};
    });
    rows.sort((a, b) => b.points - a.points || b.acc - a.acc || a.first - b.first);
  }
  const data = rows.slice(0, 100).map((r, i) => ({rank: i + 1, name: r.name, points: r.points, hit: r.hit, total: r.total, key: r.key}));
  _board.set(id, {at: Date.now(), data});
  return data;
}

async function readBody(req){
  if(req.body && typeof req.body === 'object') return req.body;
  if(typeof req.body === 'string'){ try { return JSON.parse(req.body); } catch(_){ return {}; } }
  return {};
}

export default async function handler(req, res){
  res.setHeader('Content-Type', 'application/json');
  const a = String(req.query.a || '');
  try {
    if(!KV_URL || !KV_TOKEN || !secretKey()) return res.status(503).json({error: '승부예측 서버 설정이 아직 안 됐어요.'});

    if(a === 'round'){
      const fx = await getFixtures();
      await settleIfNeeded(fx).catch(() => {});
      const cur = currentRound(fx);
      const r = Math.min(Number(req.query.r) || cur, cur);
      const round = fx.rounds[r];
      if(!round) return res.status(404).json({error: '라운드를 찾을 수 없어요.'});
      const {cnt, players} = await roundPct(fx.season, r);
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=30');
      return res.json({
        season: fx.season, round: r, current: cur, players,
        first: Object.keys(fx.rounds).map(Number).sort((x, y) => x - y)[0],
        matches: round.matches.map(m => {
          const c = cnt[m.id], tot = c ? c.H + c.D + c.A : 0;
          return {
            id: m.id, kickoff: m.kickoff, home: m.home, away: m.away,
            state: m.cancelled ? 'cancelled' : m.done ? 'done' : isOpen(m) ? 'open' : 'locked',
            score: m.score, result: m.result,
            pct: tot ? {H: Math.round(c.H / tot * 100), D: Math.round(c.D / tot * 100), A: Math.round(c.A / tot * 100), n: tot} : null,
          };
        }),
      });
    }

    if(a === 'board'){
      const fx = await getFixtures();
      await settleIfNeeded(fx).catch(() => {});
      const scope = /^\d{4}-\d{2}$/.test(String(req.query.m || '')) ? String(req.query.m) : 'season';
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=30');
      const rows = await readBoard(fx.season, scope);
      return res.json({season: fx.season, scope, rows: rows.map(({key, ...r}) => r)});
    }

    res.setHeader('Cache-Control', 'no-store');

    if(a === 'reset'){
      const secret = process.env.CRON_SECRET;
      if(!secret) return res.status(503).json({error: 'CRON_SECRET 미설정'});
      if(req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({error: 'unauthorized'});
      const body = await readBody(req);
      const key = normNick(body.nick);
      const raw = await kv('GET', `pk:user:${key}`);
      if(!raw) return res.status(404).json({error: '없는 닉네임이에요.'});
      const u = JSON.parse(raw);
      const err = checkPw(body.pw, u.n);
      if(err) return res.status(400).json({error: err});
      const salt = crypto.randomBytes(16).toString('hex');
      await kv('SET', `pk:user:${key}`, JSON.stringify({...u, s: salt, h: await hashPw(body.pw, salt)}));
      await kv('DEL', `pk:fail:${key}`);
      return res.json({ok: true, nick: u.n});
    }

    if(a === 'signup' || a === 'login'){
      if(req.method !== 'POST') return res.status(405).json({error: 'POST만 받습니다'});
      const body = await readBody(req);
      const {nick, key, error} = checkNick(body.nick);
      if(error) return res.status(400).json({error});
      if(a === 'signup'){
        const pwErr = checkPw(body.pw, nick);
        if(pwErr) return res.status(400).json({error: pwErr});
        const day = new Date().toISOString().slice(0, 10);
        const ipKey = `pk:ip:${crypto.createHash('sha256').update(clientIp(req)).digest('hex').slice(0, 16)}:${day}`;
        const n = await kv('INCR', ipKey);
        if(n === 1) await kv('EXPIRE', ipKey, 86400);
        if(n > SIGNUP_PER_IP_DAY) return res.status(429).json({error: '오늘은 이 인터넷에서 더 가입할 수 없어요. 내일 다시 시도해 주세요.'});
        const salt = crypto.randomBytes(16).toString('hex');
        const rec = JSON.stringify({n: nick, s: salt, h: await hashPw(body.pw, salt), c: Date.now()});
        const ok = await kv('SET', `pk:user:${key}`, rec, 'NX');
        if(ok !== 'OK') return res.status(409).json({error: '이미 사용 중인 닉네임이에요.'});
        await kv('HSET', 'pk:names', key, nick);
        return res.json({token: signToken(key, nick), nick});
      }
      // login
      const fails = Number(await kv('GET', `pk:fail:${key}`)) || 0;
      if(fails >= FAIL_LIMIT) return res.status(429).json({error: '비밀번호를 여러 번 틀렸어요. 10분 뒤에 다시 시도해 주세요.'});
      const raw = await kv('GET', `pk:user:${key}`);
      const u = raw ? JSON.parse(raw) : null;
      const okPw = u && crypto.timingSafeEqual(Buffer.from(await hashPw(String(body.pw || ''), u.s), 'hex'), Buffer.from(u.h, 'hex'));
      if(!okPw){
        const f = await kv('INCR', `pk:fail:${key}`);
        if(f === 1) await kv('EXPIRE', `pk:fail:${key}`, FAIL_LOCK_SEC);
        return res.status(401).json({error: '닉네임이나 비밀번호가 맞지 않아요.'});
      }
      if(fails) await kv('DEL', `pk:fail:${key}`);
      return res.json({token: signToken(key, u.n), nick: u.n});
    }

    // ── 로그인 필요 ──
    const t = readToken(req);
    if(!t) return res.status(401).json({error: '로그인이 필요해요.', login: true});
    const fresh = renew(t);

    if(a === 'mine'){
      const fx = await getFixtures();
      const r = Number(req.query.r) || currentRound(fx);
      const raw = await kv('HGET', `pk:r:${fx.season}:${r}`, t.k);
      const rec = raw ? JSON.parse(raw) : null;
      return res.json({round: r, picks: (rec && rec.p) || {}, savedAt: rec ? rec.u : null, nick: t.n, token: fresh});
    }

    if(a === 'save'){
      if(req.method !== 'POST') return res.status(405).json({error: 'POST만 받습니다'});
      const fx = await getFixtures();
      const body = await readBody(req);
      const cur = currentRound(fx);
      const r = Number(body.round);
      if(!r || r > cur || !fx.rounds[r]) return res.status(400).json({error: '지금은 이 라운드를 예측할 수 없어요.'});
      const S = fx.season, hk = `pk:r:${S}:${r}`;
      const raw = await kv('HGET', hk, t.k);
      const prev = raw ? JSON.parse(raw) : {p: {}};
      const picks = {...(prev.p || {})};
      let changed = 0, rejected = 0;
      for(const m of fx.rounds[r].matches){
        const v = body.picks ? body.picks[m.id] : undefined;
        if(v === undefined) continue;
        // 킥오프가 지난 경기는 서버가 거부한다 — 브라우저 시계가 아니라 서버 시간 기준.
        if(!isOpen(m)){ if((picks[m.id] || null) !== (v || null)) rejected++; continue; }
        if(v === null || v === ''){ if(picks[m.id]){ delete picks[m.id]; changed++; } continue; }
        if(!['H', 'D', 'A'].includes(v)) continue;
        if(picks[m.id] !== v){ picks[m.id] = v; changed++; }
      }
      const now = Date.now();
      const cmds = [['HSET', hk, t.k, JSON.stringify({p: picks, u: now})], ['HSETNX', `pk:first:${S}`, t.k, String(now)]];
      // 아직 한 경기도 채점 안 된 사람도 랭킹에 0점으로 보이게(참여자 표시).
      if(!prev.u) cmds.push(['ZINCRBY', `pk:lb:${S}`, 0, t.k]);
      await kvPipe(cmds);
      _pct.delete(r);
      return res.json({ok: true, picks, savedAt: now, changed, rejected, token: fresh});
    }

    if(a === 'me'){
      const fx = await getFixtures();
      const S = fx.season, mon = kstMonth(new Date().toISOString());
      const [season, month] = await Promise.all([readBoard(S, 'season'), readBoard(S, mon)]);
      const find = rows => { const x = rows.find(r => r.key === t.k); return x ? {rank: x.rank, points: x.points} : null; };
      return res.json({nick: t.n, month: mon, season: find(season), monthly: find(month), token: fresh});
    }

    return res.status(400).json({error: '알 수 없는 요청'});
  } catch(e){
    return res.status(500).json({error: '잠시 후 다시 시도해 주세요.', detail: String(e.message || e).slice(0, 200)});
  }
}
