// api/_ai.js — 경기 예측 해설 생성(Gemini)
//
// `_` 접두어라 Vercel 함수로 배포되지 않고 import 전용이다.
//
// 설계 원칙 두 가지. 둘 다 번역 파이프라인(_translate.js)에서 쓰던 것과 같다:
//
//  1. **숫자는 LLM에게 맡기지 않는다.** 확률·기대 스코어·결장 영향은 이미 카드에
//     우리 코드로 렌더링된다. 모델에는 "숫자 쓰지 말고 정성적으로만 써라"라고 시키고,
//     받아온 문장에 숫자가 섞여 있으면 통째로 버린다. 이러면 "57%인데 압도적 우세"
//     같은 수치 오류가 구조적으로 불가능하다.
//  2. **실패는 언제나 조용한 폴백.** 키 없음·할당량 초과·타임아웃·검열 차단 — 전부
//     null을 돌려주고, 호출한 쪽은 기존 템플릿 문장을 그대로 쓴다. 해설이 없다고
//     예측 카드 자체가 안 뜨는 경로는 없어야 한다.

const GEMINI_KEY = process.env.GEMINI_API_KEY;
// Flash 계열(빠르고 무료 티어 한도가 넉넉하다). 모델명이 바뀌면 여기만 고치면 된다.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_TIMEOUT_MS = 12000;

export const AI_ENABLED = !!GEMINI_KEY;

// 예측 응답(predictMatch 결과) → 모델에 줄 사실 목록.
// 여기 적은 것 외의 정보는 모델이 알 수 없으므로, 없는 얘기를 지어낼 재료 자체가 없다.
function factsFrom(p){
  const pct = v => Math.round(v * 100);
  const two = v => v.toFixed(2);
  const lines = [];
  const side = (t, where) => {
    const bits = [`${t.shortName} (${where})`];
    bits.push(`소속 리그: ${t.leagueName || '정보 없음'}`);
    bits.push(`경기당 기대득점 ${two(t.xgFor)} — 리그 ${t.attackRank}위`);
    bits.push(`경기당 기대실점 ${two(t.xgAgainst)} — 리그 ${t.defenceRank}위`);
    if(t.record && t.record.played){
      bits.push(`${where === '홈' ? '홈' : '원정'} 성적 ${t.record.wins}승 ${t.record.draws}무 ${t.record.losses}패 (${t.record.played}경기 ${t.record.gf}득점 ${t.record.ga}실점)`);
    }
    const inj = t.injury || {};
    const out = (inj.out || []).map(o => `${o.name}(${o.posLabel}${o.doubtful ? ', 출전 불투명' : ''})`);
    if(out.length){
      const dAtk = Math.round((1 - inj.attackFactor) * 100);
      const dDef = Math.round((inj.concedeFactor - 1) * 100);
      bits.push(`결장: ${out.join(', ')} — 모형에 기대득점 ${dAtk}% 감소, 기대실점 ${dDef}% 증가로 반영`);
    } else {
      bits.push('결장: 없음');
    }
    if(t.rest && t.rest.penalty >= 0.015){
      bits.push(`일정: 직전 경기 후 ${t.rest.days}일 휴식, 최근 2주 ${t.rest.matches14}경기`);
    }
    return bits.join(' / ');
  };
  lines.push(side(p.home, '홈'));
  lines.push(side(p.away, '원정'));
  lines.push(`대회: ${p.competition.name || '정보 없음'}`);
  lines.push(`모형 승부 확률: ${p.home.shortName} ${pct(p.probs.home)}%, 무승부 ${pct(p.probs.draw)}%, ${p.away.shortName} ${pct(p.probs.away)}%`);
  lines.push(`모형 기대 스코어: ${p.expected.home.toFixed(1)} : ${p.expected.away.toFixed(1)}`);
  lines.push(`가장 유력한 스코어: ${p.scorelines.slice(0, 3).map(s => s.score).join(', ')}`);
  lines.push(`두 팀 합계 3골 이상 확률 ${pct(p.over25)}%, 양 팀 모두 득점 확률 ${pct(p.btts)}%`);
  if(p.crossLeague) lines.push('두 팀이 서로 다른 리그 소속이라, 각자 자국 리그 기록을 리그 수준 보정을 거쳐 비교한 수치다.');
  return lines.join('\n');
}

const PROMPT = `너는 아스날 팬 사이트의 경기 프리뷰를 쓰는 축구 기자다.
아래 [사실]만 근거로 다음 경기 해설을 한국어로 써라.

규칙:
- 3~4문장. 존댓말. 담백한 기사체(감탄사·이모지·수사 과잉 금지).
- **숫자를 절대 쓰지 마라.** 확률·골 수·순위·퍼센트는 화면에 따로 표시되므로 문장에는 넣지 않는다.
  "리그 최상위권", "근소한 우위", "수비가 흔들린 상태" 처럼 말로만 표현해라.
- [사실]에 없는 정보(선수 폼, 감독 발언, 과거 맞대결, 부상 복귀 시점 등)를 지어내지 마라.
- 모형이 우세하다고 본 쪽과 반대되는 결론을 내리지 마라. 우열이 근소하면 근소하다고 써라.
- 결장 선수가 있으면 그 포지션이 경기에 어떤 영향을 줄지 한 번은 언급해라.
- 마크다운·제목·목록 없이 문장만 출력해라.

[사실]
`;

// 숫자가 섞인 문장은 버린다 — 규칙 1의 검증 장치.
// (전각 숫자·퍼센트 기호도 같이 본다. 한글 수사 "두 팀" 같은 건 허용.)
function hasNumbers(text){
  return /[0-9０-９%]/.test(text);
}

export async function generatePreview(prediction){
  if(!GEMINI_KEY || !prediction || !prediction.available) return null;
  try {
    const body = {
      contents: [{parts: [{text: PROMPT + factsFrom(prediction)}]}],
      generationConfig: {temperature: 0.7, maxOutputTokens: 400},
    };
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
      {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body),
       signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS)}
    );
    // 403 본문에는 요청에 쓴 API 키가 그대로 들어있다 — 상태 코드만 남긴다.
    if(!r.ok){ console.log('[ai] Gemini 응답 실패', r.status); return null; }
    const j = await r.json();
    const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
    const text = parts.map(x => x.text || '').join('').trim();
    if(!text){ console.log('[ai] 빈 응답'); return null; }
    if(hasNumbers(text)){ console.log('[ai] 숫자가 섞여 폐기'); return null; }
    // 너무 길면(모델이 규칙을 무시한 경우) 버린다 — 카드가 해설로 도배되면 안 된다.
    if(text.length > 400){ console.log('[ai] 길이 초과로 폐기', text.length); return null; }
    return text.replace(/\s*\n\s*/g, ' ');
  } catch(e){
    console.log('[ai] 생성 실패', e.name);
    return null;
  }
}
