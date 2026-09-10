// scripts/test_translation.mjs — 번역 사전·원문 치환·수동 교정 회귀 테스트
//
// 실행: node scripts/test_translation.mjs   (저장소 루트에서, 의존성 없음)
// 구글 API는 부르지 않는다 — 사전/치환 로직만 검사하므로 비용 0.
//
// 규칙(_glossary.js)이나 수동 교정(_translation_overrides.js)을 고치면 반드시
// 돌릴 것. 새 규칙이 기존 문장을 망가뜨리는지(예: "촬영 → 슈팅"이 유튜브 제목의
// "사진 촬영"을 바꿔버린 것) 여기서 잡힌다. 새 규칙을 넣을 땐 그 규칙이 고치는
// 문장 + 그 규칙이 건드리면 안 되는 문장을 둘 다 아래에 추가한다.

const G = await import(new URL('../arsenal-dashboard/api/_glossary.js', import.meta.url));
const T = await import(new URL('../arsenal-dashboard/api/_translate.js', import.meta.url));
const { applyGlossary, prepareSource, GLOSSARY_ENTRIES } = G;
const { segmentsFromOverride, overrideFor } = T;

let pass = 0, fail = 0;
function check(group, got, want, input) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; return; }
  fail++;
  console.log(`✗ [${group}]\n    입력: ${JSON.stringify(input)}\n    기대: ${JSON.stringify(want)}\n    실제: ${JSON.stringify(got)}`);
}
const suite = (group, fn, cases) => cases.forEach(([input, want]) => check(group, fn(input), want, input));

// ── 1. 이름 표기 통일 (번역 후 한국어 치환) ────────────────────────────
suite('이름', applyGlossary, [
  ['아스널이 에미레이트 스타디움에서 맨시티를 꺾었다', '아스날이 에미레이츠 스타디움에서 맨시티를 꺾었다'],
  ['Arsenal beat City', '아스날 beat City'],
  ['Ødegaard가 아스날의 결승골을 기록했습니다.', '외데고르가 아스날의 결승골을 기록했습니다.'],
  ['마르틴 외데가르드가 최고의 기량을', '마르틴 외데고르가 최고의 기량을'],
  ['마틴 외데가르드가 행복하고 건강하다', '마르틴 외데고르가 행복하고 건강하다'],
  ['외데가르드는 팀의 승리를 이끌었다', '외데고르는 팀의 승리를 이끌었다'],
  ['빅토르 교케레스는 슈팅이 없었다', '빅토르 요케레스는 슈팅이 없었다'],
  ['교케레스가 부진했다', '요케레스가 부진했다'],
  ['마르틴 주비멘디가 최다 출전', '마르틴 수비멘디가 최다 출전'],
  ['가브리에우 마갈량이스가 복귀했다', '가브리엘 마갈량이스가 복귀했다'],
  ['가브리엘 지저스의 부상', '가브리엘 제주스의 부상'],
  ['가브리엘이 헤더로 득점했다', '가브리엘이 헤더로 득점했다'], // 성 없는 가브리엘은 누군지 몰라 그대로
  ['유리엔 팀버가 복귀', '위리엔 팀버가 복귀'],
  ['위리엔 팀버르가 복귀', '위리엔 팀버가 복귀'],             // 연쇄 치환("팀버르르") 회귀
  ['마일스 루이스스켈리', '마일스 루이스-스켈리'],
  ['이선 은와네리가 도르트문트로', '에단 은와네리가 도르트문트로'],
  ['피에로 인카피에가 임대로', '피에로 잉카피에가 임대로'],
  ['Ezri Konsa returns to Arsenal', '에즈리 콘사 returns to 아스날'],
  ['Bruno Guimaraes joins', '브루노 기마랑이스 joins'],
  ['Ceadach O’Neill and Elijah Upson', '시아다흐 오닐 and 엘리야 업슨'],
  ['Edwin Quintero and Holger Quintero', '에드윈 퀸테로 and 홀거 퀸테로'],
  ['grilled salmon recipe', 'grilled salmon recipe'],           // Salmon 성 단독은 안 잡음(연어)
]);

// ── 2. 축구 용어 오역 교정 ───────────────────────────────────────────
suite('용어', applyGlossary, [
  ['무자비한 사격의 방법을 보여주기 전까지는', '무자비한 슈팅의 방법을 보여주기 전까지는'],
  ['임상 마무리가 돋보였다', '정확한 마무리가 돋보였다'],
  ['라야가 깨끗한 경력을 기록했다', '라야가 무실점을 기록했다'],
  ['사카의 중괄호', '사카의 멀티골'],
  ['부상 시간에 터진 결승골', '추가시간에 터진 결승골'],
  // 원래 뜻의 "촬영"은 그대로 — 유튜브 유니폼 발표·비하인드 제목
  ['새로운 홈 유니폼 사진 촬영 현장', '새로운 홈 유니폼 사진 촬영 현장'],
  ['사카, 라이스와 함께 촬영', '사카, 라이스와 함께 촬영'],
]);

// ── 3. URL 보호 ─────────────────────────────────────────────────────
suite('URL', applyGlossary, [
  ['아스널 소식 www.nytimes.com/athletic/757... 참고', '아스날 소식 www.nytimes.com/athletic/757... 참고'],
  ['https://arsenal.com/Arsenal 링크', 'https://arsenal.com/Arsenal 링크'],
  ['아스널은 승점 3 점으로 시작했다 www.bbc.com/sport 참고', '아스날은 승점 3 점으로 시작했다 www.bbc.com/sport 참고'],
]);

// ── 4. 번역 전 영어 원문 치환 ─────────────────────────────────────────
suite('원문치환', prepareSource, [
  ['Anti-ruthless shooting, until Martin Odegaard showed them how to do it.', 'A lack of clinical finishing, until Martin Odegaard showed them how to do it.'],
  ['They were anti-ruthless again', 'They were wasteful again'],
  ['Arsenal pay heavy price for lack of ruthlessness', 'Arsenal pay heavy price for lack of clinical finishing'],
  ['Can Arsenal become ruthless enough to win the title?', 'Can Arsenal become clinical enough to win the title?'],
  ['Arsenal were ruthless in front of goal', 'Arsenal were clinical in front of goal'],
  // 다른 뜻의 ruthless는 건드리면 안 된다
  ['Arteta was ruthless in his team selection', 'Arteta was ruthless in his team selection'],
  ['A ruthless tackle left Saka injured', 'A ruthless tackle left Saka injured'],
  ['Arsenal lacked a ruthless edge in front of goal', 'Arsenal lacked a ruthless edge in front of goal'],
]);
// 원문 치환 대체어에 한국어가 섞이면 안 된다(HTML 모드에서 구글이 문장을 못 읽음 — 실측)
for (const probe of ['anti-ruthless', 'anti-ruthless shooting', 'ruthlessness', 'ruthless enough', 'ruthless in front of goal']) {
  check('원문치환-영어만', /[가-힣]/.test(prepareSource(probe)), false, probe);
}

// ── 5. 사전 자체의 일관성 ─────────────────────────────────────────────
// 모든 정식 표기는 사전을 통과해도 그대로여야 한다 — 다른 항목의 변형에 걸려
// 바뀌면 규칙끼리 충돌한 것이다(새 규칙 추가 시 가장 흔한 사고).
for (const [canonical] of GLOSSARY_ENTRIES) {
  check('정식표기 보존', applyGlossary(canonical), canonical, canonical);
}

// ── 6. 수동 교정: SNS 링크 되살리기 ──────────────────────────────────
const L = (text, url) => ({ type: 'link', text, url });
check('수동교정-링크',
  segmentsFromOverride('나폴리전 생각을 @jack 과 함께 나눴습니다. nyt.com/a',
    [L('@jack', 'https://bsky.app/profile/x'), L('nyt.com/a', 'https://nyt.com/a/full')]),
  [{ type: 'text', text: '나폴리전 생각을 ' }, L('@jack', 'https://bsky.app/profile/x'),
   { type: 'text', text: ' 과 함께 나눴습니다. ' }, L('nyt.com/a', 'https://nyt.com/a/full')],
  '기본');
// 한국어 어순 때문에 링크 순서가 원문과 달라져도 번역문 위치대로 놓는다
check('수동교정-링크',
  segmentsFromOverride('#AFC 소식: @a 와 @b',
    [L('@b', 'u-b'), L('@a', 'u-a'), L('#AFC', 'u-afc')]).map(x => x.text),
  ['#AFC', ' 소식: ', '@a', ' 와 ', '@b'],
  '순서 뒤바뀜');
// 같은 표기가 두 번 나오면 각각 다른 위치에 붙는다
check('수동교정-링크',
  segmentsFromOverride('@a 그리고 @a', [L('@a', 'u1'), L('@a', 'u2')]).map(x => x.url || x.text),
  ['u1', ' 그리고 ', 'u2'],
  '중복 표기');
// 링크 표기를 못 찾으면 null(교정 무시 → 평소대로 번역)
check('수동교정-링크', segmentsFromOverride('링크가 빠진 번역', [L('@jack', 'u')]), null, '링크 누락');

// ── 7. 수동 교정 데이터 자체 검사 ─────────────────────────────────────
const { OVERRIDES } = await import(new URL('../arsenal-dashboard/api/_translation_overrides.js', import.meta.url));
const seen = new Set();
for (const o of OVERRIDES) {
  const key = String(o.en || '').replace(/\s+/g, ' ').trim();
  check('수동교정-데이터', typeof o.en === 'string' && typeof o.ko === 'string' && !!key && !!o.ko.trim(), true, o);
  check('수동교정-중복 원문', seen.has(key), false, key.slice(0, 60));
  seen.add(key);
  check('수동교정-조회', overrideFor(o.en), o.ko, key.slice(0, 60));
}

console.log(`\n${fail ? '❌' : '✅'} ${pass} 통과 / ${fail} 실패  (수동 교정 ${OVERRIDES.length}건 등록됨)`);
process.exit(fail ? 1 : 0);
