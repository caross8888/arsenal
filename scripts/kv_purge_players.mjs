// scripts/kv_purge_players.mjs — 이적한 선수의 playerSeason 캐시 정리 (로컬 수동 실행)
//
// 실행(저장소 루트에서, 의존성 없음):
//   node scripts/kv_purge_players.mjs          # 드라이런 — 무엇이 지워질지만 보여준다
//   node scripts/kv_purge_players.mjs --apply  # 실제 삭제
//
// 평소엔 크론(vercel.json → api/maintenance.js, 매년 5월 25일)이 알아서 돌린다.
// 이 스크립트는 (1) 크론이 뭘 지울지 미리 눈으로 확인하거나 (2) 이적시장이 특이하게
// 흘러가 그 사이에 한 번 더 비우고 싶을 때 쓴다. 판정 규칙과 안전장치는 크론과
// 같은 모듈(arsenal-dashboard/api/_purge.js)을 쓰므로 둘이 갈라지지 않는다.

import fs from 'fs';
import { purgePlayerSeasons, expireOtherTeamMatches } from '../arsenal-dashboard/api/_purge.js';

const APPLY = process.argv.includes('--apply');

// .env.local에서 KV 자격증명을 읽는다(Vercel CLI가 만들어 두는 파일).
const envPath = new URL('../arsenal-dashboard/.env.local', import.meta.url);
if (!fs.existsSync(envPath)) {
  console.error('arsenal-dashboard/.env.local이 없습니다. `vercel env pull`로 받아오세요.');
  process.exit(1);
}
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.trimStart().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);
const KV_URL = env.KV_REST_API_URL;
// 삭제까지 하려면 쓰기 토큰이 필요하다. 드라이런은 읽기 전용 토큰으로 충분하다.
const KV_TOKEN = APPLY ? env.KV_REST_API_TOKEN : (env.KV_REST_API_READ_ONLY_TOKEN || env.KV_REST_API_TOKEN);
if (!KV_URL || !KV_TOKEN) {
  console.error('KV_REST_API_URL / KV_REST_API_TOKEN을 .env.local에서 찾지 못했습니다.');
  process.exit(1);
}

async function kv(...args) {
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(10000),
  });
  const j = await r.json();
  if (j.error) throw new Error(`KV ${args[0]}: ${j.error}`);
  return j.result;
}

const report = await purgePlayerSeasons(kv, { apply: APPLY, withSizes: true });

console.log(`현재 스쿼드: ${report.squad}명`);
if (!report.ok) { console.error(report.reason); process.exit(1); }
report.warnings.forEach(w => console.warn(`  ${w}`));
console.log(`playerSeason 키 ${report.scanned}개 — 아스날 소속 ${report.kept}개 유지 / 이적 ${report.stale.length}개 대상`);
if (!report.stale.length) { console.log('지울 게 없습니다.'); process.exit(0); }

for (const s of report.stale) {
  console.log(`  ${s.key}  ${((s.bytes || 0) / 1024).toFixed(1)}KB  ${s.name || ''} → ${s.club}`);
}
console.log(`합계 ${(report.bytes / 1048576).toFixed(2)}MB`);

if (APPLY) console.log(`\n${report.deleted}개 삭제 완료 (${(report.bytes / 1048576).toFixed(2)}MB 회수).`);
else console.log('\n드라이런입니다 — 실제로 지우려면 --apply를 붙여 다시 실행하세요.');

// ── 타팀 경기 상세: 예전에 영구로 저장된 것들에 1년 만료 걸기 ──
const mr = await expireOtherTeamMatches(kv, { apply: APPLY });
console.log(`\nmatch 키 ${mr.scanned}개 — 영구 ${mr.permanent}개 중 아스날 ${mr.ours}개 유지 / 타팀 ${mr.targets.length}개 만료 대상 (${(mr.bytes / 1048576).toFixed(2)}MB)`);
mr.warnings.forEach(w => console.warn(`  ${w}`));
mr.targets.slice(0, 10).forEach(t => console.log(`  ${t.date}  ${t.home} vs ${t.away}  ${((t.bytes || 0) / 1024).toFixed(0)}KB`));
if (mr.targets.length > 10) console.log(`  … 외 ${mr.targets.length - 10}개`);
if (APPLY) console.log(`${mr.expired}개에 1년 만료를 걸었습니다.`);
