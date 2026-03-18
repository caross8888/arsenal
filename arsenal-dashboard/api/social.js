// api/social.js — Vercel Serverless Function
// Bluesky 1티어 아스날 기자 피드 집계
// 인증 불필요 — public.api.bsky.app 사용

const JOURNALISTS = [
  { handle: 'david-ornstein.bsky.social',  name: 'David Ornstein',  label: 'The Athletic' },
  { handle: 'amylawrence.bsky.social',     name: 'Amy Lawrence',    label: 'The Observer' },
  { handle: 'charleswatts.bsky.social',    name: 'Charles Watts',   label: 'Goal' },
];

const BSKY_API = 'https://public.api.bsky.app/xrpc';
const TTL = 10 * 60 * 1000; // 10분 캐시

const cache = { data: null, ts: 0 };

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 60000);
  if (diff < 1)   return '방금 전';
  if (diff < 60)  return diff + '분 전';
  if (diff < 1440) return Math.floor(diff / 60) + '시간 전';
  return Math.floor(diff / 1440) + '일 전';
}

async function fetchFeed(journalist) {
  const url = `${BSKY_API}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(journalist.handle)}&limit=10&filter=posts_no_replies`;
  const r = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) return [];

  const data = await r.json();
  const posts = [];

  for (const item of (data.feed || [])) {
    const post   = item.post;
    const record = post?.record;
    if (!record?.text) continue;

    // 리포스트 제외 (본인 게시물만)
    if (item.reason?.$type === 'app.bsky.feed.defs#reasonRepost') continue;

    const text = record.text || '';

    // 아스날 관련 키워드 필터
    const ARSENAL_KEYWORDS = /arsenal|arteta|saka|rice|saliba|odegaard|martinelli|havertz|trossard|gabriel|timber|merino|zubimendi|gunners|emirates/i;
    if (!ARSENAL_KEYWORDS.test(text)) continue;

    // 이미지 추출
    let image = null;
    const embed = post.embed;
    if (embed) {
      // images embed
      const imgs = embed.images || embed.media?.images;
      if (imgs && imgs.length > 0) {
        image = imgs[0].thumb || imgs[0].fullsize || null;
      }
      // external embed (링크 카드)
      const ext = embed.external;
      if (!image && ext?.thumb) image = ext.thumb;
    }

    // 링크 추출 (facets)
    let postUrl = `https://bsky.app/profile/${journalist.handle}/post/${post.uri.split('/').pop()}`;

    posts.push({
      id:        post.uri,
      text,
      createdAt: record.createdAt,
      timeAgo:   timeAgo(record.createdAt),
      likes:     post.likeCount  || 0,
      reposts:   post.repostCount || 0,
      replies:   post.replyCount  || 0,
      image,
      url:       postUrl,
      author: {
        handle: journalist.handle,
        name:   journalist.name,
        label:  journalist.label,
      },
    });
  }
  return posts;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=600');

  if (cache.data && Date.now() - cache.ts < TTL) {
    return res.json(cache.data);
  }

  const allPosts = [];
  await Promise.all(
    JOURNALISTS.map(async (j) => {
      try {
        const posts = await fetchFeed(j);
        allPosts.push(...posts);
      } catch (_) {}
    })
  );

  // 최신순 정렬
  allPosts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // 최대 20개
  const result = { posts: allPosts.slice(0, 20), count: allPosts.length };
  cache.data = result;
  cache.ts   = Date.now();

  return res.json(result);
}
