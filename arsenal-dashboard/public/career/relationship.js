// Small relationship layer; progression and choices are signed by the career API.
function crFriendPortrait(r){
  if(!r||['asia','south','africa','europe'].indexOf(r.id)<0)return '';
  return '<span class="cr-friend-face" role="img" aria-label="'+gmEsc(r.name)+'의 도트 초상" style="background-image:url(/img/career-friends/'+r.id+'.png)"></span>';
}
function crFriendPanel(p){
  var r=p.relationship;if(!r)return '';
  if(p.age===15 && !p.seasons)return '<details class="cr-panel cr-friend-intro" open><summary>'+crFriendPortrait(r)+'<span><b>'+gmEsc(r.name)+'</b><small>새 메시지 · 소꿉친구</small></span></summary><div class="cr-friend-history"><p>유니폼 받았냐<br>입은 거 보내봐ㅋㅋ</p><p class="mine">왜 벌써 웃는데ㅋㅋ</p><p>아직 안 웃었거든?<br>빨리 보내봐</p></div></details>';
  return '<div class="cr-friend-status">'+crFriendPortrait(r)+'<span><b>'+gmEsc(r.name)+'</b><small>'+gmEsc(r.label)+'</small></span></div>';
}
function crFriendCard(r){
  if(!r)return '';
  var married=r.status==='married',year=r.marriedAge?2027+r.marriedAge-15:null;
  return '<div class="cr-hof-b cr-friend-card">'+crFriendPortrait(r)+'<div><small>'+(married?'함께 걸어온 사람':'그라운드 밖의 인연')+'</small><b>'+gmEsc(r.name)+' <em>'+gmEsc(r.label)+'</em></b><p>'+gmEsc(married?(year+'년 결혼 · 어릴 적 친구에서 평생의 동반자로.'):r.status==='dating'?'선수 생활을 함께 지켜본 연인.':r.status==='separated'?'각자의 길을 걷지만, 함께한 시간은 남았다.':'처음의 꿈을 기억하는 오래된 친구.')+'</p></div></div>';
}
function crFriendShow(ev){
  var r=ev.friend;
  crTovSet('<div class="cr-friend-overlay" role="dialog" aria-modal="true" aria-label="'+gmEsc(ev.t)+'"><section class="cr-friend-chat"><header>'+crFriendPortrait(r)+'<div><b>'+gmEsc(r.name)+'</b><small>'+gmEsc(r.label)+'</small></div></header><div class="cr-friend-history" id="crFriendHistory" aria-live="polite"><small class="date">'+gmEsc(ev.t)+'</small>'+ev.d.split('\n').map(function(line){return '<p>'+gmEsc(line)+'</p>';}).join('')+'</div><div class="cr-friend-options" id="crFriendOptions">'+ev.a.map(function(t,i){return '<button class="cr-friend-option" onclick="crFriendPick('+i+')">'+gmEsc(t)+'</button>';}).join('')+'</div></section></div>');
}
function crFriendPick(i){
  var ev=CR.v.prep.event,options=document.getElementById('crFriendOptions'),history=document.getElementById('crFriendHistory');
  if(CR.evPick!=null||!options||!history||!ev.friend||!ev.a[i])return;
  CR.evPick=i;
  var mine=document.createElement('p');mine.className='mine';mine.textContent=ev.a[i];history.appendChild(mine);
  ev.replies[i].split('\n').forEach(function(line){var reply=document.createElement('p');reply.textContent=line;history.appendChild(reply);});
  options.innerHTML='<button class="cr-friend-option go" onclick="crTovSet(\'\',true);crPrep()">시즌 준비로</button>';
  options.querySelector('button').focus();
}
