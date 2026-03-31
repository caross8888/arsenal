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

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Referer': 'https://www.google.com/'
}

data = json.load(open(HISTORY_JSON, encoding='utf-8'))

# 트로피 항목 — 이미 로컬 파일 있으면 경로만 업데이트
TROPHY_IDS = [
    'trophy_pl', 'trophy_first_division', 'trophy_facup',
    'trophy_leaguecup', 'trophy_cwc', 'trophy_fairs', 'trophy_communityshield'
]

print('=== 트로피 이미지 로컬 파일 확인 ===')
for item in data:
    if item['id'] not in TROPHY_IDS:
        continue
    # jpg/png/webp 순으로 있는지 확인
    found = None
    for ext in ('jpg', 'jpeg', 'png', 'webp'):
        candidate = OUTPUT_DIR / f"{item['id']}.{ext}"
        if candidate.exists():
            found = candidate.name
            break
    if found:
        item['image'] = f'/data/history_images/{found}'
        print(f'  OK {item["id"]} -> {found}')
    else:
        print(f'  MISSING {item["id"]} -- history_images/{item["id"]}.jpg 에 수동으로 넣어주세요')

updated = 0

print('\n=== 일반 이미지 다운로드 ===')
for item in data:
    if item['id'] in TROPHY_IDS:
        continue  # 트로피는 위에서 처리

    url = item.get('image', '').strip()
    if not url or url.startswith('/'):
        continue

    ext = url.split('?')[0].split('.')[-1].lower()
    if ext not in ('jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'):
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
