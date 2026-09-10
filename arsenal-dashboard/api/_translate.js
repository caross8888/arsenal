// api/_translate.js — Google Cloud Translation API(v2) 공용 헬퍼 (en → ko)
//
// 이 파일은 `_`로 시작하므로 Vercel이 서버리스 함수로 배포하지 않는다 —
// news/social/videos 같은 실제 엔드포인트가 import해서 쓰는 공용 모듈이다.
//
// 설계 원칙 3가지:
//  1. **절대 화면을 깨뜨리지 않는다.** 키가 없든, 할당량이 끝났든, 구글이
//     5xx를 주든, 타임아웃이 나든 — 전부 조용히 원문(영어)을 그대로 돌려준다.
//     번역은 어디까지나 부가 기능이라, 실패가 뉴스/SNS/영상 목록 자체를
//     못 띄우게 만드는 일은 없어야 한다.
//  2. **한 번 번역한 문장은 두 번 다시 API를 안 탄다.** Upstash KV에 TTL
//     없이(영구) 저장한다. 키는 "원문 해시"다 — 기사 URL이나 포스트 URI 같은
//     식별자로 키를 잡으면 제목이 수정됐을 때 옛 번역이 그대로 나가고, 한
//     아이템이 제목·요약처럼 여러 필드를 가질 때 키를 또 쪼개야 한다.
//     원문 해시로 잡으면 (a) 원문이 바뀌면 키가 저절로 바뀌어 재번역되고
//     (b) 소스가 달라도 같은 문장이면 한 번만 번역하며 (c) 필드 구분이
//     필요 없다.
//  3. **비용 상한은 이중으로.** GCP 콘솔 쪽에 일일 15,000자 할당량이 걸려
//     있고, 여기서 월 사용량도 따로 세서 소프트 컷오프를 건다. 어느 쪽에
//     걸리든 결과는 "원문 그대로 노출"이다.

import { createHash } from 'crypto';
import { applyGlossary, applyGlossaryToSegments, prepareSource } from './_glossary.js';

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY;

const ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';
const TARGET_LANG = 'ko';

// 무료 티어가 월 50만자라, 여유를 두고 45만자에서 끊는다. 콘솔의 일일
// 15,000자 할당량이 사실상 월 45만자 상한이라 이 값에 먼저 닿을 일은
// 거의 없지만, 할당량 설정이 실수로 풀렸을 때를 대비한 2차 방어선이다.
const MONTHLY_SOFT_LIMIT = 450000;
const USAGE_TTL_SEC = 70 * 24 * 60 * 60; // 두 달치만 남기고 알아서 만료

// 한 아이템이 지나치게 길면(긴 SNS 스레드 등) 잘라서 보낸다 — 카드에
// 표시되는 분량을 훨씬 넘는 부분까지 돈 내고 번역할 이유가 없다.
const MAX_CHARS_PER_ITEM = 1200;
// 구글 v2는 요청 하나에 세그먼트 128개까지 받는다. 요청 크기도 같이
// 감안해 보수적으로 잡는다.
const BATCH_SEGMENTS = 64;
const BATCH_CHARS = 5000;

const HANGUL = /[가-힣]/;

// format별로 캐시 네임스페이스를 분리한다 — 같은 문장이라도 평문으로 보낸
// 결과와 HTML로 보낸 결과(태그 포함)는 다른 값이라 섞이면 안 된다.
function cacheKey(text, prefix) {
  return (prefix || 'tr:ko:') + createHash('sha1').update(text).digest('hex');
}

function usageKey(now) {
  const d = now || new Date();
  return 'trUsage:' + d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

// 번역할 가치가 있는 문자열인지 — 빈 값, 너무 짧은 값, 이미 한글이 섞인
// 값(이미 번역된 캐시가 흘러들어온 경우)은 건너뛴다. 로마자가 두 글자도
// 없는 문자열(숫자·기호만)도 마찬가지.
function shouldTranslate(text) {
  if (typeof text !== 'string') return false;
  const t = text.trim();
  if (t.length < 3) return false;
  if (HANGUL.test(t)) return false;
  if (!/[A-Za-z]{2}/.test(t)) return false;
  return true;
}

function clamp(text) {
  return text.length > MAX_CHARS_PER_ITEM ? text.slice(0, MAX_CHARS_PER_ITEM) : text;
}

async function kvPipeline(commands) {
  if (!KV_URL || !KV_TOKEN || !commands.length) return null;
  try {
    const r = await fetch(KV_URL + '/pipeline', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

async function kvCommand(cmd) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const r = await fetch(KV_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const { result } = await r.json();
    return result;
  } catch (e) { return null; }
}

// 캐시된 번역 일괄 조회 — 개별 GET을 N번 던지지 않고 MGET 하나로.
async function loadCached(texts, prefix) {
  const out = {};
  if (!texts.length) return out;
  const keys = texts.map(t => cacheKey(t, prefix));
  const result = await kvCommand(['MGET'].concat(keys));
  if (!Array.isArray(result)) return out;
  result.forEach((v, i) => { if (v) out[texts[i]] = v; });
  return out;
}

async function saveCached(pairs, prefix) {
  const cmds = Object.keys(pairs).map(src => ['SET', cacheKey(src, prefix), pairs[src]]);
  if (cmds.length) await kvPipeline(cmds);
}

async function getMonthlyUsage() {
  const v = await kvCommand(['GET', usageKey()]);
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

async function addMonthlyUsage(chars) {
  if (!chars) return;
  const key = usageKey();
  await kvPipeline([['INCRBY', key, String(chars)], ['EXPIRE', key, String(USAGE_TTL_SEC)]]);
}

// 실제 구글 호출 — 한 번에 texts 배열 전체. 실패하면 null.
async function callGoogle(texts, format) {
  try {
    const r = await fetch(ENDPOINT + '?key=' + encodeURIComponent(API_KEY), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: texts, source: 'en', target: TARGET_LANG, format: format || 'text' }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      // 403(할당량 초과·키 제한)도 여기로 온다 — 구글 에러 본문엔 요청에
      // 쓴 API 키가 그대로 박혀 나오는 경우가 있어서, 상태 코드만 남기고
      // 본문은 절대 로그에 찍지 않는다.
      console.warn('[translate] HTTP ' + r.status);
      return null;
    }
    const data = await r.json();
    const list = data && data.data && data.data.translations;
    if (!Array.isArray(list) || list.length !== texts.length) return null;
    return list.map(t => (t && typeof t.translatedText === 'string') ? t.translatedText : null);
  } catch (e) {
    console.warn('[translate] ' + e.message);
    return null;
  }
}

/**
 * 문자열 배열을 번역한다. 반환값은 원문 → 번역문 맵이며, 번역이 안 된
 * 문자열은 아예 맵에 안 들어있다(호출부에서 원문 유지하면 됨).
 *
 * format='html'이면 구글이 태그를 건드리지 않고 그 사이 텍스트만 번역한다
 * (translateSegments가 쓰는 경로). 이땐 호출부가 이미 유효성/길이를
 * 검사한 뒤라 여기선 추가로 거르지 않는다.
 */
export async function translateTexts(rawTexts, opts) {
  const format = (opts && opts.format) || 'text';
  const isHtml = format === 'html';
  const prefix = isHtml ? 'tr:koh:' : 'tr:ko:';
  const map = {};
  if (!API_KEY) return map;

  // 중복 제거 + 번역 대상 선별 + 길이 클램프
  const uniq = [];
  const seen = new Set();
  for (const raw of rawTexts) {
    if (typeof raw !== 'string' || !raw) continue;
    // HTML 모드에서 길이로 잘라내면 태그 한가운데가 잘려 마크업이 깨진다 —
    // 클램프/필터는 호출부(translateSegments)가 평문 기준으로 이미 했다.
    if (!isHtml && !shouldTranslate(raw)) continue;
    const t = isHtml ? raw : clamp(raw);
    if (seen.has(t)) continue;
    seen.add(t);
    uniq.push(t);
  }
  if (!uniq.length) return map;

  // 실제로 구글에 보낼 문자열. 평문 모드는 여기서 원문 구문 치환(prepareSource)을
  // 적용하고, HTML 모드는 호출부(translateSegments)가 조각 단위로 이미 적용했다.
  // 캐시 키도 이 "보낼 문자열" 기준이라, 치환 규칙에 안 걸린 원문은 치환 전후가
  // 똑같아 기존 캐시를 그대로 탄다(재번역 0). 반환 맵은 호출부가 원문으로 찾으므로
  // 마지막에 원문 → 번역문으로 되돌려 매핑한다.
  const sendOf = new Map(uniq.map(t => [t, isHtml ? t : prepareSource(t)]));
  const sends = Array.from(new Set(sendOf.values()));
  const bySend = {};
  const resolve = () => {
    for (const t of uniq) { const v = bySend[sendOf.get(t)]; if (v) map[t] = v; }
    return finalizeMap(map, isHtml);
  };

  // 1) 캐시 먼저
  const cached = await loadCached(sends, prefix);
  Object.assign(bySend, cached);
  const missing = sends.filter(t => !cached[t]);
  if (!missing.length) return resolve();

  // 2) 월 사용량 컷오프 — 넘었으면 새 번역은 포기하고 캐시된 것만 돌려준다
  const used = await getMonthlyUsage();
  if (used >= MONTHLY_SOFT_LIMIT) {
    console.warn('[translate] 월 한도 도달 (' + used + '자) — 원문 유지');
    return resolve();
  }
  let budget = MONTHLY_SOFT_LIMIT - used;

  // 3) 배치로 나눠 호출
  const fresh = {};
  let batch = [], batchChars = 0, spent = 0;
  const flush = async () => {
    if (!batch.length) return;
    const sent = batch;
    batch = []; batchChars = 0;
    const got = await callGoogle(sent, format);
    if (!got) return; // 실패한 배치는 그냥 원문 유지
    got.forEach((ko, i) => { if (ko) fresh[sent[i]] = ko; });
    spent += sent.reduce((s, t) => s + t.length, 0);
  };

  for (const t of missing) {
    if (t.length > budget) break; // 남은 예산으로 감당 안 되면 거기서 중단
    budget -= t.length;
    if (batch.length >= BATCH_SEGMENTS || batchChars + t.length > BATCH_CHARS) await flush();
    batch.push(t);
    batchChars += t.length;
  }
  await flush();

  if (spent) await addMonthlyUsage(spent);
  if (Object.keys(fresh).length) {
    // KV엔 구글이 준 원본 번역문을 그대로 저장한다 — 표기 통일은 출력 시점에만
    // 적용해서, 사전을 나중에 고쳐도 이미 캐시된 번역까지 전부 재번역 없이
    // 교정되게 한다.
    await saveCached(fresh, prefix);
    Object.assign(bySend, fresh);
  }
  return resolve();
}

// HTML 모드에선 여기서 치환하지 않는다 — 태그/속성 안까지 건드릴 위험이 있어서,
// translateSegments가 조각으로 되돌린 뒤 텍스트 조각에만 적용한다.
function finalizeMap(map, isHtml) {
  if (isHtml) return map;
  for (const k of Object.keys(map)) map[k] = applyGlossary(map[k]);
  return map;
}

/**
 * 객체 배열의 지정한 필드들을 제자리에서 번역한다.
 * 번역이 실제로 일어난 필드만 원문을 `<필드명>En`에 남겨둔다 —
 * 프론트에서 "원문 보기"를 붙이고 싶을 때 쓰면 되고, 안 쓰면 그냥 무시되는
 * 값이라 기존 렌더링 코드는 손댈 필요가 없다.
 */
export async function translateFields(items, fields) {
  if (!API_KEY || !Array.isArray(items) || !items.length) return items;
  const texts = [];
  for (const it of items) {
    for (const f of fields) {
      const v = it && it[f];
      if (shouldTranslate(v)) texts.push(clamp(v));
    }
  }
  const map = await translateTexts(texts);
  if (!Object.keys(map).length) return items;
  for (const it of items) {
    for (const f of fields) {
      const v = it && it[f];
      if (!shouldTranslate(v)) continue;
      const ko = map[clamp(v)];
      if (ko && ko !== v) { it[f + 'En'] = v; it[f] = ko; }
    }
  }
  return items;
}

// ── 링크가 섞인 본문(Bluesky segments) 번역 ─────────────────────────────
//
// 텍스트 조각만 따로따로 번역하면 두 가지가 깨진다: (1) 링크 앞뒤 공백이
// 구글 쪽에서 잘려나가 "몇 가지 생각@handle"처럼 붙어버리고, (2) 문장 중간에
// 박힌 해시태그(#AFC)가 문장을 두 동강 내서 앞뒤가 서로 다른 문장처럼
// 번역된다. 그래서 조각을 <a> 태그로 이어붙인 HTML 한 덩어리로 만들어
// format='html'로 보낸다 — 구글이 태그는 그대로 두고 그 사이 텍스트만
// 번역하며, 한국어 어순에 맞춰 태그 위치까지 알아서 옮겨준다(실측 확인).
// 앵커 안은 translate="no"로 막아 핸들·URL 표기가 변형되지 않게 한다.

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function unescapeHtml(s) {
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&'); // &amp;는 반드시 마지막에
}

function segmentsToHtml(segments) {
  const links = [];
  let html = '';
  for (const seg of segments) {
    if (seg && seg.type === 'link') {
      html += '<a data-i="' + links.length + '" translate="no">' + escapeHtml(seg.text || '') + '</a>';
      links.push(seg);
    } else {
      html += escapeHtml(prepareSource((seg && seg.text) || '')).replace(/\n/g, '<br>');
    }
  }
  return { html, links };
}

// 번역된 HTML을 다시 segments로 되돌린다. 앵커가 하나라도 유실·중복되면
// null을 돌려주고, 호출부는 원문 조각을 그대로 쓴다(부분 손상된 본문을
// 내보내느니 영어 원문이 낫다).
function htmlToSegments(html, links) {
  const out = [];
  const usedIdx = new Set();
  const pushText = (raw) => {
    if (!raw) return;
    const t = unescapeHtml(raw.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''));
    if (t) out.push({ type: 'text', text: t });
  };
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let last = 0, m;
  while ((m = re.exec(html)) !== null) {
    pushText(html.slice(last, m.index));
    const idxM = m[1].match(/data-i="(\d+)"/);
    const idx = idxM ? parseInt(idxM[1], 10) : NaN;
    const link = links[idx];
    if (!link || usedIdx.has(idx)) return null;
    usedIdx.add(idx);
    // 표시 텍스트는 번역문이 아니라 원문 조각을 그대로 쓴다 — 핸들이나
    // 잘린 URL 표기가 어떤 이유로든 변형되면 안 되는 값이라서.
    out.push({ type: 'link', text: link.text, url: link.url });
    last = re.lastIndex;
  }
  pushText(html.slice(last));
  if (usedIdx.size !== links.length) return null;
  return tidySegments(out);
}

// 구글은 <a> 앞뒤에 공백을 한 칸씩 넣어주는데, 원문에서 링크가 줄 첫머리에
// 있었거나 뒤에 쉼표가 붙어있던 경우 그 공백이 "\n www.…" / "@handle ,"
// 처럼 어색하게 남는다. 눈에 보이는 자리만 정리한다.
function tidySegments(segs) {
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.type === 'link') continue;
    let t = s.text.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n');
    if (i > 0 && segs[i - 1].type === 'link') t = t.replace(/^[ \t]+([,.!?;:])/, '$1');
    s.text = t;
  }
  return segs.filter(s => s.type === 'link' || s.text);
}

/**
 * `segments`(그리고 평문 `text`)를 가진 아이템 배열을 제자리에서 번역한다.
 * segments가 없는 아이템은 호출부에서 translateFields로 따로 처리하면 된다.
 */
export async function translateSegments(items) {
  if (!API_KEY || !Array.isArray(items) || !items.length) return items;

  const jobs = [];
  for (const it of items) {
    const segs = it && it.segments;
    if (!Array.isArray(segs) || !segs.length) continue;
    const plain = segs.map(s => (s && s.text) || '').join('');
    // 길이·언어 판정은 태그 없는 평문 기준으로 — 태그를 포함해서 재면
    // 짧은 본문이 길다고 잘못 걸러진다.
    if (!shouldTranslate(plain) || plain.length > MAX_CHARS_PER_ITEM) continue;
    const built = segmentsToHtml(segs);
    jobs.push({ item: it, html: built.html, links: built.links });
  }
  if (!jobs.length) return items;

  const map = await translateTexts(jobs.map(j => j.html), { format: 'html' });
  if (!Object.keys(map).length) return items;

  for (const job of jobs) {
    const ko = map[job.html];
    if (!ko || ko === job.html) continue;
    const rebuilt = htmlToSegments(ko, job.links);
    if (!rebuilt) continue; // 앵커 유실 — 원문 유지
    applyGlossaryToSegments(rebuilt);
    job.item.textEn = job.item.text;
    job.item.segments = rebuilt;
    job.item.text = rebuilt.map(s => s.text).join('');
  }
  return items;
}

export { shouldTranslate };
