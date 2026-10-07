// 커리어 모드 밸런스 검증 — api/_career_sim.js를 그대로 불러 수천 커리어를 돌린다.
// 결과를 docs/career-mode/career-mode.md §13 표와 비교할 것. 밸런스(수치)를 고친 뒤엔 반드시 돌린다.
//
//   node scripts/sim_career.mjs            # 4,500 커리어
//   node scripts/sim_career.mjs --n 9000
//
// 전략(문서 §13과 같음): 포지션·국적(6개국)·카드·첫 구단을 번갈아, 이벤트·이적은 무작위, 부상 처리도 무작위.
// 방출되면 말년 제안을 받고, 받을 데가 없거나 40세면 은퇴. 34세가 되면 스스로 은퇴한다.

import * as S from '../arsenal-dashboard/api/_career_sim.js';

const argN = process.argv.indexOf('--n');
const N = argN > 0 ? +process.argv[argN+1] : 4500;
const NATS = ['ENG','ESP','GER','FRA','BRA','KOR'];
const LV = ['보통','유망주','원더키드','세대급'];
const lvOf = tier => ({normal:0, prospect:1, wonder:2, gen:3})[tier] ?? 0;
const norm = n => String(n).split(' ×')[0]
  .replace(/^(잉글랜드|스페인|독일|프랑스|브라질|대한민국|이탈리아|포르투갈|네덜란드|벨기에|아르헨티나|노르웨이|일본|미국|나이지리아) (리그|올해의)/,'(국가) $2')
  .replace(/^(유로|코파 아메리카|아시안컵|골드컵|아프리카 네이션스컵) /,'대륙컵 ');

let rnd = 12345; const R = () => { rnd = (rnd*1103515245+12345) & 0x7fffffff; return rnd/0x7fffffff; };

const peaks = [[],[],[],[]], scores = [], byPos = {FW:[],MF:[],DF:[]}, ballonByLv = [[],[],[],[]];
const cnt = {}, any = {}, tierCnt = [{},{},{},{}];
let majorInj = 0, glass = 0, retireAge = [], released = 0, tokenBytes = 0;

for(let t=0; t<N; t++){
  const pos = ['FW','MF','DF'][t%3], nCards = S.CARDS[pos].length;
  const input = {name:'선수'+t, nation:NATS[(t/3|0)%6], foot:'오른발', pos, card:(t/18|0)%nCards, num:9, dream:null};
  let C = S.createCareer(input, (t/7|0)%3, (t*2654435761)>>>0);
  for(;;){
    let res = S.playSeason(C, {train:'균형', evPick: R()<0.5?0:1});
    if(res.injury) res = S.playSeason(C, {injPick: R()<0.5?0:1});
    if(res.released) released++;
    if(res.forced || C.age>=34){ S.retire(C); break; }
    const pick = (C.released || R()>=0.5) && res.offers.length ? Math.floor(R()*res.offers.length) : null;
    S.nextSeason(C, pick);
    if(C.phase === 'retired') break;
  }
  tokenBytes = Math.max(tokenBytes, JSON.stringify(C).length);
  const lv = lvOf(C.tier);
  peaks[lv].push(C.peak); scores.push(C.score); byPos[C.pos].push(C.score);
  retireAge.push(C.age);
  if(C.majorInj) majorInj++; if(C.glass) glass++;
  ballonByLv[lv].push(S.honorsOf(C).filter(h => h.n==='발롱도르').length);
  const seen = {};
  S.honorsOf(C).forEach(h => { if(h.tier==='-') return; const n = norm(h.n), c = +(String(h.n).split('×')[1])||1;
    cnt[n] = (cnt[n]||0)+c; seen[n] = 1; tierCnt[lv][n] = (tierCnt[lv][n]||0)+c; });
  Object.keys(seen).forEach(n => any[n] = (any[n]||0)+1);
}

const q = (a, p) => { const s = a.slice().sort((x,y)=>x-y); return s[Math.min(s.length-1, Math.floor(p*s.length))]; };
const avg = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;

console.log(`\n커리어 ${N}개\n\n**재능별 정점 오버롤**\n\n| 재능 | 수 | 평균 | 하위 10% | 중앙 | 상위 10% | 최고 | 99 도달 |\n|---|---|---|---|---|---|---|---|`);
peaks.forEach((a,i) => console.log(`| ${LV[i]} | ${a.length} | ${avg(a).toFixed(1)} | ${q(a,.1)} | ${q(a,.5)} | ${q(a,.9)} | ${Math.max(...a)} | ${a.filter(x=>x>=99).length} |`));

console.log(`\n**수상 빈도**(커리어당 평균 / 한 번이라도 / 재능별 평균)\n\n| 수상 | 평균 | 한 번이라도 | ${LV.join(' | ')} |\n|---|---|---|---|---|---|---|`);
Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a]).forEach(k => console.log(`| ${k} | ${(cnt[k]/N).toFixed(2)} | ${(any[k]/N*100).toFixed(1)}% | ${peaks.map((a,i)=>((tierCnt[i][k]||0)/Math.max(1,a.length)).toFixed(2)).join(' | ')} |`));

console.log(`\n**발롱도르(재능별 평균 / 최다)**: ${ballonByLv.map((a,i)=>`${LV[i]} ${avg(a).toFixed(2)}/${a.length?Math.max(...a):0}`).join(' · ')}`);
console.log(`**커리어 점수**: 중앙 ${q(scores,.5)} · 상위 10% ${q(scores,.9)} · 최고 ${Math.max(...scores)}`);
console.log(`**포지션별 점수 중앙**: ${Object.entries(byPos).map(([p,a])=>`${p} ${q(a,.5)}`).join(' · ')}`);
console.log(`**큰 부상** ${(majorInj/N*100).toFixed(1)}% · **유리몸** ${(glass/N*100).toFixed(1)}% · **방출 경험 시즌** ${released} · **은퇴 나이 평균** ${avg(retireAge).toFixed(1)}`);
console.log(`**상태 JSON 최대 크기** ${tokenBytes} bytes(암호화 전)\n`);
