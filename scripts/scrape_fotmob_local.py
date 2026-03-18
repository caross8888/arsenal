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
GITHUB_TOKEN = ''   # GitHub Personal Access Token 입력
GITHUB_REPO  = 'caross8888/arsenal'
OUTPUT_PATH  = Path('arsenal-dashboard/public/data/players.json')

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
    'Referer': 'https://www.fotmob.com/',
}

ARSENAL_TEAM_ID = 9825
SEASON = '2025/2026'

# ── 아스날 선수 목록 (Fotmob ID) ──────────────────
# fotmob.com/ko/teams/9825/squad/arsenal 에서 추출
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

COMP_MAP = {47: 'PL', 42: 'UCL', 132: 'FAC', 133: 'EFL'}
COMP_NAMES = {'PL': '프리미어리그', 'UCL': '챔피언스리그', 'FAC': 'FA컵', 'EFL': '카라바오컵'}


def fetch_player(player_id, slug):
    """Fotmob 선수 페이지 HTML에서 __NEXT_DATA__ 파싱"""
    url = f'https://www.fotmob.com/ko/players/{player_id}/{slug}'
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code != 200:
            print(f'  ❌ HTTP {r.status_code}')
            return None

        # __NEXT_DATA__ JSON 추출
        m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', r.text, re.DOTALL)
        if not m:
            print(f'  ❌ __NEXT_DATA__ 없음')
            return None

        data = json.loads(m.group(1))['props']['pageProps']['data']
        return data

    except Exception as e:
        print(f'  ❌ 에러: {e}')
        return None


def parse_stats(data):
    """선수 데이터에서 스탯 추출"""
    if not data:
        return None
    result = {
        'id':          data.get('id'),
        'name':        data.get('name', ''),
        'nationality': data.get('playerInformation', [{}])[0].get('value', {}).get('fallback', '')
                       if data.get('playerInformation') else '',
        'position':    data.get('positionDescription', {}).get('positions', [{}])[0].get('strPos', {}).get('key', ''),
        'jersey':      '',
        'age':         None,
        'height':      '',
        'marketValue': None,
        'contractEnd': None,
        'competitions': {},
        # 시즌 통합 스탯
        'stats':       {},
    }

    # 기본 정보
    for info in data.get('playerInformation', []):
        key = info.get('title', '')
        val = info.get('value', {})
        if '나이' in key or 'Age' in key:
            result['age'] = val.get('numberValue')
        elif '키' in key or 'Height' in key:
            result['height'] = val.get('fallback', '')
        elif '등번호' in key or 'Shirt' in key or 'Number' in key:
            result['jersey'] = str(val.get('numberValue', ''))

    # 계약 만료
    ce = data.get('contractEnd', {})
    if ce:
        result['contractEnd'] = ce.get('utcTime', '')[:10]

    # 이적 가치 (최신)
    mv_raw = data.get('marketValues') or {}
    mv_data = mv_raw.get('values', []) if mv_raw else []
    if mv_data:
        latest = mv_data[-1]
        result['marketValue'] = {
            'value':    latest.get('value'),
            'currency': latest.get('currency', 'EUR'),
        }

    # 시즌 스탯 (전체)
    first_stats = data.get('firstSeasonStats', {})
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
    result['stats'] = all_stats

    # 대회별 스탯 — recentMatches에서 leagueId 기준으로 집계
    LEAGUE_TO_COMP = {
        47:  'PL',   # Premier League
        42:  'UCL',  # Champions League
        132: 'FAC',  # FA Cup
        133: 'EFL',  # EFL Cup
    }
    comp_stats = {}
    recent_raw = data.get('recentMatches', {})
    # recentMatches가 dict이면 values(), list면 그대로
    recent = recent_raw.values() if isinstance(recent_raw, dict) else (recent_raw if isinstance(recent_raw, list) else [])
    for match in recent:
        league_id = match.get('leagueId')
        comp = LEAGUE_TO_COMP.get(league_id)
        if not comp:
            continue
        if comp not in comp_stats:
            comp_stats[comp] = {
                'name': COMP_NAMES.get(comp, comp),
                'appearances': 0,  # 출전 경기 (벤치 제외)
                'starts': 0,       # 선발
                'goals': 0,
                'assists': 0,
                'yellowCards': 0,
                'redCards': 0,
                'minutesPlayed': 0,
                'rating_sum': 0,
                'rating_count': 0,
            }
        c = comp_stats[comp]
        on_bench = match.get('onBench', True)
        minutes = match.get('minutesPlayed', 0) or 0
        if not on_bench and minutes > 0:
            c['appearances'] += 1
            # 선발: 벤치 아니고 45분 이상 또는 전반부터 출전
            if minutes >= 45:
                c['starts'] += 1
        c['goals']         += match.get('goals', 0) or 0
        c['assists']       += match.get('assists', 0) or 0
        c['yellowCards']   += match.get('yellowCards', 0) or 0
        c['redCards']      += match.get('redCards', 0) or 0
        c['minutesPlayed'] += minutes
        rating = match.get('ratingProps') or {}
        if rating.get('rating'):
            try:
                c['rating_sum']   += float(rating['rating'])
                c['rating_count'] += 1
            except:
                pass

    for comp, c in comp_stats.items():
        if c['rating_count'] > 0:
            c['avgRating'] = round(c['rating_sum'] / c['rating_count'], 1)
        else:
            c['avgRating'] = None
        del c['rating_sum']
        del c['rating_count']
        result['competitions'][comp] = c


    # traits (레이더 차트용 - Fotmob 포지션별 비교)
    traits_raw = data.get('traits') or {}
    if traits_raw and traits_raw.get('items'):
        result['traits'] = {
            'title': traits_raw.get('title', ''),
            'items': [
                {
                    'key':   item.get('key'),
                    'title': item.get('title'),
                    'value': round(item.get('value', 0) * 100),  # 0~1 → 0~100%
                }
                for item in traits_raw.get('items', [])
            ]
        }

    # playerInformation (키, 등번호, 나이, 발)
    for info in data.get('playerInformation', []):
        title = (info.get('title') or '').lower()
        val   = info.get('value', {})
        if 'height' in title or '키' in title:
            result['height'] = val.get('fallback', '')
        elif 'shirt' in title or '등번호' in title:
            result['jersey'] = str(val.get('numberValue', ''))
        elif 'age' in title or '나이' in title:
            result['age'] = val.get('numberValue') or val.get('fallback')
        elif 'foot' in title or '발' in title:
            result['preferredFoot'] = val.get('fallback', '')

    # 포지션 (strPos label)
    pos_list = data.get('positionDescription', {}).get('positions', [])
    if pos_list:
        result['positionLabel'] = pos_list[0].get('strPos', {}).get('label', '')

    # 국적
    for info in data.get('playerInformation', []):
        if info.get('title', '').lower() in ('country', 'nationality', '국가'):
            result['nationality'] = info.get('value', {}).get('fallback', '')

    # careerHistory
    career = data.get('careerHistory', {}).get('careerItems', {})
    senior = career.get('senior', {}).get('teamEntries', [])
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
        for e in senior[:8]  # 최근 8개 클럽
    ]

    return result


def git_push(filepath):
    """변경된 파일을 GitHub에 push"""
    try:
        subprocess.run(['git', 'add', str(filepath)], check=True)
        msg = f'📊 Fotmob stats update {datetime.now().strftime("%Y-%m-%d %H:%M")}'
        result = subprocess.run(['git', 'diff', '--staged', '--quiet'])
        if result.returncode != 0:
            subprocess.run(['git', 'commit', '-m', msg], check=True)
            subprocess.run(['git', 'push'], check=True)
            print('✅ GitHub push 완료!')
        else:
            print('⚠️ 변경사항 없음 — push 스킵')
    except subprocess.CalledProcessError as e:
        print(f'❌ git 오류: {e}')


def main():
    print(f'🔍 Fotmob 스크래핑 시작 ({len(ARSENAL_PLAYERS)}명)')
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    players = []
    for i, p in enumerate(ARSENAL_PLAYERS):
        print(f'  [{i+1}/{len(ARSENAL_PLAYERS)}] {p["slug"]}...', end=' ')
        data = fetch_player(p['id'], p['slug'])
        if data:
            parsed = parse_stats(data)
            if parsed:
                players.append(parsed)
                print(f'✅ {parsed["name"]}')
            else:
                print('파싱 실패')
        else:
            print('건너뜀')
        time.sleep(2)  # 요청 간격

    output = {
        'updated_at': datetime.utcnow().isoformat(),
        'season':     SEASON,
        'source':     'Fotmob',
        'players':    players,
    }

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f'\n✅ 완료! {len(players)}명 → {OUTPUT_PATH}')

    # GitHub push
    if GITHUB_TOKEN:
        git_push(OUTPUT_PATH)
    else:
        print('\n⚠️  GITHUB_TOKEN 미설정 — 수동으로 git push 해주세요')
        print('   git add arsenal-dashboard/public/data/players.json')
        print('   git commit -m "📊 stats update"')
        print('   git push')


if __name__ == '__main__':
    main()
