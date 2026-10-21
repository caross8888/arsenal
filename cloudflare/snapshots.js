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
// 메인 화면 묶음 — public/index.html의 HOME_TYPES와 같은 8종. 숫자는 보관 시간(초)이다.
// {live, idle}인 항목은 경기가 있어야 바뀌므로(사용자 지정 — 바뀐 게 없어도 확인할 때마다 KV·원본을 읽어서,
// 매분 확인하면 방문자가 없어도 일정·순위표만 하루 약 2,900회였다) 경기 시간대엔 live, 나머지는 idle.
// 경기 시간대 = 킥오프 30분 전 ~ after시간 후. 일정은 아스날 경기만, pl이 붙은 건 PL 전체 킥오프
// (roundResults의 kickoffs)도 본다 — 순위·득점 순위는 다른 팀 경기로도 바뀐다. 득점 순위는 Fotmob 집계가
// 경기 뒤 늦게 붙는 경우가 있어 더 길게 본다. 시각은 직전 파일에서 읽으므로 원본 호출이 늘지 않고,
// 시각을 모르면 live로 둔다. 일정 변경(킥오프 시각 확정·연기)은 경기와 무관하게 나오지만 30분이면 충분하다.
const HOME_PARTS = {
  fixtures:      {live: 60,  idle: 1800},
  standings:     {live: 60,  idle: 3600, pl: true},
  roundResults:  {live: 300, idle: 3600, pl: true},
  teamOfTheWeek: {live: 300, idle: 3600, pl: true, after: 24},
  leaders:       {live: 300, idle: 3600, pl: true, after: 6},
  injuries: 300, transfers: 600, squad: 600,
};
const WINDOW_BEFORE = 30 * 60 * SEC;
function partTtl(type, parts){
  const cfg = HOME_PARTS[type];
  if(typeof cfg === 'number') return cfg;
  const fx = (parts.fixtures && parts.fixtures.data && parts.fixtures.data.matches) || [];
  if(fx.some(m => m.status === 'IN_PLAY')) return cfg.live;
  const times = fx.map(m => m.utcDate);
  if(cfg.pl){
    const rr = (parts.roundResults && parts.roundResults.data) || {};
    times.push(...(rr.kickoffs || []), ...(rr.matches || []).map(m => m.utcDate));
  }
  if(!times.length) return cfg.live;
  const now = Date.now(), after = (cfg.after || 3) * 3600 * SEC;
  return times.some(t => { const d = now - Date.parse(t); return d >= -WINDOW_BEFORE && d <= after; }) ? cfg.live : cfg.idle;
}
// 한 파일 = 한 응답. query는 화면이 기본으로 부르는 것과 같아야 한다. list가 있으면 빈 목록은 올리지 않는다.
const SINGLE = () => {
  const y = new Date(Date.now() + 9 * 3600 * SEC).getUTCFullYear();   // 화면은 한국 날짜 기준 올해를 부른다
  return [
    {file: 'news.json',   name: 'news',   query: {}, ttl: 300, list: 'articles'},
    {file: 'social.json', name: 'social', query: {}, ttl: 300, list: 'posts'},
    {file: 'videos.json', name: 'videos', query: {}, ttl: 300, list: 'videos'},
    {file: 'board-ALL.json', name: 'career', query: {a: 'board'}, ttl: 300, board: true},
    {file: 'board-FW.json',  name: 'career', query: {a: 'board', p: 'FW'}, ttl: 300, board: true},
    {file: 'board-MF.json',  name: 'career', query: {a: 'board', p: 'MF'}, ttl: 300, board: true},
    {file: 'board-DF.json',  name: 'career', query: {a: 'board', p: 'DF'}, ttl: 300, board: true},
    {file: `holidays-${y}.json`, name: 'holidays', query: {year: String(y)}, ttl: 86400},
  ];
};
// 내용이 그대로여도 이만큼 지나면 다시 쓴다 — 화면은 at이 15분 넘은 파일을 버리고 /api로 간다.
const HEARTBEAT = 5 * 60;
const OBJ_OPTS = {httpMetadata: {contentType: 'application/json; charset=utf-8', cacheControl: 'public, max-age=30, s-maxage=60'}};

async function readFile(bucket, file){
  try { const o = await bucket.get(file); return o ? await o.json() : null; } catch(_){ return null; }
}
// R2가 가끔 일시 오류(10001 internal error)를 낸다. 저장 하나가 실패해도 실행 전체가 끊기지 않게, 한 번 더 시도하고
// 그래도 안 되면 그 파일만 건너뛴다(다음 분에 다시 만든다).
async function put(bucket, file, body){
  for(let i = 0; i < 2; i++){
    try { await bucket.put(file, body, OBJ_OPTS); return true; }
    catch(e){ if(i) console.error('[snapshot] 저장 실패 ' + file + ': ' + e.message); }
  }
  return false;
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

  // 메인 항목의 at은 "이 시각에도 이 내용이 맞다", built는 실제로 다시 만든 시각. 보관 시간은 built로 재고,
  // 보관 시간 안이라 일부러 안 만든 항목은 at만 새로 찍는다 — 화면은 at이 15분 넘은 항목을 버리고 /api로
  // 가므로, 1시간짜리 항목도 크론이 살아 있는 한 버려지지 않는다(만들다 실패한 항목은 at을 안 찍는다).
  const built = p => p && (p.built || p.at);
  const fresh = Object.keys(HOME_PARTS).filter(t => parts[t] && !due(built(parts[t]), partTtl(t, parts)));
  // 할 일 목록: 메인 항목과 단일 파일 중 보관 시간이 지난 것. 순위표·일정 먼저, 나머지는 오래된 순.
  const jobs = [
    ...Object.keys(HOME_PARTS).filter(t => due(built(parts[t]), partTtl(t, parts)))
      .map(t => ({kind: 'part', type: t, first: t === 'fixtures' || t === 'standings', age: age(built(parts[t]))})),
    ...singles.filter(f => due(f.old && f.old.at, f.ttl)).map(f => ({kind: 'file', f, first: false, age: age(f.old && f.old.at)})),
  ].sort((a, b) => (b.first - a.first) || (b.age - a.age));

  const meter = countFetches();
  let homeChanged = false, boardVer;   // 랭킹 버전 — 이번 실행에서 처음 필요할 때 한 번만 읽는다
  // 랭킹은 등록이 있을 때만 바뀐다. 버전이 그대로면 다시 읽지 않고(KV 16회 → 1회) 직전 내용에 시각만 새로 찍는다.
  // 닉네임 변경은 버전을 안 올리므로 1시간이 지나면 버전과 상관없이 다시 만든다.
  const boardSame = async f => {
    if(boardVer === undefined) boardVer = ((await call('career', {a: 'boardver'}).catch(() => null)) || {}).v;
    return boardVer != null && f.old && f.old.ver === boardVer && age(f.old.built || f.old.at) < 3600 * SEC;   // built: 실제로 다시 만든 시각(시각만 새로 찍을 땐 그대로)
  };
  try {
    for(const j of jobs){
      if(meter.used() >= BUDGET){ skipped.push(j.kind === 'part' ? j.type : j.f.file); continue; }
      if(j.kind === 'part'){
        const data = await call('football', {type: j.type}).catch(() => null);
        if(!data || data.error) continue;   // 실패하면 직전 것을 둔다(화면은 너무 오래된 항목만 /api로 받는다)
        if(!parts[j.type] || JSON.stringify(parts[j.type].data) !== JSON.stringify(data)) homeChanged = true;
        parts[j.type] = {at: now, built: now, data};
      } else {
        const f = j.f;
        if(f.board && await boardSame(f)){
          await put(bucket, f.file, JSON.stringify({...f.old, at: now}));
          continue;
        }
        const data = await call(f.name, f.query).catch(() => null);
        if(!data || data.error) continue;
        if(f.list && !(Array.isArray(data[f.list]) && data[f.list].length)) continue;   // 빈 목록 = 출처가 잠깐 실패
        if(f.old && JSON.stringify(f.old.data) === JSON.stringify(data) && !due(f.old.at, HEARTBEAT)) continue;
        if(await put(bucket, f.file, JSON.stringify({v: 1, at: now, data, ...(f.board && boardVer != null ? {ver: boardVer, built: now} : {})}))) done.push(f.file);
      }
    }
  } finally { meter.restore(); }
  if(homeChanged || !prev || due(prev.at, HEARTBEAT)){
    for(const t of fresh) parts[t] = {...parts[t], built: built(parts[t]), at: now};
    if(await put(bucket, 'home.json', JSON.stringify({v: 1, at: now, parts}))) done.push('home');
  }
  console.log('[snapshot] 갱신 ' + (done.join(', ') || '없음') + (skipped.length ? ' · 다음 분으로 ' + skipped.join(', ') : '') + ' · 외부 요청 ' + meter.used());
}
