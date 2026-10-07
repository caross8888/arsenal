// api/_token.js — 미니게임 진행 상태 토큰(AES-256-GCM)
//
// 게임 진행 상태를 KV 대신 암호화 토큰으로 브라우저와 주고받는다(Who Am I, 커리어 모드).
// 키는 따로 등록할 필요 없게 기존 비밀값에서 파생한다(WHOAMI_SECRET이 있으면 그걸 쓴다).
// 게임마다 파생 라벨(purpose)이 달라서, 한 게임의 토큰을 다른 게임에 보내면 열리지 않는다.
// Who Am I의 라벨 'whoami-token-v1'은 바꾸지 말 것 — 진행 중인 토큰이 전부 깨진다.

import crypto from 'crypto';
import zlib from 'zlib';

// zip: 평문을 deflate로 줄인 뒤 암호화(커리어 모드처럼 상태가 큰 게임용). 같은 purpose 안에서 바꾸면 옛 토큰이 안 열린다.
export function tokenCodec(purpose, {zip = false} = {}){
  const key = () => {
    const base = process.env.WHOAMI_SECRET || process.env.KV_REST_API_TOKEN || process.env.CRON_SECRET;
    if(!base) return null;
    return crypto.createHash('sha256').update(purpose + ':' + base).digest();
  };
  const seal = obj => {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
    const body = Buffer.concat([c.update(zip ? zlib.deflateRawSync(JSON.stringify(obj)) : Buffer.from(JSON.stringify(obj), 'utf8')), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64url');
  };
  const open = token => {
    try {
      const raw = Buffer.from(String(token || ''), 'base64url');
      const d = crypto.createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
      d.setAuthTag(raw.subarray(12, 28));
      const plain = Buffer.concat([d.update(raw.subarray(28)), d.final()]);
      return JSON.parse((zip ? zlib.inflateRawSync(plain) : plain).toString('utf8'));
    } catch(_){ return null; }
  };
  return {ready: () => !!key(), seal, open};
}
