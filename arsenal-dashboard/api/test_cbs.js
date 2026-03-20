export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const urls = [
    'https://www.cbssports.com/rss/headlines/soccer/',
    'https://www.cbssports.com/rss/headlines/',
    'https://www.cbssports.com/rss/headlines/soccer/epl/',
    'https://www.cbssports.com/rss/headlines/soccer/champions-league/',
  ];
  const results = await Promise.all(urls.map(async url => {
    try {
      const r = await fetch(url, {
        headers: {'User-Agent':'Mozilla/5.0'},
        signal: AbortSignal.timeout(6000),
      });
      const text = r.ok ? await r.text() : '';
      const titles = [...text.matchAll(/<title><!\[CDATA\[([^\]]+)\]\]><\/title>|<title>([^<]+)<\/title>/g)]
        .slice(1,6).map(m=>(m[1]||m[2]||'').trim());
      const arsenalCount = titles.filter(t=>/arsenal/i.test(t)).length;
      return {url: url.split('/').slice(-3).join('/'), status: r.status, totalTitles: titles.length, arsenalCount, titles: titles.slice(0,3)};
    } catch(e) {
      return {url, err: e.message};
    }
  }));
  return res.json(results);
}
