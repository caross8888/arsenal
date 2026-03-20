export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const urls = [
    {name:'Sky RSS 12040', url:'https://www.skysports.com/rss/12040'},
    {name:'Sky RSS football', url:'https://www.skysports.com/rss/0,20514,11661,00.xml'},
    {name:'RSSHub Sky Arsenal', url:'https://rsshub.app/skysports/football/arsenal'},
    {name:'RSSHub Sky Football', url:'https://rsshub.app/skysports/news/football'},
    {name:'Sky Sports API', url:'https://www.skysports.com/feeds/article/news/sport/football/team/arsenal/'},
  ];
  const results = await Promise.all(urls.map(async ({name, url}) => {
    try {
      const r = await fetch(url, {
        headers: {'User-Agent':'Mozilla/5.0 Arsenal-Dashboard/1.0'},
        signal: AbortSignal.timeout(8000),
      });
      const text = r.ok ? await r.text() : '';
      const items = (text.match(/<item>/g)||[]).length;
      return {name, status: r.status, ok: r.ok, items};
    } catch(e) {
      return {name, err: e.message};
    }
  }));
  return res.json(results);
}
