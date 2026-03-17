// netlify/functions/news.js
// 뉴스: RSS 피드 우선, 실패 시 다음 소스로 fallback
// API 키 불필요

const RSS_SOURCES = [
  { url: 'https://www.arsenal.com/rss.xml', name: 'Arsenal.com' },
  { url: 'https://www.skysports.com/rss/12040', name: 'Sky Sports' },
  { url: 'https://www.bbc.co.uk/sport/arsenal/rss.xml', name: 'BBC Sport' },
  { url: 'https://feeds.bbci.co.uk/sport/football/rss.xml', name: 'BBC Football' },
];

function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return m ? (m[1] || m[2] || '').trim() : '';
    };
    const title = get('title').replace(/<[^>]+>/g, '');
    const link = get('link') || get('guid');
    const desc = get('description').replace(/<[^>]+>/g, '').slice(0, 200);
    const pubDate = get('pubDate');
    // Arsenal 관련 기사만 필터
    const isArsenal = title.toLowerCase().includes('arsenal') || desc.toLowerCase().includes('arsenal');
    if (title && (isArsenal || items.length < 3)) items.push({ title, link, description: desc, pubDate });
    if (items.length >= 12) break;
  }
  return items;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
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

  // 여러 RSS 소스 순차 시도
  for (const source of RSS_SOURCES) {
    try {
      const res = await fetch(source.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Arsenal-Dashboard/1.0)',
          'Accept': 'application/rss+xml, application/xml, text/xml',
        },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const items = parseRSS(xml);
      if (!items.length) continue;

      const result = {
        source: source.name,
        articles: items.map(i => ({
          title: i.title,
          url: i.link,
          description: i.description,
          publishedAt: i.pubDate,
          timeAgo: timeAgo(i.pubDate),
        }))
      };

      cache.news = { data: result, ts: Date.now() };
      return { statusCode: 200, headers, body: JSON.stringify(result) };

    } catch (_) { continue; }
  }

  // NewsAPI fallback
  if (process.env.NEWS_API_KEY) {
    try {
      const r = await fetch(
        `https://newsapi.org/v2/everything?q=Arsenal+FC&sortBy=publishedAt&pageSize=12&language=en&apiKey=${process.env.NEWS_API_KEY}`
      );
      const j = await r.json();
      if (j.articles?.length) {
        const result = {
          source: 'NewsAPI',
          articles: j.articles.map(a => ({
            title: a.title,
            url: a.url,
            description: (a.description || '').slice(0, 200),
            publishedAt: a.publishedAt,
            timeAgo: timeAgo(a.publishedAt),
            urlToImage: a.urlToImage,
          }))
        };
        return { statusCode: 200, headers, body: JSON.stringify(result) };
      }
    } catch (_) {}
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      source: 'Mock',
      articles: [
        { title: '뉴스를 불러올 수 없습니다', url: 'https://www.arsenal.com/news', description: 'arsenal.com에서 직접 확인해주세요.', timeAgo: '' }
      ]
    })
  };
};
