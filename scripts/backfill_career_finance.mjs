// 일회성 관리 도구. 서비스 코드에서 호출하지 않는다.
// 공개 카드 계산: node scripts/backfill_career_finance.mjs --public-out /외부경로/cards.json
// KV 미리보기:   node --env-file=arsenal-dashboard/.env.local scripts/backfill_career_finance.mjs
// KV 저장:       위 명령에 --apply --backup /외부경로/before.json 추가
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {financeSummary} from '../arsenal-dashboard/api/_career_finance.js';

const positions=['FW','MF','DF'];
export function calculateCard(card){
 if(card.finance?.v===2)return card;
 if(!positions.includes(card.pos)||!Array.isArray(card.seasons)||!card.seasons.length)throw new Error('카드 포지션/시즌 기록 누락');
 const finance=financeSummary(card.seasons,card.pos);
 if(![finance.peakWeekly,finance.totalAnnualIncome].every(n=>Number.isFinite(n)&&n>=0))throw new Error('급여 계산값 오류');
 return {...card,finance};
}
export async function prepareBackfill(kv){
 const keys=new Set();
 for(const p of positions){
  for(const member of await kv('ZRANGE',`career:board:v2:${p}`,0,-1)||[]){
   if(!String(member).startsWith('@'))throw new Error('알 수 없는 랭킹 멤버 형식');
   const k=String(member).slice(1);keys.add(`career:card:${k}:${p}`);keys.add(`career:card:${k}`);
  }
 }
 for(const member of await kv('ZRANGE','career:board:v1',0,-1)||[]){
  if(!String(member).startsWith('@'))throw new Error('알 수 없는 구형 랭킹 멤버 형식');
  keys.add(`career:card:${String(member).slice(1)}`);
 }
 const rows=[];let existing=0,missing=0;
 const all=[...keys];
 for(let i=0;i<all.length;i+=100){
  const chunk=all.slice(i,i+100),raws=await kv('MGET',...chunk);
  if(!Array.isArray(raws)||raws.length!==chunk.length)throw new Error('KV 카드 읽기 응답 오류');
  for(let j=0;j<chunk.length;j++){
   const raw=raws[j];if(raw==null){missing++;continue;}
   const card=JSON.parse(raw),next=calculateCard(card);existing++;
   if(next!==card)rows.push({key:chunk[j],before:raw,after:JSON.stringify(next)});
  }
 }
 return {existing,missing,rows};
}
// 원문이 같을 때만 finance를 추가한다. 실행 중 새로 등록된 최고 기록은 건드리지 않는다.
const CAS="if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end redis.call('SET',KEYS[1],ARGV[2],'KEEPTTL') return 1";
export async function applyBackfill(kv,plan){
 let updated=0,conflicts=0;
 for(const row of plan.rows){
  const result=await kv('EVAL',CAS,1,row.key,row.before,row.after);
  if(Number(result)===1){
   if(await kv('GET',row.key)!==row.after)throw new Error('저장 후 검증 불일치');
   updated++;
  }else conflicts++;
 }
 return {updated,conflicts};
}
function saveExclusive(file,data){
 if(!path.isAbsolute(file))throw new Error('출력 경로는 절대경로를 사용하세요.');
 const repo=path.resolve(new URL('..',import.meta.url).pathname);
 if(file===repo||file.startsWith(repo+path.sep))throw new Error('운영 데이터는 저장소 외부에 저장하세요.');
 fs.writeFileSync(file,JSON.stringify(data,null,2),{flag:'wx',mode:0o600});
}
async function main(){
 const args=process.argv.slice(2),value=flag=>args[args.indexOf(flag)+1];
 const publicMode=args.includes('--public-out'),apply=args.includes('--apply');
 if(publicMode){
  if(apply)throw new Error('공개 API 계산은 운영 저장을 지원하지 않습니다.');
  const get=async params=>{const r=await fetch('https://coyg.vercel.app/api/career?'+new URLSearchParams(params),{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error(`공개 API HTTP ${r.status}`);return r.json();};
  const entries=[];
  for(const p of positions){const board=await get({a:'board',p});if(!Array.isArray(board.top))throw new Error('랭킹 읽기 실패');entries.push(...board.top.map(row=>({key:row.key,p})));}
  const results=new Array(entries.length);let cursor=0;
  await Promise.all(Array.from({length:4},async()=>{while(cursor<entries.length){const i=cursor++,row=entries[i],response=await get({a:'card',k:row.key,p:row.p});results[i]={...row,card:calculateCard(response.card)};}}));
  saveExclusive(value('--public-out'),{createdAt:new Date().toISOString(),source:'public-top-100-per-position',records:results});
  console.log(JSON.stringify({calculated:results.length,byPosition:Object.fromEntries(positions.map(p=>[p,results.filter(r=>r.p===p).length])),storedInKV:false}));return;
 }
 const url=process.env.KV_REST_API_URL,token=apply?process.env.KV_REST_API_TOKEN:(process.env.KV_REST_API_READ_ONLY_TOKEN||process.env.KV_REST_API_TOKEN);
 if(!url||!token)throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN이 필요합니다.');
 const kv=async(...command)=>{const r=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`KV HTTP ${r.status}`);const j=await r.json();if(j.error)throw new Error(`KV ${command[0]} 실패`);return j.result;};
 const plan=await prepareBackfill(kv);
 console.log(JSON.stringify({existing:plan.existing,toUpdate:plan.rows.length,alreadySaved:plan.existing-plan.rows.length,dry:!apply}));
 if(!apply)return;
 if(!args.includes('--backup'))throw new Error('--backup 절대경로가 필요합니다.');
 saveExclusive(value('--backup'),{createdAt:new Date().toISOString(),rows:plan.rows});
 const result=await applyBackfill(kv,plan);console.log(JSON.stringify(result));
 if(result.conflicts)process.exitCode=2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
