import requests, json

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Referer': 'https://www.fotmob.com/',
}

# Raya PL 스탯 (entryId=0-0)
r = requests.get('https://www.fotmob.com/api/playerStats?playerId=562727&seasonStat=0-0', headers=HEADERS, timeout=15)
print(f"Status: {r.status_code}")

if r.ok:
    j = r.json()
    print("Keys:", list(j.keys()))
    
    # topStatCard
    top = j.get('topStatCard', {})
    print("\ntopStatCard items:")
    for item in top.get('items', []):
        print(f"  {item.get('localizedTitleId') or item.get('title')}: {item.get('statValue')}")
    
    # statsSection 첫번째 그룹
    stats = j.get('statsSection', {})
    print("\nstatsSection groups:")
    for group in stats.get('items', []):
        print(f"  Group:")
        for stat in group.get('items', [])[:3]:
            print(f"    {stat.get('localizedTitleId')}: {stat.get('statValue')}")
else:
    print("Error:", r.text[:200])
