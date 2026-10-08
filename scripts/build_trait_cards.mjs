// 커리어 모드 특성 카드(정사각 SVG) 생성기.
//   node scripts/build_trait_cards.mjs
// → arsenal-dashboard/public/img/traits/{id}.svg + docs/career-mode/traits.html(미리보기 시트)
// 아이콘은 100×100 좌표에 흰 선으로 직접 그린 것. 카드엔 아이콘과 이름만 넣는다 — 효과·조건은 수치가 바뀌니 UI가 HTML로 얹는다.
// 이름은 api/_career_data.js의 CTRAITS(공통)·TRAITS(포지션)에서 읽는다.

import { writeFileSync, mkdirSync } from 'node:fs';
import { TRAITS, CTRAITS } from '../arsenal-dashboard/api/_career_data.js';

const OUT = new URL('../arsenal-dashboard/public/img/traits/', import.meta.url);
const SHEET = new URL('../docs/career-mode/traits.html', import.meta.url);

// ── 아이콘 ──────────────────────────────────────────────────────
const arrow = (x1, y1, x2, y2, h = 13) => {
  const a = Math.atan2(y2 - y1, x2 - x1), p = d => `${(x2 + h*Math.cos(a+d)).toFixed(1)},${(y2 + h*Math.sin(a+d)).toFixed(1)}`;
  return `<path d="M${x1},${y1} L${x2},${y2} M${p(Math.PI*0.8)} L${x2},${y2} L${p(-Math.PI*0.8)}"/>`;
};
const head = (x2, y2, fromX, fromY, h = 13) => {   // 곡선 끝에 붙이는 화살촉(접선 방향 = from→끝)
  const a = Math.atan2(y2 - fromY, x2 - fromX), p = d => `${(x2 + h*Math.cos(a+d)).toFixed(1)},${(y2 + h*Math.sin(a+d)).toFixed(1)}`;
  return `<path d="M${p(Math.PI*0.8)} L${x2},${y2} L${p(-Math.PI*0.8)}"/>`;
};
const ball = (cx, cy, r) => {
  const pt = (k, rr) => [cx + rr*Math.cos(-Math.PI/2 + k*2*Math.PI/5), cy + rr*Math.sin(-Math.PI/2 + k*2*Math.PI/5)];
  const pent = [0,1,2,3,4].map(k => pt(k, r*0.38).map(v => v.toFixed(1)).join(',')).join(' ');
  const spokes = [0,1,2,3,4].map(k => { const [a,b] = pt(k, r*0.38), [c,d] = pt(k, r); return `M${a.toFixed(1)},${b.toFixed(1)} L${c.toFixed(1)},${d.toFixed(1)}`; }).join(' ');
  return `<circle cx="${cx}" cy="${cy}" r="${r}"/><polygon points="${pent}" fill="#fff"/><path d="${spokes}"/>`;
};
const snow = () => [90, 30, -30].map(deg => {
  const a = deg*Math.PI/180, c = Math.cos(a), s = Math.sin(a), L = 40, B = 26, w = 11;
  const end = sign => { const bx = 50 + sign*B*c, by = 50 - sign*B*s, ex = 50 + sign*(B+w)*c, ey = 50 - sign*(B+w)*s;
    const nx = -s*w*0.8, ny = -c*w*0.8;
    return `M${(ex+nx).toFixed(1)},${(ey+ny).toFixed(1)} L${bx.toFixed(1)},${by.toFixed(1)} L${(ex-nx).toFixed(1)},${(ey-ny).toFixed(1)}`; };
  return `<path d="M${(50-L*c).toFixed(1)},${(50+L*s).toFixed(1)} L${(50+L*c).toFixed(1)},${(50-L*s).toFixed(1)} ${end(1)} ${end(-1)}"/>`;
}).join('');
const goal = (x, y, w, h) => `<path d="M${x},${y+h} V${y} H${x+w} V${y+h}"/><path d="M${x+w/3},${y} V${y+h} M${x+2*w/3},${y} V${y+h} M${x},${y+h/2} H${x+w}" stroke-width="2.5" opacity=".55"/>`;
const SHIELD = 'M50,8 L84,20 V48 C84,70 68,84 50,93 C32,84 16,70 16,48 V20 Z';
const longShot = `${goal(52,10,40,26)}<path d="M24,78 Q38,20 70,30" stroke-dasharray="7 7"/>${head(70,30,56,22)}${ball(20,82,9)}`;

const ICON = {
  // 공통
  agile:   `<path d="M58,6 L22,56 H46 L38,94 L78,40 H54 L64,6 Z"/>`,
  vision:  `<path d="M6,50 Q50,8 94,50 Q50,92 6,50 Z"/><circle cx="50" cy="50" r="15"/><circle cx="50" cy="50" r="5" fill="#fff"/>`,
  calm:    snow(),
  iq:      `<path d="M37,64 C25,56 22,44 24,35 C27,20 39,12 50,12 C61,12 73,20 76,35 C78,44 75,56 63,64 V73 H37 Z"/><path d="M40,82 H60 M44,90 H56"/><path d="M50,30 V48 M42,40 L50,48 L58,40" stroke-width="4"/>`,
  strong:  `<path d="M30,50 H70"/><rect x="18" y="30" width="12" height="40" rx="3"/><rect x="70" y="30" width="12" height="40" rx="3"/><rect x="8" y="39" width="10" height="22" rx="2"/><rect x="82" y="39" width="10" height="22" rx="2"/>`,
  jump:    `<path d="M14,90 H86"/><path d="M28,58 L50,38 L72,58"/><path d="M28,36 L50,16 L72,36"/><path d="M40,76 H60" opacity=".55"/>`,
  grit:    `<path d="M50,6 C58,24 78,36 78,58 C78,78 65,92 50,92 C35,92 22,78 22,58 C22,44 32,36 35,24 C41,34 44,40 48,42 C50,30 47,18 50,6 Z"/><path d="M50,88 C42,88 38,80 40,72 C42,64 50,60 50,52 C57,60 61,66 61,74 C61,82 57,88 50,88 Z" fill="#fff" opacity=".9"/>`,
  touch:   ball(50, 50, 38),
  engine:  `<path d="M50,50 C40,32 14,32 14,50 C14,68 40,68 50,50 C60,32 86,32 86,50 C86,68 60,68 50,50 Z"/>`,
  stamina: `<path d="M50,86 C20,66 8,50 8,34 C8,21 19,12 31,12 C40,12 46,17 50,24 C54,17 60,12 69,12 C81,12 92,21 92,34 C92,50 80,66 50,86 Z"/><path d="M22,44 H37 L43,32 L54,60 L60,44 H78" stroke-width="5"/>`,
  // FW
  shot:    `<circle cx="50" cy="50" r="34"/><circle cx="50" cy="50" r="13"/><circle cx="50" cy="50" r="3.5" fill="#fff"/><path d="M50,6 V28 M50,72 V94 M6,50 H28 M72,50 H94"/>`,
  runs:    `<path d="M50,6 V94" stroke-dasharray="8 8" opacity=".6"/>${arrow(14,76,84,28)}<circle cx="66" cy="68" r="7" fill="#fff" opacity=".5"/><circle cx="34" cy="30" r="7" fill="#fff" opacity=".5"/>`,
  fpass:   `<circle cx="20" cy="76" r="9"/><circle cx="80" cy="26" r="9" fill="#fff"/><path d="M30,68 Q38,30 66,28" stroke-dasharray="7 7"/>${head(68,28,54,26)}`,
  wing:    `<path d="M88,6 V94" opacity=".6"/><path d="M72,92 V40 Q72,18 50,18 H26"/>${head(24,18,40,18)}<path d="M60,74 L72,66 M60,58 L72,50" stroke-width="3.5" opacity=".6"/>`,
  flong:   longShot,
  pace:    `<path d="M40,18 L68,50 L40,82"/><path d="M62,18 L90,50 L62,82"/><path d="M8,34 H28 M4,50 H30 M8,66 H28" opacity=".6"/>`,
  // MF
  kpass:   `<circle cx="28" cy="42" r="12" fill="#fff" opacity=".45"/><circle cx="72" cy="42" r="12" fill="#fff" opacity=".45"/>${arrow(50,92,50,10)}`,
  boxrun:  `<path d="M12,10 V56 H88 V10"/><path d="M34,10 V28 H66 V10" opacity=".6"/>${arrow(50,94,50,36)}`,
  tempo:   `<path d="M28,90 L39,12 H61 L72,90 Z"/><path d="M22,90 H78"/><path d="M50,76 L67,28"/><rect x="58" y="44" width="12" height="9" rx="2" transform="rotate(20 64 48)" fill="#fff"/>`,
  press:   `${ball(50,54,11)}${arrow(10,14,34,38)}${arrow(90,14,66,38)}${arrow(50,96,50,74)}`,
  mlong:   longShot,
  switch:  `<circle cx="14" cy="74" r="8" fill="#fff"/><circle cx="86" cy="74" r="8"/><path d="M20,64 Q50,4 80,62" stroke-dasharray="8 7"/>${head(80,64,74,46)}`,
  // DF
  line:    `<path d="M6,62 H94"/><circle cx="22" cy="62" r="8" fill="#fff"/><circle cx="50" cy="62" r="8" fill="#fff"/><circle cx="78" cy="62" r="8" fill="#fff"/>${arrow(22,46,22,16,10)}${arrow(50,46,50,16,10)}${arrow(78,46,78,16,10)}`,
  aerial:  `${ball(50,20,13)}<path d="M38,46 L50,36 L62,46" stroke-width="4"/><circle cx="50" cy="64" r="12"/><path d="M20,96 Q50,72 80,96"/>`,
  overlap: `${arrow(38,92,38,34)}<path d="M58,92 Q90,62 62,18"/>${head(60,14,74,30)}`,
  build:   `<path d="M10,88 H34 V66 H58 V44 H82 V22" opacity=".6"/>${arrow(14,64,66,14)}`,
  clean:   `<circle cx="50" cy="50" r="38"/><path d="M30,52 L44,66 L72,36" stroke-width="7"/>`,
  cover:   `<path d="${SHIELD}"/><path d="M30,50 H70"/>${head(28,50,40,50,10)}${head(72,50,60,50,10)}`};

// ── 카드 ────────────────────────────────────────────────────────
const ACC = {공통:'#C8A84B', FW:'#EF0107', MF:'#EF0107', DF:'#EF0107'};
const FONT = `Pretendard, 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`;
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const fit = (len, max, room) => Math.min(max, Math.floor(room / Math.max(1, len)));

function card({id, tag, n}){
  const a = ACC[tag], nameSize = fit(n.length, 32, 264);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22273A"/><stop offset="1" stop-color="#11131B"/></linearGradient>
<radialGradient id="glow" cx=".5" cy=".38" r=".55"><stop offset="0" stop-color="${a}" stop-opacity=".28"/><stop offset="1" stop-color="${a}" stop-opacity="0"/></radialGradient>
<radialGradient id="badge" cx=".5" cy=".3" r=".75"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${a}" stop-opacity=".35"/></radialGradient>
</defs>
<rect width="300" height="300" rx="26" fill="url(#bg)"/>
<rect width="300" height="300" rx="26" fill="url(#glow)"/>
<rect x="1.5" y="1.5" width="297" height="297" rx="24.5" fill="none" stroke="${a}" stroke-opacity=".55" stroke-width="3"/>
<circle cx="150" cy="124" r="78" fill="url(#badge)"/>
<circle cx="150" cy="124" r="78" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="2"/>
<g transform="translate(103 77) scale(.94)" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">${ICON[id]}</g>
<text x="150" y="258" text-anchor="middle" font-family="${FONT}" font-size="${nameSize}" font-weight="800" fill="#F0F2F7">${esc(n)}</text>
</svg>
`;
}

const cards = [
  ...CTRAITS.map(t => ({id:t.id, tag:'공통', n:t.n})),
  ...TRAITS.map(t => ({id:t.id, tag:t.pos, n:t.n}))];

mkdirSync(OUT, {recursive:true});
for(const c of cards){
  if(!ICON[c.id]) throw new Error('아이콘 없음: ' + c.id);
  writeFileSync(new URL(c.id + '.svg', OUT), card(c));
}

const group = (title, list) => `<h2>${title}</h2><div class="grid">${list.map(c => `<figure><img src="../../arsenal-dashboard/public/img/traits/${c.id}.svg" alt="${esc(c.n)}"><figcaption>${c.id}.svg</figcaption></figure>`).join('')}</div>`;
writeFileSync(SHEET, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>특성 카드 시트</title>
<style>body{margin:0;padding:24px 16px;background:#0B0D14;color:#F0F2F7;font-family:${FONT}}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 12px;color:rgba(255,255,255,.75)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px}
figure{margin:0}img{width:100%;display:block}figcaption{font-size:11px;color:rgba(255,255,255,.5);text-align:center;margin-top:4px}</style></head><body>
<h1>커리어 모드 특성 카드</h1>
${group('공통 특성 (17세 시즌 끝, 3개 중 하나)', cards.filter(c => c.tag==='공통'))}
${['FW','MF','DF'].map(p => group(p + ' 특성', cards.filter(c => c.tag===p))).join('')}
</body></html>
`);
console.log(`카드 ${cards.length}장 → arsenal-dashboard/public/img/traits/`);
