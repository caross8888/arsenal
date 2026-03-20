export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const urls = [
    {name:'ESPN', url:'https://www.espn.com/espn/rss/soccer/news'},
    {name:'CBS Sports', url:'https://www.cbssports.com/rss/headlines/soccer/'},
    {name:'Guardian', url:'https://www.theguardian.com/football/arsenal/rss'},
    {name:'BBC', url:'https://feeds.bbci.co.uk/sport/football/rss.xml'},
  ];
  const results = await Promise.all(urls.map(async ({name, url}) => {
    try {
      const r = await fetch(url, {
        headers: {'User-Agent':'Mozilla/5.0 Arsenal-Dashboard/1.0'},
        signal: AbortSignal.timeout(6000),
      });
      const text = await r.text();
      // 첫번째 item의 이미지 관련 태그 추출
      const firstItem = text.match(/<item>([\s\S]*?)<\/item>/)?.[1] || '';
      const mediaContent = firstItem.match(/<media:content[^>]*url="([^"]+)"/)?.[1] || '';
      const mediaThumbnail = firstItem.match(/<media:thumbnail[^>]*url="([^"]+)"/)?.[1] || '';
      const enclosure = firstItem.match(/<enclosure[^>]*url="([^"]+)"/)?.[1] || '';
      const imgInDesc = firstItem.match(/<img[^>]*src="([^"]+)"/)?.[1] || '';
      const imgInContent = firstItem.match(/url="(https?:\/\/[^"]+\.(jpg|jpeg|png|webp)[^"]*)"/)?.[1] || '';
      return {name, mediaContent: mediaContent.substring(0,80), mediaThumbnail: mediaThumbnail.substring(0,80), enclosure: enclosure.substring(0,80), imgInDesc: imgInDesc.substring(0,80), imgInContent: imgInContent.substring(0,80)};
    } catch(e) {
      return {name, err: e.message};
    }
  }));
  return res.json(results);
}
