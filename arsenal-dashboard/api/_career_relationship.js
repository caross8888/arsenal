import {PROFILES,conversation,aftermath} from './_career_relationship_dialogue.js';
export const RULES=Object.freeze({max:100,start:40,confession:65,proposal:85,crisis:30,minDatingYears:2});
const PEOPLE={asia:'서윤',south:'루시아',africa:'아마라',europe:'에밀리'};
const clamp=n=>Math.max(0,Math.min(RULES.max,Number.isFinite(n)?Math.round(n):RULES.start));
const romantic=r=>r.status==='dating'||r.status==='married';
export function createRelationship(nation){
  const region=['KOR','JPN'].includes(nation)?'asia':['BRA','ARG'].includes(nation)?'south':nation==='NGA'?'africa':'europe';
  return {version:4,region,name:nation==='JPN'?'유이':PEOPLE[region],homeNation:nation,residence:nation,status:'friend',affinity:RULES.start,done:[],lastAge:0,introDone:false,goalSupport:0,unresolved:0,brokenPromises:0,records:[],moveSeq:0};
}
export function ensureRelationship(C){
  const r=C.relationship;if(!r)return null;
  if((r.version||1)<4){
    r.legacyDebut=(r.version||1)<2;
    if(['injury','penalty'].includes(C.phase)&&String(C.ev).startsWith('friend:'))r.legacyPendingChoice={id:C.ev,age:C.age};
    r.affinity=clamp(Math.max(r.status==='married'?85:r.status==='dating'?65:40,40+(Number(r.affinity)||0)*8));
    if(romantic(r)&&r.datingAge==null)r.datingAge=r.marriedAge||C.age;
    if(r.done?.includes('confession')&&r.status==='friend')r.confessionDeclined=true;
    r.version=4;
  }
  r.homeNation=r.homeNation||C.nation||C.club?.nat;
  r.residence=r.residence||r.homeNation;
  r.done=r.done||[];r.records=r.records||[];r.affinity=clamp(r.affinity);
  r.goalSupport=r.goalSupport||0;r.unresolved=r.unresolved||0;r.brokenPromises=r.brokenPromises||0;r.moveSeq=r.moveSeq||0;
  return r;
}
export function isDistant(C,nation){
  const r=ensureRelationship(C);return !!r&&r.residence!==(nation||C.club?.nat||C.nation||r.homeNation);
}
function change(C,delta,reason){
  const r=ensureRelationship(C),before=r.affinity;r.affinity=clamp(before+delta);
  r.lastChange={age:C.age,delta:r.affinity-before,reason};
  if(['friend','close'].includes(r.status))r.status=!r.confessionDeclined&&r.affinity>=55?'close':'friend';
}
function remember(C,id,pick){
  const r=C.relationship;r.records.push({age:C.age,id,pick,delta:r.lastChange?.delta||0});r.records=r.records.slice(-12);
}
function promise(C){C.relationship.promise={madeAge:C.age,reviewAge:C.age+1};}
function endRelationship(C){const r=C.relationship;r.status='separated';r.separatedAge=C.age;delete r.promise;delete r.moveDiscussion;delete r.foreign;delete r.visit;}
export function relationshipView(C){
  const r=ensureRelationship(C);if(!r)return null;const P=PROFILES[r.region];
  return {id:r.region,name:r.name,status:r.status,label:{friend:'소꿉친구',close:'가까워지는 사이',dating:'연인',married:'배우자',separated:'추억으로 남은 인연'}[r.status],affinity:r.affinity,affinityMax:RULES.max,personality:P.personality,goal:P.goal,boundary:P.boundary,homeNation:r.homeNation,residence:r.residence,longDistance:isDistant(C),datingYears:romantic(r)?Math.max(0,C.age-(r.datingAge??C.age)):0,marriedAge:r.marriedAge||null,pendingDebut:!!r.pendingDebut,debutMode:r.debutMode||'stadium',lastChange:r.lastChange?.age===C.age?r.lastChange:null,promise:!!r.promise};
}
function event(C,key,t,d,a,reply,extra={}){
  const r=ensureRelationship(C);return {id:'friend:'+key,t,d,a,reply,replies:reply,friend:relationshipView(C),remote:isDistant(C),...extra};
}
export function introEvent(C){
  const r=ensureRelationship(C);if(!r||r.introDone||C.age!==15||(C.hist||[]).length)return null;
  const P=PROFILES[r.region],abroad=isDistant(C);
  const a=abroad?['응. 짐 풀고 사진 보내줄게.','아직 좀 낯설다. 잠깐 얘기할래?','나중에 경기 뛰면 중계로라도 봐줘.']:['왜 벌써 웃는데ㅋㅋ','아직 안 입어봤어. 들어가서 보내줄게.','나 프로경기 뛰면 보러 와라.'];
  return event(C,'intro',abroad?'낯선 도시에서 온 첫 연락':'새 유니폼',P.intro[abroad?1:0],a,[P.welcome[abroad?1:0],abroad?'응. 지금 시간 돼. 뭐가 제일 낯설어?':P.welcome[0],abroad?'당연하지. 경기 시간 알려줘. 여기서도 챙겨볼게.':'알려줘. 첫 공식경기면 나도 같이 기억하고 싶어.'],{channel:'message'});
}
export function applyIntro(C,pick){
  const ev=introEvent(C);if(!ev||!Number.isInteger(pick)||!ev.a[pick])throw new Error('intro pick');
  const r=C.relationship;r.introDone=true;r.introPick=pick;r.prepAge=C.age;change(C,3,'서로의 근황을 나눴다');remember(C,ev.id,pick);
}
export function prepareDebut(C,row){
  const r=ensureRelationship(C);if(!r||r.status==='separated'||r.done.includes('debut')||r.pendingDebut||row?.youth!==false||!(row.apps>0))return;
  if((C.hist||[]).some(old=>!old.youth&&old.apps>0))return;
  r.pendingDebut=true;r.debutMode=isDistant(C,C.loanClub?.nat||C.club?.nat)?'remote':'stadium';
}
export function debutEvent(C){
  const r=ensureRelationship(C);if(!r?.pendingDebut)return null;
  const remote=r.debutMode==='remote',P=PROFILES[r.region];
  const ev=event(C,'debut',remote?'첫 1군 공식경기 · 중계를 보고':'첫 1군 공식경기 · 경기 종료 직후',remote?({asia:'너 나오는 거 봤어!\n화면 앞에서 나만 긴장했잖아ㅋㅋ 지금 잠깐 얘기돼?',south:'첫 경기 봤어! 직접 가서 보고 싶었는데.\n네 목소리로도 얘기 듣고 싶어. 지금 괜찮아?',africa:'첫 공식경기 봤어. 나까지 긴장되더라ㅋㅋ\n거긴 지금 몇 시야? 잠깐 얘기할 수 있어?',europe:'중계로 봤어. 첫 공식경기 축하해.\n정리 끝나면 잠깐 통화할 수 있어?'}[r.region]):({asia:'아까 나 봤지?ㅋㅋ\n나 아직 출구 쪽인데. 잠깐 볼래?',south:'경기 잘 봤어!\n나 출구에 있어. 얼굴 보고 축하해주고 싶어.',africa:'나 찾았어? 손 흔든 보람이 있네ㅋㅋ\n출구 쪽에서 기다려도 돼?',europe:'수고했어. 아직 출구에 있어.\n시간 괜찮으면 잠깐 보고 가자.'}[r.region]),remote?['응. 지금 잠깐 통화하자.','오늘은 팀 일정이 있어. 정리하고 연락할게.']:['응. 거기 있어. 금방 나갈게.','오늘은 팀 일정이 있어. 먼저 가. 다음에 보자.'],[remote?{asia:'응. 나 오늘 네 경기 보면서 얘기할 거 많아ㅋㅋ',south:'좋아. 오늘 기분 어땠는지 네 목소리로 듣고 싶었어.',africa:'좋아. 내가 본 거랑 네가 뛴 거랑 얘기 맞춰보자ㅋㅋ',europe:'응. 나 지금 시간 돼. 천천히 얘기해.'}[r.region]:'응. 기다릴게. 천천히 나와.','알겠어. 오늘은 푹 쉬어. 첫 경기 정말 축하해.'],{remote,channel:'message'});
  ev.script={before:[],after:[conversation(r.region,'debut',remote,r.status),[]]};return ev;
}
function moveEligible(C){
  const r=ensureRelationship(C);return C.age>=21&&r.affinity>=75&&C.age-(r.datingAge??C.age)>=2&&r.goalSupport>=PROFILES[r.region].moveSupport;
}
// A visit changes the scene's location, never the friend's permanent residence.
function visitPlan(C){
  const r=ensureRelationship(C),minor=C.age<18;
  return {d:minor?'다음에 가족 보러 귀국하는 일정 잡혔어?\n그때 시간 맞으면 우리도 만나자.':({asia:'너 다음에 며칠 쉴 수 있어?\n나도 일정 맞춰서 한번 가려고. 화면 말고 얼굴 좀 보자ㅋㅋ',south:'너 보러 가고 싶어.\n우리 둘 다 시간 되는 날 맞춰볼까? 네가 지내는 동네도 보고 싶어.',africa:'우리 통화만 하지 말고 얼굴도 좀 보자ㅋㅋ\n나 갈 수 있는 날이랑 네 쉬는 날 맞춰볼까?',europe:'시간 맞으면 며칠 보러 가고 싶어.\n네 쉬는 날 알려줘. 나도 일정을 확인해볼게.'}[r.region]),a:minor?'귀국 일정 정해졌어. 그때 하루 같이 보내자.':'좋아. 내 쉬는 날 알려줄게. 네 일정도 같이 맞추자.',reply:minor?'좋아. 도착해서 좀 쉬고 만나자. 기다릴게.':'좋아. 날짜 정해지면 이동편도 확인할게. 드디어 얼굴 보겠네.'};
}
function arrival(C){
  return [['n',C.age<18?'가족과 귀국 일정을 맞췄다. 며칠 뒤 고향에 도착해 쉬고 나서, 약속한 날 친구를 만나러 나갔다.':'서로의 쉬는 날과 이동 일정을 확인해 방문 날짜를 정했다. 며칠 뒤, 도착 연락을 받고 약속한 곳으로 나갔다.','neutral'],['f',PROFILES[C.relationship.region].reunion||'이렇게 얼굴 보니까 좋다. 오는 내내 무슨 얘기부터 할까 생각했어.','happy'],['p','나도. 오늘은 시간 넉넉해. 천천히 얘기하자.','happy']];
}
function visitConversation(C,kind){
  const lines=conversation(C.relationship.region,kind,false,C.relationship.status);
  lines[lines.length-1]=['n',C.age<18?'돌아가는 길에 남은 귀국 일정을 이야기했다. 다시 출국하기 전에 시간이 맞으면 한번 더 보기로 했다.':'숙소로 돌아가는 길까지 함께 걸었다. 남은 방문 일정에도 시간이 맞으면 다시 보기로 했다.','neutral',false];
  return [...lines,['n','짧은 방문을 마치고 각자의 생활로 돌아갔다. 다음에 만날 때는 누가 찾아갈지도 함께 이야기했다.','neutral',false]];
}
function visitMeeting(C,ev,kind='walk'){
  const plan=visitPlan(C);ev.d=plan.d;ev.a=[plan.a,'이번엔 일정 맞추기 어렵겠다. 가능한 날 다시 찾아보자.'];ev.reply=ev.replies=[plan.reply,'알겠어. 무리해서 정하지 말자. 다음에 둘 다 되는 날로 보자.'];
  ev.meeting={place:kind==='dinner'?2:3,scene:'reunion',remote:false,lines:[...arrival(C),...visitConversation(C,kind)]};return ev;
}
function visitInvitation(C,key){
  const plan=visitPlan(C);
  return event(C,'visit','다음에 얼굴 보자',plan.d,[plan.a,'이번엔 어렵겠다. 가능한 날을 다시 찾아보자.'],[plan.reply,'응. 무리해서 약속하지 말자. 날짜 맞을 때 다시 얘기하자.'],{channel:'message',visitFor:key});
}
export function dueRelationship(C){
  const r=ensureRelationship(C);if(!r||r.pendingDebut||r.status==='separated')return null;
  if(r.visit?.age===C.age)return r.visit.key;
  if(r.legacyDebut&&!r.done.includes('debut')&&(C.hist||[]).some(row=>!row.youth&&row.apps>0))return 'debut';
  if(r.status==='dating'&&(r.affinity<=RULES.crisis||r.unresolved>=2||r.crisisTalked))return 'crisis';
  if(romantic(r)&&r.foreign)return 'foreign';
  if(romantic(r)&&r.moveDiscussion)return 'future';
  if(romantic(r)&&r.promise&&C.age>=r.promise.reviewAge)return 'followup';
  if(C.age-r.lastAge<2)return null;
  if(['friend','close'].includes(r.status)&&C.age>=18&&r.affinity>=RULES.confession&&!r.done.includes('confession'))return 'confession';
  if(romantic(r)&&C.age-(r.datingAge??C.age)>=2&&(!r.futureAgreement||isDistant(C)&&r.futurePlan!=='together'&&moveEligible(C)&&C.age-(r.lastFutureAge||r.datingAge||C.age)>=3))return 'future';
  if(r.status==='dating'&&r.affinity>=RULES.proposal&&C.age-(r.datingAge??C.age)>=2&&r.futureAgreement&&C.age-(r.proposalAskedAge||0)>=2)return 'proposal';
  if(!r.done.includes('outing')&&C.age>=18&&r.affinity>=55)return 'outing';
  return null;
}
export function recordRelationshipTransfer(C,from,to){
  const r=ensureRelationship(C);if(!r||!from||!to||from===to)return;
  if(romantic(r)){
    r.moveSeq++;r.foreign={seq:r.moveSeq,from,to,wasDistant:r.residence!==from};
    r.futureAgreement=false;delete r.moveDiscussion;
  }
}
export function relationshipEvent(C,id,forceRemote=false){
  const key=String(id||'').split(':')[1],r=ensureRelationship(C);if(!r)return null;
  if(key==='visit')return visitInvitation(C,r.visit?.key||dueRelationship(C));
  const visiting=!forceRemote&&r.visit?.age===C.age&&r.visit.key===key;
  if(!forceRemote&&isDistant(C)&&['confession','proposal'].includes(key)&&!visiting)return visitInvitation(C,key);
  if(key==='debut'){
    const pending=debutEvent(C);if(pending)return pending;
    return event(C,'debut','아직 못 들은 얘기','네 첫 공식경기 이야기, 아직 제대로 못 들었어.\n시간 되면 얘기해줘.',['응. 오늘 얘기하자.','오늘은 좀 쉬고 싶어. 다음에 보자.'],['좋아. 나도 궁금한 거 많아.','응. 푹 쉬어.'],{channel:'message',meeting:{place:2,scene:'memory',lines:conversation(r.region,'memory',isDistant(C),r.status)}});
  }
  const P=PROFILES[r.region],remote=forceRemote||(!visiting&&isDistant(C)),endpoint=remote?'call':'scene';let ev;
  if(key==='outing')ev=event(C,key,'둘이 보내는 쉬는 날',P.meet,['좋아. 오늘 같이 시간 보내자.','오늘은 쉬어야겠어. 다음에 보자.'],['좋아. 오늘은 천천히 얘기하자.','알겠어. 사정 얘기해줘서 고마워.'],{channel:'message',remote,meeting:{place:3,scene:'personal:walk',lines:conversation(r.region,'walk',remote,r.status)}});
  if(key==='confession')ev=event(C,key,'친구라는 말 다음',P.confession,['나도 너 좋아해. 우리 사귀자.','나는 친구로 생각했어. 솔직하게 말하고 싶었어.'],[P.yes,P.no],{channel:endpoint});
  if(key==='foreign')ev=event(C,key,r.foreign?.wasDistant?'다시 맞춰야 하는 거리':'새 팀, 달라지는 우리',P.foreign[r.foreign?.wasDistant?1:0],['연락할 시간부터 같이 정하자. 멀어져도 계속 만나고 싶어.','너도 오면 좋겠지만 네 계획도 있잖아. 같이 의논해볼까?',...(r.status==='dating'?['미안해. 계속 만나기는 어려울 것 같아. 우리 그만하자.']:[])],['응. 지킬 수 있는 약속부터 같이 정하자.',P.future,...(r.status==='dating'?['쉽게 받아들이기는 어렵지만 네 마음은 알겠어. 오늘은 여기까지 하자.']:[])],{channel:endpoint});
  if(key==='foreign'&&!remote&&r.foreign?.wasDistant){ev.t='다시 가까워진 우리';ev.d='이제 같은 나라에서 지내게 됐네.\n자주 만날 수 있겠지만 서로의 생활도 같이 지켜가고 싶어.';ev.a[0]='이제 얼굴 자주 보자. 둘 다 되는 시간부터 같이 정하자.';ev.reply[0]='좋아. 이번에는 얼굴 보면서 얘기할 수 있겠다.';}
  if(key==='future'){
    const canMove=isDistant(C)&&moveEligible(C),moving=!!r.moveDiscussion;
    ev=event(C,key,'우리 각자의 계획',P.future,[canMove?'그럼 각자 계획을 지키면서 같이 가자. 준비도 함께 하자.':'네가 하고 싶은 것도 지켰으면 해. 우리 계획 같이 세우자.','지금은 각자 지내자. 대신 연락하고 만날 시간을 같이 정하자.','내 일정에 맞춰 네가 따라와 주면 안 돼?'],[canMove?'응. 내 생활을 준비할 방법도 같이 찾았으니까, 나도 가고 싶어.':'고마워. 내 계획을 포기하지 않고도 만날 방법을 같이 찾자.','좋아. 서로 가능한 시간을 정해보자.','내 생활도 있는 건데. 네 일정만으로 정하고 싶지는 않아.'],{channel:endpoint,canMove,moving});
  }
  if(key==='proposal')ev=event(C,key,'함께할 미래',P.proposal,['너랑 결혼하고 싶어. 우리 같이 준비하자.','아직 준비가 안 됐어. 지금 내 생각을 솔직하게 얘기할게.'],[P.marry,'알겠어. 기다리라는 말만 하지 말고, 네 생각도 같이 얘기해줘.'],{channel:endpoint});
  if(key==='followup')ev=event(C,key,'지난번에 정한 약속',r.unresolved?'지난번에도 약속을 미뤘잖아.\n이번에 정한 시간에는 우리 얘기할 수 있을까?':'지난번에 연락하고 만날 시간 같이 정했잖아.\n이번 약속은 어떻게 할까?',['그 시간 비워뒀어. 오늘은 우리 얘기하자.','그날 팀 일정이 생겼어. 미리 말하고 싶었어. 다른 날 같이 정할까?','지금 바빠. 다음에 얘기하자.'],['시간 내줘서 고마워. 오늘은 네 얘기도 내 얘기도 하자.','미리 알려줘서 고마워. 둘 다 되는 시간으로 다시 정하자.',P.concern],{channel:endpoint});
  if(key==='crisis'){
    const partnerEnds=!!r.crisisTalked;
    ev=event(C,key,partnerEnds?'상대가 꺼낸 마지막 이야기':'더 미루기 어려운 대화',partnerEnds?P.end:P.concern,partnerEnds?['알겠어. 네 결정을 존중할게. 그동안 고마웠어.','상처 줘서 미안해. 네 마음을 바꾸라고 하진 않을게.']:['오늘은 시간 내서 얘기하자. 네가 서운했던 일부터 듣고 싶어.','지금은 그 얘기까지 할 여유 없어. 다음에 하자.','우리 서로 힘든 것 같아. 여기서 그만하자.'],partnerEnds?['내 마음 들어줘서 고마워. 서로 잘 지냈으면 해.','사과는 들었어. 그래도 내 결정은 같아. 잘 지내.']:['오늘 내 얘기를 끝까지 들어줘서 고마워. 이번엔 같이 해보자.','지난번에도 기다렸어. 이번에도 그러면 난 더 기다리기 어려워.',P.end],{channel:endpoint,partnerEnds});
  }
  if(key==='followup'&&remote&&!forceRemote){ev.a[0]='일정 비워뒀어. 이번엔 직접 만나자. 이동 일정도 맞추자.';ev.reply[0]='좋아. 우리 둘 다 되는 날로 정하자. 얼굴 보고 얘기할 수 있겠다.';ev.meeting={picks:[0],place:3,scene:'reunion',remote:false,lines:[...arrival(C),...visitConversation(C,'walk')]};ev.script={before:[],after:ev.reply.map((reply,i)=>i===0?[]:aftermath(r.region,key,i,reply,true))};}
  if(!ev)return null;
  if(key==='outing'&&remote&&!forceRemote)visitMeeting(C,ev);
  ev.remote=remote;
  if(!ev.meeting){
    const before=remote?[]:[['n','둘만의 시간을 내어 마주 앉았다. 이번에는 미뤄두었던 이야기를 꺼냈다.','neutral'],['f',key==='crisis'?P.concern:'오늘은 이 얘기를 그냥 넘기고 싶지 않아.','neutral']];
    if(visiting)before.unshift(...arrival(C));
    ev.script={before,after:ev.reply.map((reply,i)=>[...aftermath(r.region,key,i,reply,remote,ev.partnerEnds),...(visiting?[['n','방문을 마치고 다시 각자의 도시로 돌아갔다. 짧은 만남 뒤에도 서로의 대답은 분명하게 남았다.','neutral',false]]:[])])};
    if(['confession','proposal'].includes(key)&&!remote){
      if(key==='confession'){
        ev.questionCG={key,expression:'tense'};
        before.slice(-1).forEach(line=>{line[5]=key;line[6]='tense';});
      }
      const expressions=key==='confession'?['surprised','surprised','happy']:['surprised','surprised','tearful','tearful','happy'];
      ev.script.after[0].forEach((line,i)=>{line[5]=key;line[6]=expressions[Math.min(i,expressions.length-1)];});
    }
  }
  return ev;
}
export function applyRelationship(C,id,pick){
  const r=ensureRelationship(C),key=String(id||'').split(':')[1];
  if(!r||!String(id).startsWith('friend:')||!['debut','outing','confession','foreign','future','proposal','followup','crisis','visit'].includes(key))return null;
  if(key==='debut'&&r.done.includes('debut')||key!=='debut'&&r.prepAge===C.age||r.records.some(x=>x.age===C.age&&x.id===id))return null;
  const legacyChoice=r.legacyPendingChoice?.id===id&&r.legacyPendingChoice.age===C.age;
  const ev=relationshipEvent(C,id,!!legacyChoice);if(!ev||!Number.isInteger(pick)||!ev.a[pick])throw new Error('relationship pick');
  if(key==='visit'){
    if(!['confession','proposal'].includes(ev.visitFor))throw new Error('방문할 이벤트가 없어요.');
    if(pick===0){r.visit={age:C.age,key:ev.visitFor};change(C,0,'서로 가능한 방문 일정을 함께 정했다');}
    else {delete r.visit;change(C,0,'방문 일정을 무리하게 정하지 않고 다시 맞추기로 했다');}
    remember(C,id,pick);return r.name+' · '+ev.reply[pick];
  }
  if(ev.id!==id)throw new Error('먼저 방문 일정을 함께 정해 주세요.');
  if(!legacyChoice&&key==='confession'&&(C.age<18||r.affinity<RULES.confession))throw new Error('고백할 만큼 가까워지지 않았어요.');
  if(!legacyChoice&&key==='proposal'&&(r.status!=='dating'||r.affinity<RULES.proposal||C.age-(r.datingAge??C.age)<2||!r.futureAgreement))throw new Error('결혼 계획을 먼저 함께 정해 주세요.');
  if(!r.done.includes(key))r.done.push(key);if(!['followup','crisis'].includes(key))r.lastAge=C.age;
  let delta=0,reason='서로의 생각을 솔직하게 나눴다';
  if(key==='debut'){delete r.pendingDebut;delta=pick===0?6:0;}
  if(key==='outing')delta=pick===0?6:0;
  if(key==='confession'){
    if(pick===0){delta=8;r.status='dating';r.datingAge=C.age;if(isDistant(C))promise(C);}
    else {r.status='friend';r.confessionDeclined=true;}
  }
  if(key==='foreign'){
    if(pick===0){delta=5;promise(C);}
    if(pick===1){delta=5;r.moveDiscussion={age:C.age,nation:C.club?.nat};}
    if(pick===2)endRelationship(C);
    delete r.foreign;
  }
  if(key==='future'){
    r.lastFutureAge=C.age;
    if(pick===0){delta=8;r.goalSupport++;r.futureAgreement=true;r.futurePlan=ev.canMove?'together':'independent';if(ev.canMove)r.residence=C.club.nat;}
    if(pick===1){delta=3;r.futureAgreement=true;r.futurePlan='distance';promise(C);}
    if(pick===2){delta=PROFILES[r.region].ignore;reason='상대의 계획을 빼고 생활을 결정하려 했다';}
    delete r.moveDiscussion;
  }
  if(key==='proposal'){
    r.proposalAskedAge=C.age;
    if(pick===0){delta=10;r.status='married';r.marriedAge=C.age;}
  }
  if(key==='followup'){
    if(pick===0){delta=8;r.fulfilledPromises=(r.fulfilledPromises||0)+1;r.unresolved=Math.max(0,r.unresolved-1);delete r.promise;reason='약속한 시간을 실제로 함께 보냈다';}
    if(pick===1){delta=3;promise(C);reason='사정을 미리 설명하고 약속을 함께 조정했다';}
    if(pick===2){delta=PROFILES[r.region].broken;r.brokenPromises++;r.unresolved++;promise(C);reason='설명 없이 중요한 약속을 다시 미뤘다';}
  }
  if(key==='crisis'){
    if(ev.partnerEnds||pick===2)endRelationship(C);
    else if(pick===0){delta=10;r.unresolved=0;r.crisisTalked=false;promise(C);reason='시간을 내어 갈등을 풀고 약속을 함께 정했다';}
    else {delta=PROFILES[r.region].ignore;r.crisisTalked=true;reason='서운함을 이야기하려는 상대를 다시 외면했다';}
  }
  if(r.visit?.age===C.age&&r.visit.key===key){r.lastVisitAge=C.age;delete r.visit;}
  if(ev.meeting?.remote===false&&pick===0)r.lastVisitAge=C.age;
  delete r.legacyPendingChoice;
  change(C,delta,reason);remember(C,id,pick);return r.name+' · '+ev.reply[pick];
}
export function routineEvent(C,service=false){
  const r=ensureRelationship(C);if(!r)return null;
  if(r.status==='separated')return event(C,'daily:'+C.age,'각자의 일상','오늘은 나를 위해 시간을 보내기로 했다.',['친구와 연락하며 저녁을 보낸다.','혼자 좋아하는 일을 하며 쉰다.'],['편한 사람들과 이야기하며 저녁을 보냈다.','천천히 쉬고 나니 마음이 조금 가벼워졌다.'],{channel:'reflection',remote:false,deltas:[0,0]});
  const P=PROFILES[r.region],remote=service||isDistant(C),topic=service?0:(C.age-15)%6,romance=romantic(r),meet=!remote&&(topic===1||topic===4);
  const texts=[P.check,romance?'우리 이번 쉬는 날엔 같이 시간 보낼까?\n둘이 얘기할 시간이 있으면 좋겠어.':P.meet,P.photo,P.goalTalk,P.meet,P.check];
  let d=service?'지금 연락할 수 있는 시간이야?\n몸은 괜찮아? 가능할 때 네 얘기 들려줘.':remote?topic===3?P.goalTalk:P.distance:texts[topic];
  let a,reply,deltas;
  if(meet){a=['좋아. 오늘 같이 시간 보내자.','오늘은 쉬고 싶어. 사정 얘기하고 다음에 보자.'];reply=['좋아. 만나서 얘기하자.','알겠어. 푹 쉬어. 사정 알려줘서 고마워.'];deltas=[6,0];}
  else if(topic===3){a=['그거 좋다. 네가 원하는 생활도 중요하지. 내 생각도 얘기해줄게.','난 네가 내 일정에 맞춰줬으면 좋겠는데.'];reply=[P.welcome[1],P.future];deltas=[5,P.ignore];}
  else {a=[remote?'응. 지금 괜찮아. 너는 오늘 어땠어?':'난 잘 지내. 너는 오늘 어땠어?','지금은 팀 일정 중이야. 끝나고 얘기할 수 있을까?'];reply=[{asia:'난 잘 지내. 네 얘기 들으니까 좀 안심되네ㅋㅋ',south:'나도 할 얘기 많아. 네가 먼저 물어봐주니까 좋다.',africa:'좋아. 내 얘기도 할게. 우리 근황 맞춰보자ㅋㅋ',europe:'응. 나도 잘 지내. 이렇게 얘기하니까 좋네.'}[r.region],'응. 끝나고 가능한 시간 알려줘. 그때 얘기하자.'];deltas=[4,0];}
  const ev=event(C,'daily:'+C.age,service?'복무 중 짧은 연락':topic===3?'각자 그리고 싶은 생활':remote?'멀리서 나누는 하루':meet?'둘이 보내는 쉬는 날':'오늘의 연락',d,a,reply,{channel:'message',remote,deltas,goalTopic:topic===3});
  if(!service&&remote&&(topic===1||topic===4)){ev.t='다음에 얼굴 보자';ev.deltas=[6,0];visitMeeting(C,ev,topic===4?'dinner':'walk');}
  if(meet)ev.meeting={place:topic===4?2:3,scene:'personal:'+topic,lines:conversation(r.region,topic===4?'dinner':'walk',false,r.status)};
  return ev;
}
export function applyRoutine(C,ev,pick){
  const r=ensureRelationship(C);if(!Number.isInteger(pick)||!ev.a[pick]||r.prepAge===C.age)throw new Error('daily pick');
  change(C,ev.deltas[pick],ev.channel==='reflection'?'각자의 일상을 보냈다':ev.goalTopic&&pick===1?'상대의 목표보다 내 계획만 앞세웠다':ev.deltas[pick]>0?'서로를 위해 시간을 내고 관심을 나눴다':'사정을 솔직하게 설명하고 서로의 시간을 존중했다');
  if(ev.goalTopic&&pick===0)r.goalSupport++;
  if(ev.meeting?.remote===false&&pick===0)r.lastVisitAge=C.age;
  r.prepAge=C.age;r.lastRoutine={id:ev.id,pick};remember(C,ev.id,pick);
  if(romantic(r)&&isDistant(C)&&!r.promise&&!r.moveDiscussion)promise(C);
}
export function relationshipSeasonMessage(C,row){
  const r=ensureRelationship(C);if(!r||r.status==='separated'||C.age%4!==0)return null;
  return r.name+' · '+({asia:'시즌 끝났다며. 밥 잘 챙겨 먹고 시간 나면 연락해ㅋㅋ',south:'시즌 끝났네! 수고했어. 네 목소리로 얘기 듣고 싶어.',africa:'수고했어. 이번엔 네 얘기 듣고 내 근황도 들려줄게.',europe:'수고했어. 정리하고 쉬어. 시간 맞으면 얘기하자.'}[r.region]);
}
