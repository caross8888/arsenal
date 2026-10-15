import assert from 'node:assert/strict';
import * as F from '../arsenal-dashboard/api/_career_finance.js';
import * as S from '../arsenal-dashboard/api/_career_sim.js';
import {calculateCard} from './backfill_career_finance.mjs';
const club=S.clubByName('아스날'),base={club,age:23,ovr:78,pos:'FW',hist:[],seed:7,cEnd:28};
for(const [nat,currency] of Object.entries({ENG:'GBP',KOR:'KRW',JPN:'JPY',BRA:'EUR',NGA:'EUR',USA:'EUR',NOR:'EUR'}))assert.equal(F.currencyOf(nat),currency);
const q=F.quoteSalary(base);assert.deepEqual(q,F.quoteSalary(base));assert.equal(q.annual,Math.round(q.annualEUR*.85));assert.equal(q.weekly,q.annual/52);
assert(F.quoteSalary({...base,ovr:88}).annualEUR>q.annualEUR);
assert(F.quoteSalary({...base,ovr:68}).annualEUR<q.annualEUR);
const cross=F.moneyView(100000,{nat:'JPN'},100000);assert.equal(cross.change,0);assert.equal(cross.annual,16000000);
assert.equal(F.marketQuote({...base,cEnd:24},club,24).fee,0);
assert(F.marketQuote({...base,cEnd:29},club,24).fee>F.marketQuote({...base,cEnd:25},club,24).fee);
const rows=[{age:18,club:club.n,ovr:64,apps:10,goals:2,hon:[]},{age:19,club:club.n,ovr:74,apps:35,goals:20,hon:[]},{age:20,club:club.n,ovr:79,apps:35,goals:22,hon:[]}];
const legacy={hist:structuredClone(rows),pos:'FW'};F.ensureFinance(legacy);
assert.equal(legacy.hist[0].finance.contract.annualEUR,legacy.hist[2].finance.contract.annualEUR,'historical wages must stay fixed in contract');
const summary=F.financeSummary(rows);assert.equal(summary.totalAnnualIncome,legacy.salary.annualEUR*3);
assert.deepEqual(summary,F.financeSummary(rows));assert(!rows[0].finance,'reading old cards must not mutate records');
const oldCard={pos:'FW',seasons:rows,score:123};assert.equal(calculateCard(oldCard).score,123);assert.deepEqual(calculateCard(calculateCard(oldCard)),calculateCard(oldCard));
const soldier={...rows[1],age:19,club:'김천 상무',loan:true};
assert.equal(F.financeSummary([rows[0],soldier]).totalAnnualIncome,legacy.salary.annualEUR);
const returned={...rows[2],age:19};assert.equal(F.financeSummary([rows[0],soldier,returned]).totalAnnualIncome,Math.round(legacy.salary.annualEUR*1.5));
const injured={club,ovr:70,age:24,pos:'FW',hist:[],salary:q,financeVersion:1};
const injuryRow={age:24,club:club.n,youth:false,apps:0,injured:38};F.recordSalary(injured,injuryRow);assert.equal(injuryRow.finance.earnedEUR,q.annualEUR);
const militaryRow={age:25,club:club.n,youth:false,service:{kind:'regular',months:12}};F.recordSalary(injured,militaryRow);assert.equal(militaryRow.finance.earnedEUR,0);
let seasons=0,contracts=0,moves=0;
for(let seed=1;seed<=60;seed++){
 const c=S.createCareer({name:'급여검증',nation:'ENG',pos:['FW','MF','DF'][seed%3],card:0,foot:'오른발',body:'표준',num:9},0,seed);
 for(let year=0;year<27&&c.phase!=='retired';year++){
  const before=c.salary?.annualEUR;
  const result=S.playSeason(c,{train:'균형',evPick:0,injPick:1});seasons++;
  if(before&&!result.row.youth)assert.equal(result.row.finance.contract.annualEUR,before,'season form must not change an existing salary');
  const pick=c.offers.length&&(c.released||seed%2===0)?0:null;
  const shown=pick==null?S.stayView(c).finance:S.offersView(c)[pick].finance;
  S.nextSeason(c,pick);
  if(c.contract){contracts++;assert(c.contract.finance);if(shown)assert.equal(shown.annualEUR,c.contract.finance.annualEUR,'offer must match signed contract');if(c.contract.type==='transfer')moves++;}
  const v=S.cardView(c);assert(Number.isFinite(v.finance.totalAnnualIncome));assert(v.finance.totalAnnualIncome>=0);
 }
 const sum=S.cardView(c).finance;assert.deepEqual(sum,F.financeSummary(c.hist,c.pos));
}
console.log('PASS finance:',seasons,'seasons,',contracts,'contracts,',moves,'moves; fixed wages, exact offer/signing amounts, old cards, loans/service, currency comparison and fees');
// Public leaderboard returns stored finances without calculating or rewriting them.
process.env.KV_REST_API_URL='https://career-finance-test.invalid';process.env.KV_REST_API_TOKEN='test-only';
const commands=[],savedFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{assert.equal(url,process.env.KV_REST_API_URL);const command=JSON.parse(options.body);commands.push(command[0]);return {json:async()=>({result:command[0]==='GET'?JSON.stringify(calculateCard(oldCard)):'선수'})};};
try{
 const {default:handler}=await import('../arsenal-dashboard/api/career.js');let output,status=200;
 await handler({method:'GET',query:{a:'card',k:'test',p:'FW'},headers:{}},{setHeader(){},status(n){status=n;return this;},json(v){output=v;}});
 assert.equal(status,200);assert.equal(output.card.score,123);assert.equal(output.card.finance.totalAnnualIncome,summary.totalAnnualIncome);
 assert(commands.every(c=>c==='GET'||c==='HGET'),'reading a historic card must not write to KV');
 console.log('PASS public leaderboard card API: stored finances visible, score unchanged, no KV writes');
}finally{globalThis.fetch=savedFetch;}
