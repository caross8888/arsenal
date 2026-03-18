import urllib.request, json

H = {'User-Agent': 'Mozilla/5.0 Chrome/122.0.0.0 Safari/537.36'}

tests = [
    ('Fotmob PL stats', 'https://www.fotmob.com/api/leagueseasondeepstats?id=47&seasonId=23685&type=players&stat=goals&teamId=9825'),
    ('Fotmob UCL stats', 'https://www.fotmob.com/api/leagueseasondeepstats?id=42&seasonId=23799&type=players&stat=goals&teamId=9825'),
    ('Fotmob FA Cup', 'https://www.fotmob.com/api/leagueseasondeepstats?id=132&seasonId=23750&type=players&stat=goals&teamId=9825'),
    ('ESPN PL roster', 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/359/roster'),
    ('ESPN UCL roster', 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/teams/359/roster'),
]

for name, url in tests:
    try:
        req = urllib.request.Request(url, headers=H)
        with urllib.request.urlopen(req, timeout=10) as r:
            j = json.loads(r.read())
            print(f"OK {name}: {list(j.keys())[:4]}")
    except Exception as e:
        print(f"FAIL {name}: {e}")
