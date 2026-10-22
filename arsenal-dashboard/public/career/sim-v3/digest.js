import {cardView} from './sim.js';
// 키 삽입 순서와 무관하게 같은 기록을 봉인한다. 배열의 선택 순서는 유지한다.
export function stableJSON(value){
 if(Array.isArray(value))return '['+value.map(v=>v===undefined?'null':stableJSON(v)).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+stableJSON(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
// 은퇴 카드 전체와 점수·커리어·규칙 버전을 대조한다. Web Crypto는 Node와 브라우저가 공유한다.
export async function stateDigest(C){
 const summary={simVersion:C.simVersion,phase:C.phase,id:C.id,score:C.score,card:cardView(C)};
 const hash=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(stableJSON(summary)));
 return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
}
