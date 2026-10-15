import assert from 'node:assert/strict';
import {calculateCard,prepareBackfill,applyBackfill} from './backfill_career_finance.mjs';
const old={id:'old',pos:'FW',score:123,honors:[],seasons:[{age:24,club:'아스날',ovr:80,apps:32,goals:20,ast:5}]};
const next=calculateCard(old);assert(!old.finance);assert(next.finance.totalAnnualIncome>0);
const {finance,...rest}=next;assert.deepEqual(rest,old);assert.equal(calculateCard(next),next);
const stored=new Map([['career:card:old:FW',JSON.stringify(old)],['career:card:legacy',JSON.stringify({...old,id:'legacy'})],['career:card:new:FW',JSON.stringify(next)]]),commands=[];
const kv=async(...args)=>{
 commands.push(args);
 if(args[0]==='ZRANGE')return args[1]==='career:board:v2:FW'?['@old','@legacy','@new']:args[1]==='career:board:v1'?['@legacy']:[];
 if(args[0]==='MGET')return args.slice(1).map(k=>stored.get(k)??null);
 if(args[0]==='GET')return stored.get(args[1]);
 if(args[0]==='EVAL'){const [,lua,n,key,before,after]=args;assert.equal(n,1);assert(lua.includes('KEEPTTL'));if(stored.get(key)!==before)return 0;stored.set(key,after);return 1;}
 throw new Error('Unexpected write '+args[0]);
};
const plan=await prepareBackfill(kv);assert.equal(plan.existing,3);assert.equal(plan.rows.length,2);assert(commands.every(a=>['ZRANGE','MGET'].includes(a[0])));
// A player registers a newer best record between reading and writing.
stored.set('career:card:old:FW',JSON.stringify({...old,id:'new-record',score:999}));
assert.deepEqual(await applyBackfill(kv,plan),{updated:1,conflicts:1});assert.equal(JSON.parse(stored.get('career:card:old:FW')).score,999);
assert.deepEqual(JSON.parse(stored.get('career:card:legacy')).finance,finance);
const rerun=await prepareBackfill(kv);assert.equal(rerun.rows.length,1);
assert.deepEqual(await applyBackfill(kv,rerun),{updated:1,conflicts:0});assert.equal((await prepareBackfill(kv)).rows.length,0);
assert(!commands.some(a=>['ZADD','ZREM','HSET','DEL'].includes(a[0])));
assert.throws(()=>calculateCard({pos:'FW',seasons:[]}));
console.log('PASS one-off backfill: dry run, legacy keys, stored values skipped, CAS protects new records, repeat safe, scores/boards unchanged');
