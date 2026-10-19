import * as REL from './_career_relationship.js';
import {serviceView} from './_career_military.js';
import {MAIN,DATES,mainBefore,fireworksStory,f,p,n} from './_career_asia_dialogue.js';
const romantic=r=>['dating','married'].includes(r.status);
const enabled=C=>C.relationship?.region==='asia'&&C.activePartner!=='reporter'&&C.relationship.status!=='separated';
function story(C){const r=C.relationship;return r.asiaStory??={version:1,chapter:0,seen:[],support:0,voiceFound:false};}
function location(C){
 const r=C.relationship,home=r.residence===r.homeNation,abroad=C.club?.nat!==r.homeNation;
 return home?(abroad?'비시즌, 남은 팀 일정을 마치고 고국으로 돌아왔다. 가족과 시간을 보낸 뒤 약속한 날 그녀를 만나러 나갔다.':'비시즌 휴가가 시작됐다. 집에서 쉬고 나서 그녀와 만나기로 한 곳으로 향했다.'):r.residence===C.club?.nat?'비시즌 휴가에 서로의 일정을 맞췄다. 지금 함께 지내는 도시에서 약속한 곳으로 향했다.':'비시즌, 그녀가 지내는 나라로 찾아갔다. 도착해서 쉬고 나서 약속 장소로 향했다.';
}
function close(C){return n(C.club?.nat!==C.relationship.residence?'남은 휴가를 보낸 뒤 소속팀으로 돌아갔다. 다음에 만날 일정은 서로 확인해서 연락하기로 했다.':'휴가 중의 만남을 마치고 각자의 일상으로 돌아갔다. 다음 약속은 서로 일정을 보고 정하기로 했다.');}
function event(C,id,title,extra){return {id:'friend:asia:'+id,t:title,friend:REL.relationshipView(C),remote:false,channel:'scene',place:2,outfit:0,...extra};}
function militaryEvent(C){
 const r=C.relationship,s=story(C),service=serviceView(C);if(!service)return null;
 const key=REL.dueRelationship(C);
 if(['foreign','followup','crisis'].includes(key)){
  const ev=REL.relationshipEvent(C,'friend:'+key,true);ev.t='복무 중 · '+ev.t;ev.asiaMilitaryMajor=true;return ev;
 }
 const visits=s.serviceSeen||[],canVisit=r.residence==='KOR'&&!visits.includes('visit');
 if(canVisit){
  const reply=['응. 면회 가능한 날 확인하고 갈게. 출입 절차도 알려줘.','알겠어. 이번에는 무리하지 말고 연락 가능한 때 얘기하자.'];
  const lines=[n('면회가 허용되는 날짜와 시간을 확인했다. 약속한 날, 그녀는 출입 확인을 마치고 지정된 면회 장소 앞 쉼터로 왔다.'),f('찾았다. 여기 맞나 해서 안내받고 왔어.','happy'),p('오는 길 괜찮았어?'),f('응. 너 보니까 이제 진짜 온 것 같네.'),p('얼굴 보니까 좋다. 앉자.'),n('마주 앉아 그동안 짧은 연락으로는 다 하지 못했던 이야기를 나눴다.'),f(s.voiceFound?'나 다음 공연 곡 골랐어. 네가 전에 좋다고 한 것도 넣었고.':'요즘 연습하는 곡 바뀌었어. 다음에 들려줄게.'),p('응. 나도 여기서 있었던 얘기 좀 해줄게.'),f('들어줄게. 오늘은 시간 있잖아.','happy'),n('면회 종료 안내를 듣고 함께 자리에서 일어났다.'),p('나는 여기서 들어가야 해. 돌아가는 길 조심하고.'),f('응. 도착하면 연락 남길게. 나중에 확인해.','shy'),n('정해진 시간에 면회를 마쳤다. 그녀를 배웅하고 부대 안으로 복귀했다.')];
  return event(C,'service-visit','복무 중 · 면회 약속',{channel:'message',remote:true,d:'면회 가능한 날 있어? 네가 괜찮으면 얼굴 보러 가고 싶어. 연습 일정도 맞춰볼게.',a:['응. 가능한 날짜랑 출입 절차 확인해서 알려줄게.','이번에는 면회 일정 잡기 어려워. 연락 가능한 때 얘기하자.'],reply,replies:reply,backdrop:'military-visit',meeting:{picks:[0],place:1,remote:false,lines},script:{before:[],after:[[],[f(reply[1]),p('응. 시간 날 때 내가 먼저 연락할게.'),f('알겠어. 답장 늦어도 기다릴게.'),n('연락 가능한 시간이 끝나 인사를 나눴다.')]]},asia:{kind:'service',id:'visit'}});
 }
 const returning=service.returning,id=returning?'return-call':'unit-call';
 const replies=['응. 오늘은 내 얘기부터 좀 할게.','응. 무리해서 답 안 해도 돼. 나중에 봐.'];
 return event(C,'service-'+id,returning?'복무 중 · 전역을 기다리며':'복무 중 · 짧은 연락',{channel:'message',remote:true,d:returning?'남은 복무 잘 마치고 와. 지금 잠깐 얘기할 수 있어?':'오늘 연락 가능한 시간이야? 잠깐 목소리 듣고 싶어서.',a:['응. 지금 잠깐 통화할 수 있어.','곧 들어가야 해. 남긴 연락은 나중에 확인할게.'],reply:replies,replies,script:{before:[],after:[[f(s.voiceFound?'다음 공연 준비하면서 네 생각 났어. 전역하면 들려줄게.':'나 오늘 연습 끝났어. 밥 먹으면서 네가 남긴 문자 봤고.'),p('나도 연락 가능한 시간 기다렸어.'),f('그럼 오늘은 밥 뭐 먹었는지부터 얘기해 봐.','happy'),n('짧게 근황을 나눈 뒤 정해진 시간에 통화를 마쳤다.')],[]]},asia:{kind:'service',id}});
}
export function introEvent(C){
 if(!enabled(C))return null;const base=REL.introEvent(C);if(!base)return null;
 return {...base,t:'누가 먼저 TV에 나올까',d:(REL.isDistant(C)?'도착했어? 숙소는 괜찮고?\n':'유니폼 받았다며. 입은 거 보여줘ㅋㅋ\n')+'나도 오늘 연습 끝. 우리 누가 먼저 TV 나오나 내기한 거 기억하냐?',a:['기억하지. 네 첫 무대도 나 보러 갈 거야.','당연하지. 너도 내 첫 경기 보러 와.','사진 보내줄게. 오늘 연습은 어땠어?'],reply:['그럼 나도 네 경기 보러 가야지. 먼저 도망가기 없음ㅋㅋ','날짜 정해지면 알려줘. 나도 연습 일정 맞춰볼게.','안무 틀려서 나머지 연습함ㅋㅋ 사진 기다리는 동안 얘기해줄게.'],replies:['그럼 나도 네 경기 보러 가야지. 먼저 도망가기 없음ㅋㅋ','날짜 정해지면 알려줘. 나도 연습 일정 맞춰볼게.','안무 틀려서 나머지 연습함ㅋㅋ 사진 기다리는 동안 얘기해줄게.']};
}
// Temporarily mark the annual visit for generic consent/affinity rules. Never relocate her.
function atHome(C,key,run){const r=C.relationship,old=r.visit;r.visit={age:C.age,key};try{return run();}finally{if(old)r.visit=old;else delete r.visit;}}
function major(C,key){
 const ev=atHome(C,key,()=>REL.relationshipEvent(C,'friend:'+key));
 if(!ev)return null;
 ev.remote=false;ev.channel='scene';ev.place=3;ev.outfit=0;ev.asiaRoute=true;delete ev.meeting;
 // Generic major dialogue is spoken in person during leave, with her current career acknowledged.
 ev.script.before=[n(location(C)),...(ev.script.before||[]).slice(3)];
 ev.script.after.forEach(lines=>{if(lines.at(-1)?.[1]?.includes('방문을 마치고 다시'))lines.pop();});
 ev.script.after.forEach(lines=>{const ending=close(C);if(lines.at(-1)?.[5]){ending[5]=lines.at(-1)[5];ending[6]=lines.at(-1)[6];}lines.push(ending);});
 if(key==='future'&&!story(C).voiceFound){ev.d='너랑 같이 지내는 건 나도 생각해. 근데 노래를 계속할 방법부터 여기서 찾아보고 싶어. 둘 다 놓치지 않으려면 어떻게 해야 할까?';ev.a[0]='네가 준비하는 일부터 듣고 싶어. 귀국 일정과 네 공연 일정도 함께 보자.';ev.reply[0]=ev.replies[0]='응. 내가 뭘 하고 싶은지부터 얘기할게. 다음에 만날 날짜도 같이 정하자.';}
 if(key==='foreign'){
  ev.d='새 팀 간 거 축하해. 나도 내 일정이 있어서 같이 바로 갈 수는 없어. 네 휴가랑 내 연습 없는 날부터 맞춰 보자.';
  ev.script.after=ev.reply.map((reply,i)=>i===2?[f(reply,'sad'),p('그동안 고마웠어.'),n('다음 약속을 잡지 않고 인사를 나눴다.'),close(C)]:[f(reply),p(i===0?'귀국할 수 있는 날짜 나오면 먼저 알려줄게. 네 일정도 보내줘.':'당장 따라오라는 뜻은 아니야. 네가 노래할 곳도 있어야 하잖아.'),f(i===0?'응. 나도 연습이랑 공연 일정 확인해 볼게.':'응. 내가 여기서 마무리하고 싶은 것부터 말할게.'),n('각자의 일정을 펼쳐 놓고 만날 수 있는 때를 확인했다.'),close(C)]);
 }
 if(key==='proposal'){ev.d='너 경기 끝나고 돌아오는 날도, 내 공연 끝나고 집에 오는 날도 같이 있고 싶어. 우리 결혼할까?';}
 if(key==='confession'){
  ev.t='내가 무대에 서지 않는 날에도';ev.d='잘될 때만 네가 보고 싶은 건 아니더라. 아무 얘기 안 해도 같이 있고 싶어. ……너는 어때?';
  ev.script.before=[n(location(C)),f('오늘은 연습 얘기 말고 할 말 있어.','shy'),p('응. 듣고 있어.'),n('걷던 길에서 그녀가 걸음을 멈췄다.')];ev.script.before.at(-1)[5]='confession';ev.script.before.at(-1)[6]='tense';
  ev.script.after[0]=[f('……진짜? 장난치는 거 아니지.','shy'),p('응. 너 좋아해.'),f('아, 너 얼굴 보고 준비한 말 다 까먹었어.','happy'),p('천천히 해. 나 안 가.'),f('그럼 조금만 더 걷자. 손도 잡고.','happy'),close(C)];ev.script.after[0].forEach((line,i)=>{line[5]='confession';line[6]=i<2?'surprised':'happy';});
 }
 return ev;
}
export function preparation(C,service=false){
 if(!enabled(C)||C.phase!=='prep'||C.relationship.prepAge===C.age)return null;
 if(introEvent(C))return null;
 const r=C.relationship,s=story(C),key=REL.dueRelationship(C);
 if(service)return militaryEvent(C);
 if(['foreign','followup','crisis'].includes(key))return major(C,key);
 if(key==='future'&&r.moveDiscussion)return major(C,key);
 const chapter=MAIN[s.chapter];
 if(chapter&&C.age>=chapter.age){
  const before=[n(location(C)),...mainBefore(C,s.chapter)];
  if(s.chapter===7&&!r.done.includes('debut')){before[8]=p('나도 아까 너 찾았어. 무대 옆에서.');before[9]=f('입장할 때부터 보였어. 모른 척한 거지.','happy');}
  if(s.chapter===7)before.forEach((line,i)=>{if(i>=2&&i<=5)line[5]='stage';});
  if(s.chapter===6)before.forEach((line,i)=>{if(i===5||i===6)line[5]='stage';});
  const after=chapter.after.map(lines=>[...lines.map(line=>[...line]),close(C)]);
  if(s.chapter===7&&s.support<5){
   before.splice(7,3,f('오늘 온 건 고마워. 솔직히 연락할까 좀 고민했어.'),p('그랬구나.'),f('전에는 네가 좋아할 노래부터 골랐는데, 오늘은 내가 부르고 싶은 걸 골랐어.'));
   after.forEach(lines=>{lines.splice(0,lines.length,f('다음 공연도 할 거야. 조금씩 내가 하고 싶은 게 생겨서.'),p('응. 오늘 들려줘서 고마워.'),f('나도 와줘서 고마워.'),n('그녀는 동료들과 장비를 정리하러 돌아갔다. 오늘의 무대가 누구의 평가를 기다리는 자리는 아니라는 것을 알았다.'),close(C));});
  }
  return event(C,'main:'+chapter.id,chapter.title,{place:chapter.place,mood:['happy','shy','sad','sad','sad','shy','happy','happy'][s.chapter],d:s.chapter===7&&!r.done.includes('debut')?'우리 내기는 아직 안 끝났네. 그래도 오늘 내 무대는 네가 봤다.':chapter.question,a:chapter.choices,reply:after.map(lines=>lines[0][1]),replies:after.map(lines=>lines[0][1]),script:{before,after},asia:{kind:'main',index:s.chapter}});
 }
 if(key==='confession'&&s.chapter>=4&&s.support>=2&&!r.confessionDeclined)return major(C,key);
 if(['future','proposal'].includes(key))return major(C,key);
 const available=DATES.filter(x=>!s.seen.includes(x[0])&&(!['first-train','fireworks'].includes(x[0])||C.age>=18)&&(x[0]!=='new-recording'||s.voiceFound)&&(x[0]!=='next-season'||romantic(r)));
 const date=available[0];
 if(!date)return event(C,'rest:'+C.age,'이번 휴가의 하루',{channel:'reflection',d:'지난 만남의 사진을 정리했다. 다음 휴가에 함께 가고 싶은 곳을 적어 보냈다.',a:['이번 근황을 전하고 쉰다.'],reply:['서로의 새 일정을 확인하고 연락을 마쳤다.'],replies:['서로의 새 일정을 확인하고 연락을 마쳤다.'],asia:{kind:'rest'}});
 const fireworks=date[0]==='fireworks',lines=fireworks?fireworksStory(C):date[3].map(line=>[...line]),ending=close(C);
 if(fireworks)ending[4]='message';
 return event(C,'date:'+date[0],date[1],{channel:'story',place:date[2],...(fireworks?{costume:'fireworks'}:{}),a:['이야기 마치기'],reply:['다음에 또 보자.'],replies:['다음에 또 보자.'],script:{story:[n(location(C)),...lines,ending]},asia:{kind:'date',id:date[0]}});
}
export function complete(C,ev,pick){
 if(!enabled(C)||C.relationship.prepAge===C.age||!Number.isInteger(pick)||!ev.a[pick])throw new Error('이번 만남을 다시 확인해 주세요.');
 const expected=preparation(C,!!serviceView(C));if(!expected||expected.id!==ev.id)throw new Error('지금 진행할 만남이 아니에요.');
 const r=C.relationship,s=story(C);
 if(!ev.asia){const key=ev.id.split(':')[1];if(ev.asiaMilitaryMajor)REL.applyRelationship(C,ev.id,pick);else atHome(C,key,()=>REL.applyRelationship(C,ev.id,pick));if(r.visit?.key===key)delete r.visit;r.prepAge=C.age;return;}
 let delta=4,reason='휴가 중 시간을 내어 서로의 일상을 나눴다';
 if(ev.asia.kind==='main'){
  const chapter=MAIN[s.chapter],support=chapter.support[pick];
  if(support>0){s.support+=support;r.goalSupport++;}else s.support=Math.max(0,s.support+support);
  delta=support>0?6:support<0?-4:0;reason=support>0?'그녀의 이야기를 듣고 스스로 선택할 시간을 존중했다':'내 기대보다 그녀의 마음을 먼저 물을 필요가 있었다';
  s.seen.push('main:'+chapter.id);s.chapter++;s.lastMainAge=C.age;
  if(s.chapter>=7)s.voiceFound=true;
  if(s.chapter===8)s.ending=s.support>=5?'shared-stage':'own-stage';
 }else if(ev.asia.kind==='date')s.seen.push(ev.asia.id);
 else if(ev.asia.kind==='service'){
  s.serviceSeen=[...new Set([...(s.serviceSeen||[]),ev.asia.id])];
  delta=pick===0?(ev.asia.id==='visit'?6:4):0;reason=ev.asia.id==='visit'&&pick===0?'허용된 면회 시간에 만나 서로의 근황을 나눴다':'복무 중 가능한 연락 시간과 일정을 존중했다';
 }
 else delta=0;
 const before=r.affinity;r.affinity=Math.max(0,Math.min(100,r.affinity+delta));r.lastChange={age:C.age,delta:r.affinity-before,reason};
 if(['friend','close'].includes(r.status))r.status=r.affinity>=55&&!r.confessionDeclined?'close':'friend';
 if(ev.asia.kind!=='service'||ev.asia.id==='visit'&&pick===0)r.lastVisitAge=C.age;
 r.prepAge=C.age;r.records.push({age:C.age,id:ev.id,pick,delta:r.affinity-before});r.records=r.records.slice(-12);
}
