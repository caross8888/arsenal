import {stableJSON} from '../../arsenal-dashboard/public/career/sim-v3/digest.js';
// 버전 표식은 의도한 차이라 제외하고 나머지 상태·카드는 정확히 대조한다.
export function normalized(C){const v=JSON.parse(JSON.stringify(C));delete v.simVersion;delete v.localAdult;return v;}
export function differences(a,b,path=''){
 if(stableJSON(a)===stableJSON(b))return [];
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return [{path,v2:a,v3:b}];
 return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>differences(a[k],b[k],path?path+'.'+k:k));
}
export function displayOnly(diff){return diff.length>0&&diff.every(d=>/(?:chance|probability)$/i.test(d.path)&&typeof d.v2==='number'&&typeof d.v3==='number'&&Math.round(d.v2*1e6)===Math.round(d.v3*1e6));}
