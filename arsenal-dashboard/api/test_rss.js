// 임시 RSS 테스트 엔드포인트
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const urls = [
    {name:'ESPN Soccer', url:'https://www.espn.com/espn/rss/soccer/news'},
    {name:'Fox Sports Soccer', url:'https://api.foxsports.com/v1/rss?partnerKey=zBaFxRyGKCfxBagJG9b8pqLyndmvo7UU&tag=soccer'},
    {name:'CBS Sports Soccer', url:'https://www.cbssports.com/rss/headlines/soccer/'},
    {name:'BBC Sport Football', url:'https://feeds.bbci.co.uk/sport/football/rss.xml'},
    {name:'Football Italia', url:'https://www.football-italia.net/rss.xml'},
    {name:'Arsenal.com', url:'https://www.arsenal.com/rss.xml'},
  ];
  const results = await Promise.all(urls.map(async ({name, url}) => {
    try {
      const r = await fetch(url, {
        headers: {'User-Agent':'Mozilla/5.0 Arsenal-Dashboard/1.0'},
        signal: AbortSignal.timeout(6000),
      });
      const text = r.ok ? await r.text() : '';
      const count = (text.match(/<item>/g)||[]).length;
      return {name, status: r.status, ok: r.ok, items: count};
    } catch(e) {
      return {name, err: e.message};
    }
  }));
  return res.json(results);
}
