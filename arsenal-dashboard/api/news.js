// api/news.js — Vercel Serverless Function
const RSS_URLS = [
  'https://www.theguardian.com/football/arsenal/rss',
  'https://feeds.bbci.co.uk/sport/football/rss.xml',
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=1800');

  for (const url of RSS_URLS) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Arsenal-Dashboard/1.0' },
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) continue;
      const text = await r.text();
      const items = [];
      const itemMatches = text.matchAll(/<item>([\s\S]*?)<\/item>/g);
      for (const m of itemMatches) {
        const item = m[1];
        const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1] || '';
        const link = item.match(/<link>(.*?)<\/link>/)?.[1] || '';
        const desc = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] || item.match(/<description>(.*?)<\/description>/)?.[1] || '';
        const pub = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
        if (!title) continue;
        const ago = pub ? timeAgo(new Date(pub)) : '';
        items.push({ title: title.trim(), url: link.trim(), description: desc.replace(/<[^>]+>/g,'').trim().substring(0,120), timeAgo: ago });
        if (items.length >= 10) break;
      }
      if (items.length) return res.json({ articles: items, source: new URL(url).hostname });
    } catch { continue; }
  }
  return res.json({ articles: [], source: 'none' });
}

function timeAgo(date) {
  const diff = Math.floor((Date.now() - date) / 60000);
  if (diff < 60) return diff + '분 전';
  if (diff < 1440) return Math.floor(diff/60) + '시간 전';
  return Math.floor(diff/1440) + '일 전';
}
