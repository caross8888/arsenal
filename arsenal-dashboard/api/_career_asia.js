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
function ringEvent(C){
 const replies=['작은 상자를 받아 들었다. 다음에 만날 때는 준비한 말을 직접 전하기로 했다.','오늘은 둘러보기만 했다. 마음을 더 정리한 뒤 다시 생각하기로 했다.'];
 const before=[n('비시즌 휴가 중, 혼자 보석 가게에 들렀다. 함께 살 날을 이야기했던 저녁이 떠올랐다.'),n('반지를 몇 개 꺼내 놓고 살펴봤다. 평소 그녀가 고르던 장신구를 떠올리며 화려하지 않은 것을 골랐다.'),n('준비해 둔 손가락 둘레를 직원에게 알려주고, 사이즈를 조정할 수 있는지도 확인했다.')];
 const after=[
  [n('반지를 골라 계산을 마쳤다. 직원이 작은 상자를 닫아 봉투에 담아 주었다.'),n('봉투 안의 상자를 한 번 더 확인했다. 아직 그녀에게는 말하지 않은 준비였다.'),n('다음에 만날 날을 떠올렸다. 무슨 말을 먼저 할지 생각하다가, 결국 가장 전하고 싶은 말부터 꺼내기로 했다.')],
  [n('오늘은 결정을 미뤘다. 둘이 나눴던 결혼 이야기를 다시 떠올려 보기로 했다.')]
 ];
 [...before,...after.flat()].forEach(line=>{line[5]='ring';});
 return event(C,'ring','혼자 고르는 반지',{questionSpeaker:'n',choiceSpeakers:['n','n'],questionCG:{key:'ring'},d:'함께할 미래는 이미 이야기했다. 이제 내 마음을 전할 반지를 준비할까?',a:['반지를 골라 구매한다.','오늘은 둘러보고 나온다.'],reply:replies,replies,script:{before,after},asia:{kind:'ring'}});
}
function playerProposal(C,ev){
 ev.t='준비해 둔 말';ev.outfit=1;ev.questionSpeaker='n';ev.choiceSpeakers=['p','n'];ev.mood='happy';ev.questionCG={key:'proposal',expression:'waiting'};
 ev.d='주머니 속 작은 상자를 만졌다. 오늘, 준비해 둔 말을 전할까?';
 ev.a=['너랑 평생 같이 살고 싶어. 나랑 결혼해 줄래?','오늘은 반지를 꺼내지 않는다.'];
 ev.reply=ev.replies=['응. 나도 너랑 결혼하고 싶어.','오늘은 준비한 말을 꺼내지 않고 둘이 보내는 저녁을 즐겼다.'];
 ev.script={before:[n(location(C)),n('미리 예약한 식당에서 저녁을 먹었다. 식사를 마친 뒤 강이 보이는 테라스에 나란히 앉았다.'),f('여기 좋다. 밥도 맛있고.','happy'),p('너랑 천천히 저녁 먹고 싶어서 골랐어.'),n('그녀가 강 쪽을 보는 동안, 주머니에 넣어 둔 반지 상자를 확인했다.')],after:[
  [n('작은 상자를 열어 그녀에게 내밀었다.'),f('……이거, 준비한 거야?','shy'),p('응. 너랑 결혼하고 싶어.'),f('응. 나도. 너랑 결혼할래.','shy'),p('손 줘봐.'),n('그녀가 내민 손에 반지를 조심스럽게 끼워 주었다.'),f('……나 자꾸 이것만 보게 된다.','happy'),p('마음에 들어?'),f('응. 고르는 동안 내 생각했을 거잖아. 그래서 더 좋아.','happy'),n('그녀는 손을 한 번 더 내려다보고 웃었다. 한동안 자리를 떠나지 않고 앞으로 함께 보낼 날을 이야기했다.')],
  [n('상자는 주머니 안에 둔 채로 그녀의 이야기를 들었다.'),f('다음에 여기 또 오자. 내가 이번엔 다른 메뉴 고를게.','happy'),p('좋아. 다음에 또 오자.'),n('오늘은 청혼하지 않았다. 준비해 둔 반지는 그대로 간직하고, 저녁을 마친 뒤 함께 돌아갔다.')]
 ]};
 ev.script.before.slice(1).forEach(line=>{line[5]='proposal';line[6]='waiting';});
 ev.script.after[1].forEach(line=>{line[5]='proposal';line[6]='waiting';});
 ev.script.after[0].forEach((line,i)=>{line[5]='proposal';line[6]=i<3?'surprised':i<5?'tearful':'happy';});
 return ev;
}
function major(C,key){
 const ev=atHome(C,key,()=>REL.relationshipEvent(C,'friend:'+key));
 if(!ev)return null;
 ev.remote=false;ev.channel='scene';ev.place=3;ev.outfit=['confession','proposal'].includes(key)?1:0;ev.asiaRoute=true;delete ev.meeting;
 // Generic major dialogue is spoken in person during leave, with her current career acknowledged.
 ev.script.before=[n(location(C)),...(ev.script.before||[]).slice(3)];
 ev.script.after.forEach(lines=>{if(lines.at(-1)?.[1]?.includes('방문을 마치고 다시'))lines.pop();});
 ev.script.after.forEach(lines=>{const ending=close(C);if(lines.at(-1)?.[5]){ending[5]=lines.at(-1)[5];ending[6]=lines.at(-1)[6];}lines.push(ending);});
 if(key==='future'&&!story(C).voiceFound){ev.d='너랑 같이 지내는 건 나도 생각해. 근데 노래를 계속할 방법부터 여기서 찾아보고 싶어. 둘 다 놓치지 않으려면 어떻게 해야 할까?';ev.a[0]='네가 준비하는 일부터 듣고 싶어. 귀국 일정과 네 공연 일정도 함께 보자.';ev.reply[0]=ev.replies[0]='응. 내가 뭘 하고 싶은지부터 얘기할게. 다음에 만날 날짜도 같이 정하자.';}
 if(key==='foreign'){
  // The annual visit makes the scene local; permanent residences determine the transfer's meaning.
  const far=REL.isDistant(C),alreadyFar=!!C.relationship.foreign?.wasDistant;
  ev.t=far?(alreadyFar?'다시 맞추는 만날 날':'새 팀으로 떠나기 전에'):'다시 가까워진 우리';
  ev.mood=far?'neutral':'happy';
  ev.d=far?(alreadyFar?'또 이사하느라 바쁘겠다. 새 팀 일정 나오면 알려줘. 이번에는 언제 볼 수 있을지 같이 보자.':'새 팀 가는 거 축하해. 근데 이제 너 보려면 휴가까지 기다려야 하는 거네. 우리 만나는 건 어떻게 할까?'):'이제 우리 같은 나라에 있는 거네. 전처럼 휴가까지 기다리지 않아도 볼 수 있겠다. 너 쉬는 날 언제인지 나도 알려줘.';
  ev.a=[far?'내 일정 나오면 먼저 알려줄게. 만날 수 있는 날 같이 찾아보자.':'응. 훈련 일정 나오면 보내줄게. 너 쉬는 날이랑 맞춰 보자.',far?'나 있는 데서 같이 지내는 건 어때? 네 생각도 듣고 싶어.':'우리 같이 사는 것도 생각해 볼까? 너는 어때?',...(C.relationship.status==='dating'?['미안해. 앞으로도 계속 만나는 건 어려울 것 같아.']:[])];
  ev.reply=ev.replies=[far?'응. 날짜부터 같이 보자. 막연히 기다리는 건 나도 힘들 것 같아서.':'좋아. 이제 저녁 한 끼 먹자고 비행기부터 알아보진 않아도 되겠네.',far?'같이 있고는 싶어. 그런데 내 일까지 바로 옮길 수 있을지는 모르겠어.':'나도 생각해 본 적 있어. 그래도 어디서 어떻게 살지는 천천히 얘기해 보고 싶어.',...(C.relationship.status==='dating'?['……이적 때문에만 그런 건 아니구나. 알겠어. 억지로 붙잡지는 않을게.']:[])];
  const before=[n(location(C)),n('저녁을 먹고 함께 걷다가 새 팀 이야기를 꺼냈다.'),f('이사 준비는 좀 했어?'),p('응. 급한 건 정리했어. 이제 팀 일정 나오면 좀 더 알 것 같아.')];
  const after=[
   [f(ev.reply[0],'happy'),p(far?'나도 다음에 보자는 말만 해놓고 기다리게 하기는 싫어. 일정 정해지면 바로 말할게.':'그러게. 훈련 끝나고 시간 되면 같이 밥 먹자.'),f(far?'응. 나도 내 일정 나오면 보내줄게. 같이 정하자.':'좋아. 나도 끝나는 시간 미리 알려줄게.','happy'),n('각자의 달력을 꺼내 가능한 날을 확인했다. 아직 정해지지 않은 일정은 서로 알게 되는 대로 전하기로 했다.'),close(C)],
   [f(ev.reply[1]),p(far?'응. 당장 옮기라는 뜻은 아니야. 네가 하는 일도 계속할 수 있어야지.':'나도 그래. 집부터 알아보기 전에 우리 일하는 곳이랑 일정부터 같이 보자.'),f(far?'그럼 내가 여기서 마무리하고 싶은 것부터 얘기할게.':'응. 내가 어디서 일하고 싶은지도 얘기할게.'),n('어디에서 지내고 각자의 일을 어떻게 이어갈지 이야기했다. 이날 바로 이사를 결정하지는 않았다.'),close(C)],
   ...(C.relationship.status==='dating'?[[f(ev.reply[2],'sad'),p('응. 미안해. 계속 괜찮은 척하면서 만나면 더 상처 줄 것 같아서.'),f('알겠어. 오늘은 나 먼저 갈게.','sad'),n('다음 약속을 잡지 않고 인사를 나눴다.'),close(C)]]:[])
  ];
  ev.script={before,after};
 }
 if(key==='proposal')return playerProposal(C,ev);
 if(key==='confession'){
  ev.t='내가 무대에 서지 않는 날에도';ev.d='잘될 때만 네가 보고 싶은 건 아니더라. 아무 얘기 안 해도 같이 있고 싶어. ……너는 어때?';
  ev.script.before=[n(location(C)),n('저녁을 먹고 강변을 걷다가 빈 벤치에 나란히 앉았다.'),f('잠깐만 더 있다 가자. 나 할 말 있어.','shy'),p('응. 뭔데?'),n('가방을 옆에 내려놓은 그녀가 이쪽으로 몸을 돌렸다.')];ev.script.before.at(-1)[5]='confession';ev.script.before.at(-1)[6]='tense';
  ev.script.after[0]=[f('……진짜? 장난치는 거 아니지.','shy'),p('응. 너 좋아해.'),f('아, 너 얼굴 보고 준비한 말 다 까먹었어.','happy'),p('천천히 해. 나 안 가.'),f('그럼 조금만 더 앉아 있자. 아직 집에 가기 싫어.','happy'),n('벤치 위에 놓인 손을 조심스럽게 잡았다. 그녀도 손을 빼지 않고 가까이 앉았다.')];ev.script.after[0].forEach((line,i)=>{line[5]='confession';line[6]=i<2?'surprised':'happy';});
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
 if(key==='proposal'&&s.ring&&C.age>s.ring.boughtAge)return major(C,key);
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
 if(key==='proposal')return s.ring?major(C,key):ringEvent(C);
 if(key==='future')return major(C,key);
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
 if(!ev.asia){const key=ev.id.split(':')[1];if(ev.asiaMilitaryMajor)REL.applyRelationship(C,ev.id,pick);else atHome(C,key,()=>REL.applyRelationship(C,ev.id,pick));if(key==='proposal'&&pick===0)s.ring.usedAge=C.age;if(r.visit?.key===key)delete r.visit;r.prepAge=C.age;return;}
 let delta=4,reason='휴가 중 시간을 내어 서로의 일상을 나눴다';
 if(ev.asia.kind==='main'){
  const chapter=MAIN[s.chapter],support=chapter.support[pick];
  if(support>0){s.support+=support;r.goalSupport++;}else s.support=Math.max(0,s.support+support);
  delta=support>0?6:support<0?-4:0;reason=support>0?'그녀의 이야기를 듣고 스스로 선택할 시간을 존중했다':'내 기대보다 그녀의 마음을 먼저 물을 필요가 있었다';
  s.seen.push('main:'+chapter.id);s.chapter++;s.lastMainAge=C.age;
  if(s.chapter>=7)s.voiceFound=true;
  if(s.chapter===8)s.ending=s.support>=5?'shared-stage':'own-stage';
 }else if(ev.asia.kind==='ring'){
  if(pick===0){s.ring={boughtAge:C.age};s.seen.push('ring-purchase');}
  else r.proposalAskedAge=C.age;
  delta=0;reason=pick===0?'함께할 미래를 생각하며 청혼할 반지를 준비했다':'청혼 준비를 서두르지 않고 더 생각하기로 했다';
 }else if(ev.asia.kind==='date')s.seen.push(ev.asia.id);
 else if(ev.asia.kind==='service'){
  s.serviceSeen=[...new Set([...(s.serviceSeen||[]),ev.asia.id])];
  delta=pick===0?(ev.asia.id==='visit'?6:4):0;reason=ev.asia.id==='visit'&&pick===0?'허용된 면회 시간에 만나 서로의 근황을 나눴다':'복무 중 가능한 연락 시간과 일정을 존중했다';
 }
 else delta=0;
 const before=r.affinity;r.affinity=Math.max(0,Math.min(100,r.affinity+delta));r.lastChange={age:C.age,delta:r.affinity-before,reason};
 if(['friend','close'].includes(r.status))r.status=r.affinity>=55&&!r.confessionDeclined?'close':'friend';
 if(['main','date'].includes(ev.asia.kind)||ev.asia.kind==='service'&&ev.asia.id==='visit'&&pick===0)r.lastVisitAge=C.age;
 r.prepAge=C.age;r.records.push({age:C.age,id:ev.id,pick,delta:r.affinity-before});r.records=r.records.slice(-12);
}
