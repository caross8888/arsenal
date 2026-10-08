# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 커뮤니케이션

이 저장소에서 작업할 때 사용자에게 보내는 답변은 한글로 작성한다. 커밋/푸시는 사용자가 직접 하므로, 명시적으로 요청받지 않는 한 먼저 커밋하거나 푸시하지 않는다.

## Project overview

A single-page Arsenal FC fan dashboard (`arsenal-dashboard/`) served as a static frontend (`public/index.html`, one file, ~4300 lines) plus a set of Vercel serverless functions (`api/*.js`) that proxy and normalize several free public sports data sources. No frontend framework, no build step, no bundler — the HTML file is served as-is and each `api/*.js` file is deployed by Vercel as its own serverless endpoint (`/api/<filename>`), following Vercel's zero-config convention.

## Commands

There is no `package.json`, no build/lint/test tooling, and no local `npm install` step — the project has no dependencies to install.

Two local dev configurations are defined in `.claude/launch.json`:

```bash
# Full stack (frontend + API functions), from repo root
npx vercel dev --cwd arsenal-dashboard
# serves on http://localhost:3000

# Frontend only (no API — fetches to /api/* will fail), useful for quick UI/CSS iteration
python3 -m http.server 8080 --directory arsenal-dashboard/public
# serves on http://localhost:8080
```

To test a single `api/*.js` handler directly without running a server, `require`/invoke it from Node with a fake `req`/`res`:

```bash
cd arsenal-dashboard/api
node -e "
const handler = require('./football.js').default;
handler({ query: { type: 'fixtures' } }, { setHeader(){}, json(d){ console.log(d); }, status(c){ return this; } });
"
```

The only automated test is for the Korean translation dictionary (no dependencies, no API calls — costs nothing). Run it after touching `api/_glossary.js` or `api/_translation_overrides.js`:

```bash
node scripts/test_translation.mjs
```

예상 선발 XI(`api/_lineup.js`)를 고친 뒤에는 지난 경기들로 예전 방식과 비교하는 백테스트를 돌린다(Fotmob 호출, 응답은 OS 임시 폴더에 캐시):

```bash
node scripts/backtest_xi.mjs --teams 9825,8456,10260   # Fotmob 팀 id 목록, 기본은 아스날만
```

To refresh the scraped squad data (`public/data/players.json`), run `fotmob_auto_push.bat` (Windows) — it does `git pull`, runs `scripts/scrape_fotmob_local.py` (requires `requests`, and a GitHub token pasted into the script's `GITHUB_TOKEN` constant), then commits and pushes the regenerated file. Player photos aren't downloaded/stored locally — `players.json` just stores a live Fotmob CDN URL (`images.fotmob.com/image_resources/playerimages/{id}.png`) per player, hotlinked directly by the frontend. This is a manual, locally-triggered job, not CI.

### KV 캐시 정리 (연 1회)

`playerSeason:{선수id}:{시즌}`은 완결된 직전 시즌 스탯이라 TTL 없이 영구 저장된다(현재 스쿼드 선수는 시즌마다 키가 하나씩 쌓이는 게 의도). 이적해서 나간 선수 키만 비우는 작업이 `api/_purge.js`이고, 두 경로가 이 모듈을 공유한다:

- **크론** — `vercel.json`의 `crons`가 매년 5월 25일 `/api/maintenance`를 호출한다. `CRON_SECRET` 환경변수로만 인증되며, 미설정이면 503으로 거부한다(fail closed). `?dry=1`로 삭제 없이 대상만 확인할 수 있다.
- **로컬 수동** — `node scripts/kv_purge_players.mjs` (드라이런) / `--apply` (삭제). `.env.local`에서 KV 자격증명을 읽고, 드라이런은 읽기 전용 토큰만 쓴다.

판정 규칙에 함정이 둘 있어서 그대로 유지할 것:
- **"Fotmob 1군 명단에 없음 = 이적"이 아니다.** 1군 스쿼드 응답엔 유스가 없어서, 그 규칙으로는 아스날 U21/U18 선수가 삭제 대상으로 잡힌다(실측으로 3명 걸림). 1군에 없는 선수는 `playerData.primaryTeam`으로 현 소속을 한 번 더 확인한다.
- **팀명이 `Arsenal`로 시작한다고 다 우리가 아니다** — Arsenal de Sarandí, Arsenal Tula가 있다(`isArsenalTeam`이 이름을 정규화하는 것과 같은 이유). `^Arsenal( U##)?$`만 우리로 본다.

시기가 5월인 이유: 겨울 이적까지 반영됐고 여름 영입은 아직 없어서 스쿼드가 1년 중 가장 확정적이다. 이적시장 직후(8~9월)는 신규 등록·임대 출발·자유계약 미해결이 섞여 판정이 틀리기 쉽다. 그해 여름 이적자가 다음 5월까지 남는 건 의도한 절충 — 그 데이터엔 UI 진입점이 없고, 애초에 캐시라 잘못 지우는 쪽만 위험하지 늦게 지우는 건 비용이 없다(한 시즌 치 0.1MB 수준).

## Architecture

### Frontend (`public/index.html`)

One file containing all HTML/CSS/JS. Five top-level tabs, each a `<section id="...">` toggled by `showSec()`: `fixtures`, `squad`, `injuries`, `media`, `history`. Global state and rendering is plain DOM manipulation (`document.createElement`, template strings) — no virtual DOM, no component framework.

#### 색상 시스템 (`:root` 변수)

새 UI를 만들 때 아래 기준을 따른다. 임의로 `rgba(255,255,255,N)` 값을 새로 짓지 말고, 해당하는 역할의 변수를 재사용할 것.

**텍스트:**
- 제목/주요 텍스트 — `var(--text)` (#F0F2F7, 거의 흰색)
- 보조 텍스트(기본값) — `var(--text-secondary)` (rgba(255,255,255,.75)). 헤더 캡션(국적·기간·날짜·경기장·대회 배지), 상세모달 본문/바이오/문단, **카드 그리드의 부제·연도·소제목**(트로피 카드명, 타임라인 요약, 모먼트 연도, 레코드 라벨, 스타디움 부제 등)까지 — 제목이 아닌 보조 텍스트는 기본적으로 이 값을 쓴다.
- `var(--text-muted)` (#7A8099) / `var(--text-dim)` (#4A5070)은 실측 결과 이 앱의 어두운 배경들 위에서 전부 대비가 부족한 것으로 확인됐다 — **새로 텍스트를 추가할 땐 이 두 값을 쓰지 말고 `var(--text-secondary)`가 기본**이라고 생각할 것. `--text-dim`은 로딩 상태·비활성 버튼처럼 "안 보여도 상관없는" 곳에만 예외적으로 남겨둔다.

**강조색 3종:**
- 강조색 1 (골드) — `var(--gold)` (#C8A84B). 하이라이트 배지, 별점, "ON THIS DAY" 태그, 강조 스탯/칩.
- 강조색 2 (레드) — `var(--red)` (#EF0107) / `var(--red-dark)` (#b50004). 아스날 브랜드 색 — 활성 탭·버튼 배경, 강등권 표시, 브랜드 강조.
- 강조색 3 (그린) — `var(--green)` (#22C55E). 승리, 챔피언스리그 진출권, 클린시트·득점 등 긍정적 스탯.

**경기 결과 스코어 색** (승/무/패 — 위 강조색과는 별도의 전용 팔레트, 혼용하지 말 것):
- 승리 — `#22C55E` (green, 강조색 3과 동일 값)
- 무승부 — `#F59E0B` (amber — `--gold`(#C8A84B)와 다른 색이니 혼동 주의)
- 패배 — `#EF4444` — 브랜드 레드(`--red` #EF0107)와는 다른, 패배/에러 전용 레드. 계약만료 임박 경고, 실점 등 "부정적" 수치에도 이 색을 쓴다.

#### PC 반응형 레이아웃 기준 (`@media (min-width: 900px)`)

새 섹션을 PC용으로 최적화할 때 아래 기준을 따른다. 임의로 폭/컬럼 수를 새로 짓지 말고, 이미 정한 그리드 단위를 재사용할 것.

- **기준 그리드는 3등분(33.3%)**. 미디어 탭(`#media`, 뉴스/SNS/YouTube 3열, `.media-cols`)이 1:1:1로 이 기준을 세웠고, 이후 리스트+상세패널 구조(예: 경기일정 `.fix-layout`)는 2:1(66.6%/33.3%) 비율로 같은 단위를 재사용한다. 새 PC 레이아웃을 만들 때도 컬럼 수는 3의 배수/비율로 생각할 것.
- **리스트+상세패널 구현 패턴**: flexbox로 `flex:2 1 0%`(리스트) / `flex:1 1 0%; min-width:340px; max-width:480px`(상세패널)를 쓴다 — flex-grow 비율로 2:1을 만들되, 상세패널은 min/max-width로 클램프해서 900px 근처 좁은 화면에서 너무 좁아지거나 초와이드 화면에서 과도하게 넓어지는 걸 막는다. 순수 percentage(`width:33.3%`)나 고정폭(`width:380px`)은 쓰지 않는다 — 전자는 좁은 화면에서 깨지고, 후자는 리스트 쪽 잔여 공간과 비율 관계가 없어져서 화면 폭에 따라 비율이 어긋난다.
- **"화면이 꽉 차 보여야 한다"는 게 기본 방향** — 사용자가 명시적으로 확인한 원칙. 콘텐츠가 리스트+패널처럼 유동적으로 채워질 수 있는 섹션은 `max-width`로 좁게 가두지 말고 `max-width:none`으로 두고 `flex`가 남는 공간을 알아서 분배하게 한다(`#fixtures.section{max-width:none}`이 이 패턴의 예). 다만 폭이 넓어지면 그 안의 텍스트/아이콘 크기도 같이 키워야 한다 — 안 그러면 카드는 넓어졌는데 내용물은 작은 채로 남아서 오히려 더 휑해 보인다(예: `#fixWrap .fix-card`/`.t-crest`/`.fix-score` 등을 데스크톱 미디어 쿼리에서 별도로 키운 것 참고).
- **사이드바 폭은 `--sidebar-w` 변수 하나로 관리한다**(현재 `clamp(160px, 12.5vw, 200px)` — 화면 폭에 비례해 부드럽게 변하는 가변 폭, 사용자 지정. 고정 200px은 노트북에서 쓸데없이 넓어 보였다). 이 값을 쓰는 곳은 데스크톱 미디어 쿼리의 세 줄(`.top-header`/`.page`의 `margin-left`, `.bottom-nav`의 `width`)뿐이다. 새 코드에서 사이드바 폭이 필요하면 숫자를 적지 말고 `var(--sidebar-w)`를 쓸 것.
- **사이드바 상단 브랜드(`.nav-brand`)**: PC에서만 보이는 워드마크 영역. 높이를 오른쪽 `.top-header`와 같은 64px로 고정해서 아래 구분선이 좌우로 한 줄로 이어지게 한다 — 헤더 높이를 바꾸면 둘을 같이 바꿀 것. 배경은 선택 메뉴와 같은 `--red-dark`(사용자 지정, 통일성), 글자는 빨강 위라 테마와 무관하게 흰색/금색 고정. 워드마크는 사용자가 준 SVG(원본 자간 그대로)를 인라인으로 넣은 것이다 — 글자가 도형이라 CSS `letter-spacing`은 안 먹는다.
- **섹션 `max-width` 값**: PC에서는 `#fixtures`/`#squad`/`#leaderboard`/`#media`/`#history` 모두 `max-width:none`이다(리스트+패널·그리드가 남는 공간을 유동적으로 채우는 구조). 모바일에서만 `.section`의 600px 중앙정렬이 적용된다.
- **풀블리드 스티키 스트립(D-day, OTD, 부상 스트립 등)**: 섹션이 `max-width:none`이면 섹션 자체가 이미 사이드바~뷰포트 끝까지 꽉 차 있으므로, 스트립은 섹션 자신의 `padding:16px`만 취소하면 된다: `margin:-16px -16px 12px -16px`(width 지정 불필요). D-day 카드(`.dday-card`)가 이 패턴이다. 부상 스트립(`.inj-strip`)과 OTD(`.hist-otd-wrap`)는 PC에서 아예 숨긴다(부상은 선수단 우측 패널, OTD는 History 우측 패널이 대신한다).
  - 예전에 쓰던 뷰포트 기준 계산식(`calc(100vw - 사이드바폭)`, `calc(<M/2 + 84>px - 50vw)`)은 **다시 도입하지 말 것.** 섹션이 실제로 `max-width` 그대로 중앙정렬될 때만 성립해서, 콘텐츠 폭이 M보다 좁은 화면(1280px 노트북에서 M=1100으로 실측)에서는 스트립이 헤더와 10px 이상 어긋났다. 게다가 사이드바 폭이 식 안에 숫자로 박혀서, 폭을 바꾸면 조용히 틀어진다. 새 스트립이 필요하면 섹션을 `max-width:none`으로 두는 위 패턴을 쓰고, `getBoundingClientRect()`로 헤더와 좌우 끝을 실측 대조할 것.

Key recurring patterns to know before editing:
- `buildFixCard(m)` is the single reusable match-card builder used by the fixtures list, calendar view, and recent-results view — reuse it rather than re-implementing card markup.
- `renderPitch(...)` draws the SVG formation pitch used both in the finished-match modal and the live-match lineup tab.
- `getPosBadge(pos)` normalizes ESPN's inconsistent position strings (formation-slot codes like `CD-L`/`AM`/`LM`, or bare `G`/`D`/`M`/`F`) into `GK`/`DF`/`MF`/`FW` badges. If a new raw position format shows up unnormalized, extend this function rather than special-casing it elsewhere.
- The "최근 결과" (recent results) browser is season/month-based, not a flat list: `resultsSeasonForYM(year, month)` converts a calendar year+month into the season-start-year ESPN/`api/football.js` actually fetch by (season = Aug–Jul, so month < 8 belongs to the previous year's season). The cache (`_resultsCache`, keyed by season number) must be seeded from the backend's own `seasonsFetched` field, not re-derived from match dates client-side — pre-season friendlies in July are tagged by ESPN as belonging to the *upcoming* season, so a date-based re-guess mis-buckets them and silently poisons the cache for that season.
- `window.testLiveMatch(opts)` / `window.testLiveStop()` are console-invokable dev helpers that monkey-patch `apiFetch` to simulate an in-progress live match (mock scores/clock/events), for testing the live-polling UI without waiting for a real live match.

### Backend (`arsenal-dashboard/api/*.js`)

Each file is one Vercel serverless function. `football.js` is the largest and multiplexes multiple concerns via a `?type=` query param (`fixtures`, `results`, `standings`, `leaders`, `squad`, `injuries`) rather than being split into separate files — this mirrors the frontend's own call sites (`apiFetch(FN+'/football?type=...')`), so when adding a new data need, prefer adding a new `type` branch here over creating a new top-level file, unless it's a genuinely separate concern (as `match.js`, `news.js`, `social.js` are).

`api/_translate.js` is **not an endpoint** — files prefixed with `_` are excluded from Vercel's zero-config function detection, so it's the one shared module in `api/` (everything else is deliberately self-contained). `news.js`, `social.js`, and `videos.js` import it to translate their payloads to Korean *before* responding, so the frontend needs no translation-aware code. See the Translation section below.

**Vercel Hobby 플랜은 배포당 서버리스 함수가 최대 12개다** — `api/`에서 `_`로 시작하지 않는 파일 하나가 함수 하나다(현재 11개). 넘으면 배포(미리보기 포함)가 실패한다. 새 기능은 가능하면 기존 엔드포인트에 `?a=`/`?type=` 분기로 넣고, 새 파일이 꼭 필요하면 개수부터 셀 것. 예전에 있던 `api/injuries.js`·`api/photos.js`(프론트가 안 부르던 옛 엔드포인트, 각각 `football.js`의 `type=injuries`와 FPL 사진 대체로 대체됨)는 커리어 모드(`api/career.js`)를 넣으면서 이 한도 때문에 지웠다. Check `grep -n "apiFetch(FN" public/index.html` for the actual call sites before changing API behavior.

Real data sources in use (verified against source, not the stale README below):

| Feature | Source | Auth |
|---|---|---|
| Fixtures, results, match detail (events/stats/lineup) | ESPN's public site API (`site.api.espn.com`) | none |
| League standings (incl. European qualification/relegation zone colors) | ESPN's public site API (`site.api.espn.com/apis/v2/sports/soccer/eng.1/standings`) | none |
| Goals/assists/clean-sheets leaderboard | Fotmob's internal stats JSON (`data.fotmob.com`) | none |
| Squad list/stats/photos | Pre-scraped `public/data/players.json` (see `fotmob_auto_push.bat` above) + FPL's public API as a photo/stat fallback | none |
| Injuries | FPL's public API | none |
| News | BBC/Sky RSS + Guardian Open Platform | `GUARDIAN_API_KEY` (Guardian only) |
| History (trophies/managers/legends/timeline) | Static hand-curated JSON in `public/data/*.json`, photos sourced from Wikipedia/Wikimedia | none |
| Korean translation of news/SNS/YouTube text | Google Cloud Translation API v2 (GCP project `arsenal-506800`) | `GOOGLE_TRANSLATE_API_KEY` |
| YouTube videos (media tab) | YouTube Data API v3 first (uploads playlist + video status); falls back to the channel RSS feed, then to the last successful list stored in KV (`videos:last:{channelId}`) — the RSS feed has had full outages (404/500 for every channel) | `YOUTUBE_API_KEY` |

`football.js`'s fixtures/results logic has two non-obvious pieces of handling worth preserving if you touch it:
- One-off branded pre-season tournaments (e.g. "Emirates Cup") aren't returned by the normal per-competition ESPN endpoints, since ESPN files them under their own league id each year. A supplemental `soccer/all/scoreboard` sweep over the near-term window fills this gap — don't remove it without another way to catch these.
- ESPN's per-team schedule endpoint needs an explicit `season` query param; without it, during the off-season gap it silently returns an empty "current season" instead of falling back to the just-finished one. `currentSeasonYear`/`seasonsToFetch` compute this explicitly rather than relying on ESPN's default.

### Translation (`api/_translate.js`)

미디어 탭의 영어 원문(뉴스 헤드라인·요약, Bluesky 본문, 유튜브 제목)을 서버에서 한국어로 바꿔 내려준다. 손대기 전에 알아야 할 것들:

- **실패는 언제나 "원문 유지"다.** 키 없음, 할당량 초과, 구글 5xx, 타임아웃 — 전부 조용히 영어 원문을 남긴다. 번역 실패가 목록 자체를 못 띄우게 만드는 경로는 없어야 한다.
- **캐시 키는 원문의 SHA-1 해시**(`tr:ko:{sha1}`, HTML 모드는 `tr:koh:{sha1}`)이며 Upstash에 TTL 없이 영구 저장한다. 기사 URL/포스트 URI 같은 식별자로 바꾸지 말 것 — 원문이 수정돼도 옛 번역이 계속 나가고, 한 아이템의 여러 필드마다 키를 쪼개야 한다.
- **비용 상한은 GCP 콘솔의 일일 15,000자 할당량**(`v2 and v3 general model characters per day`)이 실질적 하드 리밋이고, 코드의 월간 카운터(`trUsage:{YYYY-MM}`, 소프트 컷오프 450,000자)는 2차 방어선이다. 3개 컬럼 콜드 스타트 1회가 약 5,000자, 이후엔 새 아이템분만.
- **`social.js`의 SNS 본문은 `format:'html'`로 통째로 번역한다** — `segments`(facets로 복원한 링크/멘션/해시태그)를 조각마다 따로 번역하면 링크 앞뒤 공백이 잘려 붙고, 문장 중간의 해시태그가 문장을 두 동강 내서 앞뒤가 별개 문장으로 번역된다. 조각을 `<a data-i="N" translate="no">`로 이어붙여 보내면 구글이 태그를 보존한 채 한국어 어순에 맞게 위치까지 옮겨준다. 되받은 HTML에서 앵커가 하나라도 유실/중복되면 그 포스트는 통째로 원문을 유지한다.
- **오역을 고치는 수단은 두 가지이고, 고르는 기준이 있다** (사용자와 합의한 운영 방식):
  - **다시 나올 표현**(선수 이름, `ruthless` 같은 아스날 기사 단골 표현) → `api/_glossary.js`에 **규칙**. 규칙은 늘어날수록 엉뚱한 문장에 걸릴 위험이 커지므로(실제로 `촬영 → 슈팅`이 유튜브 제목의 "사진 촬영"까지 바꿨다) 넣을 때마다 그 규칙이 고치는 문장과 **건드리면 안 되는 문장**을 둘 다 `scripts/test_translation.mjs`에 추가할 것. 이 테스트는 모든 정식 표기가 사전을 통과해도 그대로인지도 자동 검사해서 규칙끼리의 충돌을 잡는다.
  - **이번 한 번뿐인 표현**(기자의 조어, 비꼬는 말투, 문맥 없는 짧은 문장) → `api/_translation_overrides.js`에 `{en, ko}` **수동 교정** 한 건. 원문이 정확히 같은 항목 하나에만 적용되고(공백 차이 무시), 구글을 부르지 않고, 사전도 안 거친다. SNS 포스트는 `ko` 안에 링크 표기(@핸들·잘린 URL·#태그)를 원문 그대로 적어야 링크가 되살아나며, 하나라도 못 찾으면 그 교정은 무시되고 평소대로 번역된다. 한국어 어순 때문에 링크 순서가 바뀌어도 된다.
  - 오역 제보를 받으면 먼저 **실제 경로와 같은 format으로 재현**할 것 — SNS는 `format:'html'`, 뉴스·유튜브는 `'text'`. 평문으로만 검증했다가 HTML 모드에서 결과가 달라 사고가 난 적이 있다.
- 번역이 실제로 일어난 필드만 원문을 `<필드명>En`에 남긴다(프론트는 현재 안 쓰지만 "원문 보기"용으로 준비된 값).
- 구글의 403 에러 **본문에는 요청에 쓴 API 키가 그대로 들어있다** — `callGoogle`이 상태 코드만 로깅하는 건 의도된 것이니 본문을 찍도록 바꾸지 말 것.
- **인명·팀명 표기 통일은 `api/_glossary.js`가 번역 "결과"에만 적용한다.** 구글은 같은 이름을 문맥마다 다르게 음차한다(실측: 아스널 34회 / 아스날 4회, 외데가르드 21회 / 외데고르 2회 / `Ødegaard`는 아예 번역 안 됨). 사전을 **원문 전처리로 옮기지 말 것** — 원문이 바뀌면 캐시 키(원문 해시)가 전부 바뀌어 전량 재번역(약 7,000자)이 일어난다. KV엔 구글 원본 번역문을 저장하고 출력 시점에만 치환하므로, 사전을 고치면 이미 캐시된 과거 번역까지 API 호출 0으로 즉시 교정된다. 새 표기 흔들림은 `ENTRIES`에 `[정식표기, [변형들]]` 한 줄만 추가하면 된다.
  - **표기 기준은 나무위키다**(사용자 지정 — "나무위키 이름이 정식 표기"). 구글 번역이 뱉는 표기를 기준으로 삼지 말 것: 구글은 나무위키와 정반대로 쓰는 이름이 많다(나무위키 `외데고르`/`요케레스`/`수비멘디` ↔ 구글 `외데가르드`/`교케레스`/`주비멘디`). 출처는 나무위키 "아스날 FC/{시즌} 시즌" 문서의 스쿼드·리저브(U-21/U-18)·임대/사전계약 표 — 한글 성명과 로마자 성명이 나란히 있어 한 페이지에서 전부 확보된다(접혀 있으므로 "펼치기"를 먼저 클릭). **시즌이 바뀌면 그 시즌 문서로 다시 대조할 것** — 처음에 25-26 문서로 만들었다가 26-27 영입(콘사·기마랑이스·촐리스·멜리에)이 통째로 빠져 있었다. 팀명 `아스날`은 나무위키와 `index.html`이 일치한다.
  - 단, 다음 다섯은 **사용자가 나무위키와 다르게 직접 지정**한 값이다 — 나무위키를 다시 대조하더라도 되돌리지 말 것: `가브리엘`(나무위키 가브리에우) / `위리엔 팀버`(팀버르) / `루이스-스켈리`(루이스스켈리) / `에미레이츠 스타디움`(에미레이트) / `에단 은와네리`(나무위키에 문서 없음).
  - 성 없는 `가브리엘`은 일부러 치환하지 않는다 — 마갈량이스·제주스·마르티넬리 셋 중 누구인지 문맥 없이는 알 수 없어 잘못 붙이면 다른 선수가 된다.
  - **한 항목의 변형들은 정규식 하나로 합쳐 한 번만 스캔한다.** 변형마다 따로 `replace`를 돌리면 앞선 변형이 만든 정식 표기를 뒤 변형이 다시 잡아먹는다(실제로 겪음: 변형에 `유리엔 팀버`와 `위리엔 팀버`가 같이 있어 `위리엔 팀버르르`가 나왔다). alternation은 "가장 긴 것"이 아니라 "먼저 쓴 것"이 매치되므로 문자열 변형은 길이 내림차순으로 넣을 것.
  - `Ø`·`é` 같은 비ASCII 글자는 `\w`가 아니라서 그 앞뒤의 `\b`가 단어 경계로 성립하지 않는다(`" Ødegaard"`는 공백과 `Ø` 둘 다 non-word라 전이가 없음) — 그 자리엔 `\b` 대신 라틴 문자 룩어라운드를 쓸 것.
  - 사전 뒤쪽에는 **축구 용어 오역 교정** 섹션도 있다. 구글 NMT는 **문장 단위**로 번역해서, 그 문장 안에 축구 단서가 없으면 일반 뜻으로 빠진다(실측: `Ruthless shooting from Arsenal` → 무자비한 **슈팅** / `Ruthless shooting` → 무자비한 **사격**). 포스트 뒤 문장에 Arsenal이 있어도 앞 문장은 못 구해주므로, 기자들이 쓰는 짧은 문장에서 자주 터진다. 이 섹션은 한글→한글 치환이라 원문을 볼 수 없으니 **"축구 기사에 그 단어가 나오면 100% 오역"인 것만** 넣을 것(사격/임상 마무리/깨끗한 경력/중괄호/부상 시간). 어휘만 고칠 뿐 **문장 구조가 깨진 건 못 고친다** — `Anti-ruthless`처럼 사전에 없는 조어가 원문에 있으면 번역문은 여전히 어색하다.
  - **번역 "전" 원문 구문 치환(`prepareSource` / `SOURCE_RULES`)도 있다.** 뜻 자체가 잘못 옮겨진 경우는 번역 후엔 고칠 수 없어서다 — 예컨대 `Anti-ruthless`는 번역되는 순간 "반대되는 입장이었다"로 흩어져 한국어 쪽엔 치환할 대상이 안 남는다. 캐시 키는 "치환 후 보낼 문자열" 기준이라, 규칙에 걸린 원문만 한 번 재번역되고 안 걸린 원문은 치환 전후가 같아 비용 0이다. 규칙을 고를 때 두 원칙(모두 실측):
    - **대체어는 가능하면 영어로.** 원문에 한국어를 끼워 넣으면 구글이 그 단어를 제멋대로 바꾼다(`lack of 결정력` → "결단력 부족"). 반면 `clinical`은 축구 문맥에서 구글이 안정적으로 "결정력"으로 옮긴다.
    - **단어 하나가 아니라 구문으로 잡을 것.** `ruthless` 단독을 바꾸면 다른 뜻의 문장이 망가진다(`ruthless in his team selection`의 "냉정했다"가 "결정적인 역할을 했다"로 뜻이 뒤집힘, `a ruthless tackle`이 "결정력 태클"로).
  - 치환 전에 URL/도메인은 NUL로 감싼 자리표시자로 빼뒀다가 되돌린다. 자리표시자를 `" 3 "` 같은 평범한 형태로 바꾸면 본문의 `"승점 3 점"`이 URL로 잘못 복원된다.

### 미니게임 (`api/game.js`, 헤더 게임기 버튼 → `#games`)

하단 탭에 없는 섹션이다. 헤더의 게임기 버튼(`toggleGameMode`)으로 들어오고, 게임 화면에 있는 동안 그 버튼은 집 모양이 되어 직전 탭으로 돌아간다. 모바일에선 게임 화면에 있는 동안 하단 탭을 아래로 내려 숨긴다(`body.game-mode`). 켜고 끄는 곳은 섹션을 바꾸는 `openGames`/`showSec`(→ `gameLeave`) 두 곳뿐이라 홈 버튼·뒤로 가기 어느 길로 나가도 복구된다 — 버튼 클릭 핸들러에 따로 넣지 말 것. 게임 안에서 폰·브라우저 뒤로 가기는 좌측 상단 `.gm-back` 버튼을 대신 누른다(`gmSyncBack`/`gmBackPop`) — 뒤로 버튼이 있는 화면이면 `#games` 기록(가드)을 하나 더 쌓아 두는 방식이라, 새 게임 화면을 만들 땐 좌측 상단 뒤로 버튼을 `.gm-back`으로 두면 저절로 따라온다. 현재 게임은 "Who Am I?"(커리어 경로 퀴즈) 하나.

- **문제 은행은 고정 파일** `api/_whoami_bank.js`(자동 생성, 직접 고치지 말 것)다. 사용자 지정으로 크론·자동 갱신이 없다. 다시 만들 땐 `NODE_USE_ENV_PROXY=1 node scripts/build_whoami.mjs --module`(위키백과 선수 목록 + Fotmob 커리어, 수집·검증 규칙은 `api/_whoami.js`).
- **KV는 랭킹에만 쓴다**(사용자 지정 — 무료 플랜 부담). 게임 진행 상태(정답·출제 시각·점수·목숨)는 암호화 토큰으로 브라우저와 주고받고, KV는 랭킹 등록(약 5회)과 랭킹 보기(30초 CDN 캐시)뿐이다. 랭킹은 상위 1,000개만 남기고 월 등록 상한이 있다. 문제마다 KV를 쓰는 구조로 바꾸지 말 것.
- 이 구조의 알려진 약점(이전 토큰 재사용으로 같은 문제 재도전)을 줄이려고 오답일 때 정답을 알려주지 않는다.
- 퀴즈 중 "그만하기"(두 번 눌러야 종료)는 `a=quit`으로 지금 점수에서 게임을 끝내고 등록도 허용한다 — 점수는 줄지 않으니 계속하는 것보다 유리해질 길이 없다.
- 시작 화면은 로그인을 먼저 권한다("로그인하고 시작" → 가입·로그인 후 바로 게임 시작). 로그인 없이 해보기는 작은 링크로만 남겨 두고, 그렇게 끝낸 판은 결과 화면에서 로그인하면 등록할 수 있다. 게임 목록 카드는 승부예측이 먼저다(사용자 지정).
- **랭킹 등록은 승부예측 계정으로만**(사용자 지정 — 닉네임만 적던 방식은 남의 이름을 사칭할 수 있었다). 게임은 로그인 없이 하고, 등록할 때 `Authorization: Bearer <승부예측 토큰>`이 필요하다(없으면 401 `login:true`). 계정 하나에 최고 기록 하나(`@{정규화닉네임}` 멤버, 낮은 판은 기존 최고점 유지). 계정으로 처음 등록할 때 한 번(`whoami:mig:{키}` NX) 같은 닉네임의 옛 기록(`닉네임\u0001게임id` 멤버)을 최고점만 남기고 합친다. 토큰 서명·닉네임 정규화는 `api/_account.js`를 두 엔드포인트가 공유한다.

### 승부예측 (`api/pick.js`, 게임 목록의 두 번째 카드)

프리미어리그 **현재 라운드 10경기**를 승·무·패로 예측한다. 일정·결과는 Fotmob 리그 데이터(`leagues?id=47`, 인스턴스 메모리 5분 캐시).

- **현재 라운드**: 본 일정(중앙 킥오프 ±4일)의 마지막 경기가 아직 시작 안 한 라운드 중 가장 빠른 것. 연기돼 몇 주 밀린 경기가 옛 라운드를 계속 "현재"로 붙잡지 않게 하려는 규칙이다. 미래 라운드는 예측 불가, 지난 라운드는 결과 보기(연기 경기는 킥오프 전이면 예측 가능).
- **잠금은 서버 시간 기준**: 킥오프가 지난 경기의 예측 변경은 서버가 무시한다(`isOpen`).
- **점수**: 적중 1점, 라운드 전 경기 적중 +3. 랭킹은 시즌 + 월(KST 킥오프 날짜 기준). 동점 → 적중률 → 먼저 저장한 순.
- **채점은 크론 없이** 랭킹·라운드를 누가 볼 때 끝났는데 채점 안 된 경기를 찾아 한 번 한다(`pk:settled:{시즌}`에 채점한 경기 id, `pk:lock` NX로 동시 채점 방지).
- **계정**: 닉네임 + 비밀번호(4~20자). 비밀번호는 scrypt 해시만 저장 — 원문을 로그 포함 어디에도 남기지 말 것. 로그인은 HMAC 서명 토큰(1년, 쓸 때마다 연장)이라 확인에 KV를 안 쓴다. 5회 실패 시 10분 잠금, IP당 하루 가입 3개. 비밀번호 찾기는 없고 관리자 초기화만(`.github/workflows/pick-reset.yml`).
- **내 정보**(게임 목록 우측 톱니 → 상세모달 `#gmProfileModal`, 이적시장 모달과 같은 틀, `a=profile`): 승부예측 시즌·이번 달 순위, Who Am I 최고 기록·순위, 닉네임 변경(`a=nickcheck` 중복 확인 → `a=rename`), 비밀번호 변경(`a=password`). 둘 다 지금 비밀번호를 다시 확인한다(로그인과 같은 실패 잠금).
- **닉네임 변경은 계정 키를 바꾸지 않는다.** 예측·랭킹·Who Am I 기록이 전부 가입 닉네임의 정규화 값(`pk:user:{키}`, 보드 멤버, `@{키}`)에 붙어 있어서, 키를 옮기는 대신 표시 이름(`u.n`, `pk:names`)만 바꾸고 로그인용 별칭 `pk:alias:{새 닉네임}` → 키를 둔다. 로그인은 지금 닉네임으로만 되고(`findAccount`), 가입 닉네임은 키라서 바꾼 뒤에도 남이 못 쓰며, 그 사이 거쳐 간 닉네임은 다음 변경 때 풀린다. 30일에 한 번(띄어쓰기·대소문자만 바꾸는 건 예외). 가입과 변경이 같은 이름을 동시에 잡으면 둘 다 확인 후 양보한다.
- 토큰의 표시 이름은 옛것일 수 있다(다른 기기에서 변경) — `me`/`profile`에서만 `pk:names`를 읽어 고친 토큰을 내려 준다. 비밀번호를 바꿔도 다른 기기의 기존 로그인 토큰은 그대로 유효하다(KV 없이 확인하는 서명 토큰이라).
- 팀 한국어 이름은 `KO_TEAM`(Fotmob 팀 id) — 승격팀이 바뀌면 여기에 추가한다. 없으면 Fotmob 짧은 영문 이름이 나온다.

### Static data pipeline (`public/data/`)

JSON files + matching `*_images/` folders for History content (trophies, managers, legends, timeline, stadiums) are static, checked into git, and not regenerated by any script in this repo — they were manually compiled. Only `players.json` has a refresh script (`scripts/scrape_fotmob_local.py`); it has no matching `player_images/` folder since player photos are hotlinked from Fotmob's CDN rather than downloaded.

### Deployment

Live on Vercel (auto-deploys on push to `main`), configured by `arsenal-dashboard/vercel.json`. `claude/**` 브랜치 푸시는 미리보기 배포를 만들지 않는다(`git.deploymentEnabled`) — Hobby 플랜 하루 배포 한도를 작업 브랜치 푸시가 다 써서 main 반영 배포가 "Deployment rate limited"로 막힌 적이 있다. **`arsenal-dashboard/netlify.toml` and `arsenal-dashboard/README.md` describe an older Netlify-based deployment** (different function directory, different API providers — api-football.com/newsapi.org instead of the ESPN/Fotmob/FPL/Guardian setup above) and are stale; don't follow them when reasoning about how the app is actually deployed or which APIs it actually calls.
