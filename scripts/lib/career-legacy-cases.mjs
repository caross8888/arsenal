import {createHash} from 'node:crypto';
export async function legacyCases(S,handler,codec){
 const out=[];
 const call=async(a,body)=>{let v,status=200;await handler({method:'POST',query:{a},headers:{},body},{setHeader(){},status(n){status=n;return this;},json(j){v=j;}});if(status!==200)throw Error(a+': '+JSON.stringify(v));return v;};
 for(let i=0;i<24;i++){
  const C=S.createCareer({name:'기존커리어',nation:['KOR','ENG','BRA','JPN','NGA','FRA'][i%6],foot:'오른발',body:S.BODIES[i%S.BODIES.length],pos:['FW','MF','DF'][i%3],card:i%5,num:9,dream:null},i%3,Math.imul(i+1,2654435761)>>>0);
  C.id='legacy-fixture';const hash=createHash('sha256');let token=codec.seal(C),steps=0;
  for(;steps<150;steps++){
   const v=await call('view',{token}),D=codec.open(token);hash.update(JSON.stringify(D));
   if(v.phase==='retired')break;
   let a,b={token};
   if(v.phase==='prep'){a='season';Object.assign(b,{train:v.prep.trainOpts[(steps+i)%v.prep.trainOpts.length],evPick:(steps+i)%2,loanPick:0});}
   else if(v.phase==='injury'){a='season';b.injPick=(steps+i)%2;}
   else if(v.phase==='penalty'){a='penalty';Object.assign(b,{key:v.shootout.key,x:.2,y:.6,power:68});}
   else if(v.phase==='result'){
    if(v.result.forced){a='retire';}
    else if(v.player.military?.lastChance&&!v.player.military?.selected){a='military';b.action='regular';}
    else{a='next';Object.assign(b,{pick:v.result.released?0:!(v.player.military?.selected||v.player.military?.service)&&v.result.offers.length&&steps%3===0?0:null,trait:v.result.traitOffer.length?i%v.result.traitOffer.length:null});}
   }
   const result=await call(a,b);token=result.token;
  }
  if(steps>=150)throw Error('legacy did not retire');
  out.push({i,steps,sha256:hash.digest('hex')});
 }
 return out;
}
