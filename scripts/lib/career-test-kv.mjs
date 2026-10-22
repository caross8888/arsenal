// 등록 경로를 측정할 때 운영 KV 대신 쓰는 메모리 저장소다. 외부 연결을 하지 않는다.
export function careerTestKV(){
 const values=new Map(),hashes=new Map(),boards=new Map(),commands=[];
 return {commands,values,reset(){values.clear();hashes.clear();boards.clear();commands.length=0;},async fetch(url,init){
  if(new URL(url).hostname!=='career-test.upstash.io')throw Error('테스트 외부 요청 차단');
  const [op,key,...args]=JSON.parse(init.body);commands.push(op);let result=null;
  if(op==='SET'){if(args.includes('NX')&&values.has(key))result=null;else{values.set(key,args[0]);result='OK';}}
  else if(op==='INCR'){result=Number(values.get(key)||0)+1;values.set(key,result);}
  else if(op==='EXPIRE')result=1;
  else if(op==='ZSCORE')result=boards.get(key)?.get(args[0])??null;
  else if(op==='ZADD'){if(!boards.has(key))boards.set(key,new Map());boards.get(key).set(args[1],Number(args[0]));result=1;}
  else if(op==='ZREVRANK'){const list=[...(boards.get(key)||[])].sort((a,b)=>b[1]-a[1]);const i=list.findIndex(([m])=>m===args[0]);result=i<0?null:i;}
  else if(op==='ZRANGE')result=[];
  else if(op==='HSET'){if(!hashes.has(key))hashes.set(key,new Map());hashes.get(key).set(args[0],args[1]);result=1;}
  else throw Error('테스트에 없는 KV 명령 '+op);
  return {ok:true,json:async()=>({result})};
 }};
}
