# 작업 지시: 커리어 모드 "로컬 리롤" (18세 평가까지 브라우저 계산)

## 목표
리롤(18세 평가 보고 버리는 커리어)이 서버를 안 쓰게 한다. 지금은 리롤 1번에 API 5~8회(new·join·15/16/17세 season·next)라,
300번 리롤하면 1,500회 가까이 쓴다. Cloudflare 요청 수(무료 하루 10만)의 대부분이 이거다.

## 방식(합의됨)
1. 새 커리어: 브라우저가 시드를 정하고 첫 구단 목록·15→17세 시즌·18세 평가까지 직접 계산한다 — **API 0회**.
2. 리롤: 그냥 버린다 — 0회.
3. "계속하기"(18세 이후로 진행)를 누를 때만 서버 1회(예: `POST /api/career?a=commit`):
   `{seed, input(이름·국가·주발·포지션·카드·등번호·꿈·체형…), choices:[유스 시즌별 train·evPick·loanPick·injPick·첫 구단 pick 등]}`.
   서버는 **처음부터 재계산**해 18세 상태를 만들고(브라우저 결과는 믿지 않는다) 거기에 **서버 난수 `seed2`**를 넣어 봉인한 토큰을 준다.
   이후는 지금과 같은 서버 진행.
4. 진행 중인 기존 커리어(옛 토큰)는 그대로 — `seed2`가 없으면 지금처럼 `seed` 하나로 진행.

## 핵심 함정 — `C.seed`를 바꾸지 말 것
`api/_career_sim.js`는 `mulberry(C.seed ^ hashStr(...))`를 여러 곳에서 **그때그때 다시 계산**한다(예: `devOf()`, `contractYears`,
재능 개화 `bloom|나이`, 체형 `body`, 약발 `wfBorn`, `seasonRng`). 18세에 `C.seed`를 갈아끼우면 유스 때 본 잠재력(발전 속도 등)이
성인 때 다른 값이 돼 버린다. 그러니:
- 원래 `seed`는 그대로 두고 `seed2`를 **추가**한다.
- 모든 `C.seed` 사용처를 전수 조사해 둘로 나눈다:
  - **선수 고유 성질**(발전 속도, 대기만성 `C.late`, 체형, 약발, 재능 등 — 유스에서 "좋은 선수를 고르는" 근거) → 원래 `seed` 유지.
  - **18세 이후의 미래 사건**(성인 시즌 난수 `seasonRng`, 계약 연수, 이적·이벤트 등) → `seed2`(있을 때만, 없으면 `seed`).
- 이 분류표를 문서(`docs/career-mode/career-mode.md`)에 남길 것.

## 공용 코드
- 계산 모듈(`_career_sim.js`, `_career_data.js`, `_career_military.js`, `_career_international.js`, `_career_club_final.js`,
  `_career_finance.js`)에는 `Math.random`·`crypto`·`Date.now` 사용이 없다(확인함) — 브라우저에서 그대로 돌릴 수 있다.
- 서버 `career.js`의 화면용 정리 코드(`view(C)`, `seasonReply`, `stayNext`, 유스 분기 처리)는 순수 부분만 공용 모듈로 빼서
  서버·브라우저가 같은 파일을 쓰게 한다. 선례: `public/career/penalty-rules.js`를 서버와 브라우저가 같이 쓴다.
  (`/api/*`는 Worker가 받으므로 브라우저용 파일은 `public/` 아래에 있어야 한다. 서버는 상대 경로로 import.)
- 유스 분기 전부를 선택 기록에 넣을 것: 첫 구단(해외 유스 포함), 훈련, 이벤트 선택, 부상 선택(`injOpts`), 빅클럽 스카우트 이적,
  1군 훈련 초대, 임대(`loanPick`) 등.

## 검증(필수)
- 새 테스트: 시드 수천 개 × 무작위 유스 선택으로 "브라우저 경로 18세 상태 == 서버 재계산 18세 상태"를 자동 대조
  (`scripts/test_career_local_reroll.mjs`). `WHOAMI_SECRET='test-only-secret'`, `env -u KV_REST_API_URL`로 실행(기존 테스트와 같은 방식).
- `seed2`를 넣은 뒤 18세 이전 값(발전 속도·대기만성 등)이 그대로인지, 18세 이후 시즌이 `seed2`에 따라 달라지는지 테스트.
- 옛 토큰(seed2 없음)이 지금과 같은 결과를 내는지 테스트.
- 기존 `scripts/test_career_*.mjs` 전부 통과.

## 운영 메모
- 배포는 `main` 머지 → Cloudflare Workers Builds 자동(`coyg.co.kr`). 서버 `a=commit`을 먼저 배포하고 화면은 그다음.
- 커리어 토큰 암호화 키는 `KV_REST_API_TOKEN`에서 나온다 — 건드리지 말 것.
- 답변은 한글, 커밋 메시지 끝에 저장소 규칙의 Co-Authored-By 줄.
