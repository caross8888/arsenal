#!/usr/bin/env python3
"""
history.json의 image URL을 읽어 history_images/ 폴더에 저장하는 스크립트
실행: python scripts/download_history_images.py
"""
import json, requests, os, time
from pathlib import Path

HISTORY_JSON = Path('arsenal-dashboard/public/data/history.json')
OUTPUT_DIR   = Path('arsenal-dashboard/public/data/history_images')
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {'User-Agent': 'Mozilla/5.0 Arsenal-Dashboard/1.0'}

# 트로피 이미지 — 수동으로 넣어야 할 파일 목록
# 구글에서 각 트로피 검색 후 아래 경로에 저장해주세요:
TROPHY_FILES = {
    'trophy_league':         'trophy_league.jpg',         # Premier League / First Division
    'trophy_facup':          'trophy_facup.jpg',          # FA Cup
    'trophy_leaguecup':      'trophy_leaguecup.jpg',      # League Cup
    'trophy_communityshield':'trophy_communityshield.jpg', # Community Shield
    'trophy_cwc':            'trophy_cwc.jpg',            # Cup Winners' Cup
    'trophy_fairs':          'trophy_fairs.jpg',          # Fairs Cup
}

data = json.load(open(HISTORY_JSON, encoding='utf-8'))

# 트로피: 로컬 파일 있으면 경로 업데이트
print('=== 트로피 이미지 확인 ===')
for item in data:
    if item['id'] not in TROPHY_FILES:
        continue
    fname = TROPHY_FILES[item['id']]
    dest = OUTPUT_DIR / fname
    if dest.exists():
        item['image'] = f'/data/history_images/{fname}'
        print(f'  OK  {item["id"]} -> {fname}')
    else:
        print(f'  MISS {item["id"]} -- history_images/{fname} 에 수동으로 넣어주세요')

# 일반 항목: URL 있으면 다운로드
updated = 0
print('\n=== 일반 이미지 다운로드 ===')
for item in data:
    if item['id'] in TROPHY_FILES:
        continue
    url = item.get('image', '').strip()
    if not url or url.startswith('/'):
        continue

    ext = url.split('?')[0].split('.')[-1].lower()
    if ext not in ('jpg','jpeg','png','webp','gif','svg'):
        ext = 'jpg'
    filename = f"{item['id']}.{ext}"
    dest = OUTPUT_DIR / filename

    if dest.exists():
        print(f'  EXISTS {filename}')
        item['image'] = f'/data/history_images/{filename}'
        continue

    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code == 200 and len(r.content) > 500:
            dest.write_bytes(r.content)
            item['image'] = f'/data/history_images/{filename}'
            print(f'  SAVED {filename}')
            updated += 1
        else:
            print(f'  FAIL {item["id"]}: HTTP {r.status_code}')
    except Exception as e:
        print(f'  FAIL {item["id"]}: {e}')
    time.sleep(0.5)

json.dump(data, open(HISTORY_JSON, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print(f'\n완료! {updated}개 다운로드')
