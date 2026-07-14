#!/usr/bin/env python3
"""
Fotmob 아스날 선수 스탯 스크래퍼 (로컬 실행용)
- 수현님 PC에서 직접 실행
- players.json 생성 후 GitHub에 push

실행 방법:
  cd arsenal
  pip install requests
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
from datetime import datetime

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

# Fotmob playerInformation에 등번호가 누락되는 선수용 수동 보정
# (Fotmob 페이지 자체에 구조화 데이터가 없는 경우 확인 후 갱신 필요)
JERSEY_OVERRIDES = {
    1137667: '5',   # Piero Hincapié
    1254234: '22',  # Ethan Nwaneri
    1025462: '21',  # Fábio Vieira
    748382:  '28',  # Reiss Nelson
}

# ── Fotmob 아스날 스쿼드 자동 크롤 ──────────────────
def fetch_arsenal_squad():
    """
    Fotmob 아스날 스쿼드 페이지에서 현재 선수 목록(ID + slug)을 자동으로 가져온다.
    실패 시 하드코딩 폴백 리스트를 반환한다.
    """
    import unicodedata

    def to_slug(name: str) -> str:
        """'Viktor Gyökeres' → 'viktor-gyokeres'"""
        nfkd = unicodedata.normalize('NFKD', name)
        ascii_name = nfkd.encode('ascii', 'ignore').decode('ascii')
        return re.sub(r'[^a-z0-9]+', '-', ascii_name.lower()).strip('-')

    url = f'https://www.fotmob.com/ko/teams/{ARSENAL_TEAM_ID}/arsenal/squad'
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
        # 실제 경로: fallback → team-9825 → squad → squad
        squad_groups = (
            page_data.get('props', {})
                     .get('pageProps', {})
                     .get('fallback', {})
                     .get(f'team-{ARSENAL_TEAM_ID}', {})
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
            raise ValueError('선수 목록 파싱 실패 — 폴백 사용')

        print(f'✅ 스쿼드 자동 크롤 완료: {len(players)}명')
        return players

    except Exception as e:
        print(f'⚠️  스쿼드 크롤 실패 ({e}) → 하드코딩 폴백 사용')
        return ARSENAL_PLAYERS_FALLBACK


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

COMP_MAP   = {47: 'PL', 42: 'UCL', 132: 'FAC', 133: 'EFL'}
COMP_NAMES = {'PL': '프리미어리그', 'UCL': '챔피언스리그', 'FAC': 'FA컵', 'EFL': '카라바오컵'}


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
        return f'{datetime.utcnow().year - 1}-07-01'


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


def _get_primary_pos_key(pos_desc):
    if not pos_desc:
        return ''
    primary = pos_desc.get('primaryPosition', {})
    if primary and primary.get('key'):
        return primary['key']
    positions = pos_desc.get('positions', [])
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

def parse_stats(data):
    if not data:
        return None

    player_id = data.get('id')

    # ── 현재 시즌 자동 감지 ──
    # statSeasons[0]는 월드컵/유로 등 국가대표 소집 시즌("2026")이 클럽 시즌보다
    # 앞에 올 수 있어, "YYYY/YYYY" 형식의 클럽 시즌 항목을 우선으로 찾는다.
    stat_seasons = data.get('statSeasons', [])
    club_season = next((s for s in stat_seasons if re.match(r'^\d{4}/\d{4}$', s.get('seasonName', ''))), None)
    current_season_name = (club_season or stat_seasons[0])['seasonName'] if stat_seasons else str(datetime.utcnow().year - 1) + '/' + str(datetime.utcnow().year)
    season_start = season_start_date(current_season_name)

    result = {
        'id':           player_id,
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
    for info in data.get('playerInformation', []):
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
    pos_desc = data.get('positionDescription', {})
    pos_list = pos_desc.get('positions', [])
    primary_label = pos_desc.get('primaryPosition', {}).get('label', '')
    if not primary_label:
        main = next((p for p in pos_list if p.get('isMainPosition')), None)
        if main:
            primary_label = (main.get('strPos') or {}).get('label', '')
        elif pos_list:
            best = max(pos_list, key=lambda p: p.get('occurences', 0))
            primary_label = (best.get('strPos') or {}).get('label', '')
    result['positionLabel'] = primary_label

    # ── 전체 스탯 (firstSeasonStats) ──
    first_stats   = data.get('firstSeasonStats') or {}
    stats_section = first_stats.get('statsSection') or {}
    all_stats = {}
    for group in stats_section.get('items', []):
        for stat in group.get('items', []):
            key = stat.get('localizedTitleId') or stat.get('title', '').lower().replace(' ', '_')
            all_stats[key] = {
                'value':      stat.get('statValue'),
                'per90':      round(stat.get('per90', 0), 2),
                'percentile': round(stat.get('percentileRank', 0)),
            }
    # topStatCard 도 합산 (appearances 등)
    top_card = first_stats.get('topStatCard') or {}
    for stat in top_card.get('items', []):
        key = stat.get('localizedTitleId') or stat.get('title', '').lower().replace(' ', '_')
        if key not in all_stats:
            all_stats[key] = {
                'value':      stat.get('statValue'),
                'per90':      round(stat.get('per90', 0), 2),
                'percentile': round(stat.get('percentileRank', 0)),
            }
    result['stats'] = all_stats

    # ── 대회별 스탯 (현재 시즌만, 자동 필터) ──
    recent_raw = data.get('recentMatches', {})
    recent = (
        list(recent_raw.values()) if isinstance(recent_raw, dict)
        else (recent_raw if isinstance(recent_raw, list) else [])
    )
    result['competitions'] = _collect_comp_stats(recent, season_start)

    # ── 슛맵 (matchId → leagueId 매칭해 PL/UCL/FAC/EFL 경기만 필터) ──
    match_league = {m.get('id'): m.get('leagueId') for m in recent if m.get('id') is not None}
    raw_shots = first_stats.get('shotmap') or []
    shotmap = []
    for s in raw_shots:
        comp = COMP_MAP.get(match_league.get(s.get('matchId')))
        if not comp:
            continue
        # 슛 방향(궤적) 끝점 — 블록된 슛은 블록 지점, 유효슈팅/골은 골라인 통과 지점
        end_x, end_y = None, None
        if s.get('isBlocked') and s.get('blockedX') is not None and s.get('blockedY') is not None:
            end_x, end_y = s['blockedX'], s['blockedY']
        elif s.get('goalCrossedY') is not None:
            end_x, end_y = 100, s['goalCrossedY']
        shotmap.append({
            'x':        s.get('x'),
            'y':        s.get('y'),
            'endX':     end_x,
            'endY':     end_y,
            'min':      s.get('min'),
            'xg':       round(s.get('expectedGoals') or 0, 3),
            'event':    'goal' if s.get('eventType') == 'Goal' else
                        'ownGoal' if s.get('isOwnGoal') else
                        'blocked' if s.get('isBlocked') else
                        'onTarget' if s.get('isOnTarget') else 'off',
            'situation': s.get('situation'),
            'comp':     comp,
        })
    result['shotmap'] = shotmap

    # ── 터치 히트맵 (Fotmob이 잡은 최근 시즌 기준 전체, 대회 구분 없음) ──
    heatmap_raw = first_stats.get('heatmap') or {}
    result['heatmap'] = heatmap_raw.get('coordinates') or []

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
    traits_raw = data.get('traits') or {}
    if traits_raw and traits_raw.get('items'):
        result['traits'] = {
            'title': traits_raw.get('title', ''),
            'items': [
                {
                    'key':   item.get('key'),
                    'title': item.get('title'),
                    'value': round((item.get('value') or 0) * 100),
                }
                for item in traits_raw.get('items', [])
            ],
        }

    # ── 경력 ──
    career_entries = (
        data.get('careerHistory', {})
            .get('careerItems', {})
            .get('senior', {})
            .get('teamEntries', [])
    )
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

    # 스쿼드 자동 크롤 (실패 시 폴백)
    print('🔍 Fotmob 아스날 스쿼드 크롤 중...')
    squad = fetch_arsenal_squad()
    print(f'🔍 Fotmob 선수 스탯 스크래핑 시작 ({len(squad)}명)')

    # football.js FOTMOB_IDS 즉시 업데이트
    update_fotmob_ids(squad)

    players = []
    detected_season = None

    for i, p in enumerate(squad):
        print(f'  [{i+1}/{len(squad)}] {p["slug"]}...', end=' ', flush=True)
        data = fetch_player(p['id'], p['slug'])
        if data:
            parsed = parse_stats(data)
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
        'updated_at': datetime.utcnow().isoformat(),
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
