// api/videos.js — Vercel Serverless Function
// Arsenal 공식 유튜브 채널 최신 영상 (RSS, API 키 불필요)

const CHANNEL_ID = 'UCpryVRk_VDudG8SHXgWcG0w'; // Arsenal 공식 채널
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

function decodeHtml(str) {
  return (str || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .trim();
}

function timeAgo(date) {
  const diff = Math.floor((Date.now() - date) / 60000);
  if (diff < 60) return diff + '분 전';
  if (diff < 1440) return Math.floor(diff / 60) + '시간 전';
  return Math.floor(diff / 1440) + '일 전';
}

function parseFeed(text) {
  const videos = [];
  const entries = text.matchAll(/<entry>([\s\S]*?)<\/entry>/g);
  for (const m of entries) {
    const entry = m[1];
    const videoId = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1];
    if (!videoId) continue;
    const title = decodeHtml(entry.match(/<title>(.*?)<\/title>/)?.[1] || '');
    const thumbnail = entry.match(/<media:thumbnail url="([^"]+)"/)?.[1] || '';
    const pub = entry.match(/<published>(.*?)<\/published>/)?.[1] || '';
    const pubDate = pub ? new Date(pub) : new Date(0);
    videos.push({
      videoId,
      title,
      thumbnail,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      pubDate: pubDate.getTime(),
      timeAgo: pub ? timeAgo(pubDate) : '',
    });
  }
  return videos;
}

const cache = { data: null, ts: 0 };
const TTL = 30 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=1800');

  if (cache.data && Date.now() - cache.ts < TTL) return res.json(cache.data);

  try {
    const r = await fetch(FEED_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 Arsenal-Dashboard/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`YouTube RSS: HTTP ${r.status}`);
    const text = await r.text();
    const videos = parseFeed(text).sort((a, b) => b.pubDate - a.pubDate);
    const result = {
      videos: videos.slice(0, 6).map(({ pubDate: _, ...v }) => v),
      source: 'YouTube',
    };
    cache.data = result;
    cache.ts = Date.now();
    return res.json(result);
  } catch (err) {
    if (cache.data) return res.json(cache.data);
    return res.json({ videos: [], source: 'none', error: err.message });
  }
}
