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
  const md = iso => { const d = new Date(iso); return isNaN(d) ? '' : `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`; };
  const L = [];
  const team = (t, where) => {
    const lines = [];
    lines.push(`■ ${t.shortName} (${where}, ${t.leagueName || '리그 정보 없음'})`);
    lines.push(`- 경기당 기대득점 ${two(t.xgFor)} (리그 ${t.attackRank}위), 경기당 기대실점 ${two(t.xgAgainst)} (리그 ${t.defenceRank}위)`);
    if(t.record && t.record.played){
      lines.push(`- 이번 시즌 ${where === '홈' ? '홈' : '원정'} ${t.record.played}경기 ${t.record.wins}승 ${t.record.draws}무 ${t.record.losses}패, ${t.record.gf}득점 ${t.record.ga}실점`);
    }
    if((t.form || []).length){
      const f = t.form.map(x => `${md(x.at)} ${x.venue} ${x.opp} ${x.gf}-${x.ga} ${x.res}`).join(' / ');
      const w = t.form.filter(x => x.res === '승').length, d = t.form.filter(x => x.res === '무').length, l = t.form.filter(x => x.res === '패').length;
      lines.push(`- 최근 공식전 ${t.form.length}경기 ${w}승 ${d}무 ${l}패: ${f}`);
    }
    const tp = t.topPlayers || {};
    const tpBits = [];
    if(tp.goals) tpBits.push(`팀 내 최다 득점 ${tp.goals.name} ${tp.goals.value}골`);
    if(tp.assists) tpBits.push(`최다 도움 ${tp.assists.name} ${tp.assists.value}개`);
    if(tp.rating) tpBits.push(`평점 1위 ${tp.rating.name} ${tp.rating.value}`);
    if(tpBits.length) lines.push(`- ${tpBits.join(', ')}`);
    const inj = t.injury || {};
    const out = (inj.out || []).map(o => `${o.name}(${o.posLabel}${o.doubtful ? ', 출전 불투명' : ''})`);
    if(out.length){
      const dAtk = Math.round((1 - inj.attackFactor) * 100);
      const dDef = Math.round((inj.concedeFactor - 1) * 100);
      lines.push(`- 결장: ${out.join(', ')} → 추정 영향: 득점력 ${dAtk}% 하락, 실점 ${dDef}% 증가`);
    } else {
      lines.push('- 결장자 없음');
    }
    if(t.rest && t.rest.penalty >= 0.015){
      lines.push(`- 일정 부담: 직전 경기 후 ${t.rest.days}일 휴식, 최근 2주간 ${t.rest.matches14}경기`);
    }
    return lines.join('\n');
  };
  L.push(`대회: ${p.competition.name || '정보 없음'}`);
  L.push(team(p.home, '홈'));
  L.push(team(p.away, '원정'));
  if(p.crossLeague) L.push('※ 두 팀은 서로 다른 리그라, 위 리그 순위는 각자 자기 리그 안에서의 순위다.');
  const h = p.h2h;
  if(h && h.summary){
    const [w, d, l] = h.summary;
    const recent = (h.matches || []).map(m => `${m.year}년 ${m.home} ${m.score} ${m.away}`).join(' / ');
    L.push(`■ 맞대결: 통산 ${p.home.shortName} 기준 ${w}승 ${d}무 ${l}패${recent ? ` (최근: ${recent})` : ''}`);
  }
  L.push(`■ 전망: ${p.home.shortName} 승리 ${pct(p.probs.home)}%, 무승부 ${pct(p.probs.draw)}%, ${p.away.shortName} 승리 ${pct(p.probs.away)}%`);
  L.push(`- 예상 득점 ${p.home.shortName} ${p.expected.home.toFixed(1)}골, ${p.away.shortName} ${p.expected.away.toFixed(1)}골`);
  L.push(`- 가장 유력한 스코어: ${p.scorelines.slice(0, 3).map(s => s.score).join(', ')}`);
  L.push(`- 두 팀 합계 3골 이상 ${pct(p.over25)}%, 양 팀 모두 득점 ${pct(p.btts)}%`);
  return L.join('\n');
}

const PROMPT = `너는 축구 중계 방송의 해설위원이다. 경기 직전 프리뷰 코너에서 시청자에게 이 경기를
어떻게 보는지 **말하듯이** 풀어 설명한다. 아래 [사실]이 네가 아는 전부다.

어떻게 쓰나:
- **첫 문장은 이 경기의 핵심 관전 포인트 하나**로 시작해라. ("이번 경기의 관전 포인트는 ~입니다" 식으로)
  [사실]을 보고 가장 결정적인 것 하나를 골라라 — 결장 공백일 수도, 흐름 차이일 수도, 맞대결 상성일 수도 있다.
- 그 다음은 그 논지를 뒷받침하는 근거를 **골라서** 이야기한다. 반대로 작용하는 요인도 한 번은 짚는다.
- 마지막은 "결국 관건은 ~" 식으로 정리하고 승리 확률과 가장 유력한 스코어로 끝낸다.
- 지표를 전부 훑지 마라. **숫자는 논지를 받칠 때만, 문단당 한두 개**. 나머지는 말로 풀어라.
- "A는 ○로 리그 ○위, ○로 리그 ○위를 기록하고 있습니다"처럼 지표를 연달아 나열하는 문장은 쓰지 마라.
  이건 기사가 아니라 해설이다.

말투:
- 격식 있는 존댓말. 문장은 "~입니다", "~습니다"로 끝낸다.
- "~죠", "~고요", "~거든요", "~네요" 같은 구어 어미는 쓰지 마라.
- 속어·은어·과장된 비유는 쓰지 마라. 예: "짠물 수비" 대신 "단단한 수비", "대박", "폭격" 같은 표현 금지.
  차분하고 품위 있는 분석 해설의 어조를 유지한다.
- 세 문단, 합계 6~9문장. 문단 사이는 빈 줄. 마크다운·목록·제목·이모지 금지.

참고 예시(형식만 참고하고, ○ 자리는 반드시 [사실]의 실제 값으로 채운다):
"이번 경기의 관전 포인트는 홈팀의 수비진 공백이 얼마나 치명적이냐입니다. 홈팀은 경기당 기대실점 ○○로 리그에서
가장 단단한 수비를 보여주고 있지만, 그 중심인 수비수가 이번 경기에 나서지 못합니다. 지금까지의 수비 안정감을
그대로 기대하기는 어려운 상황입니다.

그럼에도 흐름은 홈팀 쪽에 있습니다. 최근 공식전 ○경기에서 ○승을 거뒀고, 이 상대에게는 통산 한 번도 패하지 않았습니다.
반면 원정팀은 최근 무승부가 이어지며 좀처럼 승리를 가져오지 못하고 있습니다.

결국 관건은 홈팀이 수비 공백을 공격으로 덮을 수 있느냐입니다. 승리 확률 ○○%, 가장 유력한 스코어는 ○-○입니다."

엄격한 규칙:
- 숫자는 [사실]에 적힌 값을 그대로만 써라. 새로 계산하거나 반올림을 바꾸거나 없는 숫자를 만들지 마라.
- [사실]에 없는 정보(감독 발언, 전술, 부상 복귀 시점, 선수 컨디션 등)는 지어내지 마라.
- 모형이 우세하다고 본 쪽과 반대되는 결론을 내리지 마라. 우열이 근소하면 근소하다고 말해라.
- "모형", "보정", "추정 영향", "[사실]" 같은 말은 쓰지 마라.

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

// 무료 한도가 모델마다 분당 5회·하루 20회로 작다(AI Studio 실측 화면). 그래서
// ① 모든 호출 사이를 최소 13초 벌려 분당 5회 안에 들어오게 하고,
// ② 429(한도 초과)를 받은 모델은 잠시 "소진"으로 표시해 같은 실행에서 다시 부르지 않는다 —
//    한도가 찬 모델에 재시도하면 성공할 수 없는 호출로 횟수만 깎인다(실측: 하루 24/20).
//    메시지에 "per day"가 있으면 하루 한도라 길게, 아니면 분당 한도라 짧게 막는다.
// 서버리스 인스턴스가 살아있는 동안만 유지되는 값이라, 다음 날 크론엔 자연히 초기화된다.
const MIN_GAP_MS = 13 * 1000;
let _lastCallAt = 0;
const _exhaustedUntil = new Map();   // model → 이 시각(ms)까지 호출 안 함
const isExhausted = m => (_exhaustedUntil.get(m) || 0) > Date.now();

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
      // 격식 있는 문체가 흔들리지 않게 너무 높이지 않는다(0.9에선 구어체로 새는 걸 우려).
      generationConfig: {temperature: 0.8, maxOutputTokens: 4096},
    };
    const callOnce = async model => {
      const wait = _lastCallAt + MIN_GAP_MS - Date.now();
      if(wait > 0) await new Promise(res => setTimeout(res, wait));
      _lastCallAt = Date.now();
      return rawCall(model);
    };
    const rawCall = async model => fetch(
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
    // 그래도 안 되면 나머지 flash 후보를 하나씩 — 실측으로 3.8이 과부하일 때 3.7도 같이
    // 과부하인 경우가 있었다(리즈전 두 번 연속 실패). 버전이 다르면 서버 풀도 다를 수 있다.
    // 한도가 찬(429) 모델은 계획에서 뺀다. 503은 기다리면 풀리는 과부하라 같은 모델을 재시도한다.
    const plan = [model, model, model];
    const WAITS = [0, 3000, 10000];   // 최소 간격(MIN_GAP_MS)이 더 길어 실제로는 그쪽이 적용된다
    if(!GEMINI_MODEL_ENV) _candidates.filter(n => n !== model).forEach(n => plan.push(n));

    let r = null, lastErr = null, tried = 0;
    for(let i = 0; i < plan.length; i++){
      if(isExhausted(plan[i])) continue;
      if(tried > 0) await new Promise(res => setTimeout(res, WAITS[i] != null ? WAITS[i] : 500));
      model = plan[i];
      tried++;
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
      if(r.status === 429){
        let msg = '';
        try { msg = JSON.stringify(await r.clone().json()); } catch(_){}
        const perDay = /per ?day|PerDay/i.test(msg);
        _exhaustedUntil.set(model, Date.now() + (perDay ? 6 * 3600 * 1000 : 65 * 1000));
        console.log('[ai] 한도 초과 — 건너뜀', model, perDay ? '(일일)' : '(분당)');
        continue;
      }
      if(!TRANSIENT.has(r.status)) break;   // 성공 또는 영구 실패
    }
    if(!tried) return {text: null, reason: 'HTTP 429 (모든 flash 모델 한도 소진)'};
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
    // 문체 검사 — 구어 어미("~죠", "~고요")나 속어("짠물")가 섞이면 버린다(사용자 지적:
    // "저급한 해설 보는 느낌"). 프롬프트로도 막지만 모델이 가끔 흘려서 기계적으로 한 번 더 본다.
    const casual = text.match(/(죠|고요|거든요|네요|잖아요)[.!?]?(?=\s|$)/);
    if(casual) return {text: null, reason: `구어체 어미("${casual[1]}") — ${model}`};
    const slang = text.match(/짠물|대박|폭격|미쳤|꿀잼|사이다|개꿀/);
    if(slang) return {text: null, reason: `속어("${slang[0]}") — ${model}`};
    const bad = unknownNumbers(text, facts);
    if(bad.length){
      console.log('[ai] 근거 없는 숫자로 폐기', bad.join(','));
      return {text: null, reason: `근거 없는 숫자(${[...new Set(bad)].slice(0, 5).join(', ')}) — ${model}`};
    }
    // 너무 길거나 짧으면(모델이 형식을 무시한 경우) 버린다.
    if(text.length > 1600){ console.log('[ai] 길이 초과로 폐기', text.length); return {text: null, reason: `길이 초과(${text.length}자)`}; }
    if(text.length < 150){ return {text: null, reason: `너무 짧음(${text.length}자)`}; }
    // 문단 구분(빈 줄)은 살리고, 문단 안의 줄바꿈만 이어붙인다.
    const clean = text.split(/\n\s*\n/).map(pp => pp.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean).join('\n\n');
    return {text: clean, reason: 'ok', model};
  } catch(e){
    console.log('[ai] 생성 실패', e.name);
    return {text: null, reason: `예외 ${e.name}`};
  }
}
