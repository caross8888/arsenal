// api/news.js — Vercel Serverless Function
// Guardian Arsenal RSS + Sky Sports + BBC Sport RSS
// 최신순 정렬, 이미지 URL 정상화

const RSS_SOURCES = [
  {
    url: 'https://feeds.bbci.co.uk/sport/football/rss.xml',
    name: 'BBC Sport',
    filter: /arsenal/i,
  },
  
];

function decodeHtml(str) {
  return (str||'')
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&apos;/g,"'")
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
    const title = decodeHtml(
      item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ||
      item.match(/<title>(.*?)<\/title>/)?.[1] || ''
    );
    if (!title) continue;
    if (filter && !filter.test(title)) continue;

    const link = (
      item.match(/<link>(.*?)<\/link>/)?.[1] ||
      item.match(/<guid[^>]*isPermaLink="true"[^>]*>(.*?)<\/guid>/)?.[1] || ''
    ).trim();

    const desc = decodeHtml(
      item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] ||
      item.match(/<description>(.*?)<\/description>/)?.[1] || ''
    ).substring(0, 150);

    const pub = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
    const pubDate = pub ? new Date(pub) : new Date(0);

    const rawImage = extractImage(item);
    const urlToImage = upgradeImageUrl(rawImage);

    items.push({
      title,
      url: link,
      description: desc,
      urlToImage,
      pubDate: pubDate.getTime(),
      timeAgo: pub ? timeAgo(pubDate) : '',
      source: sourceName,
    });
  }
  return items;
}

const cache = { data: null, ts: 0 };
const TTL = 15 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=900');

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
          title:       a.headline || '',
          description: a.description || '',
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
  try {
    const gKey = process.env.GUARDIAN_API_KEY || 'test';
    const gRes = await fetch(
      `https://content.guardianapis.com/search?q=arsenal&section=football&show-fields=thumbnail,trailText&page-size=10&api-key=${gKey}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (gRes.ok) {
      const gData = await gRes.json();
      const gArticles = (gData.response?.results || []).map(a => {
        const pub = new Date(a.webPublicationDate || Date.now());
        return {
          title:       a.webTitle || '',
          description: a.fields?.trailText || '',
          url:         a.webUrl || '',
          image:       a.fields?.thumbnail || null,
          pubDate:     pub.getTime(),
          timeAgo:     timeAgo(pub),
          source:      'Guardian',
        };
      });
      allArticles.push(...gArticles);
    } else {
      sourceErrors['Guardian'] = `HTTP ${gRes.status}`;
    }
  } catch(e) { sourceErrors['Guardian'] = e.message; }

  // Sky Sports 스크래핑 (Arsenal 뉴스 페이지 HTML 파싱)
  try {
    const skyRes = await fetch('https://www.skysports.com/arsenal-news', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (skyRes.ok) {
      const html = await skyRes.text();
      // 링크: /football/news/숫자/숫자/... 패턴
      const linkMatches = [...new Set([...html.matchAll(/href="(\/football\/news\/\d+\/\d+\/[^"]+)"/g)].map(m => m[1]))];
      // 이미지: e0.365dm.com CDN
      const imgMatches = [...html.matchAll(/src="(https:\/\/e0\.365dm\.com[^"]+\.jpg[^"]*)"/g)].map(m => m[1]);
      // 제목: 다양한 클래스에서 추출
      const titleMatches = [...html.matchAll(/class="[^"]*(?:sdc-site-tile__headline-text|news-list__headline|sdc-article-list__headline)[^"]*"[^>]*>([^<]+)<\/[a-z]+>/g)].map(m => m[1].trim());

      // 링크, 이미지, 제목을 순서대로 매핑
      const skyArticles = linkMatches.slice(0, 8).map((link, i) => {
        const pub = new Date();
        return {
          title:       titleMatches[i] || '',
          description: '',
          url:         'https://www.skysports.com' + link,
          image:       imgMatches[i] || null,
          pubDate:     pub.getTime(),
          timeAgo:     '오늘',
          source:      'Sky Sports',
        };
      }).filter(a => a.title);
      allArticles.push(...skyArticles);
    } else {
      sourceErrors['Sky Sports'] = `HTTP ${skyRes.status}`;
    }
  } catch(e) { sourceErrors['Sky Sports'] = e.message; }

  // RSS 소스
  await Promise.all(RSS_SOURCES.map(async (src) => {
    try {
      const r = await fetch(src.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 Arsenal-Dashboard/1.0' },
        signal: AbortSignal.timeout(6000),
      });
      if (!r.ok) { sourceErrors[src.name] = `HTTP ${r.status}`; return; }
      const text = await r.text();
      const items = parseRSS(text, src.name, src.filter);
      allArticles.push(...items);
    } catch (e) { sourceErrors[src.name] = e.message; }
  }));

  if (!allArticles.length) {
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
    articles: unique.slice(0, 12).map(({ pubDate: _, ...a }) => a),
    source: 'RSS',
    sourceErrors: Object.keys(sourceErrors).length ? sourceErrors : undefined,
  };
  cache.data = result;
  cache.ts = Date.now();
  return res.json(result);
}
