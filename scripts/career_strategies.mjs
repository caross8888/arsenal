// 커리어 모드 전략 검사 — "이것만 고르면 무조건 이득"인 선택이 있는지 본다.
// 같은 시드로 이벤트마다 항상 A / 항상 B, 훈련 방향, 부상 처리, 이적 성향을 하나씩 고정하고(나머지는 무작위)
// 기준(전부 무작위)과 커리어 점수·정점을 비교한다. ±1% 정도는 오차. 밸런스를 바꾸면 sim_career.mjs와 같이 돌릴 것.
//
//   node scripts/career_strategies.mjs            # 전략당 5,000 커리어(몇 분 걸린다)
//   node scripts/career_strategies.mjs 2000
const S = await import('../arsenal-dashboard/api/_career_sim.js'); const N = +process.argv[2] || 5000;
function run(t, pol){ const pos=['FW','MF','DF'][t%3];
  const C=S.createCareer({name:'x',nation:['ENG','ESP','GER','FRA','BRA','KOR'][(t/3|0)%6],foot:'오른발',pos,card:(t/18|0)%S.CARDS[pos].length,num:9},(t/7|0)%3,(t*2654435761)>>>0);
  let k=t*7+1; const R=()=>{ k=(k*1103515245+12345)&0x7fffffff; return k/0x7fffffff; };
  for(;;){ const ev=C.ev; const rr=R(), ri=R(), ro=R(), ro2=R();
    const evPick = pol.ev && pol.ev[ev]!=null ? pol.ev[ev] : (rr<.5?0:1);
    let r=S.playSeason(C,{train:pol.train||'균형',evPick}); if(r.injury){ const j=C.inj; r=S.playSeason(C,{injPick: pol.inj!=null?pol.inj:(ri<.5?0:1)}); }
    if(r.forced||C.age>=34){S.retire(C);break;}
    let pick=null;
    if(pol.move){ if(pol.move!=='stay'){ const i=r.offers.findIndex(o=>o.kind===pol.move); pick=i>=0?i:null; } if(C.released&&pick==null&&r.offers.length) pick=0; }
    else pick=(C.released||ro>=.5)&&r.offers.length?Math.floor(ro2*r.offers.length):null;
    S.nextSeason(C,pick); if(C.phase==='retired')break; }
  return C; }
const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
const base=[]; for(let t=0;t<N;t++) base.push(run(t,{}));
const B={sc:avg(base.map(c=>c.score)), pk:avg(base.map(c=>c.peak))};
const test=(name,pol)=>{ const r=[]; for(let t=0;t<N;t++) r.push(run(t,pol)); const sc=avg(r.map(c=>c.score)), pk=avg(r.map(c=>c.peak));
  console.log(`${name.padEnd(24)} 점수 ${(sc-B.sc>=0?'+':'')}${(sc-B.sc).toFixed(0).padStart(4)} (${((sc/B.sc-1)*100).toFixed(1)}%)  정점 ${(pk-B.pk>=0?'+':'')}${(pk-B.pk).toFixed(2)}`); };
console.log(`기준(전부 무작위) 점수 ${B.sc.toFixed(0)} 정점 ${B.pk.toFixed(2)}`);
for(const [ev,nm] of [['talk','감독 면담'],['coach','개인 트레이너'],['tour','프리시즌 투어'],['media','인터뷰'],['loan','임대 제안'],['extra','유스 특별 훈련'],['weak','약발 훈련']]){
  test(nm+' 항상 A',{ev:{[ev]:0}}); test(nm+' 항상 B',{ev:{[ev]:1}}); }
for(const tr of ['강점 강화','균형','약점 보완']) test('훈련 '+tr,{train:tr});
test('부상 항상 첫째(빨리/수술)',{inj:0}); test('부상 항상 둘째(회복/보존)',{inj:1});
for(const m of ['도전','적정','안정','stay']) test('이적 '+(m==='stay'?'항상 잔류':'항상 '+m),{move:m});
