// Small relationship layer; progression and choices are signed by the career API.
function crFriendPortrait(r){
  if(!r||['asia','south','africa','europe'].indexOf(r.id)<0)return '';
  return '<span class="cr-friend-face" role="img" aria-label="'+gmEsc(r.name)+'의 도트 초상" style="background-image:url(/img/career-friends/'+r.id+'.png)"></span>';
}
function crFriendPanel(p){
  var r=p.relationship;if(!r)return '';
  return '<div class="cr-friend-status">'+crFriendPortrait(r)+'<span><b>'+gmEsc(r.name)+'</b><small>'+gmEsc(r.label)+'</small></span></div>';
}
function crFriendCard(r){
  if(!r)return '';
  var married=r.status==='married',year=r.marriedAge?2027+r.marriedAge-15:null;
  return '<div class="cr-hof-b cr-friend-card">'+crFriendPortrait(r)+'<div><small>'+(married?'함께 걸어온 사람':'그라운드 밖의 인연')+'</small><b>'+gmEsc(r.name)+' <em>'+gmEsc(r.label)+'</em></b><p>'+gmEsc(married?(year+'년 결혼 · 어릴 적 친구에서 평생의 동반자로.'):r.status==='dating'?'선수 생활을 함께 지켜본 연인.':r.status==='separated'?'각자의 길을 걷지만, 함께한 시간은 남았다.':'처음의 꿈을 기억하는 오래된 친구.')+'</p></div></div>';
}
function crFriendMessage(ev){
  crFriendPhone(ev,function(i){crFriendPick(i);});
}
function crFriendClosePhone(){
  var chat=CR.friendPhone;if(chat){chat.timers.forEach(clearTimeout);chat.el.remove();CR.friendPhone=null;}
}
function crFriendPhone(ev,chosen){
  crFriendClosePhone();var r=ev.friend,el=document.createElement('div');
  el.id=CR.friendScene?.debut?'crFriendDebutMessage':'crFriendPhone';el.className='cr-friend-overlay cr-friend-phone-overlay';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label',r.name+'와 메시지');
  el.innerHTML='<section class="cr-friend-device"><div class="cr-friend-phone-status"><b>18:24</b><span aria-hidden="true">●●● ▰</span></div><div class="cr-friend-phone-camera" aria-hidden="true"></div><header><span class="back" aria-hidden="true">‹</span>'+crFriendPortrait(r)+'<div><b>'+gmEsc(r.name)+'</b><small>메시지</small></div></header><div class="cr-friend-history" id="crFriendHistory" aria-live="polite"><small class="date">'+gmEsc(ev.t)+'</small></div><div class="cr-friend-options" id="crFriendOptions"></div><div class="cr-friend-home-indicator" aria-hidden="true"></div></section>';
  document.body.appendChild(el);
  var chat=CR.friendPhone={el:el,timers:[],picked:false,flush:null},history=el.querySelector('#crFriendHistory'),options=el.querySelector('#crFriendOptions');
  history.onclick=function(){if(chat.flush)chat.flush();};
  function bubble(text,mine){
    var row=document.createElement('div');row.className='cr-friend-chat-line'+(mine?' mine':'');
    var p=document.createElement('p');p.textContent=text;var stamp=document.createElement('small');stamp.textContent=mine?'전송됨':'18:24';row.append(p,stamp);history.append(row);history.scrollTop=history.scrollHeight;return stamp;
  }
  function incoming(lines,done){
    var at=0,typing=null,finished=false;
    var finish=function(){if(finished||CR.friendPhone!==chat)return;finished=true;typing?.remove();chat.flush=null;done();};
    chat.flush=function(){chat.timers.forEach(clearTimeout);typing?.remove();while(at<lines.length)bubble(lines[at++],false);finish();};
    function step(){
      if(CR.friendPhone!==chat)return;
      if(at>=lines.length)return finish();
      if(matchMedia('(prefers-reduced-motion: reduce)').matches){while(at<lines.length)bubble(lines[at++],false);return finish();}
      typing=document.createElement('div');typing.className='cr-friend-typing';typing.setAttribute('aria-label','입력 중');typing.innerHTML='<i></i><i></i><i></i>';history.append(typing);history.scrollTop=history.scrollHeight;
      chat.timers.push(setTimeout(function(){if(CR.friendPhone!==chat)return;typing.remove();bubble(lines[at++],false);chat.timers.push(setTimeout(step,180));},Math.min(1000,350+lines[at].length*20)));
    }
    step();
  }
  incoming(ev.d.split('\n').filter(Boolean),function(){
    var prompt=document.createElement('small');prompt.className='cr-friend-reply-label';prompt.textContent='답장 선택';options.append(prompt);
    ev.a.forEach(function(text,i){
      var b=document.createElement('button');b.className='cr-friend-option';b.textContent=text;b.onclick=function(){
        if(chat.picked)return;chat.picked=true;options.replaceChildren();var stamp=bubble(text,true);
        incoming(ev.replies[i].split('\n').filter(Boolean),function(){
          stamp.textContent='읽음 · 18:25';var go=document.createElement('button');go.className='cr-friend-option go';go.textContent=i===0&&(ev.meeting||['friend:outing','friend:debut'].includes(ev.id))?'만나러 가기':CR.friendScene.intro?'시즌 준비로':'계속';
          go.onclick=function(){chosen(i);};options.append(go);go.focus();
        });
      };options.append(b);
    });
  });
}
function crFriendPick(i){
  var C=CR.friendScene;if(!C||C.pick!=null||!C.ev.a[i])return;
  C.pick=i;
  if(C.intro||C.ev.channel==='message'&&(!C.ev.meeting||i!==0)||i===1&&(C.ev.id==='friend:outing'||C.ev.id==='friend:debut'))return crFriendFinish();
  crFriendClosePhone();
  crFriendRemoveScene();
  var key=C.ev.id.split(':')[1],reply=C.ev.replies[i],beats=[];
  if(C.ev.channel==='reflection'){
    beats=[{place:3,outfit:0,who:'',text:reply}];
  }else if(C.ev.meeting){
    beats=[{place:C.ev.meeting.place,outfit:C.ev.friend.status==='dating'||C.ev.friend.status==='married'?1:0,who:C.ev.friend.name,text:C.ev.meeting.text}];
  }else if(i===0&&(key==='outing'||key==='debut')){
    beats=[{place:key==='debut'?1:2,outfit:key==='debut'?0:1,who:'',text:key==='debut'?'경기장 출구. 사람들 사이에서 먼저 손을 드는 얼굴이 보였다.':'약속한 카페. 문을 열자 익숙한 얼굴이 고개를 들었다.'},
      {place:key==='debut'?1:2,outfit:key==='debut'?0:1,who:C.ev.friend.name,text:key==='debut'?'왜 이렇게 늦게 나와. 나 다리 아파ㅋㅋ\n…그래도 기다리길 잘했다. 오늘 진짜 멋있었어.':'너 뭐 마실 거야?\n난 네가 맨날 먹던 거 시키려다가 기다렸어.'},
      {place:key==='debut'?1:2,outfit:key==='debut'?0:1,who:C.ev.friend.name,text:key==='debut'?'밥은 네가 사는 거지?\n일단 가자. 경기 얘기는 걸으면서 해.':'우리 맨날 보면서도 할 말은 계속 생긴다ㅋㅋ\n그래서, 요즘은 좀 어때?'}];
  }else beats=[{place:key==='proposal'||key==='confession'?3:key==='foreign'?1:2,outfit:1,who:C.ev.friend.name,text:reply}];
  crFriendSequence(beats,0);
}
function crFriendRemoveScene(){clearTimeout(CR.friendTimer);document.getElementById('crFriendScene')?.remove();}
function crFriendCancel(){crFriendRemoveScene();crFriendClosePhone();document.getElementById('crFriendDebutMessage')?.remove();CR.friendScene=null;}
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
  el.innerHTML='<div class="cr-friend-place" style="--place-x:'+(place%2)+';--place-y:'+Math.floor(place/2)+'"></div>'+(C.ev.channel==='reflection'?'':crFriendActor(r,outfit,(extra||'').indexOf('in-stands')>=0))+'<div class="cr-friend-scene-title">'+gmEsc(C.ev.t)+'</div><section class="cr-friend-scene-dialogue"><b>'+gmEsc(who||'')+'</b><p>'+gmEsc(text)+'</p><div id="crFriendSceneActions"></div></section>';
  document.body.appendChild(el);
  var actions=el.querySelector('#crFriendSceneActions');
  buttons.forEach(function(b){var btn=document.createElement('button');btn.className='cr-friend-option';btn.textContent=b.text;btn.onclick=b.run;actions.appendChild(btn);});
  return el;
}
function crFriendSequence(beats,index){
  var b=beats[index];crFriendStage(b.place,b.outfit,b.who,b.text,[{text:index<beats.length-1?'계속':CR.friendScene.debut?'시즌 계속':'시즌 준비로',run:function(){if(index<beats.length-1)crFriendSequence(beats,index+1);else crFriendFinish();}}]);
}
function crFriendShow(ev){
  CR.friendScene={ev:ev,pick:null,debut:false,intro:ev.id==='friend:intro'};
  crTovSet('',true);
  // A meeting is shown in its location; it is never just a promise in a chat window.
  var key=ev.id.split(':')[1],place=key==='proposal'||key==='confession'?3:key==='foreign'?1:2;
  if(ev.channel==='message'||key==='intro'||key==='outing'||key==='debut'){
    crFriendMessage(ev);return;
  }
  crTovSet('',true);
  crFriendStage(place,1,ev.channel==='reflection'?'':ev.friend.name,ev.d,ev.a.map(function(text,i){return {text:text,run:function(){crFriendPick(i);}};}));
}
function crFriendFinish(){
  var C=CR.friendScene;if(!C)return;
  if(C.saving)return;C.saving=true;
  var button=document.querySelector('#crFriendSceneActions button')||document.querySelector('#crFriendOptions button');if(button){button.disabled=true;button.textContent='진행 중…';}
  crApi(C.debut?'friend-debut':'friend-prep',{token:CR.tok,pick:C.pick}).then(function(v){
    if(CR.friendScene!==C)return;
    Object.assign(CR.v,v);CR.tok=v.token;crStore(CR.v);
    crFriendRemoveScene();crFriendClosePhone();document.getElementById('crFriendDebutMessage')?.remove();CR.friendScene=null;
    if(!C.debut){CR.evPick=null;return crShow(v);}
    if(CR.sf){CR.sf.friendBusy=false;if(CR.sf.v)CR.sf.v=CR.v;}
    C.resume();
  }).catch(function(e){C.saving=false;if(button){button.disabled=false;button.textContent='다시 시도';button.onclick=crFriendFinish;}gameToast(e.message);});
}
function crFriendDebutMessage(){
  crFriendRemoveScene();crFriendMessage(CR.friendScene.ev);
}
function crFriendDebutContext(resume){
  return {debut:true,pick:null,resume:resume,ev:{id:'friend:debut',t:'첫 1군 공식경기 · 경기 종료 직후',friend:CR.v.player.relationship,d:'아까 나 봤지?ㅋㅋ\n끝나고 왜 이렇게 안 나와\n나 아직 출구 쪽인데. 잠깐 볼래?',a:['응. 거기 있어. 금방 나갈게.','오늘은 팀 일정이 있어. 먼저 가. 다음에 보자.'],replies:['응 여기 있을게.\n천천히 나와.','아쉽다. 알겠어. 조심히 들어가.\n오늘 수고했어!']}};
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
