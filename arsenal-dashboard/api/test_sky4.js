export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch('https://www.skysports.com/arsenal-news', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });
    const html = await r.text();
    // 기사 링크 패턴 추출
    const articlePattern = /href="(https:\/\/www\.skysports\.com\/football\/news\/[^"]+)"/g;
    const links = [...new Set([...html.matchAll(articlePattern)].map(m => m[1]))].slice(0, 5);
    // 이미지 패턴
    const imgPattern = /src="(https:\/\/e0\.365dm\.com[^"]+\.jpg[^"]*)"/g;
    const imgs = [...new Set([...html.matchAll(imgPattern)].map(m => m[1]))].slice(0, 5);
    // 제목 패턴
    const titlePattern = /<a[^>]*class="[^"]*news-list__headline[^"]*"[^>]*>([^<]+)<\/a>|<span[^>]*class="[^"]*sdc-site-tile__headline-text[^"]*"[^>]*>([^<]+)<\/span>/g;
    const titles = [...html.matchAll(titlePattern)].map(m => (m[1]||m[2]).trim()).slice(0,5);
    return res.json({ status: r.status, links, imgs: imgs.map(i=>i.substring(0,80)), titles, htmlLen: html.length });
  } catch(e) {
    return res.json({ err: e.message });
  }
}
