// 공용 데이터 미리 만들기(사용자 지정 — Cloudflare 요청 수 줄이기). 모든 방문자에게 같은 응답(메인 화면 묶음·미디어·
// 커리어 랭킹·공휴일)을 크론이 1분마다 확인해 R2 버킷(coyg-data)에 JSON으로 올린다. 방문자는 data.coyg.co.kr에서
// 이 파일을 받아 가고, CDN 캐시 규칙이 1분씩 들고 있어서 방문자가 늘어도 Worker 실행은 늘지 않는다.
// 화면은 파일이 없거나 오래되면 지금처럼 /api로 받는다(public/index.html의 dataFile) — 여기가 멈춰도 사이트는 돈다.
//
// 항목마다 보관 시간(ttl)이 있고, 지난 것만 다시 만든다. 직전 파일을 읽어 판단하므로 크론 인스턴스가 새로 떠도
// 원본(Fotmob 등) 호출이 그 주기대로만 일어난다. 다시 만든 결과가 직전과 같으면 파일을 다시 쓰지 않는다.
//
// 한 번에 다 만들지 않는다 — Cloudflare 무료 플랜은 실행 한 번에 외부 요청(fetch, Upstash 포함)이 50번까지라,
// 메인 8종·미디어 3종·랭킹 4종을 한꺼번에 만들면 넘어서 뒤쪽이 "Too many subrequests"로 실패했다(실측).
// 그래서 하나씩 만들며 외부 요청 수를 세고, BUDGET을 넘으면 남은 건 다음 분으로 넘긴다. 순위표·일정이 먼저,
// 나머지는 오래된 순서. R2 쓰기·읽기(바인딩)는 이 한도에 안 들어간다.

const SEC = 1000;
const BUDGET = 30;   // 한 실행에 쓸 외부 요청 상한(한도 50 — 한 항목이 최대 15~20번 쓸 수 있어 여유를 둔다)
// 메인 화면 묶음 — public/index.html의 HOME_TYPES와 같은 8종. 순위표·일정은 경기 직후 바로 바뀌어야 해서 1분.
const HOME_PARTS = {
  fixtures: 60, standings: 60, roundResults: 300, teamOfTheWeek: 300,
  leaders: 300, injuries: 300, transfers: 600, squad: 600,
};
// 한 파일 = 한 응답. query는 화면이 기본으로 부르는 것과 같아야 한다. list가 있으면 빈 목록은 올리지 않는다.
const SINGLE = () => {
  const y = new Date(Date.now() + 9 * 3600 * SEC).getUTCFullYear();   // 화면은 한국 날짜 기준 올해를 부른다
  return [
    {file: 'news.json',   name: 'news',   query: {}, ttl: 300, list: 'articles'},
    {file: 'social.json', name: 'social', query: {}, ttl: 300, list: 'posts'},
    {file: 'videos.json', name: 'videos', query: {}, ttl: 300, list: 'videos'},
    {file: 'board-ALL.json', name: 'career', query: {a: 'board'}, ttl: 300},
    {file: 'board-FW.json',  name: 'career', query: {a: 'board', p: 'FW'}, ttl: 300},
    {file: 'board-MF.json',  name: 'career', query: {a: 'board', p: 'MF'}, ttl: 300},
    {file: 'board-DF.json',  name: 'career', query: {a: 'board', p: 'DF'}, ttl: 300},
    {file: `holidays-${y}.json`, name: 'holidays', query: {year: String(y)}, ttl: 86400},
  ];
};
// 내용이 그대로여도 이만큼 지나면 다시 쓴다 — 화면은 at이 15분 넘은 파일을 버리고 /api로 간다.
const HEARTBEAT = 5 * 60;
const OBJ_OPTS = {httpMetadata: {contentType: 'application/json; charset=utf-8', cacheControl: 'public, max-age=30, s-maxage=60'}};

async function readFile(bucket, file){
  try { const o = await bucket.get(file); return o ? await o.json() : null; } catch(_){ return null; }
}
const age = at => at ? Date.now() - Date.parse(at) : Infinity;
const due = (at, ttl) => age(at) >= ttl * SEC;

// 이 실행 동안의 외부 요청 수 — 같은 인스턴스의 다른 요청 것도 섞일 수 있지만 그만큼 보수적으로 멈출 뿐이다.
function countFetches(){
  const outer = globalThis.fetch;
  let n = 0;
  globalThis.fetch = (...a) => { n++; return outer(...a); };
  return {used: () => n, restore: () => { globalThis.fetch = outer; }};
}

// call(name, query) → 핸들러 응답 JSON(200이 아니거나 no-store면 null) — worker.js가 넘겨준다.
export async function runSnapshots(bucket, call){
  if(!bucket) return console.error('[snapshot] R2 바인딩(DATA) 없음');
  const now = new Date().toISOString(), done = [], skipped = [];
  const prev = await readFile(bucket, 'home.json');
  const parts = {...((prev && prev.parts) || {})};
  const singles = await Promise.all(SINGLE().map(async f => ({...f, old: await readFile(bucket, f.file)})));

  // 할 일 목록: 메인 항목과 단일 파일 중 보관 시간이 지난 것. 순위표·일정 먼저, 나머지는 오래된 순.
  const jobs = [
    ...Object.entries(HOME_PARTS).filter(([t, ttl]) => due(parts[t] && parts[t].at, ttl))
      .map(([t]) => ({kind: 'part', type: t, first: t === 'fixtures' || t === 'standings', age: age(parts[t] && parts[t].at)})),
    ...singles.filter(f => due(f.old && f.old.at, f.ttl)).map(f => ({kind: 'file', f, first: false, age: age(f.old && f.old.at)})),
  ].sort((a, b) => (b.first - a.first) || (b.age - a.age));

  const meter = countFetches();
  let homeChanged = false;
  try {
    for(const j of jobs){
      if(meter.used() >= BUDGET){ skipped.push(j.kind === 'part' ? j.type : j.f.file); continue; }
      if(j.kind === 'part'){
        const data = await call('football', {type: j.type}).catch(() => null);
        if(!data || data.error) continue;   // 실패하면 직전 것을 둔다(화면은 너무 오래된 항목만 /api로 받는다)
        if(!parts[j.type] || JSON.stringify(parts[j.type].data) !== JSON.stringify(data)) homeChanged = true;
        parts[j.type] = {at: now, data};
      } else {
        const f = j.f, data = await call(f.name, f.query).catch(() => null);
        if(!data || data.error) continue;
        if(f.list && !(Array.isArray(data[f.list]) && data[f.list].length)) continue;   // 빈 목록 = 출처가 잠깐 실패
        if(f.old && JSON.stringify(f.old.data) === JSON.stringify(data) && !due(f.old.at, HEARTBEAT)) continue;
        await bucket.put(f.file, JSON.stringify({v: 1, at: now, data}), OBJ_OPTS);
        done.push(f.file);
      }
    }
  } finally { meter.restore(); }
  if(homeChanged || !prev || due(prev.at, HEARTBEAT)){
    await bucket.put('home.json', JSON.stringify({v: 1, at: now, parts}), OBJ_OPTS);
    done.push('home');
  }
  console.log('[snapshot] 갱신 ' + (done.join(', ') || '없음') + (skipped.length ? ' · 다음 분으로 ' + skipped.join(', ') : '') + ' · 외부 요청 ' + meter.used());
}
