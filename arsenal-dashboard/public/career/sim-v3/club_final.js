import * as D from './detmath.js';
// 챔스 결승은 시즌 종료 뒤에 재생하는 단판. 리그 기록·대표팀 기록과 분리한다.
import {CLUBS} from '../sim-v1/data.js';
import {shootoutFor} from './shootout.js';
export const EUROPEAN_LEAGUES=new Set(['ENG','ESP','GER','ITA','FRA','POR','NED','BEL','NOR']);
function random(seed,key){let h=seed>>>0;for(const c of key)h=Math.imul(h^c.charCodeAt(0),16777619);return ()=>{h+=0x6D2B79F5;let t=Math.imul(h^(h>>>15),h|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
const publicClub=c=>({n:c.n,id:c.id,nat:c.nat});
export function clubFinalExpectation(club){return club.r>=92?'title':club.r>=86?'contender':'underdog';}
export function championsFinal({seed,year,club,baselineWin,winChance,apps,starts,injured,goals,ast,pos,penalties=false,decisions={}}){
 if(!EUROPEAN_LEAGUES.has(club.nat)||apps<8)return null;
 const R=random(seed,'club-final|'+year+'|'+club.n);
 // 준우승 경로를 더해 기존 우승 확률과 같은 규모의 결승 진출 기회를 만든다.
 if(!baselineWin&&R()>=winChance/(1-winChance))return null;
 const pool=Object.entries(CLUBS).filter(([nat])=>EUROPEAN_LEAGUES.has(nat)).flatMap(([nat,cs])=>cs.map(([n,r,id])=>({n,r,id,nat}))).filter(c=>c.n!==club.n&&c.r>=84);
 const weights=pool.map(c=>D.exp((c.r-85)/5));let roll=R()*weights.reduce((a,b)=>a+b,0),opp=pool.at(-1);
 for(let i=0;i<pool.length;i++){roll-=weights[i];if(roll<=0){opp=pool[i];break;}}
 const played=injured<12&&R()<Math.min(.98,.55+.45*apps/38),key=year+'|club-final|'+club.n+'|결승';
 const pk=penalties?shootoutFor(seed,key,decisions[key]):null;
 const won=pk?!!pk.won:baselineWin,low=Math.floor(R()*3);let our=won?low+1+Math.floor(R()*2):low,their=won?low:low+1+Math.floor(R()*2);
 if(pk){our=their=Math.floor(R()*3);if(pk.pending)pk.key=key;}
 const g=played?Math.min(goals,our,R()<.6?1+(R()<.15?1:0):0):0,a=played?Math.min(ast,our-g,R()<.4?1:0):0;
 const match={stage:'결승',opp:opp.n,played,started:played&&starts/Math.max(1,apps)>.5,our,their,g,a,cs:played&&pos==='DF'&&their===0?1:0,...(pk?{pk}:{})};
 return {id:'club-final',kind:'club',name:'챔피언스리그',year,month:'시즌 종료 후',at:1,knockout:true,singleMatch:true,club:publicClub(club),opponent:publicClub(opp),expectation:clubFinalExpectation(club),matches:[match],pending:!!pk?.pending,won,outcome:pk?.pending?'승부차기 결과 대기':won?'우승':'준우승',goals,ast};
}
