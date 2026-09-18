// api/maintenance.js — 연 1회 KV 정리 크론
//
// vercel.json의 crons가 매년 5월 25일 04:00 UTC에 부른다. 시즌이 끝나고 여름
// 이적시장이 열리기 전이라, 스쿼드가 1년 중 가장 확정적인 순간이다(겨울 이적까지
// 반영 완료 + 신규 영입은 아직 없음). 이적시장 직후(8~9월)는 반대로 가장 어수선해서
// — 신규 등록·임대 출발·자유계약 미해결이 뒤섞여 — 소속 판정이 틀리기 쉽다.
//
// 대신 그해 여름에 나간 선수는 다음 해 5월까지 남는다. 이건 의도한 절충이다:
// (1) 그 데이터엔 UI 진입점이 없어 남아 있어도 아무 영향이 없고,
// (2) 애초에 캐시라 잘못 지워도 다음 조회 때 Fotmob에서 다시 받는다 — 즉 위험은
//     "틀리게 지우는 쪽"에만 있고 "늦게 지우는 쪽"엔 없다. 실측 기준 한 시즌 치가
//     0.1MB 수준이라 1년 더 두는 비용이 사실상 0이다.
//
// 삭제하는 엔드포인트라 인증 없이 열어두면 안 된다. Vercel은 크론 요청에
// `Authorization: Bearer $CRON_SECRET`을 붙여주므로 그것만 통과시킨다.
// CRON_SECRET이 설정돼 있지 않으면 아예 거부한다(fail closed) — 비밀값을 깜빡
// 설정 안 한 상태가 "누구나 지울 수 있음"이 되면 안 된다.

import { purgePlayerSeasons, expireOtherTeamMatches } from './_purge.js';

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

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

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: 'CRON_SECRET 미설정' });
  if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' });
  if (!KV_URL || !KV_TOKEN) return res.status(503).json({ error: 'KV 자격증명 없음' });

  // dry=1이면 삭제하지 않고 무엇이 지워질지만 돌려준다 — 크론을 붙이기 전/후에
  // 같은 비밀값으로 직접 호출해 확인하는 용도.
  const dry = req.query.dry === '1';
  try {
    const report = await purgePlayerSeasons(kv, { apply: !dry });
    // 예전에 영구로 저장된 타팀 경기에 1년 만료를 걸어준다(지금은 저장 시점에 걸린다).
    report.matches = await expireOtherTeamMatches(kv, { apply: !dry });
    // 지운 대상은 로그로 남긴다 — 나중에 "왜 이 선수 캐시가 없지"를 추적할 수 있게.
    console.log('[maintenance] purgePlayerSeasons', JSON.stringify({
      dry, ok: report.ok, reason: report.reason, squad: report.squad,
      scanned: report.scanned, kept: report.kept, deleted: report.deleted,
      stale: report.stale.map(s => `${s.key} (${s.name} → ${s.club})`),
      warnings: report.warnings,
      matches: report.matches && {
        scanned: report.matches.scanned, permanent: report.matches.permanent,
        ours: report.matches.ours, targets: report.matches.targets.length, expired: report.matches.expired,
      },
    }));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(report.ok ? 200 : 409).json(report);
  } catch (e) {
    console.error('[maintenance] 실패', e);
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
