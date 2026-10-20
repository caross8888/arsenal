// 공용 데이터 미리 만들기(사용자 지정 — Cloudflare 요청 수 줄이기). 모든 방문자에게 같은 응답(메인 화면 묶음·미디어·
// 커리어 랭킹·공휴일)을 크론이 1분마다 확인해 R2 버킷(coyg-data)에 JSON으로 올린다. 방문자는 data.coyg.co.kr에서
// 이 파일을 받아 가고, CDN 캐시 규칙이 1분씩 들고 있어서 방문자가 늘어도 Worker 실행은 늘지 않는다.
// 화면은 파일이 없거나 오래되면 지금처럼 /api로 받는다(public/index.html의 dataFile) — 여기가 멈춰도 사이트는 돈다.
//
// 항목마다 보관 시간(ttl)이 있고, 지난 것만 다시 만든다. 직전 파일을 읽어 판단하므로 크론 인스턴스가 새로 떠도
// 원본(Fotmob 등) 호출이 그 주기대로만 일어난다(새 인스턴스가 득점 순위를 매번 다시 긁으면 Fotmob 호출이 100번 넘게 난다).
// 다시 만든 결과가 직전과 같으면 파일을 다시 쓰지 않는다(파일의 at이 너무 오래되지 않는 한).

const SEC = 1000;
// 메인 화면 묶음 — public/index.html의 HOME_TYPES와 같은 8종. 순위표·일정은 경기 직후 바로 바뀌어야 해서 1분.
const HOME_PARTS = {
  fixtures: 60, standings: 60, roundResults: 300, teamOfTheWeek: 300,
  leaders: 300, injuries: 300, transfers: 600, squad: 600,
};
// 한 파일 = 한 응답. path는 /api 아래 엔드포인트, query는 화면이 기본으로 부르는 것과 같아야 한다.
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
const HEARTBEAT = 5 * 60 * SEC;
const OBJ_OPTS = {httpMetadata: {contentType: 'application/json; charset=utf-8', cacheControl: 'public, max-age=30, s-maxage=60'}};

async function readFile(bucket, file){
  try { const o = await bucket.get(file); return o ? await o.json() : null; } catch(_){ return null; }
}
const due = (at, ttl) => !at || Date.now() - Date.parse(at) >= ttl * SEC;

// call(name, query) → 핸들러 응답 JSON(200이 아니면 null) — worker.js가 넘겨준다.
export async function runSnapshots(bucket, call){
  if(!bucket) return console.error('[snapshot] R2 바인딩(DATA) 없음');
  const now = new Date().toISOString(), report = [];

  // 메인 묶음: 지난 항목만 다시 만들고 나머지는 직전 파일 것을 그대로 둔다
  const prev = await readFile(bucket, 'home.json');
  const parts = {...((prev && prev.parts) || {})};
  let changed = false;
  await Promise.all(Object.entries(HOME_PARTS).map(async ([type, ttl]) => {
    if(!due(parts[type] && parts[type].at, ttl)) return;
    const data = await call('football', {type}).catch(() => null);
    if(!data || data.error) return;   // 실패하면 직전 것을 둔다(화면은 항목이 너무 오래되면 그 항목만 /api로 받는다)
    if(!parts[type] || JSON.stringify(parts[type].data) !== JSON.stringify(data)) changed = true;
    parts[type] = {at: now, data};
  }));
  if(changed || !prev || due(prev.at, HEARTBEAT / SEC)){
    await bucket.put('home.json', JSON.stringify({v: 1, at: now, parts}), OBJ_OPTS);
    report.push('home');
  }

  for(const f of SINGLE()){
    const old = await readFile(bucket, f.file);
    if(old && !due(old.at, f.ttl)) continue;
    const data = await call(f.name, f.query).catch(() => null);
    if(!data || data.error) continue;
    // 빈 목록은 올리지 않는다(출처가 잠깐 실패한 것) — 직전 파일이 남거나, 없으면 화면이 /api로 받는다
    if(f.list && !(Array.isArray(data[f.list]) && data[f.list].length)) continue;
    if(old && JSON.stringify(old.data) === JSON.stringify(data) && !due(old.at, HEARTBEAT / SEC)) continue;
    await bucket.put(f.file, JSON.stringify({v: 1, at: now, data}), OBJ_OPTS);
    report.push(f.file);
  }
  console.log('[snapshot] 갱신 ' + (report.join(', ') || '없음'));
}
