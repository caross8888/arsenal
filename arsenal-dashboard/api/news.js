// api/news.js — Vercel Serverless Function
// Guardian Arsenal RSS + Sky Sports + BBC Sport RSS
// 최신순 정렬, 이미지 URL 정상화

import { translateFields } from './_translate.js';
import { loadTerms, isArsenalText } from './_arsenalTerms.js';

// BBC·CBS는 축구 전체 피드라 아스날 기사만 골라야 한다(ESPN·Guardian은 요청 자체가
// 아스날 한정). 예전엔 헤드라인에 "arsenal"이 있어야만 통과해서 "Madueke a target
// for Euro loans"처럼 선수 이름만 있는 기사를 놓쳤다 — 헤드라인 + RSS 요약을
// SNS와 같은 선수·감독 키워드(_arsenalTerms.js)로 본다. 요약까지 보는 건 파워랭킹·
// 챔스 예측처럼 요약에서 아스날을 다루는 기사도 받기 위해서다(사용자 요청).
// 단 여자축구는 뺀다 — BBC "Women's Football Weekly"가 요약의 Arsenal로 걸렸다.
const RSS_SOURCES = [
  { url: 'https://feeds.bbci.co.uk/sport/football/rss.xml', name: 'BBC Sport',  filterArsenal: true },
  { url: 'https://www.cbssports.com/rss/headlines/soccer/',  name: 'CBS Sports', filterArsenal: true },
  // 스카이는 피드가 여럿인데 아스날이 가장 많이 잡히는 건 프리미어리그 피드다
  // (실측: PL 20건 중 아스날 4건, 축구 전체 피드는 1건). 팀별 속보는 제목만 오고
  // 요약이 비어 있는 경우가 있다("Arsenal latest: ...").
  { url: 'https://www.skysports.com/rss/11661',              name: 'Sky Sports', filterArsenal: true },
];
const WOMEN_RE = /\bwomen'?s?\b|\bwsl\b|\blionesses\b/i;

// RSS pubDate 파싱 — 자바스크립트 Date는 대부분의 시간대 약어를 못 읽는다.
// 스카이가 "Thu, 24 Sep 2026 20:39:00 BST"로 보내는데 new Date()가 Invalid Date를 돌려줘
// 정렬에서 맨 뒤로 밀려 20개 제한에 잘렸다(실측: 아스날 기사 4건이 통째로 사라짐).
const TZ_ABBR = { GMT:'+0000', UT:'+0000', UTC:'+0000', BST:'+0100', CET:'+0100', CEST:'+0200',
  EST:'-0500', EDT:'-0400', CST:'-0600', CDT:'-0500', MST:'-0700', MDT:'-0600', PST:'-0800', PDT:'-0700' };
function parseRssDate(raw){
  const str = String(raw || '').trim();
  if(!str) return null;
  let d = new Date(str);
  if(!isNaN(d)) return d;
  const fixed = str.replace(/\s([A-Z]{2,4})$/, (m, ab) => TZ_ABBR[ab] ? ' ' + TZ_ABBR[ab] : m);
  d = new Date(fixed);
  return isNaN(d) ? null : d;
}

function decodeHtml(str) {
  return (str||'')
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')
    .replace(/&quot;/g,'"').replace(/&apos;/g,"'")
    // 숫자 엔티티는 코드포인트로 직접 변환한다 — &#39;만 개별 처리하면
    // CBS Sports처럼 0을 채워 보내는 소스(&#039;)가 안 풀려서 제목에
    // 그대로 노출되고, 번역까지 그 상태로 넘어간다.
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
}

function decodeAttr(str) {
  // XML attribute 값 내 엔티티 디코딩 (URL에 &amp; 등)
  return (str||'')
    .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
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
  const decoded = decodeAttr(url);
  if (decoded.includes('i.guim.co.uk')) {
    // width=140 → width=800, quality 올리기
    return decoded
      .replace(/width=\d+/, 'width=800')
      .replace(/quality=\d+/, 'quality=75');
  }
  return decoded;
}

function extractImage(item) {
  // Guardian: media:content width="460" url="..." (가장 큰 사이즈 우선)
  // media:content 태그에서 url 속성 추출 — 속성 순서 무관하게 처리
  const mcTags = [...item.matchAll(/media:content([^>]*?)(?:\/>|>)/g)];
  if (mcTags.length) {
    // width가 가장 큰 것 선택
    let best = null, bestW = 0;
    for (const tag of mcTags) {
      const urlM = tag[1].match(/url="([^"]+)"/);
      const wM = tag[1].match(/width="(\d+)"/);
      if (urlM) {
        const w = wM ? parseInt(wM[1]) : 0;
        if (w >= bestW) { bestW = w; best = urlM[1]; }
      }
    }
    if (best) return best;
  }

  // media:thumbnail
  let m = item.match(/media:thumbnail[^>]*url="([^"]+)"/);
  if (m) return m[1];

  // enclosure (CBS Sports: enclosure url="..." length="..." type="image/...")
  m = item.match(/<enclosure[^>]*url="([^"]+)"/);
  if (m) return m[1];

  // description 안의 <img src=...>
  m = item.match(/<img[^>]+src="(https?:\/\/[^"]+)"/);
  if (m) return m[1];

  // CDATA description 안의 img
  const cdataDesc = item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] || '';
  m = cdataDesc.match(/<img[^>]+src="(https?:\/\/[^"]+)"/);
  if (m) return m[1];

  return null;
}

function parseRSS(text, sourceName, filter) {
  const items = [];
  const itemMatches = text.matchAll(/<item>([\s\S]*?)<\/item>/g);
  for (const m of itemMatches) {
    const item = m[1];
    // [\s\S]*? (not .*?) — 일부 소스(CBS Sports)는 태그와 텍스트 사이에
    // 줄바꿈이 들어간 pretty-print RSS를 내려주는데, JS 정규식의 .은
    // 기본적으로 줄바꿈을 매치하지 않아서 .*?를 쓰면 그런 피드에서 항상
    // 빈 문자열이 잡히고(특히 title이 비면 아래 continue로 통째로
    // 건너뛰어짐) 해당 소스 기사가 전부 누락되는 버그가 있었다.
    const title = decodeHtml(
      item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1] ||
      item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || ''
    );
    if (!title) continue;

    const descFull = decodeHtml(
      item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] ||
      item.match(/<description>([\s\S]*?)<\/description>/)?.[1] || ''
    );
    // filter: (제목, 요약 전체) → 통과 여부. 표시용 요약은 150자로 자르지만
    // 판별은 자르기 전 전체로 한다.
    if (filter && !filter(title, descFull)) continue;
    const desc = descFull.substring(0, 150);

    const link = (
      item.match(/<link>([\s\S]*?)<\/link>/)?.[1] ||
      item.match(/<guid[^>]*isPermaLink="true"[^>]*>([\s\S]*?)<\/guid>/)?.[1] || ''
    ).trim();

    const pub = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '').trim();
    const pubDate = parseRssDate(pub) || new Date(0);

    const rawImage = extractImage(item);
    const urlToImage = upgradeImageUrl(rawImage);

    items.push({
      title,
      url: link,
      description: desc,
      urlToImage,
      pubDate: pubDate.getTime(),
      timeAgo: pubDate.getTime() ? timeAgo(pubDate) : '',
      source: sourceName,
    });
  }
  return items;
}

const cache = { data: null, ts: 0 };
const TTL = 60 * 1000;

// 가디언 무료 키는 하루 500회·분당 12회 제한이라, 전체 TTL을 1분으로 낮추면
// 최악 1,440회/일로 한도를 넘긴다. 가디언 결과만 KV에 10분 따로 보관해서(인스턴스가
// 여러 개여도 합이 아닌 하루 144회 수준으로 억눌린다) 나머지 소스만 1분마다 새로 받는다.
// 가디언은 속보보다 칼럼·분석이 주라 신선도가 덜 중요하다.
const GUARDIAN_KEY = 'news:guardian';
const GUARDIAN_TTL_SEC = 600;
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
async function kvCmd(cmd){
  if(!KV_URL || !KV_TOKEN) return null;
  try{
    const r = await fetch(KV_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
      signal: AbortSignal.timeout(3000),
    });
    if(!r.ok) return null;
    return (await r.json()).result;
  }catch(_){ return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // 새 글이 올라오면 새로고침 한 번에 보이도록 캐시를 짧게 잡는다 — 서버 메모리 1분 +
  // CDN 1분 + 만료 직후 30초(swr)로 최악 2분 반. 브라우저는 max-age=0으로 두어
  // 새로고침할 때마다 CDN에 물어보게 한다(CDN 히트라 함수는 안 돌고 응답만 받는다).
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=30');

  if (cache.data && Date.now() - cache.ts < TTL) return res.json(cache.data);

  const allArticles = [];
  const sourceErrors = {};

  // ESPN API (아스날 뉴스, 고화질 이미지 포함)
  try {
    const espnRes = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/news?team=359&limit=10',
      { signal: AbortSignal.timeout(6000) }
    );
    if (espnRes.ok) {
      const espnData = await espnRes.json();
      const espnArticles = (espnData.articles || []).map(a => {
        const pub = new Date(a.published || Date.now());
        return {
          title:       decodeHtml(a.headline || ''),
          description: decodeHtml(a.description || ''),
          url:         a.links?.web?.href || '',
          image:       a.images?.[0]?.url || null,
          pubDate:     pub.getTime(),
          timeAgo:     timeAgo(pub),
          source:      'ESPN',
        };
      });
      allArticles.push(...espnArticles);
    } else {
      sourceErrors['ESPN'] = `HTTP ${espnRes.status}`;
    }
  } catch(e) { sourceErrors['ESPN'] = e.message; }

  // Guardian Open Platform API
  // q=arsenal로 검색하면 기본 정렬이 relevance라 최신 기사가 아니라 "관련도 높은"
  // 옛 라이브블로그·프리뷰가 뽑혔다(실측: 9/15 카라바오컵 입스위치전·9/16 다우먼 기사가
  // 빠지고 가장 최근이 9/12, 8월 프리뷰까지 섞임). order-by=newest만 붙이면 반대로
  // 스털링·맨유-브라이튼처럼 아스날이 본문에 한 번 언급된 기사가 섞이므로, 가디언이
  // 직접 붙이는 아스날 태그(football/arsenal)로 받는다.
  try {
    let gArticlesCached = await kvCmd(['GET', GUARDIAN_KEY]);
    if (gArticlesCached) {
      try { gArticlesCached = JSON.parse(gArticlesCached); } catch(_) { gArticlesCached = null; }
    }
    if (Array.isArray(gArticlesCached)) {
      // 캐시된 건 기사 내용이고, "N시간 전" 표기만 지금 기준으로 다시 만든다.
      allArticles.push(...gArticlesCached.map(a => ({ ...a, timeAgo: timeAgo(new Date(a.pubDate)) })));
    } else {
    const gKey = process.env.GUARDIAN_API_KEY || 'test';
    const gRes = await fetch(
      `https://content.guardianapis.com/search?tag=football/arsenal&order-by=newest&show-fields=thumbnail,trailText&page-size=15&api-key=${gKey}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (gRes.ok) {
      const gData = await gRes.json();
      // 여자팀 기사도 같은 football/arsenal 태그로 온다(별도 arsenalwomen 태그는 0건) —
      // RSS 경로와 같은 WOMEN_RE로 거른다.
      const gArticles = (gData.response?.results || []).filter(a => !WOMEN_RE.test(a.webTitle || '')).map(a => {
        const pub = new Date(a.webPublicationDate || Date.now());
        return {
          // Guardian의 trailText에는 <strong> 같은 태그가 그대로 들어있다 —
          // RSS 경로와 달리 이쪽은 decodeHtml을 안 태우고 있어서 카드에
          // 태그가 그대로 노출되고, 번역할 때도 태그째로 넘어간다.
          title:       decodeHtml(a.webTitle || ''),
          description: decodeHtml(a.fields?.trailText || ''),
          url:         a.webUrl || '',
          image:       a.fields?.thumbnail || null,
          pubDate:     pub.getTime(),
          timeAgo:     timeAgo(pub),
          source:      'Guardian',
        };
      });
      allArticles.push(...gArticles);
      if (gArticles.length) await kvCmd(['SET', GUARDIAN_KEY, JSON.stringify(gArticles), 'EX', String(GUARDIAN_TTL_SEC)]);
    } else {
      sourceErrors['Guardian'] = `HTTP ${gRes.status}`;
    }
    }
  } catch(e) { sourceErrors['Guardian'] = e.message; }

  // RSS 소스
  const terms = await loadTerms();
  const arsenalFilter = (title, desc) => !WOMEN_RE.test(title) && isArsenalText(title + ' ' + desc, terms);
  await Promise.all(RSS_SOURCES.map(async (src) => {
    try {
      const r = await fetch(src.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' },
        signal: AbortSignal.timeout(6000),
      });
      if (!r.ok) { sourceErrors[src.name] = `HTTP ${r.status}`; return; }
      const text = await r.text();
      const items = parseRSS(text, src.name, src.filterArsenal ? arsenalFilter : null);
      allArticles.push(...items);
    } catch (e) { sourceErrors[src.name] = e.message; }
  }));

  if (!allArticles.length) {
    // 출처가 전부 실패한 빈 응답은 CDN에 보관하지 않는다 — 15분 동안 모두에게 빈 목록이 나간다.
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ articles: [], source: 'none' });
  }

  // 최신순 정렬
  allArticles.sort((a, b) => b.pubDate - a.pubDate);

  // 중복 제거
  const seen = new Set();
  const unique = allArticles.filter(a => {
    const key = a.title.toLowerCase().substring(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const result = {
    // 12 → 20(사용자 지정). 자른 뒤에 번역하므로, 화면에 안 나올 기사에는 번역 문자 수를 쓰지 않는다.
    articles: unique.slice(0, 20).map(({ pubDate: _, ...a }) => a),
    source: 'RSS',
    sourceErrors: Object.keys(sourceErrors).length ? sourceErrors : undefined,
  };

  // BBC 이적설 코너 제목은 "내용 … - gossip" 형태인데, 구글이 gossip을 문장 안으로 녹여서
  // 하이픈만 덩그러니 남는다(실측: "…소문이 돌고 있다 -"). 꼬리표를 떼고 번역한 뒤 다시 붙여
  // 결과를 고정한다 — 구글이 어떻게 옮기든 "- 가십"이 그대로 남는다. BBC가 이 코너를 매일
  // 올려서 한 번 걸리면 계속 걸린다.
  // BBC는 제목 끝에 "- gossip", 스카이는 앞에 "Papers:"를 붙인다 — 둘 다 신문 가십
  // 모음 코너라 같은 표기로 묶는다. 꿀표를 달고 번역하면 이상해지므로(실측: "Papers:" →
  // "보도자료:" 또는 "언론 보도:"로 제각각) 번역 전에 떼고 끝난 뒤 한글 꿀표를 붙인다.
  const GOSSIP_TAG = /\s*[-–—]\s*gossip\s*$/i;
  const PAPERS_TAG = /^\s*papers:\s*/i;
  const gossipTagged = [];
  for (const a of result.articles) {
    if (typeof a.title !== 'string') continue;
    if (GOSSIP_TAG.test(a.title)) {
      a.title = a.title.replace(GOSSIP_TAG, '');
      gossipTagged.push({ article: a, suffix: ' - gossip' });
    } else if (PAPERS_TAG.test(a.title)) {
      a.title = a.title.replace(PAPERS_TAG, '');
      gossipTagged.push({ article: a, prefix: 'Papers: ' });
    }
  }

  // 헤드라인·요약 한글화. 목록을 12개로 자른 뒤에 번역해야 화면에 안 나올
  // 기사까지 문자 수를 쓰지 않는다. 실패하면 원문(영어)이 그대로 남는다.
  await translateFields(result.articles, ['title', 'description']);

  for (const { article, suffix, prefix } of gossipTagged) {
    // 꿀표를 떼고 번역하면 구글이 완결된 문장으로 보고 마침표를 붙인다 — 제목이라 떼고 붙인다.
    article.title = String(article.title).replace(/[\s.。]*[-–—]?[\s.。]*$/, '') + ' - 가십';
    // 원문 보기용 값도 원래 형태로 되돌린다
    if (article.titleEn) article.titleEn = (prefix || '') + article.titleEn + (suffix || '');
  }

  cache.data = result;
  cache.ts = Date.now();
  return res.json(result);
}