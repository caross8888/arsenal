// api/_career_sim.js — 커리어 모드 시뮬레이션(순수 계산, fetch·KV 없음)
//
// 설계·밸런스 근거는 docs/career-mode/career-mode.md, 동작 견본은 docs/career-mode/mockup.html.
// 목업의 계산을 화면 코드와 분리해 그대로 옮긴 것이다 — 수치를 바꾸면 scripts/sim_career.mjs로
// 문서 §13 표와 다시 비교할 것.
//
// 상태(C)는 한 커리어의 전부이고 api/career.js가 암호화 토큰으로 브라우저와 주고받는다.
// 난수는 커리어 시드 + (나이·선택)으로 정해져서, 같은 시즌에 같은 선택을 하면 결과가 같다.
// 함수들은 모듈 변수 C에 상태를 걸어 두고 계산한다(요청 하나 안에서만 쓰므로 안전).

import { NATIONS, CLUBS, NAMES, STATS, CARDS, TRAITS, CTRAITS } from './_career_data.js';

export { NATIONS, CLUBS, NAMES, STATS, CARDS, TRAITS, CTRAITS };

// ── 상수 ──────────────────────────────────────────────────────────────
export const BASE = 40, POOL = 50, MAXADD = 20, YOUTH_GAP = 30;
// 시작 오버롤: 모든 포지션·카드가 같다(사용자 지정 — 동일한 출발선). 포지션 사이 균형은 시작값이 아니라
// 골·도움 비율(G_RATE·A_RATE)·기여 점수·발롱 배율로 맞춘다. 54는 맞추기 전 재능별 정점이 그대로 나오는 값.
export const START_OVR = 54;
const AGE_BASE = {15:4,16:4,17:4,18:4.5,19:4.5,20:4.5,21:4,22:4,23:3.5,24:3,25:2.5,26:2,27:1.5,28:0.5,29:-0.5,30:-1,31:-1.5,32:-2,33:-2.5,34:-3,35:-3.5,36:-4,37:-4.5};
const DECLINE = {'스피드':1.5,'체력':1.5,'패스':0.5,'시야':0.5,'빌드업':0.5};
const NAT_BAR = {ENG:80,ESP:80,FRA:80,BRA:80,GER:80,ARG:80,ITA:77,POR:77,NED:76,BEL:76,NOR:71,USA:70,JPN:70,KOR:67,NGA:68};
const NAT_STR = {BRA:.18,FRA:.18,ESP:.16,ARG:.16,ENG:.14,GER:.12,POR:.10,NED:.08,ITA:.08,BEL:.06,NOR:.03,JPN:.03,USA:.02,KOR:.02,NGA:.02};
const CONT_CUP = {ENG:'유로',ESP:'유로',GER:'유로',ITA:'유로',FRA:'유로',POR:'유로',NED:'유로',BEL:'유로',NOR:'유로',BRA:'코파 아메리카',ARG:'코파 아메리카',KOR:'아시안컵',JPN:'아시안컵',USA:'골드컵',NGA:'아프리카 네이션스컵'};
const CONT_MUL = {ENG:1.3,ESP:1.4,GER:1.4,ITA:1.4,FRA:1.4,POR:1.4,NED:1.5,BEL:1.6,NOR:2,BRA:2.2,ARG:2.2,KOR:6,JPN:6,USA:12,NGA:6};
// 수상 등급: f 명성, g 다음 시즌 성장 배율, p 커리어 점수
export const HONOR_TIER = {S:{f:5,g:1.08,p:200}, A:{f:3,g:1.05,p:80}, B:{f:2,g:1.03,p:50}, C:{f:1,g:1,p:15}};
// 발롱도르 점수에 들어가는 트로피·개인상 점수
const BALLON_PTS = [[/챔피언스리그 우승/,25],[/월드컵 우승/,25],[/(유로|코파 아메리카|아시안컵|골드컵|아프리카 네이션스컵) 우승/,15],[/리그 우승/,12],[/컵 대회 우승/,4],
  [/골든볼/,10],[/리그 올해의 (선수|미드필더|수비수)/,10],[/챔스 올해의 선수/,10],[/골든슈/,8],[/리그 득점왕/,8],[/챔스 득점왕|대회 득점왕|월드컵 득점왕/,6],[/도움왕/,5],[/챔스 올해의 (공격수|미드필더|수비수)/,5]];
// 포지션별 기여 점수 — 미드필더·수비수는 골·도움 가중치를 높이고 수비수는 클린시트를 더한다
// 경기당 골·도움 기본 비율. 공격수는 시작 오버롤을 54로 통일하면서(예전 카드 평균 54.8) 줄어든 골·도움을 되돌린 값(0.42·0.18에서)
const NEW_SIGNING = [0.08, -0.04];   // 선발 확률: [이적 첫 시즌 +, 같은 팀 2시즌째부터 −] — 평균이 0 근처가 되게(전체 성장이 빨라지지 않게)
const AW_PRESTIGE = [0.2, 105];   // 수상용 평점의 구단 수준 보정: [15 차이마다 ±, 기준 명성(1군 시즌 평균 구단 명성 근처)]
// 이벤트 성장 효과(선택 차이를 키움 — 사용자 지정). 성장 쪽을 고르면 부상 위험도 같이 커진다.
const EV_GROW = {coach:1.15, coachInj:0.05, coachStart:0.10, extra:1.15, extraInj:0.07, talk:1.1};
// 특성: 18세부터 시즌 끝에 조건 스탯을 넘은 특성이 있으면 이 확률로 제안(최대 3개 제시, 하나 고름), 선수당 최대 TRAIT_MAX개
const TRAIT_P = 0.3, TRAIT_MAX = 3;
const TRAIT_BY_ID = new Map([...TRAITS, ...CTRAITS.map(t => ({...t, pos:'공통'}))].map(t => [t.id, t]));
// 공통 특성: 17세 시즌 끝에 3개 제시(반드시 하나). 무조건 이득만(사용자 지정 — 다른 스탯을 깎지 않는다):
// 성장하는 시즌마다 대상 스탯 +CT_SHIFT(누적 CT_CAP까지, C.ctg). 오버롤은 그대로.
// 스탯이 오르는 것만으론 골·도움 계산(FX)에 적게 들어가는 스탯은 이득이 거의 없어서, 대상 스탯마다 누적 1점당 보너스를 더 준다
// (g·a·cs: 배율 +, r: 평점 +). 특성마다 점수 이득이 비슷해지게 맞춘 값 — 스탯·보너스를 바꾸면 특성별 비교를 다시 돌릴 것.
const CT_AGE = 17, CT_SHIFT = 0.8, CT_CAP = 10;
const CT_BONUS = {
  FW:{'스피드':{g:.01, a:.01}, '패스':{g:.007, a:.013}, '드리블':{g:.007}, '오프더볼':{g:.006}},
  MF:{'태클':{cs:.012, r:.008}, '체력':{g:.003, a:.006}},
  DF:{'태클':{cs:.01, r:.004}, '대인마크':{cs:.01, r:.004}, '스피드':{cs:.005, r:.003}, '빌드업':{a:.005, r:.007}, '공중볼':{r:.007}}};
// 선택 카드에 보여 줄 "무엇이 좋아지나"(스탯이 들어가는 골·도움 계산 + CT_BONUS)
const CT_LABEL = {
  FW:{'결정력':'골','드리블':'골·도움','스피드':'골·도움','오프더볼':'골','패스':'골·도움'},
  MF:{'패스':'도움','시야':'골·도움','볼키핑':'골','체력':'골·도움','태클':'클린시트·평점'},
  DF:{'태클':'클린시트·평점','대인마크':'클린시트·평점','공중볼':'골·평점','스피드':'도움·클린시트','빌드업':'도움·평점'}};
function ctBonus(){
  const t = commonOf(), b = t && (CT_BONUS[C.pos]||{})[t.s[C.pos]], n = C.ctg||0;
  return {g:1+(b&&b.g||0)*n, a:1+(b&&b.a||0)*n, cs:1+(b&&b.cs||0)*n, r:(b&&b.r||0)*n};
}
const commonOf = () => (C.traits||[]).map(id => TRAIT_BY_ID.get(id)).find(t => t && t.pos==='공통');
// 가진 특성의 효과를 곱/합으로 모은다
function traitMods(){
  const m = {g:1, a:1, cs:1, r:0, st:0, inj:0, goty:1};
  for(const id of (C.traits||[])){ const e = (TRAIT_BY_ID.get(id)||{}).eff || {};
    m.g *= e.g||1; m.a *= e.a||1; m.cs *= e.cs||1; m.r += e.r||0; m.st += e.st||0; m.inj += e.inj||0; m.goty *= e.goty||1; }
  return m;
}
const LOAN_STAY = [1.0, 0.03], LOAN_GO = 0.95;   // 남기: [성장 배율, 선발 확률 +] / 가기: 성장 배율(새 팀 적응·낮은 수준의 훈련)
const WF_BONUS = {1:0, 2:0, 3:0.04, 4:0.13, 5:0.18};
// 공통 특성(모두 하나씩 받고 무조건 이득)을 넣으며 평균 기록이 오른 만큼 내렸다(예전 G 0.446/0.13/0.035 · A 0.19/0.17/0.06, 발롱 mu 134).
const G_RATE = {FW:0.395, MF:0.121, DF:0.03}, A_RATE = {FW:0.172, MF:0.159, DF:0.049};
// 클린시트를 출전 경기 전체로 세면서(약 1.5배) cs 점수는 그만큼 낮췄다(예전 MF 0.5 · DF 3.5 — DF는 포지션 점수 중앙을 맞추느라 조금 더 낮춤).
const CONTRIB = {FW:{g:3,a:2,cs:0}, MF:{g:6,a:5,cs:0.33}, DF:{g:8,a:5,cs:2.2}};
// 카드별 기여 보정(사용자 지정): 같은 포지션 안에서도 카드마다 골·도움·클린시트 기대치가 달라
// (포처는 골, 펄스나인·수비형은 적게) 기여 점수 평균이 같아지게 곱한다. 순서는 CARDS와 같음.
// 포지션 몫도 함께 곱해져 있다: 공격수 ×1.13(시작 오버롤 54 통일로 줄어든 점수를 되돌린 몫), 수비수 ×1.09(미드필더와 점수 중앙을 맞춘 몫 — 사용자 지적).
// 결과 포지션별 점수 중앙 공격 2,160 · 미드 2,121 · 수비 2,113(공격수가 약간 높은 건 득점왕 같은 공격수 전용 상 몫).
// scripts/sim_career.mjs와 같은 전략으로 카드당 3,000 커리어를 돌려 잰 값 — 카드·출력 공식을 바꾸면 다시 잴 것.
// 득점왕 같은 수상은 보정하지 않는다(포처가 득점왕을 더 받는 건 자연스럽다).
const CARD_CONTRIB = {FW:[1.25,0.97,0.94,0.96,1.08], MF:[1.15,0.8,0.92,0.91,1.34], DF:[1.23,1.19,1.13,1.17,1.06,1.17]};
// 숨은 재능(18세에 정해짐): 등급을 뽑은 뒤 등급 안에서 배율을 연속으로 뽑는다(평균은 예전 고정값 1.0/1.18/1.58/2.05 근처).
// 고정값 넷이면 분포가 등급별 덩어리로 끊기고 사이가 비었다(사용자 지적). 등급 이름은 힌트·통계용으로 C.tier에 남긴다.
const TALENT = {gen:[2.05,2.5], wonder:[1.4,1.85], prospect:[1.08,1.3], normal:[0.85,1.15]};
// 발전 운: 커리어마다 하나, 성장에 곱한다(같은 재능이라도 선수마다 다르게 — 사용자 지적: "재능이 결과를 다 정한다")
const DEV = [0.8, 1.2];
const K_GROW = 0.47, DAMP = [0.02, 24], PLAY_C = [0.75, 0.45], CLUB_C = [1.85, 1.45, 1.12, 0.84, 0.6], LEAGUE_T = 3.5;
const INJ = [0.10, 0.008, 0.003];   // 일반 부상 기본, 큰 부상 기본, 30세 이후 큰 부상 증가(1살당)
const BALLON = {mu:129, sd:14, pos:{FW:1.03, MF:0.93, DF:0.82}, top:4, inc:10};   // 포지션 배율: 시작 오버롤 54 통일 뒤 세대급 발롱 평균(공격 약 2.6 · 미드 0.35 · 수비 0.05)이 예전대로 나오게 다시 맞춘 값(처음 1 · 0.85 · 0.75)
const INJ_MINOR = ['햄스트링 부상','발목 염좌','허벅지 근육 부상','종아리 부상','무릎 타박상'];
const INJ_MAJOR = ['십자인대 파열','아킬레스건 부상','중족골 골절'];

export const ALL = [];
for(const k of Object.keys(CLUBS)) for(const c of CLUBS[k]) ALL.push({n:c[0], r:c[1], id:c[2], nat:k});
const BY_NAME = new Map(ALL.map(c => [c.n, c]));
export const clubByName = n => BY_NAME.get(n) || null;
export const natInfo = id => NATIONS.find(n => n.id === id);

// ── 난수(시드 고정) ────────────────────────────────────────────────────
export function mulberry(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
export function hashStr(s){ let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }

let C = null;   // 지금 계산 중인 커리어
// 발전 운(시드로 고정, 토큰에 따로 두지 않는다)
const devOf = () => DEV[0] + (DEV[1]-DEV[0])*mulberry(C.seed ^ hashStr('dev'))();
const seasonRng = extra => mulberry(C.seed ^ hashStr(C.age+'|'+extra));

// ── 선수 만들기 ────────────────────────────────────────────────────────
// 카드 가중치 → 시작 스탯(기본 40 + 보너스 50을 w−0.7 비율로, 한 스탯 최대 +20)
export function startStats(pos, card){
  const w = CARDS[pos][card].w, adj = w.map(x => Math.max(0.05, x-0.7)), tot = adj.reduce((a,b)=>a+b,0);
  const add = adj.map(x => Math.min(MAXADD, Math.floor(POOL*x/tot)));
  const order = w.map((x,j)=>j).sort((a,b)=>w[b]-w[a]);
  for(let i=0; add.reduce((a,b)=>a+b,0)<POOL && i<200; i++){ const k=order[i%5]; if(add[k]<MAXADD) add[k]++; }
  // 모든 카드의 시작 오버롤을 START_OVR로 맞춘다(모양은 그대로, 전체를 위아래로만 이동).
  // 맞추지 않으면 강점이 한두 개에 몰린 카드(포처 56)가 고른 카드(메짤라·풀백 52)보다 높게 시작해
  // 명성 → 구단 → 출전 → 성장으로 불어나 정점이 5 가까이 벌어졌다(사용자 지적).
  const st = add.map(a => BASE+a), o = ovrOf(st, w);
  return st.map(v => v - o + START_OVR);
}
// 오버롤 = 카드 가중치의 세제곱으로 가중 평균(핵심 스탯이 오버롤을 거의 결정한다)
export function ovrOf(st, w){ let t=0, sw=0; for(let i=0;i<5;i++){ const w3=w[i]**3; t+=st[i]*w3; sw+=w3; } return Math.round(t/sw); }

const chanceOf = p => p<0.3 ? 'low' : p<0.65 ? 'mid' : 'high';
const growLv = r => Math.max(1, Math.min(5, Math.round((r-40)/11)));

// 첫 구단: 자국 구단 3곳 — 도전 / 적정 / 안정. 리그 구단이 16개 이상이면 3칸 간격.
export function firstClubs(nation, pos, card){
  const myRep = START_OVR + 5, me = myRep + YOUTH_GAP;
  const home = (CLUBS[nation]||[]).map(c => clubByName(c[0])).sort((a,b) => b.r-a.r);
  let mid = 0; home.forEach((c,i) => { if(Math.abs(c.r-me) < Math.abs(home[mid].r-me)) mid = i; });
  const step = home.length >= 16 ? 3 : 1;
  mid = Math.max(step, Math.min(home.length-1-step, mid));
  return [[home[mid-step],'도전'],[home[mid],'적정'],[home[mid+step],'안정']].filter(x => x[0]).map(([c,kind]) => ({
    club: c, kind, chance: chanceOf(1/(1+Math.exp(((c.r-YOUTH_GAP)-myRep)/7))), grow: growLv(c.r)}));
}

export function createCareer(input, clubIdx, seed){
  const {name, nation, foot, pos, card, num, dream} = input;
  const o = firstClubs(nation, pos, card)[clubIdx];
  if(!o) throw new Error('bad club');
  const st = startStats(pos, card), ovr = START_OVR;
  C = {v:1, seed:seed>>>0, name, nation, pos, card, foot, want:num, num:null, dream:dream||null,
       st, ovr, off:st.map(v => v-ovr), age:15, club:o.club, fame:0, wf:2, phase:'prep', train:'균형', ev:null, evPick:null,
       hist:[], tot:{apps:0,goals:0,ast:0,cs:0,caps:0,cg:0}, boost:1, peak:ovr, clubs:[o.club.n],
       talent:1, youthPts:0, awoken:false, last:null, offers:null};
  newEvent();
  return C;
}

// ── 계산 도우미 ────────────────────────────────────────────────────────
const cOvr = () => Math.round(C.ovr);
const cRep = () => cOvr() + 3 + C.fame;
const youth = () => C.age < 18;
const teamName = club => club.n + (C.age<16 ? ' U-16' : C.age<18 ? ' U-18' : '');
const clubCoef = r => r>=91 ? CLUB_C[0] : r>=86 ? CLUB_C[1] : r>=76 ? CLUB_C[2] : r>=61 ? CLUB_C[3] : CLUB_C[4];
// 출전 계수: 21세까지는 벤치여도 큰 구단 훈련으로 크고(바닥 높음), 22세부터는 뛰어야 큰다(바닥 낮음 — 벤치에 머물면 정체).
// "어릴 땐 큰 구단, 그 뒤엔 뛸 곳"(사용자 지정)과 "출전 못 하면 망하는 커리어도 있게"를 같이 만족시키려는 것. 선발 100%면 둘 다 1.3.
const playCoef = ratio => { const f = C.age <= 21 ? PLAY_C[0] : PLAY_C[1]; return f + (1.3 - f)*ratio; };
function syncSt(){ C.st = C.off.map(o => Math.max(20, Math.min(99, C.ovr+o))); }
function pStart(club, opt){
  const gap = youth() ? (club.r-YOUTH_GAP)-cRep() : club.r-cRep();
  return Math.max(0.02, Math.min(0.97, 1/(1+Math.exp(gap/7)) + (opt||0)));
}

// ── 시즌 이벤트 ────────────────────────────────────────────────────────
export const EVENTS = [
  {id:'talk', t:'감독 면담', d:'출전 시간이 부족하다고 느껴요. 어떻게 할까요?', a:['출전 시간을 요구한다','훈련으로 증명한다'], ok:() => !youth()},
  {id:'coach', t:'개인 트레이너', d:'에이전트가 개인 트레이너를 붙이자고 해요.', a:['고용한다 (성장 ↑ · 출전 ↓ · 부상 위험 ↑)','지금은 괜찮다 (부상 위험 ↓)'], ok:() => C.age<=27},   // 28세부터는 성장 폭이 거의 없어 어색하다(사용자 지적)
  {id:'tour', t:'프리시즌 투어', d:'감독이 투어 전 경기 출전을 원해요. 컨디션이 걱정돼요.', a:['모두 뛴다 (눈도장)','컨디션 관리'], ok:() => !youth()},
  {id:'media', t:'인터뷰 요청', d:'첫 인터뷰 요청이 들어왔어요.', a:['자신감 있게 (명성 ↑↑ 또는 ↓)','겸손하게 (감독 신뢰 ↑)'], ok:() => C.age>=17},
  {id:'loan', t:'임대 제안', d:'출전 기회를 위해 한 시즌 임대를 다녀오라는 제안이 왔어요.', a:['임대 간다','남아서 경쟁한다'], ok:() => C.age>=17 && C.age<=22 && C.last && C.last.starts/Math.max(1,C.last.games) < 0.35},
  {id:'weak', t:'약발 훈련', d:'', a:['약발 집중 훈련','주발 강점 살리기'], ok:() => false},   // newEvent가 가끔 따로 띄운다
  {id:'extra', t:'유스 특별 훈련', d:'유스 코치가 방과 후 특별 훈련을 제안했어요.', a:['참가한다 (성장 ↑ · 부상 위험 ↑)','쉬면서 회복 (부상 위험 ↓)'], ok:() => youth()}];
const evById = id => EVENTS.find(e => e.id === id);

function newEvent(){
  const r = mulberry(C.seed ^ hashStr('ev'+C.age))(), pool = EVENTS.filter(e => e.ok());
  const loan = pool.find(e => e.id === 'loan');
  let ev = loan || pool[Math.floor(r*pool.length)];
  // 약발 훈련: 공격수·미드필더, 20세까지, 시즌당 30% 확률
  const r2 = mulberry(C.seed ^ hashStr('wf'+C.age))();
  if(!loan && (C.pos==='FW'||C.pos==='MF') && C.age<=20 && C.wf<5 && r2<0.3) ev = evById('weak');
  C.ev = ev.id; C.evPick = null; C.train = C.train || '균형'; C.loanClub = null;
  if(ev.id === 'loan'){
    let cands = ALL.filter(c => c.nat===C.club.nat && c.r<=C.club.r-10 && c.r>=C.club.r-22);
    if(!cands.length) cands = ALL.filter(c => c.r < C.club.r-8);
    C.loanClub = cands[Math.floor(r*cands.length)] || null;
    if(!C.loanClub) C.ev = 'coach';
  }
}

// 1군 시즌 목표(사용자 지적: 선발 확률 구간만 보면 이적 제안이 명성 ±8이라 거의 늘 "로테이션"이었다).
// 지금 상황(새 팀·임대·대표팀 문턱·전성기·하락기·지난 시즌 출전)에 맞는 후보를 모아, 같은 게 매 시즌 반복되지 않게 고른다.
// 화면용 문구일 뿐 계산엔 쓰지 않는다.
function seniorGoal(){
  const p = pStart(C.club), o = cOvr(), last = C.hist[C.hist.length-1], ratio = last ? last.starts/Math.max(1,last.games) : 0;
  // 지난 시즌이 임대였으면 임대 전 소속을 본다(임대 복귀는 "새 팀"이 아니다)
  const prev = [...C.hist].reverse().find(r => !r.loan), firstSenior = !prev || prev.youth;
  const back = last && last.loan, newClub = !firstSenior && prev.club !== C.club.n, bar = NAT_BAR[C.nation], cand = [];
  if(firstSenior) cand.push('1군 무대에 적응하기');
  if(back) cand.push('임대 복귀 후 자리 잡기');
  const leagueWins = C.hist.filter(r => r.club===C.club.n && r.hon.some(h => /리그 우승/.test(h.n))).length;
  if(C.age >= 34) cand.push('마지막 불꽃 태우기', '후배들에게 본보기가 되기');
  else if(C.age >= 31) cand.push('베테랑으로 경쟁력 지키기', '노련함으로 주전 자리 지키기');
  if(p < 0.3) cand.push(newClub ? '새 팀에서 출전 기회 잡기' : '1군에서 출전 기회 잡기', '훈련장에서 감독 눈도장 받기', '컵 대회에서 기회 살리기');
  else if(p < 0.65){
    if(newClub) cand.push('새 팀에 빨리 녹아들기');
    cand.push(ratio < 0.45 ? '주전 경쟁에서 이기기' : C.age <= 23 ? '로테이션 멤버로 자리 잡기' : '더 많은 선발 기회 얻기');
  } else {
    if(newClub) cand.push('이적 첫 시즌부터 주전 꿰차기');
    cand.push('팀의 핵심으로 활약하기', {FW:'두 자릿수 골 넣기', MF:'공격 포인트 두 자릿수 올리기', DF:'클린시트로 뒷문 지키기'}[C.pos]);
    if(C.club.r >= 78 && !leagueWins) cand.push('리그 우승 이끌기');
    if(o >= 88) cand.push(C.lastBallon ? '발롱도르 지키기' : '발롱도르 후보에 오르기');
  }
  if(!C.tot.caps && o >= bar-6 && o < bar+4) cand.push('대표팀 발탁 노리기');
  // 대표팀 주축 목표는 가끔만(매번 끼면 둘이 번갈아 나온다)
  if(C.tot.caps && o >= bar+3 && C.age % 3 === 0) cand.push(natInfo(C.nation).n+' 대표팀의 핵심 되기');
  // 지난 시즌과 같은 목표는 피하고, 남은 것 중 시드·나이로 고른다(같은 시즌은 늘 같은 목표)
  const pool = cand.filter(g => g !== C.lastGoal), list = pool.length ? pool : cand;
  return list[hashStr(C.seed+'|goal|'+C.age) % list.length];
}

// 시즌 준비 화면에 보여 줄 것(숨김 값 없음)
export function prepView(state){
  C = state;
  const ev = evById(C.ev);
  let d = ev.d;
  if(ev.id === 'media' && (C.mediaN || C.age > 20)) d =   // "첫 인터뷰"는 어릴 때 처음 한 번만
    ['기자들이 이번 시즌 각오를 묻고 있어요.','스포츠 매체에서 단독 인터뷰를 요청했어요.','개막 전 기자회견에 나서게 됐어요.','팬 채널에서 인터뷰를 하고 싶대요.'][C.age % 4];
  if(ev.id === 'weak') d = '코치가 '+(C.foot==='오른발'?'왼발':'오른발')+' 집중 훈련을 제안했어요. 양발을 쓰면 슈팅·패스 각도가 넓어져 골·도움이 늘어요. 대신 이번 시즌 다른 훈련 시간이 줄어요.';
  let goal;
  if(C.age < 16) goal = '유스 무대에 적응하기';
  else if(C.age < 18) goal = cOvr() >= C.club.r-22 ? '1군 데뷔 노리기' : 'U-18 주전 자리 잡기';
  else goal = seniorGoal();
  let a = ev.a;
  if(ev.id === 'talk') a = [a[0], a[1]+(AGE_BASE[Math.min(37, C.age)] > 0 ? ' (성장 ↑)' : ' (하락 완화)')];
  return {goal, youth: youth(), event:{id:ev.id, t:ev.t, d, a},
    loanClub: C.ev==='loan' && C.loanClub ? {...pub(C.loanClub), chance: chanceOf(pStart(C.loanClub))} : null};
}

// ── 부상 ──────────────────────────────────────────────────────────────
function injRiskOf(){
  const k = C.evPick; let r = INJ[0];
  if(C.ev==='coach') r += k===0 ? EV_GROW.coachInj : -0.03;
  if(C.ev==='extra') r += k===0 ? EV_GROW.extraInj : -0.05;
  if(C.ev==='tour') r += k===0 ? 0.07 : -0.05;
  r -= C.injNext || 0;                                  // 지난 부상 때 완전히 회복했으면 −3%p
  if(C.injBoost && C.injBoost.n > 0) r += 0.08;         // 큰 부상을 보존 치료했으면 2시즌 +8%p
  if(C.glass) r += 0.04;                                // 유리몸
  r += traitMods().inj;
  return Math.max(0.03, r + Math.max(0, C.age-30)*0.01);
}
function rollInjury(){
  const r = mulberry(C.seed ^ hashStr('inj|'+C.age+'|'+C.ev+'|'+C.evPick+'|'+C.club.n));
  const pMajor = C.age>=18 ? INJ[1] + Math.max(0, C.age-29)*INJ[2] : 0;
  if(r() < pMajor) C.inj = {major:true, games:Math.round(25+r()*10), name:INJ_MAJOR[Math.floor(r()*3)]};
  else if(r() < injRiskOf()) C.inj = {major:false, games:Math.round(5+r()*12), name:INJ_MINOR[Math.floor(r()*5)]};
  else C.inj = null;
}

// ── 시즌 진행 ──────────────────────────────────────────────────────────
// choice: {train, evPick, injPick}. 부상이 났는데 injPick이 없으면 {injury}만 돌려준다(상태는 그대로 두고
// 부상 결과만 C.inj에 남김 — 같은 요청을 injPick과 함께 다시 부르면 이어서 계산한다).
export function playSeason(state, choice){
  C = state;
  if(C.phase !== 'prep' && C.phase !== 'injury') throw new Error('phase');
  if(['강점 강화','균형','약점 보완'].includes(choice.train)) C.train = choice.train;
  if(C.phase === 'prep'){
    if(choice.evPick !== 0 && choice.evPick !== 1) throw new Error('evPick');
    C.evPick = choice.evPick;
    rollInjury();
  }
  if(C.inj){
    if(choice.injPick !== 0 && choice.injPick !== 1){ C.phase = 'injury'; return {injury: C.inj}; }
    C.injPick = choice.injPick;
  }
  const rng = seasonRng(C.train+'|'+C.ev+'|'+C.evPick+'|'+C.club.n+'|inj'+(C.inj ? C.injPick : ''));
  if(C.age >= 18) C.lastGoal = seniorGoal();
  const ev = C.ev, pick = C.evPick, card = CARDS[C.pos][C.card], notes = [];
  let club = C.club, onLoan = false, startAdj = 0, growMul = 1, declMul = 1;
  if(ev==='loan' && pick===0 && C.loanClub){ club = C.loanClub; onLoan = true; growMul *= LOAN_GO; notes.push(C.loanClub.n+'로 1시즌 임대를 떠났어요.'); }
  // 남아서 경쟁: 1군 선수들과 훈련하는 효과(성장 ↑)와 감독의 관심(출전 ↑ 조금). 예전엔 효과가 없어 "임대 간다"가 늘 정답이었다(전략 검사).
  if(ev==='loan' && pick===1){ growMul *= LOAN_STAY[0]; startAdj += LOAN_STAY[1]; notes.push('남아서 1군 선수들과 부딪히며 훈련했어요.'); }
  if(ev==='talk'){ if(pick===0){ if(rng()<0.75){ startAdj+=0.12; notes.push('면담 후 출전 시간이 늘었어요.'); } else { startAdj-=0.1; notes.push('감독이 불쾌해해서 한동안 벤치였어요.'); } } else if(AGE_BASE[Math.min(37, C.age)] > 0) growMul*=EV_GROW.talk; else { declMul*=0.8; notes.push('묵묵히 훈련한 덕분에 하락 폭이 줄었어요.'); } }   // 하락기(29세+)엔 성장 대신 하락 완화
  // 대가: 개인 훈련에 치중해 팀 훈련이 소홀 → 선발 −10%p. 부상 위험만으로는 대가가 안 됐다(+20%p여도 늘 고용이 이득).
  // 그래서 상황마다 정답이 갈린다: 21세까지(벤치여도 크는 시기)는 고용, 22세부터(뛰어야 크는 시기)는 거절(전략 검사 ±1.1%).
  if(ev==='coach' && pick===0){ growMul*=EV_GROW.coach; startAdj-=EV_GROW.coachStart; notes.push('개인 트레이너와 훈련한 효과가 있었어요.'); }
  if(ev==='extra' && pick===0) growMul*=EV_GROW.extra;
  if(ev==='weak'){
    if(pick===0){ growMul*=0.92; if(rng()<0.75){ C.wf++; notes.push('약발 훈련 성과! 약발이 '+'★'.repeat(C.wf)+'☆'.repeat(5-C.wf)+'이 됐어요.'); } else notes.push('약발 훈련을 했지만 아직 몸에 익지 않았어요.'); }
    else growMul*=1.03;
  }
  if(ev==='tour' && pick===0) startAdj+=0.06;
  if(ev==='media'){ C.mediaN = (C.mediaN||0) + 1; if(pick===1) startAdj+=0.03; }   // 겸손: 감독 신뢰. 자신감은 시즌 평점을 보고 아래에서 정산

  const row0Youth = youth() && !onLoan, games = row0Youth ? 26 : 42;
  // 새 영입 효과: 이적 첫 시즌엔 구단이 기회를 더 준다(돈을 주고 데려왔으니). 없으면 큰 구단으로 가는 게 늘 손해였다(전략 검사).
  const lastSr = [...C.hist].reverse().find(r => !r.youth && !r.loan);
  if(!onLoan && lastSr) startAdj += lastSr.club !== club.n ? NEW_SIGNING[0] : NEW_SIGNING[1];
  const TM = traitMods(); startAdj += TM.st;
  const p = pStart(club, startAdj);
  if(youth() && !onLoan && C.age===17 && cOvr()>=club.r-22) notes.push('1군 데뷔 기회를 받았어요!');
  // 부상
  let injured = 0; const inj = C.inj; C.injNext = 0;
  if(inj){
    injured = inj.games;
    if(inj.major){
      if(C.injPick===0){ STATS[C.pos].forEach((n,i) => { if(n==='스피드'||n==='체력') C.off[i]-=2; }); notes.push(inj.name+' — 수술 후 재활. '+injured+'경기 결장, 스피드·체력이 조금 떨어졌어요.'); }
      else { C.injBoost = {n:3}; notes.push(inj.name+' — 보존 치료. '+injured+'경기 결장, 한동안 재발 위험이 있어요.'); }
      C.majorInj = (C.majorInj||0) + 1;
    } else if(C.injPick===0){
      injured = Math.round(injured/2);
      if(rng()<0.3){ injured += Math.round(4+rng()*6); growMul*=0.9; notes.push(inj.name+' — 서둘러 복귀했다가 재부상. 총 '+injured+'경기 결장.'); }
      else notes.push(inj.name+' — 빨리 복귀했어요. '+injured+'경기 결장.');
    } else { C.injNext = 0.03; notes.push(inj.name+' — 완전히 회복하고 돌아왔어요. '+injured+'경기 결장.'); }
    injured = Math.min(games-2, injured);
    C.injCount = (C.injCount||0) + 1;
  }
  C.injGames = (C.injGames||0) + injured;
  if(C.injBoost && C.injBoost.n > 0) C.injBoost.n--;
  delete C.inj; delete C.injPick;

  const avail = games - injured;
  const starts = Math.max(0, Math.min(avail, Math.round(avail*p*(0.8+rng()*0.4))));
  const subs = Math.min(avail-starts, Math.round((avail-starts)*(0.25+rng()*0.35)));
  const apps = starts + subs, o = cOvr();
  // 골·도움: 관련 스탯 + 팀 계수 + 카드 보정(√) + 약발
  const FX = {FW:{g:[.5,.2,0,.3,0], a:[0,.3,.2,0,.5]}, MF:{g:[0,.3,.4,.3,0], a:[.5,.5,0,0,0]}, DF:{g:[0,0,.7,.3,0], a:[0,0,0,.4,.6]}}[C.pos];
  const effG = FX.g.reduce((t,w,i)=>t+w*C.st[i],0), effA = FX.a.reduce((t,w,i)=>t+w*C.st[i],0);
  const teamF = Math.max(0.8, Math.min(1.2, 0.8+0.4*(club.r-50)/45));
  const cardG = Math.sqrt({'포처':1.35,'타깃맨':1.15,'윙어':0.8,'펄스나인':0.85,'공격형 미드필더':1.4,'메짤라':1.2,'수비형 미드필더':0.5,'윙백':1.3,'인버티드 풀백':1.2}[card.n]||1);
  const cardA = Math.sqrt({'윙어':1.5,'펄스나인':1.5,'공격형 미드필더':1.4,'딥라잉 플레이메이커':1.2,'윙백':1.6,'풀백':1.3,'포처':0.6}[card.n]||1);
  // 약발 보너스(골·도움): ★3까지는 작고 ★4부터 커진다 — 훈련 비용(그 시즌 성장 ×0.92) 대비 ★3은 약간 손해, ★4부터 약간 이득(사용자 지정)
  const wfF = (C.pos==='FW'||C.pos==='MF') ? 1+WF_BONUS[C.wf] : 1;
  const CB = ctBonus();
  const gRate = wfF*G_RATE[C.pos]*Math.pow(effG/75,2)*cardG*teamF*TM.g*CB.g;
  const aRate = wfF*A_RATE[C.pos]*Math.pow(effA/75,2)*cardA*teamF*TM.a*CB.a;
  const minsEq = starts + subs*0.3;
  const hot = !row0Youth && starts>=15 && rng()<0.02;   // 커리어 하이 시즌
  const goals = Math.round(minsEq*gRate*(0.7+rng()*0.6)*(hot?1.6:1)), ast = Math.round(minsEq*aRate*(0.7+rng()*0.6)*(hot?1.6:1));
  const pCS = Math.max(0.05, Math.min(0.6, (0.12+0.35*(club.r-50)/45+(o-75)/150)*TM.cs*CB.cs));
  // 클린시트는 출전 경기 전체로 센다(교체 출전 포함). 예전엔 선발만 세서 출전 대비 25%로 너무 적게 보였다(사용자 지적).
  const cs = row0Youth ? Math.round(apps*pCS*0.8) : Math.round(apps*pCS*(0.85+rng()*0.3));
  if(hot) notes.unshift('🔥 커리어 하이 시즌! 뭘 차도 들어갔어요.');
  // 평점: 실력 + 팀 안 위치 + 포지션별 활약 + 운
  const clubLv = club.r - (youth()&&!onLoan ? YOUTH_GAP : 0), ap = Math.max(apps,1);
  const perfBonus = {FW:(goals+ast*0.6)/ap*0.5, MF:(goals*1.5+ast*1.2)/ap*0.6, DF:cs/ap*0.6+(goals*2+ast*1.5)/ap*0.6}[C.pos];
  const rating = apps ? Math.max(5.6, Math.min(8.9, 6.45+(o-70)/17+(o-clubLv)/40+perfBonus+TM.r+CB.r+(rng()-0.5)*0.5)) : 0;

  // 성장 / 하락
  const base = AGE_BASE[Math.min(37, C.age)], ratio = starts/Math.max(1,games), luck = 0.8+rng()*0.4;
  if(row0Youth){ if(ev==='extra' && pick===0) C.youthPts++; if(ratio>=0.6) C.youthPts++; }
  if(C.age>=18 && !C.awoken){
    const tr = mulberry(C.seed ^ hashStr('talent'))(), b = Math.min(6, C.youthPts);
    const pG = 0.02+b*0.0017, pW = pG+0.11+b*0.005, pP = pW+0.25;   // 세대급 2~3% / 원더키드 11~14% / 유망주 25% / 보통 62~58%(사용자 지정 — 처음 8~11% / 20% / 70~66%)
    C.tier = tr<pG ? 'gen' : tr<pW ? 'wonder' : tr<pP ? 'prospect' : 'normal';
    const [a, b2] = TALENT[C.tier], u = mulberry(C.seed ^ hashStr('talent2'))();
    C.talent = a + (b2-a)*u;
    C.awoken = true;
  }
  const st = STATS[C.pos], w = card.w, before = C.st.slice();
  if(base > 0){
    // 99 근처 감속: 최소값 없이 99.6에 다가갈수록 0에 가깝게 줄어든다. 예전엔 최소 40%라 상위권이 계속 커서 99 상한에 부딪혀 쌓였다(사용자 지적).
    const dmp = Math.min(1, Math.max(DAMP[0], (99.6-C.ovr)/DAMP[1]));
    C.ovr = Math.min(99, C.ovr + C.boost*base*playCoef(ratio)*clubCoef(club.r)*luck*growMul*C.talent*devOf()*K_GROW*dmp);
  } else {
    C.ovr = Math.max(30, C.ovr + base*Math.max(0.5, 1-(C.boost-1)*2)*declMul);
    C.off = C.off.map((o2,i) => o2 + base*declMul*((DECLINE[st[i]]||1)-1));
  }
  // 훈련 방향: 강점·약점 모두 "더한 만큼 다른 쪽에서 뺀다"(합 0). 예전엔 둘 다 스탯 합이 늘어 "균형"이 늘 손해였다(전략 검사).
  const ct = base > 0 && commonOf(), ci = ct ? st.indexOf(ct.s[C.pos]) : -1;
  if(ci >= 0 && (C.ctg||0) < CT_CAP){ const g = Math.min(CT_SHIFT, CT_CAP-(C.ctg||0)); C.off[ci] += g; C.ctg = (C.ctg||0) + g; }
  if(C.train==='강점 강화') C.off = C.off.map((o2,i) => Math.min(15, o2+(w[i]>=1.2?0.5:w[i]<=0.9?-0.7:0)));
  if(C.train==='약점 보완') C.off = C.off.map((o2,i) => Math.max(-25, o2+(w[i]>=1.2?-0.5:w[i]<=0.9?1:0)));
  syncSt();
  const deltas = C.st.map((v,i) => Math.round(v)-Math.round(before[i]));

  // 팀 성적·우승·개인 수상
  const lg = ALL.filter(c => c.nat===club.nat), top = Math.max(...lg.map(c => c.r)), lo = Math.min(...lg.map(c => c.r))-4;
  const z = lg.reduce((t,c) => t+Math.exp(c.r/LEAGUE_T), 0) + Math.max(0,20-lg.length)*Math.exp(lo/LEAGUE_T);
  const champ = rng() < Math.exp(club.r/LEAGUE_T)/z;
  const rank = champ ? 1 : Math.max(2, Math.min(20, Math.round(1.5+(top-club.r)/2.2+(rng()-0.3)*4)));
  const hon = [], senior = !row0Youth, natN = natInfo(club.nat).n, ov = cOvr();
  const add = (n, tier, kind) => hon.push({n, tier, kind: kind||'ind'});
  const inUCL = senior && (club.r>=86 || (club.r>=78 && C.uclNext===club.n));
  const uG = inUCL ? Math.round(goals*0.24*(0.8+rng()*0.4)) : 0, uA = inUCL ? Math.round(ast*0.24*(0.8+rng()*0.4)) : 0;
  if(senior){
    if(rank===1 && apps>=8) add(natN+' 리그 우승','B','team');
    if(apps>=8 && rng()<0.12*Math.pow(club.r/90,3)) add('컵 대회 우승','C','team');
    const uclWin = inUCL && apps>=8 && rng()<0.06*Math.pow(club.r/90,4);
    if(uclWin) add('챔피언스리그 우승','A','team');
    if(apps>=20){
      // 리그 개인상은 "수상용 평점"으로 뽑는다: 평점 + 구단 수준 보정. 평점에는 약팀 에이스가 높게 나오는 항목이 있어서,
      // 그대로 쓰면 약한 팀에 남는 게 개인상을 쓸어 가 "항상 잔류"가 정답이었다(전략 검사). 실제처럼 큰 팀일수록 유리하게.
      const awR = rating + AW_PRESTIGE[0]*(club.r-AW_PRESTIGE[1])/15;
      const gT = {ENG:27,ESP:27,GER:25,ITA:25,FRA:25}[club.nat]||23, aT = gT>=25 ? 16 : 14;
      const gk = goals>=gT && rng()<Math.min(0.95,0.4+(goals-gT)*0.1), ak = ast>=aT && rng()<Math.min(0.95,0.4+(ast-aT)*0.12);
      if(gk) add(natN+' 리그 득점왕','B'); if(ak) add(natN+' 리그 도움왕','B');
      if(awR>=7.8 && rank<=3 && rng()<(gk?0.5:0.3)) add(natN+' 리그 올해의 선수','A');
      if(C.age<=23 && awR>=7.1 && rng()<0.5) add(natN+' 리그 영플레이어','C');
      if(awR>=7.6 ? rng()<0.7 : awR>=7.4 && rng()<0.3) add(natN+' 리그 베스트 11','B');
      let motm = 0; for(let mi=0; mi<3; mi++) if(rng()<Math.max(0,awR-7.0)*0.25) motm++;
      if(motm) add('이달의 선수'+(motm>1?' ×'+motm:''),'C');
      if(rating>=7.6 && apps>=25 && rng()<0.4) add('구단 올해의 선수','C');
      if(C.pos!=='FW' && awR>=7.3 && rng()<0.6) add(natN+' 리그 올해의 '+(C.pos==='MF'?'미드필더':'수비수'),'B');
      if(goals>=30 && rng()<0.6) add('유러피언 골든슈','B');
    }
    if(inUCL){
      if(uG>=9) add('챔스 득점왕','B'); if(uA>=6) add('챔스 도움왕','B');
      if(uclWin && rating>=7.5 && rng()<0.5) add('챔스 올해의 선수','A');
      if(rating>=7.6 && rng()<0.2) add('챔스 올해의 '+{FW:'공격수',MF:'미드필더',DF:'수비수'}[C.pos],'B');
    }
    if(ov>=92 && rating>=7.7 && rng()<0.5) add('월드 베스트 11','B');
    if(C.age<=21 && ov>=80 && rating>=7.1 && rng()<0.5) add('골든보이','B');
    if(rng()<(C.pos==='FW'?0.008:0.004)*TM.goty) add('올해의 골','C');
  } else if(rng()<0.25) add('유스 리그 우승','-','team');
  C.uclNext = rank<=4 && club.r>=78 ? club.n : null;

  // 대표팀·국제 대회(2030년부터 4년마다 월드컵, 그 사이 2년마다 대륙컵)
  let caps = 0, cg = 0; const year = 2026+(C.age-15)+1;
  if(C.age>=18 && ov>=NAT_BAR[C.nation]-2){
    caps = Math.round(4+rng()*6); cg = C.pos==='FW' ? Math.round(caps*0.3*rng()) : 0;
    notes.push(natInfo(C.nation).n+' 대표팀에 뽑혔어요.');
    if(ov>=NAT_BAR[C.nation]+7 && rating>=7.0 && rng()<0.35) add(natInfo(C.nation).n+' 올해의 선수','C','nat');
    const wc = year%4===2, cont = year%4===0;
    if(wc || cont){
      const cup = wc ? '월드컵' : CONT_CUP[C.nation], str = Math.min(0.4, NAT_STR[C.nation]*0.55*(wc?1:CONT_MUL[C.nation]));
      caps += Math.round(3+rng()*4);
      if(rng()<str){ add(cup+' 우승', wc?'S':'A', 'nat'); if(rng()<0.3) add(cup+' 골든볼', wc?'A':'B', 'nat'); }
      if(C.pos!=='DF' && rng()<0.08*Math.pow(ov/85,3)) add(cup+' 득점왕','B','nat');
      notes.push(year+' '+cup+'에 출전했어요.');
    }
  } else if(C.age>=16 && C.age<18 && ov>=NAT_BAR[C.nation]-22) notes.push(natInfo(C.nation).n+' 연령별 대표팀에 뽑혔어요.');

  // 발롱도르·FIFA 올해의 선수: 시즌 활약 점수 vs 그해 세계 경쟁자
  if(senior && apps>=20){
    const rec = {FW:goals+ast*0.6, MF:goals*1.4+ast*1.0, DF:cs*0.41+goals*2+ast}[C.pos];
    let hp2 = 0; hon.forEach(x => { const m = BALLON_PTS.find(r => r[0].test(x.n)); if(m) hp2 += m[1]; });
    const star = Math.max(0,ov-85)*2 + Math.max(0,ov-94)*BALLON.top + (C.lastBallon===C.age-1 ? BALLON.inc : 0);
    const bp = (rec + Math.max(0,rating-7.0)*20 + hp2 + star)*BALLON.pos[C.pos];
    const rival = BALLON.mu + BALLON.sd*((rng()+rng()+rng()+rng()-2)*1.73), gap = bp-rival;
    if(gap > 0){ add('발롱도르','S'); C.lastBallon = C.age; if(rng()<0.75) add('FIFA 올해의 선수','S'); }
    else {
      if(gap > -12) notes.push('발롱도르 투표 2위');
      else if(gap > -25) notes.push('발롱도르 투표 3위');
      else if(gap > -45 && bp > 60) notes.push('발롱도르 후보 30인');
      if(gap > -10 && rng()<0.3) add('FIFA 올해의 선수','S');
    }
  }

  // 수상 효과: 명성·다음 시즌 성장(최대 ×1.15)
  let boost = 1, fameAdd = 0;
  hon.forEach(h => { const t = HONOR_TIER[h.tier]; if(!t) return; boost *= t.g; fameAdd += t.f; });
  C.boost = Math.min(1.15, boost);
  if(C.boost > 1) notes.push('수상 효과로 다음 시즌 성장 ×'+C.boost.toFixed(2)+(C.age>=28?'(하락 완화)':''));
  if(inUCL) notes.push('챔스 '+uG+'골 '+uA+'도움');
  // 명성: 1군 활약 보너스, 매 시즌 0 쪽으로 1씩 줄어든다
  let fg = row0Youth ? 0 : (rating>=7.3?2:rating>=6.9?1:rating<6.3&&apps>5?-1:0)+fameAdd;
  if(ev==='media' && pick===0){ if(rating>=7.0){ fg+=2; notes.push('큰소리친 만큼 해내서 주목받았어요.'); } else { fg-=1; notes.push('인터뷰에서 한 말이 부메랑이 됐어요.'); } }
  C.fame = Math.max(-5, Math.min(12, C.fame-Math.sign(C.fame)+fg));
  // 1군 승격 때 등번호
  if(!C.num && C.age>=17 && (!youth()||onLoan||apps>0&&C.age===17&&cOvr()>=club.r-22)){
    if(rng()<0.6){ C.num = C.want; notes.push('원하던 '+C.want+'번을 받았어요.'); }
    else { C.num = [28,31,35,41,44,47][Math.floor(rng()*6)]; notes.push(C.want+'번은 주인이 있어서 '+C.num+'번을 받았어요.'); }
  }
  // 숨은 재능 힌트(19·20세 시즌 끝)
  if(C.age===19 || C.age===20){
    const lv = {gen:0, wonder:1, prospect:2}[C.tier] ?? -1;
    const hint = [['감독: "이런 재능은 10년에 한 번 나와요."','유럽 빅클럽 스카우트들이 훈련장을 찾아오기 시작했어요.'],
                  ['감독: "또래 중에선 단연 눈에 띄어요."','스카우트 리포트에 이름이 올랐어요.'],
                  ['감독: "성장 속도가 좋아요. 꾸준히만 하면 돼요."','코치진이 성장세를 좋게 보고 있어요.']][lv];
    if(hint) notes.push(hint[C.age===19?0:1]);
  }
  const row = {age:C.age, club:club.n, loan:onLoan, team:teamName(club), games, starts, apps, goals, ast, cs, rating:Math.round(rating*100)/100, rank,
               youth:row0Youth, ovrBefore:o, ovr:cOvr(), dOvr:cOvr()-o, deltas, hon, caps, notes, injured};
  C.hist.push(row); C.last = {starts, games};   // 다음 시즌 임대 이벤트 판단용(토큰을 줄이려고 줄 전체를 두지 않는다)
  C.tot.apps += apps; C.tot.goals += goals; C.tot.ast += ast; C.tot.cs += cs; C.tot.caps += caps; C.tot.cg += cg;
  C.peak = Math.max(C.peak, cOvr());
  C.offers = makeOffers(rng, row);
  C.traitOffer = rollTraits();   // 시즌 결과와 다른 난수열(시즌 결과가 바뀌지 않게)
  if(!C.glass && (C.injCount||0)>=4 && C.injCount/C.hist.length>=0.3){ C.glass = true; row.notes.push('잦은 부상으로 "유리몸" 꼬리표가 붙었어요. 구단들이 영입을 망설여요.'); }
  C.phase = 'result';
  return {row, offers: offerView(), released: !!C.released, forced: forcedRetire(), canRetire: C.age>=29};
}

// ── 특성 제안 ──────────────────────────────────────────────────────────
// 조건 스탯을 넘었고 아직 없는 특성 중, 카드에 어울리는 것(가중치 ×3)을 우선해 최대 3개
function rollTraits(){
  if(C.age === CT_AGE && !commonOf()){
    // 대상 스탯이 서로 다른 3개(같은 스탯을 키우는 둘이 나란히 나오면 고르는 의미가 없다)
    const r = mulberry(C.seed ^ hashStr('ctrait')), pool = CTRAITS.filter(t => !t.off), out = [];
    while(out.length < 3 && pool.length){ const t = pool.splice(Math.floor(r()*pool.length), 1)[0];
      if(out.every(id => TRAIT_BY_ID.get(id).s[C.pos] !== t.s[C.pos])) out.push(t.id); }
    return out;
  }
  const own = (C.traits||[]).filter(id => (TRAIT_BY_ID.get(id)||{}).pos !== '공통');
  if(C.age < 18 || own.length >= TRAIT_MAX) return null;
  const r = mulberry(C.seed ^ hashStr('trait|'+C.age));
  const st = STATS[C.pos], card = CARDS[C.pos][C.card].n, have = new Set(C.traits||[]);
  const pool = TRAITS.filter(t => t.pos===C.pos && !have.has(t.id) && Math.round(C.st[st.indexOf(t.stat)]) >= t.min);
  if(!pool.length || r() >= TRAIT_P) return null;
  const out = [];
  while(out.length < 3 && pool.length){
    const w = pool.map(t => t.aff.includes(card) ? 3 : 1), tot = w.reduce((a,b)=>a+b,0);
    let x = r()*tot, i = 0; while(x >= w[i]){ x -= w[i]; i++; }
    out.push(pool.splice(i,1)[0].id);
  }
  return out;
}
export const traitView = (id, pos) => { const t = TRAIT_BY_ID.get(id); if(!t) return null;
  return t.pos==='공통' ? {id:t.id, n:t.n, d:t.s[pos]+' 성장 ↑ · '+((CT_LABEL[pos]||{})[t.s[pos]]||'')+' ↑', common:true} : {id:t.id, n:t.n, d:t.d, stat:t.stat, min:t.min}; };

// ── 이적 · 방출 ────────────────────────────────────────────────────────
// 방출: 31세 이후 오버롤 66 미만이거나 소속팀 선발 확률 15% 미만이면 재계약 불가(잔류 불가) → 낮은 구단의 말년 제안만.
const isReleased = () => C.age>=31 && (cOvr()<66 || pStart(C.club)<0.15);
function makeOffers(rng, row){
  if(C.age < 17) return [];
  C.released = isReleased();
  if(C.released){
    const me0 = cRep(), lows = ALL.filter(c => c.n!==C.club.n && c.r<=me0 && c.r>=me0-15).sort((a,b) => b.r-a.r);
    const k = cOvr()>=63 ? 2 : cOvr()>=60 ? 1 : 0, out0 = [];
    for(let i=0; i<k && lows.length; i++){ out0.push({c: lows.splice(Math.floor(rng()*Math.min(lows.length,6)),1)[0], kind:'말년'}); }
    return out0;
  }
  let n = row.rating>=7.2 ? 3 : row.rating>=6.8 ? 2 : row.apps>5 ? 1 : 0;
  if(C.glass) n = Math.max(0, n-1);
  if(rng()<0.25) n = Math.max(0, n-1);
  // 내 명성 ±8 구단만(유스 보정은 넣지 않는다 — 넣었다가 17세에 레알·인터 제안이 오는 버그가 있었다)
  const me = cRep(), out = [], pool = ALL.filter(c => c.n!==C.club.n && c.r>=me-8 && c.r<=me+8);
  const kinds = [['도전', c => c.r>me+3], ['적정', c => Math.abs(c.r-me)<=3], ['안정', c => c.r<me-3]];
  for(const [kind, f] of kinds){ if(out.length>=n) break; const cs = pool.filter(f).filter(c => out.every(o => o.c.n!==c.n)); if(cs.length) out.push({c: cs[Math.floor(rng()*cs.length)], kind}); }
  const dream = clubByName(C.dream);
  if(dream && dream.n!==C.club.n && dream.r<=me+10 && out.every(o => o.c.n!==dream.n) && rng()<0.5) out.push({c:dream, kind: dream.r>me+3 ? '도전' : '적정', dream:true});
  return out;
}
const forcedRetire = () => C.age>=40 || (!!C.released && !C.offers.length);
const pub = c => ({n:c.n, id:c.id, nat:c.nat});
export function offersView(state){ C = state; return offerView(); }
// 이적시장 카드에 보이는 출전 기회는 다음 시즌 실제 계산과 같게(제안 구단은 새 영입 효과, 잔류는 같은 팀 몫 포함)
export function stayView(state){ C = state; return {chance: chanceOf(pStart(C.club, NEW_SIGNING[1])), grow: growLv(C.club.r)}; }
function offerView(){
  return C.offers.map(o => ({...pub(o.c), kind:o.kind, dream:!!o.dream, chance:chanceOf(pStart(o.c, NEW_SIGNING[0])), grow:growLv(o.c.r)}));
}

// pick: 제안 번호(없으면 잔류). 방출됐는데 고르지 않으면 은퇴.
// traitPick: 특성 제안이 있으면 고른 번호(스크립트에서 생략하면 첫 번째). 은퇴로 끝나면 무시.
export function nextSeason(state, pick, traitPick){
  C = state;
  if(C.phase !== 'result') throw new Error('phase');
  if(C.traitOffer && C.traitOffer.length && !forcedRetire()){
    const id = C.traitOffer[traitPick == null ? 0 : traitPick];
    if(!id) throw new Error('trait');
    C.traits = (C.traits||[]).concat(id);
  }
  C.traitOffer = null;
  if(forcedRetire()) return retire(state);
  if(C.released && (pick==null || !C.offers[pick])) return retire(state);
  if(pick != null){
    const o = C.offers[pick]; if(!o) throw new Error('pick');
    C.club = o.c; if(!C.clubs.includes(o.c.n)) C.clubs.push(o.c.n);
  }
  // 지난 시즌 줄에서 결과 화면에만 쓰는 값은 버린다(토큰 크기 — 은퇴 카드엔 필요 없다)
  const r = C.hist[C.hist.length-1]; delete r.notes; delete r.deltas; delete r.ovrBefore; delete r.dOvr;
  C.age++; C.phase = 'prep'; C.offers = null; C.released = false;
  newEvent();
  return C;
}

// ── 은퇴 · 커리어 점수 ────────────────────────────────────────────────
export function retire(state){
  C = state;
  if(C.phase === 'retired') return C;
  if(C.phase === 'result' && C.age < 29 && !forcedRetire()) throw new Error('too young');
  const lastClub = C.hist[C.hist.length-1].club, atLast = C.hist.filter(r => !r.youth && r.club===lastClub).length;
  const senior = C.hist.filter(r => !r.youth && !r.loan), clubsSr = new Set(senior.map(r => r.club));
  C.oneClub = senior.length>=10 && clubsSr.size===1;
  C.farewell = atLast>=8 || C.peak>=88 || C.fame>=8;
  C.iron = !C.glass && C.hist.filter(r => !r.youth).length>=15 && (C.injGames||0)<=12 && !C.majorInj;
  C.phase = 'retired';
  C.score = careerScore(C);
  return C;
}
// 통산 수상 목록 — 시즌 줄의 hon을 이어 붙인 것(토큰에 따로 두지 않는다)
export const honorsOf = state => state.hist.flatMap(r => r.hon);
export function contribScore(state){ const w = CONTRIB[state.pos], t = state.tot; return (t.goals*w.g + t.ast*w.a + (t.cs||0)*w.cs) * ((CARD_CONTRIB[state.pos]||[])[state.card] || 1); }
export function careerScore(state){
  const hp = honorsOf(state).reduce((t,h) => t + ((HONOR_TIER[h.tier]||{p:0}).p)*(+(String(h.n).split('×')[1])||1), 0);
  return Math.round(state.tot.apps + contribScore(state) + state.tot.caps*2 + state.peak*10 + hp);
}

// 시장가치(€M, 재미용): 오버롤과 나이로
export function marketValue(ovr, age){
  const af = age<=23 ? 1.15 : age<=28 ? 1 : ({29:.8,30:.6,31:.45,32:.32,33:.22}[age]||.12);
  return 2.2*Math.exp((ovr-60)/7.5)*af;
}

// 화면에 보여 줄 선수 정보(숨은 재능·명성·시드 같은 숨김 값은 빼고)
export function playerView(state){
  C = state;
  return {name:C.name, nation:C.nation, pos:C.pos, card:C.card, foot:C.foot, num:C.num, want:C.want, age:C.age, ovr:cOvr(),
    st:C.st.map(v => Math.round(v)), wf:C.wf, club:{...pub(C.club), team:teamName(C.club)}, phase:C.phase, seasons:C.hist.length,
    glass:!!C.glass, tot:C.tot, peak:C.peak, traits:(C.traits||[]).map(id => traitView(id, C.pos)),
    // 커리어 기록 접이식 표: [나이, 팀, 임대, 경기, 골, 도움(수비수는 클린시트), 오버롤, 구단, 유스, 그 시즌 주요 수상(S·A·B, 대표팀 제외)]
    hist: C.hist.map(r => [r.age, r.team, r.loan?1:0, r.apps, r.goals, C.pos==='DF' ? r.cs : r.ast, r.ovr, r.club, r.youth?1:0,
      r.hon.filter(h => 'SAB'.includes(h.tier) && h.kind!=='nat').sort((a,b) => 'SAB'.indexOf(a.tier)-'SAB'.indexOf(b.tier)).map(h => h.n)])};
}
// 은퇴 카드(랭킹에도 이 모양으로 저장한다)
export function cardView(state){
  C = state;
  let peakVal = 0; C.hist.forEach(r => { peakVal = Math.max(peakVal, marketValue(r.ovr, r.age)); });
  return {name:C.name, nation:C.nation, pos:C.pos, card:C.card, num:C.num, age:C.age, peak:C.peak, score:C.score ?? careerScore(C),
    peakValue: Math.round(peakVal*10)/10, traits:(C.traits||[]).map(id => (TRAIT_BY_ID.get(id)||{}).n).filter(Boolean), oneClub:!!C.oneClub, farewell:!!C.farewell, glass:!!C.glass, iron:!!C.iron,
    tot:C.tot, clubs:C.clubs,
    seasons: C.hist.map(r => ({age:r.age, club:r.club, id:(clubByName(r.club)||{}).id, team:r.team, loan:r.loan, youth:r.youth, ovr:r.ovr,
      apps:r.apps, goals:r.goals, ast:r.ast, cs:r.cs, hon:r.hon.filter(h => h.tier!=='C' && h.tier!=='-').map(h => [h.n, h.tier, h.kind])})),
    honors: honorsOf(C).filter(h => h.tier!=='-').map(h => [h.n, h.tier, h.kind])};
}
