// One hometown friend per career; relationship scenes precede the season event.
const PEOPLE={
  asia:{id:'asia',name:'서윤'},south:{id:'south',name:'루시아'},africa:{id:'africa',name:'아마라'},europe:{id:'europe',name:'에밀리'}
};
export function createRelationship(nation){
  const region=['KOR','JPN'].includes(nation)?'asia':['BRA','ARG'].includes(nation)?'south':nation==='NGA'?'africa':'europe';
  return {version:3,region,name:nation==='JPN'?'유이':PEOPLE[region].name,status:'friend',affinity:0,done:[],lastAge:0,introDone:false};
}
const INTRO={id:'friend:intro',t:'새 유니폼',d:'유니폼 받았냐\n입은 거 보내봐ㅋㅋ',a:['왜 벌써 웃는데ㅋㅋ','아직 안 입어봤어. 들어가서 보내줄게.','나 프로경기 뛰면 보러 와라.'],reply:['아직 안 웃었거든?\n프로경기 처음 뛰면 나 불러. 보러 갈 거니까.','응 기다릴게ㅋㅋ\n나 첫 경기 보러 갈 거니까 그때도 꼭 알려줘.','불러주기만 해ㅋㅋ\n나중에 유명해졌다고 모른 척하기 없기다?']};
export function introEvent(C){
  if(!C.relationship||C.relationship.introDone===true||C.age!==15||C.hist.length)return null;
  return {...INTRO,friend:relationshipView(C),replies:INTRO.reply};
}
export function applyIntro(C,pick){
  if(!introEvent(C)||!Number.isInteger(pick)||!INTRO.a[pick])throw new Error('intro pick');
  C.relationship.introDone=true;C.relationship.introPick=pick;C.relationship.prepAge=C.age;
}
const STORIES={
  debut:{t:'아직 못 들은 얘기',d:'너 처음 경기 뛰던 날 나까지 긴장했잖아ㅋㅋ\n근데 그 얘기 아직 제대로 못 들었어.\n쉬는 날 밥 먹으면서 얘기해줘.',a:['ㅋㅋ 알겠어. 뭐 먹을래?','이번엔 좀 쉬어야겠다. 나중에 보자.'],reply:['일단 비싼 거. 프로선수 친구 둔 보람은 있어야지ㅋㅋ','응 쉬어. 대신 나중에 내가 또 물어볼 거다ㅋㅋ']},
  outing:{t:'밥은 먹었어?',d:'밥 먹었어?\n나 아직인데.\n너 쉬는 날이면 같이 먹을까 해서.',a:['나도 아직. 어디로 갈까?','오늘은 안 되겠다. 다음에 내가 연락할게.'],reply:['뭐야 그럼 처음부터 같이 먹자고 할걸. 나 준비하고 나갈게.','알겠어. 나 혼자 맛있는 거 먹는다?']},
  confession:{t:'또 그 질문',d:'오늘 또 너랑 사귀냐는 얘기 들었어.\n아니라고 하긴 했는데.\n…계속 아니라고 해야 돼?',a:['아니. 이제 사귄다고 해. 나 너 좋아해.','나는 친구로 생각했어. 괜히 헷갈리게 했다면 미안해.'],reply:['방금 한 말 다시 해봐.\n못 들은 게 아니라… 한 번 더 듣고 싶어서.','아… 그렇구나.\n나 오늘 먼저 가볼게.']},
  foreign:{t:'다음엔 언제 봐?',d:'새 팀 유니폼 입은 거 아직 어색해ㅋㅋ\n근데 우리 이제 언제 봐?\n…생각하니까 좀 싫다. 멀어지는 거.',a:['나도. 전화 자주 할게. 쉬는 날 나오면 너부터 보러 가고.','미안해. 나, 그만 만나는 게 맞는 것 같아.'],reply:['응. 바쁜 건 아는데, 그냥 네 얘기 듣고 싶어서 그래.\n시간 나면 전화해.','…지금 그 얘길 한다고?\n알겠어. 오늘은 더 못 얘기하겠다.']},
  proposal:{t:'우리 얘기',d:'친구들이 우리 언제 결혼하냐고 묻더라.\n맨날 웃고 넘겼는데.\n넌 그런 생각 해본 적 있어?',a:['있지. 너랑 하고 싶어. 우리 결혼하자.','너랑은 하고 싶은데, 아직 준비가 안 됐어.'],reply:['응. 나도.\n…잠깐, 나 지금 좀 울 것 같아.','그럼 준비되면 네가 먼저 말해줘.\n나도 가끔은 궁금하단 말이야.']}
};
export function relationshipView(C){
  const r=C.relationship;if(!r)return null;
  return {id:r.region,name:r.name,status:r.status,label:{friend:'소꿉친구',close:'가까워지는 사이',dating:'연인',married:'배우자',separated:'추억으로 남은 인연'}[r.status],marriedAge:r.marriedAge||null,pendingDebut:!!r.pendingDebut};
}
export function prepareDebut(C,row){
  const r=C.relationship;
  if(!r||r.done.includes('debut')||r.pendingDebut||row?.youth!==false||!(row.apps>0))return;
  if(C.hist.some(old=>!old.youth&&old.apps>0))return;
  r.version=Math.max(2,r.version||0);r.pendingDebut=true;
}
export function relationshipEvent(C,id){
  const key=String(id||'').replace('friend:',''),s=STORIES[key];
  return s&&C.relationship?{...s,id:'friend:'+key,friend:relationshipView(C)}:null;
}
export function dueRelationship(C){
  const r=C.relationship;
  if(!r||r.pendingDebut||r.status==='separated'||r.done.length>=5||C.age-r.lastAge<2)return null;
  const has=k=>r.done.includes(k);
  // Senior club season rows represent official league matches, not friendlies.
  if(!has('debut')&&r.version<2&&C.hist.some(row=>!row.youth&&row.apps>0))return 'debut';
  if(!has('debut'))return null;
  if(r.foreign&&r.status==='dating'&&!has('foreign'))return 'foreign';
  if(C.age>=21&&!has('outing'))return 'outing';
  if(C.age>=23&&has('outing')&&!has('confession')&&r.affinity>=1)return 'confession';
  if(C.age>=28&&r.status==='dating'&&!has('proposal'))return 'proposal';
  return null;
}
export function recordRelationshipTransfer(C,from,to){
  const r=C.relationship;
  if(r&&r.status==='dating'&&from&&to&&from!==to&&!r.done.includes('foreign'))r.foreign=true;
}
export function applyRelationship(C,id,pick){
  const r=C.relationship,key=String(id||'').replace('friend:','');
  if(!r||!STORIES[key]||r.done.includes(key))return null;
  if(pick!==0&&pick!==1)throw new Error('relationship pick');
  r.done.push(key);r.lastAge=C.age;
  if(key==='debut')delete r.pendingDebut;
  if(pick===0){
    r.affinity++;
    if(['debut','outing'].includes(key))r.status='close';
    if(key==='confession')r.status='dating';
    if(key==='proposal'){r.status='married';r.marriedAge=C.age;}
  }else{
    if(key==='confession')r.status='friend';
    if(key==='foreign')r.status='separated';
  }
  if(key==='foreign')delete r.foreign;
  return r.name+' · '+STORIES[key].reply[pick];
}
export function relationshipSeasonMessage(C,row){
  const r=C.relationship;if(!r||r.status==='separated')return null;
  if(!row.youth&&row.apps>0&&!C.hist.some(old=>!old.youth&&old.apps>0))return r.name+' · 데뷔했다며!! 너보다 내가 더 떠들고 다니는 중ㅋㅋ';
  if(C.age%4!==0)return null;
  return r.name+' · '+(r.status==='married'?'시즌 끝났으니까 오늘 축구 얘기 금지. 저녁 뭐 먹을지만 생각해ㅋㅋ':r.status==='dating'?'이제 좀 쉴 수 있어? 나 너랑 할 거 엄청 밀렸는데.':'살아 있냐ㅋㅋ 시즌 끝났다며. 시간 나면 연락 좀 해.');
}

// Everyday choices fill the years between major stories without consuming them.
// Stable age-based selection does not advance football's random seed.
const DAILY={
  youth:[
    ['훈련 끝나고','오늘도 늦게 끝나?\n나 가게 앞인데. 뭐 좀 사다 줄까?',['내 거도 하나ㅋㅋ 끝나고 바로 갈게.','고마운데 오늘은 그냥 들어가서 쉬려고.'],['알겠어. 녹기 전에 와ㅋㅋ','응ㅋㅋ 내 건 내가 먹을게.'],{place:2,text:'네 몫까지 먹을 뻔했어ㅋㅋ\n앉아. 오늘 훈련은 어땠는데?'}],
    ['사진 한 장','옛날 사진 찾았는데 너 진짜 작다ㅋㅋ\n보내줘?',['보내봐ㅋㅋ 너도 같이 나온 걸로.','분명 이상한 사진이지. 너만 갖고 있어ㅋㅋ'],['우리 둘 다 똑같이 웃겨ㅋㅋ\n이거 봐.','그래도 지우진 않는다ㅋㅋ']],
    ['쉬는 날','너 쉬는 날 언제야?\n맨날 훈련 가는 것만 보는 듯.',['이번 주는 돼. 잠깐 걷자.','이번엔 쉬어야겠다. 다음에 내가 연락할게.'],['좋아. 나갈 때 연락해.','응. 푹 쉬어.'],{place:3,text:'여기 아직 그대로네.\n우리 어릴 때 저기서 맨날 놀았잖아.'}]
  ],
  friend:[
    ['집에 가는 길','방금 네가 좋아하던 노래 나옴ㅋㅋ\n너 아직도 이거 들어?',['당연하지ㅋㅋ 너도 듣고 있었네.','요즘은 다른 거 들어. 하나 보내줄까?'],['앞부분만 나와도 네 생각 나ㅋㅋ','응 보내봐. 가는 길에 들어볼게.']],
    ['시간 맞추기','이번에 집에 오면 얼굴 좀 보자.\n밥 먹는 거 말고 산책 어때?',['좋지. 시간 맞춰보자.','이번엔 일정이 빡빡해서 어려울 것 같아.'],['응 날짜 정해지면 알려줘.','알겠어. 다음에 보자.'],{place:3,text:'오랜만에 보니까 할 말이 한꺼번에 생각나네.\n어디부터 얘기하지ㅋㅋ'}],
    ['점심 메뉴','네가 전에 말한 메뉴 먹어봤는데\n맛있네? 왜 이제 알려줬냐ㅋㅋ',['내가 뭐랬어ㅋㅋ 다음엔 같이 먹자.','거기 말고도 맛있는 데 있어. 알려줄게.'],['응ㅋㅋ 다음엔 네가 골라.','잠깐만. 저장하게 하나씩 보내봐.']],
    ['잠깐 통화','오늘 좀 정신없었어.\n별일은 아닌데 네 목소리 들으면 좋을 것 같아서.',['지금 전화해도 돼?','지금은 팀 일정 중이야. 끝나고 내가 걸게.'],['응. 나 집이야.','알겠어. 나도 씻고 기다릴게.']]
  ],
  dating:[
    ['우리 쉬는 날','우리 이번엔 뭐 안 하고 그냥 걸을까?\n너 옆에 있으면 그걸로 좋은데.',['나도. 천천히 걷자.','이번엔 푹 쉬고, 다음에 제대로 보자.'],['응. 편하게 입고 와.','알겠어. 대신 다음 약속은 네가 잡기.'],{place:3,text:'이렇게 아무것도 안 해도 좋은데.\n너랑 있으면 시간이 너무 빨리 가.'}],
    ['오늘의 사진','오늘 찍은 거 보내줄게.\n네가 좋아할 것 같아서 찍었어.',['이런 거 보면 내 생각 나?ㅋㅋ','좋다. 나도 지금 찍어서 보내줄게.'],['응. 별거 아닌 것도 자꾸 보내고 싶어.','응. 네가 보는 것도 궁금해.']],
    ['저녁 약속','이번에 만나면 네가 먹고 싶은 거 먹자.\n맨날 내가 고른 것 같아서.',['그럼 오늘은 내가 고를게.','난 네가 고르는 거 좋은데ㅋㅋ'],['좋아. 오늘은 따라갈게.','그래? 그럼 나 믿고 와ㅋㅋ'],{place:2,text:'마주 보고 밥 먹는 게 이렇게 반가울 일인가.\n얼굴 좀 보게 고개 들어봐ㅋㅋ'}],
    ['늦은 연락','요즘 우리 연락 시간이 자꾸 엇갈리네.\n오늘은 잠깐 얘기할 수 있어?',['응. 지금은 너랑 얘기할 시간 있어.','오늘은 늦을 것 같아. 내일 내가 먼저 전화할게.'],['좋다. 오늘 무슨 일 있었는지부터 얘기해줘.','응. 내일은 기다릴게.']]
  ],
  married:[
    ['둘만의 저녁','우리 요즘 마주 앉아서 밥 먹은 적이 별로 없네.\n이번엔 둘이 나갈까?',['좋아. 내가 예약할게.','밖에 말고 집에서 같이 만들어 먹자.'],['응. 오늘은 천천히 먹자.','좋지. 장 볼 거 같이 적어보자.'],{place:2,text:'오랜만에 이렇게 나오니까 연애할 때 같다.\n우리 이런 시간 좀 더 자주 만들자.'}],
    ['장보기','장 보러 왔는데 뭐 먹고 싶어?\n네가 맨날 먹던 것도 살까?',['응ㅋㅋ 그거랑 네가 좋아하는 것도.','오늘은 새로운 거 먹어보자. 내가 고를게.'],['이미 내 것도 담았지ㅋㅋ','좋아. 뭘 고를지 궁금한데.']],
    ['오래된 사진','우리 옛날 사진 봤어.\n그때 너 저런 표정이었구나.',['너 앞에서는 지금도 똑같을걸ㅋㅋ','어떤 사진인데? 같이 보자.'],['그건 맞네ㅋㅋ 아직도 딱 알아.','응. 오늘 같이 골라보자.']],
    ['바쁜 한 주','이번 주는 우리 둘 다 바쁘네.\n그래도 하루쯤은 같이 쉬자.',['그날은 일정 비워둘게.','시간 길게 못 내도 같이 저녁은 먹자.'],['좋아. 그날 뭐 할지 천천히 생각하자.','응. 그 정도도 나는 좋아.']]
  ],
  service:[['짧은 연락','지금 연락할 수 있는 시간이야?\n밥은 잘 먹고 있어?',['응. 잠깐 얘기할 수 있어. 너는?','오늘은 길게 못 해. 다음에 먼저 연락할게.'],['나도 잘 지내. 네 얘기 해줘.','알겠어. 몸 조심하고. 다음에 얘기하자.']]],
  separated:[
    ['남아 있는 대화','사진을 정리하다가 오래된 대화창을 발견했다.',['대화창을 정리한다.','지금은 그대로 둔다.'],['대화창을 닫고 오늘 할 일로 돌아갔다.','휴대폰을 내려놓았다. 지금 정하지 않아도 괜찮았다.']],
    ['혼자 보내는 저녁','오늘 저녁에는 따로 잡힌 약속이 없다.',['친구에게 밥 먹자고 연락한다.','혼자 좋아하는 영화를 본다.'],['먼저 보낸 연락에 반가운 답장이 왔다.','오랜만에 아무 생각 없이 영화를 골랐다.']],
    ['익숙한 길','걷다가 둘이 자주 가던 길에 들어섰다.',['그대로 걸어본다.','다른 길로 돌아간다.'],['익숙한 가게를 지나쳐 천천히 걸었다.','처음 보는 골목에 작은 가게가 있었다. 잠깐 들러보기로 했다.']]
  ]
};
export function routineEvent(C,service=false){
  const r=C.relationship;if(!r)return null;
  const group=r.status==='separated'?'separated':service?'service':r.status==='married'?'married':r.status==='dating'?'dating':C.age<=20?'youth':'friend';
  const pool=DAILY[group],entry=pool[(C.age-15)%pool.length];
  const [t,d,a,reply,meeting]=entry;
  return {id:'friend:daily:'+C.age,t,d,a,reply,friend:relationshipView(C),channel:group==='separated'?'reflection':'message',...(meeting?{meeting}: {})};
}
export function applyRoutine(C,ev,pick){
  if(!Number.isInteger(pick)||!ev.a[pick]||C.relationship.prepAge===C.age)throw new Error('daily pick');
  C.relationship.prepAge=C.age;C.relationship.lastRoutine={id:ev.id,pick};
}
