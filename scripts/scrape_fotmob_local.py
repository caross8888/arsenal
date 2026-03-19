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

# ── 아스날 선수 목록 (Fotmob ID) ──────────────────
ARSENAL_PLAYERS = [
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
    if any(x in pos_key for x in ['forward', 'striker', 'centreforward', 'winger', 'attackingmidfielder']):
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
    stat_seasons = data.get('statSeasons', [])
    current_season_name = stat_seasons[0]['seasonName'] if stat_seasons else str(datetime.utcnow().year - 1) + '/' + str(datetime.utcnow().year)
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
    first_stats   = data.get('firstSeasonStats', {})
    stats_section = first_stats.get('statsSection', {})
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
    top_card = first_stats.get('topStatCard', {})
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


# ── Git push ───────────────────────────────────────

def git_push(filepath):
    try:
        subprocess.run(['git', 'add', str(filepath)], check=True)
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
    print(f'🔍 Fotmob 스크래핑 시작 ({len(ARSENAL_PLAYERS)}명)')
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    IMAGES_PATH.mkdir(parents=True, exist_ok=True)

    players = []
    detected_season = None

    for i, p in enumerate(ARSENAL_PLAYERS):
        print(f'  [{i+1}/{len(ARSENAL_PLAYERS)}] {p["slug"]}...', end=' ', flush=True)
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
        git_push(OUTPUT_PATH)
    else:
        print('\n⚠️  GITHUB_TOKEN 미설정 — 수동으로 git push 해주세요')
        print('   git add arsenal-dashboard/public/data/players.json arsenal-dashboard/public/data/player_images/')
        print('   git commit -m "📊 stats update"')
        print('   git push')


if __name__ == '__main__':
    main()
