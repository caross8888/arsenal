#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Arsenal Legends Fotmob Photo Scraper
- scrape_fotmob_local.py와 동일한 방식 (HTML __NEXT_DATA__ 파싱)
- 본인 PC에서 직접 실행

Usage:
  pip install requests
  python scripts/scrape_legends_fotmob.py
"""

import requests
import json
import re
import time
from pathlib import Path

BASE_DIR   = Path(__file__).parent.parent
LEGENDS_JSON = BASE_DIR / 'arsenal-dashboard/public/data/legends.json'
OUT_DIR    = BASE_DIR / 'arsenal-dashboard/public/data/history_images/legends'

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
    'Referer': 'https://www.fotmob.com/',
}

IMG_URL = 'https://images.fotmob.com/image_resources/playerimages/{}.png'

# ── 레전드별 Fotmob ID + slug (직접 확인된 값) ─────────────────
# fotmob.com 에서 선수 검색 후 URL에서 확인:
# https://www.fotmob.com/players/<ID>/<slug>
LEGEND_IDS = {
    'Thierry Henry':     (9473,   'thierry-henry'),
    'Dennis Bergkamp':   (2027,   'dennis-bergkamp'),
    'Patrick Vieira':    (7638,   'patrick-vieira'),
    'Robert Pires':      (7571,   'robert-pires'),
    'Freddie Ljungberg': (7536,   'freddie-ljungberg'),
    'Sylvain Wiltord':   (7632,   'sylvain-wiltord'),
    'Nicolas Anelka':    (4267,   'nicolas-anelka'),
    'Marc Overmars':     (3033,   'marc-overmars'),
    'Emmanuel Petit':    (3571,   'emmanuel-petit'),
    'Kanu':              (3340,   'nwankwo-kanu'),
    'Ashley Cole':       (600,    'ashley-cole'),
    'Sol Campbell':      (538,    'sol-campbell'),
    'Ray Parlour':       (7555,   'ray-parlour'),
    'Martin Keown':      (7530,   'martin-keown'),
    'Lee Dixon':         (7520,   'lee-dixon'),
    'Nigel Winterburn':  (7581,   'nigel-winterburn'),
    'David Seaman':      (7564,   'david-seaman'),
    'Paul Merson':       (7540,   'paul-merson'),
    'Ian Wright':        (7591,   'ian-wright'),
    'Tony Adams':        (7511,   'tony-adams'),
    'Alan Smith':        (7568,   'alan-smith'),
}
# 위에 없는 선수들은 search로 자동 탐색

def get_next_data(url):
    """페이지 HTML에서 __NEXT_DATA__ JSON 추출"""
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code != 200:
            return None
        m = re.search(
            r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
            r.text, re.DOTALL
        )
        if m:
            return json.loads(m.group(1))
    except Exception as e:
        print(f'  error: {e}')
    return None

def search_player_id(name):
    """Fotmob 검색 페이지에서 선수 ID 탐색"""
    slug = name.lower().replace(' ', '-').replace("'", '')
    url  = f'https://www.fotmob.com/search?term={requests.utils.quote(name)}'
    data = get_next_data(url)
    if not data:
        return None, None
    try:
        props  = data['props']['pageProps']
        # searchResult 경로 시도
        for path in [
            ['searchResult', 'players', 'hits'],
            ['initialProps', 'searchResult', 'players', 'hits'],
        ]:
            node = props
            for k in path:
                node = node[k]
            for hit in node:
                p    = hit.get('player', hit)
                pid  = p.get('id')
                pslg = p.get('urlStr') or p.get('slug') or slug
                if pid:
                    return int(pid), pslg
    except (KeyError, TypeError):
        pass
    return None, None

def download_photo(player_id, dest_path):
    """Fotmob 선수 이미지 다운로드"""
    url = IMG_URL.format(player_id)
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        if r.status_code == 200 and len(r.content) > 3000:
            dest_path.write_bytes(r.content)
            return True
    except Exception:
        pass
    return False

def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    with open(LEGENDS_JSON, encoding='utf-8') as f:
        legends = json.load(f)

    saved = 0
    for lgd in legends:
        rank = lgd['rank']
        name = lgd['name']

        # 이미 저장된 경우 스킵
        if lgd.get('photo', '').startswith('/data/'):
            local = BASE_DIR / 'arsenal-dashboard/public' / lgd['photo'].lstrip('/')
            if local.exists() and local.stat().st_size > 3000:
                print(f'[{rank:>2}] {name} - skip')
                saved += 1
                continue

        print(f'[{rank:>2}] {name} ...', end=' ', flush=True)

        # ID 확보
        if name in LEGEND_IDS:
            player_id, slug = LEGEND_IDS[name]
        else:
            player_id, slug = search_player_id(name)
            time.sleep(1)

        if not player_id:
            print('ID 못찾음 - SKIP')
            continue

        # 저장 경로
        safe  = re.sub(r'[^a-z0-9]', '_', name.lower())
        fname = f'legend_{rank:02d}_{safe}.png'
        fpath = OUT_DIR / fname

        ok = download_photo(player_id, fpath)
        if ok:
            lgd['photo']     = f'/data/history_images/legends/{fname}'
            lgd['fotmob_id'] = player_id
            saved += 1
            print(f'OK ({fpath.stat().st_size // 1024}KB)')
        else:
            print(f'사진 없음 (id={player_id})')

        time.sleep(1.5)

    with open(LEGENDS_JSON, 'w', encoding='utf-8') as f:
        json.dump(legends, f, ensure_ascii=False, indent=2)

    print(f'\n완료: {saved}/{len(legends)} 저장됨')
    print('git add + commit + push 하시면 됩니다.')

if __name__ == '__main__':
    main()
