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

// Bluesky 포스트 본문 속 링크/멘션/해시태그는 record.text 안에 별도
// 마크업 없이 평문으로만 들어있고, 실제 위치·대상 URL은 record.facets에
// 바이트 오프셋(UTF-8 기준, JS 문자열의 UTF-16 인덱스와 다름)으로 따로
// 붙어있다 — 표시 텍스트가 잘린 형태("nytimes.com/athletic/750...")라도
// facet의 uri는 항상 원본 전체 URL이라, 텍스트만 정규식으로 긁으면 잘린
// 채로 안 열리는 링크를 만들게 된다. Buffer로 UTF-8 바이트 기준 슬라이싱
// 해서 정확한 구간을 잘라낸다.
function buildSegments(text, facets) {
  if (!text || !facets || !facets.length) return null;
  const bytes = Buffer.from(text, 'utf8');
  const sorted = facets
    .filter(f => f.index && typeof f.index.byteStart === 'number' && typeof f.index.byteEnd === 'number')
    .sort((a, b) => a.index.byteStart - b.index.byteStart);
  const segments = [];
  let cursor = 0;
  for (const f of sorted) {
    const { byteStart, byteEnd } = f.index;
    if (byteStart < cursor || byteEnd <= byteStart || byteEnd > bytes.length) continue;
    if (byteStart > cursor) segments.push({ type: 'text', text: bytes.slice(cursor, byteStart).toString('utf8') });
    const slice = bytes.slice(byteStart, byteEnd).toString('utf8');
    const feature = (f.features || [])[0] || {};
    if (feature['$type'] === 'app.bsky.richtext.facet#link') {
      segments.push({ type: 'link', text: slice, url: feature.uri });
    } else if (feature['$type'] === 'app.bsky.richtext.facet#mention') {
      segments.push({ type: 'link', text: slice, url: 'https://bsky.app/profile/' + feature.did });
    } else if (feature['$type'] === 'app.bsky.richtext.facet#tag') {
      segments.push({ type: 'link', text: slice, url: 'https://bsky.app/hashtag/' + encodeURIComponent(feature.tag) });
    } else {
      segments.push({ type: 'text', text: slice });
    }
    cursor = byteEnd;
  }
  if (cursor < bytes.length) segments.push({ type: 'text', text: bytes.slice(cursor).toString('utf8') });
  return segments;
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
        segments:  buildSegments(text, record.facets),
        createdAt: record.createdAt || '',
        timeAgo:   timeAgo(record.createdAt),
        likes:     post.likeCount   || 0,
        reposts:   post.repostCount || 0,
        replies:   post.replyCount  || 0,
        image,
        url: 'https://bsky.app/profile/' + j.handle + '/post/' + postId,
        author: { handle: j.handle, name: j.name, label: j.label, avatar: post.author?.avatar || null },
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

    const payload = { posts: all.slice(0, 12), count: all.length };
    _cache   = payload;
    _cacheTs = Date.now();

    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ error: err.message, posts: [] });
  }
}
