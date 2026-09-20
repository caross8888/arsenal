// api/social.js — Vercel Serverless Function
// Bluesky 아스날 1티어 기자 피드

import { translateFields, translateSegments } from './_translate.js';
import { loadTerms, isArsenalText } from './_arsenalTerms.js';

// filter:false — 아스날 전담 계정이라 키워드 필터 없이 전부 띄운다.
const JOURNALISTS = [
  { handle: 'david-ornstein.bsky.social', name: 'David Ornstein', label: 'The Athletic' },
  { handle: 'amylawrence.bsky.social',    name: 'Amy Lawrence',   label: 'The Observer' },
  { handle: 'gunnerblog.bsky.social',     name: 'Gunnerblog',     label: 'The Athletic', filter: false },
  { handle: 'philcosta.bsky.social',      name: 'Phil Costa',     label: 'Arseblog' },
  // 아스날 전담이지만 독일 대표팀 명단 같은 타 팀 소식도 올려서 키워드 필터는 켜둔다.
  // 하루 4개꼴·경기 날엔 골 속보까지 올리는 계정이라 최신 12칸을 많이 차지하지만,
  // 아래 보강 규칙으로 다른 기자의 최근 7일 글은 2개씩 남는다.
  { handle: 'srcollings.bsky.social',     name: 'Simon Collings', label: 'The Sun' },
  // 프리미어리그 공식 X 계정을 그대로 옮겨 올리는 비공식 봇(운영: @darthblaise.bsky.social).
  // X API를 못 쓰는 대신 여기서 공식 피드(골 영상·사진)를 받는다. 리그 전체 계정이라
  // 아스날 얘기는 10% 안팎 — 키워드 필터를 켠다. 개인 봇이라 언제든 멈출 수 있다.
  { handle: 'premierleaguebot.bsky.social', name: 'Premier League', label: 'Official X mirror' },
];

const BSKY = 'https://public.api.bsky.app/xrpc';
const TTL  = 10 * 60 * 1000;

// 아스날 관련 포스트 판별(선수·감독 이름 키워드)은 뉴스와 같이 쓰는 _arsenalTerms.js에 있다.

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
  if (!text) return null;
  // 링크/멘션 facet이 없는 글도 조각 하나짜리로 만들어 둔다 — 번역이 HTML 모드를 타야
  // 본문에 글자로만 박힌 @핸들을 <span translate="no">로 보호할 수 있다. 평문 모드로
  // 보내면 구글이 핸들을 번역해버린다(실측: @BHAFC → "버밍엄 시티", 사용자 제보).
  // X를 그대로 옮겨오는 계정(PL 공식 미러)은 facet이 없어서 전부 이 경우에 해당한다.
  if (!facets || !facets.length) return [{ type: 'text', text }];
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

// 계정당 최근 30개를 훑는다 — 필터 계정은 아스날 얘기가 드문드문이라 15개로는
// 한두 개밖에 안 남았다.
async function fetchJournalist(j, terms) {
  const url = BSKY + '/app.bsky.feed.getAuthorFeed?actor=' + encodeURIComponent(j.handle) + '&limit=30&filter=posts_no_replies';
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
      if (!text) continue;
      if (j.filter !== false && !isArsenalText(text, terms)) continue;

      // 이미지
      let image = null;
      const embed = post.embed || {};
      const imgs  = embed.images || (embed.media && embed.media.images);
      if (imgs && imgs.length > 0) image = imgs[0].thumb || imgs[0].fullsize || null;
      if (!image && embed.external && embed.external.thumb) image = embed.external.thumb;

      // 영상 — 예전엔 images/external만 봐서 영상 글이 카드에 글자만 나왔다(실측: PL 봇
      // 최근 100개 중 40개가 영상). 영상은 embed 자체(app.bsky.embed.video#view)나, 인용글이
      // 붙은 경우 embed.media에 온다. playlist는 HLS(.m3u8)이고 video.bsky.app이
      // Access-Control-Allow-Origin:*라 우리 페이지에서 바로 재생된다(대역폭도 블루스카이 쪽).
      let video = null;
      const vEmbed = /embed\.video/.test(embed['$type'] || '') ? embed
        : (embed.media && /embed\.video/.test(embed.media['$type'] || '') ? embed.media : null);
      if (vEmbed && vEmbed.playlist) {
        video = {
          playlist:    vEmbed.playlist,
          thumbnail:   vEmbed.thumbnail || null,
          aspectRatio: vEmbed.aspectRatio || null,   // {width, height}
        };
        if (!image) image = vEmbed.thumbnail || null;
      }

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
        video,
        url: 'https://bsky.app/profile/' + j.handle + '/post/' + postId,
        author: { handle: j.handle, name: j.name, label: j.label, avatar: post.author?.avatar || null },
      });
    } catch (_) {}
  }
  return out;
}

// 포스트 본문 한글화. 링크/멘션/해시태그가 섞인 본문(segments 있음)은
// translateSegments가 HTML 모드로 통째로 처리해서 링크를 살린 채 번역하고,
// 링크가 없는 순수 텍스트 포스트만 평문 경로로 보낸다.
async function translatePosts(posts) {
  const plain = posts.filter(p => !Array.isArray(p.segments) || !p.segments.length);
  await translateSegments(posts);
  if (plain.length) await translateFields(plain, ['text']);
  return posts;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=600');

  try {
    if (_cache && Date.now() - _cacheTs < TTL) {
      return res.json(_cache);
    }

    const terms = await loadTerms();
    const results = await Promise.allSettled(JOURNALISTS.map(j => fetchJournalist(j, terms)));
    const all = [];
    for (const r of results) {
      if (r.status === 'fulfilled') all.push(...r.value);
    }

    all.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));

    // 최신 12개는 무조건 시간순으로 넣고, 거기에 기자마다 최근 7일 안의 글이
    // 2개가 안 되면 그 기자의 최신 글로 2개까지 덧붙인다(최대 12 + 2×기자 수).
    //
    // 예전엔 "12칸 고정 + 작성자당 3개"였는데, 칸 수가 고정이라 조용한 기자의 옛 글이
    // 칸을 지키는 대가로 최신 글이 밀려났다(실측: 11일 전 Gunnerblog 글이 남고 당일
    // Collings 메리노 인터뷰가 빠짐). 순수 최신순은 반대로 경기 날 Collings 중계가
    // 12칸 중 10칸을 채워 다른 기자 분석이 사라진다. 보강은 7일 안으로만 해서 한참
    // 조용한 계정(Ornstein 등)의 옛 글이 피드에 눌러앉지 않게 한다.
    const SHOW = 12, MIN_PER_AUTHOR = 2, BACKFILL_DAYS = 7;
    const picked = all.slice(0, SHOW);
    const perAuthor = {};
    for (const p of picked) perAuthor[p.author.handle] = (perAuthor[p.author.handle] || 0) + 1;
    const cutoff = Date.now() - BACKFILL_DAYS * 24 * 60 * 60 * 1000;
    for (const p of all.slice(SHOW)) {
      const k = p.author.handle;
      if ((perAuthor[k] || 0) >= MIN_PER_AUTHOR) continue;
      if (new Date(p.createdAt).getTime() < cutoff) continue;
      picked.push(p);
      perAuthor[k] = (perAuthor[k] || 0) + 1;
    }
    picked.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));

    const payload = { posts: picked, count: all.length };
    await translatePosts(payload.posts);
    _cache   = payload;
    _cacheTs = Date.now();

    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ error: err.message, posts: [] });
  }
}
