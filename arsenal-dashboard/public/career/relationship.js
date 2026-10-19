// Small relationship layer; progression and choices are signed by the career API.
function crFriendPortrait(r){
  if(!r||['asia','south','africa','europe'].indexOf(r.id)<0)return '';
  return '<span class="cr-friend-face" role="img" aria-label="'+gmEsc(r.name)+'의 도트 초상" style="background-image:url(/img/career-friends/'+r.id+'.png)"></span>';
}
function crFriendPanel(p){
  var r=p.relationship;if(!r)return '';
  if(p.age===15 && !p.seasons)return '<details class="cr-panel cr-friend-intro" open><summary>'+crFriendPortrait(r)+'<span><b>'+gmEsc(r.name)+'</b><small>새 메시지 · 소꿉친구</small></span></summary><div class="cr-friend-history"><p>유니폼 받았냐<br>입은 거 보내봐ㅋㅋ</p><p class="mine">왜 벌써 웃는데ㅋㅋ</p><p>아직 안 웃었거든?<br>프로경기 처음 뛰면 나 불러. 보러 갈 거니까.</p><p class="mine">알겠어ㅋㅋ 약속.</p></div></details>';
  return '<div class="cr-friend-status">'+crFriendPortrait(r)+'<span><b>'+gmEsc(r.name)+'</b><small>'+gmEsc(r.label)+'</small></span></div>';
}
function crFriendCard(r){
  if(!r)return '';
  var married=r.status==='married',year=r.marriedAge?2027+r.marriedAge-15:null;
  return '<div class="cr-hof-b cr-friend-card">'+crFriendPortrait(r)+'<div><small>'+(married?'함께 걸어온 사람':'그라운드 밖의 인연')+'</small><b>'+gmEsc(r.name)+' <em>'+gmEsc(r.label)+'</em></b><p>'+gmEsc(married?(year+'년 결혼 · 어릴 적 친구에서 평생의 동반자로.'):r.status==='dating'?'선수 생활을 함께 지켜본 연인.':r.status==='separated'?'각자의 길을 걷지만, 함께한 시간은 남았다.':'처음의 꿈을 기억하는 오래된 친구.')+'</p></div></div>';
}
function crFriendMessage(ev){
  var r=ev.friend;
  crTovSet('<div class="cr-friend-overlay" role="dialog" aria-modal="true" aria-label="'+gmEsc(ev.t)+'"><section class="cr-friend-chat"><header>'+crFriendPortrait(r)+'<div><b>'+gmEsc(r.name)+'</b><small>'+gmEsc(r.label)+'</small></div></header><div class="cr-friend-history" id="crFriendHistory" aria-live="polite"><small class="date">'+gmEsc(ev.t)+'</small>'+ev.d.split('\n').map(function(line){return '<p>'+gmEsc(line)+'</p>';}).join('')+'</div><div class="cr-friend-options" id="crFriendOptions">'+ev.a.map(function(t,i){return '<button class="cr-friend-option" onclick="crFriendPick('+i+')">'+gmEsc(t)+'</button>';}).join('')+'</div></section></div>');
}
function crFriendPick(i){
  var C=CR.friendScene;if(!C||C.pick!=null||!C.ev.a[i])return;
  C.pick=i;if(!C.debut)CR.evPick=i;
  crFriendRemoveScene();
  var key=C.ev.id.split(':')[1],reply=C.ev.replies[i],beats=[];
  if(i===0&&(key==='outing'||key==='debut')){
    beats=[{place:key==='debut'?1:2,outfit:key==='debut'?0:1,who:'',text:key==='debut'?'경기장 출구. 사람들 사이에서 먼저 손을 드는 얼굴이 보였다.':'약속한 카페. 문을 열자 익숙한 얼굴이 고개를 들었다.'},
      {place:key==='debut'?1:2,outfit:key==='debut'?0:1,who:C.ev.friend.name,text:key==='debut'?'왜 이렇게 늦게 나와. 나 다리 아파ㅋㅋ\n…그래도 기다리길 잘했다. 오늘 진짜 멋있었어.':'너 뭐 마실 거야?\n난 네가 맨날 먹던 거 시키려다가 기다렸어.'},
      {place:key==='debut'?1:2,outfit:key==='debut'?0:1,who:C.ev.friend.name,text:key==='debut'?'밥은 네가 사는 거지?\n일단 가자. 경기 얘기는 걸으면서 해.':'우리 맨날 보면서도 할 말은 계속 생긴다ㅋㅋ\n그래서, 요즘은 좀 어때?'}];
  }else beats=[{place:key==='proposal'||key==='confession'?3:key==='foreign'?1:2,outfit:1,who:C.ev.friend.name,text:reply}];
  crFriendSequence(beats,0);
}
function crFriendRemoveScene(){clearTimeout(CR.friendTimer);document.getElementById('crFriendScene')?.remove();}
function crFriendCancel(){crFriendRemoveScene();document.getElementById('crFriendDebutMessage')?.remove();CR.friendScene=null;}
var CR_FRIEND_ACTORS={asia:[9.95,50.55,92.11],south:[11.50,50.14,90.01],africa:[11.59,51.23,87.36],europe:[16.56,50.82,86.68]};
function crFriendActor(r,outfit,greeting){
  var positions=CR_FRIEND_ACTORS[r.id];if(!positions)return '';
  var pose=greeting?1:outfit?2:0;
  // Each approved woman has her own source. No shared generated face/body atlas.
  return '<div class="cr-friend-actor" role="img" data-character="'+r.id+'" data-pose="'+pose+'" aria-label="'+gmEsc(r.name)+'의 '+['일상복','미소 짓는','데이트복'][pose]+' 전신 도트" style="background-image:url(/img/career-friends/actor-'+r.id+'-v3.png);--actor-position:'+positions[pose]+'%"></div>';
}
function crFriendStage(place,outfit,who,text,buttons,extra){
  crFriendRemoveScene();var C=CR.friendScene,r=C.ev.friend;
  var el=document.createElement('div');el.id='crFriendScene';el.className='cr-friend-scene '+(extra||'');el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label',C.ev.t);
  el.innerHTML='<div class="cr-friend-place" style="--place-x:'+(place%2)+';--place-y:'+Math.floor(place/2)+'"></div>'+crFriendActor(r,outfit,(extra||'').indexOf('in-stands')>=0)+'<div class="cr-friend-scene-title">'+gmEsc(C.ev.t)+'</div><section class="cr-friend-scene-dialogue"><b>'+gmEsc(who||'')+'</b><p>'+gmEsc(text)+'</p><div id="crFriendSceneActions"></div></section>';
  document.body.appendChild(el);
  var actions=el.querySelector('#crFriendSceneActions');
  buttons.forEach(function(b){var btn=document.createElement('button');btn.className='cr-friend-option';btn.textContent=b.text;btn.onclick=b.run;actions.appendChild(btn);});
  return el;
}
function crFriendSequence(beats,index){
  var b=beats[index];crFriendStage(b.place,b.outfit,b.who,b.text,[{text:index<beats.length-1?'계속':CR.friendScene.debut?'시즌 계속':'시즌 준비로',run:function(){if(index<beats.length-1)crFriendSequence(beats,index+1);else crFriendFinish();}}]);
}
function crFriendShow(ev){
  CR.friendScene={ev:ev,pick:null,debut:false};
  // A meeting is shown in its location; it is never just a promise in a chat window.
  var key=ev.id.split(':')[1],place=key==='proposal'||key==='confession'?3:key==='foreign'?1:2;
  if(key==='outing'||key==='debut'){
    crFriendMessage(ev);return;
  }
  crTovSet('',true);
  crFriendStage(place,1,ev.friend.name,ev.d,ev.a.map(function(text,i){return {text:text,run:function(){crFriendPick(i);}};}));
}
function crFriendFinish(){
  var C=CR.friendScene;if(!C)return;
  if(!C.debut){crFriendRemoveScene();CR.friendScene=null;crTovSet('',true);return crPrep();}
  if(C.saving)return;C.saving=true;
  var button=document.querySelector('#crFriendSceneActions button')||document.querySelector('#crFriendOptions button');if(button){button.disabled=true;button.textContent='진행 중…';}
  crApi('friend-debut',{token:CR.tok,pick:C.pick}).then(function(v){
    if(CR.friendScene!==C)return;
    Object.assign(CR.v,v);CR.tok=v.token;crStore(CR.v);
    crFriendRemoveScene();document.getElementById('crFriendDebutMessage')?.remove();CR.friendScene=null;
    if(CR.sf){CR.sf.friendBusy=false;if(CR.sf.v)CR.sf.v=CR.v;}
    C.resume();
  }).catch(function(e){C.saving=false;if(button){button.disabled=false;button.textContent='다시 시도';}gameToast(e.message);});
}
function crFriendDebutMessage(){
  crFriendRemoveScene();var C=CR.friendScene,r=C.ev.friend;
  var el=document.createElement('div');el.id='crFriendDebutMessage';el.className='cr-friend-overlay';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','첫 경기 후 연락');
  el.innerHTML='<section class="cr-friend-chat"><header>'+crFriendPortrait(r)+'<div><b>'+gmEsc(r.name)+'</b><small>경기 종료 직후</small></div></header><div class="cr-friend-history"><p>아까 나 봤지?ㅋㅋ</p><p>끝나고 왜 이렇게 안 나와</p><p>나 아직 출구 쪽인데. 잠깐 볼래?</p></div><div class="cr-friend-options" id="crFriendOptions"></div></section>';
  document.body.appendChild(el);
  C.ev.a.forEach(function(text,i){var b=document.createElement('button');b.className='cr-friend-option';b.textContent=text;b.onclick=function(){el.remove();crFriendPick(i);};el.querySelector('#crFriendOptions').appendChild(b);});
}
function crFriendDebutContext(resume){
  return {debut:true,pick:null,resume:resume,ev:{id:'friend:debut',t:'첫 1군 공식경기',friend:CR.v.player.relationship,d:'',a:['응. 거기 있어. 금방 나갈게.','오늘은 팀 일정이 있어. 먼저 가. 다음에 보자.'],replies:['나 여기!\n수고했어. 오늘 진짜 멋있었어.','아쉽다. 알겠어. 조심히 들어가.\n오늘 수고했어!']}};
}
function crFriendMatch(m,play,resume){
  var S=CR.sf,r=CR.v.player.relationship;
  if(!S||!r?.pendingDebut||S.friendSeen||!m.pl||S.n.apps!==0)return false;
  S.friendSeen=true;S.friendBusy=true;CR.friendScene=crFriendDebutContext(resume);
  var found=false;
  var reveal=function(){if(!CR.friendScene?.debut)return;clearTimeout(CR.friendTimer);found=true;crFriendStage(0,0,r.name,'여기! 나 여기 있어!',[{text:'그라운드로',run:function(){play();crFriendDebutMessage();}}],'found in-stands');};
  crFriendStage(0,0,'','입장 직전, 관중석 쪽으로 고개를 돌렸다.\n어디쯤이라고 했더라…',[{text:'관중석 살펴보기',run:reveal}],'searching in-stands');
  CR.friendTimer=setTimeout(function(){if(!found)reveal();},matchMedia('(prefers-reduced-motion: reduce)').matches?0:2000);
  return true;
}
function crFriendResumeDebut(){
  if(!CR.v.player.relationship?.pendingDebut||CR.friendScene)return false;
  CR.friendScene=crFriendDebutContext(function(){crResult();});
  crFriendDebutMessage();return true;
}
