import urllib.request, json

H = {'User-Agent': 'Mozilla/5.0 Chrome/122.0.0.0 Safari/537.36'}

# ESPN PL + UCL 선수 스탯 구조 확인
tests = [
    ('PL roster', 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/359/roster'),
    ('UCL roster', 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/teams/359/roster'),
    ('PL stats', 'https://site.web.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/359/statistics'),
    ('UCL stats', 'https://site.web.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/teams/359/statistics'),
]

for name, url in tests:
    try:
        req = urllib.request.Request(url, headers=H)
        with urllib.request.urlopen(req, timeout=10) as r:
            j = json.loads(r.read())
        athletes = j.get('athletes', [])
        print(f"OK {name}: {len(athletes)}명")
        if athletes:
            p = athletes[0]
            print(f"   키: {list(p.keys())}")
            print(f"   이름: {p.get('displayName')}, 포지션: {p.get('position',{}).get('abbreviation')}")
            stats = p.get('statistics') or p.get('stats')
            if stats:
                print(f"   스탯: {str(stats)[:200]}")
    except Exception as e:
        print(f"FAIL {name}: {e}")
