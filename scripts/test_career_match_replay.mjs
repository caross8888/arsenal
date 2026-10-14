import assert from 'node:assert/strict';
import '../arsenal-dashboard/public/career/match-playback.js';
import {nationalSchedule} from '../arsenal-dashboard/api/_career_international.js';
const {highlights,choreography,sampleScene,patterns}=globalThis.CareerMatchReplay;
let tested=0;
for(let seed=1;seed<=500;seed++){
 const schedule=nationalSchedule({seed,nation:'KOR',year:2030,caps:13,goals:6,ast:4,cs:3,cup:'월드컵',cupApps:5,won:seed%2===0});
 for(const m of schedule.flatMap(w=>w.matches)){
  const context={year:2030,nation:'KOR',player:'김도윤'},p=highlights(m,context);assert.deepEqual(p,highlights(m,context));
  assert.equal(p.events.filter(e=>e.kind==='goal'&&e.team===0).length,m.our);assert.equal(p.events.filter(e=>e.kind==='goal'&&e.team===1).length,m.their);
  assert.equal(p.events.filter(e=>e.personal==='goal').length,m.played?m.g:0);assert.equal(p.events.filter(e=>e.personal==='assist').length,m.played?m.a:0);
  assert(p.events.every((e,i)=>e.minute>0&&e.minute<p.end&&(!i||e.minute>p.events[i-1].minute)));
  let a=0,b=0;for(const e of p.events){if(e.kind==='goal'){if(e.team)b++;else a++;}assert.deepEqual(e.score,{our:a,their:b});}
  assert.equal(new Set(p.events.slice(0,patterns.filter(p=>p!=='farcut').length).map(e=>e.pattern)).size,Math.min(patterns.filter(p=>p!=='farcut').length,p.events.length));assert(p.events.every((e,i)=>!i||e.pattern!==p.events[i-1].pattern));assert.equal(p.events.length,m.our+m.their||3);assert.deepEqual(p.events.at(-1).score,{our:m.our,their:m.their});tested++;
 }
}
const tied={stage:'결승',opp:'FRA',played:true,our:1,their:1,g:1,a:0,pk:{pending:true}};assert.equal(highlights(tied).end,120);assert.equal(highlights({...tied,pk:undefined}).end,90);
assert.equal(highlights({...tied,played:false}).events.filter(e=>e.personal).length,0);
console.log('PASS',tested,'match plans: exact score, personal goals/assists, chronological minutes, deterministic replay; PK 120 minutes and bench handling');

// Smooth bounded tracks, continuous ball transfers, aerial crosses and dynamic fullbacks.
for(const pattern of ['combine','wing','counter','cutback','through'])for(const team of [0,1])for(const minute of [30,70])for(const heroIndex of [3,6,9]){
 const scene=choreography({team,minute,pattern,lane:18,goalY:52,personal:'goal'},{heroIndex});let prev=sampleScene(scene,0);
 for(let i=1;i<=1000;i++){
  const next=sampleScene(scene,i/1000);assert.equal(next.positions.length,22);
  next.positions.forEach((p,j)=>{assert(Number.isFinite(p.x)&&Number.isFinite(p.y));assert(p.x>=0&&p.x<=100&&p.y>=0&&p.y<=100);assert(Math.hypot(p.x-prev.positions[j].x,p.y-prev.positions[j].y)<.5,'player snapped');});
  assert(Math.hypot(next.ball.x-prev.ball.x,next.ball.y-prev.ball.y)<1,'ball snapped at transfer');prev=next;
 }
 const start=sampleScene(scene,0),late=sampleScene(scene,.58),attacker=late.positions.filter(p=>p.team===team);
 assert(Math.abs(attacker.find(p=>p.i===1).x-start.positions.find(p=>p.team===team&&p.i===1).x)>10);
 if(pattern==='wing')assert(sampleScene(scene,.66).height>20,'cross must be airborne');
 else assert.equal(sampleScene(scene,.66).height,0,'ground delivery stays on pitch');
}
for(const pk of [undefined,{pending:true}]){
 const plan=highlights({our:0,their:0,played:true,pk});
 assert.equal(plan.events.length,3);assert(plan.events.some(e=>e.kind==='save'));assert(plan.events.some(e=>e.kind==='miss'));assert.equal(new Set(plan.events.map(e=>e.team)).size,2);
 for(const e of plan.events){assert.deepEqual(e.score,{our:0,their:0});assert.equal(e.personal,null);}
}
for(const kind of ['save','miss'])for(const team of [0,1])for(const minute of [30,70])for(const pattern of patterns){
 const scene=choreography({kind,team,minute,pattern,lane:18,goalY:52,personal:null,sceneSeed:37});let previous=sampleScene(scene,0);
 for(let i=1;i<=1000;i++){const next=sampleScene(scene,i/1000);assert(Math.hypot(next.ball.x-previous.ball.x,next.ball.y-previous.ball.y)<1,'non-scoring shot snapped');previous=next;}
 const end=sampleScene(scene,1),ball=end.ball;
 if(kind==='save'){const keeper=end.positions.find(p=>p.team!==team&&p.i===0);assert(Math.hypot(ball.x-keeper.x,ball.y-keeper.y)<.001,'saved shot must end at keeper');assert(ball.x>0&&ball.x<100);}
 else assert(ball.y<40||ball.y>60,'miss must pass outside the goalposts');
}
console.log('PASS continuous player/ball paths, role-based fullback movement, aerial/ground delivery, scoreless match');

// Regression: receiving a pass must not bring the whole pitch to a standstill.
for(const pattern of ['combine','wing','counter','cutback','through'])for(const team of [0,1])for(const lane of [18,82]){
 const scene=choreography({team,minute:30,pattern,lane,goalY:52,personal:'goal'}),epsilon=.00001;
 for(const time of [.18,.38,.58,.72]){
  const before=sampleScene(scene,time-epsilon),at=sampleScene(scene,time),after=sampleScene(scene,time+epsilon);
  let moving=0;
  at.positions.forEach((p,i)=>{
   const left={x:(p.x-before.positions[i].x)/epsilon,y:(p.y-before.positions[i].y)/epsilon},right={x:(after.positions[i].x-p.x)/epsilon,y:(after.positions[i].y-p.y)/epsilon};
   assert(Math.hypot(left.x-right.x,left.y-right.y)<.1,'velocity discontinuity at waypoint');
   if(Math.hypot(left.x,left.y)>1)moving++;
  });
  const reception=scene.legs.find(l=>l.end===time&&l.to!==undefined);
  if(reception){assert(moving>=12,'players collectively stopped at the actual pass arrival');const i=at.positions.findIndex(p=>p.team===team&&p.i===reception.to);assert(Math.hypot(after.positions[i].x-before.positions[i].x,after.positions[i].y-before.positions[i].y)/(2*epsilon)>1,'receiver must keep running');}
 }
}
console.log('PASS continuous velocity at pass arrivals, receivers running through the ball, no collective pauses');

const routes=['combine','wing','counter','cutback','through'].map(pattern=>choreography({team:0,minute:30,pattern,lane:18,goalY:52,personal:'goal'}));
assert.equal(new Set(routes.map(r=>JSON.stringify(r.legs))).size,5,'patterns need distinct passing rhythms');
assert.equal(routes[0].legs.length,5);assert.equal(routes[2].legs.length,3);assert.equal(routes[4].legs.length,3);
const cutback=routes[3];assert(sampleScene(cutback,.76).ball.x<sampleScene(cutback,.66).ball.x,'cutback must go backward from byline');
for(const scene of routes)for(const leg of scene.legs.filter(l=>l.to!==undefined)){
 const time=leg.end,eps=.00001,before=sampleScene(scene,time-eps),after=sampleScene(scene,time+eps),i=before.positions.findIndex(p=>p.team===scene.team&&p.i===leg.to);
 assert(Math.hypot(after.positions[i].x-before.positions[i].x,after.positions[i].y-before.positions[i].y)/(2*eps)>1,'running reception at the new passing rhythms');
 assert(Math.hypot(after.ball.x-before.ball.x,after.ball.y-before.ball.y)<.03,'ball snaps at new reception');
}
console.log('PASS unique goal pattern selection, five distinct passing rhythms, backward cutback and continuous new receptions');

for(const pattern of ['longshot','switch','lowcross','corner'])for(const team of [0,1])for(const lane of [18,82])for(const heroIndex of [3,6,9])for(const personal of ['goal','assist']){
 const scene=choreography({pattern,team,lane,minute:70,goalY:52,personal},{heroIndex});let prev=sampleScene(scene,0);
 for(let i=1;i<=1000;i++){
  const next=sampleScene(scene,i/1000);next.positions.forEach((p,j)=>{assert(p.x>=0&&p.x<=100&&p.y>=0&&p.y<=100);assert(Math.hypot(p.x-prev.positions[j].x,p.y-prev.positions[j].y)<.5);});
  assert(Math.hypot(next.ball.x-prev.ball.x,next.ball.y-prev.ball.y)<1,'new delivery snapped');assert(Math.abs(next.height-prev.height)<2,'aerial height snapped');prev=next;
 }
 const shot=scene.legs.at(-1),strike=sampleScene(scene,shot.release);
 if(pattern==='longshot')assert((scene.dir>0?strike.ball.x:100-strike.ball.x)<80,'long shot from outside box');
 if(pattern==='switch'){assert.equal(scene.legs[0].type,'lob');assert(sampleScene(scene,.30).height>30);}
 if(pattern==='lowcross')assert.equal(sampleScene(scene,.70).height,0);
 if(pattern==='corner'){assert.equal(shot.type,'header');assert(sampleScene(scene,.74).positions.some(p=>p.jump>7));assert(sampleScene(scene,.78).height>0);}
 assert.equal(shot.from,personal==='goal'&&team===0?heroIndex:team===0&&heroIndex===9?8:9);
 if(personal==='assist'&&team===0)assert.equal(scene.legs.at(-2).from,heroIndex,'credited assist must deliver final ball');
}
console.log('PASS four new patterns, aerial/ground distinction, header jump, personal records, mirrored bounds and smooth deliveries');

for(const pattern of ['dribble','chip','freekick','shortcorner'])for(const team of [0,1])for(const lane of [18,82])for(const heroIndex of [3,6,9])for(const personal of ['goal','assist']){
 const scene=choreography({pattern,team,lane,minute:70,goalY:52,personal},{heroIndex});let prev=sampleScene(scene,0);
 for(let i=1;i<=1000;i++){
  const next=sampleScene(scene,i/1000);next.positions.forEach((p,j)=>{assert(p.x>=0&&p.x<=100&&p.y>=0&&p.y<=100);assert(Math.hypot(p.x-prev.positions[j].x,p.y-prev.positions[j].y)<.5);});
  assert(Math.hypot(next.ball.x-prev.ball.x,next.ball.y-prev.ball.y)<1);assert(Math.abs(next.height-prev.height)<2);prev=next;
 }
 if(pattern==='chip'){assert(sampleScene(scene,.78).height>30);const keeper=sampleScene(scene,.72).positions.find(p=>p.team!==team&&p.i===0);assert(Math.abs(keeper.x-(scene.dir>0?100:0))>8,'keeper must come off line');}
 if(pattern==='freekick'){assert(sampleScene(scene,.63).positions.filter(p=>p.team!==team&&p.jump>0).length===3,'wall jumps');if(personal==='goal')assert.equal(scene.legs.length,1);}
 if(pattern==='dribble'){assert.equal(scene.legs.length,2);const carrier=scene.legs[0].to;const y=t=>sampleScene(scene,t).positions.find(p=>p.team===team&&p.i===carrier).y;assert((y(.58)-y(.38))*(y(.72)-y(.58))<0,'dribble must change direction');}
 if(pattern==='shortcorner'){assert.equal(scene.legs.length,3);assert.equal(scene.legs.at(-1).type,'header');}
 if(personal==='assist'&&team===0)assert.equal(scene.legs.at(-2).from,heroIndex,'last pass belongs to credited assister');
}
console.log('PASS four additional patterns: dribble direction changes, chip over advancing keeper, free kick wall and short corner; continuity and personal assists');

const {playerRole,finishOptions,assistOptions}=globalThis.CareerMatchReplay;
for(const [name,pos,card,foot,flank,index] of [
 ['윙어','FW',0,'오른발','right',10],['윙어','FW',0,'왼발','left',8],
 ['인사이드 포워드','FW',1,'오른발','left',8],['인사이드 포워드','FW',1,'왼발','right',10],
 ['풀백','DF',3,'오른발','right',4],['풀백','DF',3,'왼발','left',1],
 ['수비형 미드필더','MF',4,'오른발',null,6],['수비형 미드필더','MF',4,'왼발',null,6]]){
 const role=playerRole({pos,card,foot});assert.equal(role.name,name);assert.equal(role.flank,flank);assert.equal(role.index,index);
 for(const minute of [30,70])for(const team of [0,1]){
  const scene=choreography({pattern:'combine',team,minute,lane:18,goalY:52,personal:null},{role,heroIndex:index});
  if(team===0){assert.notEqual(scene.legs.at(-1).from,index,'uncredited teammate goal must not use our highlighted player');assert.notEqual(scene.legs.at(-2).from,index,'uncredited assist must not use our highlighted player');}
  const first=sampleScene(scene,0).positions.find(p=>p.team===0&&p.i===index),forward=minute<=45?first.x:100-first.x,lateral=minute<=45?first.y:100-first.y;
  assert(role.flank?(lateral-50)*(role.y-50)>0:Math.abs(lateral-50)<16,'role zone must follow attacking direction');
  if(name==='수비형 미드필더')assert(forward>=29&&forward<=49,'DM in front of defensive line');
  if(name==='풀백')assert(forward<=46,'fullback starts in defensive flank');
 }
 for(const pattern of patterns)for(const personal of ['goal','assist']){
  if(personal==='goal'&&finishOptions(role)&&!finishOptions(role).some(p=>p.pattern===pattern))continue;if(personal==='assist'&&assistOptions(role)&&!assistOptions(role).includes(pattern))continue;
  const scene=choreography({pattern,team:0,minute:30,lane:18,goalY:52,personal},{role,heroIndex:index});let prev=sampleScene(scene,0);
  for(let i=1;i<=300;i++){const next=sampleScene(scene,i/300);assert(next.positions.every(p=>p.x>=0&&p.x<=100&&p.y>=0&&p.y<=100));assert(Math.hypot(next.ball.x-prev.ball.x,next.ball.y-prev.ball.y)<3.5);prev=next;}
  if(personal==='goal')assert.equal(scene.legs.at(-1).from,index);
  else assert.equal(scene.legs.at(-2).from,index);
 }
}
console.log('PASS role/card/foot mapping, attacking-relative flanks across halves, DM/fullback positions and personal goal/assist identity across all patterns');


// Pick role-appropriate sequences before playback, rather than fitting every template to every role.
for(const [pos,card] of [['DF',3],['DF',4],['DF',5],['MF',4],['MF',3],['DF',0],['DF',1],['DF',2]]){
 const role=playerRole({pos,card,foot:'오른발'}),allowed=finishOptions(role),counts={};
 for(let seed=0;seed<2000;seed++){
  const plan=highlights({stage:'16강',opp:'NED',our:1,their:0,g:1,a:0,played:true},{pos,card,foot:'오른발',year:seed});
  const event=plan.events[0];assert(allowed.some(p=>p.pattern===event.pattern),'incompatible role goal selected');counts[event.pattern]=(counts[event.pattern]||0)+1;
 }
 if(card>=3&&pos==='DF')assert(counts.halfspace>(card===5?1400:1150)&&counts.halfspace<(card===5?1800:1500),'fullback predominantly combines and enters halfspace');
 if(pos==='DF'&&card<3)assert(counts.longshot>40&&counts.longshot<160,'CB long shots must remain rare');
 for(const foot of ['오른발','왼발'])for(const minute of [30,70])for(const {pattern} of allowed){
  const actualRole=playerRole({pos,card,foot}),scene=choreography({pattern,team:0,minute,lane:actualRole.y,goalY:52,personal:'goal'},{role:actualRole,heroIndex:actualRole.index});
  const forward=x=>minute<=45?x:100-x;
  let prior=sampleScene(scene,0);
  for(let i=1;i<=1000;i++){const next=sampleScene(scene,i/1000);next.positions.forEach((p,j)=>{assert(p.x>=0&&p.x<=100&&p.y>=0&&p.y<=100);assert(Math.hypot(p.x-prior.positions[j].x,p.y-prior.positions[j].y)<.5);});assert(Math.hypot(next.ball.x-prior.ball.x,next.ball.y-prior.ball.y)<1);prior=next;}
  const start=sampleScene(scene,0).positions.find(p=>p.team===0&&p.i===actualRole.index),end=sampleScene(scene,.84).positions.find(p=>p.team===0&&p.i===actualRole.index);
  if(pattern==='halfspace'){assert.equal(scene.legs[0].from,actualRole.index,'fullback starts the combination');assert.equal(scene.legs[0].to,scene.legs[1].from);assert(Math.abs(end.x-start.x)<30,'no implausible sprint from defense into number nine');assert(forward(end.x)<90);}
  if(pattern==='longshot'){assert(Math.abs(end.x-start.x)<12,'long shot starts from a plausible advanced support position');assert(forward(sampleScene(scene,scene.legs.at(-1).release).ball.x)<80);}
  assert.equal(scene.legs.at(-1).from,actualRole.index);
 }
}
console.log('PASS role-specific weighted goal selection, fullback combination/halfspace run, rare CB long shots, plausible starting positions and smooth actual routes');

assert.throws(()=>choreography({team:0,personal:'goal',pattern:'chip',minute:30,lane:82,goalY:52},{role:playerRole({pos:'DF',card:3}),heroIndex:4}),/Unsupported goal sequence/);

for(const [pos,card] of [['DF',3],['DF',4],['FW',0],['FW',1]])for(const foot of ['오른발','왼발'])for(const minute of [30,70]){
 const role=playerRole({pos,card,foot});assert(finishOptions(role).some(p=>p.pattern==='farcut'));
 const scene=choreography({pattern:'farcut',team:0,minute,lane:role.y,goalY:52,personal:'goal'},{role,heroIndex:role.index}),delivery=scene.legs[1];
 assert.equal(delivery.type,'cross');assert(delivery.end<scene.legs.at(-1).release-.15,'must control and carry before shooting');
 const receiver=t=>sampleScene(scene,t).positions.find(p=>p.team===0&&p.i===role.index);
 const giver=sampleScene(scene,delivery.release).positions.find(p=>p.team===0&&p.i===delivery.from),land=receiver(delivery.end),shot=receiver(scene.legs.at(-1).release);
 assert((giver.y-50)*(land.y-50)<0,'cross must arrive from opposite flank');assert(Math.abs(giver.y-land.y)>50,'delivery reaches far side');
 assert(Math.abs(land.y-50)>20,'receive wide beyond far post');assert(Math.abs(shot.y-50)<Math.abs(land.y-50)-12,'carry diagonally inside');
 assert(sampleScene(scene,.44).height>25);assert.equal(sampleScene(scene,.65).height,0,'ball controlled on ground before cut inside');
 assert.equal(scene.legs.at(-1).from,role.index);let prior=sampleScene(scene,0);
 for(let i=1;i<=1000;i++){const next=sampleScene(scene,i/1000);assert(Math.hypot(next.ball.x-prior.ball.x,next.ball.y-prior.ball.y)<1);next.positions.forEach((p,j)=>assert(Math.hypot(p.x-prior.positions[j].x,p.y-prior.positions[j].y)<.5));prior=next;}
}
assert(!finishOptions(playerRole({pos:'DF',card:0})).some(p=>p.pattern==='farcut'));
console.log('PASS opposite-flank aerial cross, wide control, inward carry then shot; four eligible roles, both feet and halves, continuous reception');

for(const [pos,card,deep] of [['MF',4,true],['DF',0,true],['DF',3,true],['FW',2,false],['FW',0,false],['MF',1,false]])for(const minute of [30,70])for(const personal of ['goal','assist']){
 const role=playerRole({pos,card,foot:'오른발'}),scene=choreography({pattern:'rebound',team:0,minute,lane:18,goalY:52,personal},{role,heroIndex:role.index});
 const forward=x=>minute<=45?x:100-x,clear=scene.legs.find(l=>l.type==='rebound'),blocked=scene.legs.find(l=>l.target);
 assert.equal(blocked.end,clear.release);assert.equal(blocked.target.x,clear.origin.x);assert.equal(blocked.target.y,clear.origin.y);
 const receiver=sampleScene(scene,clear.end).positions.find(p=>p.team===0&&p.i===clear.to);
 assert(deep?forward(receiver.x)<80:forward(receiver.x)>85,'different second-ball receiving depth by role');
 assert.equal(scene.legs.at(-1).from,personal==='goal'?role.index:role.index===9?8:9);
 if(personal==='assist')assert.equal(scene.legs.at(-2).from,role.index);
 let prev=sampleScene(scene,0);
 for(let i=1;i<=1000;i++){const next=sampleScene(scene,i/1000);assert(Math.hypot(next.ball.x-prev.ball.x,next.ball.y-prev.ball.y)<1);assert(Math.abs(next.height-prev.height)<2);next.positions.forEach((p,j)=>{assert(p.x>=0&&p.x<=100&&p.y>=0&&p.y<=100);assert(Math.hypot(p.x-prev.positions[j].x,p.y-prev.positions[j].y)<.5);});prev=next;}
 const during=(clear.release+clear.end)/2;assert.equal(sampleScene(scene,during).leg,'rebound');assert(sampleScene(scene,during).height>0);
}
console.log('PASS set-piece block/clearance, defensive second ball behind box, attacking scramble finish, continuity, both halves and credited assists');

for(const pattern of ['corner','shortcorner','rebound','freekick'])for(const team of [0,1])for(const minute of [30,70]){
 const scene=choreography({pattern,team,minute,lane:18,goalY:52,personal:null}),first=sampleScene(scene,0),att=first.positions.filter(p=>p.team===team&&p.i!==0),def=first.positions.filter(p=>p.team!==team&&p.i!==0),forward=p=>scene.dir>0?p.x:100-p.x;
 assert(att.filter(p=>forward(p)>=80).length>=4,'attackers must gather at goal for set piece');
 assert(att.filter(p=>forward(p)>=45&&forward(p)<=65).length>=2,'two players hold back against counter');
 assert(def.filter(p=>forward(p)>=(pattern==='freekick'?74:78)).length>=7,'defenders gather inside and around box');
 if(pattern==='freekick'){const wall=def.filter(p=>[5,6,7].includes(p.i));assert(wall.every(p=>forward(p)>70&&forward(p)<85));assert(Math.max(...wall.map(p=>p.y))-Math.min(...wall.map(p=>p.y))<=13,'compact free-kick wall');}
}
const {keeperColors}=globalThis.CareerMatchReplay;
for(const kits of [['#ce2638','#eb8734'],['#edf0f2','#edf0f2'],['#36bfae','#956ce4'],['#294890','#efcd43']]){
 const keepers=keeperColors(kits);assert.notEqual(keepers[0],keepers[1]);keepers.forEach(k=>assert(!kits.includes(k)));
}
console.log('PASS set-piece attacking/defending box concentration, two counter-cover players, free-kick wall and distinct keeper kits');

// Audit all 16 named roles individually, including both feet, halves and goal/assist routes.
const roleAudit=new Map();
for(const pos of ['FW','MF','DF'])for(let card=0;card<(pos==='DF'?6:5);card++)for(const foot of ['오른발','왼발']){
 const role=playerRole({pos,card,foot}),eligible=finishOptions(role)?.map(p=>p.pattern)||patterns.filter(p=>p!=='farcut');
 for(const personal of ['goal','assist'])for(const pattern of (personal==='goal'?eligible:assistOptions(role)||patterns.filter(p=>p!=='farcut')))for(const seed of [13,37])for(const minute of [30,70]){
  const scene=choreography({pattern,personal,team:0,minute,lane:18,goalY:52,sceneSeed:seed},{role,heroIndex:role.index});let prev=sampleScene(scene,0);const seconds=scene.durationMs/1000;
  const audit=roleAudit.get(role.name)||{role:role.name,cases:0,goalPatterns:new Set(),assistPatterns:new Set()};audit.cases++;(personal==='goal'?audit.goalPatterns:audit.assistPatterns).add(pattern);roleAudit.set(role.name,audit);
  assert.equal(personal==='goal'?scene.legs.at(-1).from:scene.legs.at(-2).from,role.index,'credited player mismatch in '+role.name+' '+pattern);

  for(let i=1;i<=120;i++){
   const next=sampleScene(scene,i/120);next.positions.forEach((p,j)=>{const q=prev.positions[j],speed=Math.hypot((p.x-q.x)*1.05,(p.y-q.y)*.68)*120/seconds;assert(speed<=9.01,'implausible player sprint in '+role.name+' '+pattern);});
   const front=next.positions.filter(p=>p.team!==scene.team&&[8,9,10].includes(p.i));
   for(let a=0;a<front.length;a++)for(let b=a+1;b<front.length;b++)assert(Math.hypot((front[a].x-front[b].x)*6.15,(front[a].y-front[b].y)*3.3)>=28,'defensive front players overlap in '+role.name+' '+pattern);
   prev=next;
  }
  for(const leg of scene.legs.filter(l=>l.to!==undefined)){const eps=.000001,before=sampleScene(scene,leg.end-eps),after=sampleScene(scene,leg.end+eps);assert(Math.hypot(after.ball.x-before.ball.x,after.ball.y-before.ball.y)<.005,'ball jumped on receipt');}
  if(pattern==='lowcross'&&personal==='goal'&&role.flank){const p=sampleScene(scene,0).positions.find(p=>p.team===0&&p.i===role.index),lateral=minute>45?100-p.y:p.y;assert((lateral-50)*(role.y-50)>0,'wing receiver started on wrong flank');}
 }
}
assert.equal(roleAudit.size,16,'a career role was omitted from the pattern audit');
const roleAuditRows=[...roleAudit.values()].map(r=>({role:r.role,cases:r.cases,goalPatterns:r.goalPatterns.size,assistPatterns:r.assistPatterns.size}));
console.log('PASS all 16 individual roles, both feet and halves, all eligible goal/assist patterns:',JSON.stringify(roleAuditRows));

const shots=new Set(),crosses=new Set();
for(let seed=1;seed<=100;seed++){
 for(const pattern of ['longshot','lowcross']){const scene=choreography({pattern,team:0,minute:30,lane:18,goalY:52,personal:'goal',sceneSeed:seed});const at=sampleScene(scene,scene.legs.at(-1).release),p=at.positions.find(p=>p.team===0&&p.i===scene.legs.at(-1).from);(pattern==='longshot'?shots:crosses).add(Math.round(p.x/3)+':'+Math.round(p.y/4));}
}
assert(shots.size>=12,'long shots must vary by distance and channel');assert(crosses.size>=8,'low-cross runners must vary their finish');
console.log('PASS every role/pattern: realistic bounded player speeds, continuous receptions, correct wing flank; varied long-shot and low-cross finishes');

// Ball lead rotates continuously with the carrier, in pixel geometry rather than eight directions.
const role=playerRole({pos:'FW',card:1,foot:'오른발'}),scene=choreography({pattern:'farcut',team:0,personal:'goal',minute:30,lane:role.y,goalY:52,sceneSeed:37},{role,heroIndex:role.index});
const angles=new Set();let lastAngle=null;
for(let i=0;i<=100;i++){
 const t=.55+i*.002,p=sampleScene(scene,t).positions.find(p=>p.team===0&&p.i===role.index),ball=globalThis.CareerMatchReplay.possessionPoint(scene,role.index,t);
 const dx=(ball.x-p.x)*6.15,dy=(ball.y-p.y)*3.30;assert(Math.abs(Math.hypot(dx,dy)-19)<.001);const angle=Math.atan2(dy,dx);angles.add(Math.round(angle*1000));
 if(lastAngle!==null)assert(Math.abs(Math.atan2(Math.sin(angle-lastAngle),Math.cos(angle-lastAngle)))<.1,'ball orientation snaps');lastAngle=angle;
 const before=sampleScene(scene,t-.001).positions.find(p=>p.team===0&&p.i===role.index),after=sampleScene(scene,t+.001).positions.find(p=>p.team===0&&p.i===role.index),vx=(after.x-before.x)*6.15,vy=(after.y-before.y)*3.30;
 assert((dx*vx+dy*vy)/(19*Math.hypot(vx,vy))>.8,'ball must lead in current travel direction');
}
assert(angles.size>20,'ball direction must be continuous rather than eight fixed directions');
console.log('PASS smooth ball lead through inward turns, continuous facing angles and clear spacing from token');

const recoverySignatures=new Set();
for(const [pos,card,styles] of [['MF',4,['edge-first','edge-control']],['FW',2,['tap','layoff']]])for(const reboundStyle of styles){
 const role=playerRole({pos,card}),scene=choreography({pattern:'rebound',team:0,minute:30,lane:18,goalY:52,sceneSeed:1,personal:'goal',reboundStyle},{role,heroIndex:role.index});
 assert.equal(scene.reboundStyle,reboundStyle);assert(scene.durationMs/1.25<6500,'second ball should not be slowed by unrelated runs');
 recoverySignatures.add(JSON.stringify(scene.legs));const rebound=scene.legs.find(l=>l.type==='rebound'),shot=scene.legs.at(-1);
 if(reboundStyle==='edge-first'||reboundStyle==='tap')assert(shot.release-rebound.end<=.025,'one-touch finish');
 if(reboundStyle==='edge-control')assert(shot.release-rebound.end>.05,'control before shot');
 if(reboundStyle==='layoff')assert(scene.legs.some(l=>l.type==='layoff'),'extra short pass in scramble');
}
assert.equal(recoverySignatures.size,4);
console.log('PASS four distinct second-ball finishes and quicker 5–6 second playback');

// Deflection starts at a visible defending player's contact, never at an unexplained point.
for(const [pos,card,style] of [['MF',4,'edge-first'],['MF',4,'edge-control'],['FW',2,'tap'],['FW',2,'layoff']])for(const minute of [30,70]){
 const role=playerRole({pos,card}),scene=choreography({pattern:'rebound',team:0,minute,lane:18,goalY:52,sceneSeed:1,personal:'goal',reboundStyle:style},{role,heroIndex:role.index}),contact=scene.contact,sampled=sampleScene(scene,contact.time),defender=sampled.positions.find(p=>p.team===contact.team&&p.i===contact.id);
 const dist=Math.hypot((contact.point.x-defender.x)*6.15,(contact.point.y-defender.y)*3.3);assert(dist>=17&&dist<=21,'ball must touch the clearers/keepers token edge');
 assert(Math.hypot(sampled.ball.x-contact.point.x,sampled.ball.y-contact.point.y)<.001);
 if(contact.type==='clearance'){assert.equal(scene.legs[0].type,'cross');assert(defender.jump>5.9);assert(Math.abs(sampled.height-defender.jump)<.01);}
 else assert(scene.legs.some(l=>l.type==='blocked'));
 if(style==='tap')assert(!scene.legs.some(l=>l.type==='layoff'),'open receiver shoots directly');
 if(style==='layoff'){
  const give=scene.legs.find(l=>l.type==='layoff'),state=sampleScene(scene,give.release),collector=state.positions.find(p=>p.team===0&&p.i===give.from),marker=state.positions.find(p=>p.team===1&&p.i===2);
  assert(Math.hypot((collector.x-marker.x)*6.15,(collector.y-marker.y)*3.3)<28,'pass collector must be under actual visible pressure');
 }
}
console.log('PASS visible defender clearance/keeper parry contact, open-shot direct finish and pressured layoff geometry');

// Left/centre/right finishing is seeded independently; central goals may clear the keeper.
for(const pattern of ['longshot','rebound','freekick']){
 const counts=[0,0,0];
 for(const minute of [30,70])for(let seed=0;seed<100;seed++){
  const role=playerRole({pos:pattern==='freekick'?'FW':'MF',card:pattern==='freekick'?2:4}),scene=choreography({pattern,team:0,personal:'goal',minute,lane:18,goalY:50,sceneSeed:seed},{role,heroIndex:role.index}),shot=scene.legs.at(-1),reaction=scene.keeperReaction;
  counts[scene.shotZone]++;assert(reaction.start>shot.release,'keeper cannot anticipate the final strike');
  const goalY=scene.dir>0?scene.goal.y:100-scene.goal.y;assert(goalY>=41&&goalY<=58,'shot must remain inside the posts');
  if(scene.shotZone===1){assert(goalY>=48&&goalY<=52);assert(scene.shotLift>=12);assert(sampleScene(scene,shot.end).height>=12,'central goal should clear the keeper');}
  else{assert.equal(scene.shotLift,0);assert(scene.shotZone===0?goalY<=45:goalY>=55);}
  const keeper=t=>sampleScene(scene,t).positions.find(p=>p.team!==scene.team&&p.i===0),start=keeper(reaction.start);let previous=start;
  for(let i=1;i<=100;i++){
   const next=keeper(reaction.start+(reaction.end-reaction.start)*i/100);
   assert((next.y-previous.y)*(scene.goal.y-start.y)>=-1e-8,'keeper moves away from the shot');previous=next;
  }
 }
 assert(counts.every(n=>n>40&&n<100),'each shot zone must occur regularly');
}
console.log('PASS seeded left/central/right free kicks and distance shots, in-goal placement, lifted central goals and delayed keeper reaction in both halves');

const {playbackTiming,playbackProgress}=globalThis.CareerMatchReplay;
const lateRuns=new Set();
for(const card of [3,4])for(const minute of [30,70])for(let seed=0;seed<30;seed++){
 const role=playerRole({pos:'MF',card}),scene=choreography({pattern:'shortcorner',team:0,personal:'goal',minute,lane:18,goalY:52,sceneSeed:seed},{role,heroIndex:role.index}),player=t=>sampleScene(scene,t).positions.find(p=>p.team===0&&p.i===role.index),a=player(0),wait=player(.38),strike=player(scene.legs.at(-1).release);
 assert(Math.hypot(wait.x-a.x,wait.y-a.y)<3,'holding midfielder runs into the box before the short exchange');
 assert((scene.dir>0?a.x:100-a.x)>=77&&(scene.dir>0?a.x:100-a.x)<=80,'start at the box edge');
 assert((strike.x-wait.x)*scene.dir>8,'late run must attack the delivery');
 assert.equal(scene.legs.at(-1).from,role.index);lateRuns.add(Math.round(scene.dir>0?a.y:100-a.y));
}
assert(lateRuns.size>=3,'late headers need distinct near/central/far routes');
for(const pattern of patterns){
 const scene=choreography({pattern,team:0,personal:'goal',minute:30,lane:18,goalY:52,sceneSeed:37}),timing=playbackTiming(scene),shot=scene.legs.at(-1),buildUpMs=timing.baseMs*shot.release/timing.buildUpRate;
 assert(timing.durationMs<timing.baseMs,'build-up must be faster');
 assert(Math.abs(playbackProgress(scene,buildUpMs/timing.durationMs)-shot.release)<1e-9);
 const arrivalMs=buildUpMs+(shot.end-shot.release)*timing.baseMs;
 assert(Math.abs(playbackProgress(scene,arrivalMs/timing.durationMs)-shot.end)<1e-9,'final shot flight timing changed');
 assert.equal(playbackProgress(scene,0),0);assert.equal(playbackProgress(scene,1),1);
 const eps=.000001,at=buildUpMs/timing.durationMs;assert(playbackProgress(scene,at+eps)-playbackProgress(scene,at-eps)<.00001,'time snaps at the strike');
}
console.log('PASS holding-midfielder late short-corner headers across halves, three run lanes, faster build-up with unchanged shot flight and continuous playback');

// CB long shots come from the supporting defensive line after the attack recycles backwards.
for(const card of [0,1,2])for(const minute of [30,70])for(const foot of ['오른발','왼발'])for(let seed=0;seed<30;seed++){
 const role=playerRole({pos:'DF',card,foot}),scene=choreography({pattern:'longshot',team:0,personal:'goal',minute,lane:18,goalY:52,sceneSeed:seed},{role,heroIndex:role.index}),forward=x=>scene.dir>0?x:100-x;
 assert(scene.cbLongShot);const initial=sampleScene(scene,0),hero=initial.positions.find(p=>p.team===0&&p.i===role.index);
 assert(forward(hero.x)>=54&&forward(hero.x)<=65,'CB starts in supporting defensive line');
 const midfield=initial.positions.filter(p=>p.team===0&&[5,6,7].includes(p.i));assert(midfield.every(p=>forward(p.x)>forward(hero.x)+5),'CB should remain behind midfield');
 assert(initial.positions.filter(p=>p.team===0&&[8,9,10].includes(p.i)).every(p=>forward(p.x)>80),'front line already occupies the final third');
 const back=scene.legs.at(-2),a=sampleScene(scene,back.release),b=sampleScene(scene,back.end);assert.equal(back.type,'cutback');assert.equal(back.to,role.index);
 const giver=a.positions.find(p=>p.team===0&&p.i===back.from),receiver=b.positions.find(p=>p.team===0&&p.i===role.index);
 assert(forward(giver.x)-forward(receiver.x)>12,'ball must be recycled from ahead of the CB');
 assert(forward(receiver.x)<70,'CB must not finish from midfielder box-edge depth');
 assert.equal(scene.legs.at(-1).from,role.index);
}
console.log('PASS three CB roles: advanced team lines, support behind midfield, backward return and deep shot in both halves/feet');


// Sustained play must move the carrier, supporting attack and defending shape, not only the ball.
for(const minute of [30,70])for(const card of [0,1,2]){
 const role=playerRole({pos:'DF',card}),scene=choreography({pattern:'longshot',team:0,personal:'goal',minute,lane:18,goalY:52,sceneSeed:37},{role,heroIndex:role.index}),distance=Array(22).fill(0);let previous=sampleScene(scene,0);
 for(let i=1;i<=300;i++){const next=sampleScene(scene,i/300*.84);next.positions.forEach((p,j)=>{const q=previous.positions[j];distance[j]+=Math.hypot((p.x-q.x)*1.05,(p.y-q.y)*.68);});previous=next;}
 assert(distance.slice(1,11).filter(d=>d>12).length>=6,'supporting attack remains fixed');
 assert(distance.slice(12).filter(d=>d>12).length>=7,'defending shape remains fixed');
 const carry=scene.legs.at(-2),a=sampleScene(scene,carry.start),b=sampleScene(scene,carry.release),giver=t=>t.positions.find(p=>p.team===0&&p.i===carry.from),start=giver(a),end=giver(b);
 assert(Math.hypot((end.x-start.x)*1.05,(end.y-start.y)*.68)>4,'return pass giver must actually carry and draw pressure');
 assert(playbackTiming(scene).durationMs<8000,'support/defending movement must not stretch the whole play');
}
console.log('PASS sustained CB attacks: carrier advances before recycling, supporting runners and defending shape move, normal replay duration');

// Free-kick side and inside-foot spin belong to the actual kicker, independent of the target.
for(const foot of ['오른발','왼발'])for(const team of [0,1])for(const personal of ['goal','assist'])for(const minute of [30,70])for(let seed=0;seed<30;seed++){
 const role=playerRole({pos:'FW',card:2,foot}),scene=choreography({pattern:'freekick',team,personal,minute,lane:18,goalY:50,sceneSeed:seed},{role,heroIndex:role.index}),shot=scene.legs.at(-1),right=scene.kickerFoot==='오른발';
 if(team===0&&personal==='goal')assert.equal(scene.kickerFoot,foot,'own goals must use the character dominant foot');
 const first=sampleScene(scene,0).positions.find(p=>p.team===team&&p.i===shot.from),lateral=scene.dir>0?first.y:100-first.y;
 assert(right?lateral<46:lateral>54,'free kick must start on the preferred side for the actual kicker');
 const a=sampleScene(scene,shot.release).ball,b=scene.goal,mid=sampleScene(scene,(shot.release+shot.end)/2).ball,dx=(b.x-a.x)*1.05,dy=(b.y-a.y)*.68,ox=(mid.x-(a.x+b.x)/2)*1.05,oy=(mid.y-(a.y+b.y)/2)*.68,cross=dx*oy-dy*ox;
 assert(right?cross>0:cross<0,'inside-foot curl flipped with goal target or attacking direction');
 assert(Math.hypot(ox,oy)>=2.4&&Math.hypot(ox,oy)<=3.6,'free-kick curl should be shallow and visible');
 assert(Math.hypot(sampleScene(scene,shot.end).ball.x-b.x,sampleScene(scene,shot.end).ball.y-b.y)<1e-8,'curved kick must finish at the target');
}
console.log('PASS actual free-kick foot, preferred left/right starting side, mirrored inside-foot curl across halves/teams/goal targets and credited assists');

// Dead-ball setup stays still, and curl changes direction gradually rather than hooking at the goal.
for(const foot of ['오른발','왼발'])for(const minute of [30,70])for(const personal of ['goal','assist'])for(let seed=0;seed<20;seed++){
 const role=playerRole({pos:'FW',card:2,foot}),scene=choreography({pattern:'freekick',team:0,personal,minute,lane:18,goalY:50,sceneSeed:seed},{role,heroIndex:role.index}),shot=scene.legs.at(-1),first=scene.legs[0];
 for(let i=0;i<=50;i++){const p=sampleScene(scene,first.release*i/50).ball;assert(Math.hypot(p.x-first.origin.x,p.y-first.origin.y)<1e-10,'free-kick setup must not dribble the ball');}
 if(scene.legs.length>1)for(let i=0;i<=20;i++){const t=first.end+(shot.release-first.end)*i/20,p=sampleScene(scene,t).ball;assert(Math.hypot(p.x-shot.origin.x,p.y-shot.origin.y)<1e-10,'short free-kick ball must settle before the strike');}
 const before=sampleScene(scene,shot.release-.000001).ball,after=sampleScene(scene,shot.release+.000001).ball;assert(Math.hypot(after.x-before.x,after.y-before.y)<.001,'ball jumps at free-kick release');
 const a=sampleScene(scene,0).positions.find(p=>p.team===0&&p.i===shot.from),b=sampleScene(scene,shot.release).positions.find(p=>p.team===0&&p.i===shot.from);assert(Math.hypot(a.x-b.x,a.y-b.y)>1,'kicker must approach the stationary ball');
 let lastAngle=null;
 for(let i=1;i<100;i++){
  const t=shot.release+(shot.end-shot.release)*i/100,epsilon=(shot.end-shot.release)*.0001,p=sampleScene(scene,t-epsilon).ball,q=sampleScene(scene,t+epsilon).ball,angle=Math.atan2((q.y-p.y)*.68,(q.x-p.x)*1.05);
  if(lastAngle!==null)assert(Math.abs(Math.atan2(Math.sin(angle-lastAngle),Math.cos(angle-lastAngle)))<.035,'free-kick arc changes direction too abruptly');lastAngle=angle;
 }
}
console.log('PASS stationary free-kick ball, separate run-up, settled short-pass setup, continuous release and shallow gradual curl');

// The run-up approaches the stationary ball from the kicking-foot side, matching the launch geometry.
for(const foot of ['오른발','왼발'])for(const team of [0,1])for(const minute of [30,70])for(let seed=0;seed<20;seed++){
 const role=playerRole({pos:'FW',card:2,foot}),scene=choreography({pattern:'freekick',team,personal:'goal',minute,lane:18,goalY:50,sceneSeed:seed},{role,heroIndex:role.index}),shot=scene.legs.at(-1),kicker=t=>sampleScene(scene,t).positions.find(p=>p.team===team&&p.i===shot.from),ready=kicker(0),strike=kicker(shot.release),origin=shot.origin,launch=scene.freeKickApproach.launch;
 const rx=(ready.x-origin.x)*1.05,ry=(ready.y-origin.y)*.68,cross=launch.x*ry-launch.y*rx;
 assert(scene.kickerFoot==='오른발'?cross<0:cross>0,'run-up must approach from outside the kicking foot');
 assert(Math.abs(scene.freeKickApproach.approach.y)>.2,'run-up must be visibly diagonal');
 assert(Math.abs(Math.hypot((origin.x-strike.x)*6.15,(origin.y-strike.y)*3.3)-19)<.001,'strike must meet the fixed ball at the token edge');
 const epsilon=.000001,before=kicker(shot.release-epsilon),after=kicker(shot.release+epsilon),vx=(after.x-before.x)*1.05,vy=(after.y-before.y)*.68,approach=scene.freeKickApproach.approach;
 assert((vx*approach.x+vy*approach.y)/Math.hypot(vx,vy)>.999,'kicker changes direction immediately at contact');
 const a=sampleScene(scene,shot.release).ball,b=sampleScene(scene,shot.release+epsilon).ball,dx=(b.x-a.x)*1.05,dy=(b.y-a.y)*.68;
 assert((dx*launch.x+dy*launch.y)/(Math.hypot(dx,dy)*Math.hypot(launch.x,launch.y))>.999,'run-up was planned from a different launch trajectory');
}
console.log('PASS angled kicking-foot-side run-up, fixed ball contact, continuous follow-through and matching ball launch across halves/teams');

// Width opens a real inside channel; the return pass leads the runner, not a backward finish.
for(const [pos,card] of [['DF',3],['DF',4],['DF',5],['FW',0],['FW',1],['FW',2]])for(const foot of ['오른발','왼발'])for(const minute of [30,70])for(const personal of ['goal','assist']){
 const role=playerRole({pos,card,foot}),scene=choreography({pattern:'halfspace',team:0,personal,minute,lane:role.flank==='right'?82:18,goalY:52,sceneSeed:37},{role,heroIndex:role.index}),normal=p=>({x:scene.dir>0?p.x:100-p.x,y:scene.dir>0?p.y:100-p.y}),shot=scene.legs.at(-1),through=scene.legs.at(-2);
 const delivery=sampleScene(scene,through.release),reception=sampleScene(scene,through.end),giver=normal(delivery.positions.find(p=>p.team===0&&p.i===through.from)),receiver=normal(reception.positions.find(p=>p.team===0&&p.i===through.to));
 const flank=receiver.y<50?-1:1,defenders=reception.positions.filter(p=>p.team===1),cb=defenders.filter(p=>[2,3].includes(p.i)).map(normal).find(p=>(p.y-50)*flank>0),fb=defenders.filter(p=>[1,4].includes(p.i)).map(normal).find(p=>(p.y-50)*flank>0);
 assert(Math.abs(cb.y-50)<Math.abs(receiver.y-50)&&Math.abs(receiver.y-50)<Math.abs(fb.y-50),'runner must occupy the gap between centre-back and fullback');
 assert(receiver.x>giver.x+3,'runner must receive ahead of the wide player');assert(Math.abs(receiver.y-50)>=12&&Math.abs(receiver.y-50)<=25,'receive in the halfspace rather than centre/back');
 const finish=normal(sampleScene(scene,shot.release).ball);assert(finish.x>84,'finish inside the box, rather than a deep return');
 for(const t of [0,.38,.58,.72,.84]){
  const players=sampleScene(scene,t).positions.filter(p=>p.team===0),scorer=shot.from;
  for(const [wing,fb,left] of [[8,1,true],[10,4,false]]){const wide=wing===scorer?fb:wing,p=normal(players.find(p=>p.i===wide));assert(left?p.y<25:p.y>75,'wide players must hold width instead of becoming poachers');}
  const central=players.filter(p=>p.i!==scorer&&normal(p).x>75&&Math.abs(normal(p).y-50)<4);assert(central.length>=1,'another forward must pin the central defender');
 }
 if(personal==='goal')assert.equal(shot.from,role.index);else assert.equal(through.from,role.index);
}
console.log('PASS halfspace width on both flanks, central pin, forward return pass, inside-channel box finish, both feet/halves and exact goal/assist identity');

// Mirroring a winger/inside-forward must not double the halfspace replay duration.
for(let seed=0;seed<100;seed++)for(const card of [0,1])for(const minute of [30,70]){
 const timings=[];
 for(const foot of ['오른발','왼발']){
  const role=playerRole({pos:'FW',card,foot}),scene=choreography({pattern:'halfspace',team:0,personal:'goal',minute,lane:18,goalY:52,sceneSeed:seed},{role,heroIndex:role.index});timings.push(playbackTiming(scene).durationMs);
  assert(playbackTiming(scene).durationMs<6000,'mirrored defensive path stretches the entire halfspace highlight');
 }
 assert(Math.abs(timings[0]-timings[1])<300,'left/right halfspace tempo should be comparable');
}
console.log('PASS wing/inside-forward halfspace replays under six seconds across 100 variations, both feet and halves, matched left/right tempo');

// Own-team wide players defending an opponent goal also need separate forward lanes.
for(const pos of ['FW','MF','DF'])for(let card=0;card<(pos==='DF'?6:5);card++)for(const foot of ['오른발','왼발'])for(const minute of [30,70])for(const pattern of patterns){
 const role=playerRole({pos,card,foot}),scene=choreography({pattern,team:1,personal:null,minute,lane:18,goalY:50,sceneSeed:37},{role,heroIndex:role.index});
 for(let i=0;i<=120;i++){
  const front=sampleScene(scene,i/120).positions.filter(p=>p.team!==scene.team&&[8,9,10].includes(p.i));
  for(let a=0;a<front.length;a++)for(let b=a+1;b<front.length;b++)assert(Math.hypot((front[a].x-front[b].x)*6.15,(front[a].y-front[b].y)*3.3)>=28,'defending forward lanes overlap in '+role.name+' '+pattern);
 }
}
console.log('PASS defending front spacing across all 16 roles, both feet/halves and every pattern, including highlighted wide-player flanks');
