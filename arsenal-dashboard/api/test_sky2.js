export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const r = await fetch('https://www.skysports.com/rss/12040', {
    headers: {'User-Agent':'Mozilla/5.0 Arsenal-Dashboard/1.0'},
    signal: AbortSignal.timeout(6000),
  });
  const text = await r.text();
  // 모든 기사 제목 추출
  const titles = [...text.matchAll(/<title><!\[CDATA\[([^\]]+)\]\]><\/title>|<title>([^<]+)<\/title>/g)]
    .slice(1).map(m=>(m[1]||m[2]||'').trim());
  const arsenalTitles = titles.filter(t=>/arsenal/i.test(t));
  return res.json({
    total: titles.length,
    arsenalCount: arsenalTitles.length,
    allTitles: titles,
    arsenalTitles,
  });
}
