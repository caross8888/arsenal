// api/news.js — Vercel Serverless Function
// Guardian Arsenal RSS → 최신 뉴스 10개

const RSS_URLS = [
  'https://www.theguardian.com/football/arsenal/rss',
  'https://www.theguardian.com/football/rss',  // fallback
];

const ARSENAL_KEYWORDS = /arsenal|arteta|saka|ødegaard|gyökeres|gunners/i;

function decodeHtml(str) {
  return str
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&apos;/g,"'")
    .replace(/<[^>]+>/g,'')  // HTML 태그 제거
    .replace(/\s+/g,' ').trim();
}

function timeAgo(date) {
  const diff = Math.floor((Date.now() - date) / 60000);
  if (diff < 60) return diff + '분 전';
  if (diff < 1440) return Math.floor(diff/60) + '시간 전';
  return Math.floor(diff/1440) + '일 전';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=900');

  for (const url of RSS_URLS) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Arsenal-Dashboard/1.0' },
        signal: AbortSignal.timeout(6000),
      });
      if (!r.ok) continue;

      const text = await r.text();
      const items = [];
      const itemMatches = text.matchAll(/<item>([\s\S]*?)<\/item>/g);

      for (const m of itemMatches) {
        const item = m[1];
        const title = decodeHtml(
          item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ||
          item.match(/<title>(.*?)<\/title>/)?.[1] || ''
        );
        const link = (
          item.match(/<link>(.*?)<\/link>/)?.[1] ||
          item.match(/<guid[^>]*>(.*?)<\/guid>/)?.[1] || ''
        ).trim();
        const desc = decodeHtml(
          item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] ||
          item.match(/<description>(.*?)<\/description>/)?.[1] || ''
        ).substring(0, 140);
        const pub = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
        const mediaUrl = item.match(/<media:content[^>]+url="([^"]+)"/)?.[1] ||
                         item.match(/<media:thumbnail[^>]+url="([^"]+)"/)?.[1] || null;

        if (!title) continue;

        // Guardian 아스날 RSS는 이미 필터됨, fallback은 키워드 필터
        if (url.includes('football/rss') && !ARSENAL_KEYWORDS.test(title)) continue;

        const ago = pub ? timeAgo(new Date(pub)) : '';
        items.push({
          title,
          url: link,
          description: desc,
          urlToImage: mediaUrl,
          timeAgo: ago,
          pubDate: pub,
        });

        if (items.length >= 10) break;
      }

      if (items.length) {
        return res.json({ articles: items, source: 'The Guardian' });
      }
    } catch { continue; }
  }

  return res.json({ articles: [], source: 'none' });
}
