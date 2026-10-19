// One hometown friend per new career. Decisions use the existing prep event slot.
const PEOPLE={
  asia:{id:'asia',name:'서윤'},south:{id:'south',name:'루시아'},africa:{id:'africa',name:'아마라'},europe:{id:'europe',name:'에밀리'}
};
export function createRelationship(nation){
  const region=['KOR','JPN'].includes(nation)?'asia':['BRA','ARG'].includes(nation)?'south':nation==='NGA'?'africa':'europe';
  return {version:1,region,name:nation==='JPN'?'유이':PEOPLE[region].name,status:'friend',affinity:0,done:[],lastAge:0};
}
const STORIES={
  debut:{t:'아직 못 들은 얘기',d:'너 처음 경기 뛰던 날 나까지 긴장했잖아ㅋㅋ\n근데 그 얘기 아직 제대로 못 들었어.\n쉬는 날 밥 먹으면서 얘기해줘.',a:['ㅋㅋ 알겠어. 뭐 먹을래?','이번엔 좀 쉬어야겠다. 나중에 보자.'],reply:['일단 비싼 거. 프로선수 친구 둔 보람은 있어야지ㅋㅋ','응 쉬어. 대신 나중에 내가 또 물어볼 거다ㅋㅋ']},
  outing:{t:'밥은 먹었어?',d:'밥 먹었어?\n나 아직인데.\n너 쉬는 날이면 같이 먹을까 해서.',a:['나도 아직. 어디로 갈까?','오늘은 안 되겠다. 다음에 내가 연락할게.'],reply:['뭐야 그럼 처음부터 같이 먹자고 할걸. 나 준비하고 나갈게.','알겠어. 나 혼자 맛있는 거 먹는다?']},
  confession:{t:'또 그 질문',d:'오늘 또 너랑 사귀냐는 얘기 들었어.\n아니라고 하긴 했는데.\n…계속 아니라고 해야 돼?',a:['아니. 이제 사귄다고 해. 나 너 좋아해.','나는 친구로 생각했어. 괜히 헷갈리게 했다면 미안해.'],reply:['진짜지? 나 이거 캡처한다. 나중에 딴말하기 없기야ㅋㅋ','아… 그렇구나.\n알겠어. 오늘은 먼저 잘게.']},
  foreign:{t:'다음엔 언제 봐?',d:'새 팀 유니폼 입은 거 아직 어색해ㅋㅋ\n근데 우리 이제 언제 봐?\n…생각하니까 좀 싫다. 멀어지는 거.',a:['나도. 전화 자주 할게. 쉬는 날 나오면 너부터 보러 가고.','미안해. 나, 그만 만나는 게 맞는 것 같아.'],reply:['응. 바쁜 건 아는데, 그냥 네 얘기 듣고 싶어서 그래.\n시간 나면 전화해.','…지금 그 얘길 한다고?\n알겠어. 오늘은 더 못 얘기하겠다.']},
  proposal:{t:'우리 얘기',d:'친구들이 우리 언제 결혼하냐고 묻더라.\n맨날 웃고 넘겼는데.\n넌 그런 생각 해본 적 있어?',a:['있지. 너랑 하고 싶어. 우리 결혼하자.','너랑은 하고 싶은데, 아직 준비가 안 됐어.'],reply:['응. 나도.\n…잠깐, 나 지금 좀 울 것 같아.','그럼 준비되면 네가 먼저 말해줘.\n나도 가끔은 궁금하단 말이야.']}
};
export function relationshipView(C){
  const r=C.relationship;if(!r)return null;
  return {id:r.region,name:r.name,status:r.status,label:{friend:'소꿉친구',close:'가까워지는 사이',dating:'연인',married:'배우자',separated:'추억으로 남은 인연'}[r.status],marriedAge:r.marriedAge||null};
}
export function relationshipEvent(C,id){
  const key=String(id||'').replace('friend:',''),s=STORIES[key];
  return s&&C.relationship?{...s,id:'friend:'+key,friend:relationshipView(C)}:null;
}
export function dueRelationship(C){
  const r=C.relationship;
  if(!r||r.status==='separated'||r.done.length>=5||C.age-r.lastAge<2)return null;
  const has=k=>r.done.includes(k);
  // Senior club season rows represent official league matches, not friendlies.
  if(!has('debut')&&C.hist.some(row=>!row.youth&&row.apps>0))return 'debut';
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
