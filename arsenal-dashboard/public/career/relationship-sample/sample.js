(function(root){
  'use strict';
  // Prototype-only rules. No production state, tokens, APIs or localStorage are touched.
  function eligibleEvents(facts,seen){
    const events=[];
    if(facts.senior && facts.official && facts.appearances>0 && !seen.debut) events.push('debut');
    if(facts.transferCompleted && facts.fromCountry && facts.toCountry && facts.fromCountry!==facts.toCountry && facts.partner) events.push('foreign');
    return events;
  }
  if(typeof module!=='undefined' && module.exports) module.exports={eligibleEvents};
  if(typeof document==='undefined') return;
  const $=id=>document.getElementById(id);
  const scenarios={
    intro:{age:15,season:'첫 시즌 · 유스 합류',title:'오래된 연락처',desc:'새 유니폼을 받은 날, 익숙한 이름으로 연락이 왔다.'},
    debut:{age:19,season:'다섯 번째 시즌 · 1군',title:'처음 밟은 그라운드',desc:'오랫동안 바라던 순간. 이번에는 관중석에 아는 얼굴도 있었다.',senior:true,official:true,appearances:1},
    foreign:{age:23,season:'아홉 번째 시즌 · 해외 이적',title:'멀어지는 거리',desc:'계약서에 서명했고, 새 소속이 확정됐다. 이제 두 사람의 이야기가 남았다.',senior:true,official:true,appearances:24,transferCompleted:true,fromCountry:'KOR',toCountry:'ENG',partner:true},
    youth:{age:16,season:'두 번째 시즌 · 유스',title:'아직은 준비하는 시간',desc:'유스에서 한 시즌을 보냈다. 첫 프로 출전은 아직이다.',senior:false,official:true,appearances:22},
    bench:{age:18,season:'네 번째 시즌 · 1군',title:'벤치에서 바라본 경기',desc:'1군 명단에는 들었지만, 이번 경기에서는 출전하지 못했다.',senior:true,official:true,appearances:0},
    repeat:{age:20,season:'여섯 번째 시즌 · 1군',title:'두 번째 1군 시즌',desc:'첫 출전의 설렘은 지나고, 이제 꾸준히 자리를 지킬 때다.',senior:true,official:true,appearances:20},
    offer:{age:21,season:'일곱 번째 시즌 · 이적시장',title:'제안은 아직 제안일 뿐',desc:'해외 구단의 관심이 도착했다. 현재 소속은 그대로다.',senior:true,official:true,appearances:22,transferCompleted:false,fromCountry:'KOR',toCountry:'ENG',partner:true},
    domestic:{age:22,season:'여덟 번째 시즌 · 국내 이적',title:'같은 나라, 새로운 팀',desc:'국내 구단으로 이적했다. 새로운 유니폼으로 다음 시즌을 준비한다.',senior:true,official:true,appearances:22,transferCompleted:true,fromCountry:'KOR',toCountry:'KOR',partner:true}
  };
  let state;
  function reset(){state={chapter:'intro',phase:'relation',closeness:0,approach:'',seen:{},choiceCount:0};render();}
  function load(chapter){
    state.chapter=chapter;state.choiceCount=0;
    state.phase=chapter==='intro'?'relation':chapter==='foreign'||chapter==='offer'||chapter==='domestic'?'result':'career';
    // Direct chapter navigation sets up the stated independent example.
    state.seen=chapter==='debut'||chapter==='youth'||chapter==='bench'?{}:{debut:true};
    render();
  }
  function relationText(){
    if(state.chapter==='foreign') return state.approach==='distance'?'서로의 일상을 존중하는 연인':'다음 만남을 함께 계획하는 연인';
    return state.closeness>=2?'다음 연락을 기다리는 사이':state.closeness>=1?'서로의 일상이 궁금한 사이':'편하게 연락하는 사이';
  }
  function body(label,text,note){
    $('conversationBody').replaceChildren();
    const p=document.createElement('p');p.className='letter-label';p.textContent=label;$('conversationBody').append(p);
    const q=document.createElement('p');q.className='dialogue';q.textContent=text;$('conversationBody').append(q);
    if(note){const n=document.createElement('p');n.className='narration';n.textContent=note;$('conversationBody').append(n);}
  }
  function choices(items){
    $('actions').replaceChildren();
    items.forEach((item,i)=>{const button=document.createElement('button');button.className='choice'+(item.primary?' primary':'');
      const num=document.createElement('span');num.textContent=item.primary?'→':String(i+1).padStart(2,'0');
      const text=document.createElement('b');text.textContent=item.text;button.append(num,text);
      button.addEventListener('click',()=>{if(!button.isConnected)return;item.run();});$('actions').append(button);});
  }
  function next(text,run){choices([{text,run,primary:true}]);}
  function portrait(smile){$('visual').innerHTML='<div class="portrait-card'+(smile?' smile':'')+'"><img src="assets/childhood-friend.png" alt="긴 검은 머리와 올리브 재킷을 입은 소꿉친구 서윤의 도트 초상"></div>';}
  function phone(){ $('visual').innerHTML='<div class="phone"><time>18:24</time><p>훈련이 끝난 오후</p><div class="notification"><small>메시지 · 지금</small><b>서윤</b>새 유니폼 받았다며? 👀</div></div>'; }
  function messenger(reply){
    const box=$('conversationBody');box.replaceChildren();
    const date=document.createElement('p');date.className='chat-date';date.textContent='유스 합류 첫날 · 훈련이 끝난 오후';box.append(date);
    function bubble(text,mine,time){
      const row=document.createElement('div');row.className='chat-row'+(mine?' mine':'');
      const message=document.createElement('p');message.className='chat-bubble';message.textContent=text;
      const stamp=document.createElement('span');stamp.className='chat-time';stamp.textContent=mine?'읽음 · '+time:time;
      row.append(message,stamp);box.append(row);
    }
    bubble('새 유니폼 받았다며? 👀',false,'18:24');
    bubble('사진 한 장 보내봐ㅋㅋ',false,'18:24');
    bubble('나중에 프로 데뷔하면 꼭 알려줘',false,'18:25');
    if(reply){
      const sent={introWarm:'당연하지ㅋㅋ 제일 먼저 알려줄게.',introCalm:'아직 멀었어. 일단 훈련부터 잘해야지.',introJoke:'사진값은 축하 간식으로 받을게.'};
      bubble(sent[state.approach],true,'18:26');
      // Keep the incoming messages and the player's actual answer visible together.
      reply.replace(/[“”]/g,'').split('\n').filter(Boolean).forEach(line=>bubble(line,false,'18:26'));
    }
  }
  function card(label,title,number,description,stats){
    $('visual').innerHTML='';const box=document.createElement('div');box.className='match-card';
    [['p','eyebrow',label],['h3','',title],['p','',description],['div','number',number],['div','statline',stats]].forEach(([tag,cls,text])=>{const el=document.createElement(tag);el.className=cls;el.textContent=text;box.append(el);});$('visual').append(box);
  }
  function render(){
    const s=scenarios[state.chapter],p=state.phase,rel=p==='relation'||p==='outcome';
    document.querySelector('.layout').classList.toggle('messenger-mode',state.chapter==='intro');
    document.querySelector('.layout').classList.toggle('replying',state.chapter==='intro'&&p==='relation');
    $('ageLabel').textContent=s.age+'세';$('seasonLabel').textContent=s.season;
    $('sceneTitle').textContent=s.title;$('sceneDescription').textContent=s.desc;
    $('sceneTag').textContent=state.chapter==='intro'?'MESSAGE':p==='career'?'CAREER EVENT':p==='result'?'SEASON RESULT':'OFF THE PITCH';
    $('sceneTime').textContent=state.chapter==='foreign'?'이적 확정 이후':state.chapter==='intro'?'유스 합류 첫날':rel?'경기가 끝난 뒤':'시즌 진행';
    $('sceneKicker').textContent=state.chapter==='intro'?'01 / A FAMILIAR NAME':state.chapter==='foreign'?'03 / A NEW CHAPTER':'02 / YOUR OWN SEASON';
    $('backdrop').src='/img/career-scenes/'+(['foreign','offer','domestic'].includes(state.chapter)?'transfer':'field')+'.webp';
    $('backdrop').alt=['foreign','offer','domestic'].includes(state.chapter)?'도트로 그린 구단 계약 공간':'도트로 그린 축구 훈련장';
    $('speaker').textContent=rel?'서윤':p==='career'?'감독':'시즌 기록';
    $('contactLabel').textContent=rel?(state.chapter==='foreign'?'소꿉친구에서 연인으로 · 독립된 미래 장면':'어릴 때부터 알고 지낸 친구'):p==='career'?'다음 경기를 준비하며':'기록을 확인한 뒤 이야기가 이어집니다';
    $('relationshipLabel').textContent=relationText();
    document.querySelectorAll('.chapters button').forEach(b=>b.setAttribute('aria-current',String(b.dataset.chapter===state.chapter)));
    const labels=state.chapter==='intro'?['첫 연락','답장']:state.chapter==='foreign'||state.chapter==='offer'||state.chapter==='domestic'?['이적 결과','관계 이야기']:['커리어 선택','시즌 결과','관계 이야기'];
    const at=state.chapter==='intro'?(p==='outcome'?1:0):state.chapter==='foreign'||state.chapter==='offer'||state.chapter==='domestic'?(p==='result'?0:1):p==='career'?0:p==='result'?1:2;
    $('flow').innerHTML=labels.map((l,i)=>'<li class="'+(i===at?'current':i<at?'done':'')+'">'+l+'</li>').join('');
    $('seasonNote').textContent='이번 시즌 선택 '+state.choiceCount+'회 · 장면 넘기기는 선택 횟수에 포함하지 않아요.';
    if(p==='outcome'){renderOutcome();return;}
    if(p==='career'){
      card('SEASON PREPARATION','시즌을 준비하는 자세','새 출발','감독이 훈련을 마친 당신을 불렀다.','커리어 선택 → 결과 확인 → 관계 이야기');
      body('감독의 한마디','“이번 시즌, 어떤 마음으로 준비하고 있나?”','샘플의 커리어 선택입니다. 실제 능력치에는 반영되지 않습니다.');
      choices(['경쟁할 준비가 됐습니다.','차근차근 기회를 잡겠습니다.'].map(text=>({text,run(){state.choiceCount++;state.phase='result';render();}})));return;
    }
    if(p==='result'){renderResult(s);return;}
    if(state.chapter==='intro'){
      messenger();
      choices([
        {text:'“당연하지ㅋㅋ 제일 먼저 알려줄게.”',run(){choose('introWarm',1);}},
        {text:'“아직 멀었어. 일단 훈련부터 잘해야지.”',run(){choose('introCalm',0);}},
        {text:'“사진값은 축하 간식으로 받을게.”',run(){choose('introJoke',1);}}
      ]);return;
    }
    if(state.chapter==='debut'){
      portrait(true);body('서윤 · 경기 후','“오늘 진짜 뛰더라.\n나 괜히 긴장해서 계속 앉았다 일어났다 했잖아ㅋㅋ\n집 가기 전에 잠깐 볼래?”','첫 1군 공식 프로경기에 실제 출전한 뒤, 한 번만 이어지는 연락.');
      choices([
        {text:'“응. 경기장 앞에서 기다려줘.”',run(){choose('meet',1);}},
        {text:'“오늘은 쉬고 싶어. 내일 같이 밥 먹을래?”',run(){choose('reschedule',1);}},
        {text:'“와줘서 고마워. 오늘은 혼자 쉬어야겠어.”',run(){choose('rest',0);}}
      ]);return;
    }
    portrait(false);body('서윤 · 이적이 확정된 밤','“이제 진짜 가는 거네.\n도착하면 전화해.\n…공항에서 울면 놀리지 마.”','이 장면은 23세에 이미 연애 중인 별도 예시입니다. 앞의 두 선택만으로 연애가 시작된 것은 아닙니다.');
    choices([
      {text:'“안 놀려. 나도 울 것 같은데.”',run(){choose('plan',0);}},
      {text:'“쉬는 날 나오면 바로 알려줄게. 그때 보자.”',run(){choose('visit',0);}},
      {text:'“훈련 끝나면 전화할게. 너도 먼저 해.”',run(){choose('distance',0);}}
    ]);
  }
  function choose(approach,delta){state.approach=approach;state.closeness+=delta;state.choiceCount++;state.phase='outcome';render();}
  function renderResult(s){
    const transfer=['foreign','offer','domestic'].includes(state.chapter);
    if(transfer){
      card('TRANSFER WINDOW',state.chapter==='foreign'?'새 소속이 확정됐다':state.chapter==='domestic'?'국내 이적 완료':'해외 구단의 제안',state.chapter==='foreign'?'KOR → ENG':state.chapter==='domestic'?'KOR → KOR':'협상 전',state.chapter==='offer'?'제안 도착 · 계약 체결 없음':'계약 체결 · 소속 구단 변경 완료','이적 제안과 실제 이적은 구분됩니다.');
    }else{
      card('OFFICIAL MATCH',s.senior?'1군 공식경기':'유스 공식경기',s.appearances+'경기 출전',state.chapter==='bench'?'벤치 대기 · 실제 출전 없음':state.chapter==='debut'?'첫 공식 프로경기 · 교체 출전':state.chapter==='repeat'?'프로 데뷔는 지난 시즌에 완료':'유스 기록은 프로 데뷔에 포함되지 않음',s.senior?'SENIOR TEAM':'YOUTH TEAM');
    }
    const events=eligibleEvents(s,state.seen),event=events[0];
    if(event){
      body('결과를 확인했습니다',event==='debut'?'첫 1군 공식경기 출전이 기록됐습니다.\n경기장을 나서려는데 연락이 왔습니다.':'해외 이적이 완료됐습니다.\n출국 전, 서윤과 이야기를 나누기로 했습니다.','커리어 결과를 먼저 확인하고 관계 장면으로 이어집니다.');
      next(event==='debut'?'도착한 연락 확인하기':'서윤과 이야기하기',()=>{if(event==='debut')state.seen.debut=true;state.phase='relation';render();});
    }else{
      const reason={youth:'유스 경기는 첫 프로 출전 조건에 해당하지 않아요.',bench:'1군 명단에 들어도 실제 출전하지 않으면 데뷔 연락은 뜨지 않아요.',repeat:'첫 프로 출전 연락은 이미 받은 이벤트라 반복하지 않아요.',offer:'제안만 도착했으므로 해외 이적 관계 이벤트는 뜨지 않아요.',domestic:'같은 국가 내 이적이므로 해외 이적 관계 이벤트는 뜨지 않아요.'}[state.chapter];
      body('이번 장면의 결과',reason,'이번 샘플에는 조건에 맞는 관계 이벤트가 없습니다. 일반 데이트 등 다른 이벤트는 아직 포함하지 않았습니다.');
      next('다른 장면 살펴보기',()=>load('debut'));
    }
  }
  function renderOutcome(){
    const lines={
      introWarm:['“약속했다? 나중에 모른 척하기 없기다ㅋㅋ\n훈련 잘하고, 밥도 챙겨 먹어.”','처음 그라운드를 밟을 날, 가장 먼저 알려줄 사람이 생겼다.'],
      introCalm:['“알지. 그냥 네가 좋아하니까 나도 궁금해서.\n무리하지 말고 잘해봐!”','친구는 재촉하지 않았다. 각자의 하루가 다시 시작됐다.'],
      introJoke:['“벌써 선수 대접 해달라는 거야?ㅋㅋ\n편의점에서 하나 골라. 비싼 건 안 된다.”','익숙한 농담이 낯선 시작을 조금 편하게 만들었다.'],
      meet:['“알겠어. 출구 옆에서 기다릴게.\n오늘 얘기 직접 듣고 싶어.”','짧은 만남이지만, 서로 기억할 하루가 됐다.'],
      reschedule:['“내일 뭐 먹을지 내가 정해도 돼?\n됐어 이미 정했어ㅋㅋ 얼른 가서 쉬어.”','내일 저녁에 만나기로 했다.'],
      rest:['“알겠어. 나도 이제 간다.\n일어나면 연락해.”','오늘은 먼저 돌아가기로 했다.'],
      plan:['“너까지 울면 누가 달래ㅋㅋ\n…가지 말라는 건 아니야. 알지?”','비행기 시간까지는 아직 조금 남아 있다.'],
      visit:['“응. 표는 내가 알아볼게.\n너 사는 동네도 구경해야지.”','다음 휴가가 언제쯤일지 달력을 펼쳤다.'],
      distance:['“나 맨날 먼저 하는데?ㅋㅋ\n알겠어. 늦어도 목소리만 잠깐 듣자.”','휴대폰에 두 도시의 시간을 나란히 띄웠다.']
    };
    const [line,note]=lines[state.approach];
    if(state.chapter==='intro')messenger(line);
    else {portrait(true);body('서윤의 답장',line,note);}
    $('relationshipLabel').textContent=relationText();
    if(state.chapter==='intro')next('시간이 흘러, 첫 프로 출전 시즌으로',()=>load('debut'));
    else if(state.chapter==='debut')next('연애 중인 미래의 이적 장면 보기',()=>load('foreign'));
    else next('샘플 다시 시작하기',reset);
  }
  document.querySelectorAll('[data-chapter]').forEach(button=>button.addEventListener('click',()=>load(button.dataset.chapter)));
  $('restart').addEventListener('click',reset);
  reset();
})(typeof window!=='undefined'?window:globalThis);
