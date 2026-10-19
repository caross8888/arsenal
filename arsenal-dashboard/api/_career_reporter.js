import * as REL from './_career_relationship.js';
import {COURTSHIP,PERSONAL,reporterMajor,f,p,n} from './_career_reporter_dialogue.js';
const romantic=r=>r&&['dating','married'].includes(r.status);
const distant=C=>C.reporter?.residence!==(C.club?.nat||C.nation);
function withReporter(C,run,meetingKey){
 const old=C.relationship,r=C.reporter,visit=r?.visit;C.relationship=r;
 if(meetingKey&&distant(C))r.visit={age:C.age,key:meetingKey};
 try{return run();}finally{if(meetingKey){if(visit)r.visit=visit;else delete r.visit;}C.relationship=old;}
}
export function reporterView(C){
 if(!C.reporter?.met)return null;
 return withReporter(C,()=>({...REL.relationshipView(C),origin:'reporter',label:C.reporter.status==='friend'?'취재로 만난 사이':C.reporter.status==='close'?'취재 밖에서도 만나는 사이':REL.relationshipView(C).label,episodes:C.reporter.episode||0}));
}
export function partnerState(C){return C.activePartner==='reporter'&&romantic(C.reporter)?C.reporter:REL.ensureRelationship(C);}
export function partnerView(C){return C.activePartner==='reporter'&&romantic(C.reporter)?reporterView(C):REL.relationshipView(C);}
export function connections(C){return C.reporter?.contact?[REL.relationshipView(C),reporterView(C)].filter(Boolean):[];}
export function interviewView(C){
 if(C.phase!=='prep'||C.ev!=='media'||C.reporter?.met||!C.relationship)return null;
 const friend={id:'reporter',name:'클라라',label:'스포츠 매체 기자',origin:'reporter'};
 const before=[n('인터뷰가 끝나자 기자가 녹음을 멈추고 수첩을 덮었다.'),f('답변 감사해요. 다음에는 조금 더 길게 이야기 나누고 싶네요.','happy')];
 before.forEach(line=>{line[5]='interview';});
 const replies=['감사해요. 제 번호도 바로 보내드릴게요.','네. 알겠습니다. 오늘 인터뷰 감사했어요.'];
 const after=[[f('감사해요. 제 번호도 바로 보내드릴게요.','happy'),n('연락처를 전하자 잠시 뒤 휴대폰이 울렸다.')],[f('네. 알겠습니다. 오늘 인터뷰 감사했어요.'),n('고개를 숙여 인사를 나누고 팀으로 돌아갔다.')]];after.flat().forEach(line=>{line[5]='interview';});
 return {id:'reporter:intro',t:'첫 만남 · 인터뷰를 마치고',friend,channel:'scene',remote:false,place:1,outfit:0,action:'reporter-intro',questionCG:{key:'interview'},
  d:'단독 인터뷰를 한번 하고 싶은데, 따로 연락드려도 될까요?',a:['네. 제 번호 알려드릴게요.','취재 연락은 구단을 통해 부탁드릴게요.'],reply:replies,replies,
  script:{before,after}};
}
export function completeIntro(C,pick,ivPick){
 const ev=interviewView(C);if(!ev||![0,1].includes(pick)||![0,1].includes(ivPick))throw new Error('확인할 인터뷰가 없어요.');
 if(C.relationship.prepAge!==C.age)throw new Error('관계 이벤트를 먼저 마쳐 주세요.');
 C.reporter={...REL.createRelationship(C.nation),region:'reporter',name:'클라라',homeNation:C.club?.nat||C.nation,residence:C.club?.nat||C.nation,met:true,metAge:C.age,interviewAge:C.age,interviewPick:ivPick,contact:pick===0,welcomePending:pick===0,affinity:pick===0?43:40,introDone:true,done:['debut','outing'],episode:0,personal:0};
}
function event(C,key,t,d,a,replies,extra={}){return {id:'reporter:'+key,t,d,a,reply:replies,replies,friend:reporterView(C),remote:false,channel:'scene',...extra};}
export function welcomeEvent(C){
 const r=C.reporter;if(C.phase!=='prep'||!r?.welcomePending)return null;
 const story=[f('안녕하세요. 아까 인터뷰했던 클라라예요. 제 번호도 저장해주세요.','happy'),f(C.age<18?'다음 취재 일정은 구단과도 맞춰볼게요. 훈련 끝나고 가능한 시간을 알려주세요.':'다음 쉬는 날 저녁 괜찮으세요? 식사하면서 조금 더 이야기 나누면 좋을 것 같아서요.'),p('네. 일정 확인하고 연락드릴게요.'),n('번호를 저장했다. 다음 쉬는 날이 정해지면 답하기로 했다.')];story.forEach(line=>{line[4]='message';});
 return event(C,'welcome','인터뷰 직후 온 문자','',[],[],{action:'reporter-message',channel:'story',a:['연락처 저장'],script:{story}});
}
export function completeWelcome(C,pick){if(!welcomeEvent(C)||pick!==0)throw new Error('확인할 메시지가 없어요.');C.reporter.welcomePending=false;}
function eligible(C){const r=C.reporter;return C.age>=18&&r?.contact&&!r.romanceDeclined&&!r.confessionDeclined&&r.status!=='separated'&&C.relationship?.status!=='married';}
function routeChoice(C){return {id:'relationship:route',t:'이번 쉬는 날의 약속',channel:'route',friend:REL.relationshipView(C),people:[REL.relationshipView(C),reporterView(C)],d:'이번 쉬는 날, 누구와 시간을 보낼까?',a:[C.relationship.status==='separated'?'오래된 친구들과 연락하며 쉰다.':C.relationship.name+'과 시간을 보낸다.','클라라와 약속을 잡는다.'],replies:['이번에는 익숙한 사람들과 시간을 보내기로 했다.','서로 가능한 시간을 확인해 약속을 잡았다.'],remote:false};}
export function preparation(C,service=false){
 const welcome=welcomeEvent(C);if(welcome)return welcome;
 if(C.phase!=='prep'||!C.relationship||C.relationship.prepAge===C.age)return null;
 const r=C.reporter;if(!r?.contact)return null;
 if(C.activePartner==='reporter'&&romantic(r)){
  const key=withReporter(C,()=>REL.dueRelationship(C));
  if(key&&['foreign','future','followup','crisis','proposal'].includes(key)&&(!service||['foreign','followup','crisis'].includes(key)))return majorEvent(C,key,service);
  if(service)return event(C,'service','복무 중 짧은 연락','오늘 연락 가능한 시간이죠? 잠깐 목소리 듣고 싶어서요.',['네. 잠깐 얘기해요.','지금은 들어가야 해요. 다음에 연락할게요.'],['네. 오늘은 제가 있었던 일부터 얘기해볼게요.','네. 조심히 들어가요. 다음에 얘기해요.'],{channel:'message',remote:true});
 }
 if(service||!eligible(C))return null;
 const important=REL.dueRelationship(C);
 if(C.activePartner!=='reporter'&&romantic(C.relationship)&&['foreign','followup','crisis'].includes(important))return null;
 if(C.relationshipRoute?.age===C.age)return C.relationshipRoute.target==='reporter'?nextEvent(C):null;
 if(r.status==='married'||C.relationship.status==='separated')return nextEvent(C);
 return routeChoice(C);
}
export function chooseRoute(C,pick){
 const ev=preparation(C);if(ev?.id!=='relationship:route'||![0,1].includes(pick))throw new Error('이번 약속을 다시 확인해 주세요.');
 C.relationshipRoute={age:C.age,target:pick===1?'reporter':'friend'};
}
function nextEvent(C){
 const r=C.reporter;
 if(!romantic(r)&&r.episode>=COURTSHIP.length&&r.affinity>=REL.RULES.confession){
  if(romantic(C.relationship))return event(C,'boundary','애매하게 넘기지 않을 이야기','요즘은 취재할 일이 없어도 자꾸 연락하고 싶어져요. 그런데 만나고 계신 분이 있잖아요. 그 관계가 정리되기 전에는 더 가까워지기 어려울 것 같아요.',['지금 관계부터 직접 정리할게요. 오늘은 여기까지 얘기해요.','지금 만나는 사람과의 관계를 지키고 싶어요.'],['네. 기다리라는 약속은 하지 말아요. 정리가 된 뒤에 이야기해요.','네. 알겠어요. 사적인 약속은 여기까지 할게요.']);
  return majorEvent(C,'confession');
 }
 const episode=!romantic(r)?COURTSHIP[r.episode]:PERSONAL[r.personal||0];
 if(!episode)return event(C,'quiet','익숙한 저녁','오늘은 특별한 일 없이 같이 쉬고 싶어요.',['좋아요. 오늘은 천천히 쉬어요.'],['네. 먼저 차 한 잔 할까요?'],{channel:'message'});
 const story=episode.lines.map(line=>[...line]);
 if(distant(C))story.unshift(n('서로의 일정을 확인해 방문 날짜를 정했다. 약속한 날, 이동을 마친 뒤 만나러 나갔다.'));
 return event(C,'episode:'+episode.id,episode.title,'',[],[],{channel:'story',a:['이야기 마치기'],episode:episode.id,outfit:episode.outfit,place:episode.place,script:{story}});
}
function majorEvent(C,key,service=false){
 const ev=withReporter(C,()=>REL.relationshipEvent(C,'friend:'+key,service),['confession','proposal'].includes(key)?key:null);
 if(!ev)return null;ev.id='reporter:'+key;ev.friend=reporterView(C);ev.outfit=1;
 // Reporter meetings are scheduled explicitly as part of the selected annual event.
 if(['confession','proposal'].includes(key)){
  const before=service?[]:[...(distant(C)?[n('쉬는 날과 이동 일정을 맞췄다. 약속한 장소에 도착하자 먼저 와 있던 사람이 고개를 들었다.')]:[]),n(key==='confession'?'함께 걷던 길에서 걸음을 멈췄다. 오늘은 먼저 할 말이 있다고 했다.':'함께 저녁을 먹고 한참 이야기를 나눴다. 돌아갈 시간이 되어도 먼저 일어나지 않았다.')];
  if(key==='confession'&&!service){before.at(-1)[5]=key;before.at(-1)[6]='tense';}
  ev.script={before,after:ev.reply.map((reply,i)=>reporterMajor(key,i,reply))};
  if(!service)ev.script.after[0].forEach((line,i)=>{line[5]=key;line[6]=(key==='confession'?['surprised','surprised','happy']:['surprised','surprised','tearful','tearful','happy'])[Math.min(i,key==='confession'?2:4)];});
 }else{
  if(key==='foreign'&&!ev.remote&&C.reporter.foreign?.wasDistant)ev.d='이제 같은 나라에 있네요. 짐 정리 끝나면 같이 저녁 먹어요. 직접 보고 싶은 얼굴이었어요.';
  if(key==='followup'&&ev.meeting){ev.meeting.lines=[n('서로의 일정을 확인해 방문 날짜를 잡았다. 약속한 날, 이동을 마친 뒤 식당에서 만났다.'),f('왔네요. 오늘은 정말 얼굴 보니까 좋다.','happy'),p('저도요. 오늘은 시간 넉넉하게 비웠어요.'),f('그럼 천천히 먹어요. 안 그래도 하고 싶은 얘기가 많았어요.','happy'),n('그동안 전화로 짧게 넘긴 이야기들을 나눴다. 식사를 마친 뒤에도 한참을 더 함께 있었다.'),p('다음에는 제가 먼저 갈게요. 일정 나오면 연락할게요.'),f('네. 돌아가는 길 조심하고요. 오늘 와줘서 고마워요.','happy'),n('방문을 마치고 각자의 도시로 돌아갔다. 다음에 만날 날도 함께 확인했다.')];}
  else ev.meeting=null;
  ev.script={before:[],after:ev.reply.map((reply,i)=>{
   if(ev.partnerEnds||(['foreign','crisis'].includes(key)&&i===2))return [f(reply,'sad'),p('알겠어요. 그동안 고마웠어요.'),n(ev.remote?'마지막 인사를 나누고 연락을 마쳤다.':'짧게 인사를 나눴다. 이번에는 다음 약속을 잡지 않았다.')];
   if(key==='crisis')return [f(reply,i?'sad':'neutral'),p(i?'미안해요. 오늘은 제가 제대로 듣기 어려울 것 같아요.':'못 만나는 날에는 제가 먼저 말할게요. 기다리게 하지 않을게요.'),f(i?'다음에 얘기하자는 말, 지난번에도 들었어요.':'네. 만나지 못하는 것보다 모른 채 기다리는 게 더 힘들었어요.',i?'sad':'neutral'),n('대화를 마친 뒤 한동안 각자의 생각을 정리했다.')];
   if(key==='followup')return [f(reply,i===2?'sad':'neutral'),p(i===2?'오늘은 정말 정신이 없어요.':i===1?'미리 말해야 할 것 같았어요. 다른 날을 찾아봐요.':'오늘은 다른 일정 안 잡았어요. 얘기해요.'),f(i===2?'그럼 저는 언제까지 기다려야 해요?':i===1?'네. 저도 마감 없는 날 확인해볼게요.':'좋아요. 오늘은 제 얘기부터 할게요.',i===2?'sad':'happy'),n(i===2?'다음 날짜를 정하지 못한 채 연락을 마쳤다.':'서로 시간을 내어 이야기를 나눴다. 다음 약속도 함께 확인했다.')];
   return [f(reply,i===2?'sad':'neutral'),p(i===2?'같이 있고 싶어서 그랬어요.':i===1?'지금 가능한 약속부터 정해봐요. 둘 다 지킬 수 있는 걸로요.':'저도 취재 일정이랑 마감부터 같이 보고 싶어요. 어떻게 지낼지 얘기해요.'),f(i===2?'저도 같이 있고 싶어요. 그래도 제 일부터 다 놓고 갈 수는 없어요.':'네. 취재하러 다닐 때 어떻게 지낼지도 함께 생각해봐요.',i===2?'sad':'happy'),n('서로의 달력을 꺼내 이야기를 이어갔다. 바로 정할 수 없는 일은 다시 알아보기로 했다.')];
  })};
 }
 return ev;
}
function annualDone(C){C.relationship.prepAge=C.age;C.reporter.prepAge=C.age;}
export function complete(C,ev,pick){
 if(ev.id==='relationship:route')return chooseRoute(C,pick);
 if(ev.id==='reporter:welcome')return completeWelcome(C,pick);
 if(!ev.id.startsWith('reporter:')||!Number.isInteger(pick)||!ev.a[pick])throw new Error('기자와의 약속을 다시 확인해 주세요.');
 const r=C.reporter;if(C.relationship.prepAge===C.age)throw new Error('이번 관계 이벤트는 이미 마쳤어요.');
 const key=ev.id.split(':')[1];
 if(key==='boundary'){
  if(pick===0){const old=C.relationship;old.status='separated';old.separatedAge=C.age;for(const k of ['promise','moveDiscussion','foreign','visit'])delete old[k];}
  else r.romanceDeclined=true;
 }else if(key==='episode'||key==='quiet'||key==='service'){
  if(key==='episode'){
   if(romantic(r))r.personal=(r.personal||0)+1;else r.episode++;
   r.done.push('episode:'+ev.episode);
   if(['her-deadline','her-story','honest-draft'].includes(ev.episode))r.goalSupport++;
  }
  const before=r.affinity;r.affinity=Math.min(100,r.affinity+(key==='service'?(pick===0?4:0):6));
  if(!romantic(r))r.status=r.affinity>=55?'close':'friend';
  r.lastChange={age:C.age,delta:r.affinity-before,reason:key==='episode'?'취재 밖의 이야기도 서로 나눴다':'서로를 위해 시간을 냈다'};
 }else{
  withReporter(C,()=>REL.applyRelationship(C,'friend:'+key,pick),['confession','proposal'].includes(key)?key:null);
  if(key==='confession'&&pick===0)C.activePartner='reporter';
  if(key==='confession'&&pick!==0)r.romanceDeclined=true;
  if(r.status==='separated')delete C.activePartner;
 }
 annualDone(C);
}
export function recordTransfer(C,from,to){if(C.reporter?.contact&&romantic(C.reporter))withReporter(C,()=>REL.recordRelationshipTransfer(C,from,to));}
