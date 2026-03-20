export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const urls = [
    {name:'Guardian', url:'https://www.theguardian.com/football/arsenal/rss'},
    {name:'CBS Sports', url:'https://www.cbssports.com/rss/headlines/soccer/'},
    {name:'ESPN', url:'https://www.espn.com/espn/rss/soccer/news'},
  ];
  const results = await Promise.all(urls.map(async ({name, url}) => {
    try {
      const r = await fetch(url, {
        headers: {'User-Agent':'Mozilla/5.0 Arsenal-Dashboard/1.0'},
        signal: AbortSignal.timeout(6000),
      });
      const text = await r.text();
      const firstItem = text.match(/<item>([\s\S]*?)<\/item>/)?.[1] || '';
      // 이미지 관련 태그만 추출
      const imgTags = firstItem.match(/(media:[^\n<]{0,200}|enclosure[^\n<]{0,200}|<img[^\n<]{0,200})/g) || [];
      return {name, imgTags: imgTags.slice(0,5)};
    } catch(e) {
      return {name, err: e.message};
    }
  }));
  return res.json(results);
}
