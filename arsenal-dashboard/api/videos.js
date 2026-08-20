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

  const FEED_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    'Accept': 'application/rss+xml, application/atom+xml, text/xml, */*',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  const fetchFeed = async () => {
    const r = await fetch(FEED_URL, { headers: FEED_HEADERS, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`YouTube RSS: HTTP ${r.status}`);
    return r.text();
  };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  try {
    // 유튜브가 가끔 일시적으로 404/5xx를 돌려주는 경우가 있어(특히 짧은 시간
    // 안에 요청이 몰릴 때) 최대 3회까지 짧은 간격을 두고 재시도한다.
    let text, lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { text = await fetchFeed(); break; }
      catch (e) { lastErr = e; if (attempt < 2) await sleep(400); }
    }
    if (text === undefined) throw lastErr;
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
