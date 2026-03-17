// netlify/functions/photos.js
// Wikipedia API로 아스날 선수 사진 조회
// 완전 무료, 인증 없음, Creative Commons 라이선스

// 선수 이름 → Wikipedia 제목 매핑
// football-data.org 이름과 Wikipedia 제목이 다른 경우만 명시
const WIKI_MAP = {
  // GK
  'David Raya': 'David_Raya',
  'Kepa Arrizabalaga': 'Kepa_Arrizabalaga',
  'Tommy Setford': 'Tommy_Setford',

  // DF
  'William Saliba': 'William_Saliba',
  'Gabriel Magalhães': 'Gabriel_Magalh%C3%A3es_(footballer,_born_1997)',
  'Jurriën Timber': 'Jurri%C3%ABn_Timber',
  'Ben White': 'Ben_White_(footballer)',
  'Riccardo Calafiori': 'Riccardo_Calafiori',
  'Myles Lewis-Skelly': 'Myles_Lewis-Skelly',
  'Piero Hincapié': 'Piero_Hinc%C3%A0pie',
  'Cristhian Mosquera': 'Cristhian_Mosquera',

  // MF
  'Martin Ødegaard': 'Martin_%C3%98degaard',
  'Declan Rice': 'Declan_Rice',
  'Martín Zubimendi': 'Mart%C3%ADn_Zubimendi',
  'Mikel Merino': 'Mikel_Merino',
  'Thomas Partey': 'Thomas_Partey',
  'Leandro Trossard': 'Leandro_Trossard',
  'Ethan Nwaneri': 'Ethan_Nwaneri',
  'Christian Nørgaard': 'Christian_N%C3%B8rgaard',

  // FW
  'Bukayo Saka': 'Bukayo_Saka',
  'Gabriel Martinelli': 'Gabriel_Martinelli',
  'Kai Havertz': 'Kai_Havertz',
  'Eberechi Eze': 'Eberechi_Eze',
  'Viktor Gyökeres': 'Viktor_Gy%C3%B6k%C3%A9res',
  'Gabriel Jesus': 'Gabriel_Jesus',
  'Noni Madueke': 'Noni_Madueke',
};

function toWikiTitle(name) {
  // 매핑에 있으면 그걸 쓰고, 없으면 공백→언더바 변환
  if (WIKI_MAP[name]) return WIKI_MAP[name];
  return encodeURIComponent(name.replace(/ /g, '_'));
}

const cache = {};
const TTL = 24 * 60 * 60 * 1000; // 24시간 (사진은 자주 안 바뀜)
function getCache(k) { const c = cache[k]; return (c && Date.now() - c.ts < TTL) ? c.data : null; }
function setCache(k, d) { cache[k] = { data: d, ts: Date.now() }; }

async function fetchWikiPhoto(name) {
  const title = toWikiTitle(name);
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Arsenal-Dashboard/1.0 (https://github.com/caross8888/arsenal)' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.thumbnail?.source || null;
  } catch {
    return null;
  }
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=86400',
  };

  // names 파라미터: 쉼표로 구분된 선수 이름들
  const namesParam = event.queryStringParameters?.names || '';
  if (!namesParam) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'names 파라미터 필요' }) };
  }

  const names = namesParam.split(',').map(n => n.trim()).filter(Boolean).slice(0, 30);

  // 캐시 확인 (전체 배치 캐시)
  const cacheKey = names.sort().join(',');
  const hit = getCache(cacheKey);
  if (hit) return { statusCode: 200, headers, body: JSON.stringify(hit) };

  // Wikipedia API 병렬 조회 (최대 30명)
  const results = await Promise.all(
    names.map(async name => ({
      name,
      photo: await fetchWikiPhoto(name),
    }))
  );

  const photoMap = {};
  results.forEach(r => { photoMap[r.name] = r.photo; });

  const result = { photos: photoMap };
  setCache(cacheKey, result);

  return { statusCode: 200, headers, body: JSON.stringify(result) };
};
