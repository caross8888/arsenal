// 커리어 모드 구단 색 원자료 수집(1회성) — 이 작업 환경에선 Fotmob·ESPN 접속이 막혀 있어 GitHub Actions(club-colors.yml)에서 돌린다.
//   node scripts/fetch_club_colors.mjs   → scripts/out/club_colors_raw.json
// Fotmob 팀 데이터(api/data/teams)에서 색처럼 생긴 값(#hex)을 경로째 모으고, ESPN 리그 팀 목록의 color·alternateColor를 영문 이름으로 붙인다.
// 최종 표(주색·보조색·줄무늬)는 이 원자료를 보고 api/_career_data.js의 CLUB_COLORS로 정리한다.
import { writeFileSync, mkdirSync } from 'node:fs';
import { CLUBS } from '../arsenal-dashboard/api/_career_data.js';

const UA = {'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = async (url, tries = 3) => {
  for(let i = 0; i < tries; i++){
    try{ const r = await fetch(url, {headers: UA, signal: AbortSignal.timeout(15000)}); if(r.ok) return await r.json(); console.log('HTTP', r.status, url); }
    catch(e){ console.log('ERR', e.message, url); }
    await sleep(1500*(i+1));
  }
  return null;
};
// 객체 안에서 #hex 색 값을 경로와 함께 모은다(너무 깊거나 큰 배열은 앞부분만)
const colorsIn = (o, path = '', out = {}, depth = 0) => {
  if(!o || typeof o !== 'object' || depth > 6) return out;
  for(const [k, v] of Object.entries(o).slice(0, 200)){
    const p = path ? path+'.'+k : k;
    if(typeof v === 'string' && /^#?[0-9a-f]{6}$/i.test(v) && /colou?r|kit|shirt|font/i.test(p)) out[p] = v.startsWith('#') ? v : '#'+v;
    else if(typeof v === 'object' && !/fixtures|matches|table|squad|transfers|stats|history|news/i.test(k)) colorsIn(v, p, out, depth+1);
  }
  return out;
};
const norm = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\b(fc|afc|cf|sc|ac|as|ssc|sv|vfb|vfl|tsg|bsc|rc|ogc|cd|ud|sd|rcd|ca|club|de|cr|ec|se|fk|bk|if|sk)\b/g,'').replace(/[^a-z0-9]/g,'');

const ESPN_LEAGUES = ['eng.1','eng.2','esp.1','esp.2','ger.1','ger.2','ita.1','ita.2','fra.1','fra.2','por.1','ned.1','bel.1','bra.1','arg.1','usa.1','jpn.1','kor.1','nor.1','sco.1','tur.1','mex.1'];
const espn = [];
for(const lg of ESPN_LEAGUES){
  const j = await getJSON(`https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/teams`);
  const teams = j?.sports?.[0]?.leagues?.[0]?.teams || [];
  for(const t of teams){ const x = t.team||{}; espn.push({lg, name:x.displayName, short:x.shortDisplayName, color:x.color ? '#'+x.color : null, alt:x.alternateColor ? '#'+x.alternateColor : null}); }
  console.log('ESPN', lg, teams.length);
}

const out = {};
let first = true;
for(const [nat, list] of Object.entries(CLUBS)){
  for(const [ko, , id] of list){
    const j = await getJSON(`https://www.fotmob.com/api/data/teams?id=${id}`);
    const name = j?.details?.name || j?.details?.shortName || null;
    const fm = j ? colorsIn(j) : {};
    if(first && j){ first = false; console.log('FOTMOB TOP KEYS', Object.keys(j)); console.log('FOTMOB COLORS SAMPLE', JSON.stringify(fm)); }
    const n = norm(name), e = name ? espn.find(t => norm(t.name) === n || norm(t.short) === n) || espn.find(t => n.length > 4 && (norm(t.name).includes(n) || n.includes(norm(t.name)))) : null;
    out[id] = {ko, nat, name, fm, espn: e ? {name:e.name, lg:e.lg, color:e.color, alt:e.alt} : null};
    console.log(nat, id, ko, name, Object.values(fm).slice(0,3).join(' '), e ? e.color+'/'+e.alt : '-');
    await sleep(400);
  }
}
mkdirSync(new URL('./out/', import.meta.url), {recursive: true});
writeFileSync(new URL('./out/club_colors_raw.json', import.meta.url), JSON.stringify(out, null, 1));
console.log('done', Object.keys(out).length, 'with fotmob colors', Object.values(out).filter(x => Object.keys(x.fm).length).length, 'with espn', Object.values(out).filter(x => x.espn).length);
