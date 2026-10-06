// scripts/build_whoami.mjs — "Who Am I?" 문제 은행을 만들어 통계·샘플을 출력한다(로컬 확인용)
//
//   NODE_USE_ENV_PROXY=1 node scripts/build_whoami.mjs           # 프록시 환경(클라우드 세션)
//   node scripts/build_whoami.mjs --out whoami.json               # 결과 파일로 저장
//
// 운영과 같은 arsenal-dashboard/api/_whoami.js를 쓴다. 응답은 OS 임시 폴더(arsenal-whoami-cache)에
// 캐시하므로 두 번째부터는 네트워크를 거의 안 탄다. 새로 받으려면 그 폴더를 지울 것.

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { WIKI_UA, fetchWikiPlayers, fetchKoNames, isModern, resolveFotmob, toQuestion } from '../arsenal-dashboard/api/_whoami.js';

const args = process.argv.slice(2);
const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;

const CACHE_DIR = path.join(os.tmpdir(), 'arsenal-whoami-cache');
fs.mkdirSync(CACHE_DIR, {recursive: true});
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 위키미디어는 공용 IP에 요청 제한(429)을 자주 건다 — 간격을 두고 재시도한다.
async function fetchJSON(url, opts = {}){
  const file = path.join(CACHE_DIR, crypto.createHash('sha1').update(url).digest('hex') + '.json');
  if(fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const headers = {'User-Agent': opts.wiki ? WIKI_UA : 'Mozilla/5.0'};
  for(let i = 0; i < 10; i++){
    const r = await fetch(url, {headers});
    if(r.ok){
      const j = await r.json();
      fs.writeFileSync(file, JSON.stringify(j));
      await sleep(opts.wiki ? 1500 : 250);
      return j;
    }
    if(r.status !== 429 && r.status < 500) throw new Error(`${r.status} ${url}`);
    await sleep(4000 + i * 3000);
  }
  throw new Error(`재시도 초과 ${url}`);
}

const rows = (await fetchWikiPlayers(fetchJSON)).filter(isModern);
console.log(`위키백과 대상 선수: ${rows.length}명`);
const ko = await fetchKoNames(fetchJSON, rows.map(r => r.article));

const bank = [], rejected = {};
let i = 0;
for(const row of rows){
  i++;
  if(i % 25 === 0) console.log(`  ${i}/${rows.length}…`);
  let fm = null;
  try { fm = await resolveFotmob(fetchJSON, row); } catch(e){ (rejected['Fotmob 오류'] ||= []).push(row.name); continue; }
  if(!fm){ (rejected['Fotmob에서 못 찾음'] ||= []).push(row.name); continue; }
  const {reason, q} = toQuestion(row, fm, ko[row.article]);
  if(reason){ (rejected[reason] ||= []).push(row.name); continue; }
  bank.push(q);
}

bank.sort((a, b) => b.apps - a.apps);
console.log(`\n문제로 쓸 수 있는 선수: ${bank.length}명 (한국어 이름 ${bank.filter(q => q.ko).length}명)`);
for(const [why, names] of Object.entries(rejected)){
  console.log(`  제외 — ${why}: ${names.length}명 (예: ${names.slice(0, 6).join(', ')})`);
}
const show = q => `${q.ko || q.name} [${q.retired ? '은퇴' : '현역'}, 아스날 ${q.apps}경기]\n    `
  + q.career.map(c => `${c.n} ${c.f}–${c.u ?? ''}${c.l ? '(임대)' : ''}`).join(' → ');
console.log('\n샘플:');
for(const n of ['Andrey Arshavin', 'Thierry Henry', 'Bukayo Saka', 'Cesc Fàbregas']){
  const q = bank.find(b => b.name === n);
  console.log('  ' + (q ? show(q) : n + ' (없음)'));
}
for(const q of bank.filter((_, k) => k % 40 === 7).slice(0, 5)) console.log('  ' + show(q));
if(outFile){ fs.writeFileSync(outFile, JSON.stringify(bank)); console.log(`\n저장: ${outFile}`); }
