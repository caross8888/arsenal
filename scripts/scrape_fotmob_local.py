#!/usr/bin/env python3
"""
Fotmob 아스날 선수 스탯 스크래퍼 (로컬 실행용)
- 수현님 PC에서 직접 실행
- players.json 생성 후 GitHub에 push

실행 방법:
  cd arsenal
  pip install requests playwright
  playwright install chromium   # 최초 1회만 — 공홈 아카데미 명단 크롤용
  python scripts/scrape_fotmob_local.py

GitHub Personal Access Token 필요:
  https://github.com/settings/tokens → New token → repo 권한
"""

import requests
import json
import re
import time
import subprocess
from pathlib import Path
from datetime import datetime, timezone

# ── 설정 ──────────────────────────────────────────
GITHUB_TOKEN = ''  # GitHub Personal Access Token 입력
GITHUB_REPO  = 'caross8888/arsenal'
OUTPUT_PATH  = Path('arsenal-dashboard/public/data/players.json')
IMAGES_PATH  = Path('arsenal-dashboard/public/data/player_images')

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
    'Referer': 'https://www.fotmob.com/',
}

ARSENAL_TEAM_ID = 9825
# 1군은 Fotmob 자체 스쿼드 "목록" 페이지가 안정적으로 유지되니 그대로 쓴다.
# U21/U18 자체를 따로 안 나누고 "아카데미" 하나로 묶는다 — 공홈도 U21/U18을
# 구분 안 하고 하나의 아카데미 명단으로 관리하고, 선수들도 두 팀을 자주
# 오가서 정확한 경계를 매기기 어렵다.

# Fotmob playerInformation에 등번호가 누락되는 선수용 수동 보정
# (Fotmob 페이지 자체에 구조화 데이터가 없는 경우 확인 후 갱신 필요)
JERSEY_OVERRIDES = {
    1137667: '5',   # Piero Hincapié
    1254234: '22',  # Ethan Nwaneri
    1025462: '21',  # Fábio Vieira
    748382:  '28',  # Reiss Nelson
    952029:  '30',  # Illan Meslier
}

# ── Fotmob 스쿼드 자동 크롤 (1군) / 공홈+검색 조합 (아카데미) ──────
def to_slug(name: str) -> str:
    """'Viktor Gyökeres' → 'viktor-gyokeres'"""
    import unicodedata
    nfkd = unicodedata.normalize('NFKD', name)
    ascii_name = nfkd.encode('ascii', 'ignore').decode('ascii')
    return re.sub(r'[^a-z0-9]+', '-', ascii_name.lower()).strip('-')


def fetch_arsenal_com_names(team_path):
    """
    arsenal.com 선수단 페이지(예: 'academy', 'men')에서 이름만 가져온다.
    선수 카드가 클라이언트 JS로 렌더링돼서 requests로는 빈 셸만 나와
    Playwright로 실제 렌더링한 뒤 긁는다. 카드 이미지의 alt 속성이
    "이름 성" 형태로 가장 깔끔하게 나와서 그걸 쓴다.
    아카데미는 Fotmob 자체 스쿼드 목록 페이지가 자주 갱신이 안 돼서 선수가
    누락되는 일이 잦은데, 공홈 명단은 실제 등록 선수 기준으로 항상 최신이라
    이걸 "누구를 스크래핑할지"의 기준으로 삼고 Fotmob은 검색으로만 쓴다.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print('⚠️  playwright 미설치 → 공홈 명단 크롤 스킵 (pip install playwright && playwright install chromium)')
        return []

    url = f'https://www.arsenal.com/fixtures/{team_path}/players'
    names = []
    try:
        with sync_playwright() as p:
            # headless=True는 Akamai 봇 차단(403)에 걸려서 반드시 실제 창을
            # 띄우는 headless=False로 실행해야 한다(직접 확인함) — 그래서
            # 이 스크립트를 돌리는 동안 브라우저 창이 화면에 실제로 나타난다.
            # wait_until='networkidle'도 이 페이지에선 계속 타임아웃 나서
            # 'domcontentloaded' 후 필요한 선택자만 명시적으로 기다린다.
            browser = p.chromium.launch(headless=False)
            page = browser.new_page(user_agent=HEADERS['User-Agent'])
            page.goto(url, timeout=20000, wait_until='domcontentloaded')
            page.wait_for_selector('[data-testid="player-card-image"] img[alt]', timeout=15000)
            imgs = page.query_selector_all('[data-testid="player-card-image"] img[alt]')
            for img in imgs:
                alt = (img.get_attribute('alt') or '').strip()
                if alt and alt not in names:
                    names.append(alt)
            browser.close()
    except Exception as e:
        print(f'⚠️  공홈 {team_path} 명단 크롤 실패 ({e})')
    return names


def _fotmob_search_players(term):
    """Fotmob 검색 API를 호출해서 type='player'인 제안만 리스트로 반환."""
    url = 'https://www.fotmob.com/api/data/search/suggest'
    try:
        r = requests.get(
            url, params={'hits': 10, 'lang': 'en', 'term': term},
            headers={**HEADERS, 'Accept': 'application/json'}, timeout=10,
        )
        if r.status_code != 200:
            return []
        groups = r.json()
        all_group = next((g for g in groups if (g.get('title') or {}).get('key') == 'all'), None)
        if not all_group:
            return []
        return [s for s in all_group.get('suggestions', []) if s.get('type') == 'player']
    except Exception:
        return []


def resolve_fotmob_id_by_name(name):
    """
    Fotmob 검색 API(팀 스쿼드 '목록' 페이지가 아니라 검색)로 이름 → 선수 ID를
    찾는다. 공홈 아카데미 명단에 있는 이름으로 검색해서 나온 결과이므로,
    "이 사람이 맞다"는 확인은 이미 된 셈이라 팀ID로 다시 거르지 않고 검색
    1순위(Fotmob 자체 관련도 score 기준) 결과를 그대로 채택한다.

    갓 영입된 선수는 Fotmob이 이적을 아직 반영 못 해서 예전 소속 클럽으로
    나오는 경우가 흔한데(예: 아스날로 온 지 얼마 안 된 선수가 여전히 이전
    소속 팀으로 표시됨), teamId로 거르면 이런 진짜 신입생들이 전부 빠지게
    된다 — 공홈 명단에 있는 선수는 예외 없이 다 스크래핑하는 게 맞다.

    None을 반환하는 건 Fotmob에 그 선수 자체가 아예 없는 경우뿐이다.
    """
    candidates = _fotmob_search_players(name)
    if not candidates:
        # 미들네임이 껴 있으면 Fotmob 검색이 풀네임을 못 찾는 경우가 있다
        # (예: "Lucas Martin Nygaard"는 실패해도 "Lucas Nygaard"는 찾아짐) —
        # 이름/성만 남긴 축약형으로 한 번 더 시도한다.
        parts = name.split()
        if len(parts) > 2:
            candidates = _fotmob_search_players(parts[0] + ' ' + parts[-1])
    if not candidates:
        return None
    top = candidates[0]
    return {'id': int(top['id']), 'slug': to_slug(top['name'])}


def fetch_squad_for_team(team_id, team_slug):
    """
    Fotmob 스쿼드 페이지에서 현재 선수 목록(ID + slug)을 자동으로 가져온다.
    1군(team 9825)의 기본 소스이자, U21(team 950214)의 안전망으로도 쓰인다
    (공홈 크롤이 Akamai 봇 차단으로 실패할 때를 대비 — main() 참고).
    1군은 실패 시 하드코딩 폴백을 쓰고, 그 외는 폴백 없이 빈 리스트를 반환한다.
    """
    url = f'https://www.fotmob.com/ko/teams/{team_id}/{team_slug}/squad'
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        r.raise_for_status()
        m = re.search(
            r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
            r.text, re.DOTALL
        )
        if not m:
            raise ValueError('__NEXT_DATA__ 없음')

        page_data = json.loads(m.group(1))
        # 실제 경로: fallback → team-{id} → squad → squad
        squad_groups = (
            page_data.get('props', {})
                     .get('pageProps', {})
                     .get('fallback', {})
                     .get(f'team-{team_id}', {})
                     .get('squad', {})
                     .get('squad', [])
        )
        players = []
        SKIP_ROLES = {'coach', 'manager', 'assistant'}
        for group in squad_groups:
            for member in group.get('members', []):
                # 감독/코치 제외 (role은 dict {'key': 'coach', 'fallback': 'Coach'})
                role_raw = member.get('role') or {}
                role = (role_raw.get('key') or role_raw.get('fallback') or str(role_raw)).lower()
                if any(s in role for s in SKIP_ROLES):
                    continue
                pid  = member.get('id')
                name = member.get('name') or ''
                slug = to_slug(name)
                if pid and name:
                    players.append({'id': int(pid), 'slug': slug})

        if not players:
            raise ValueError('선수 목록 파싱 실패')

        print(f'✅ 스쿼드 자동 크롤 완료: {len(players)}명')
        return players

    except Exception as e:
        if team_id == ARSENAL_TEAM_ID:
            print(f'⚠️  스쿼드 크롤 실패 ({e}) → 하드코딩 폴백 사용')
            return ARSENAL_PLAYERS_FALLBACK
        print(f'⚠️  스쿼드 크롤 실패 ({e}) → 건너뜀 (폴백 없음)')
        return []


def fetch_arsenal_squad():
    """하위 호환용 — 1군 스쿼드만 가져온다."""
    return fetch_squad_for_team(ARSENAL_TEAM_ID, 'arsenal')


# 폴백: 크롤 실패 시 사용하는 마지막 알려진 스쿼드
ARSENAL_PLAYERS_FALLBACK = [
    {'id': 317564,  'slug': 'kepa-arrizabalaga'},
    {'id': 562727,  'slug': 'david-raya'},
    {'id': 1243239, 'slug': 'tommy-setford'},
    {'id': 776151,  'slug': 'ben-white'},
    {'id': 955406,  'slug': 'william-saliba'},
    {'id': 795179,  'slug': 'gabriel'},
    {'id': 942381,  'slug': 'jurrien-timber'},
    {'id': 1105912, 'slug': 'riccardo-calafiori'},
    {'id': 1137667, 'slug': 'piero-hincapie'},
    {'id': 1298907, 'slug': 'cristhian-mosquera'},
    {'id': 1406436, 'slug': 'myles-lewis-skelly'},
    {'id': 1787525, 'slug': 'marli-salmon'},
    {'id': 534670,  'slug': 'martin-odegaard'},
    {'id': 574645,  'slug': 'mikel-merino'},
    {'id': 1031325, 'slug': 'martin-zubimendi'},
    {'id': 654096,  'slug': 'declan-rice'},
    {'id': 266520,  'slug': 'christian-norgaard'},
    {'id': 1635773, 'slug': 'max-dowman'},
    {'id': 818975,  'slug': 'eberechi-eze'},
    {'id': 961995,  'slug': 'bukayo-saka'},
    {'id': 1084981, 'slug': 'noni-madueke'},
    {'id': 1021586, 'slug': 'gabriel-martinelli'},
    {'id': 318615,  'slug': 'leandro-trossard'},
    {'id': 576165,  'slug': 'gabriel-jesus'},
    {'id': 749736,  'slug': 'kai-havertz'},
    {'id': 664500,  'slug': 'viktor-gyokeres'},
]

COMP_MAP   = {
    47: 'PL', 42: 'UCL', 132: 'FAC', 133: 'EFL',
    # U21 스쿼드 선수들의 실제 출전 대회 (Arsenal U21 fotmob 페이지에서 확인)
    9084: 'PL2', 142: 'EFLT', 9741: 'UYL',
}
COMP_NAMES = {
    'PL': '프리미어리그', 'UCL': '챔피언스리그', 'FAC': 'FA컵', 'EFL': '카라바오컵',
    'PL2': '프리미어리그 2', 'EFLT': 'EFL 트로피', 'UYL': '유스리그',
}


# ── 유틸 ──────────────────────────────────────────

def season_start_date(season_name: str) -> str:
    """
    '2025/2026' → '2025-07-01'
    매 시즌 자동 계산 — 수동 수정 불필요
    """
    try:
        start_year = int(season_name.split('/')[0])
        return f'{start_year}-07-01'
    except Exception:
        # fallback: 4년 전 날짜 (거의 모든 경기 포함)
        return f'{datetime.now(timezone.utc).year - 1}-07-01'


def current_season_name_now() -> str:
    """
    오늘 날짜 기준 "진짜" 현재 시즌('2025/2026' 형식)을 계산한다 — 선수
    개인의 Fotmob statSeasons에서 뽑는 게 아니다. 이번 시즌에 한 경기도
    안 뛴 선수는 Fotmob이 그 선수의 statSeasons에 이번 시즌 항목 자체를
    안 만들어서, "선수 데이터에서 현재 시즌을 추정"하면 그런 선수는
    저번 시즌으로 잘못 판정된다(→ 저번 시즌 스탯이 섞여 나오는 버그의 원인).
    시즌 시작을 7월로 잡는다(북반구 축구 시즌 관례).
    """
    now = datetime.now(timezone.utc)
    if now.month >= 7:
        return f'{now.year}/{now.year + 1}'
    return f'{now.year - 1}/{now.year}'


def download_photo(player_id):
    """풋몹 선수 사진 다운로드 → 로컬 저장"""
    dest = IMAGES_PATH / f'{player_id}.png'
    if dest.exists():
        return True
    url = f'https://images.fotmob.com/image_resources/playerimages/{player_id}.png'
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        if r.status_code == 200 and len(r.content) > 1000:
            dest.write_bytes(r.content)
            return True
    except Exception:
        pass
    return False

def fetch_player(player_id, slug):
    """Fotmob 선수 페이지 HTML에서 __NEXT_DATA__ 파싱"""
    url = f'https://www.fotmob.com/ko/players/{player_id}/{slug}'
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code != 200:
            print(f'  ❌ HTTP {r.status_code}')
            return None
        m = re.search(
            r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
            r.text, re.DOTALL
        )
        if not m:
            print(f'  ❌ __NEXT_DATA__ 없음')
            return None
        data = json.loads(m.group(1))['props']['pageProps']['data']
        return data
    except Exception as e:
        print(f'  ❌ 에러: {e}')
        return None


def fetch_player_stats_for_season(player_id, entry_id):
    """
    Fotmob의 시즌/대회 선택 드롭다운이 실제로 호출하는 API.
    firstSeasonStats는 Fotmob이 "가장 최근"으로 잡은 시즌(월드컵 등)만 주는데,
    이 엔드포인트는 entryId(statSeasons[].tournaments[].entryId)로 특정
    대회의 슛맵/히트맵/스탯을 정확히 지정해서 받아올 수 있다.
    """
    url = 'https://www.fotmob.com/api/data/playerStats'
    try:
        r = requests.get(
            url,
            params={'playerId': player_id, 'seasonId': entry_id, 'isFirstSeason': 'false'},
            headers={**HEADERS, 'Accept': 'application/json'},
            timeout=15,
        )
        if r.status_code != 200:
            return None
        return r.json()
    except Exception:
        return None


def _get_primary_pos_key(pos_desc):
    if not pos_desc:
        return ''
    primary = pos_desc.get('primaryPosition') or {}
    if primary and primary.get('key'):
        return primary['key']
    positions = pos_desc.get('positions') or []
    main = next((p for p in positions if p.get('isMainPosition')), None)
    if main:
        return (main.get('strPos') or {}).get('key', '')
    if positions:
        best = max(positions, key=lambda p: p.get('occurences', 0))
        return (best.get('strPos') or {}).get('key', '')
    return ''


def _pos_to_group(pos_key):
    pos_key = (pos_key or '').lower()
    if 'keeper' in pos_key or pos_key == 'gk':
        return 'GK'
    if any(x in pos_key for x in ['back', 'defender', 'centreback', 'wingback']):
        return 'DF'
    if any(x in pos_key for x in ['forward', 'striker', 'centreforward', 'winger']):
        return 'FW'
    if any(x in pos_key for x in ['midfielder', 'midfield']):
        return 'MF'
    return 'MF'


# ── 핵심: 대회별 스탯 집계 ──────────────────────────

def _collect_comp_stats(recent_matches, season_start):
    """
    recentMatches 에서 현재 시즌(season_start 이후)만 필터링해
    대회별 스탯 딕셔너리를 반환한다.
    """
    comp_stats = {}

    for match in recent_matches:
        # ── 날짜 추출 (다양한 키 대응) ──
        date_obj  = match.get('matchDate') or match.get('date') or {}
        match_utc = date_obj.get('utcTime', '') if isinstance(date_obj, dict) else str(date_obj)

        # 현재 시즌 외 경기 제외 (자동 계산된 season_start 사용)
        if match_utc < season_start:
            continue

        league_id = match.get('leagueId')
        comp = COMP_MAP.get(league_id)
        if not comp:
            continue

        if comp not in comp_stats:
            comp_stats[comp] = {
                'name': COMP_NAMES.get(comp, comp),
                'appearances': 0,
                'starts': 0,
                'goals': 0,
                'assists': 0,
                'yellowCards': 0,
                'redCards': 0,
                'minutesPlayed': 0,
                'cleanSheets': 0,
                'goalsConceded': 0,
                'rating_sum': 0.0,
                'rating_count': 0,
            }
        c = comp_stats[comp]

        on_bench = match.get('onBench', True)
        minutes  = match.get('minutesPlayed', 0) or 0

        if not on_bench and minutes > 0:
            c['appearances']  += 1
            if minutes >= 45:
                c['starts'] += 1
            c['goals']       += match.get('goals', 0) or 0
            c['assists']     += match.get('assists', 0) or 0
            c['yellowCards'] += match.get('yellowCards', 0) or 0
            c['redCards']    += match.get('redCards', 0) or 0
            c['minutesPlayed'] += minutes

            # 클린시트 / 실점
            home_score = match.get('homeScore')
            away_score = match.get('awayScore')
            is_home    = match.get('isHomeTeam', True)
            if home_score is not None and away_score is not None:
                conceded = (away_score if is_home else home_score) or 0
                c['goalsConceded'] += conceded
                if conceded == 0:
                    c['cleanSheets'] += 1

            # 평점
            rating = (match.get('ratingProps') or {}).get('rating')
            if rating:
                try:
                    c['rating_sum']   += float(rating)
                    c['rating_count'] += 1
                except Exception:
                    pass

    # 평균 평점 계산 & 내부 집계 키 제거
    for c in comp_stats.values():
        c['avgRating'] = (
            round(c['rating_sum'] / c['rating_count'], 1)
            if c['rating_count'] > 0 else None
        )
        del c['rating_sum']
        del c['rating_count']

    return comp_stats


# ── 메인 파싱 ──────────────────────────────────────

def parse_stats(data, squad_levels=None):
    squad_levels = squad_levels or ['first']
    if not data:
        return None

    player_id = data.get('id')

    # ── 현재 시즌 자동 감지 ──
    # 예전엔 이 선수의 statSeasons에서 현재 시즌을 "추정"했는데, 이번 시즌
    # 한 경기도 안 뛴 선수는 Fotmob이 statSeasons에 이번 시즌 항목 자체를
    # 안 만들어줘서 추정이 저번 시즌으로 잘못 떨어지고, 그 결과 이번 시즌
    # 스탯 자리에 저번 시즌 스탯이 섞여 나왔다. 현재 시즌은 오늘 날짜로
    # 계산한 진짜 값(current_season_name_now)을 그대로 쓰고, 선수의
    # statSeasons는 "그 시즌에 해당하는 entryId를 찾는 용도"로만 쓴다 —
    # 못 찾으면(=이번 시즌 미출전) club_season이 None이 되고, 아래에서
    # 스탯/슛맵/히트맵을 전부 비워둔 채로 둔다(저번 시즌 값으로 채우지 않음).
    stat_seasons = data.get('statSeasons') or []
    current_season_name = current_season_name_now()
    club_season = next((s for s in stat_seasons if s.get('seasonName') == current_season_name), None)
    season_start = season_start_date(current_season_name)
    # firstSeasonStats(슛맵/히트맵/topStatCard 원본)는 Fotmob이 statSeasons[0]로
    # 잡은 시즌 기준으로 내려오는데, 그게 진짜 현재 시즌이 아니면(이번 시즌
    # 미출전이라 그 자리에 저번 시즌이나 국가대표 소집 시즌이 들어온 경우)
    # 신뢰할 수 없다 — 진짜 현재 시즌과 정확히 일치할 때만 폴백으로 쓴다.
    first_season_reliable = bool(stat_seasons) and stat_seasons[0].get('seasonName') == current_season_name

    result = {
        'id':           player_id,
        'squadLevels':  squad_levels,  # ['first'] | ['academy'] | ['first','academy'] 등
        'name':         data.get('name', ''),
        'fotmobPhoto':  f'https://images.fotmob.com/image_resources/playerimages/{player_id}.png' if player_id else None,
        'localPhoto':   f'/data/player_images/{player_id}.png' if player_id else None,
        'nationality':  '',
        'position':     _get_primary_pos_key(data.get('positionDescription', {})),
        'posGroup':     _pos_to_group(_get_primary_pos_key(data.get('positionDescription', {}))),
        'jersey':       '',
        'age':          None,
        'height':       '',
        'preferredFoot': '',
        'marketValue':  None,
        'contractEnd':  None,
        'positionLabel': '',
        'career':       [],
        'competitions': {},
        'stats':        {},
        'traits':       None,
        'shotmap':      [],
        'heatmap':      [],
        'season':       current_season_name,
    }

    # ── 기본 정보 ──
    for info in data.get('playerInformation') or []:
        title   = (info.get('title') or '').lower()
        val     = info.get('value', {}) or {}
        fallback = val.get('fallback', '') if isinstance(val, dict) else str(val)
        number   = val.get('numberValue') if isinstance(val, dict) else None

        if title == 'height':
            result['height'] = fallback
        elif title in ('shirt', 'shirt number'):
            result['jersey'] = str(number or '')
        elif title == 'age':
            result['age'] = number or fallback
        elif title in ('preferred foot', 'foot'):
            result['preferredFoot'] = fallback
        elif title in ('country', 'nationality', 'nation'):
            result['nationality'] = fallback

    if not result.get('nationality'):
        result['nationality'] = data.get('citizenship', '')

    if not result.get('jersey') and player_id in JERSEY_OVERRIDES:
        result['jersey'] = JERSEY_OVERRIDES[player_id]

    # ── 계약 만료 ──
    ce = data.get('contractEnd') or {}
    if ce:
        result['contractEnd'] = (ce.get('utcTime') or '')[:10]

    # ── 이적 가치 (최신) ──
    mv_raw  = data.get('marketValues') or {}
    mv_data = mv_raw.get('values', []) if mv_raw else []
    if mv_data:
        latest = mv_data[-1]
        result['marketValue'] = {
            'value':    latest.get('value'),
            'currency': latest.get('currency', 'EUR'),
        }

    # ── 포지션 레이블 ──
    pos_desc = data.get('positionDescription') or {}
    pos_list = pos_desc.get('positions') or []
    primary_label = (pos_desc.get('primaryPosition') or {}).get('label', '')
    if not primary_label:
        main = next((p for p in pos_list if p.get('isMainPosition')), None)
        if main:
            primary_label = (main.get('strPos') or {}).get('label', '')
        elif pos_list:
            best = max(pos_list, key=lambda p: p.get('occurences', 0))
            primary_label = (best.get('strPos') or {}).get('label', '')
    result['positionLabel'] = primary_label

    # ── 대회별 스탯 (현재 시즌만, 자동 필터) ──
    recent_raw = data.get('recentMatches', {})
    recent = (
        list(recent_raw.values()) if isinstance(recent_raw, dict)
        else (recent_raw if isinstance(recent_raw, list) else [])
    )
    result['competitions'] = _collect_comp_stats(recent, season_start)

    # ── 슛맵/히트맵/전체 스탯 ──
    # firstSeasonStats는 Fotmob이 statSeasons[0]로 잡은 시즌(월드컵 등 국가대표
    # 소집일 수 있음) 기준이라 신뢰할 수 없다. 대신 Fotmob 시즌 선택 드롭다운이
    # 실제로 호출하는 playerStats API를 club_season의 각 대회 entryId로 직접
    # 불러와 PL/FAC/EFL/UCL 슛맵·히트맵을 정확히 합친다.
    shotmap = []
    heatmap_coords = []
    all_stats = {}
    pl_stats_used = False
    if club_season:
        for t in club_season.get('tournaments') or []:
            comp = COMP_MAP.get(t.get('tournamentId'))
            if not comp or not t.get('entryId'):
                continue
            season_stats = fetch_player_stats_for_season(player_id, t['entryId'])
            time.sleep(0.4)
            if not season_stats:
                continue
            for s in season_stats.get('shotmap') or []:
                end_x, end_y = None, None
                if s.get('isBlocked') and s.get('blockedX') is not None and s.get('blockedY') is not None:
                    end_x, end_y = s['blockedX'], s['blockedY']
                elif s.get('goalCrossedY') is not None:
                    end_x, end_y = 105, s['goalCrossedY']  # 105 = 실제 골라인(PITCH_LEN)
                shotmap.append({
                    'x':        s.get('x'),
                    'y':        s.get('y'),
                    'endX':     end_x,
                    'endY':     end_y,
                    'min':      s.get('min'),
                    'xg':       round(s.get('expectedGoals') or 0, 3),
                    'xgot':     round(s['expectedGoalsOnTarget'], 3) if s.get('expectedGoalsOnTarget') is not None else None,
                    'event':    'goal' if s.get('eventType') == 'Goal' else
                                'ownGoal' if s.get('isOwnGoal') else
                                'blocked' if s.get('isBlocked') else
                                'onTarget' if s.get('isOnTarget') else 'off',
                    'situation': s.get('situation'),
                    'shotType': s.get('shotType'),
                    'comp':     comp,
                    'match': {
                        'home': s.get('homeTeamName'),
                        'away': s.get('awayTeamName'),
                        'homeId': s.get('homeTeamId'),
                        'awayId': s.get('awayTeamId'),
                        'homeScore': s.get('homeScore'),
                        'awayScore': s.get('awayScore'),
                        'date': s.get('matchDate'),
                    },
                })
            for pt in (season_stats.get('heatmap') or {}).get('coordinates') or []:
                heatmap_coords.append({'x': pt.get('x'), 'y': pt.get('y'), 'comp': comp})
            # PL을 대표 대회 스탯(고급 지표)으로 사용 — 나머지 선수들과 동일 기준
            if comp == 'PL' and not pl_stats_used:
                pl_stats_used = True
                for group in (season_stats.get('statsSection') or {}).get('items') or []:
                    for stat in group.get('items') or []:
                        key = stat.get('localizedTitleId') or stat.get('title', '').lower().replace(' ', '_')
                        all_stats[key] = {
                            'value':      stat.get('statValue'),
                            'per90':      round(stat.get('per90', 0), 2),
                            'percentile': round(stat.get('percentileRank', 0)),
                        }
                for stat in (season_stats.get('topStatCard') or {}).get('items') or []:
                    key = stat.get('localizedTitleId') or stat.get('title', '').lower().replace(' ', '_')
                    if key not in all_stats:
                        all_stats[key] = {
                            'value':      stat.get('statValue'),
                            'per90':      round(stat.get('per90', 0), 2),
                            'percentile': round(stat.get('percentileRank', 0)),
                        }

    # 위 API 호출이 전부 실패한 경우(네트워크 등)에는 기존 firstSeasonStats로
    # 폴백하되, first_season_reliable(=firstSeasonStats가 진짜 현재 시즌
    # 기준일 때)일 때만 쓴다 — 이번 시즌 미출전 선수는 여기서 걸러져서
    # all_stats/shotmap이 빈 채로 남는다(저번 시즌 값으로 안 채워짐).
    if not pl_stats_used and first_season_reliable:
        first_stats = data.get('firstSeasonStats') or {}
        stats_section = first_stats.get('statsSection') or {}
        for group in stats_section.get('items') or []:
            for stat in group.get('items') or []:
                key = stat.get('localizedTitleId') or stat.get('title', '').lower().replace(' ', '_')
                all_stats[key] = {
                    'value':      stat.get('statValue'),
                    'per90':      round(stat.get('per90', 0), 2),
                    'percentile': round(stat.get('percentileRank', 0)),
                }
        for stat in (first_stats.get('topStatCard') or {}).get('items') or []:
            key = stat.get('localizedTitleId') or stat.get('title', '').lower().replace(' ', '_')
            if key not in all_stats:
                all_stats[key] = {
                    'value':      stat.get('statValue'),
                    'per90':      round(stat.get('per90', 0), 2),
                    'percentile': round(stat.get('percentileRank', 0)),
                }
        if not shotmap:
            match_league = {m.get('id'): m.get('leagueId') for m in recent if m.get('id') is not None}
            for s in first_stats.get('shotmap') or []:
                comp = COMP_MAP.get(match_league.get(s.get('matchId')))
                if not comp:
                    continue
                end_x, end_y = None, None
                if s.get('isBlocked') and s.get('blockedX') is not None and s.get('blockedY') is not None:
                    end_x, end_y = s['blockedX'], s['blockedY']
                elif s.get('goalCrossedY') is not None:
                    end_x, end_y = 105, s['goalCrossedY']
                shotmap.append({
                    'x': s.get('x'), 'y': s.get('y'), 'endX': end_x, 'endY': end_y,
                    'min': s.get('min'), 'xg': round(s.get('expectedGoals') or 0, 3),
                    'xgot': round(s['expectedGoalsOnTarget'], 3) if s.get('expectedGoalsOnTarget') is not None else None,
                    'event': 'goal' if s.get('eventType') == 'Goal' else
                             'ownGoal' if s.get('isOwnGoal') else
                             'blocked' if s.get('isBlocked') else
                             'onTarget' if s.get('isOnTarget') else 'off',
                    'situation': s.get('situation'), 'shotType': s.get('shotType'), 'comp': comp,
                    'match': {
                        'home': s.get('homeTeamName'), 'away': s.get('awayTeamName'),
                        'homeId': s.get('homeTeamId'), 'awayId': s.get('awayTeamId'),
                        'homeScore': s.get('homeScore'), 'awayScore': s.get('awayScore'),
                        'date': s.get('matchDate'),
                    },
                })
        if not heatmap_coords and first_season_reliable:
            # firstSeasonStats는 보통 PL 기준으로 내려온다 (검증됨)
            heatmap_coords = [
                {'x': pt.get('x'), 'y': pt.get('y'), 'comp': 'PL'}
                for pt in (first_stats.get('heatmap') or {}).get('coordinates') or []
            ]

    result['stats'] = all_stats
    result['shotmap'] = shotmap
    result['heatmap'] = heatmap_coords

    # ── 핵심 지표 보정 ──
    # firstSeasonStats(topStatCard 등)는 정상적인 경우 프리미어리그 단일 대회
    # 기준인데, Fotmob이 "가장 최근 시즌"을 월드컵 등 국가대표 소집으로 잡은
    # 선수는 이 값이 전부 그쪽 기준으로 나온다. competitions.PL(이미 올바르게
    # 필터링됨)로 덮어써서 나머지 선수들과 동일한 프리미어리그 기준으로 맞춘다.
    pl = result['competitions'].get('PL')
    if pl:
        def _override(key, value):
            prev = all_stats.get(key, {})
            all_stats[key] = {
                'value':      str(value),
                'per90':      prev.get('per90', 0),
                'percentile': prev.get('percentile', 0),
            }

        _override('goals', pl['goals'])
        _override('assists', pl['assists'])
        _override('matches_uppercase', pl['appearances'])
        _override('player_started_matches', pl['starts'])
        _override('minutes_played', pl['minutesPlayed'])
        _override('yellow_cards', pl['yellowCards'])
        _override('red_cards', pl['redCards'])
        if pl['avgRating']:
            _override('rating', pl['avgRating'])

    # ── traits (레이더 차트) ──
    # Fotmob 페이지 기본 노출 시즌 기준이라 이번 시즌 미출전 선수는 저번
    # 시즌 레이더가 나올 수 있다 — club_season(이번 시즌 항목)이 있을 때만 쓴다.
    traits_raw = data.get('traits') or {} if club_season else {}
    if traits_raw and traits_raw.get('items'):
        result['traits'] = {
            'title': traits_raw.get('title', ''),
            'items': [
                {
                    'key':   item.get('key'),
                    'title': item.get('title'),
                    'value': round((item.get('value') or 0) * 100),
                }
                for item in traits_raw.get('items') or []
            ],
        }

    # ── 경력 ──
    career_entries = (
        ((data.get('careerHistory') or {})
            .get('careerItems') or {})
            .get('senior') or {}
    ).get('teamEntries') or []
    result['career'] = [
        {
            'team':        e.get('team'),
            'startDate':   (e.get('startDate') or '')[:7],
            'endDate':     (e.get('endDate') or '')[:7] or None,
            'active':      e.get('active', False),
            'appearances': e.get('appearances'),
            'goals':       e.get('goals'),
            'assists':     e.get('assists'),
        }
        for e in career_entries[:8]
    ]

    # squadLevels는 출전 기록이 아니라 순수 스쿼드 "등록" 여부로만 정해진다
    # (main()에서 1군/아카데미 명단 소스별로 태깅) — 아카데미 선수가 로테이션
    # 경기에 한 번 올라갔다고 1군으로 뜨는 걸 막기 위해, 출전 기록 기반으로
    # squadLevels를 자동으로 올려주던 보정 로직은 없앴다. 대신 아카데미 탭에서
    # 열었을 때는 1군 대회 출전 기록도 같이 보여준다(openPlayerModal 참고).

    return result


# ── football.js FOTMOB_IDS 자동 업데이트 ──────────────
FOOTBALL_JS_PATH = Path('arsenal-dashboard/api/football.js')

def update_fotmob_ids(squad):
    """
    스쿼드 리스트로 football.js의 FOTMOB_IDS 블록을 덮어쓴다.
    slug의 첫 번째 파트(성 or 특이 이름)를 key로 사용.
    """
    if not FOOTBALL_JS_PATH.exists():
        print('⚠️  football.js 없음 — FOTMOB_IDS 업데이트 스킵')
        return

    # key: slug에서 마지막 파트(성) 사용, 단 한 단어 slug면 그대로
    def slug_to_key(slug):
        parts = slug.split('-')
        return parts[-1] if len(parts) > 1 else parts[0]

    lines = ["const FOTMOB_IDS = {\n"]
    for p in squad:
        key = slug_to_key(p['slug'])
        lines.append(f"  '{key}':{' ' * max(1, 14 - len(key))}{p['id']},\n")
    lines.append("};\n")
    new_block = ''.join(lines)

    content = FOOTBALL_JS_PATH.read_text(encoding='utf-8')
    # FOTMOB_IDS 블록 교체
    updated = re.sub(
        r'const FOTMOB_IDS = \{.*?\};',
        new_block.strip(),
        content,
        flags=re.DOTALL
    )
    if updated == content:
        print('✅ football.js FOTMOB_IDS 변경 없음 (스쿼드 동일)')
        return

    FOOTBALL_JS_PATH.write_text(updated, encoding='utf-8')
    print(f'✅ football.js FOTMOB_IDS 업데이트 완료 ({len(squad)}명)')


# ── Git push ───────────────────────────────────────

def git_push(filepath):
    try:
        paths = [filepath] if not isinstance(filepath, list) else filepath
        for p in paths:
            subprocess.run(['git', 'add', str(p)], check=True)
        msg    = f'📊 Fotmob stats update {datetime.now().strftime("%Y-%m-%d %H:%M")}'
        result = subprocess.run(['git', 'diff', '--staged', '--quiet'])
        if result.returncode != 0:
            subprocess.run(['git', 'commit', '-m', msg], check=True)
            subprocess.run(['git', 'push'],              check=True)
            print('✅ GitHub push 완료!')
        else:
            print('⚠️  변경사항 없음 — push 스킵')
    except subprocess.CalledProcessError as e:
        print(f'❌ git 오류: {e}')


# ── 실행 ──────────────────────────────────────────

def main():
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    IMAGES_PATH.mkdir(parents=True, exist_ok=True)

    # 1군은 Fotmob 스쿼드 목록 페이지 그대로. 아카데미는 U21/U18을 따로
    # 안 나누고 "academy" 하나로 묶어서, 공홈 명단을 기준으로 이름마다
    # Fotmob 검색으로 ID를 찾는다(팀 스쿼드 목록보다 누락이 적음).
    # 두 소스에 동시에 이름이 올라오는 선수(예: 막스 다우먼처럼 1군과
    # 아카데미를 오가는 선수)는 squadLevels에 두 레벨을 모두 태그해서
    # 프론트엔드 1군/아카데미 탭 양쪽에 다 노출되게 한다.
    by_id = {}
    order = []

    def add_member(member, level):
        if member['id'] not in by_id:
            by_id[member['id']] = {**member, 'squadLevels': []}
            order.append(member['id'])
        if level not in by_id[member['id']]['squadLevels']:
            by_id[member['id']]['squadLevels'].append(level)

    print(f'🔍 Fotmob first 스쿼드 크롤 중... (team {ARSENAL_TEAM_ID})')
    first_team_squad = fetch_squad_for_team(ARSENAL_TEAM_ID, 'arsenal')
    for m in first_team_squad:
        add_member(m, 'first')
    print(f'  → first: {len(first_team_squad)}명')

    # 아카데미 1차: Fotmob 자체 U21 스쿼드 목록 페이지(기존 방식) — 안전망으로
    # 계속 유지한다. 공홈 크롤이 막히더라도(아래) 최소한 이 정도는 잡힌다.
    print('🔍 Fotmob u21 스쿼드 크롤 중... (team 950214, 안전망)')
    u21_fallback_squad = fetch_squad_for_team(950214, 'arsenal-u21')
    for m in u21_fallback_squad:
        add_member(m, 'academy')
    print(f'  → academy (Fotmob u21 목록): {len(u21_fallback_squad)}명')

    # 아카데미 2차: 공홈 명단 → Fotmob 검색으로 보강. headless=False로 실제
    # 브라우저 창을 띄워야 Akamai 봇 차단(403)을 피할 수 있다(직접 확인함) —
    # 그래도 막히면 fetch_arsenal_com_names가 빈 리스트를 반환하고 위
    # 안전망만 남는다.
    print('🔍 arsenal.com 아카데미 명단 크롤 중... (공홈, 위 목록의 누락분 보강용)')
    academy_names = fetch_arsenal_com_names('academy')
    print(f'  → 공홈 아카데미 명단: {len(academy_names)}명')
    academy_found = 0
    for name in academy_names:
        resolved = resolve_fotmob_id_by_name(name)
        time.sleep(0.5)  # 검색 API 예의상 텀
        if resolved is None:
            print(f'  경고: Fotmob에 아예 없음: {name}')
            continue
        add_member({'id': resolved['id'], 'slug': resolved['slug']}, 'academy')
        academy_found += 1
    if academy_names:
        print(f'  → 아카데미(공홈): {academy_found}/{len(academy_names)}명 매칭')

    tagged_squad = [by_id[pid] for pid in order]

    print(f'🔍 Fotmob 선수 스탯 스크래핑 시작 (총 {len(tagged_squad)}명)')

    # football.js FOTMOB_IDS는 1군 선수 이름 매칭(라이브 경기용)에만 쓰이므로
    # U21은 제외하고 기존처럼 1군 스쿼드로만 갱신한다.
    update_fotmob_ids(first_team_squad)

    players = []
    detected_season = None

    for i, p in enumerate(tagged_squad):
        print(f'  [{i+1}/{len(tagged_squad)}] ({"/".join(p["squadLevels"])}) {p["slug"]}...', end=' ', flush=True)
        data = fetch_player(p['id'], p['slug'])
        if data:
            try:
                parsed = parse_stats(data, squad_levels=p['squadLevels'])
            except Exception as e:
                # 선수 한 명의 데이터 구조가 예상과 달라도(특히 U21처럼
                # 필드가 비어있는 경우가 많은 스쿼드) 전체 스크래핑이 죽지
                # 않도록 여기서 잡고 다음 선수로 넘어간다.
                print(f'파싱 에러: {e}')
                parsed = None
            if parsed:
                players.append(parsed)
                if not detected_season:
                    detected_season = parsed.get('season', '')
                photo_ok = download_photo(p['id'])
                print(f'✅ {parsed["name"]} ({parsed.get("season","")}) {"📷" if photo_ok else "❌사진없음"}')
            else:
                print('파싱 실패')
        else:
            print('건너뜀')
        time.sleep(2)

    output = {
        'updated_at': datetime.now(timezone.utc).isoformat(),
        'season':     detected_season or 'unknown',
        'source':     'Fotmob',
        'players':    players,
    }

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f'\n✅ 완료! {len(players)}명 → {OUTPUT_PATH}  (시즌: {detected_season})')

    if GITHUB_TOKEN:
        git_push([OUTPUT_PATH, FOOTBALL_JS_PATH])
    else:
        print('\n⚠️  GITHUB_TOKEN 미설정 — 수동으로 git push 해주세요')
        print('   git add arsenal-dashboard/public/data/players.json arsenal-dashboard/public/data/player_images/ arsenal-dashboard/api/football.js')
        print('   git commit -m "📊 stats update"')
        print('   git push')


if __name__ == '__main__':
    main()
