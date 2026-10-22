# 성인 로컬 진행 1단계 — 서버 검증 결과

2026-10-22. `local-adult-design.md` §10의 서버 단계다. 운영 화면은 여전히 새 커리어를 v2로 시작한다. main 직접 푸시·머지·직접 배포 없음.

## 구현 범위

- v2 시뮬레이션과 의존 계산 모듈을 `sim-v3/`로 분리했다. 수학 함수는 사칙연산 급수로, 정렬은 코드 포인트 비교로 교체했다. v1/v2와 기존 PK 파일은 바꾸지 않았다.
- v3 commit은 정규화된 유스 기록과 next를 stableJSON으로 만들고 `CAREER_SEED_SECRET` HMAC-SHA256으로 seed2(앞 4바이트, big-endian)와 id(`id|` 접두사, 앞 8바이트 hex)를 만든다. 토큰 암호화 키·형식은 그대로다.
- 봉인된 19세 시작 상태에 `simVersion:3, localAdult:3`을 남긴다. 응답은 토큰·seed2·평문 상태·기존 화면 데이터다. 성인 진행 엔드포인트는 이 토큰을 받으면 로컬 진행을 안내하고 거부한다.
- submit은 로그인 확인 후 확정 토큰에서 성인 선택을 재생한다. 점수와 은퇴 카드 전체를 포함한 SHA-256 stateDigest가 다르면 409, 형식·순서·범위 오류는 400이다. 둘 다 KV에 접근하지 않는다. 성공·중복 등록 경로는 기존 그대로다.
- 불일치 로그는 id·버전·요구/실제 점수·행동 수와 engine 분류만 남긴다. 전체 UA·닉네임·행동 원문은 남기지 않는다. iOS WebKit 기반 브라우저는 safari, Chromium Edge는 chrome으로 분류한다.

## 입력 필드 전수 조사와 상한

`flow.step`의 외부 입력: season은 prep에서 train/evPick/loanPick, injury에서 injPick; next는 pick/trait; penalty는 key/x/y/power; military는 action(apply/regular); scout/service-return/retire는 입력 없음. 부상 응답은 별도 injury API가 아니라 기존 season+injPick이다.

대표팀 decisions는 클라이언트 입력이 아니다. penalty 처리에서 현재 key의 검증된 x/y/power로 내부 생성한다. 외부 decisions·auto·state·score 주입은 허용하지 않는다. 병역·복귀·은퇴·스카우트는 현재 단계에서 허용될 때만 받는다. PK key는 현재 대기 중인 경기와 같아야 한다.

성인 기록은 32×64=2,048행동, JSON 120,000자 상한이다. 유스는 기존 80행동/24,000자 상한을 유지한다. 재생 중 `flow.view`, 미리 받기, 부상 양갈래 화면 계산을 생략하고 카드는 마지막 대조·등록 시 만든다.

## §9 실행 결과

| 항목 | 결과 |
|---|---|
| 1. 순차 진행 = 서버 성인 전체 재생 | 2,000/2,000, digest·카드 완전 일치 |
| 2. v2/v3 비교 | 아래 세 분류 및 최초 차이 표 |
| 3/6/7. API | 최종 27회 호출 검증 통과: 실제 능력치 조작 후 대조, 점수·digest 불일치, 무로그인, 미은퇴·은퇴 뒤 추가 기록, 미지원 버전·다른 게임 토큰, 필드·PK·병역·복귀·기록 길이, secret 누락, 반복 확정, 중복 등록 |
| 4. 버전 고정 | 결과가 다른 가짜 v4 분기가 추가된 API 복사본에서도 v3 등록 통과 |
| 5. 실제 엔진 대조 | Chromium 300 + Firefox 300 + WebKit 300 = 900/900, Node 해시와 완전 일치 |
| 5. 금지 함수·근사 오차 | 계산 파일 12개 검사, 100,005 수치 대조 통과, 최대 오차 약 1.02e-15 |
| 8. 구버전 | v1 암호화 전체 커리어 24개 고정 스냅샷 통과; v1/v2 브라우저/Node 4,000개; v2 재생 2,000개 통과 |
| 9. 기존 테스트 전체 | 기존 test_career_*.mjs 19/19 통과. talent_rates의 미지원 버전 번호만 3에서 4로 이동 |
| 10. 운영 화면 전환 | 2단계 대상. 현재 화면은 v2 유지; 검증 페이지 390px, 성인 계산 API 0회 확인 |

실제 아이폰은 사용하지 않았다. 사용자 합의대로 Playwright WebKit(JavaScriptCore)으로 대체했다. WebKit 26.5·Firefox 153, Chromium 154.0.8037.57에서 실행했다. 부족한 Linux 라이브러리는 작업 환경에만 준비했다(저장소에 포함하지 않음).

## v2와 v3 — 사용자 지정 세 분류

버전 표식(simVersion/localAdult)만 제외하고 상태와 카드를 함께 대조했다. v3 내부 브라우저/서버 대조에는 반올림 허용을 적용하지 않는다.

| 분류 | 판 수 | 비율 |
|---|---:|---:|
| 완전 동일 | 1,586 | 79.3% |
| 표시값만 다름 | 406 | 20.3% |
| 실질 차이(능력치의 원시 소수까지 엄격 비교) | 8 | 0.4% |
| 전체 차이 | 414 | 20.7% |

표시값 차이는 chance/probability만 다르고 소수 6자리 반올림은 같다. 8판도 최초 차이는 능력치의 약 1e-14 원시 소수 차이다. 이를 표시값 차이로 넘기지 않고 사용자 기준에 따라 실질 차이로 집계했다. 추가 확인 결과 8판 모두 최종 점수·사건·수상·판정은 같았고, 확률 외 차이는 st와 ovr의 끝자리였다. 실질 차이는 중지 기준 1% 아래다.

| seed | seed2 | 나이 | 행동/사건 키 | 첫 필드 | v2 값 | v3 값 |
|---|---|---:|---|---|---|---|
| 691371656 | 1449046878 | 22 | season / loan | st.0 | 63.378988679194606 | 63.37898867919459 |
| 1522428148 | 1524989906 | 19 | season / weak | st.0 | 62.531941889633565 | 62.53194188963356 |
| 1369403552 | 3324600582 | 21 | season / loan | st.0 | 57.10592762646876 | 57.105927626468755 |
| 4136844629 | 3736531737 | 22 | season / loan | st.0 | 66.0852266275445 | 66.08522662754451 |
| 842441799 | 1060137719 | 20 | season / loan | st.0 | 66.18695210202998 | 66.18695210202996 |
| 3244187408 | 1226599446 | 21 | season / loan | st.0 | 63.231740330272615 | 63.2317403302726 |
| 2103938106 | 4282708604 | 22 | season / loan | st.0 | 71.10610056470964 | 71.10610056470962 |
| 501471398 | 3680546032 | 21 | season / loan | st.0 | 66.5855212801301 | 66.58552128013008 |

## 요청·KV 측정

`node scripts/measure_career_adult.mjs`가 유효한 입력·토큰을 만들고 아래 명령을 실행한다. 등록 API는 운영 KV에 쓰지 않도록 메모리 테스트 저장소로 대체하고, 실제 handler의 fetch·KV 명령을 센다. 테스트 토큰은 실제 운영에서 사용할 수 없다.

```sh
node scripts/measure_api.mjs career '{"a":"commit"}' --method POST --body-file <유스 JSON> --fixture-career-kv
node scripts/measure_api.mjs career '{"a":"submit"}' --method POST --body-file <확정토큰·기록·claim JSON> --fixture-career-kv
```

| 경로 | HTTP | 외부 fetch | KV 명령 |
|---|---:|---:|---:|
| commit 1/2회차 | 200 | 0 | 0 |
| submit 첫 등록 | 200 | 10 | 10 |
| 같은 기록 재등록 | 409 | 1 | 1(NX) |
| 검증 오류·불일치 | 400/409 | 0 | 0 |

최초 등록 10명령은 done SET NX, 월 INCR/EXPIRE, ZSCORE, 카드 SET, 요약 HSET, ZADD, 정리 ZRANGE, board 버전 INCR, ZREVRANK다. 기존 순위 밖 정리 등 조건별 추가 명령은 기존과 같다.

## CPU — 이 작업 환경

Linux x64 / Node v24.19.0 / Intel Xeon Platinum 8573C. 벽시계가 아니라 `process.cpuUsage`의 user+system을 쟀다. Workers 실측이 아니다.

| 재계산 범위 | 표본 | 평균 | 최대 |
|---|---:|---:|---:|
| 커리어 전체(유스+성인+마지막 카드) | 100 | 13.97ms | 51.98ms |
| 성인 재생만(2,000판 반복 스트레스 테스트) | 2,000 | 12.10ms | 358.88ms |

성인 스트레스 최대치에는 장시간 반복 중 Node의 GC·런타임 CPU가 포함될 수 있다. 이 값을 숨기거나 Workers의 CPU로 바꾸어 해석하지 않는다. 설계 §10대로 서버 PR 배포 후 운영 submit의 cpuTimeMs/outcome을 확인하고 화면 전환을 진행해야 한다. 아직 운영 배포·운영 CPU 확인은 하지 않았다.

## 재현과 PC 브라우저 검증

```sh
env -u KV_REST_API_URL WHOAMI_SECRET=test-only-secret node scripts/test_career_local_adult.mjs
node scripts/test_career_determinism.mjs
node scripts/measure_career_adult.mjs
npx playwright install --with-deps webkit firefox
node scripts/test_career_local_adult_browser.mjs
python3 -m http.server 8080 --directory arsenal-dashboard/public
```

PC에서 `http://localhost:8080/career/verification/local-adult.html`을 열고 300판 검증을 누른다. 프리뷰/운영에 이 서버 PR이 배포됐다면 같은 경로로 열 수 있다. API·로그인·랭킹 등록 없이 고정 가상 선수만 계산한다.

## 설계 대비 선택·대기 사항

- detmath는 설계가 허용한 직접 근사 구현을 선택했다. 반올림으로 덮는 방식은 쓰지 않았다.
- stateDigest는 버전·phase·id·score·cardView 전체의 stableJSON SHA-256이다. 상태 요약 범위를 명확히 고정했다.
- 구버전 파일을 수정하지 않기 위해 수학 함수가 없는 military/shootout/seeds도 v3로 복사했다. 이들의 계산 의존성이 v1 국제대회/PK로 빠져나가지 않도록 하기 위해서다. 변경 없는 data와 Bad 오류 클래스만 구버전을 공유한다.
- 검증기만을 위한 HTML/JS/JSON은 1단계에 포함했다. 실제 게임 화면은 수정하지 않았다.
- 사용자 합의로 설계 §9.2·§9.5와 불일치 engine 로그 요건을 문서에 반영했다.
- **다음 순서**: 사용자가 Cloudflare 비밀에 CAREER_SEED_SECRET 등록 → 이 PR 검토·main 머지로 서버 배포 → 테스트 커리어 v3 확정·등록과 운영 CPU 확인 → 2단계 화면 PR → 3단계 구조 문서 PR. 이 작업에서는 main에 직접 푸시하거나 머지하지 않는다.
