import {RULES} from './_career_relationship.js';
import {vacationStory as asiaVacationStory} from './_career_asia_dialogue.js';
import {serviceView} from './_career_military.js';
import {partnerState,partnerView} from './_career_reporter.js';

const VOICES={
  reporter:{plan:'마감 일정 끝나면 며칠 쉴 수 있어요.\n이번엔 취재 일정 없이 같이 어디 다녀올까요?'},
  asia:{plan:'시즌 끝나면 며칠 쉬지?\n나 너랑 어디 좀 가고 싶은데. 이번엔 진짜 멀리ㅋㅋ'},
  south:{plan:'이번 휴가는 나랑 보내자.\n너도 며칠은 푹 쉬고, 나도 너 오래 보고.'},
  africa:{plan:'휴가 계획 세웠어?\n없으면 나랑 갈래? 이번엔 둘이 찍힌 사진 좀 남기자.'},
  europe:{plan:'시즌 끝나면 며칠 비워둘 수 있어?\n너랑 여행 가고 싶어. 어디가 좋을까.'}
};
const f=(t,m='neutral')=>['f',t,m],p=(t,m='neutral')=>['p',t,m],n=t=>['n',t,'neutral',false];
function completedTrips(r){
  const done=new Set((r.vacationsDone||[]).filter(x=>['beach','ski'].includes(x)));
  if(['beach','ski'].includes(r.lastVacation?.destination))done.add(r.lastVacation.destination);
  return r.vacationsDone=[...done];
}
export function vacationEvent(C){
  const r=partnerState(C);
  if(!r||C.phase!=='result'||C.age<18||!['dating','married'].includes(r.status)||r.pendingDebut||C.forced||C.bodyOut||C.age>=40||serviceView(C))return null;
  const done=completedTrips(r),trip=r.vacation?.age===C.age?r.vacation:null,remaining=['beach','ski'].filter(x=>!done.includes(x));
  if(!trip&&!remaining.length)return null;
  if(!trip&&r.lastVacationAge!=null&&C.age-r.lastVacationAge<3)return null;
  const V=VOICES[r.region],remote=r.residence!==(C.club?.nat||C.nation),base={friend:partnerView(C),remote:false,vacation:true};
  if(!trip){
    const choices={beach:['해변으로 가자. 며칠 느긋하게 쉬고 싶어.','좋아. 수영복 챙겨야겠다. 어디가 좋을지 나도 찾아볼게.'],ski:['눈이 남아 있는 산으로 가자. 스키장도 찾아볼까?','좋아. 아직 눈 남아 있는 데 찾아보자. 숙소도 따뜻한 데로.']};
    return {...base,id:'friend:vacation-plan',t:'시즌 종료 · 휴가 계획',channel:'message',d:V.plan+(remote?'\n어디서 만나서 같이 갈지도 정하자.':''),destinations:[...remaining,null],a:[...remaining.map(x=>choices[x][0]),'이번 휴가는 각자 쉬자. 여행은 다음에 가고 싶어.'],replies:[...remaining.map(x=>choices[x][1]),'알겠어. 이번엔 푹 쉬자. 여행은 다음에 시간 맞춰보자.']};
  }
  const ski=trip.destination==='ski',recovering=!!C.hist?.at(-1)?.injured,cg=ski?'lodge':'sunset';
  const memory=(line)=>{line[5]=cg;return line;};
  // Replies are written as pairs: no shared response to an unrelated question.
  const beach={
    asia:{start:['너 선크림 발랐어? 코 끝에 안 발랐을 것 같은데.','발랐어. …왜, 하얗게 남았어?'],play:['응. 이쪽 봐봐. 가만히 있어.','사진 찍는 거 아니지?','아니야ㅋㅋ 다 됐다. 이제 들어가자.'],quiet:['야, 저기 봐. 해 진다. 사진은 나중에 찍고.','응. 여기 앉을까?'],close:['어릴 땐 너랑 멀리 갈 줄은 몰랐는데. 맨날 같은 길만 다녔잖아.','난 그때도 좋았어. 근데 오늘도 좋네.'],home:['도착했어? 코 빨개진 거 사진으로 보니까 더 웃김ㅋㅋ','나도 도착. 그 사진은 너만 봐. 나머지는 내일 보낼게.']},
    south:{start:['빨리 와. 물 생각보다 따뜻해.','잠깐만. 나 아직 신발도 못 벗었어.'],play:['손 줘. 큰 파도 오면 같이 뛰는 거야.','네가 먼저 놓는 거 아니지?','안 놔. 하나, 둘… 지금!'],quiet:['나 이 시간 기다렸어. 아까부터 네가 사진 찍느라 바빴잖아.','이제 안 찍을게. 여기 와.'],close:['지금은 네가 가는 날 생각 안 하려고. 오늘이 아까워서.','응. 나도 오늘은 여기 있을게.'],home:['잘 도착했어. 벌써 네가 보고 싶다. 오늘은 좀 심한데.','나도. 사진 보니까 더 그러네. 오늘 푹 자고 내일 전화하자.']},
    africa:{start:['저기까지 먼저 가는 사람 지는 거다. 오늘은 천천히 갈 거야.','그 말 하면서 왜 벌써 앞서가는데ㅋㅋ'],play:['너 방금 파도 피하는 거 찍혔어. 아주 빠르던데?','보여줘. 보고 지울지 결정할게.','그런 권한은 없어ㅋㅋ 대신 내 웃긴 사진도 하나 찍어.'],quiet:['휴대폰 내려놨다. 이제 내가 기억할 차례.','까먹으면 나한테 물어봐. 나도 보고 있을게.'],close:['우리 생각보다 잘 노네. 너 맨날 축구만 하는 줄 알았는데.','나도 오늘 처음 안 것 같아. 다음에 네가 또 데려가.'],home:['사진 정리 완료. 삭제 요청은 안 받음ㅋㅋ','일단 보내봐. 나도 네 거 찾았어. 공평하게 교환하자.']},
    europe:{start:['모래 뜨겁다. 저쪽 그늘로 가자.','바로 물에 들어갈 줄 알았는데.'],play:['너 웃고 있는 사진 찍었어. 이번 건 안 지워도 되겠다.','보여줘. …네 것도 같이 찍자.','응. 다음 건 내가 안 보고 있을 때 찍어줘.'],quiet:['아직 들어가지 말자. 여기 자리 괜찮네.','응. 해 질 때까지만 더 있자.'],close:['별일 안 했는데 벌써 저녁이네. 오늘은 그게 좋다.','내일도 급하게 나가지 말자. 늦잠도 자고.'],home:['집에 왔어. 모래가 아직도 나오네. 가방에서.','나도 신발에서 계속 나와. 사진은 내일 보내줄게. 푹 쉬어.']}
  };
  const snow={
    asia:{start:['축구 잘한다고 이것도 잘하는 척하면 안 된다?','안 그래. 일단 넘어져도 못 본 척해줘.'],play:['못 본 척은 해줄게. 웃는 건 약속 못 해ㅋㅋ','너도 넘어지면 똑같이 해준다.','그래. 일단 같이 내려가. 나 두고 가지 말고.'],quiet:['손 녹는다. 아까는 너무 추워서 네 손 잡은 줄도 몰랐어.','지금은 알아? 또 잡고 있는데.'],close:['응. 그래서 안 놓고 있잖아. …밖에 눈 더 온다.','그러네. 조금만 더 보고 가자.'],home:['집 도착. 다리 아파ㅋㅋ 너는 괜찮아?','나도 좀 뻐근해. 내일 늦잠 자자. 사진도 내일 보내고.']},
    south:{start:['나 저쪽 먼저 가보고 싶어. 같이 내려올래?','응. 무서우면 중간에 천천히 가자.'],play:['아까는 내가 더 빨랐지? 너 기다리는 것도 재밌네.','이번엔 나 기다리지 마. 같이 내려가자.','좋아. 대신 옆에 있어. 네가 보이는 데가 좋아.'],quiet:['손 좀 줘봐. 아직 차가워?','좀. 컵 잡고 있었는데도 그러네.'],close:['그럼 이러고 있어. 아까는 장갑 때문에 몰랐는데 이제 따뜻하다.','응. 조금만 더 이러고 있자.'],home:['집에 왔어. 아까 창밖에 눈 오던 거 자꾸 생각나.','나도. 네가 손 잡아줬던 것도. 오늘은 푹 쉬어.']},
    africa:{start:['내려가는 건 좋은데 멈추는 게 문제다. 나 믿어도 돼?','그 얘긴 출발 전에 해야 하는 거 아니야?'],play:['봤지? 아주 안전하게 멈췄어.','앉아서 멈춘 거 같은데.','말은 정확하게. 아무도 안 다치고 멈춘 거야ㅋㅋ'],quiet:['컵 들고 있으니까 이제야 손에 감각이 돌아오네.','아까 안 추운 척하더니.'],close:['너도 그랬잖아. 우리 둘 다 괜히 멀쩡한 척했네.','내일은 춥다고 먼저 말하기로 하자.'],home:['도착. 내일 걸음걸이 좀 이상해도 모른 척해줘ㅋㅋ','나도 그럴 것 같은데. 내일은 둘 다 집에서 쉬자.']},
    europe:{start:['처음엔 짧은 코스부터 가자. 괜찮으면 한 번 더 타고.','좋아. 네 뒤 따라갈게.'],play:['아까 네가 찍어준 사진 봤어. 얼굴은 안 보이고 눈밖에 없네.','그때 눈이 너무 와서. 대신 내려오는 건 제대로 찍었어.','그건 나중에 보여줘. 지금은 한 번 더 타자.'],quiet:['여기 앉자. 창문 가까운데 안 춥네.','응. 컵 뜨거우니까 조심해.'],close:['내일은 조금 늦게 나가도 되겠다. 아침에도 눈 오면 여기서 보고.','좋아. 내일도 이 자리 먼저 잡자.'],home:['집에 왔어. 여기선 눈이 안 오니까 좀 허전하네.','창가 사진 보내줄게. 오늘은 정리 나중에 하고 쉬어.']}
  };
  const resting={
    asia:{start:['오늘은 구경만 하자. 너 다리 신경 쓰여서 내가 더 못 타겠어.','응. 대신 저기까지 천천히 걸을까?'],play:['이쪽으로 와. 여기서 찍으면 눈이 다 나온다.','네가 찍어줘. 이번엔 눈 안 감을게.','믿는다ㅋㅋ 하나, 둘.']},
    south:{start:['오늘은 너랑 눈 구경할래. 타는 건 다음에도 할 수 있잖아.','응. 나도 그냥 걷는 게 좋겠어.'],play:['잠깐만. 여기 네 옆에 서볼게. 같이 찍자.','휴대폰 줘. 내가 들게.','조금 더 붙어. 우리 둘 다 나와야지.']},
    africa:{start:['오늘 일정. 걷고, 쉬고, 따뜻한 거 마시기. 의견 있어?','아주 마음에 들어. 쉬는 시간은 넉넉하게.'],play:['나 지금 눈 안 감았지? 방금 사진 좀 봐줘.','감았어. 아주 편하게.','다시 찍어ㅋㅋ 이번엔 셋까지 꼭 세.']},
    europe:{start:['오늘은 타지 말자. 난 저쪽 산책길이 더 궁금해.','응. 거기로 가자. 천천히.'],play:['여기서 사진 하나 찍어줄래? 뒤에 눈 보이게.','응. 조금만 왼쪽으로 와.','이 정도? 너도 같이 찍자.']}
  };
  beach.reporter={start:['바다 소리가 생각보다 크네요. 잠깐만, 조금 더 들어볼래요.','네. 오늘은 녹음 안 하셔도 돼요.'],play:['알아요. 지금은 그냥 듣는 거예요. 같이요.','그럼 저도 옆에 있을게요.','좋아요. 물 좀 더 따뜻해지면 같이 들어가요.'],quiet:['오늘은 사진을 별로 안 찍었네요. 그래도 다 기억날 것 같아요.','지금 같이 보고 있으니까요.'],close:['취재하러 왔으면 지금쯤 방에서 원고 썼을 텐데. 여기 앉아 있으니까 좋네요.','내일도 천천히 나와요. 시간표 없이요.'],home:['집에 왔어요. 가방에서 모래가 계속 나오네요.','저도요. 사진은 내일 마저 보낼게요. 오늘 푹 쉬어요.']};
  snow.reporter={start:['저도 천천히 탈래요. 잘 타는 척하다가 내일 못 걷겠어요.','좋아요. 완만한 쪽부터 가요.'],play:['아까 넘어지는 거 봤죠? 기사로 안 써주실 거죠.','그건 제가 안 써도 얼굴에 다 나오는데요.','그럼 웃긴 얘기 하나 생긴 걸로 할게요. 한번 더 타요.'],quiet:['오늘은 물어볼 말보다 같이 보고 싶은 게 더 많네요.','눈 오는 거요?'],close:['그것도요. 그리고 지금 여기 앉아 있는 것도요.','저도 지금 좋네요. 조금만 더 있다 가요.'],home:['집에 왔어요. 창가에서 보던 눈이 자꾸 생각나요.','저도요. 사진보다 그때 얘기가 더 기억나네요. 오늘은 푹 쉬어요.']};
  resting.reporter={start:['오늘은 눈 구경만 해요. 다리 신경 쓰이면 천천히 쉬어가고요.','네. 저쪽 산책길로 가볼까요?'],play:['여기서 사진 한 장 찍어줄래요? 오늘 같이 온 거 남기고 싶어서요.','네. 조금만 기다려요. 이번엔 저도 같이 찍어요.','좋아요. 둘이 나온 게 더 좋겠네요.']};
  const tripVoice=(ski?snow:beach)[r.region],day=ski&&recovering?resting[r.region]:tripVoice;
  const sameHome=r.status==='married'&&!remote;
  const story=r.region==='asia'?asiaVacationStory(C,r,ski,recovering,sameHome):[
    n(remote?'각자 출발해 약속한 곳에서 만났다. 짐을 받아 들고 함께 숙소로 향했다.':'마지막 팀 일정이 끝나고 여행 가방을 챙겼다. 이동하는 동안 못다 잔 잠을 나눠 잤다.'),
    n(ski?'눈이 남아 있는 고산 리조트에 도착했다. 짐을 풀고 밖으로 나서자 차가운 공기가 볼에 닿았다.':'숙소에 짐을 놓고 수영복으로 갈아입었다. 해변에 나오자 모래가 발밑에서 푹 꺼졌다.'),
    f(day.start[0],'happy'),p(day.start[1]),
    n(ski?(recovering?'무리해서 타지 않고 눈 쌓인 산책길을 걸었다. 발자국이 없는 곳에서 서로의 사진을 찍어줬다.':'완만한 코스를 골라 천천히 내려왔다. 몇 번 오르내리자 장갑 안까지 땀이 났다.'):'물가에서 파도를 피하다 결국 함께 물에 들어갔다. 젖은 머리를 보고 서로 웃느라 사진도 몇 번 다시 찍었다.'),
    f(day.play[0],'happy'),p(day.play[1],'happy'),f(day.play[2],'happy'),
    memory(n(ski?'해가 기울어 산장으로 돌아왔다. 장비를 내려놓고 편한 옷으로 갈아입은 뒤 창가에 앉았다. 따뜻한 컵 너머로 눈이 내리기 시작했다.':'몸을 말리고 모래 위에 앉았다. 아까보다 길어진 그림자가 둘 사이에 나란히 놓였다.')),
    memory(f(tripVoice.quiet[0],'shy')),memory(p(tripVoice.quiet[1],'happy')),
    memory(n(ski?'컵을 잠시 내려놓았다. 창밖으로 지나가는 눈송이를 따라 함께 고개를 돌렸다.':'휴대폰을 옆에 내려놓았다. 한동안 파도 소리만 들렸다.')),
    memory(f(tripVoice.close[0],'shy')),memory(p(tripVoice.close[1],'happy')),
    memory(n('마지막 날에는 함께 찍은 사진을 골랐다. 돌아가는 길에 다시 보자고 휴대폰에 저장해뒀다.')),
    f(sameHome?'아까 찍은 거 보냈어. 우리 표정 좀 봐ㅋㅋ':tripVoice.home[0],'happy'),p(sameHome?'봤어ㅋㅋ 내 사진도 보낼게. 정리는 내일 하고 오늘은 쉬자.':tripVoice.home[1],'happy'),n(sameHome?'짐은 한쪽에 세워두고 사진을 주고받았다. 잠시 뒤 같은 소파에 앉아 나머지 사진도 함께 넘겨봤다.':'집에 도착했다는 연락을 나눴다. 짐을 다 풀기 전에 사진부터 한 번 더 열어봤다.')
  ];
  story.slice(-3).forEach(line=>{line[4]='message';});
  // Keep before/after and the legacy completion pick for already-open older clients.
  return {...base,id:'friend:vacation-trip',t:'시즌 후 휴가 · '+(ski?'설산 리조트':'해변 여행'),channel:'story',wardrobe:trip.destination,place:3,d:'잘 다녀왔네. 오늘은 푹 쉬자.',a:['여행 마치기'],replies:['응. 같이 가줘서 고마워.'],script:{story,before:story,after:[[]]}};
}
export function completeVacation(C,pick){
  const ev=vacationEvent(C);if(!ev||!Number.isInteger(pick)||!(ev.a[pick]||ev.channel==='story'&&pick===1))throw new Error('휴가 선택을 다시 확인해 주세요.');
  const r=partnerState(C);
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
export function vacationPending(C){return partnerState(C)?.vacation?.age===C.age;}
