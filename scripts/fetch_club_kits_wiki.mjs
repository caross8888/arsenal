// 커리어 모드 구단 유니폼 무늬·소매 색 원자료 수집(1회성) — 영문 위키백과 구단 문서 정보칸({{Infobox football club}})의 홈 유니폼 값.
//   node scripts/fetch_club_kits_wiki.mjs   → scripts/out/club_kits_wiki_raw.json
// 이 작업 환경에선 위키백과가 429로 막혀 GitHub Actions(club-kits-wiki.yml)에서 돌린다.
// 정보칸은 유니폼을 그림이 아니라 부위별 값으로 적는다: leftarm1·body1·rightarm1(색) + pattern_la1·pattern_b1·pattern_ra1(무늬 그림 이름).
// 소매 색(아스날 흰 소매 등)과 일반 무늬(_stripes·_hoops·_sash…)를 여기서 얻는다. 표로 정리하는 건 build_club_colors.mjs.
// 구단 찾기: club_colors_raw.json의 영문 이름(Fotmob) + 나라로 위키백과 검색, 정보칸 틀이 있는 문서만(hastemplate).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const raw = JSON.parse(readFileSync(new URL('./out/club_colors_raw.json', import.meta.url)));
const UA = {'User-Agent': 'arsenal-dashboard-career-kits/1.0 (https://github.com/caross8888/arsenal; one-off data build)'};
const API = 'https://en.wikipedia.org/w/api.php';
const NAT = {ENG:'England', ESP:'Spain', GER:'Germany', ITA:'Italy', FRA:'France', POR:'Portugal', NED:'Netherlands', BEL:'Belgium', BRA:'Brazil',
  ARG:'Argentina', NOR:'Norway', KOR:'South Korea', JPN:'Japan', USA:'United States', NGA:'Nigeria'};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = async (params, tries = 4) => {
  const url = API + '?' + new URLSearchParams({...params, format: 'json', formatversion: '2', maxlag: '5'});
  for(let i = 0; i < tries; i++){
    try{ const r = await fetch(url, {headers: UA, signal: AbortSignal.timeout(20000)}); if(r.ok) return await r.json(); console.log('HTTP', r.status, url); }
    catch(e){ console.log('ERR', e.message); }
    await sleep(3000 * (i + 1));
  }
  return null;
};
const KEYS = ['leftarm1', 'body1', 'rightarm1', 'shorts1', 'socks1', 'pattern_la1', 'pattern_b1', 'pattern_ra1'];
const kitOf = text => {
  const o = {};
  for(const k of KEYS){
    const m = text.match(new RegExp('\\|\\s*' + k + '\\s*=\\s*([^|\\n}]*)'));
    if(m) o[k] = m[1].replace(/<!--.*?-->/g, '').trim();
  }
  return o;
};

const out = {};
for(const [id, c] of Object.entries(raw)){
  const q = `${c.name} ${NAT[c.nat] || ''} hastemplate:"Infobox football club"`;
  const s = await getJSON({action: 'query', list: 'search', srsearch: q, srlimit: '3'});
  const hits = (s?.query?.search || []).map(h => h.title);
  let page = null, kit = {};
  for(const title of hits){
    const p = await getJSON({action: 'parse', page: title, prop: 'wikitext', section: '0', redirects: '1'});
    const text = p?.parse?.wikitext || '';
    const k = kitOf(text);
    if(k.body1 || k.pattern_b1){ page = p.parse.title; kit = k; break; }
    await sleep(300);
  }
  out[id] = {ko: c.ko, nat: c.nat, name: c.name, page, hits, kit};
  console.log(c.nat, id, c.name, '→', page || '-', JSON.stringify(kit));
  await sleep(500);
}
mkdirSync(new URL('./out/', import.meta.url), {recursive: true});
writeFileSync(new URL('./out/club_kits_wiki_raw.json', import.meta.url), JSON.stringify(out, null, 1));
const v = Object.values(out);
console.log('done', v.length, 'matched', v.filter(x => x.page).length, 'with sleeves≠body', v.filter(x => x.kit.leftarm1 && x.kit.body1 && x.kit.leftarm1.toLowerCase() !== x.kit.body1.toLowerCase()).length);
