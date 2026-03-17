// api/news.js — Vercel Serverless Function
// Guardian Arsenal RSS + BBC Sport Arsenal RSS
// 최신순 정렬, 이미지 URL 정상화

const RSS_SOURCES = [
  {
    url: 'https://www.theguardian.com/football/arsenal/rss',
    name: 'The Guardian',
    filter: null, // 아스날 전용 피드라 필터 불필요
  },
  {
    url: 'https://www.skysports.com/rss/12040', // Sky Sports Arsenal
    name: 'Sky Sports',
    filter: /arsenal/i,
  },
  {
    url: 'https://feeds.bbci.co.uk/sport/football/rss.xml',
    name: 'BBC Sport',
    filter: /arsenal/i,
  },
];

function decodeHtml(str) {
  return (str||'')
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&apos;/g,"'")
    .replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
}

function timeAgo(date) {
  const diff = Math.floor((Date.now() - date) / 60000);
  if (diff < 60) return diff + '분 전';
  if (diff < 1440) return Math.floor(diff/60) + '시간 전';
  return Math.floor(diff/1440) + '일 전';
}

// Guardian 이미지 URL을 더 큰 사이즈로 교체
function upgradeImageUrl(url) {
  if (!url) return null;
  // Guardian: width=140 → width=800
  if (url.includes('i.guim.co.uk')) {
    return url.replace(/width=\d+/, 'width=800').replace(/quality=\d+/, 'quality=75');
  }
  return url;
}

function parseRSS(text, sourceName, filter) {
  const items = [];
  const itemMatches = text.matchAll(/<item>([\s\S]*?)<\/item>/g);

  for (const m of itemMatches) {
    const item = m[1];
    const title = decodeHtml(
      item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ||
      item.match(/<title>(.*?)<\/title>/)?.[1] || ''
    );
    if (!title) continue;
    if (filter && !filter.test(title)) continue;

    const link = (
      item.match(/<link>(.*?)<\/link>/)?.[1] ||
      item.match(/<guid[^>]*isPermaLink="true"[^>]*>(.*?)<\/guid>/)?.[1] || ''
    ).trim();

    const desc = decodeHtml(
      item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] ||
      item.match(/<description>(.*?)<\/description>/)?.[1] || ''
    ).substring(0, 150);

    const pub = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
    const pubDate = pub ? new Date(pub) : new Date(0);

    // 이미지: media:content > enclosure > og 순으로 시도
    const rawImage =
      item.match(/media:content[^>]+url="([^"]+)"/)?.[1] ||
      item.match(/media:thumbnail[^>]+url="([^"]+)"/)?.[1] ||
      item.match(/<enclosure[^>]+url="([^"]+)"/)?.[1] ||
      null;
    const urlToImage = upgradeImageUrl(rawImage);

    items.push({
      title,
      url: link,
      description: desc,
      urlToImage,
      pubDate: pubDate.getTime(),
      timeAgo: pub ? timeAgo(pubDate) : '',
      source: sourceName,
    });
  }
  return items;
}

const cache = { data: null, ts: 0 };
const TTL = 15 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=900');

  if (cache.data && Date.now() - cache.ts < TTL) return res.json(cache.data);

  const allArticles = [];

  await Promise.all(RSS_SOURCES.map(async (src) => {
    try {
      const r = await fetch(src.url, {
        headers: { 'User-Agent': 'Arsenal-Dashboard/1.0' },
        signal: AbortSignal.timeout(6000),
      });
      if (!r.ok) return;
      const text = await r.text();
      const items = parseRSS(text, src.name, src.filter);
      allArticles.push(...items);
    } catch (_) {}
  }));

  if (!allArticles.length) {
    return res.json({ articles: [], source: 'none' });
  }

  // 최신순 정렬 (pubDate 내림차순)
  allArticles.sort((a, b) => b.pubDate - a.pubDate);

  // 중복 제거 (같은 제목)
  const seen = new Set();
  const unique = allArticles.filter(a => {
    const key = a.title.toLowerCase().substring(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // pubDate 제거 (클라이언트에 불필요)
  const result = {
    articles: unique.slice(0, 12).map(({ pubDate: _, ...a }) => a),
    source: unique[0]?.source || 'RSS',
  };

  cache.data = result;
  cache.ts = Date.now();
  return res.json(result);
}
