// netlify/functions/news.js
// BBC Sport Arsenal RSS → JSON 변환 (API 키 불필요, 무제한)
// 실패 시 NewsAPI fallback

const RSS_URL = 'https://feeds.bbci.co.uk/sport/football/arsenal/rss.xml';

// 간단한 XML 파싱 (외부 패키지 없이)
function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`));
      return m ? (m[1] || m[2] || '').trim() : '';
    };
    const title = get('title');
    const link = get('link');
    const desc = get('description');
    const pubDate = get('pubDate');
    if (title) items.push({ title, link, description: desc, pubDate });
  }
  return items;
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return '방금 전';
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

const cache = {};
const TTL = 15 * 60 * 1000; // 15분

exports.handler = async () => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=900',
  };

  if (cache.news && Date.now() - cache.news.ts < TTL) {
    return { statusCode: 200, headers, body: JSON.stringify(cache.news.data) };
  }

  try {
    const res = await fetch(RSS_URL, {
      headers: { 'User-Agent': 'Arsenal-Dashboard/1.0' }
    });
    if (!res.ok) throw new Error(`RSS fetch ${res.status}`);
    const xml = await res.text();
    const items = parseRSS(xml).slice(0, 12);

    const result = {
      source: 'BBC Sport',
      articles: items.map(i => ({
        title: i.title,
        url: i.link,
        description: i.description.replace(/<[^>]+>/g, '').slice(0, 200),
        publishedAt: i.pubDate,
        timeAgo: timeAgo(i.pubDate),
      }))
    };

    cache.news = { data: result, ts: Date.now() };
    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (err) {
    // NewsAPI fallback (키가 있으면)
    if (process.env.NEWS_API_KEY) {
      try {
        const r = await fetch(
          `https://newsapi.org/v2/everything?q=Arsenal+FC&sortBy=publishedAt&pageSize=12&apiKey=${process.env.NEWS_API_KEY}`
        );
        const j = await r.json();
        const result = {
          source: 'NewsAPI',
          articles: (j.articles || []).map(a => ({
            title: a.title,
            url: a.url,
            description: (a.description || '').slice(0, 200),
            publishedAt: a.publishedAt,
            timeAgo: timeAgo(a.publishedAt),
            urlToImage: a.urlToImage,
          }))
        };
        return { statusCode: 200, headers, body: JSON.stringify(result) };
      } catch (_) {}
    }
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
