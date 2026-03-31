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

data = json.load(open(HISTORY_JSON))
updated = 0

for item in data:
    url = item.get('image', '').strip()
    if not url or url.startswith('/'):
        continue  # 이미 로컬이거나 비어있으면 스킵

    ext = url.split('?')[0].split('.')[-1].lower()
    if ext not in ('jpg','jpeg','png','webp','gif','svg'):
        ext = 'jpg'
    filename = f"{item['id']}.{ext}"
    dest = OUTPUT_DIR / filename

    if dest.exists():
        print(f'  ✅ {filename} (already exists)')
        item['image'] = f'/data/history_images/{filename}'
        continue

    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code == 200 and len(r.content) > 500:
            dest.write_bytes(r.content)
            item['image'] = f'/data/history_images/{filename}'
            print(f'  📥 {filename}')
            updated += 1
        else:
            print(f'  ❌ {item["id"]}: HTTP {r.status_code}')
    except Exception as e:
        print(f'  ❌ {item["id"]}: {e}')
    time.sleep(0.5)

# 업데이트된 경로로 JSON 저장
json.dump(data, open(HISTORY_JSON, 'w'), ensure_ascii=False, indent=2)
print(f'\n✅ 완료! {updated}개 다운로드')
