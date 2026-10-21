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
// 2026-10 와일드카드 차출을 나라별 A대표 기준으로(고정 OVR 72·12% → 기준 이상·45%+): 4(NGA)·6·8(BRA)·12(KOR)번이 24세 이후 대회부터 달라진다.
const INTENDED={
  4:{sha256:'7d19d201100a35fcdf6b5b10665282e8682478036c73f3b7093e6a6e241f65c3',steps:48},
  6:{sha256:'45ac6d8f7decd33d06a034460123cba2354435b63d3956c6cd06b73601b3507f',steps:46},
  8:{sha256:'7ae93d8213a089ee1e9dfccce1d02c7019d75e04e22560def289e0a316e6944c',steps:55},
  12:{sha256:'b7c20a2fea975af69c86437a626eb1fa611d35388c3e6a4eba2215d050d6a46f',steps:45},
  18:{sha256:'0a887d99165d9f619bfa53af43e1c85772525e706e99784187b9db7b643831b2',steps:44},
};
const expected=fixture.cases.map(c=>INTENDED[c.i]?{...c,...INTENDED[c.i]}:c);
assert.deepEqual(await legacyCases(S,handler,tokenCodec('career-token-v1',{zip:true})),expected);
console.log(`PASS legacy replay: ${fixture.cases.length} full careers match pre-change ${fixture.source} at every encrypted state through retirement`);
