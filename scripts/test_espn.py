import urllib.request, json

H = {'User-Agent': 'Mozilla/5.0 Chrome/122.0.0.0 Safari/537.36'}

# PL 로스터에서 첫 선수 statistics 상세 확인
req = urllib.request.Request(
    'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/359/roster',
    headers=H
)
with urllib.request.urlopen(req, timeout=10) as r:
    j = json.loads(r.read())

athletes = j.get('athletes', [])

# 선수별 statistics 내용 출력
for p in athletes[:5]:
    name = p.get('displayName')
    pos = p.get('position', {}).get('abbreviation')
    stats = p.get('statistics', {})
    print(f"\n{name} ({pos})")
    if stats:
        print(f"  stats keys: {list(stats.keys())}")
        # categories 안에 실제 스탯 있음
        for cat in stats.get('splits', {}).get('categories', [])[:3]:
            print(f"  category: {cat.get('name')}")
            for s in cat.get('stats', [])[:5]:
                print(f"    {s.get('name')}: {s.get('value')}")
    else:
        print("  statistics 없음")
