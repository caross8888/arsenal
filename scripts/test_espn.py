import urllib.request, json

H = {'User-Agent': 'Mozilla/5.0 Chrome/122.0.0.0 Safari/537.36'}

tests = [
    ('PL roster', 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/359/roster'),
    ('UCL roster', 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/teams/359/roster'),
    ('PL team stats', 'https://site.web.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/359/statistics'),
    ('UCL team stats', 'https://site.web.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/teams/359/statistics'),
]

for name, url in tests:
    try:
        req = urllib.request.Request(url, headers=H)
        with urllib.request.urlopen(req, timeout=10) as r:
            j = json.loads(r.read())
        athletes = j.get('athletes', [])
        print(f"OK {name}: {len(athletes)}명, keys={list(j.keys())[:4]}")
        if athletes:
            p = athletes[0]
            print(f"   선수: {p.get('displayName')}, pos: {p.get('position',{}).get('abbreviation')}")
            print(f"   선수키: {list(p.keys())}")
    except Exception as e:
        print(f"FAIL {name}: {e}")
