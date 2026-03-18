#!/usr/bin/env python3
"""
ESPN API 기반 아스날 선수 스탯 스크래퍼
PL + UCL + FA컵 + 카라바오컵 합산
GitHub Actions에서 매일 UTC 23:00 실행
"""

import urllib.request
import json
import subprocess
from pathlib import Path
from datetime import datetime

OUTPUT_PATH = Path("arsenal-dashboard/public/data/players.json")
OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

H = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36'
}

# ESPN 아스날 팀 ID = 359
# 대회별 리그 슬러그
COMPETITIONS = [
    ('PL',  'eng.1',           '프리미어리그'),
    ('UCL', 'uefa.champions',  '챔피언스리그'),
    ('FAC', 'eng.fa',          'FA컵'),
    ('EFL', 'eng.league_cup',  '카라바오컵'),
]

def fetch(url):
    req = urllib.request.Request(url, headers=H)
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

def get_stat(player, category, stat_name, default=0):
    """선수 statistics에서 특정 카테고리/스탯 값 추출"""
    splits = player.get('statistics', {}).get('splits', {})
    for cat in splits.get('categories', []):
        if cat.get('name') == category:
            for s in cat.get('stats', []):
                if s.get('name') == stat_name:
                    v = s.get('value', default)
                    return int(v) if isinstance(v, float) and v == int(v) else v
    return default

def scrape():
    print(f"ESPN 스크래핑 시작 - {datetime.utcnow().isoformat()}")

    # 선수별 대회별 스탯 누적
    player_map = {}  # displayName → 통합 데이터

    for comp_code, league_slug, comp_name in COMPETITIONS:
        url = f'https://site.api.espn.com/apis/site/v2/sports/soccer/{league_slug}/teams/359/roster'
        try:
            data = fetch(url)
            athletes = data.get('athletes', [])
            print(f"  {comp_name}: {len(athletes)}명")

            for p in athletes:
                name = p.get('displayName', '')
                if not name:
                    continue

                stats = p.get('statistics', {})
                if not stats:
                    continue  # 해당 대회 출전 없음

                if name not in player_map:
                    pos = p.get('position', {})
                    birth = p.get('dateOfBirth', '')
                    citizen = p.get('citizenshipCountry', {})
                    player_map[name] = {
                        'id': p.get('id'),
                        'name': name,
                        'shortName': p.get('shortName', name),
                        'position': pos.get('abbreviation', ''),
                        'positionName': pos.get('name', ''),
                        'nationality': (p.get('citizenship') or citizen.get('displayName') or p.get('birthPlace',{}).get('country','') or ''),
                        'nationalityCode': citizen.get('abbreviation', ''),
                        'age': p.get('age'),
                        'dateOfBirth': birth,
                        'jersey': p.get('jersey', ''),
                        # 대회별 스탯
                        'competitions': {},
                        # 합산 스탯 (초기화)
                        'goals': 0, 'assists': 0,
                        'shotsOnTarget': 0, 'totalShots': 0,
                        'foulsCommitted': 0, 'foulsDrawn': 0,
                        'yellowCards': 0, 'redCards': 0,
                        'saves': 0, 'goalsConceded': 0,
                        'appearances': 0,
                    }

                # 대회별 스탯 저장
                comp_stats = {
                    'goals':         get_stat(p, 'offensive', 'totalGoals'),
                    'assists':       get_stat(p, 'offensive', 'goalAssists'),
                    'shotsOnTarget': get_stat(p, 'offensive', 'shotsOnTarget'),
                    'totalShots':    get_stat(p, 'offensive', 'totalShots'),
                    'foulsCommitted':get_stat(p, 'general',  'foulsCommitted'),
                    'foulsDrawn':    get_stat(p, 'general',  'foulsSuffered'),
                    'yellowCards':   get_stat(p, 'general',  'yellowCards'),
                    'redCards':      get_stat(p, 'general',  'redCards'),
                    'saves':         get_stat(p, 'goalKeeping', 'saves'),
                    'goalsConceded': get_stat(p, 'goalKeeping', 'goalsConceded'),
                }
                player_map[name]['competitions'][comp_code] = {
                    'name': comp_name, **comp_stats
                }

                # 합산
                for key in ['goals','assists','shotsOnTarget','totalShots',
                            'foulsCommitted','foulsDrawn','yellowCards','redCards',
                            'saves','goalsConceded']:
                    player_map[name][key] += comp_stats[key]

                # 출전 경기 수 (스탯이 있으면 1경기 이상)
                has_stats = any(v > 0 for v in comp_stats.values())
                if has_stats:
                    player_map[name]['appearances'] += 1

        except Exception as e:
            print(f"  ❌ {comp_name} 실패: {e}")

    # 출전 기록 있는 선수만
    players = [p for p in player_map.values() if p['appearances'] > 0 or
               any(any(v > 0 for v in c.values() if isinstance(v, (int, float)))
                   for c in p['competitions'].values())]

    # 포지션 순 정렬
    pos_order = {'G': 0, 'GK': 0, 'D': 1, 'CB': 1, 'LB': 1, 'RB': 1,
                 'M': 2, 'CM': 2, 'AM': 2, 'DM': 2, 'F': 3, 'FW': 3, 'LW': 3, 'RW': 3}
    players.sort(key=lambda p: pos_order.get(p['position'], 5))

    output = {
        'updated_at': datetime.utcnow().isoformat(),
        'source': 'ESPN API',
        'competitions': [c[2] for c in COMPETITIONS],
        'players': players
    }

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"✅ 완료! {len(players)}명 → {OUTPUT_PATH}")
    if players:
        p = players[0]
        print(f"   샘플: {p['name']} - 골:{p['goals']} 어시:{p['assists']} 옐로:{p['yellowCards']}")
        print(f"   대회별: {list(p['competitions'].keys())}")

if __name__ == '__main__':
    scrape()
