// api/game.js — 미니게임 서버 (현재: Who Am I? 커리어 경로 퀴즈)
//
//   POST ?a=start                     → 새 게임. 첫 문제 + 게임 토큰
//   POST ?a=answer  {token, pick}     → 채점. 결과 + 다음 문제 + 새 토큰 (pick=null이면 시간 초과)
//   POST ?a=submit  {token, nick}     → 끝난 게임을 랭킹에 등록
//   GET  ?a=board                     → 역대 TOP 100 + 1,000위 컷
//
// 문제 은행은 고정 파일(_whoami_bank.js) 하나다 — 사용자 지정으로 한 번 만들고 더 늘리지 않는다.
// 다시 만들 일이 생기면 scripts/build_whoami.mjs --module 로 그 파일을 새로 쓴다.
//
// ── KV를 거의 안 쓰는 구조 (사용자 지정: 무료 플랜 부담) ──
// 게임 진행 중엔 KV를 한 번도 안 쓴다. 정답·출제 시각·점수·목숨·이미 낸 문제는 서버만 열 수 있게
// 암호화(AES-256-GCM)한 토큰에 담아 브라우저와 주고받는다 — 브라우저는 내용을 못 보고, 고치면
// 복호화가 실패한다. KV는 랭킹 등록(약 5회)과 랭킹 보기(30초 CDN 캐시)에만 쓴다.
//
// 이 구조의 알려진 약점: 이전 토큰을 다시 보내면 같은 문제를 다시 풀 수 있다(서버가 "이미 쓴
// 토큰"을 기억하지 않으므로). 그래서 (1) 오답일 때 정답을 알려주지 않고 (2) 토큰은 제한 시간이
// 지나면 무효다 — 남은 보기를 12초 안에 찍어보는 정도까지만 가능하다. 완전히 막으려면 문제마다
// KV에 한 번씩 기록해야 하는데, 사용자가 비용 때문에 받지 않은 선택이다.

import crypto from 'crypto';
import SEED from './_whoami_bank.js';
import { applyGlossary } from './_glossary.js';

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

const TIME_LIMIT = 12;         // 문제당 제한 시간(초)
const LIVES = 3;
const NET_GRACE = 0.4;         // 응답 왕복 시간 보정(초) — 서버가 재는 시간엔 네트워크가 섞인다
const LATE_GRACE = 2.5;        // 이만큼 넘겨 도착한 답은 시간 초과로 본다
const BOARD_KEY = 'whoami:board:v1';
const BOARD_KEEP = 1000;       // 랭킹은 상위 1,000개만 남긴다(사용자 지정)
const BOARD_SHOW = 100;
const MONTHLY_REG_CAP = 50000; // 한 달 등록 상한 — 넘으면 그달은 등록만 막는다(무료 한도 보호)
const ALL_CLEAR_BONUS = 1000;
const MAX_PER_Q = 200;         // 정답 100 + 시간 보너스 최대 100

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

// ── 문제 은행 ──────────────────────────────────────────────────────────
// 인스턴스가 뜰 때 한 번만 정리한다(KV를 안 쓴다).
let _bank = null;
function getBank(){
  if(_bank) return _bank;
  const list = SEED.map(q => ({
    ...q,
    id: String(q.id),
    // 한국어 이름은 한국어 위키백과 표기라 사이트 표기와 다를 수 있다(가브리에우 → 가브리엘 등).
    // 뉴스 번역과 같은 사전으로 맞춘다.
    display: applyGlossary(q.ko || q.name),
    group: posGroup(q.pos),
  }));
  _bank = {list, byId: new Map(list.map(q => [q.id, q]))};
  return _bank;
}

// 위키백과 포지션 표기는 시대마다 다르다(1960년대 이전 FB·HB) — 네 갈래로 묶는다.
function posGroup(p){
  p = String(p || '').toUpperCase();
  if(p === 'GK') return 'GK';
  if(p === 'DF' || p === 'FB') return 'DF';
  if(p === 'MF' || p === 'HB') return 'MF';
  return 'FW';
}

// 난이도 묶음: 아스날 출전 수로 나눈다. 초반엔 유명한 선수만, 맞힐수록 넓힌다.
const tierOf = q => (q.apps >= 100 ? 0 : q.apps >= 25 ? 1 : 2);
function maxTierFor(n){ return n < 10 ? 0 : n < 25 ? 1 : 2; }

function pickQuestion(bank, used, n){
  const usedSet = new Set(used);
  for(let t = maxTierFor(n); t <= 2; t++){
    const pool = bank.list.filter(q => !usedSet.has(q.id) && tierOf(q) <= t);
    if(pool.length) return pool[crypto.randomInt(pool.length)];
  }
  return null;
}

// 오답 보기 2개: 같은 포지션 + 아스날 입단이 가까운 선수 중에서. 모자라면 범위를 넓힌다.
function pickChoices(bank, q){
  const others = bank.list.filter(x => x.id !== q.id && x.display !== q.display);
  const tries = [
    x => x.group === q.group && Math.abs((x.since || 0) - (q.since || 0)) <= 6,
    x => x.group === q.group && Math.abs((x.since || 0) - (q.since || 0)) <= 15,
    x => x.group === q.group,
    () => true,
  ];
  const picked = [];
  for(const f of tries){
    const pool = shuffle(others.filter(x => f(x) && !picked.some(p => p.display === x.display)));
    while(picked.length < 2 && pool.length) picked.push(pool.pop());
    if(picked.length >= 2) break;
  }
  return shuffle([q, ...picked]).map(x => ({id: x.id, name: x.display}));
}
function shuffle(a){
  a = a.slice();
  for(let i = a.length - 1; i > 0; i--){ const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// 브라우저에 보낼 문제 — 정답은 빼고 경로·상태·보기만.
const publicQ = (q, choices) => ({career: q.career, status: q.status, choices});

// ── 토큰 ───────────────────────────────────────────────────────────────
// 키는 따로 등록할 필요 없게 기존 비밀값에서 파생한다(WHOAMI_SECRET이 있으면 그걸 쓴다).
function tokenKey(){
  const base = process.env.WHOAMI_SECRET || KV_TOKEN || process.env.CRON_SECRET;
  if(!base) return null;
  return crypto.createHash('sha256').update('whoami-token-v1:' + base).digest();
}
function seal(obj){
  const key = tokenKey();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64url');
}
function open(token){
  try {
    const key = tokenKey();
    const raw = Buffer.from(String(token || ''), 'base64url');
    const d = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8'));
  } catch(_){ return null; }
}

// 다음 문제를 뽑아 상태에 싣는다. 문제가 바닥나면(전부 출제) 게임 끝 — 전부 클리어.
function nextState(bank, st){
  const q = pickQuestion(bank, st.u, st.n);
  if(!q) return {st: {...st, over: true, clear: true, s: st.s + ALL_CLEAR_BONUS}, q: null};
  const choices = pickChoices(bank, q);
  return {
    st: {...st, a: q.id, ch: choices.map(c => c.id), t: Date.now()},
    q: publicQ(q, choices),
  };
}

// ── 랭킹 ───────────────────────────────────────────────────────────────
// 멤버는 "닉네임\u0001게임id" — 닉네임이 겹쳐도 판마다 따로 남는다.
let _board = null, _boardAt = 0;
async function readBoard(){
  if(_board && Date.now() - _boardAt < 30 * 1000) return _board;
  const flat = await kv('ZRANGE', BOARD_KEY, 0, BOARD_SHOW - 1, 'REV', 'WITHSCORES') || [];
  const top = [];
  for(let i = 0; i + 1 < flat.length; i += 2) top.push({name: String(flat[i]).split('\u0001')[0], score: Number(flat[i + 1])});
  const cutRaw = await kv('ZRANGE', BOARD_KEY, BOARD_KEEP - 1, BOARD_KEEP - 1, 'REV', 'WITHSCORES') || [];
  _board = {top, cut: cutRaw.length ? Number(cutRaw[1]) : null};
  _boardAt = Date.now();
  return _board;
}

const BAD_WORDS = /(시발|씨발|ㅅㅂ|병신|ㅂㅅ|좆|존나|개새|새끼|fuck|shit|bitch|nigg)/i;
function cleanNick(s){
  const n = String(s || '').replace(/[\u0000-\u001f\u007f\u0001]/g, '').replace(/\s+/g, ' ').trim();
  if(!n) return {error: '닉네임을 입력해 주세요.'};
  if([...n].length > 12) return {error: '닉네임은 12자까지 쓸 수 있어요.'};
  if(BAD_WORDS.test(n.replace(/\s/g, ''))) return {error: '쓸 수 없는 단어가 들어 있어요.'};
  return {nick: n};
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
    if(a === 'board'){
      if(!KV_URL || !KV_TOKEN) return res.json({top: [], cut: null});
      // 30초 CDN 캐시 — 여러 명이 동시에 봐도 KV 읽기는 30초에 한 번 꼴이다.
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=30');
      return res.json(await readBoard());
    }

    if(req.method !== 'POST') return res.status(405).json({error: 'POST만 받습니다'});
    if(!tokenKey()) return res.status(503).json({error: '게임 서버 설정이 아직 안 됐어요.'});
    res.setHeader('Cache-Control', 'no-store');
    const body = await readBody(req);
    const bank = getBank();

    if(a === 'start'){
      const base = {g: crypto.randomBytes(8).toString('hex'), n: 0, s: 0, l: LIVES, c: 0, u: []};
      const {st, q} = nextState(bank, base);
      return res.json({token: seal(st), q, score: 0, lives: LIVES, n: 1, time: TIME_LIMIT, total: bank.list.length});
    }

    if(a === 'answer'){
      const st = open(body.token);
      if(!st || st.over || !st.a) return res.status(400).json({error: '게임 정보가 올바르지 않아요. 새 게임을 시작해 주세요.'});
      const elapsed = (Date.now() - st.t) / 1000;
      // 제한 시간을 한참 넘긴 토큰은 받지 않는다 — 이전 토큰을 들고 다시 푸는 걸 시간으로 묶는다.
      if(elapsed > TIME_LIMIT + LATE_GRACE + 5) return res.status(400).json({error: '시간이 지난 문제예요. 새 게임을 시작해 주세요.'});
      const pick = body.pick == null ? null : String(body.pick);
      const inTime = elapsed <= TIME_LIMIT + LATE_GRACE;
      const ok = inTime && pick !== null && st.ch.includes(pick) && pick === st.a;
      const left = Math.max(0, TIME_LIMIT - Math.max(0, elapsed - NET_GRACE));
      const gain = ok ? 100 + Math.round(left / TIME_LIMIT * 100) : 0;
      let next = {...st, n: st.n + 1, s: st.s + gain, l: ok ? st.l : st.l - 1, c: st.c + (ok ? 1 : 0), u: [...st.u, st.a], a: null, ch: null};
      const result = {ok, gain, timeout: !inTime || pick === null};
      if(next.l <= 0){
        next = {...next, over: true};
        return res.json({...result, over: true, score: next.s, lives: 0, correct: next.c, token: seal(next)});
      }
      const {st: st2, q} = nextState(bank, next);
      if(st2.over){
        return res.json({...result, over: true, clear: true, score: st2.s, lives: st2.l, correct: st2.c, token: seal(st2)});
      }
      return res.json({...result, over: false, score: st2.s, lives: st2.l, n: st2.n + 1, q, token: seal(st2)});
    }

    if(a === 'submit'){
      const st = open(body.token);
      if(!st || !st.over) return res.status(400).json({error: '끝난 게임만 등록할 수 있어요.'});
      // 점수 컷: 이론상 최대(전 문제 0.4초 안에 정답 + 클리어 보너스 = 214×200+1000 = 43,800)를 넘으면 거부.
      // 점수는 서버만 계산하고 토큰은 암호화돼 있어 정상 경로로는 못 넘지만, 버그·키 유출에 대비한 마지막 안전장치다.
      if(st.s > getBank().list.length * MAX_PER_Q + ALL_CLEAR_BONUS) return res.status(400).json({error: '등록할 수 없는 기록이에요.'});
      const {nick, error} = cleanNick(body.nick);
      if(error) return res.status(400).json({error});
      if(!KV_URL || !KV_TOKEN) return res.status(503).json({error: '랭킹 저장소에 연결할 수 없어요.'});
      if(st.s <= 0) return res.json({registered: false, reason: '0점은 등록하지 않아요.'});
      // 1,000위 컷보다 낮으면 KV에 쓰지 않는다(최근 30초 안에 읽어 둔 컷 기준 — 컷은 내려가지 않는다).
      if(_board && _board.cut != null && st.s <= _board.cut) return res.json({registered: false, outside: true});
      // 같은 판을 두 번 등록하지 못하게 — 게임 id를 하루 동안 기억한다.
      const fresh = await kv('SET', `whoami:done:${st.g}`, '1', 'NX', 'EX', 86400);
      if(fresh !== 'OK') return res.status(409).json({error: '이미 등록한 게임이에요.'});
      const month = new Date().toISOString().slice(0, 7);
      const used = await kv('INCR', `whoami:reg:${month}`);
      if(used === 1) await kv('EXPIRE', `whoami:reg:${month}`, 40 * 86400);
      if(used > MONTHLY_REG_CAP) return res.status(429).json({error: '이번 달 랭킹 등록이 마감됐어요. 다음 달에 다시 열려요.'});
      const member = `${nick}\u0001${st.g}`;
      await kv('ZADD', BOARD_KEY, st.s, member);
      await kv('ZREMRANGEBYRANK', BOARD_KEY, 0, -(BOARD_KEEP + 1));
      const rank = await kv('ZREVRANK', BOARD_KEY, member);
      _board = null;
      return res.json(rank == null ? {registered: false, outside: true} : {registered: true, rank: rank + 1, nick, score: st.s});
    }

    return res.status(400).json({error: '알 수 없는 요청'});
  } catch(e){
    return res.status(500).json({error: '잠시 후 다시 시도해 주세요.', detail: String(e.message || e).slice(0, 200)});
  }
}
