// api/holidays.js — 한국 공휴일 (일정 달력의 빨간 날 표시용)
//
// 출처는 구글 "대한민국의 휴일" 캘린더의 공개 ICS다. API 키가 필요 없고,
// 대체공휴일이 "쉬는 날 ○○"이라는 별도 항목으로 들어와서 그대로 쓸 수 있다.
// 항목마다 DESCRIPTION이 "공휴일"과 "기념일"로 갈려 있어서, 실제로 쉬는 날만
// 골라낼 수 있다(제헌절·스승의날·크리스마스 이브 등은 기념일이라 빠진다).
//
// 다른 후보와 비교한 결과(실측):
// - date.nager.at: 키는 필요 없지만 2026년 응답에 제헌절이 공휴일로 들어있고
//   (2008년부터 공휴일 아님) 연휴가 토요일과 겹칠 때의 대체공휴일이 빠진다.
// - 공공데이터포털 특일정보(한국천문연구원): 가장 권위 있지만 API 키가 필요하다.
//
// 구글 데이터의 한계 둘:
// - 임시공휴일이나 뒤늦게 확정된 대체공휴일은 반영까지 며칠 걸린다(2026년 추석
//   대체휴무가 작성 시점에 아직 없다) — 그래서 올해·내년분은 캐시를 짧게 둔다.
// - 노동절 분류가 연도마다 흔들린다(2021년 기념일 / 2026년 공휴일). 근로자의 날은
//   관공서 공휴일은 아니지만 실제로 쉬는 사람이 많아 늘 표시한다(사용자 지정).

const ICS_URL = 'https://calendar.google.com/calendar/ical/ko.south_korea%23holiday%40group.v.calendar.google.com/public/basic.ics';

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

// 달력 칸이 한 줄에 3~4자밖에 안 들어가서, 화면에 쓸 짧은 이름으로 바꾼다.
// 여기 없는 이름은 원문 그대로 내보낸다(새 공휴일이 생겨도 일단 뜨게).
function displayName(summary){
  const s = String(summary || '').trim();
  if(/^쉬는\s*날/.test(s)) return '대체휴무';          // 쉬는 날 광복절 → 대체휴무
  if(/추석/.test(s)) return '추석';                     // 추석 연휴 → 추석
  if(/설날/.test(s)) return '설날';
  if(/새해/.test(s)) return '신정';
  if(/크리스마스|성탄/.test(s)) return '성탄절';
  if(/선거/.test(s)) return '선거일';                   // 지방선거일·대통령 선거 → 선거일
  if(/근로자의\s*날/.test(s)) return '노동절';
  return s;
}

// 공휴일로 분류되지 않은 해에도 표시할 날(사용자 지정)
const ALWAYS = /노동절|근로자의\s*날/;
// 구글이 공휴일로 넣어도 제외할 날 — 제헌절은 2008년부터 공휴일이 아니다.
// 실측: 같은 제헌절이 2023년은 '기념일', 2026년은 '공휴일'로 온다(구글 분류가 흔들림).
const NEVER = /제헌절/;

function parseIcs(text){
  // 줄바꿈 뒤 공백으로 이어지는 접힌 줄(folding)을 먼저 편다
  const unfolded = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const byYear = {};
  for(const block of unfolded.split('BEGIN:VEVENT').slice(1)){
    const body = block.split('END:VEVENT')[0];
    const date = (body.match(/DTSTART[^:\n]*:(\d{8})/) || [])[1];
    const summary = (body.match(/SUMMARY:([^\r\n]+)/) || [])[1];
    const desc = (body.match(/DESCRIPTION:([^\r\n]*)/) || [])[1] || '';
    if(!date || !summary) continue;
    if(NEVER.test(summary)) continue;
    if(!/^\s*공휴일/.test(desc) && !ALWAYS.test(summary)) continue;
    const y = date.slice(0, 4);
    const key = `${y}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    (byYear[y] = byYear[y] || {})[key] = displayName(summary);
  }
  return byYear;
}

let memo = null, memoTs = 0;
const MEMO_TTL = 60 * 60 * 1000;

async function allYears(){
  if(memo && Date.now() - memoTs < MEMO_TTL) return memo;
  const r = await fetch(ICS_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; arsenal-dashboard)' },
    signal: AbortSignal.timeout(8000),
  });
  if(!r.ok) throw new Error(`google ics: ${r.status}`);
  const parsed = parseIcs(await r.text());
  if(Object.keys(parsed).length){ memo = parsed; memoTs = Date.now(); }
  return parsed;
}

export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');

  const year = String(parseInt(req.query.year, 10) || new Date().getFullYear());
  if(!/^\d{4}$/.test(year)) return res.status(400).json({ error: 'year 파라미터가 필요합니다' });

  const curYear = new Date().getFullYear();
  const isPast = Number(year) < curYear;   // 지난 해는 더 바뀔 일이 없다
  // 지난 해는 브라우저·CDN에도 길게, 올해·내년은 하루만 — 임시공휴일이 뒤늦게 붙을 수 있다.
  res.setHeader('Cache-Control', isPast
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400');

  const kvKey = `holidays:${year}`;
  try{
    const hit = await kvCmd(['GET', kvKey]);
    if(hit){
      try{ return res.json({ year, holidays: JSON.parse(hit) }); }catch(_){ /* 깨진 값이면 다시 받는다 */ }
    }

    const byYear = await allYears();
    const holidays = byYear[year] || {};
    // 지난 해는 영구 보관, 올해·내년은 7일 — 구글이 뒤늦게 대체공휴일을 추가하는 경우가 있다.
    if(Object.keys(holidays).length){
      await kvCmd(isPast ? ['SET', kvKey, JSON.stringify(holidays)]
                         : ['SET', kvKey, JSON.stringify(holidays), 'EX', String(7 * 24 * 60 * 60)]);
    }
    return res.json({ year, holidays });
  }catch(err){
    // 공휴일은 있으면 좋은 정보지, 없다고 달력이 안 떠서는 안 된다 — 빈 목록으로 응답한다.
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ year, holidays: {}, error: err.message });
  }
}
