// api/_ai.js — 경기 예측 해설 생성(Gemini)
//
// `_` 접두어라 Vercel 함수로 배포되지 않고 import 전용이다.
//
// 설계 원칙 두 가지. 둘 다 번역 파이프라인(_translate.js)에서 쓰던 것과 같다:
//
//  1. **숫자를 지어내지 못하게 한다.** 처음엔 "숫자 쓰지 마라"로 막았는데, 그러니 해설이
//     "우세가 예상됩니다" 수준으로 뭉뚱그려졌다(사용자 지적). 지금은 숫자를 쓰게 하되
//     **[사실]에 있는 값만** 허용한다 — 해설에 나온 숫자를 전부 입력값과 대조해서, 하나라도
//     없는 숫자가 있으면 통째로 버린다. 지어낸 수치는 여전히 구조적으로 불가능하다.
//  2. **실패는 언제나 조용한 폴백.** 키 없음·할당량 초과·타임아웃·검열 차단 — 전부
//     null을 돌려주고, 호출한 쪽은 기존 템플릿 문장을 그대로 쓴다. 해설이 없다고
//     예측 카드 자체가 안 뜨는 경로는 없어야 한다.

const GEMINI_KEY = process.env.GEMINI_API_KEY;
// 모델 ID를 코드에 박아두면 구글이 모델을 내릴 때마다 배포를 다시 해야 한다
// (실측: gemini-2.5-flash가 "no longer available to new users"로 404). 그래서
// 환경변수로 고정하지 않는 한 **사용 가능한 모델 목록을 받아 직접 고른다.**
const GEMINI_MODEL_ENV = process.env.GEMINI_MODEL || '';
// 생각하는 모델은 한 번에 10~30초가 걸린다 — 12초로 두니 타임아웃이 났다(실측).
// 크론 함수 한도가 5분이라, 경기 2개 × 최대 3회 호출을 이 안에 맞춘다.
const GEMINI_TIMEOUT_MS = 35000;
const LIST_TIMEOUT_MS = 12000;

export const AI_ENABLED = !!GEMINI_KEY;
// 실행 기록용 — 이 계정에서 실제로 고를 수 있었던 flash 후보들.
export const aiCandidates = () => _candidates.slice();

// 자동 선택 결과를 함수 인스턴스 안에 기억해둔다(요청마다 목록을 다시 받지 않게).
// 1순위가 과부하(503)일 때 넘어갈 수 있게 점수순 후보 목록도 같이 둔다.
let _resolvedModel = null;
let _candidates = [];

// 이 용도에 안 맞는 모델을 이름으로 걸러낸다 — 임베딩·음성·이미지 전용이나
// 실시간(live) 모델은 generateContent를 지원해도 텍스트 프리뷰용이 아니다.
const MODEL_REJECT = /embedding|aqa|tts|image|vision|live|native-audio|computer-use/i;

async function resolveModel(){
  if(GEMINI_MODEL_ENV) return GEMINI_MODEL_ENV;      // 수동 지정이 최우선
  if(_resolvedModel) return _resolvedModel;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_KEY}&pageSize=200`,
      {signal: AbortSignal.timeout(LIST_TIMEOUT_MS)});
    if(!r.ok){ console.log('[ai] 모델 목록 조회 실패', r.status); return null; }
    const list = ((await r.json()).models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => String(m.name || '').replace(/^models\//, ''))
      .filter(n => n && !MODEL_REJECT.test(n));
    if(!list.length) return null;
    // 점수: flash 계열 우선(빠르고 싸다) > 정식판(preview/exp 제외) > 최신 버전 번호
    const score = n => {
      let sc = 0;
      if(/flash/.test(n)) sc += 100;
      if(/flash-lite/.test(n)) sc -= 20;            // 품질이 아쉬워 동점이면 뒤로
      if(!/preview|exp|thinking/.test(n)) sc += 50; // 정식 릴리스 우선
      const ver = parseFloat((n.match(/(\d+(?:\.\d+)?)/) || [])[1] || '0');
      sc += ver;                                     // 버전이 높을수록
      if(/-\d{3,}$/.test(n)) sc -= 10;              // 날짜 스냅샷(-001 등)보다 별칭 선호
      return sc;
    };
    list.sort((x, y) => score(y) - score(x));
    // 대체 후보는 flash 계열만 — pro는 느리고 비싸서 크론 시간 한도에 걸린다.
    _candidates = list.filter(n => /flash/.test(n)).slice(0, 4);
    _resolvedModel = list[0];
    console.log('[ai] 모델 자동 선택:', _resolvedModel, '(후보', list.length + '개)');
    return _resolvedModel;
  } catch(e){
    console.log('[ai] 모델 목록 조회 예외', e.name);
    return null;
  }
}

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
아래 [사실]만 근거로, 이 경기를 구체적으로 분석하는 프리뷰를 한국어로 써라.
독자가 이 글만 읽고도 모형이 왜 이런 확률을 냈는지 이해할 수 있어야 한다.

형식:
- 두 문단, 합계 6~8문장. 문단 사이는 빈 줄 하나. 존댓말, 담백한 기사체.
- 감탄사·이모지·마크다운·제목·목록·따옴표 강조 금지. 문장만 출력한다.

내용:
- 첫 문단 — 전력 비교: 두 팀의 경기당 기대득점·기대실점과 리그 순위를 짚고,
  홈팀의 홈 성적과 원정팀의 원정 성적을 구체적으로 대비해라.
- 둘째 문단 — 변수와 결론: 결장 선수를 이름과 포지션으로 짚고 그게 공격·수비 중 어디에
  얼마나 반영됐는지 설명해라. 일정 정보가 있으면 피로도도 언급해라. 마지막은 모형의 승부
  확률과 가장 유력한 스코어로 결론을 맺어라.

엄격한 규칙:
- 숫자는 [사실]에 적힌 값을 **그대로만** 써라. 새로 계산하거나(합·차·평균), 반올림을 바꾸거나,
  [사실]에 없는 숫자를 만들어내지 마라.
- [사실]에 없는 정보(선수 폼, 감독 발언, 과거 맞대결, 부상 복귀 시점, 전술 등)는 쓰지 마라.
- 모형이 우세하다고 본 쪽과 반대되는 결론을 내리지 마라. 우열이 근소하면 근소하다고 써라.

[사실]
`;

// 해설에 나온 숫자가 전부 [사실]에 있는 값인지 — 규칙 1의 검증 장치.
// "1.70"을 "1.7"로 쓰는 식의 표기 차이는 값이 같으면 허용한다. 반환: 근거 없는 숫자 목록.
function unknownNumbers(text, facts){
  const toks = s => (String(s).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .match(/\d+(?:\.\d+)?/g) || []);
  const allowed = new Set(toks(facts).map(Number));
  return toks(text).filter(n => !allowed.has(Number(n)));
}

// 반환값: {text, reason}. text가 null이면 reason에 왜 실패했는지 들어있다 —
// 크론이 이걸 KV 실행 기록에 남겨서, 배포 로그를 못 봐도 원인을 알 수 있게 한다.
export async function generatePreview(prediction){
  if(!GEMINI_KEY) return {text: null, reason: 'GEMINI_API_KEY 없음'};
  if(!prediction || !prediction.available) return {text: null, reason: '예측 없음'};
  try {
    const facts = factsFrom(prediction);
    const body = {
      contents: [{parts: [{text: PROMPT + facts}]}],
      // 최신 제미나이는 "생각하는" 모델이라 내부 추론에도 출력 토큰을 쓴다. 400으로
      // 두니 추론에 다 써버려서 본문이 문장 중간에 잘렸다(실측: "…아스날은 리그 최상위"
      // 에서 끊김). 넉넉히 준다 — 실제 비용은 쓴 만큼만 나간다.
      generationConfig: {temperature: 0.7, maxOutputTokens: 4096},
    };
    const callOnce = async model => fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
      {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body),
       signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS)}
    );
    let model = await resolveModel();
    if(!model) return {text: null, reason: '쓸 수 있는 모델을 찾지 못함'};

    // 일시적 실패(과부하 503·한도 429·서버 5xx·타임아웃)는 버티고, 영구적 실패(400·403·
    // 404)는 바로 돌려준다. 순서: 1순위 모델 2회(사이 3초) → 다음 flash 후보 1회.
    // 실측: gemini-3.8-flash가 "currently experiencing high demand"로 503.
    const TRANSIENT = new Set([429, 500, 502, 503, 504]);
    const attempt = async m => {
      try { return {res: await callOnce(m)}; }
      catch(e){ return {err: e}; }      // TimeoutError 등
    };
    // 503은 구글이 "보통 일시적"이라고 명시하는 과부하라, 같은 모델을 간격을 늘려가며
    // 세 번까지 시도한다. 그 뒤 다른 flash 후보가 있으면 한 번 더.
    const plan = [model, model, model];
    const WAITS = [0, 3000, 10000];
    const alt = _candidates.find(n => n !== model);
    if(alt && !GEMINI_MODEL_ENV) plan.push(alt);

    let r = null, lastErr = null;
    for(let i = 0; i < plan.length; i++){
      if(i > 0) await new Promise(res => setTimeout(res, WAITS[i] != null ? WAITS[i] : 500));
      model = plan[i];
      const got = await attempt(model);
      if(got.err){ lastErr = got.err; r = null; continue; }
      r = got.res;
      // 모델이 내려간 경우(404) 목록을 다시 받아 새 1순위로 한 번 더.
      if(r.status === 404 && !GEMINI_MODEL_ENV){
        _resolvedModel = null;
        const fresh = await resolveModel();
        if(fresh && fresh !== model){ model = fresh; const g2 = await attempt(model); r = g2.res || null; lastErr = g2.err || null; }
        break;
      }
      if(!TRANSIENT.has(r.status)) break;   // 성공 또는 영구 실패
    }
    if(!r) return {text: null, reason: `예외 ${lastErr ? lastErr.name : '알 수 없음'} (${model})`};
    // 403 본문에는 요청에 쓴 API 키가 그대로 들어있다 — 상태 코드와 메시지만 남긴다.
    if(!r.ok){
      let detail = '';
      try { const e = await r.json(); detail = ((e.error || {}).message || '').slice(0, 200); } catch(_){}
      console.log('[ai] Gemini 응답 실패', r.status, model);
      return {text: null, reason: `HTTP ${r.status} (${model})${detail ? ' — ' + detail : ''}`};
    }
    const j = await r.json();
    const cand = (j.candidates || [])[0] || {};
    // 잘린 응답은 버린다 — finishReason이 STOP이 아니면(MAX_TOKENS·SAFETY 등) 문장이
    // 완결되지 않았다는 뜻이다.
    if(cand.finishReason && cand.finishReason !== 'STOP'){
      console.log('[ai] 비정상 종료', cand.finishReason, model);
      return {text: null, reason: `잘린 응답(${cand.finishReason}, ${model})`};
    }
    // 생각하는 모델은 응답 parts에 추론 요약(thought: true)을 섞어 보낸다. 그걸 같이
    // 이어붙이는 바람에 영어 메모("slight drop). *   Leeds: *   xG")가 해설로 들어갔다.
    const parts = (cand.content || {}).parts || [];
    const text = parts.filter(x => !x.thought).map(x => x.text || '').join('').trim();
    if(!text){ console.log('[ai] 빈 응답'); return {text: null, reason: `빈 응답(${model})`}; }
    // 한국어 본문인지, 문장으로 끝나는지 확인 — 마크다운 목록이나 영어 메모가 오면 버린다.
    const letters = text.replace(/[^A-Za-z\uAC00-\uD7A3]/g, '');
    const hangul = text.replace(/[^\uAC00-\uD7A3]/g, '');
    if(!letters.length || hangul.length / letters.length < 0.8){
      return {text: null, reason: `한국어 아님(${model}): ${text.slice(0, 40)}`};
    }
    if(/^\s*[-*•#]/m.test(text)) return {text: null, reason: `목록 형식(${model})`};
    if(!/[.!?。]\s*$/.test(text) && !/[다요]\s*$/.test(text)){
      return {text: null, reason: `문장이 끝나지 않음(${model}): …${text.slice(-20)}`};
    }
    const bad = unknownNumbers(text, facts);
    if(bad.length){
      console.log('[ai] 근거 없는 숫자로 폐기', bad.join(','));
      return {text: null, reason: `근거 없는 숫자(${[...new Set(bad)].slice(0, 5).join(', ')}) — ${model}`};
    }
    // 너무 길거나 짧으면(모델이 형식을 무시한 경우) 버린다.
    if(text.length > 1100){ console.log('[ai] 길이 초과로 폐기', text.length); return {text: null, reason: `길이 초과(${text.length}자)`}; }
    if(text.length < 150){ return {text: null, reason: `너무 짧음(${text.length}자)`}; }
    // 문단 구분(빈 줄)은 살리고, 문단 안의 줄바꿈만 이어붙인다.
    const clean = text.split(/\n\s*\n/).map(pp => pp.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean).join('\n\n');
    return {text: clean, reason: 'ok', model};
  } catch(e){
    console.log('[ai] 생성 실패', e.name);
    return {text: null, reason: `예외 ${e.name}`};
  }
}
