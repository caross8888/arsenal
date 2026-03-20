export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const urls = [
    {name:'Guardian', url:'https://www.theguardian.com/football/arsenal/rss'},
    {name:'CBS Sports', url:'https://www.cbssports.com/rss/headlines/soccer/'},
  ];
  const results = await Promise.all(urls.map(async ({name, url}) => {
    try {
      const r = await fetch(url, {
        headers: {'User-Agent':'Mozilla/5.0 Arsenal-Dashboard/1.0'},
        signal: AbortSignal.timeout(6000),
      });
      const text = await r.text();
      // 첫번째 item 원본 300자
      const firstItem = text.match(/<item>([\s\S]*?)<\/item>/)?.[1] || '';
      return {name, raw: firstItem.substring(0, 400)};
    } catch(e) {
      return {name, err: e.message};
    }
  }));
  return res.json(results);
}
