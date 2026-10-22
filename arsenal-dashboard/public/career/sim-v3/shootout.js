import {penaltyPowerProfile,penaltyKickKind} from './penalty-rules.js';
// 승부차기는 서버가 판정한다. 개인 킥과 양 팀 나머지 킥을 합쳐 승패를 확정한다.
function random(seed,key){let h=seed>>>0;for(const c of key)h=Math.imul(h^c.charCodeAt(0),16777619);return ()=>{h+=0x6D2B79F5;let t=Math.imul(h^(h>>>15),h|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
export function kickVerdict(seed,key,input){
 if(!input||!Number.isFinite(input.x)||!Number.isFinite(input.y)||!Number.isFinite(input.power)||input.x<0||input.x>1||input.y<0||input.y>1||input.power<0||input.power>100)throw Error('슛 방향과 파워를 다시 입력해 주세요.');
 const kind=penaltyKickKind(input,random(seed,'kick|'+key)),chance=penaltyPowerProfile(input).chance;
 return {kind,scored:kind==='goal',x:input.x,y:input.y,power:input.power,chance};
}
export function shootoutFor(seed,key,decision){
 const R=random(seed,'shootout|'+key);if(R()>=.24)return null;
 const ours=[],theirs=[];let a=0,b=0;
 for(let i=0;i<4;i++){const o=R()<.76,t=R()<.76;ours.push(o);theirs.push(t);a+=+o;b+=+t;if(a>b+5-(i+1)||b>a+5-(i+1))return null;}
 // 내 선수는 다섯 번째 키커. 이미 끝난 승부차기는 직접 조작하지 않는다.
 if(Math.abs(a-b)>1)return null;
 const prefix={ours:ours.slice(),theirs:theirs.slice(),our:a,their:b};
 if(!decision)return {...prefix,pending:true};
 const kick=decision.auto?kickVerdict(seed,key,{x:.25,y:.5,power:68}):kickVerdict(seed,key,decision);
 ours.push(kick.scored);a+=+kick.scored;
 if(a>=b&&a-b<=1){const last=R()<.76;theirs.push(last);b+=+last;}
 // 동점이면 동료 키커와 상대의 서든데스로 이어진다.
 for(let i=0;a===b&&i<100;i++){const o=R()<.76,t=R()<.76;ours.push(o);theirs.push(t);a+=+o;b+=+t;}
 if(a===b){const o=R()<.5;ours.push(o);theirs.push(!o);a+=+o;b+=+!o;}
 return {pending:false,ours,theirs,our:a,their:b,won:a>b,kick,prefix};
}
export function penaltyKey(year,w,stage){return year+'|'+w.id+'|'+stage;}
