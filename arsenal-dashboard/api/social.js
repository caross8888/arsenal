// api/social.js — Vercel Serverless Function
// Bluesky 아스날 1티어 기자 피드

import { translateFields, translateSegments } from './_translate.js';

// filter:false — 아스날 전담 계정이라 키워드 필터 없이 전부 띄운다.
const JOURNALISTS = [
  { handle: 'david-ornstein.bsky.social', name: 'David Ornstein', label: 'The Athletic' },
  { handle: 'amylawrence.bsky.social',    name: 'Amy Lawrence',   label: 'The Observer' },
  { handle: 'charleswatts.bsky.social',   name: 'Charles Watts',  label: 'Goal' },
  { handle: 'gunnerblog.bsky.social',     name: 'Gunnerblog',     label: 'The Athletic', filter: false },
  { handle: 'philcosta.bsky.social',      name: 'Phil Costa',     label: 'Arseblog' },
];

const BSKY = 'https://public.api.bsky.app/xrpc';
const TTL  = 10 * 60 * 1000;

// ── 아스날 관련 포스트 필터 ─────────────────────────────────
// 예전엔 고정 정규식 하나(/arsenal|saka|rice|.../)였는데 세 가지가 문제였다:
// 단어 경계가 없어 "price"가 rice로 걸리고, "Ødegaard"는 ø 때문에 odegaard에
// 안 걸리고, 선수 명단이 몇 시즌 전 그대로라 지금 선수 대부분이 빠져 있었다.
// 그래서 키워드를 Fotmob 1군 명단 + 감독에서 자동으로 만들고(KV 12시간),
// 본문·키워드를 둘 다 악센트를 뗀 소문자 단어열로 바꿔 "단어 단위"로 비교한다.
const CLUB_TERMS = ['arsenal', 'gunners', 'gooner', 'gooners', 'coyg', 'emirates stadium'];
// 해시태그로만 의미가 있는 것 — "AFC"는 단독이면 본머스·윔블던·아시아축구연맹이다.
const HASHTAG_RE = /#(afc|coyg|arsenal|gunners)\b/i;
// 성만으로는 일반 단어·흔한 이름이라 오탐이 나는 경우 — 이 성은 풀네임으로만 잡는다.
const AMBIGUOUS = new Set([
  'rice', 'white', 'timber', 'jesus', 'gabriel', 'james', 'jones', 'smith', 'young', 'king',
  'rose', 'hill', 'brown', 'green', 'black', 'walker', 'cash', 'best', 'wood', 'love', 'little',
  'silva', 'santos', 'costa', 'pedro', 'martin', 'rodri', 'lucas', 'ben', 'max',
]);
// 명단 표기가 한 단어이거나 흔히 다른 이름으로 불리는 선수의 별칭(명단 이름 → 추가 키워드)
const ALIASES = {
  'gabriel': ['gabriel magalhaes', 'magalhaes'],
  'kepa arrizabalaga': ['kepa'],
};
// Fotmob을 못 부를 때 쓰는 최소 명단(26-27 시즌 1군 + 감독)
const FALLBACK_NAMES = [
  'Mikel Arteta', 'David Raya', 'Kepa Arrizabalaga', 'William Saliba', 'Ben White', 'Gabriel',
  'Jurrien Timber', 'Riccardo Calafiori', 'Myles Lewis-Skelly', 'Martin Odegaard', 'Declan Rice',
  'Martin Zubimendi', 'Mikel Merino', 'Bruno Guimaraes', 'Eberechi Eze', 'Bukayo Saka',
  'Viktor Gyokeres', 'Noni Madueke', 'Kai Havertz',
];

// 같은 글자 3번 이상 반복은 하나로 — 골 순간 "ODEGAARRRRRDDDDDD!" 같은 외침도
// odegaard로 잡힌다(선수 이름에 같은 글자가 3번 연속 나오는 경우는 없다).
function normText(s) {
  return ' ' + String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[øØ]/g, 'o').replace(/[æÆ]/g, 'ae').replace(/ß/g, 'ss')
    .toLowerCase().replace(/([a-z])\1{2,}/g, '$1').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
}

// 이름 목록 → 비교용 키워드. 풀네임은 항상, 성은 AMBIGUOUS가 아니고 3자 이상일 때만.
function termsFromNames(names) {
  const terms = new Set(CLUB_TERMS.map(t => normText(t).trim()));
  for (const raw of names) {
    const full = normText(raw).trim();
    if (!full) continue;
    const parts = full.split(' ');
    if (parts.length > 1) terms.add(full);
    const last = parts.slice(1).join(' ') || parts[0];
    if (!AMBIGUOUS.has(last) && last.length >= 3) terms.add(last);
    for (const a of (ALIASES[full] || [])) terms.add(normText(a).trim());
  }
  return [...terms];
}

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
async function kvCmd(cmd) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const r = await fetch(KV_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
      signal: AbortSignal.timeout(5000),
    });
    return r.ok ? (await r.json()).result : null;
  } catch (_) { return null; }
}

// 1군 명단 + 감독 이름으로 키워드 목록. 명단이 바뀌어도(이적시장) 12시간 안에 따라간다.
async function loadTerms() {
  const hit = await kvCmd(['GET', 'snsTerms']);
  if (hit) { try { return JSON.parse(hit); } catch (_) {} }
  let names = FALLBACK_NAMES;
  try {
    const r = await fetch('https://www.fotmob.com/api/data/teams?id=9825', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const j = await r.json();
      const fm = (j.squad?.squad || []).flatMap(g => (g.members || []).map(m => m.name)).filter(Boolean);
      if (fm.length >= 11) names = fm;
    }
  } catch (_) {}
  const terms = termsFromNames(names);
  if (names !== FALLBACK_NAMES) await kvCmd(['SET', 'snsTerms', JSON.stringify(terms), 'EX', String(12 * 60 * 60)]);
  return terms;
}

function isArsenalPost(text, terms) {
  if (HASHTAG_RE.test(text)) return true;
  const t = normText(text);
  return terms.some(term => t.includes(' ' + term + ' '));
}

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
      if (j.filter !== false && !isArsenalPost(text, terms)) continue;

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

    // 경기 날 실시간으로 여러 개씩 올리는 계정(Phil Costa 등)이 12칸을 독차지하지
    // 않게 작성자당 3개까지만 먼저 뽑고, 칸이 남으면 나머지로 최신순 채운다.
    const SHOW = 12, PER_AUTHOR = 3;
    const picked = [], rest = [], perAuthor = {};
    for (const p of all) {
      const k = p.author.handle;
      if ((perAuthor[k] || 0) < PER_AUTHOR && picked.length < SHOW) { picked.push(p); perAuthor[k] = (perAuthor[k] || 0) + 1; }
      else rest.push(p);
    }
    picked.push(...rest.slice(0, SHOW - picked.length));
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
