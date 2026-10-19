import {ensureRelationship,relationshipView,isDistant,RULES} from './_career_relationship.js';
import {serviceView} from './_career_military.js';

const VOICES={
  asia:{plan:'시즌 끝나면 며칠 쉴 수 있어?\n이번엔 동네 말고 좀 멀리 가볼까. 너랑 여행은 아직 못 해봤잖아ㅋㅋ',beach:'야, 바다 색 좀 봐.\n사진 보내는 거 말고 같이 보고 있으니까 좋다.',ski:'눈 보니까 좀 신나는데?ㅋㅋ\n축구 잘한다고 이것도 잘하는 척하면 안 된다?',rest:'응. 오늘은 급하게 안 움직여도 되니까 좋네.',close:'다음엔 내가 찾아볼게.\n너랑 어디 가는 게 생각보다… 아니, 그냥 좋았어ㅋㅋ',home:'도착했어? 사진 보는데 벌써 또 가고 싶네ㅋㅋ\n오늘은 짐부터 풀고 쉬어.'},
  south:{plan:'시즌 끝나면 우리 여행 가자.\n경기 보러 가는 것 말고, 며칠은 둘이 새로운 곳에 있어보고 싶어.',beach:'나 여기 너랑 같이 와보고 싶었어.\n오늘은 네 경기 일정 말고 파도만 봐도 되네.',ski:'나 저쪽 풍경 먼저 보고 싶어.\n타는 건 천천히 해도 되잖아. 우리 쉬러 온 거니까.',rest:'좋아. 오늘은 내 옆에 좀 오래 있어줘.',close:'이번엔 내가 가고 싶던 데도 같이 가줘서 좋았어.\n다음엔 네가 고른 곳에도 가보자.',home:'나 잘 도착했어.\n이번 여행 좋았어. 다음엔 내가 먼저 날짜 찾아볼게.'},
  africa:{plan:'이번 휴가 계획 있어?\n없으면 우리 같이 어디 갈까? 네 근황 말고 같은 풍경 얘기도 좀 하자ㅋㅋ',beach:'여기 오니까 확실히 휴가 같네.\n너도 오늘은 경기 복기 금지. 파도 분석까지 하면 웃긴다ㅋㅋ',ski:'먼저 도착하기 대회는 안 할 거야ㅋㅋ\n잘 타는 것보다 같이 내려오는 게 오늘 목표니까.',rest:'응. 이럴 때는 아무것도 안 하는 것도 일정이지ㅋㅋ',close:'오늘 네 얘기만 한 것도 아니고 내 얘기만 한 것도 아니라 좋았어.\n우리 여행 합은 괜찮은데?',home:'무사히 도착. 사진 정리하다가 웃긴 거 찾았어ㅋㅋ\n네 것도 나중에 보내줘. 오늘은 푹 쉬고.'},
  europe:{plan:'시즌 끝나면 며칠 비어 있어?\n시간 맞으면 같이 여행 가고 싶어. 각자 가고 싶은 곳부터 얘기해볼까.',beach:'사진보다 바람이 좋네.\n이건 같이 와야 알 수 있는 거니까.',ski:'여긴 조용해서 좋다.\n타기 전에 잠깐만 풍경 보고 가자.',rest:'좋아. 쉬는 날까지 뭘 해내야 하는 건 아니니까.',close:'다음에도 이렇게 며칠 같이 보내고 싶어.\n일정은 미리 맞추고. 이번처럼.',home:'도착했어. 가방은 아직 안 풀었고.\n같이 찍은 사진부터 보고 있어. 잘 다녀왔네, 우리.'}
};
const f=(t,m='neutral')=>['f',t,m],p=(t,m='neutral')=>['p',t,m],n=t=>['n',t,'neutral',false];
export function vacationEvent(C){
  const r=ensureRelationship(C);
  if(!r||C.phase!=='result'||C.age<18||!['dating','married'].includes(r.status)||r.pendingDebut||C.forced||C.bodyOut||C.age>=40||serviceView(C))return null;
  const trip=r.vacation?.age===C.age?r.vacation:null;
  if(!trip&&r.lastVacationAge!=null&&C.age-r.lastVacationAge<3)return null;
  const V=VOICES[r.region],remote=isDistant(C),base={friend:relationshipView(C),remote:false,vacation:true};
  if(!trip)return {...base,id:'friend:vacation-plan',t:'시즌 종료 · 휴가 계획',channel:'message',d:V.plan+(remote?'\n우리 이동편이랑 만날 곳도 같이 맞추자.':''),a:['해변으로 가자. 며칠 느긋하게 쉬고 싶어.','눈이 남아 있는 산으로 가자. 스키장도 찾아볼까?','이번 휴가는 각자 쉬자. 여행은 다음에 가고 싶어.'],replies:['좋아. 둘 다 쉴 수 있는 날짜부터 정하자. 해변이랑 숙소도 같이 찾아보자.','좋아. 운영 중인 고산 리조트부터 찾아보자. 무리한 일정 말고 여유 있게 가자.','알겠어. 이번엔 푹 쉬자. 여행은 다음에 시간 맞춰보자.']};
  const ski=trip.destination==='ski',recovering=!!C.hist?.at(-1)?.injured;
  const activity=ski?(recovering?'이번엔 슬로프 대신 설경을 보며 쉬자.':'초보 슬로프부터 천천히 같이 타자.'):'물가 따라 조금 걷자. 사진도 같이 찍고.';
  const before=[n(remote?'시즌 일정이 모두 끝난 뒤, 서로의 출발지와 이동편을 맞췄다. 약속한 곳에서 합류해 함께 여행지로 향했다.':'시즌 일정이 모두 끝난 뒤, 둘 다 쉴 수 있는 날에 짐을 챙겼다. 함께 이동하며 이번 여행에서 하고 싶은 일을 이야기했다.'),n(ski?'며칠 뒤, 눈이 남아 있는 고산 리조트에 도착했다. 장비와 복장을 챙기고 눈 덮인 산이 보이는 곳으로 나왔다.':'며칠 뒤, 바닷가 숙소에 짐을 풀었다. 수영복으로 갈아입고 해변으로 나오자 바닷바람이 불었다.'),f(ski?V.ski:V.beach,'happy'),p('오늘은 시간 넉넉해. 우리 하고 싶은 대로 보내자.','happy')];
  const ending=[n(ski?'산 아래로 햇빛이 기울 때까지 함께 시간을 보냈다. 숙소에 돌아와 따뜻한 저녁을 먹으며 오늘 찍은 사진을 골랐다.':'바다 위로 해가 기울 때까지 함께 시간을 보냈다. 숙소에 돌아와 저녁을 먹으며 오늘 찍은 사진을 골랐다.'),f(V.close,'shy'),p('나도 좋았어. 다음엔 네가 원하는 일정도 같이 찾아보자.','happy'),n('여행 마지막 날, 짐을 챙기고 돌아가는 길에 올랐다. 함께 보낸 며칠을 이야기하며 다음 일상으로 돌아갈 준비를 했다.'),f(V.home,'happy'),p('나도 잘 도착했어. 같이 가줘서 고마워. 오늘은 푹 쉬어.','happy'),n('각자의 집에 도착한 뒤 안부를 주고받았다. 사진 속에는 경기장 밖에서 함께 웃던 시간이 남았다.')];
  ending.slice(-3).forEach(line=>{line[4]='message';});
  const replies=[ski?'좋아. 오늘은 속도보다 같이 있는 게 먼저야.':'좋아. 신발 벗고 천천히 가자. 그쪽 풍경도 보고 싶어.',V.rest];
  return {...base,id:'friend:vacation-trip',t:'시즌 후 휴가 · '+(ski?'설산 리조트':'해변 여행'),channel:'scene',wardrobe:trip.destination,place:3,d:'오늘은 어떻게 보내고 싶어?',a:[activity,ski?'테라스에서 따뜻한 거 마시며 쉬자.':'그늘에 앉아서 바다 보며 쉬자.'],replies,script:{before,after:[ [p(activity,'happy'),f(replies[0],'happy'),n(ski?(recovering?'설경이 보이는 산책길을 천천히 걸었다. 쉬어갈 곳에서는 나란히 앉아 눈 덮인 풍경을 바라봤다.':'기본 동작을 확인하고 완만한 슬로프를 천천히 내려왔다. 먼저 멀리 가기보다 서로의 속도에 맞췄다.'):'얕은 물가를 따라 걸으며 서로의 사진을 찍었다. 잘 나온 사진보다 웃긴 사진을 보며 더 오래 웃었다.'),...ending], [p(ski?'오늘은 여기서 느긋하게 쉬고 싶어.':'오늘은 바다 보면서 아무 얘기나 하자.','happy'),f(V.rest,'happy'),n(ski?'따뜻한 음료를 앞에 두고 눈 덮인 산을 바라봤다. 하고 싶은 일이 생기면 그때 움직이기로 했다.':'그늘 아래에 나란히 앉아 파도 소리를 들었다. 각자의 근황을 이야기하다가 잠깐 말없이 바다를 보기도 했다.'),...ending] ]}};
}
export function completeVacation(C,pick){
  const ev=vacationEvent(C);if(!ev||!Number.isInteger(pick)||!ev.a[pick])throw new Error('휴가 선택을 다시 확인해 주세요.');
  const r=C.relationship;
  if(ev.id==='friend:vacation-plan'){
    if(pick===2){r.lastVacationAge=C.age;r.lastVacation={age:C.age,destination:null};return;}
    r.vacation={age:C.age,destination:pick===0?'beach':'ski'};return;
  }
  const before=r.affinity;r.affinity=Math.min(RULES.max,r.affinity+6);
  r.lastChange={age:C.age,delta:r.affinity-before,reason:'휴가 일정을 함께 정하고 여행을 다녀왔다'};
  r.lastVacationAge=C.age;r.lastVacation={...r.vacation,pick};delete r.vacation;
}
export function vacationPending(C){return C.relationship?.vacation?.age===C.age;}
