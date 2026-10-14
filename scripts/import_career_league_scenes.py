#!/usr/bin/env python3
"""Convert the documented league art originals to runtime WebP assets, preserving their pixels.
Requires Pillow. Originals remain in --source-dir; update league-scenes.js URL versions when replacing art.
"""
from pathlib import Path
from PIL import Image
import argparse, json
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-dir',type=Path,default=Path('/workspace/generated_images'))
parser.add_argument('--nation',help='Import one country code, e.g. ENG; default imports all 15')
args=parser.parse_args()
rows=json.loads((ROOT/'docs/career-mode/data/league-backgrounds.json').read_text())['leagues']
if args.nation:
 rows=[r for r in rows if r['id']==args.nation.upper()]
 if not rows:parser.error('Unknown league country code')
target=ROOT/'arsenal-dashboard/public/img/career-leagues';target.mkdir(exist_ok=True)
for row in rows:
 with Image.open(args.source_dir/row['original']) as image:
  if image.height<=image.width:raise ValueError(row['id']+': expected a portrait background')
  image.convert('RGB').save(target/(row['id'].lower()+'.webp'),quality=88,method=6)
print('Imported',len(rows),'league backgrounds')
