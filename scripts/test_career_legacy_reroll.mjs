import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {legacyCases} from './lib/career-legacy-cases.mjs';
import * as S from '../arsenal-dashboard/api/_career_sim.js';
process.env.WHOAMI_SECRET='test-only-secret';delete process.env.KV_REST_API_URL;
const {default:handler}=await import('../arsenal-dashboard/api/career.js');
const {tokenCodec}=await import('../arsenal-dashboard/api/_token.js');
const fixture=JSON.parse(readFileSync(new URL('./lib/career-legacy-fixtures.json',import.meta.url)));
// 의도한 규칙 변경으로 달라진 커리어만 덮어쓴다(원본 스냅샷 파일은 그대로 둔다).
// 2026-10 아시안게임 금메달 확률 30~40% → 50~70%: 한국 커리어 6·18번이 아시안게임 결과부터 달라진다.
const INTENDED={
  6:{sha256:'26c024155ced2a4a14e935e572dfb76939be814f4713595db6f1edc53fb5d353',steps:46},
  18:{sha256:'0a887d99165d9f619bfa53af43e1c85772525e706e99784187b9db7b643831b2',steps:44},
};
const expected=fixture.cases.map(c=>INTENDED[c.i]?{...c,...INTENDED[c.i]}:c);
assert.deepEqual(await legacyCases(S,handler,tokenCodec('career-token-v1',{zip:true})),expected);
console.log(`PASS legacy replay: ${fixture.cases.length} full careers match pre-change ${fixture.source} at every encrypted state through retirement`);
