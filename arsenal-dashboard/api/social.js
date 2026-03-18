// api/social.js — Vercel Serverless Function
// Bluesky 아스날 1티어 기자 피드

const JOURNALISTS = [
  { handle: 'david-ornstein.bsky.social', name: 'David Ornstein', label: 'The Athletic' },
  { handle: 'amylawrence.bsky.social',    name: 'Amy Lawrence',   label: 'The Observer' },
  { handle: 'charleswatts.bsky.social',   name: 'Charles Watts',  label: 'Goal' },
];

const BSKY = 'https://public.api.bsky.app/xrpc';
const TTL  = 10 * 60 * 1000;
const KEYWORDS = /arsenal|arteta|saka|rice|saliba|odegaard|martinelli|havertz|trossard|gabriel|timber|merino|zubimendi|gunners|emirates/i;

let _cache = null;
let _cacheTs = 0;

function timeAgo(dateStr) {
  try {
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 60000);
    if (diff < 1)    return '방금 전';
    if (diff < 60)   return diff + '분 전';
    if (diff < 1440) return Math.floor(diff / 60) + '시간 전';
    return Math.floor(diff / 1440) + '일 전';
  } catch (e) {
    return '';
  }
}

async function fetchJournalist(j) {
  const url = BSKY + '/app.bsky.feed.getAuthorFeed?actor=' + encodeURIComponent(j.handle) + '&limit=15&filter=posts_no_replies';
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) return [];

  const data = await r.json();
  const out  = [];

  for (const item of (data.feed || [])) {
    try {
      if (item.reason && item.reason['$type'] === 'app.bsky.feed.defs#reasonRepost') continue;

      const post   = item.post   || {};
      const record = post.record || {};
      const text   = record.text || '';
      if (!text || !KEYWORDS.test(text)) continue;

      // 이미지
      let image = null;
      const embed = post.embed || {};
      const imgs  = embed.images || (embed.media && embed.media.images);
      if (imgs && imgs.length > 0) image = imgs[0].thumb || imgs[0].fullsize || null;
      if (!image && embed.external && embed.external.thumb) image = embed.external.thumb;

      const postId = (post.uri || '').split('/').pop();
      out.push({
        id:        post.uri || '',
        text,
        createdAt: record.createdAt || '',
        timeAgo:   timeAgo(record.createdAt),
        likes:     post.likeCount   || 0,
        reposts:   post.repostCount || 0,
        replies:   post.replyCount  || 0,
        image,
        url: 'https://bsky.app/profile/' + j.handle + '/post/' + postId,
        author: { handle: j.handle, name: j.name, label: j.label },
      });
    } catch (_) {}
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=600');

  try {
    if (_cache && Date.now() - _cacheTs < TTL) {
      return res.json(_cache);
    }

    const results = await Promise.allSettled(JOURNALISTS.map(fetchJournalist));
    const all = [];
    for (const r of results) {
      if (r.status === 'fulfilled') all.push(...r.value);
    }

    all.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));

    const payload = { posts: all.slice(0, 20), count: all.length };
    _cache   = payload;
    _cacheTs = Date.now();

    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ error: err.message, posts: [] });
  }
}
