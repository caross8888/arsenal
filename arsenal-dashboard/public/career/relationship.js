// Small relationship layer; progression and choices are signed by the career API.
// One active line: the first tap completes it; a later tap may advance it.
function crFriendStopTyping(){
  if(CR.friendTyping)CR.friendTyping.cancel();
}
function crFriendType(target,text,done,scroll){
  crFriendStopTyping();
  var letters=typeof Intl.Segmenter==='function'?Array.from(new Intl.Segmenter('ko',{granularity:'grapheme'}).segment(text),function(x){return x.segment;}):Array.from(text);
  var span=document.createElement('span');span.className='cr-friend-reveal-text';
  target.replaceChildren(span);target.classList.add('cr-friend-reveal');target.dataset.fullText=text;
  var at=0,timer=null,ended=false,read;
  function finish(){
    if(ended)return;ended=true;clearTimeout(timer);span.textContent=text;
    if(CR.friendTyping===read)CR.friendTyping=null;
    if(scroll)scroll();done();
  }
  read={target:target,flush:finish,cancel:function(){ended=true;clearTimeout(timer);if(CR.friendTyping===read)CR.friendTyping=null;}};
  CR.friendTyping=read;
  function step(){
    if(ended)return;if(!target.isConnected){read.cancel();return;}
    span.textContent+=letters[at++];if(scroll)scroll();
    if(at>=letters.length)return finish();
    timer=setTimeout(step,/[.!?…。！？]/.test(letters[at-1])?130:28);
  }
  if(!letters.length||matchMedia('(prefers-reduced-motion:reduce)').matches)finish();else step();
  return read;
}
function crFriendRead(target,text,actions,buttons,surface,scroll){
  var ready=false,read,hint=actions.parentNode.querySelector('.cr-friend-read-hint');
  if(!hint){hint=document.createElement('small');hint.className='cr-friend-read-hint';actions.before(hint);}
  hint.textContent='터치하여 전체 보기';
  actions.replaceChildren();actions.classList.add('is-reading');actions.inert=true;actions.setAttribute('aria-hidden','true');
  buttons.forEach(function(b){var btn=document.createElement('button');btn.className='cr-friend-option'+(actions.id==='crFriendOptions'?' go':'');btn.textContent=b.text;btn.onclick=function(){if(!ready)read.flush();else b.run();};actions.appendChild(btn);});
  function advance(e){
    if(e.target.closest('button'))return;
    if(e.type==='keydown'){if(!['Enter',' '].includes(e.key))return;e.preventDefault();}
    if(!ready){read.flush();return;}
    if(buttons.length===1)buttons[0].run();
  }
  surface.onclick=advance;target.tabIndex=0;target.onkeydown=advance;
  read=crFriendType(target,text,function(){ready=true;actions.classList.remove('is-reading');actions.inert=false;actions.removeAttribute('aria-hidden');hint.textContent=buttons.length===1?'터치하여 계속':'대답을 골라 주세요';},scroll);
}
function crFriendPortrait(r){
  if(!r||['asia','south','africa','europe'].indexOf(r.id)<0)return '';
  return '<span class="cr-friend-face" role="img" aria-label="'+gmEsc(r.name)+'의 도트 초상" style="background-image:url(/img/career-friends/'+r.id+'.png)"></span>';
}
function crFriendPanel(p){
  var r=p.relationship;if(!r)return '';
  return '<details class="cr-friend-profile"><summary class="cr-friend-status">'+crFriendPortrait(r)+'<span><b>'+gmEsc(r.name)+'</b><small>'+gmEsc(r.label)+(r.longDistance?' · 장거리':'')+'</small></span>'+(r.affinity!=null?'<span class="cr-friend-affinity"><b>호감도 '+r.affinity+' / '+(r.affinityMax||100)+'</b><progress max="100" value="'+r.affinity+'"></progress></span>':'')+'</summary><div class="cr-friend-profile-body"><p>'+gmEsc(r.personality||'')+'</p><p><b>바라는 삶</b> '+gmEsc(r.goal||'')+'</p>'+(r.lastChange?'<p>'+gmEsc(r.lastChange.reason)+' <b>'+(r.lastChange.delta>0?'+':'')+r.lastChange.delta+'</b></p>':'')+'</div></details>';
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
  var chat=CR.friendPhone;if(chat){if(CR.friendTyping&&chat.el.contains(CR.friendTyping.target))crFriendStopTyping();chat.timers.forEach(clearTimeout);chat.el.remove();CR.friendPhone=null;}
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
          stamp.textContent='읽음 · 18:25';var go=document.createElement('button');go.className='cr-friend-option go';go.textContent=crFriendIsMeeting(ev,i)?(ev.meeting?.remote===false?'방문 날짜로 이동':ev.remote?'대화 이어가기':'만나러 가기'):ev.id==='friend:visit'&&i===0?'방문 날짜로 이동':ev.id==='friend:vacation-plan'&&!!ev.destinations[i]?'여행 날짜로 이동':CR.friendScene.intro?'시즌 준비로':'계속';
          go.onclick=function(){chosen(i);};options.append(go);go.focus();
        });
      };options.append(b);
    });
  });
}
function crFriendRemoteStage(who,text,buttons,visual){
  var C=CR.friendScene,chat=CR.friendPhone;
  if(!chat||!chat.story){
    crFriendClosePhone();var el=document.createElement('div');el.id='crFriendPhone';el.className='cr-friend-overlay cr-friend-phone-overlay';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label',C.ev.friend.name+'와 원거리 대화');
    el.innerHTML='<section class="cr-friend-device"><div class="cr-friend-phone-status"><b>18:24</b><span>●●● ▰</span></div><div class="cr-friend-phone-camera" aria-hidden="true"></div><header>'+crFriendPortrait(C.ev.friend)+'<div><b>'+gmEsc(C.ev.friend.name)+'</b><small>멀리서 나누는 대화</small></div></header><div class="cr-friend-history" id="crFriendHistory" aria-live="polite"></div><div class="cr-friend-options" id="crFriendOptions"></div><div class="cr-friend-home-indicator"></div></section>';
    document.body.appendChild(el);chat=CR.friendPhone={el:el,timers:[],story:true};
  }
  var history=chat.el.querySelector('#crFriendHistory'),row=document.createElement('div'),body=document.createElement('p');
  row.className='cr-friend-chat-line'+(who==='나'?' mine':'')+(!who?' narration':'');body.textContent=text;row.appendChild(body);history.appendChild(row);history.scrollTop=history.scrollHeight;
  var actions=chat.el.querySelector('#crFriendOptions');
  crFriendRead(body,text,actions,buttons,history,function(){history.scrollTop=history.scrollHeight;});
  return chat.el;
}
function crFriendIsMeeting(ev,pick){
  return ev.meeting?(ev.meeting.picks||[0]).indexOf(pick)>=0:pick===0&&['friend:outing','friend:debut'].includes(ev.id);
}
function crFriendPick(i){
  var C=CR.friendScene;if(!C||C.pick!=null||!C.ev.a[i])return;
  C.pick=i;
  if(C.intro||C.ev.channel==='message'&&!crFriendIsMeeting(C.ev,i)&&!C.ev.script?.after?.[i]?.length||i===1&&(C.ev.id==='friend:outing'||C.ev.id==='friend:debut'))return crFriendFinish();
  if(crFriendIsMeeting(C.ev,i)&&C.ev.meeting?.remote===false)C.ev.remote=false;
  var hadPhone=!!CR.friendPhone;
  if(C.ev.remote&&hadPhone){CR.friendPhone.story=true;CR.friendPhone.flush=null;}else crFriendClosePhone();
  var key=C.ev.id.split(':')[1],reply=C.ev.replies[i],beats=[];
  if(C.ev.channel==='reflection')beats=[{place:3,outfit:0,who:'',text:reply,hide:true}];
  else if(C.ev.meeting&&crFriendIsMeeting(C.ev,i))beats=crFriendMeetingBeats(C.ev);
  else {
    var story=C.ev.script||CR_FRIEND_MAJOR[key],place=C.ev.place??(key==='proposal'||key==='confession'?3:key==='foreign'||key==='debut'?1:2),outfit=key==='debut'?0:1;
    beats=story&&story.after[i].length?crFriendBeats(story.after[i],place,outfit):crFriendBeats([['f',reply,'neutral'],['n','인사를 나누고 각자의 길로 돌아갔다.','neutral',false]],place,outfit);
    if(C.ev.channel==='scene'&&key!=='debut')beats.unshift({place:place,outfit:outfit,who:'나',text:C.ev.a[i],mood:'neutral',speaker:'p'});
  }
  if(C.ev.remote&&hadPhone&&beats[0]?.speaker==='f'&&beats[0].text===C.ev.replies[i])beats.shift();
  crFriendSequence(beats,0);
}
function crFriendRemoveScene(){crFriendStopTyping();clearTimeout(CR.friendTimer);(CR.friendCinematicTimers||[]).forEach(clearTimeout);CR.friendCinematicTimers=[];document.getElementById('crFriendScene')?.remove();}
function crFriendCancel(){crFriendRemoveScene();crFriendClosePhone();document.getElementById('crFriendDebutMessage')?.remove();CR.friendScene=null;}
var CR_FRIEND_ACTORS={asia:[9.95,50.55,92.11],south:[11.50,50.14,90.01],africa:[11.59,51.23,87.36],europe:[16.56,50.82,86.68]};
function crFriendActor(r,outfit,greeting,mood){
  var holiday=CR.friendScene?.ev.wardrobe;
  if(holiday){var frame=(holiday==='ski'?2:0)+(['happy','shy'].includes(mood)?1:0);return '<div class="cr-friend-actor reactions vacation" role="img" data-character="'+r.id+'" data-outfit="'+holiday+'" data-pose="'+frame+'" aria-label="'+gmEsc(r.name)+(holiday==='ski'?'의 스키복':'의 해변 수영복')+'" style="background-image:url(/img/career-friends/vacation-'+r.id+'-v1.png);--actor-position:'+frame*100/3+'%"></div>';}
  var positions=CR_FRIEND_ACTORS[r.id];if(!positions)return '';
  mood=mood||(greeting?'happy':'neutral');
  var pose=greeting||mood==='happy'?1:0,date=!!outfit;
  var frame={neutral:0,happy:1,shy:2,sad:3}[mood]||0;
  var url=date?'reactions-'+r.id+'-v1.png':'actor-'+r.id+'-v3.png';
  var description={neutral:'차분한',happy:'웃는',shy:'쑥스러운',sad:'슬픈'}[mood];
  return '<div class="cr-friend-actor'+(date?' reactions':'')+'" role="img" data-character="'+r.id+'" data-pose="'+(date?frame:pose)+'" data-mood="'+mood+'" data-outfit="'+(date?'date':'casual')+'" aria-label="'+gmEsc(r.name)+'의 '+description+' 표정과 자세" style="background-image:url(/img/career-friends/'+url+');--actor-position:'+(date?frame*100/3:positions[pose])+'%"></div>';
}
function crFriendStage(place,outfit,who,text,buttons,extra,visual){
  if(visual?.cg)return crFriendStoryCG(who,text,buttons,visual);
  if(document.getElementById('crFriendScene')?.classList.contains('cr-friend-story-cg'))crFriendRemoveScene();
  if(CR.friendScene.ev.remote||visual?.remote){if(visual?.remote)crFriendRemoveScene();return crFriendRemoteStage(who,text,buttons,visual);}
  clearTimeout(CR.friendTimer);var C=CR.friendScene,r=C.ev.friend,v=visual||{};
  var el=document.getElementById('crFriendScene');
  if(!el){
    el=document.createElement('div');el.id='crFriendScene';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');
    el.innerHTML='<div class="cr-friend-place"></div><div class="cr-friend-cast"></div><div class="cr-friend-scene-title"></div><section class="cr-friend-scene-dialogue"><b></b><p></p><div id="crFriendSceneActions"></div></section>';
    document.body.appendChild(el);
  }
  el.className='cr-friend-scene '+(extra||'')+(v.speaker==='p'?' speaker-player':'');el.setAttribute('aria-label',C.ev.t);
  el.querySelector('.cr-friend-place').style.cssText=C.ev.wardrobe?'background-image:url(/img/career-friends/vacation-places-v1.png);--vacation-y:'+(C.ev.wardrobe==='ski'?1:0):'--place-x:'+(place%2)+';--place-y:'+Math.floor(place/2);
  el.classList.toggle('is-vacation',!!C.ev.wardrobe);
  var cast=el.querySelector('.cr-friend-cast');
  var markup=C.ev.channel==='reflection'||v.hide?'':crFriendActor(r,outfit,(extra||'').indexOf('in-stands')>=0,v.mood);
  if(cast.dataset.markup!==markup){cast.innerHTML=markup;cast.dataset.markup=markup;}
  el.querySelector('.cr-friend-scene-title').textContent=C.ev.t;
  el.querySelector('.cr-friend-scene-dialogue>b').textContent=who||'';
  el.querySelector('.cr-friend-scene-dialogue>p').textContent=text;
  var actions=el.querySelector('#crFriendSceneActions');
  crFriendRead(el.querySelector('.cr-friend-scene-dialogue>p'),text,actions,buttons,el);
  el.querySelector('.cr-friend-scene-dialogue').scrollTop=0;
  return el;
}
function crFriendSequence(beats,index,done){
  var b=beats[index],last=index===beats.length-1;
  CR.friendScene.beat=index;
  crFriendStage(b.place,b.outfit,b.who,b.text,[{text:!last||done?'계속':CR.friendScene.vacation?'여행 마치기':CR.friendScene.debut?'시즌 계속':'시즌 준비로',run:function(){if(!last)crFriendSequence(beats,index+1,done);else if(done)done();else crFriendFinish();}}],'',b);
}
function crFriendShow(ev){
  CR.friendScene={ev:ev,pick:null,debut:false,vacation:!!ev.vacation,intro:ev.id==='friend:intro'};
  crTovSet('',true);
  var preload=new Image();preload.src='/img/career-friends/'+(ev.vacation?'vacation-':'reactions-')+ev.friend.id+'-v1.png';
  if(ev.vacation){var scenery=new Image();scenery.src='/img/career-friends/vacation-places-v1.png';}
  crFriendWarmStoryCG(ev);
  if(ev.channel==='story'){CR.friendScene.pick=0;return crFriendSequence(crFriendBeats(ev.script.story,ev.place??3,1),0);}
  var key=ev.id.split(':')[1],place=key==='proposal'||key==='confession'?3:key==='foreign'?1:2;
  if(ev.channel==='message'||ev.channel==='call'||key==='intro'||key==='outing'||key==='debut')return crFriendMessage(ev);
  function question(){crFriendStage(place,1,ev.channel==='reflection'?'':ev.friend.name,ev.d,ev.a.map(function(text,i){return {text:text,run:function(){crFriendPick(i);}};}),'',{mood:key==='foreign'?'sad':key==='confession'||key==='proposal'?'shy':'neutral'});}
  var before=(ev.script||CR_FRIEND_MAJOR[key])?.before;
  if(before&&before.length)crFriendSequence(crFriendBeats(before,place,1),0,question);
  else question();
}
function crFriendFinish(){
  var C=CR.friendScene;if(!C)return;
  if(C.saving)return;C.saving=true;
  var button=document.querySelector('#crFriendSceneActions button')||document.querySelector('#crFriendOptions button');if(button){button.disabled=true;button.textContent='진행 중…';}
  crApi(C.vacation?'friend-vacation':C.debut?'friend-debut':'friend-prep',{token:CR.tok,pick:C.pick}).then(function(v){
    if(CR.friendScene!==C)return;
    Object.assign(CR.v,v);CR.tok=v.token;crStore(CR.v);
    crFriendRemoveScene();crFriendClosePhone();document.getElementById('crFriendDebutMessage')?.remove();CR.friendScene=null;
    if(C.vacation){if(v.friendVacation?.wardrobe)return crFriendShow(v.friendVacation);return crResult();}
    if(!C.debut){CR.evPick=null;return crShow(v);}
    if(CR.sf){CR.sf.friendBusy=false;if(CR.sf.v)CR.sf.v=CR.v;}
    C.resume();
  }).catch(function(e){C.saving=false;if(button){button.disabled=false;button.textContent='다시 시도';button.onclick=crFriendFinish;}gameToast(e.message);});
}
function crFriendDebutMessage(){
  crFriendRemoveScene();crFriendMessage(CR.friendScene.ev);
}
function crFriendDebutContext(resume){
  return {debut:true,pick:null,resume:resume,ev:CR.v.friendDebut||{id:'friend:debut',t:'첫 1군 공식경기 · 경기 종료 직후',friend:CR.v.player.relationship,d:'아까 나 봤지?ㅋㅋ\n끝나고 왜 이렇게 안 나와\n나 아직 출구 쪽인데. 잠깐 볼래?',a:['응. 거기 있어. 금방 나갈게.','오늘은 팀 일정이 있어. 먼저 가. 다음에 보자.'],replies:['응 여기 있을게.\n천천히 나와.','아쉽다. 알겠어. 조심히 들어가.\n오늘 수고했어!']}};
}
var CR_FRIEND_CGS={};
function crFriendCGSource(region,mobile){
  return '/img/career-friends/debut-'+region+(mobile?'-mobile':'')+'-v'+(region==='south'?2:1)+'.png';
}
function crFriendWarmDebut(v){
  var r=v.player?.relationship;if(!r?.pendingDebut||r.debutMode==='remote'||!CR_FRIEND_ACTORS[r.id])return null;
  var mobile=matchMedia('(orientation:portrait)').matches,key=crFriendCGSource(r.id,mobile);
  if(CR_FRIEND_CGS[key])return CR_FRIEND_CGS[key];
  var pic=new Image();pic.decoding='async';
  var ready=new Promise(function(resolve){pic.onload=function(){resolve(true);};pic.onerror=function(){resolve(false);};});
  pic.fetchPriority='high';pic.src=key;
  return CR_FRIEND_CGS[key]={image:pic,ready:ready};
}
function crFriendDebutCG(play){
  var C=CR.friendScene;if(!C?.debut)return;
  var r=C.ev.friend,asset=crFriendWarmDebut(CR.v),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var quote={asia:'여기! 나 여기 있어!',south:'여기야! 끝까지 보고 있을게!',africa:'찾았어? 여기야!',europe:'잘하고 와. 여기서 보고 있을게.'}[r.id];
  function paint(loaded){
    if(CR.friendScene!==C)return;
    crFriendRemoveScene();
    var el=document.createElement('div');el.id='crFriendScene';el.className='cr-friend-scene cr-friend-cg found'+(reduced?' is-ready':'')+(loaded?'':' art-unavailable');
    el.dataset.character=r.id;el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','관중석에서 '+r.name+' 발견');
    if(loaded){var picture=document.createElement('picture'),source=document.createElement('source');source.media='(orientation:portrait)';source.srcset=crFriendCGSource(r.id,true);picture.appendChild(source);var pic=document.createElement('img');pic.className='cr-friend-cg-art';pic.src=crFriendCGSource(r.id,false);pic.alt=r.name+'이 관중석 난간 너머에서 눈을 맞추고 응원하는 모습';pic.draggable=false;picture.appendChild(pic);el.appendChild(picture);}
    var shade=document.createElement('div');shade.className='cr-friend-cg-shade';el.appendChild(shade);
    var caption=document.createElement('div');caption.className='cr-friend-cg-caption';
    var name=document.createElement('small');name.textContent=r.name;var line=document.createElement('p');line.textContent=quote;caption.append(name,line);el.appendChild(caption);
    var actions=document.createElement('div');actions.id='crFriendSceneActions';actions.className='cr-friend-cg-actions';
    var button=document.createElement('button');button.type='button';button.className='cr-friend-cg-continue';button.textContent='그라운드로 돌아가기 →';button.disabled=!reduced;actions.appendChild(button);el.appendChild(actions);
    document.body.appendChild(el);C.cgFound=true;
    function ready(){if(CR.friendScene!==C)return;el.classList.add('is-ready');button.disabled=false;button.focus({preventScroll:true});}
    if(!reduced)CR.friendCinematicTimers.push(setTimeout(ready,1250));
    button.onclick=function(){
      if(C.cgLeaving||button.disabled)return;C.cgLeaving=true;button.disabled=true;el.classList.add('is-leaving');
      function finish(){if(CR.friendScene!==C)return;play();if(CR.friendScene===C)crFriendDebutMessage();}
      if(reduced)finish();else CR.friendCinematicTimers.push(setTimeout(finish,240));
    };
  }
  if(asset)asset.ready.then(paint);else paint(false);
}
function crFriendMatch(m,play,resume){
  var S=CR.sf,r=CR.v.player.relationship;
  if(!S||!r?.pendingDebut||S.friendSeen||!m.pl||S.n.apps!==0)return false;
  S.friendSeen=true;S.friendBusy=true;CR.friendScene=crFriendDebutContext(resume);
  if(r.debutMode==='remote'){play();crFriendDebutMessage();return true;}
  crFriendWarmDebut(CR.v);
  var C=CR.friendScene,found=false;
  var reveal=function(){
    if(CR.friendScene!==C||found)return;found=true;clearTimeout(CR.friendTimer);
    var button=document.querySelector('#crFriendSceneActions button');if(button){button.disabled=true;button.textContent='…';}
    crFriendDebutCG(function(){if(CR.sf!==S){crFriendCancel();return;}play();});
  };
  crFriendStage(0,0,'','입장 직전, 관중석을 천천히 둘러봤다.\n어디쯤이라고 했더라…',[{text:'관중석 살펴보기',run:reveal}],'searching in-stands',{hide:true});
  CR.friendTimer=setTimeout(reveal,crFriendReducedMotion()?0:2200);
  return true;
}
function crFriendReducedMotion(){return matchMedia('(prefers-reduced-motion: reduce)').matches;}
function crFriendResumeDebut(){
  if(!CR.v.player.relationship?.pendingDebut||CR.friendScene)return false;
  CR.friendScene=crFriendDebutContext(function(){crResult();});
  crFriendDebutMessage();return true;
}

function crFriendVacation(){
  if(!CR.v.friendVacation)return false;
  if(!CR.friendScene)crFriendShow(CR.v.friendVacation);
  return true;
}

var CR_FRIEND_STORY_ART={};
function crFriendStoryCGSource(region,key){
  if(!CR_FRIEND_ACTORS[region]||!['sunset','lodge','confession','proposal'].includes(key))return null;
  return '/img/career-friends/event-'+region+'-'+key+'-v1.png';
}
function crFriendStoryArt(region,key){
  var src=crFriendStoryCGSource(region,key);if(!src)return null;
  if(!CR_FRIEND_STORY_ART[src]){var img=new Image();img.decoding='async';img.src=src;CR_FRIEND_STORY_ART[src]=img;}
  return CR_FRIEND_STORY_ART[src];
}
function crFriendWarmStoryCG(ev){
  var script=ev.script||{},lines=script.story||[...(script.before||[]),...(script.after||[]).flat()];
  new Set(lines.map(function(line){return line[5];}).filter(Boolean)).forEach(function(key){crFriendStoryArt(ev.friend.id,key);});
}
function crFriendStoryCG(who,text,buttons,visual){
  var C=CR.friendScene,src=crFriendStoryCGSource(C.ev.friend.id,visual.cg);
  if(!src)return crFriendStage(3,1,who,text,buttons,'',{...visual,cg:null});
  var el=document.getElementById('crFriendScene'),fresh=!el?.classList.contains('cr-friend-story-cg')||el.dataset.source!==src;
  if(fresh){
    crFriendRemoveScene();
    el=document.createElement('div');el.id='crFriendScene';el.className='cr-friend-scene cr-friend-story-cg';el.dataset.source=src;el.dataset.cutscene=visual.cg;el.dataset.character=C.ev.friend.id;el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label',C.ev.t);el.tabIndex=0;
    var img=document.createElement('img');img.className='cr-friend-story-art';img.alt=C.ev.friend.name+'과 함께한 '+({sunset:'해변의 노을',lodge:'눈 내리는 산장',confession:'고백의 순간',proposal:'프로포즈의 순간'}[visual.cg]);img.draggable=false;img.src=crFriendStoryArt(C.ev.friend.id,visual.cg).src;img.onerror=function(){img.remove();el.classList.add('art-unavailable');};
    el.appendChild(img);
    var shade=document.createElement('div');shade.className='cr-friend-cg-shade';el.appendChild(shade);
    var dialogue=document.createElement('section');dialogue.className='cr-friend-scene-dialogue';dialogue.innerHTML='<b></b><p></p><div id="crFriendSceneActions"></div>';el.appendChild(dialogue);document.body.appendChild(el);
  }
  var render=C.storyRender=(C.storyRender||0)+1,started=false;
  function read(){
    if(started||CR.friendScene!==C||C.storyRender!==render)return;started=true;el.onkeydown=null;el.classList.add('dialogue-ready');
    el.querySelector('.cr-friend-scene-dialogue>b').textContent=who||'';
    crFriendRead(el.querySelector('.cr-friend-scene-dialogue>p'),text,el.querySelector('#crFriendSceneActions'),buttons,el);
  }
  if(fresh&&!crFriendReducedMotion()){
    el.onclick=read;el.onkeydown=function(e){if(['Enter',' '].includes(e.key)){e.preventDefault();read();}};
    CR.friendCinematicTimers.push(setTimeout(read,650));
  }else read();
  return el;
}
