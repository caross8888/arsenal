# Arsenal FC Dashboard — Netlify 배포 가이드

## 📁 프로젝트 구조

```
arsenal-dashboard/
├── netlify.toml                    # Netlify 설정
├── netlify/
│   └── functions/
│       ├── football.js             # football-data.org 프록시 (경기일정, 순위, 선수단)
│       ├── apifootball.js          # api-football.com 프록시 (선수 스탯, 부상)
│       └── news.js                 # BBC Sport RSS → JSON (뉴스)
└── public/
    └── index.html                  # 메인 대시보드
```

---

## 🔑 1단계: API 키 발급

### football-data.org (경기 일정 / 순위 / 선수단)
- https://www.football-data.org/client/register 에서 무료 가입
- 가입 즉시 이메일로 API 키 발송
- 무료: 하루 10콜, PL·UCL·FA컵 포함
- 헤더명: `X-Auth-Token`

### api-football.com (선수 스탯 / 부상 현황)
- https://dashboard.api-football.com/register 에서 무료 가입
- 대시보드 > My Account 에서 API Key 확인
- 무료: 하루 100콜
- 위젯은 별도로 무제한 무료

### newsapi.org (선택 — BBC RSS 실패 시 fallback)
- https://newsapi.org/register 에서 무료 가입
- 무료: 하루 100콜, 24시간 딜레이 있음
- BBC Sport RSS가 우선이라 없어도 됨

---

## 🚀 2단계: Netlify 배포

### 방법 A: GitHub 연동 (추천)

```bash
# 1. GitHub 레포 생성 후 push
git init
git add .
git commit -m "Arsenal dashboard init"
git remote add origin https://github.com/YOUR_ID/arsenal-dashboard.git
git push -u origin main

# 2. Netlify 대시보드
# → Add new site > Import an existing project
# → GitHub 연결 > 레포 선택
# → Build settings:
#    Publish directory: public
#    Functions directory: netlify/functions
# → Deploy site
```

### 방법 B: Netlify CLI (로컬 테스트 포함)

```bash
# Netlify CLI 설치
npm install -g netlify-cli

# 로컬 개발 서버 (Functions 포함)
netlify dev
# → http://localhost:8888 에서 확인

# 배포
netlify deploy --prod
```

---

## ⚙️ 3단계: 환경 변수 등록

Netlify 대시보드 → Site settings → Environment variables → Add variable

| 변수명 | 값 | 필수 |
|--------|-----|------|
| `FOOTBALL_DATA_KEY` | football-data.org API 키 | ✅ 필수 |
| `API_FOOTBALL_KEY` | api-football.com API 키 | ✅ 필수 |
| `NEWS_API_KEY` | newsapi.org API 키 | 선택 |

**⚠️ 환경 변수 등록 후 반드시 재배포 필요**
Deploys 탭 → Trigger deploy → Deploy site

---

## 🎮 4단계: 라이브 위젯 설정

배포된 사이트에서 `라이브` 탭 → API 키 입력 → 위젯 활성화
(api-football.com 키를 브라우저에서 직접 입력)

---

## 🔧 로컬 개발 시 .env 파일

프로젝트 루트에 `.env` 파일 생성:
```
FOOTBALL_DATA_KEY=여기에_키_입력
API_FOOTBALL_KEY=여기에_키_입력
NEWS_API_KEY=여기에_키_입력
```

`.gitignore`에 추가:
```
.env
node_modules/
```

---

## 📊 API 콜 수 관리

| API | 무료 한도 | 캐시 TTL | 하루 예상 콜 수 |
|-----|-----------|----------|----------------|
| football-data.org | 10콜/일 | 1시간 | 경기일정 2콜 + 순위 2콜 + 선수단 1콜 = **5콜** |
| api-football.com | 100콜/일 | 2시간 | 선수 2콜 + 부상 2콜 = **4콜** |
| BBC RSS | 무제한 | 15분 | 무제한 |

서버 캐싱 덕분에 여러 사용자가 접속해도 캐시 TTL 안에서는 API를 한 번만 호출합니다.
