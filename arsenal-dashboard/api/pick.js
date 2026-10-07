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
import { normNick, signToken, readToken, renew, accountReady } from './_account.js';

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const FOTMOB_HEADERS = {'User-Agent': 'Mozilla/5.0'};
const PL_LEAGUE = 47;

const PW_MIN = 4, PW_MAX = 20, NICK_MAX = 12;
const FAIL_LIMIT = 5, FAIL_LOCK_SEC = 10 * 60;
const SIGNUP_PER_IP_DAY = 3;
const RENAME_COOLDOWN_DAYS = 30;   // 닉네임 변경 간격 — 남을 흉내 내며 이름을 계속 바꾸는 걸 막는다
const WHOAMI_BOARD = 'whoami:board:v1';   // api/game.js의 BOARD_KEY와 같은 키(계정 멤버는 '@'+계정 키)
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
// 계정 키는 가입할 때의 정규화 닉네임으로 고정이다(예측·랭킹·Who Am I 기록이 전부 이 키에 붙어 있다).
// 닉네임을 바꾸면 pk:alias:{새 닉네임} → 계정 키 별칭을 만들고 표시 이름(u.n, pk:names)만 바꾼다.
// 가입 닉네임은 계정 키라서 바꾼 뒤에도 다른 사람이 가져갈 수 없다. 로그인은 지금 닉네임으로만 된다.
async function findAccount(nickKey){
  const alias = await kv('GET', `pk:alias:${nickKey}`);
  const k = alias || nickKey;
  const raw = await kv('GET', `pk:user:${k}`);
  const u = raw ? JSON.parse(raw) : null;
  if(!u || normNick(u.n) !== nickKey) return null;   // 바꾸기 전 닉네임으로는 로그인 안 됨
  return {k, u};
}
async function nickTaken(nickKey, selfKey){
  if(nickKey === selfKey) return false;   // 내 가입 닉네임으로 되돌리기
  const [user, alias] = await Promise.all([kv('EXISTS', `pk:user:${nickKey}`), kv('GET', `pk:alias:${nickKey}`)]);
  return !!Number(user) || (!!alias && alias !== selfKey);
}
function hashPw(pw, salt){
  return new Promise((ok, no) => crypto.scrypt(String(pw), salt, 32, {N: 16384, r: 8, p: 1}, (e, k) => e ? no(e) : ok(k.toString('hex'))));
}

async function pwMatches(pw, u){
  return crypto.timingSafeEqual(Buffer.from(await hashPw(String(pw || ''), u.s), 'hex'), Buffer.from(u.h, 'hex'));
}

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
    if(!KV_URL || !KV_TOKEN || !accountReady()) return res.status(503).json({error: '승부예측 서버 설정이 아직 안 됐어요.'});

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
      const acc = await findAccount(normNick(body.nick));
      if(!acc) return res.status(404).json({error: '없는 닉네임이에요.'});
      const {k: key, u} = acc;
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
        if(await kv('GET', `pk:alias:${key}`)) return res.status(409).json({error: '이미 사용 중인 닉네임이에요.'});
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
        // 같은 순간 누가 이 이름으로 닉네임을 바꿨으면 가입을 물린다(변경 쪽도 같은 방식으로 양보한다).
        if(await kv('GET', `pk:alias:${key}`)){ await kv('DEL', `pk:user:${key}`); return res.status(409).json({error: '이미 사용 중인 닉네임이에요.'}); }
        await kv('HSET', 'pk:names', key, nick);
        return res.json({token: signToken(key, nick), nick});
      }
      // login
      const acc = await findAccount(key);
      const fk = acc ? acc.k : key;
      const fails = Number(await kv('GET', `pk:fail:${fk}`)) || 0;
      if(fails >= FAIL_LIMIT) return res.status(429).json({error: '비밀번호를 여러 번 틀렸어요. 10분 뒤에 다시 시도해 주세요.'});
      const u = acc && acc.u;
      if(!u || !(await pwMatches(body.pw, u))){
        const f = await kv('INCR', `pk:fail:${fk}`);
        if(f === 1) await kv('EXPIRE', `pk:fail:${fk}`, FAIL_LOCK_SEC);
        return res.status(401).json({error: '닉네임이나 비밀번호가 맞지 않아요.'});
      }
      if(fails) await kv('DEL', `pk:fail:${fk}`);
      return res.json({token: signToken(acc.k, u.n), nick: u.n});
    }

    // 닉네임 중복 확인(가입·닉네임 변경 화면). 실제 가입·변경 때도 다시 확인한다.
    if(a === 'nickcheck'){
      const {nick, key, error} = checkNick(req.query.nick);
      if(error) return res.json({ok: false, error});
      const self = readToken(req);
      const taken = await nickTaken(key, self ? self.k : null);
      return res.json(taken ? {ok: false, error: '이미 사용 중인 닉네임이에요.'} : {ok: true, nick});
    }

    // ── 로그인 필요 ──
    const t = readToken(req);
    if(!t) return res.status(401).json({error: '로그인이 필요해요.', login: true});
    let fresh = renew(t);
    // 다른 기기에서 닉네임을 바꿨으면 토큰의 표시 이름이 옛것이다 — 이름을 보여 주는 두 요청에서만
    // 지금 이름을 확인해 고친 토큰을 내려 준다(요청마다 KV를 더 읽지 않으려고).
    if(a === 'me' || a === 'profile'){
      const cur = await kv('HGET', 'pk:names', t.k);
      if(cur && cur !== t.n){ t.n = cur; fresh = signToken(t.k, cur); }
    }

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

    // 내 정보: 승부예측 시즌·이번 달 순위, Who Am I 최고 기록·순위
    if(a === 'profile'){
      const fx = await getFixtures().catch(() => null);
      const raw = await kv('GET', `pk:user:${t.k}`);
      const u = raw ? JSON.parse(raw) : {};
      const out = {nick: t.n, since: u.c || null, renameAt: u.r ? u.r + RENAME_COOLDOWN_DAYS * 86400000 : null, token: fresh};
      if(fx){
        const S = fx.season, mon = kstMonth(new Date().toISOString());
        const one = async id => {
          const rows = await readBoard(S, id === S ? 'season' : id.slice(S.length + 1));
          const x = rows.find(r => r.key === t.k);
          if(x) return {rank: x.rank, points: x.points, hit: x.hit, total: x.total};
          // 100위 밖: 점수 순위만(동점 정렬 없이) 따로 센다.
          const [sc, rk, st] = await Promise.all([kv('ZSCORE', `pk:lb:${id}`, t.k), kv('ZREVRANK', `pk:lb:${id}`, t.k), kv('HMGET', `pk:st:${id}`, `${t.k}:h`, `${t.k}:t`)]);
          return sc == null ? null : {rank: Number(rk) + 1, points: Number(sc), hit: Number(st[0]) || 0, total: Number(st[1]) || 0};
        };
        const [season, monthly] = await Promise.all([one(S), one(`${S}:${mon}`)]);
        out.pick = {season, monthly, month: mon, seasonName: S};
      }
      const [ws, wr] = await Promise.all([kv('ZSCORE', WHOAMI_BOARD, '@' + t.k), kv('ZREVRANK', WHOAMI_BOARD, '@' + t.k)]);
      out.whoami = ws == null ? null : {best: Number(ws), rank: Number(wr) + 1};
      return res.json(out);
    }

    if(a === 'rename' || a === 'password'){
      if(req.method !== 'POST') return res.status(405).json({error: 'POST만 받습니다'});
      const body = await readBody(req);
      const raw = await kv('GET', `pk:user:${t.k}`);
      if(!raw) return res.status(401).json({error: '로그인이 필요해요.', login: true});
      const u = JSON.parse(raw);
      // 둘 다 지금 비밀번호를 한 번 더 확인한다(로그인 실패와 같은 잠금 카운터).
      const fails = Number(await kv('GET', `pk:fail:${t.k}`)) || 0;
      if(fails >= FAIL_LIMIT) return res.status(429).json({error: '비밀번호를 여러 번 틀렸어요. 10분 뒤에 다시 시도해 주세요.'});
      if(!(await pwMatches(body.pw, u))){
        const f = await kv('INCR', `pk:fail:${t.k}`);
        if(f === 1) await kv('EXPIRE', `pk:fail:${t.k}`, FAIL_LOCK_SEC);
        return res.status(401).json({error: '지금 비밀번호가 맞지 않아요.'});
      }
      if(fails) await kv('DEL', `pk:fail:${t.k}`);

      if(a === 'password'){
        const err = checkPw(body.newPw, u.n);
        if(err) return res.status(400).json({error: err});
        const salt = crypto.randomBytes(16).toString('hex');
        await kv('SET', `pk:user:${t.k}`, JSON.stringify({...u, s: salt, h: await hashPw(body.newPw, salt)}));
        return res.json({ok: true, token: fresh});
      }

      // rename
      const {nick, key: nk, error} = checkNick(body.nick);
      if(error) return res.status(400).json({error});
      if(nick === u.n) return res.status(400).json({error: '지금 닉네임과 같아요.'});
      const oldKey = normNick(u.n);
      const sameName = nk === oldKey;   // 띄어쓰기·대소문자만 바꾸는 건 별칭이 그대로라 간격 제한 없이 허용
      if(!sameName && u.r && Date.now() - u.r < RENAME_COOLDOWN_DAYS * 86400000){
        const d = new Date(u.r + RENAME_COOLDOWN_DAYS * 86400000 + 9 * 3600000);
        return res.status(429).json({error: `닉네임은 ${RENAME_COOLDOWN_DAYS}일에 한 번 바꿀 수 있어요. ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일부터 다시 바꿀 수 있어요.`});
      }
      if(!sameName){
        if(await nickTaken(nk, t.k)) return res.status(409).json({error: '이미 사용 중인 닉네임이에요.'});
        if(nk !== t.k){
          if(await kv('SET', `pk:alias:${nk}`, t.k, 'NX') !== 'OK' && await kv('GET', `pk:alias:${nk}`) !== t.k)
            return res.status(409).json({error: '이미 사용 중인 닉네임이에요.'});
          // 같은 순간 이 이름으로 누가 가입했으면 양보한다.
          if(Number(await kv('EXISTS', `pk:user:${nk}`))){ await kv('DEL', `pk:alias:${nk}`); return res.status(409).json({error: '이미 사용 중인 닉네임이에요.'}); }
        }
        if(oldKey !== t.k) await kv('DEL', `pk:alias:${oldKey}`);   // 바로 전 닉네임은 다른 사람이 쓸 수 있게 풀어 준다
      }
      await kv('SET', `pk:user:${t.k}`, JSON.stringify({...u, n: nick, r: sameName ? u.r : Date.now()}));
      await kv('HSET', 'pk:names', t.k, nick);
      _board.clear();
      return res.json({ok: true, nick, token: signToken(t.k, nick)});
    }

    return res.status(400).json({error: '알 수 없는 요청'});
  } catch(e){
    return res.status(500).json({error: '잠시 후 다시 시도해 주세요.', detail: String(e.message || e).slice(0, 200)});
  }
}
