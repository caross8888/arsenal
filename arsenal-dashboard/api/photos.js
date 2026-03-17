// api/photos.js — Vercel Serverless Function
const WIKI_MAP = {
  'David Raya': 'David_Raya',
  'Kepa Arrizabalaga': 'Kepa_Arrizabalaga',
  'Tommy Setford': 'Tommy_Setford',
  'William Saliba': 'William_Saliba',
  'Gabriel Magalhães': 'Gabriel_Magalh%C3%A3es_(footballer,_born_1997)',
  'Jurrien Timber': 'Jurri%C3%ABn_Timber',
  'Ben White': 'Ben_White_(footballer)',
  'Riccardo Calafiori': 'Riccardo_Calafiori',
  'Myles Lewis-Skelly': 'Myles_Lewis-Skelly',
  'Piero Hincapié': 'Piero_Hinc%C3%A0pie',
  'Cristhian Mosquera': 'Cristhian_Mosquera',
  'Martin Ødegaard': 'Martin_%C3%98degaard',
  'Declan Rice': 'Declan_Rice',
  'Martín Zubimendi': 'Mart%C3%ADn_Zubimendi',
  'Mikel Merino': 'Mikel_Merino',
  'Leandro Trossard': 'Leandro_Trossard',
  'Christian Nørgaard': 'Christian_N%C3%B8rgaard',
  'Bukayo Saka': 'Bukayo_Saka',
  'Martinelli': 'Gabriel_Martinelli',
  'Gabriel': 'Gabriel_Magalh%C3%A3es_(footballer,_born_1997)',
  'Viktor Gyökeres': 'Viktor_Gy%C3%B6k%C3%A9res',
  'Gabriel Jesus': 'Gabriel_Jesus',
  'Kai Havertz': 'Kai_Havertz',
  'Eberechi Eze': 'Eberechi_Eze',
  'Noni Madueke': 'Noni_Madueke',
};

function toWikiTitle(name) {
  if (WIKI_MAP[name]) return WIKI_MAP[name];
  return encodeURIComponent(name.replace(/ /g, '_'));
}

const cache = {};
const TTL = 24 * 60 * 60 * 1000;

async function fetchWikiPhoto(name) {
  const title = toWikiTitle(name);
  try {
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`, {
      headers: { 'User-Agent': 'Arsenal-Dashboard/1.0' },
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return null;
    const json = await r.json();
    return json.thumbnail?.source || null;
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=86400');

  const namesParam = req.query.names || '';
  if (!namesParam) return res.status(400).json({ error: 'names 파라미터 필요' });

  const names = namesParam.split(',').map(n => n.trim()).filter(Boolean).slice(0, 30);
  const cacheKey = [...names].sort().join(',');
  if (cache[cacheKey] && Date.now() - cache[cacheKey].ts < TTL) return res.json(cache[cacheKey].data);

  const results = await Promise.all(names.map(async name => ({ name, photo: await fetchWikiPhoto(name) })));
  const photoMap = {};
  results.forEach(r => { photoMap[r.name] = r.photo; });

  const result = { photos: photoMap };
  cache[cacheKey] = { data: result, ts: Date.now() };
  return res.json(result);
}
