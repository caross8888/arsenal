// api/_account.js — 미니게임 공용 계정(닉네임 + 비밀번호)
//
// 승부예측(api/pick.js)에서 가입·로그인하고, Who Am I(api/game.js) 랭킹 등록도 같은 계정을 쓴다.
// 로그인 토큰은 HMAC 서명이라 확인에 KV를 쓰지 않는다. 키는 기존 비밀값에서 파생해 따로 등록할 게 없다.

import crypto from 'crypto';

export const TOKEN_DAYS = 365;

// 같은 닉네임 판정: 대소문자·공백·전각/반각 차이는 같은 닉네임으로 본다.
export const normNick = s => String(s || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();

function secretKey(){
  const base = process.env.PICK_SECRET || process.env.KV_REST_API_TOKEN || process.env.CRON_SECRET;
  return base ? crypto.createHash('sha256').update('pick-token-v1:' + base).digest() : null;
}
export const accountReady = () => !!secretKey();

export function signToken(key, nick){
  const body = Buffer.from(JSON.stringify({k: key, n: nick, e: Date.now() + TOKEN_DAYS * 86400000})).toString('base64url');
  const sig = crypto.createHmac('sha256', secretKey()).update(body).digest('base64url');
  return body + '.' + sig;
}
// Authorization: Bearer <토큰> → {k: 계정 키(정규화 닉네임), n: 표시 닉네임, e: 만료} 또는 null
export function readToken(req){
  const m = /^Bearer\s+(.+)$/.exec(String((req.headers || {}).authorization || ''));
  const key = secretKey();
  if(!m || !key) return null;
  const [body, sig] = m[1].split('.');
  if(!body || !sig) return null;
  const want = crypto.createHmac('sha256', key).update(body).digest('base64url');
  if(sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try {
    const t = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return t.e > Date.now() ? t : null;
  } catch(_){ return null; }
}
// 쓸 때마다 유효기간을 늘려준다. 넉 달 이상 지난 토큰만 새로 준다.
export const renew = t => (t.e - Date.now() < (TOKEN_DAYS - 120) * 86400000 ? signToken(t.k, t.n) : undefined);
