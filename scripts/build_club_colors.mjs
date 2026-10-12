// 커리어 모드 구단 유니폼 색 표 생성기.
//   node scripts/build_club_colors.mjs   → arsenal-dashboard/api/_club_kits.js (직접 고치지 말 것)
// 원자료: scripts/out/club_colors_raw.json(fetch_club_colors.mjs를 GitHub Actions에서 돌린 결과 — Fotmob 팀 색 + ESPN 유니폼 색).
// - 대표색(brand) = Fotmob teamColors.lightMode(구단 정체성 색, 흰 바탕에서도 보이게 고른 값) → 선수 카드 배경
// - 유니폼(shirt) = 대표색. 다만 홈 유니폼이 흰색인 구단(레알 마드리드·토트넘 등)은 ESPN 유니폼 색이 흰색이면 흰색 —
//   ESPN 값은 J리그·노르웨이·아르헨티나 쪽이 #000000으로 비어 있는 경우가 많아 흰색일 때만 믿는다.
// - 줄무늬·반반·띠 같은 무늬는 API에 없어 아래 PATTERN에 손으로 적는다(사용자 지정 — 줄무늬도 적용).
import { readFileSync, writeFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync(new URL('./out/club_colors_raw.json', import.meta.url)));
const W = '#ffffff', K = '#111111';
// [무늬, 바탕색, 두 번째 색] — v 세로 줄무늬 · h 가로 줄무늬 · half 좌우 반반 · sash 어깨띠 · band 가슴 띠 · mid 가운데 넓은 띠 · diag 대각선 반반
const PATTERN = {
  // 잉글랜드
  10261:['v',K,W], 8472:['v','#EB172B',W], 9937:['v','#E30613',W], 9826:['v','#1B458F','#C4122E'], 10204:['v','#0057B8',W], 8678:['v','#DA291C',K],
  // 스페인
  8634:['v','#004D98','#A50044'], 9906:['v','#CB3524',W], 8315:['v','#EE2523',W], 8558:['v','#007FC8',W], 8560:['v','#0067B1',W], 9783:['v','#0067B1',W],
  8581:['v','#004D98','#B4053F'], 8370:['sash',W,'#E53027'], 10268:['band',W,'#05642C'], 9864:['v','#0072CE',W], 8603:['v','#0BB363',W], 9866:['v','#005BAC',W],
  // 이탈리아
  9885:['v',W,K], 8636:['v','#0068A8',K], 8564:['v','#FB090B',K], 8524:['v','#1E71B8',K], 8600:['v',W,K], 9888:['v','#E30613','#FFD800'],
  10233:['half','#C8102E','#002D62'], 9857:['v','#A21C26','#1A2F48'], 8529:['half','#B51F2B','#002350'], 7943:['v','#00A752',K],
  // 프랑스
  9831:['v','#E2001A',K], 9829:['diag','#E7202E',W], 8588:['v','#FFD800','#E30613'], 8121:['v',K,W], 9746:['half','#75B5DE','#0A2B5C'], 9748:['band',W,'#0160A0'],
  // 독일
  10269:['band',W,'#E32219'], 9790:['band',W,'#005AAA'],
  // 포르투갈
  9768:['h','#008057',W], 9773:['v','#005CA9',W],
  // 네덜란드·벨기에
  10235:['half',W,'#E2001A'], 8640:['v','#E2001A',W], 8593:['mid',W,'#D2122E'], 10218:['v','#E2001A',K], 8614:['v','#E2001A',W],
  8342:['v','#0081FF',K], 9984:['v','#00A04A',K], 9986:['v',K,W],
  // 브라질
  10272:['v',K,W], 8517:['v',K,W], 9770:['h','#C8102E',K], 10276:['sash',K,W], 9769:['v','#0D80BF',K], 9863:['v','#8B0F24','#00694B'],
  10277:['band',W,'#C8102E'], 7733:['v','#E2001A',K], 10273:['v','#C8102E',K], 9767:['h',W,'#00544E'],
  // 아르헨티나
  10076:['sash',W,'#E2001A'], 10077:['band','#003A8C','#FCB514'], 10080:['v','#6CACE4',W], 10083:['v','#003A70','#C8102E'], 10084:['v','#002F6C','#FFD100'],
  10094:['v','#E2001A',W], 10101:['v','#002F6C',W], 10103:['band',W,'#12175E'], 10201:['half','#E2001A',K], 10079:['band',W,'#0061A8'],
  10087:['v','#007934',W], 10089:['band',W,'#5F3B1B'], 89396:['band','#1E448D','#C8102E'], 10096:['v','#C01820',W], 10090:['v','#DE0209',W],
  161727:['v','#68B0DE',W], 161730:['half','#FFD100','#1C722D'],
  // 한국
  92630:['v','#D00810',K],
};
// 홈 유니폼이 흰색인데 ESPN 값이 없거나 틀린 구단(대표색은 Fotmob 그대로 둔다)
const WHITE = [8722, 9790, 9808, 8514, 7877, 10081, 7844, 8422, 10167];   // 10167 파르마(흰 바탕에 검은 십자)
// 노랑 유니폼: Fotmob 대표색은 흰 바탕용으로 어둡게(겨자색) 잡혀 있어 유니폼은 밝은 노랑으로
const SHIRT = {9789:'#FDE100', 8402:'#FFE600', 10205:'#FFE114', 7978:'#FFE600', 8699:'#FFE600', 9891:'#FFD800', 163782:'#FFD800', 8476:'#FFD800', 9919:'#FFE600', 245905:'#FFD800', 9756:'#FFD800', 6422:'#FFE600', 7788:'#FFE600', 8475:'#FFE600'};
// ESPN이 흰색이라 해도 홈이 흰색이 아닌 구단
const NOT_WHITE = [9810, 8674, 8406];

const hex = c => c.replace('#','').toLowerCase();
const lum = c => { const h = hex(c), v = [0,2,4].map(i => parseInt(h.slice(i,i+2),16)/255).map(x => x <= 0.03928 ? x/12.92 : Math.pow((x+0.055)/1.055, 2.4)); return 0.2126*v[0] + 0.7152*v[1] + 0.0722*v[2]; };
const isWhite = c => c && lum(c) > 0.85;

const out = {};
for(const [id, x] of Object.entries(raw)){
  const brand = x.fm['overview.teamColors.lightMode'] || x.fm['details.teamColor'] || '#D0010A';
  let shirt = brand;
  if(WHITE.includes(+id) || (!NOT_WHITE.includes(+id) && isWhite(x.espn?.color))) shirt = W;
  if(SHIRT[id]) shirt = SHIRT[id];
  const pat = PATTERN[id];
  if(pat) shirt = pat[1];
  // 글자색(등 이름·번호): 밝은 유니폼엔 대표색(충분히 어두우면) 아니면 거의 검정, 어두운 유니폼엔 흰색
  const text = lum(shirt) > 0.45 ? (lum(brand) < 0.25 && brand.toLowerCase() !== shirt.toLowerCase() ? brand : K) : W;
  out[id] = pat ? [shirt, text, brand, pat[0], pat[2]] : [shirt, text, brand];
}
const lines = Object.entries(out).map(([id, v]) => ` ${id}:${JSON.stringify(v)}`).join(',\n');
writeFileSync(new URL('../arsenal-dashboard/api/_club_kits.js', import.meta.url),
`// 자동 생성 — scripts/build_club_colors.mjs. 직접 고치지 말 것(무늬·흰 유니폼 예외는 그 스크립트에서).
// Fotmob 구단 id → [유니폼 바탕색, 등 글자색, 대표색(선수 카드), 무늬?, 두 번째 색?]
export const CLUB_KIT = {
${lines}};
`);
console.log('kits', Object.keys(out).length, 'patterns', Object.keys(PATTERN).length, 'white', Object.values(out).filter(v => v[0] === W).length);
