#!/usr/bin/env python3
"""Collect compact national-shirt metadata, using cached public HTML and bounded concurrency.
Run from the repository root; --render regenerates the renderer palette and the opponent reference table.
"""
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from urllib.request import Request, urlopen
from pathlib import Path
import argparse, hashlib, json, re, subprocess, tempfile

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'docs/career-mode/data/national-teams.json'
REPLAY = ROOT / 'arsenal-dashboard/public/career/match-playback.js'
CACHE = Path(tempfile.gettempdir()) / 'career-national-kit-cache'
BASE = 'https://www.footballkitarchive.com'
COLOURS = {'white':'#eceef0','off-white':'#e9e6da','black':'#20232a','red':'#d72e3b','blue':'#246bb3','navy':'#203651','sky blue':'#88bee4','light blue':'#88bee4','yellow':'#e8d15c','gold':'#d2ad44','green':'#29865c','dark green':'#206047','light green':'#8ccf87','orange':'#ed863d','purple':'#8462a4','pink':'#e9a0bd','claret':'#822d43','maroon':'#822d43','grey':'#999fa6','gray':'#999fa6','teal':'#378d92','turquoise':'#69c6c9','brown':'#815539','cream':'#e9e6da'}

class Page(HTMLParser):
 def __init__(self):
  super().__init__(); self.meta={}; self.links=[]; self.text=[]; self.hidden=0
 def handle_starttag(self,tag,attrs):
  d=dict(attrs)
  if tag in ('script','style'): self.hidden+=1
  if tag=='meta': self.meta[d.get('property',d.get('name',''))]=d.get('content','')
  if tag=='a': self.links.append(d.get('href',''))
 def handle_endtag(self,tag):
  if tag in ('script','style'): self.hidden=max(0,self.hidden-1)
 def handle_data(self,data):
  if not self.hidden and data.strip(): self.text.append(data.strip())

def page(url):
 CACHE.mkdir(exist_ok=True)
 path=CACHE/(hashlib.sha256(url.encode()).hexdigest()+'.html')
 if path.exists(): raw=path.read_text()
 else:
  with urlopen(Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=18) as response: raw=response.read().decode()
  path.write_text(raw)
 p=Page();p.feed(raw);return p

def collect(team):
 errors=[]; candidates={'home':[], 'away':[]}
 for slug in team['slugs']:
  try:
   p=page(BASE+'/'+slug+'-kits/')
   for link in set(p.links):
    m=re.fullmatch('/'+'(?:'+'|'.join(re.escape(v) for v in team['slugs'])+')'+r'-(20\d\d)(?:-(\d\d))?-(home|away)-kit(?:-\d+)?/',link)
    if m and int(m[1])<=2026:
     candidates[m[3]].append((int(m[1]),bool(m[2]),BASE+link))
   if all(candidates.values()):break
  except Exception as e:errors.append(type(e).__name__+': '+slug)
 for kind in ('home','away'):
  if team.get('kits',{}).get(kind,{}).get('verified'):continue
  for year,split,url in sorted(candidates[kind],reverse=True)[:5]:
   try:
    p=page(url);title=p.meta.get('og:title','');description=p.meta.get('og:description','')
    if not re.search(r'\b'+kind+r' Kit\b',title,re.I) or re.search(r'concept|fantasy',title,re.I):continue
    text=' '.join(p.text);m=re.search(r'\bColors\s+(.+?)\s+Brand\b',text)
    colours=m[1] if m else '';primary=colours.split('/')[0].strip().lower();body=COLOURS.get(primary)
    if not body:errors.append(kind+': unknown colour '+colours);continue
    team.setdefault('kits',{})[kind]={'body':body,'season':str(year)+('-'+str((year+1)%100).zfill(2) if split else ''),'colours':colours,'source':url,'title':title,'verified':True,'paletteMethod':'source-primary-colour','checked':'2026-10-14'}
    break
   except Exception as e:errors.append(kind+': '+type(e).__name__)
 if errors:team['collectionNotes']=errors
 else:team.pop('collectionNotes',None)
 return team

def sample_photo(job):
 # Optional offline palette refinement; Pillow is only needed for --sample-photos.
 from PIL import Image
 team,kind=job;kit=team['kits'][kind]
 url=page(kit['source']).meta['og:image']
 path=CACHE/(hashlib.sha256(url.encode()).hexdigest()+'.image')
 if not path.exists():
  with urlopen(Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=18) as response:path.write_bytes(response.read())
 image=Image.open(path).convert('RGB');w,h=image.size
 crop=image.crop((int(w*.35),int(h*.38),int(w*.65),int(h*.68))).resize((80,80))
 quantized=crop.quantize(colors=8)
 dominant=max(quantized.getcolors(),key=lambda row:row[0])[1]
 pixels=[rgb for rgb,index in zip(crop.get_flattened_data(),quantized.get_flattened_data()) if index==dominant]
 colour='#'+''.join(format(round(sum(p[i] for p in pixels)/len(pixels)),'02x') for i in range(3))
 kit.update(body=colour,paletteMethod='photo-primary-cluster',imageSource=url)
 return team['code'],kind,colour

def render(data):
 kits={t['code']:{k:{'body':v['body']} for k,v in t['kits'].items()} for t in data['teams']}
 if any(set(k)!=set(('home','away')) for k in kits.values()):raise ValueError('Every team needs home and away data before rendering')
 block='// BEGIN GENERATED NATIONAL KITS — scripts/collect_national_kits.py --render\nconst NATIONAL_KITS='+json.dumps(kits,ensure_ascii=False,separators=(',',':'))+';\n// END GENERATED NATIONAL KITS'
 s=REPLAY.read_text()
 if '// BEGIN GENERATED NATIONAL KITS' in s:
  s=re.sub(r'// BEGIN GENERATED NATIONAL KITS.*?// END GENERATED NATIONAL KITS',lambda _:block,s,flags=re.S)
 else:
  start=s.index('// 2026 shirt colours');end=s.index('const hexRGB=',start)
  s=s[:start]+block+'\n'+s[end:]
 s=s.replace("const record=code=>NATIONAL_KITS[code]||{home:{body:OTHER_HOME[code]||'#e8c04a'},away:{body:OTHER_HOME[code]==='#eef0f2'?'#203551':'#f0eff3'}};", "const record=code=>NATIONAL_KITS[code]||{home:{body:'#e8c04a'},away:{body:'#f0eff3'}};")
 REPLAY.write_text(s)
 powers=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {NATIONAL_POWER} from './arsenal-dashboard/api/_career_international.js';console.log(JSON.stringify(NATIONAL_POWER))"],cwd=ROOT))
 if set(kits)!=set(powers):raise ValueError('Kit countries must match the supported national strength table')
 lines=['# 대표팀 상대국 자료', '',
  '현재 게임에서 사용하는 73개 팀(선택 국가 15개·상대 전용 58개)의 자료다. 전력은 `api/_career_international.js`의 `NATIONAL_POWER`를 참조하는 게임용 수치이며 공식 FIFA 순위나 포인트가 아니다.', '',
  '상대의 강함에 따라 승리 확률과 대진 진출을 계산한다. 동일 전력은 50%, 전력차 10은 약 72%, 전력차 20은 약 86%다. 내 팀의 기존 시즌 결과·승부차기 처리는 별도의 시뮬레이션 규칙을 따른다.', '',
  '유니폼은 Football Kit Archive에서 확인한 최신 검색 가능 시즌의 홈·어웨이다(확인일 2026-10-14). 사진의 몸통 중심부 대표색을 단색 바둑알로 정리하며, 제조사 공식 색상 코드가 아니다. 연령별 대표도 같은 킷을 사용한다. 원본 색 설명·시즌·사진·검증 방식은 `data/national-teams.json`에 저장한다.', '',
  '대회 구분: 월드컵·올림픽은 게임의 세계 상대 목록, 유로·네이션스리그는 유럽 목록, 아시안컵은 AFC 목록, 아시안게임은 호주를 제외한 아시아 목록이다. 코파·골드컵·아프리카 네이션스컵도 해당 게임 목록을 사용한다. 이는 현재 게임의 간소화된 참가국 목록이며 FIFA 전체 회원국·실제 대회 출전 명단은 아니다. 네이션스리그는 상대 목록만 지원하며 별도 시즌 이벤트는 아직 생성하지 않는다.', '',
  '양 팀 홈을 우선하고 비슷하면 상대 어웨이, 이후 우리 어웨이를 검토한다. 숫자는 밝은 바둑알에 검정, 어두운 바둑알에 흰색이다. 경기 중에 외부 사이트를 호출하지 않는다.', '',
  '| 팀 | 연맹 | 전력 | 홈 시즌·색 | 어웨이 시즌·색 |', '|---|---|---:|---|---|']
 for t in sorted(data['teams'],key=lambda t:(t['confederation'],-powers[t['code']],t['code'])):
  cells=[]
  for kind in ('home','away'):
   kit=t['kits'][kind];cells.append('['+kit['season']+' · '+kit['body']+']('+kit['source']+')')
  lines.append('| '+t['name']+' (`'+t['code']+'`) | '+t['confederation']+' | '+str(powers[t['code']])+' | '+' | '.join(cells)+' |')
 lines+=['', '재수집(누락분만): `python3 scripts/collect_national_kits.py`', '', '사진 색상 보정(선택, Pillow 필요): `python3 scripts/collect_national_kits.py --sample-photos`', '', '경기용 팔레트·이 표 재생성: `python3 scripts/collect_national_kits.py --render`', '', '검증: `node scripts/test_career_national_kits.mjs`']
 (ROOT/'docs/career-mode/national-opponents.md').write_text('\n'.join(lines)+'\n')

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--render',action='store_true');parser.add_argument('--sample-photos',action='store_true',help='Refine new primary-colour approximations from shirt photos (requires Pillow)');args=parser.parse_args()
 data=json.loads(DATA.read_text())
 if args.render:render(data)
 elif args.sample_photos:
  jobs=[(t,k) for t in data['teams'] for k,v in t['kits'].items() if v.get('verified') and v.get('paletteMethod')=='source-primary-colour']
  rows=list(ThreadPoolExecutor(max_workers=6).map(sample_photo,jobs))
  DATA.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
  print(json.dumps({'photoPalettes':len(rows)}))
 else:
  pending=[t for t in data['teams'] if not all(t.get('kits',{}).get(k,{}).get('verified') for k in ('home','away'))]
  updated={t['code']:t for t in ThreadPoolExecutor(max_workers=6).map(collect,pending)}
  data['teams']=[updated.get(t['code'],t) for t in data['teams']]
  DATA.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
  missing=[t['code']+':'+k for t in data['teams'] for k in ('home','away') if not t.get('kits',{}).get(k,{}).get('verified')]
  print(json.dumps({'teams':len(data['teams']),'collected':len(pending),'verifiedKits':sum(bool(v.get('verified')) for t in data['teams'] for v in t.get('kits',{}).values()),'missing':missing}))
