// api/_arsenalTerms.js — "아스날 얘기인가" 판별 (SNS·뉴스 공용)
// `_` 접두사라 Vercel 함수로 배포되지 않는 공용 모듈이다(_translate.js와 같은 방식).
//
// 예전엔 파일마다 고정 정규식이 따로 있었다(SNS: /arsenal|saka|rice|.../, 뉴스:
// /arsenal/). 세 가지가 문제였다 — 단어 경계가 없어 "price"가 rice로 걸리고,
// "Ødegaard"는 ø 때문에 odegaard에 안 걸리고, 선수 명단이 몇 시즌 전 그대로라
// 지금 선수 대부분이 빠져 있었다(뉴스는 아예 "arsenal" 한 단어뿐).
// 그래서 키워드를 Fotmob 1군 명단 + 감독에서 자동으로 만들고(KV 12시간 — 이적시장에
// 명단이 바뀌어도 반나절 안에 따라간다), 본문·키워드를 둘 다 악센트를 뗀 소문자
// 단어열로 바꿔 "단어 단위"로 비교한다.

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
export function normText(s) {
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

// 1군 명단 + 감독 이름으로 키워드 목록. Fotmob을 못 부르면 FALLBACK_NAMES(KV엔 안 넣음).
export async function loadTerms() {
  const hit = await kvCmd(['GET', 'arsenalTerms']);
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
  if (names !== FALLBACK_NAMES) await kvCmd(['SET', 'arsenalTerms', JSON.stringify(terms), 'EX', String(12 * 60 * 60)]);
  return terms;
}

export function isArsenalText(text, terms) {
  if (HASHTAG_RE.test(text)) return true;
  const t = normText(text);
  return terms.some(term => t.includes(' ' + term + ' '));
}
