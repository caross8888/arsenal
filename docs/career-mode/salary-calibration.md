# 급여 보정안 — 2026-10-15

이 문서는 기존 `salary-audit.md`에서 발견한 문제에 대한 보정 내역이다.
금액은 세전 기본급이며, 수당·계약금·초상권·광고료를 포함하지 않는다.
실제 선수에게 게임 OVR을 임의로 부여하지 않는다. 아래 OVR은 급여 규모를 검사하는
가상의 게임 입력이며, 실제 선수 급여는 해당 구간을 정하는 기준점이다.
실제 자료에 맞춰 정한 기준점과 별도의 구현 검사를 구분한다.

## 변경한 계산

- 리그별 한 개 지수함수와 단단한 상한을 제거하고 OVR 구간을 연속 보간한다.
- 신인/로테이션/주전/핵심/예외적 초특급을 구분할 수 있는 금액 폭을 둔다.
- 상단은 연속적으로 완만해지며, OVR 90/95/99를 같은 금액으로 잘라내지 않는다.
- 구단 명성 `r`은 해당 팀에서의 역할 경쟁력 계산에만 사용한다.
- 별도 `CLUB_WAGE_INDEX`가 임금 수준을 담당한다. 자료가 없는 구단은 리그 일반 구단
  보정치를 사용하며, 이를 실제 조사한 구단 예산이라고 표시하지 않는다.
- 최근 활약, 나이, 공개된 유망주 등급은 보정값이다. 첫 프로 계약 보정도 연속화했다.
- 국가별 별도 곡선이 필요한 MLS에는 일반 선수부터 DP 초특급까지 별도 기준점을 둔다.

구현: `api/_career_wages.js`, `api/_career_finance.js`.

## 잉글랜드 전후 비교

26세, 최근 활약 보정 없음, 기존 계약 협상 상황. 주급 GBP.

| 구단 / 가상 OVR | 이전 초안 | 보정안 |
|---|---:|---:|
| 아스날 80 | 97,730 | 78,749 |
| 아스날 85 | 212,132 | 148,750 |
| 아스날 90 | 425,000 | 262,500 |
| 아스날 95 | 425,000 | 393,749 |
| 아스날 99 | 425,000 | 494,375 |
| 맨시티 99 | 425,000 | 526,014 |

Capology 2026/27 기본급 추정치의 규모 참고:

- 라이스 / 외데고르 260,000/주, 살리바 270,000/주, 하베르츠 280,000/주.
- 사카 300,000/주, 홀란 525,000/주.
- 위 선수가 각각 OVR 90 또는 99라는 의미가 아니다.
- 좋은 활약 보정은 같은 기본 OVR에서도 제안액을 높인다. 기존 계약 자체는 바꾸지 않는다.

출처:

- https://www.capology.com/player/declan-rice-36174/
- https://www.capology.com/player/martin-odegaard-36146/
- https://www.capology.com/player/william-saliba-36974/
- https://www.capology.com/player/kai-havertz-36322/
- https://www.capology.com/clube/arsenal/salarios/
- https://fbref.com/en/squads/b8fd03ef/2026-2027/wages/Manchester-City-Wage-Details
- https://capology.com/uk/premier-league/payrolls

## 한국

2025 공식 공개표의 국내 선수 기본급 평균을 구단 임금 지수의 기준점으로 사용한다.
리그 기준 기본급 216,093,000원. 수당을 포함한 311,765,000원과 혼합하지 않는다.

| 기준 예시 | 이전 초안 | 보정안 | 구단 국내 선수 평균 기본급 |
|---|---:|---:|---:|
| 울산 · 26세 · OVR 60 | 355,200,000원 | 477,300,000원 | 477,339,000원 |
| 대전 · 26세 · OVR 54 | 115,200,000원 | 396,600,000원 | 396,607,000원 |

이 두 게임 입력은 구단 내 주전 경쟁력의 기준 위치다. 구단 평균을 기준점으로 넣은
결과이며, 독립 표본에서 개인 급여를 거의 정확히 예측했다는 오차율 보고가 아니다.
같은 OVR 60에서도 지출 규모가 더 큰 대전은 전북보다 높은 제안을 한다.
선수 국적만으로 급여를 가감하지 않으며, 개별 선수는 능력·역할·성적으로 달라진다.

출처:

- https://www.kleague.com/news_view.do?orderBy=seq&seq=93936&viewOption=album
- 위 연맹 공지에 첨부된 `2025 K리그 연봉 공개표_20251230_20251230_120045.pdf`

## 일본

- 성인(19세 이상) 기본급 하한: 연 480만 엔. 기존 설정 하한은 304만 엔이었다.
- 18세 이하 예외: 기존 유소년 하한을 유지한다.
- 첫 프로 계약의 기본급은 연 1,200만 엔 이내로 제안한다.
- 게임에서는 계약 중 급여 고정 규칙을 우선하므로 첫 계약이 여러 해라면 이 금액을
  재계약 때까지 유지한다. 현실의 계약 초년도 이후 재협상을 전부 모사하지는 않는다.
- 2025 J1 공개 추정 평균 3,188만 엔을 기준으로 하고, 구단별 임금 지수를 분리했다.
- 비셀 고베 OVR 60/26세/보정 없음 예시는 연 4,622만 엔. 상단 곡선은
  2025 공개 추정 최고 연봉 3억 3,000만 엔을 참고해 완만하게 접근한다.

자료 유형: 제도는 공식, 구단별/개별 연봉은 민간 추정이다.

- https://www.jfa.jp/news/00035305/
- https://aboutj.jleague.jp/corporate/pressrelease/article/15233
- https://aboutj.jleague.jp/seasonreview2024/football/f_2/
- https://www.soccer-money.net/players/in_players.php?year=2025
- https://www.soccer-money.net/team/in_team.php?year=2025

## 미국

- MLSPA 2026 공식 메시 기본급 USD 25,000,000을 상단 규모의 기준으로 사용한다.
- USD 28,333,333은 보장보수이며 이번 기본급 모델의 비교 대상으로 사용하지 않는다.
- 비교 환율: ECB 2026-10-14 USD 1.1195/EUR. 기본급은 약 EUR 22.331M이다.
- 인터 마이애미 가상 OVR 99/26세/활약 보정 없음: 기존 EUR 15M → EUR 22.310M.
- 2026 성인 최저 USD 113,400, 리저브 최저 USD 88,025를 반영한다.
- 게임에 로스터 슬롯 구분이 없으므로 25세 이하에는 리저브 하한을, 그 이상에는
  성인 하한을 적용한다. 어린 선수가 모두 리저브 계약이라는 주장은 아니다.
- DP 영입/로스터 등록 제도 전체를 구현하는 모델은 아니다.

출처:

- https://mlsplayers.org/resources/salary-guide
- https://www.mlssoccer.com/news/2026-mls-roster-rules-and-regulations
- https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.ff.html

## 다른 리그와 자료의 한계

독일 상단은 케인의 세전 기본급 약 EUR 25M, 이탈리아는 라우타로 EUR 16.67M,
포르투갈 상단은 EUR 4.81M, 네덜란드는 최고 EUR 3.5–3.9M 정도의 공개 추정 사례를
참고했다. 개별 금액을 리그 평균으로 취급하지 않는다.

- https://capology.com/player/harry-kane-34178/
- https://www.capology.com/player/lautaro-martinez-35664/
- https://www.capology.com/pt/primeira-liga/salaries
- https://www.capology.com/player/kasper-dolberg-35709/
- https://capology.com/club/psv/salaries

스페인/영국 등 일반 선수의 하한은 더 이상 연봉 EUR 20,000대가 되지 않도록
게임용 보수적 하한을 조정했다. 국가별 계약·세법·보장보수 규정을 전부 재현한다고
주장하지 않는다. 특히 스페인 협약의 보장보수는 기본급만의 숫자가 아니다.

- https://www.boe.es/diario_boe/txt.php?id=BOE-A-2023-25254

브라질·아르헨티나·벨기에·노르웨이·나이지리아는 동일 수준의 개별 기본급 자료가
부족하다. 이들 리그의 기존 기준 규모를 유지하고 곡선/구단 구분만 정리했다.
특히 나이지리아의 2026 최저 급여 인상 발표는 집행 여부와 범위를 추가 확인해야 하므로
법정 하한을 정확히 구현했다고 표시하지 않는다. 15개 리그 전부 실측 검증 완료 상태가 아니다.

## 검증과 적용 상태

- `node scripts/test_career_wages.mjs`: 297개 구단 × 70 OVR = 20,790개 시나리오.
  단조 증가, 상단 구분, 기준 급여 규모, J1/MLS 하한 및 첫 계약 경계 검사.
- `node scripts/test_career_finance.mjs`: 1,290시즌, 627개 계약, 제안/서명 일치,
  계약 중 급여 유지, 기존 카드 읽기 및 병역 기간 계산 검사.
- 기준점 자체와 일치하는 테스트는 경제 예측 정확도를 독립 검증하는 통계가 아니다.
- 운영 랭킹 카드 재계산, KV 저장, 커밋, 배포는 하지 않았다.
