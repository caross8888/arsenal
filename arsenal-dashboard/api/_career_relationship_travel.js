import {ensureRelationship,relationshipView,isDistant,RULES} from './_career_relationship.js';
import {serviceView} from './_career_military.js';

const VOICES={
  asia:{plan:'시즌 끝나면 며칠 쉴 수 있어?\n이번엔 동네 말고 좀 멀리 가볼까. 너랑 여행은 아직 못 해봤잖아ㅋㅋ',beach:'야, 바다 색 좀 봐.\n사진 보내는 거 말고 같이 보고 있으니까 좋다.',ski:'눈 보니까 좀 신나는데?ㅋㅋ\n축구 잘한다고 이것도 잘하는 척하면 안 된다?',rest:'응. 오늘은 급하게 안 움직여도 되니까 좋네.',close:'다음엔 내가 찾아볼게.\n너랑 어디 가는 게 생각보다… 아니, 그냥 좋았어ㅋㅋ',home:'도착했어? 사진 보는데 벌써 또 가고 싶네ㅋㅋ\n오늘은 짐부터 풀고 쉬어.'},
  south:{plan:'시즌 끝나면 우리 여행 가자.\n경기 보러 가는 것 말고, 며칠은 둘이 새로운 곳에 있어보고 싶어.',beach:'나 여기 너랑 같이 와보고 싶었어.\n오늘은 네 경기 일정 말고 파도만 봐도 되네.',ski:'나 저쪽 풍경 먼저 보고 싶어.\n타는 건 천천히 해도 되잖아. 우리 쉬러 온 거니까.',rest:'좋아. 오늘은 내 옆에 좀 오래 있어줘.',close:'이번엔 내가 가고 싶던 데도 같이 가줘서 좋았어.\n다음엔 네가 고른 곳에도 가보자.',home:'나 잘 도착했어.\n이번 여행 좋았어. 다음엔 내가 먼저 날짜 찾아볼게.'},
  africa:{plan:'이번 휴가 계획 있어?\n없으면 우리 같이 어디 갈까? 네 근황 말고 같은 풍경 얘기도 좀 하자ㅋㅋ',beach:'여기 오니까 확실히 휴가 같네.\n너도 오늘은 경기 복기 금지. 파도 분석까지 하면 웃긴다ㅋㅋ',ski:'먼저 도착하기 대회는 안 할 거야ㅋㅋ\n잘 타는 것보다 같이 내려오는 게 오늘 목표니까.',rest:'응. 이럴 때는 아무것도 안 하는 것도 일정이지ㅋㅋ',close:'오늘 네 얘기만 한 것도 아니고 내 얘기만 한 것도 아니라 좋았어.\n우리 여행 합은 괜찮은데?',home:'무사히 도착. 사진 정리하다가 웃긴 거 찾았어ㅋㅋ\n네 것도 나중에 보내줘. 오늘은 푹 쉬고.'},
  europe:{plan:'시즌 끝나면 며칠 비어 있어?\n시간 맞으면 같이 여행 가고 싶어. 각자 가고 싶은 곳부터 얘기해볼까.',beach:'사진보다 바람이 좋네.\n이건 같이 와야 알 수 있는 거니까.',ski:'여긴 조용해서 좋다.\n타기 전에 잠깐만 풍경 보고 가자.',rest:'좋아. 쉬는 날까지 뭘 해내야 하는 건 아니니까.',close:'다음에도 이렇게 며칠 같이 보내고 싶어.\n일정은 미리 맞추고. 이번처럼.',home:'도착했어. 가방은 아직 안 풀었고.\n같이 찍은 사진부터 보고 있어. 잘 다녀왔네, 우리.'}
};
const f=(t,m='neutral')=>['f',t,m],p=(t,m='neutral')=>['p',t,m],n=t=>['n',t,'neutral',false];
function completedTrips(r){
  const done=new Set((r.vacationsDone||[]).filter(x=>['beach','ski'].includes(x)));
  if(['beach','ski'].includes(r.lastVacation?.destination))done.add(r.lastVacation.destination);
  return r.vacationsDone=[...done];
}
export function vacationEvent(C){
  const r=ensureRelationship(C);
  if(!r||C.phase!=='result'||C.age<18||!['dating','married'].includes(r.status)||r.pendingDebut||C.forced||C.bodyOut||C.age>=40||serviceView(C))return null;
  const done=completedTrips(r),trip=r.vacation?.age===C.age?r.vacation:null,remaining=['beach','ski'].filter(x=>!done.includes(x));
  if(!trip&&!remaining.length)return null;
  if(!trip&&r.lastVacationAge!=null&&C.age-r.lastVacationAge<3)return null;
  const V=VOICES[r.region],remote=isDistant(C),base={friend:relationshipView(C),remote:false,vacation:true};
  if(!trip){
    const choices={beach:['해변으로 가자. 며칠 느긋하게 쉬고 싶어.','좋아. 둘 다 쉴 수 있는 날짜부터 정하자. 해변이랑 숙소도 같이 찾아보자.'],ski:['눈이 남아 있는 산으로 가자. 스키장도 찾아볼까?','좋아. 운영 중인 고산 리조트부터 찾아보자. 무리한 일정 말고 여유 있게 가자.']};
    return {...base,id:'friend:vacation-plan',t:'시즌 종료 · 휴가 계획',channel:'message',d:V.plan+(remote?'\n우리 이동편이랑 만날 곳도 같이 맞추자.':''),destinations:[...remaining,null],a:[...remaining.map(x=>choices[x][0]),'이번 휴가는 각자 쉬자. 여행은 다음에 가고 싶어.'],replies:[...remaining.map(x=>choices[x][1]),'알겠어. 이번엔 푹 쉬자. 여행은 다음에 시간 맞춰보자.']};
  }
  const ski=trip.destination==='ski',recovering=!!C.hist?.at(-1)?.injured,cg=ski?'lodge':'sunset';
  const memory=(line)=>{line[5]=cg;return line;};
  const play={
    asia:ski?(recovering?'오늘은 그냥 구경만 하자. 같이 온 건데 꼭 타야 되는 건 아니잖아.':'잠깐ㅋㅋ 나 아직 출발 안 했어. 같이 내려가자며.'): '사진 찍어준다더니 왜 네가 먼저 웃어ㅋㅋ 나 이상하게 나왔어?',
    south:ski?(recovering?'오늘은 내가 네 옆에서 천천히 걸을게. 풍경만 봐도 충분해.':'아까 내려올 때 봤어? 이번엔 내가 먼저 출발할게. 넌 옆에 있어줘.'): '이쪽으로 와봐. 여기 물 따뜻해. 발만 담그고 가기엔 좀 아깝잖아.',
    africa:ski?(recovering?'오늘 목표는 산책이랑 따뜻한 거 마시기. 기록 경신 같은 건 없어ㅋㅋ':'잠깐, 누가 먼저 내려가나 시합으로 바뀐 거 아니지? 같이 가기로 했잖아ㅋㅋ'): '방금 파도 피한 거야? 경기장에서는 그렇게 잘 뛰더니 여기서는 나보다 느린데ㅋㅋ',
    europe:ski?(recovering?'오늘은 타지 말고 천천히 걷자. 나도 이 풍경 더 보고 싶어.':'아까 그 코스 한번 더 갈까. 이번에는 내가 앞에 갈게.'): '그 사진 지우지 마. 네가 웃고 있는 건 그게 제일 나아.'
  };
  const quiet={
    asia:ski?'눈 오는 거 봐. 내일 길 막히는 거 아니겠지?\n…조금만 더 있다 가고 싶긴 하다.':'야, 저기 봐. 해 진다.\n사진은 잠깐 그만 찍고. 같이 보자.',
    south:ski?'밖은 추운데 여기 있으니까 좋다.\n오늘은 네가 바로 옆에 있어서 더 그런 것 같아.':'오늘 하루 좋았어.\n지금은 말 안 해도 돼. 그냥 내 옆에 조금만 더 있어줘.',
    africa:ski?'아까는 눈 위에서 그렇게 떠들었는데 여기 오니까 조용해지네ㅋㅋ\n이렇게 가만히 같이 있는 것도 좋다.':'우리 오늘 사진 진짜 많이 찍었다ㅋㅋ\n근데 이건 그냥 보고 기억하고 싶어.',
    europe:ski?'조금만 더 여기 앉아 있자.\n눈 그칠 때까지는 아니고. 차 다 마실 때까지.':'아직 들어가기 아쉽다.\n해가 다 질 때까지만 여기 있자.'
  };
  const story=[
    n(remote?'시즌 일정이 모두 끝난 뒤, 서로의 출발지와 이동편을 맞췄다. 약속한 곳에서 합류해 함께 여행지로 향했다.':'시즌 일정이 모두 끝난 뒤, 둘 다 쉴 수 있는 날에 짐을 챙겼다. 함께 이동하며 이번 여행에서 하고 싶은 일을 이야기했다.'),
    n(ski?'눈이 남아 있는 고산 리조트에 도착했다. 숙소에 짐을 풀고 장비와 복장을 챙겨 밖으로 나왔다.':'바닷가 숙소에 짐을 풀고 수영복으로 갈아입었다. 해변으로 나오자 따뜻한 바람과 파도 소리가 먼저 맞아주었다.'),
    f(ski?V.ski:V.beach,'happy'),p('오늘은 급한 일정 없어. 천천히 같이 놀자.'),
    n(ski?(recovering?'이번에는 무리해서 타지 않고 설경이 보이는 산책길을 걸었다. 쉬어갈 곳에서는 나란히 앉아 눈 덮인 풍경을 바라봤다.':'장비를 확인하고 완만한 슬로프부터 천천히 내려왔다. 몇 번 오르내리자 몸이 풀렸고, 서로를 기다리는 시간에도 웃음이 이어졌다.'):'물가에서 파도를 피하다가 결국 함께 물에 들어갔다. 서로 물을 튀기기도 하고, 모래 위로 돌아와 웃긴 포즈로 사진을 찍기도 했다.'),
    f(play[r.region],'happy'),p(ski?'알겠어. 이번엔 네 속도에 맞출게.':'잠깐만. 이번엔 나도 같이 찍자.','happy'),
    f(ski?'응. 조금만 더 같이 있다 가자.':'좋아. 이번엔 둘 다 웃고 있는 걸로 찍자.','happy'),
    memory(n(ski?'해가 기울 무렵 산장으로 돌아왔다. 장비를 내려놓고 편한 옷으로 갈아입은 뒤, 따뜻한 음료를 들고 큰 창가에 나란히 앉았다. 창밖으로 눈이 내리기 시작했다.':'해가 기울자 물에서 나와 얇은 겉옷을 걸쳤다. 숙소로 돌아가는 대신 모래 위에 나란히 앉았다. 바다 위로 주황빛이 길게 번지고 있었다.')),
    memory(f(quiet[r.region],'shy')),memory(p(ski?'응. 아직 따뜻하네. 천천히 마시자.':'응. 나도 조금 더 보고 싶어.','happy')),
    memory(n(ski?'창밖의 눈송이를 따라 시선을 옮겼다. 컵을 두 손으로 감싼 채, 한동안 아무 말 없이 같은 풍경을 바라봤다.':'파도 소리를 들으며 한동안 말없이 수평선을 바라봤다. 낮에 웃고 떠들던 시간이 천천히 가라앉았다.')),
    memory(f(V.close,'shy')),memory(p('나도 오늘 좋았어. 같이 와줘서 고마워.','happy')),
    memory(n('여행 마지막 날, 함께 찍은 사진을 고르고 짐을 챙겼다. 돌아가는 길에도 오늘 보았던 풍경과 웃긴 순간들을 한참 이야기했다.')),
    f(V.home,'happy'),p('나도 잘 도착했어. 오늘은 푹 쉬어. 사진은 내일 마저 보내줄게.','happy'),n('각자의 집에 도착한 뒤 안부를 주고받았다. 사진 속에는 경기장 밖에서 함께 웃던 시간이 남았다.')
  ];
  story.slice(-3).forEach(line=>{line[4]='message';});
  // Keep before/after and the legacy completion pick for already-open older clients.
  return {...base,id:'friend:vacation-trip',t:'시즌 후 휴가 · '+(ski?'설산 리조트':'해변 여행'),channel:'story',wardrobe:trip.destination,place:3,d:'잘 다녀왔네. 오늘은 푹 쉬자.',a:['여행 마치기'],replies:['응. 같이 가줘서 고마워.'],script:{story,before:story,after:[[]]}};
}
export function completeVacation(C,pick){
  const ev=vacationEvent(C);if(!ev||!Number.isInteger(pick)||!(ev.a[pick]||ev.channel==='story'&&pick===1))throw new Error('휴가 선택을 다시 확인해 주세요.');
  const r=C.relationship;
  if(ev.id==='friend:vacation-plan'){
    const destination=ev.destinations[pick];
    if(!destination){r.lastVacationAge=C.age;r.lastVacation={age:C.age,destination:null};return;}
    r.vacation={age:C.age,destination};return;
  }
  const before=r.affinity;r.affinity=Math.min(RULES.max,r.affinity+6);
  r.lastChange={age:C.age,delta:r.affinity-before,reason:'휴가 일정을 함께 정하고 여행을 다녀왔다'};
  r.vacationsDone=[...new Set([...completedTrips(r),r.vacation.destination])];
  r.lastVacationAge=C.age;r.lastVacation={...r.vacation,pick:0};delete r.vacation;
}
export function vacationPending(C){return C.relationship?.vacation?.age===C.age;}
