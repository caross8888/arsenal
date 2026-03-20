export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch('https://www.skysports.com/arsenal-news', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(8000),
    });
    const html = await r.text();
    // href 패턴 다양하게 시도
    const patterns = [
      /href="(\/football\/news\/[^"]+)"/g,
      /href="(https?:\/\/www\.skysports\.com\/football\/news\/[^"]+)"/g,
      /href="([^"]*arsenal[^"]*news[^"]*)"/gi,
      /"url":"(https?:\/\/www\.skysports\.com\/football\/news\/[^"]+)"/g,
    ];
    const results = patterns.map((p,i) => {
      const matches = [...html.matchAll(p)].map(m=>m[1]).slice(0,3);
      return {pattern: i, matches};
    });
    // href 샘플 아무거나
    const anyHrefs = [...html.matchAll(/href="([^"]{20,80})"/g)].map(m=>m[1]).filter(h=>!h.includes('static') && !h.includes('.css') && !h.includes('.js')).slice(0,10);
    return res.json({results, anyHrefs});
  } catch(e) {
    return res.json({err: e.message});
  }
}
