# 성인 로컬 진행 2단계 — 화면 전환 검증 결과

2026-10-22. `codex/career-local-adult-ui`, 기준 main `0e0f88e`(#184). 구현과 3엔진 UI 검증 상태를 먼저 `c2c35ad`로 커밋·푸시한 뒤 전체 검증을 마쳤다. main 직접 푸시·머지·직접 배포 없음.

## 변경

- 새 커리어는 `career-local-v3` 유스로 시작한다. 저장에 `stage:'youth'`를 넣되 서버 확정 HMAC 입력은 바꾸지 않는다.
- 18세 확정 1회 뒤에는 `{version:3,stage:'adult',token,seed2,state,choices}`를 보관한다. state는 확정 당시 그대로 유지하고, 실제 행동을 누적한다. 최대 120KB/2,048행동을 검사한다.
- `sim-v3/browser.js`가 기존 계산 모듈을 호출한다. 순차 진행은 최근 상태 하나를 메모리에 캐시하며, 새로고침하면 확정 상태와 선택 기록을 재생한다. 훈련·결과·부상·PK·병역·복귀·이적·은퇴 모두 로컬이다. 서버 미리 받기(stayNext/injOpts)는 사용하지 않는다.
- v1/v2 유스 기록은 해당 버전으로 재생·확정하고, 기존 성인 암호화 토큰은 서버 진행을 유지한다. 구버전 파일·v3 계산 규칙·토큰 암호화 키는 변경하지 않았다.
- 은퇴 카드도 로컬 계산이다. 등록 시에만 봉인 토큰·행동 기록·score/digest를 보낸다. 연타는 중복 전송하지 않는다.
- 서버의 claim 형식 검사를 `replayAdult` 앞으로 옮겼다. 잘못된 claim과 choices를 동시에 보내 claim 오류가 먼저 나오는 회귀 검사로 순서를 확인했다.
- 불일치 409와 입력 오류 400은 이유를 표시하고 같은 기록의 재전송을 막는다. 중복 409와 구분하며 잘못 등록 완료로 표시하지 않는다.
- 비JSON 503·통신 끊김·시간 초과는 원본 기록을 유지하고 ‘잠시 후 다시 등록’을 제공한다. 오류 상태도 새로고침 후 유지한다.
- **`public/career/verification/` 페이지와 데이터는 변경·삭제하지 않았다.** 사용자 PC 검증 완료 통지 전에는 유지한다.

## §9 검증

| 항목 | 실행 결과 |
|---|---|
| 새 브라우저 실행기 | **2,000/2,000** 은퇴까지 진행, 서버 digest·카드 완전 일치 |
| 메모리 캐시 없는 복원 | **25/25**, 선택 기록으로 동일 카드 복원 |
| 서버 전체 재생·점수/카드 대조 | **2,000/2,000** |
| API 검증 | **28회 호출 검증 통과**, claim 선검사·잘못된 순서/필드/상한·실제 상태 조작·불일치/중복·secret·버전 고정 포함 |
| Chromium·Firefox·WebKit 실제 UI | **3/3 통과**, 390px, 유스 API 0/확정 1/성인 진행·새로고침·은퇴 0/등록 클릭당 POST 1 |
| 실제 UI 실패 처리 | 3엔진 모두 비JSON 503·통신 끊김 재시도, 400/불일치 영구 차단, 새로고침 후 오류·원본 기록 유지, 중복 409 구분, JS 오류 0 |
| 기존 v2 실제 UI | 3엔진 모두 v2 확정 후 암호화 토큰/서버 view 유지 |
| 고정 기록 엔진 대조 | Chromium 300 + Firefox 300 + WebKit 300 = **900/900**, 표시값 포함 Node 해시와 정확히 일치 |
| 결정성 검사 | **13개 파일**, **100,005개 수치 비교** 통과. 최대 근사 오차 약 1.02e-15 |
| 기존 테스트 전체 | **19/19 통과**. v1 암호화 고정 커리어 24개, v1/v2 실제 브라우저 4,000개, v2 재생 2,000개 포함 |
| 저장 크기 | 새 실행기 2,000판에서 최대 **9,186바이트**(테스트용 봉인 토큰 사용) |

새 커리어 기본 버전이 바뀌므로 기존 `test_career_local_browser.mjs`의 새 시작 기대값만 v2→v3로 바꿨다. 해당 테스트의 v1/v2 기록 대조와 기존 성인 서버 이어하기 검사는 유지한다.

등록 성공 뒤 랭킹 갱신 GET 및 랭킹에서 카드를 여는 요청은 기존대로다. ‘한 판 2회’는 커리어 진행·등록 POST(18세 commit 1+submit 1) 기준이며, 랭킹 열람을 포함한 사이트 전체 요청을 뜻하지 않는다.

## v2/v3 세 분류 — 같은 유스·seed2·선택 2,000판

버전 식별자만 제외하고 상태와 카드 전체를 비교했다. 새 실행기도 v3 서버와는 반올림 없이 정확히 일치해야 한다.

| 분류 | 판 수 | 비율 |
|---|---:|---:|
| 완전 동일 | 1,586 | 79.3% |
| 표시값만 다름 | 406 | 20.3% |
| 실질 차이(능력치 원시 소수까지 엄격 비교) | 8 | 0.4% |
| 전체 차이 | 414 | 20.7% |

1단계와 같은 결과다. 표시값 차이는 chance/probability 소수 6자리 반올림이 같고 나머지 결과는 같다. 8건은 원시 st/ovr 약 1e-14 차이를 엄격하게 실질 차이에 포함한 것이며, 첫 차이는 아래와 같다. 최종 점수·사건·판정의 변경은 없었다. 1% 중지 기준 아래다.

| seed | seed2 | 나이 | 행동/사건 키 | 첫 필드 | v2 | v3 |
|---|---|---:|---|---|---|---|
| 691371656 | 1449046878 | 22 | season/loan | st.0 | 63.378988679194606 | 63.37898867919459 |
| 1522428148 | 1524989906 | 19 | season/weak | st.0 | 62.531941889633565 | 62.53194188963356 |
| 1369403552 | 3324600582 | 21 | season/loan | st.0 | 57.10592762646876 | 57.105927626468755 |
| 4136844629 | 3736531737 | 22 | season/loan | st.0 | 66.0852266275445 | 66.08522662754451 |
| 842441799 | 1060137719 | 20 | season/loan | st.0 | 66.18695210202998 | 66.18695210202996 |
| 3244187408 | 1226599446 | 21 | season/loan | st.0 | 63.231740330272615 | 63.2317403302726 |
| 2103938106 | 4282708604 | 22 | season/loan | st.0 | 71.10610056470964 | 71.10610056470962 |
| 501471398 | 3680546032 | 21 | season/loan | st.0 | 66.5855212801301 | 66.58552128013008 |

## 외부 요청·KV 측정

`node scripts/measure_career_adult.mjs`로 유효한 commit/submit을 만들어 `measure_api`를 실행했다. 운영 쓰기를 피하려고 메모리 테스트 KV를 사용했다.

```sh
node scripts/measure_api.mjs career '{"a":"commit"}' --method POST --body-file <유스 JSON> --fixture-career-kv
node scripts/measure_api.mjs career '{"a":"submit"}' --method POST --body-file <성인 JSON> --fixture-career-kv
```

| 경로 | HTTP | 외부 fetch | KV 명령 |
|---|---:|---:|---:|
| commit(두 번) | 200 | 0 | 0 |
| submit 첫 등록 | 200 | 10 | 10 |
| 중복 submit | 409 | 1 | 1(NX) |
| claim/기록 오류·불일치 | 400/409 | 0 | 0 |

진행 중 KV 0, 등록은 기존과 같다. 등록 후 순위 밖 정리 같은 조건별 명령도 그대로다.

## CPU — 이 작업 환경과 운영 관찰을 구분

Linux x64 / Node v24.19.0 / Intel Xeon Platinum 8573C. 아래는 `process.cpuUsage` user+system이며 Workers의 개별 요청 CPU가 아니다.

| 재계산 범위 | 표본 | 평균 | 최대 |
|---|---:|---:|---:|
| 전체 커리어(유스+성인+마지막 카드) | 100 | 14.90ms | 53.13ms |
| 성인 재생(장시간 스트레스) | 2,000 | 14.59ms | 163.22ms |

스트레스 최대치는 Node GC·런타임 CPU를 포함할 수 있다. 로컬 수치를 운영 CPU라고 해석하지 않는다.

**사용자 운영 대시보드 보고:** 2026-10-22 **15:45~15:55 KST**, request.url에 submit 포함 **4건 모두 outcome=ok**, cpuTimeMs **최대 45ms**, exceededCpu/exceededResources 없음. 개별 요청별 값은 따로 확인하지 않았으므로 45ms를 특정 요청 CPU로 단정하지 않는다. 사용자가 운영 확인 통과로 승인했다.

## 운영 테스트 기록과 정리 이력

정상 submit: 2026-10-22 **15:50:46 KST**, Ray `a4e691d8ed636a42-MSP`. 응답은 `registered:true`, 계정 **로컬검증1da146**, 포지션 **DF**, **32위**, **1,413점**이었다. 앞선 작업에서 전용 테스트 계정·랭킹 행 정리가 이미 실행됐고 사용자에게 알렸다. 추가 운영 삭제는 하지 않는다.

이미 실행한 제거 범위(재실행 안내가 아님):

| 명령 | 키 | 멤버/필드 |
|---|---|---|
| ZREM | career:board:v2:DF | @로컬검증1da146 |
| HDEL | career:sum:DF | 로컬검증1da146 |
| DEL | career:card:로컬검증1da146:DF | — |
| DEL | pk:user:로컬검증1da146 | — |
| DEL | pk:alias:로컬검증1da146 | — |
| HDEL | pk:names | 로컬검증1da146 |

이후 career:board:ver를 1 증가시켰다. 중복 방지 `career:done:5151a16ccd9896db`, 월 카운터 `career:reg:2026-10`, 가입 제한 IP 카운터는 남겼다. 해당 공용 카운터·전체 랭킹 키를 지우지 않았다.

## 재현·설계 대비

```sh
env -u KV_REST_API_URL WHOAMI_SECRET=test-only-secret node scripts/test_career_local_adult.mjs
node scripts/test_career_local_adult_client.mjs
node scripts/test_career_adult_ui.mjs
CAREER_UI_BROWSER=firefox node scripts/test_career_adult_ui.mjs
CAREER_UI_BROWSER=webkit node scripts/test_career_adult_ui.mjs
node scripts/test_career_local_adult_browser.mjs
node scripts/test_career_determinism.mjs
node scripts/measure_career_adult.mjs
```

Playwright Firefox/WebKit이 없으면 `npx playwright install --with-deps firefox webkit`으로 준비한다. 이 환경에서는 별도로 추출한 시스템 라이브러리를 사용해 실행했다.

계산 규칙·밸런스·등록 KV 구조에 설계 이탈은 없다. 저장·화면 어댑터를 browser.js로 분리해 1단계 계산 모듈과 HMAC 입력을 고정했다. 최근 상태 캐시는 선택 기록을 대체하지 않으며 새로고침 복원·서버 검증은 원본 상태+기록으로 한다. 메인 CLAUDE.md/career-mode.md 구조 설명 갱신은 별도 3단계 PR로 남긴다.
