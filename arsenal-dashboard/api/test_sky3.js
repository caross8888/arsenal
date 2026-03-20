export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Sky Sports 다양한 피드 번호 시도
  const feeds = [
    {name:'Sky PL', url:'https://www.skysports.com/rss/12863'},       // Premier League
    {name:'Sky Football News', url:'https://www.skysports.com/rss/12040'}, // 위에서 테스트
    {name:'Sky Arsenal', url:'https://www.skysports.com/rss/arsenal'},
    {name:'Sky Football', url:'https://www.skysports.com/rss/football'},
    {name:'Sky Soccer', url:'https://www.skysports.com/feeds/latest/soccer'},
    {name:'Sky EPL', url:'https://www.skysports.com/feeds/latest/football/teams/arsenal'},
  ];
  const results = await Promise.all(feeds.map(async ({name, url}) => {
    try {
      const r = await fetch(url, {
        headers: {'User-Agent':'Mozilla/5.0 Arsenal-Dashboard/1.0'},
        signal: AbortSignal.timeout(6000),
      });
      const text = r.ok ? await r.text() : '';
      const titles = [...text.matchAll(/<title><!\[CDATA\[([^\]]+)\]\]><\/title>|<title>([^<]+)<\/title>/g)]
        .slice(1,4).map(m=>(m[1]||m[2]||'').trim());
      return {name, status: r.status, ok: r.ok, titles};
    } catch(e) {
      return {name, err: e.message};
    }
  }));
  return res.json(results);
}
