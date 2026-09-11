// api/videos.js — Vercel Serverless Function
// Arsenal 공식 유튜브 채널 최신 영상 12개.
//
// 목록 소스는 YouTube Data API v3가 기본이다. 예전엔 목록을 RSS 피드로 받고
// API는 임베드 가능 여부 확인에만 썼는데, 유튜브 RSS가 통째로 404/500을 내는
// 장애가 있어(2026-09-11, 다른 채널 RSS도 같이 죽음) 키가 멀쩡해도 영상 탭이
// 비었다. 그래서 순서를 API → RSS(예비) → 마지막 성공 목록(KV) 으로 둔다.
// API 비용: 업로드 목록 1 + 영상 상세 1 = 호출당 2단위(무료 하루 10,000),
// 30분 메모리 캐시가 있어 실제 사용량은 하루 수백 단위 수준.

import { translateFields } from './_translate.js';

const CHANNEL_ID = 'UCpryVRk_VDudG8SHXgWcG0w'; // Arsenal 공식 채널
// 채널의 "업로드" 재생목록 id는 채널 id의 앞 UC를 UU로 바꾼 것(추가 조회 불필요)
const UPLOADS_PLAYLIST = 'UU' + CHANNEL_ID.slice(2);
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const LIMIT = 12;
const LAST_GOOD_KEY = `videos:last:${CHANNEL_ID}`;

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvGetJSON(key) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const r = await fetch(KV_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['GET', key]),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const { result } = await r.json();
    return result ? JSON.parse(result) : null;
  } catch { return null; }
}

// 만료 없이 저장 — 장애·재배포 직후에 보여줄 "마지막으로 성공한 목록"
async function kvSetJSON(key, data) {
  if (!KV_URL || !KV_TOKEN) return;
  try {
    await fetch(KV_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['SET', key, JSON.stringify(data)]),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* 저장 실패는 무시 */ }
}

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

// 구글 API 에러 본문에는 요청에 쓴 키가 그대로 들어있을 수 있어서(_translate.js의
// callGoogle과 같은 이유) 상태 코드만 에러 메시지로 남긴다.
async function ytApi(path, apiKey) {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}&key=${apiKey}`,
    { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`YouTube API: HTTP ${r.status}`);
  return r.json();
}

// ── 1순위: Data API ──
async function fetchViaApi(apiKey) {
  const pl = await ytApi(`playlistItems?part=contentDetails&maxResults=${LIMIT + 4}&playlistId=${UPLOADS_PLAYLIST}`, apiKey);
  const ids = (pl.items || []).map((i) => i.contentDetails?.videoId).filter(Boolean);
  if (!ids.length) throw new Error('YouTube API: 업로드 목록 비어 있음');
  const vd = await ytApi(`videos?part=snippet,status&id=${ids.join(',')}`, apiKey);
  return (vd.items || [])
    // 비공개/일부공개 영상, 아직 시작 전인 예약 프리미어는 재생이 안 되니 뺀다
    .filter((it) => it.status?.privacyStatus === 'public' && it.snippet?.liveBroadcastContent !== 'upcoming')
    .map((it) => {
      const th = it.snippet.thumbnails || {};
      return {
        videoId: it.id,
        title: it.snippet.title || '',
        thumbnail: (th.high || th.medium || th.default || {}).url || `https://i.ytimg.com/vi/${it.id}/hqdefault.jpg`,
        pubDate: Date.parse(it.snippet.publishedAt) || 0,
        embeddable: it.status?.embeddable !== false,
      };
    });
}

// ── 2순위: RSS(키 불필요) ──
function parseFeed(text) {
  const videos = [];
  for (const m of text.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const entry = m[1];
    const videoId = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1];
    if (!videoId) continue;
    const pub = entry.match(/<published>(.*?)<\/published>/)?.[1] || '';
    videos.push({
      videoId,
      title: decodeHtml(entry.match(/<title>(.*?)<\/title>/)?.[1] || ''),
      thumbnail: entry.match(/<media:thumbnail url="([^"]+)"/)?.[1] || '',
      pubDate: pub ? new Date(pub).getTime() : 0,
    });
  }
  return videos;
}

// RSS엔 임베드 차단 여부가 없어서, 키가 있으면 API로 그것만 보충한다. 실패하면
// 전부 임베드 가능으로 간주(목록 자체가 죽으면 안 되니까).
async function fetchEmbeddableMap(videoIds, apiKey) {
  if (!apiKey || !videoIds.length) return {};
  try {
    const data = await ytApi(`videos?part=status&id=${videoIds.join(',')}`, apiKey);
    const map = {};
    (data.items || []).forEach((item) => { map[item.id] = item.status?.embeddable !== false; });
    return map;
  } catch { return {}; }
}

async function fetchViaRss(apiKey) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    'Accept': 'application/rss+xml, application/atom+xml, text/xml, */*',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  // 유튜브 RSS는 가끔 일시적으로 404/5xx를 돌려줘서 짧게 3회까지 재시도
  let text, lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(FEED_URL, { headers, signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(`YouTube RSS: HTTP ${r.status}`);
      text = await r.text(); break;
    } catch (e) { lastErr = e; if (attempt < 2) await new Promise((res) => setTimeout(res, 400)); }
  }
  if (text === undefined) throw lastErr;
  const videos = parseFeed(text).sort((a, b) => b.pubDate - a.pubDate).slice(0, LIMIT);
  const embedMap = await fetchEmbeddableMap(videos.map((v) => v.videoId), apiKey);
  return videos.map((v) => ({ ...v, embeddable: embedMap[v.videoId] !== undefined ? embedMap[v.videoId] : true }));
}

const cache = { data: null, ts: 0 };
const TTL = 30 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=1800');

  if (cache.data && Date.now() - cache.ts < TTL) return res.json(cache.data);

  const apiKey = process.env.YOUTUBE_API_KEY;
  const errors = [];
  let videos = null, source = null;

  if (apiKey) {
    try { videos = await fetchViaApi(apiKey); source = 'YouTube API'; }
    catch (e) { errors.push(e.message); }
  }
  if (!videos || !videos.length) {
    try { videos = await fetchViaRss(apiKey); source = 'YouTube RSS'; }
    catch (e) { errors.push(e.message); }
  }

  if (!videos || !videos.length) {
    // 둘 다 실패 — 메모리 캐시(같은 인스턴스) → KV의 마지막 성공 목록 순으로 대체
    if (cache.data) return res.json(cache.data);
    const last = await kvGetJSON(LAST_GOOD_KEY);
    if (last && last.videos?.length) {
      // 저장 당시의 "N분 전"은 낡았으니 저장해 둔 게시 시각으로 다시 계산
      last.videos = last.videos.map((v) => ({ ...v, timeAgo: v.publishedAt ? timeAgo(v.publishedAt) : v.timeAgo }));
      return res.json({ ...last, stale: true, error: errors.join(' / ') });
    }
    return res.json({ videos: [], source: 'none', error: errors.join(' / ') });
  }

  const result = {
    videos: videos
      .sort((a, b) => b.pubDate - a.pubDate)
      .slice(0, LIMIT)
      .map(({ pubDate, ...v }) => ({
        ...v,
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
        timeAgo: pubDate ? timeAgo(pubDate) : '',
        publishedAt: pubDate,
      })),
    source,
  };

  // 영상 제목 한글화 (실패 시 원문 유지)
  await translateFields(result.videos, ['title']);

  cache.data = result;
  cache.ts = Date.now();
  await kvSetJSON(LAST_GOOD_KEY, result);
  return res.json(result);
}
