import urllib.request, json

H = {'User-Agent': 'Mozilla/5.0 Chrome/122.0.0.0 Safari/537.36'}

# PL 로스터에서 사카 전체 스탯 구조 출력
req = urllib.request.Request(
    'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/359/roster',
    headers=H
)
with urllib.request.urlopen(req, timeout=10) as r:
    j = json.loads(r.read())

# 사카 찾기
saka = next((p for p in j['athletes'] if 'Saka' in p.get('displayName','')), None)
if saka:
    print("=== Saka 전체 스탯 카테고리 ===")
    splits = saka.get('statistics',{}).get('splits',{})
    for cat in splits.get('categories',[]):
        print(f"\n[{cat['name']}]")
        for s in cat.get('stats',[]):
            print(f"  {s['name']}: {s['value']}")
    
    print("\n=== 국적 필드 ===")
    for k,v in saka.items():
        if any(x in k.lower() for x in ['country','nation','citizen','birth','flag']):
            print(f"  {k}: {v}")
else:
    print("Saka not found")
    print("Players:", [p['displayName'] for p in j['athletes'][:5]])
