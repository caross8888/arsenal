// api/_glossary.js — 번역문 인명·팀명 표기 통일 사전
//
// **원문이 아니라 번역 "결과"에 적용한다.** 이게 핵심이다:
//  - 원문을 가공하면 캐시 키(원문 SHA-1)가 통째로 바뀌어 전량 재번역(약 7,000자)이
//    일어난다. 결과에만 손대면 캐시 키는 그대로라 재번역 비용이 0이다.
//  - 치환은 KV에서 꺼낸 "직후"(출력 시점)에 하고, KV에는 구글이 준 원본 번역문을
//    그대로 저장한다. 그래서 이 표를 나중에 고치면 이미 캐시된 과거 번역문까지
//    전부 즉시 교정되고, 그때도 API 호출은 0이다.
//
// 구글 번역은 같은 이름을 문맥마다 다르게 음차한다(실측: 아스널 34회 / 아스날 4회,
// 외데가르드 21회 / 외데고르 2회 / Ødegaard 1회는 아예 번역도 안 됨). 정공법인
// Cloud Translation v3 glossary는 서비스 계정 + GCS 버킷이 필요해서(현재 API 키로는
// 인증 불가) 이 프로젝트 규모엔 과하다.
//
// 표기 기준은 **나무위키**다(사용자 지정). 구글 번역이 뱉는 표기는 기준이 아니다 —
// 실제로 구글은 나무위키와 반대로 쓰는 이름이 많다(외데고르→외데가르드,
// 요케레스→교케레스, 수비멘디→주비멘디). 출처: 나무위키 "아스날 FC/{시즌} 시즌"
// 문서의 스쿼드·리저브·임대/사전계약 표(한글 성명 + 로마자 성명이 같이 있다.
// 접혀 있으므로 "펼치기"를 먼저 눌러야 보인다). 팀명 "아스날"은 나무위키와
// index.html이 일치한다. **시즌이 바뀌면 그 시즌 문서로 다시 대조할 것** —
// 처음엔 25-26 문서로 만들었다가 26-27 영입(콘사·기마랑이스·촐리스·멜리에)이
// 통째로 빠져 있었다.
//
// 단, 아래 일곱은 사용자가 나무위키와 다르게 직접 지정한 값이다 — 나무위키를
// 다시 대조하더라도 이쪽으로 되돌리지 말 것:
//   가브리엘(나무위키: 가브리에우) / 위리엔 팀버(팀버르) /
//   루이스-스켈리(루이스스켈리) / 에미레이츠 스타디움(에미레이트) /
//   브루노 기마랑이스(브루누) / 홀거 퀸테로(홀게르) /
//   에단 은와네리(나무위키에 문서 없음)
//
// 새 표기 흔들림을 발견하면 아래 배열에 [정식표기, [변형들]] 한 줄만 추가하면 된다.

// [정식 표기, [변형 패턴들]]
// 변형은 문자열(그대로 매치) 또는 정규식.
// 순서가 중요하다 — 위에서부터 적용하므로, 성만 먼저 바뀌면 "마르틴 외데가르드"의
// 뒤쪽만 교정되어 이름 부분이 어긋난다. 그래서 풀네임 항목을 성 단독 항목보다 앞에 둔다.
const ENTRIES = [
  // ── 클럽 / 경기장 ─────────────────────────────────────
  ['아스날', ['아스널', /\bArsenal\b/g]],
  ['에미레이츠 스타디움', ['에미레이트 스타디움', '에미리트 스타디움']],

  // ── 감독 ──────────────────────────────────────────────
  ['미켈 아르테타', [/\bMikel Arteta\b/g]],
  ['아르테타', ['아르타타', /\bArteta\b/g]],

  // ── 1군 (풀네임 먼저, 그 다음 성 단독) ─────────────────
  ['마르틴 외데고르', ['마틴 외데고르', '마르틴 외데가르드', '마틴 외데가르드', '마르틴 오데가르드', /\bMartin (Ø|O)degaard\b/g]],
  // Ø·é 같은 비ASCII 글자는 \w가 아니라서 그 앞뒤의 \b가 단어 경계로 성립하지
  // 않는다(" Ødegaard"는 공백과 Ø 둘 다 non-word라 전이가 없음) — 이런 자리엔
  // \b 대신 라틴 문자 룩어라운드를 쓴다.
  ['외데고르', ['외데가르드', '오데가르드', '오데고르', '외데고르드', /(?<![A-Za-zØø])(Ø|O)degaard\b/g]],

  ['빅토르 요케레스', ['빅토르 교케레스', '빅토르 기외케레스', /\bViktor Gy(ö|o)keres\b/g]],
  ['요케레스', ['교케레스', '기외케레스', /(?<![A-Za-z])Gy(ö|o)keres\b/g]],

  ['마르틴 수비멘디', ['마틴 수비멘디', '마르틴 주비멘디', '마틴 주비멘디', /\bMart(í|i)n Zubimendi\b/g]],
  ['수비멘디', ['주비멘디', /\bZubimendi\b/g]],

  ['부카요 사카', [/\bBukayo Saka\b/g]],
  ['사카', ['샤카', /\bSaka\b/g]],

  ['가브리엘 마갈량이스', ['가브리에우 마갈량이스', /\bGabriel Magalh(ã|a)es\b/g]],
  ['가브리엘 제주스', ['가브리에우 제주스', '가브리엘 지저스', '가브리엘 예수', /\bGabriel Jesus\b/g]],
  ['가브리엘 마르티넬리', ['가브리에우 마르티넬리', /\bGabriel Martinelli\b/g]],
  // 성 없는 "가브리엘" 단독은 일부러 손대지 않는다 — 마갈량이스·제주스·마르티넬리
  // 셋 중 누구인지 문맥 없이는 알 수 없어서, 잘못 붙이면 다른 선수 이름이 된다.
  ['마르티넬리', [/\bMartinelli\b/g]],

  ['데클란 라이스', ['디클런 라이스', '데클런 라이스', /\bDeclan Rice\b/g]],
  ['윌리엄 살리바', ['윌리암 살리바', /\bWilliam Saliba\b/g]],
  ['살리바', [/\bSaliba\b/g]],
  ['카이 하베르츠', ['카이 하버츠', /\bKai Havertz\b/g]],
  ['하베르츠', ['하버츠', /\bHavertz\b/g]],
  ['미켈 메리노', [/\bMikel Merino\b/g]],
  ['위리엔 팀버', ['위리엔 팀버르', '유리엔 팀버르', '유리엔 팀버', '유리앤 팀버', /\bJurri(ë|e)n Timber\b/g]],
  ['팀버', ['팀버르', /\bTimber\b/g]],
  ['리카르도 칼라피오리', [/\bRiccardo Calafiori\b/g]],
  ['칼라피오리', [/\bCalafiori\b/g]],
  ['마일스 루이스-스켈리', ['마일스 루이스스켈리', '마일스 루이스 스켈리', /\bMyles Lewis-Skelly\b/g]],
  ['루이스-스켈리', ['루이스스켈리', /\bLewis-Skelly\b/g]],
  ['에베레치 에제', ['에베레치 에즈', /\bEberechi Eze\b/g]],
  ['노니 마두에케', [/\bNoni Madueke\b/g]],
  ['마두에케', [/\bMadueke\b/g]],
  ['다비드 라야', ['데이비드 라야', /\bDavid Raya\b/g]],
  ['벤 화이트', [/\bBen White\b/g]],
  ['레안드로 트로사르', ['레안드로 트로사드', '트로사드', /\bLeandro Trossard\b/g]],
  ['트로사르', [/\bTrossard\b/g]],
  ['크리스티안 모스케라', ['크리스찬 모스케라', /\bCristhian Mosquera\b/g]],
  ['모스케라', [/\bMosquera\b/g]],
  ['피에로 잉카피에', ['피에로 인카피에', /\bPiero Hincapi(é|e)(?![A-Za-zé])/g]],
  ['잉카피에', ['인카피에', /\bHincapi(é|e)(?![A-Za-zé])/g]],
  ['케파 아리사발라가', ['케파 아리자발라가', /\bKepa Arrizabalaga\b/g]],
  ['크리스티안 뇌르고르', ['크리스티안 노르가르드', '크리스티안 뇌르가르드', /\bChristian N(ø|o)rgaard\b/g]],
  ['뇌르고르', ['노르가르드', '뇌르가르드', /(?<![A-Za-zØø])N(ø|o)rgaard\b/g]],
  ['토미 셋퍼드', ['토미 세트포드', /\bTommy Setford\b/g]],
  ['맥스 다우먼', ['맥스 도우먼', /\bMax Dowman\b/g]],
  ['다우먼', ['도우먼', /\bDowman\b/g]],
  // 나무위키에 개인 문서가 없어 퍼스트네임은 사용자가 직접 지정했다.
  ['에단 은와네리', ['이선 은와네리', '에턴 은와네리', /\bEthan Nwaneri\b/g]],
  ['은와네리', [/\bNwaneri\b/g]],

  // ── 2026-27 영입 ──────────────────────────────────────
  ['에즈리 콘사', [/\bEzri Konsa\b/g]],
  ['콘사', [/\bKonsa\b/g]],
  ['브루노 기마랑이스', ['브루누 기마랑이스', /\bBruno Guimar(ã|a)es\b/g]],
  ['기마랑이스', [/\bGuimar(ã|a)es\b/g]],
  ['크리스토스 촐리스', [/\bChristos Tzolis\b/g]],
  ['촐리스', [/\bTzolis\b/g]],
  ['일란 멜리에', [/\bIllan Meslier\b/g]],
  ['멜리에', [/\bMeslier\b/g]],

  // ── 아카데미 유망주 (미리 등록) ────────────────────────
  // 성 단독 항목을 넣을지는 그 성이 일반 단어와 겹치는지로 판단한다 —
  // 예컨대 Salmon(새먼)은 성만 잡으면 "연어"까지 건드리게 되므로 풀네임만 넣는다.
  ['말리 새먼', [/\bMarli Salmon\b/g]],
  ['악셀 돈체프', [/\bAxel Donczew\b/g]],
  ['돈체프', [/\bDonczew\b/g]],
  ['루이 코플리', [/\bLouie Copley\b/g]],
  ['코플리', [/\bCopley\b/g]],
  ['안드리아 바르티슈빌리', [/\bAndria Bartishvili\b/g]],
  ['바르티슈빌리', [/\bBartishvili\b/g]],
  ['빅터 오지안부나', [/\bVictor Ozhianvuna\b/g]],
  ['오지안부나', [/\bOzhianvuna\b/g]],
  // 퀸테로 형제는 성만으로 구분이 안 되므로(에드윈·홀거) 풀네임만 넣는다 —
  // 성 없는 "가브리엘"을 건드리지 않는 것과 같은 이유.
  ['에드윈 퀸테로', [/\bEdwin Quintero\b/g]],
  ['홀거 퀸테로', ['홀게르 퀸테로', /\bH(ó|o)lger Quintero\b/g]],
  ['시아다흐 오닐', [/\bCeadach O['’]Neill\b/g]],
  ['오닐', [/\bO['’]Neill\b/g]],
  ['이고르 타이욘', [/\bIgor Tyjon\b/g]],
  ['타이욘', [/\bTyjon\b/g]],
  ['엘리야 업슨', [/\bElijah Upson\b/g]],
  ['업슨', [/\bUpson\b/g]],

  // ── 상대팀 (기사에 반복해서 나올 이번 시즌 상대만) ──────────
  // 구글은 같은 기사 안에서도 "사바 FK"(제목)와 "사바흐"(요약)로 갈렸다.
  // "사바" 단독은 다른 단어의 일부일 수 있어 FK가 붙은 형태만 잡는다.
  ['사바흐 FK', ['사바 FK', /\bSabah FK\b/g]],

  // ── 축구 용어 오역 교정 ────────────────────────────────
  // 구글 NMT는 **문장 단위**로 번역하므로, 그 문장 안에 축구를 가리키는 단서가
  // 없으면 일반 뜻으로 빠진다. 실측:
  //   "Ruthless shooting from Arsenal"  -> 무자비한 슈팅  (Arsenal이 단서)
  //   "Ruthless shooting"               -> 무자비한 사격  (단서 없음)
  // 포스트 뒤쪽 문장에 Arsenal이 있어도 앞 문장은 못 구해준다 — 기자들이 쓰는
  // 짧고 툭 던지는 문장에서 자주 터진다.
  //
  // 여기 넣을 항목은 "축구 기사에 그 단어가 나오면 100% 오역"인 것만으로 제한한다.
  // 한글→한글 치환이라 원문을 볼 수 없어서, 애매한 단어를 넣으면 멀쩡한 문장까지
  // 망가뜨린다. 조사(을/를/의/은)는 명사 뒤에 붙으므로 어간만 바꾸면 된다.
  // "촬영"은 넣지 말 것 — 축구 문맥에서 shooting이 새는 방향은 사격이고(실측 4건 중
  // 2건 사격, 촬영 0건), 촬영은 유튜브 유니폼 발표·비하인드 영상 제목에 원래 뜻으로
  // 늘 나온다("photoshoot" → 사진 촬영 현장, "Filming with Saka" → 사카와 함께 촬영).
  // 한 번 촬영으로 샜던 건 원문 치환 규칙이 한국어를 끼워 넣어서 생긴 것이었다.
  ['슈팅', ['사격']],
  ['정확한 마무리', ['임상 마무리', '임상적 마무리', '임상적인 마무리']],
  ['무실점', ['깨끗한 경력', '깨끗한 시트']],
  ['멀티골', ['중괄호']],
  ['추가시간', ['부상 시간']],
];
// 한 항목의 변형들을 "정규식 하나"로 합쳐 한 번만 스캔한다. 변형마다 따로
// replace를 돌리면 앞선 변형이 만들어낸 정식 표기를 뒤 변형이 다시 잡아먹는다 —
// 예: 변형 목록에 '유리엔 팀버'와 '위리엔 팀버'가 같이 있으면 앞엣것이 만든
// "위리엔 팀버르"의 앞부분을 뒤엣것이 또 치환해서 "위리엔 팀버르르"가 된다.
// 한 번의 패스로 처리하면 치환 결과를 다시 훑지 않으므로 이 연쇄가 생기지 않는다.
//
// 대안(alternation)은 "가장 긴 것"이 아니라 "먼저 쓴 것"이 매치되므로,
// 문자열 변형은 길이 내림차순으로 정렬해서 넣는다. 라틴 문자 정규식 변형은
// 한글 변형과 같은 자리에서 경합할 일이 없어 뒤에 붙여도 무방하다.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RULES = ENTRIES.map(([canonical, variants]) => {
  const strs = variants.filter(v => typeof v === 'string')
    .sort((a, b) => b.length - a.length)
    .map(escapeRe);
  const res = variants.filter(v => typeof v !== 'string')
    .map(v => '(?:' + v.source + ')');
  return { canonical, re: new RegExp(strs.concat(res).join('|'), 'g') };
});

/**
 * 번역문 한 덩어리의 표기를 통일한다. URL 안의 문자열이 바뀌어 링크가 깨지는 걸
 * 막으려고, http(s)/도메인처럼 보이는 토큰은 통째로 들어냈다가 되돌려놓는다.
 */
export function applyGlossary(text) {
  if (typeof text !== 'string' || !text) return text;

  const stash = [];
  // 자리표시자는 NUL로 감싼다 — " 3 " 같은 평범한 형태를 쓰면 본문에 원래 있던
  // "승점 3 점"의 숫자가 URL로 잘못 복원된다. NUL은 본문에 나올 수 없다.
  let out = text.replace(/https?:\/\/\S+|\b[\w.-]+\.(?:com|co\.uk|org|net|social|be|io|app)\S*/gi, (m) => {
    stash.push(m);
    return '\u0000' + (stash.length - 1) + '\u0000';
  });

  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    out = out.replace(rule.re, () => rule.canonical);
  }

  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[Number(i)]);
}

// ── 번역 "전" 원문 구문 치환 ─────────────────────────────────────────────
//
// 위 ENTRIES는 번역 "후" 한국어를 고친다. 그런데 뜻 자체가 잘못 옮겨진 경우는
// 번역 후엔 고칠 수가 없다 — 예컨대 "Anti-ruthless"는 번역되는 순간 "반대되는
// 입장이었다"로 흩어져서, 한국어 쪽엔 치환할 대상이 남아있지 않다. 그래서 이런
// 표현은 구글에 보내기 전에 영어 원문 단계에서 바꾼다.
//
// 비용: 여기 걸린 원문만 해시(캐시 키)가 바뀌어 한 번 재번역된다. 안 걸린 원문은
// 치환 결과가 원문과 똑같아 캐시 키도 그대로라 비용이 0이다.
//
// 규칙은 전부 실측으로 고른 것이다. 원칙 두 가지:
//  1. **대체어는 가능하면 영어로.** 한국어를 끼워 넣으면 구글이 그 단어를 제멋대로
//     바꾼다 — "lack of 결정력"을 보냈더니 "결단력 부족"으로 돌아왔다. 반면
//     "clinical"은 축구 문맥에서 구글이 안정적으로 "결정력"으로 옮긴다.
//     예외를 두지 말 것 — "anti-ruthless"를 한국어 "결정력 부족"으로 바꿨다가,
//     평문 모드로는 멀쩡했는데 실제 SNS가 쓰는 HTML 모드에선 구글이 문장을 못
//     읽고 "shooting"을 "촬영"으로, "결정력 부족"을 "결정하는 것이 불가능했습니다"로
//     흩어버렸다. **검증은 반드시 실제 경로와 같은 format(SNS=html)으로 할 것.**
//  2. **단어 하나가 아니라 구문으로 잡는다.** "ruthless" 단독을 바꾸면 다른 뜻으로
//     쓰인 문장이 망가진다 — 실측: "ruthless in his team selection"(냉정했다)이
//     "결정적인 역할을 했다"로, "a ruthless tackle"(거친 태클)이 "결정력 태클"로
//     뜻이 바뀌었다. "ruthless edge"는 구글이 이미 "결정력"으로 잘 옮겨서 뺐다.
const SOURCE_RULES = [
  // 에이미 로렌스(The Observer)의 조어 — 검색해도 용례가 안 나오는 1회성 표현.
  // HTML 모드 실측: "A lack of clinical finishing, until Martin Odegaard showed
  // them how to do it." → "…방법을 보여주기 전까지는 결정력이 부족했다."
  // (비교: "Poor finishing" → 마무리가 형편없었다 / "Wasteful shooting" → 낭비적인 슈팅)
  // 구문째 먼저 잡고, "shooting"이 안 붙은 경우만 단어 규칙으로 떨어진다.
  [/\banti-ruthless shooting\b/gi, 'a lack of clinical finishing'],
  [/\banti-ruthless\b/gi, 'wasteful'],
  // "lack of ruthlessness" → (그대로) 냉정함의 부족 / (치환) 결정력 부족
  [/\bruthlessness\b/gi, 'clinical finishing'],
  // "ruthless enough to win the title" → (그대로) 냉혹해질 / (치환) 결정력을 갖출
  [/\bruthless enough\b/gi, 'clinical enough'],
  // "ruthless in front of goal" → (그대로) 냉혹했다 / (치환) 결정력이 뛰어났습니다
  [/\bruthless in front of goal\b/gi, 'clinical in front of goal'],
];

// 문장 첫머리처럼 대문자로 시작한 표현이면 대체어도 대문자로 시작시킨다.
function matchCase(original, replacement) {
  const c = original.charAt(0);
  return c && c === c.toUpperCase() && c !== c.toLowerCase()
    ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
    : replacement;
}

/** 구글에 보내기 직전의 영어 원문에 구문 치환을 적용한다. */
export function prepareSource(text) {
  if (typeof text !== 'string' || !text) return text;
  let out = text;
  for (const [re, rep] of SOURCE_RULES) {
    re.lastIndex = 0;
    out = out.replace(re, (m) => matchCase(m, rep));
  }
  return out;
}

/** segments 배열의 텍스트 조각에만 적용한다 — 링크 조각은 표시 URL/핸들이라 건드리면 안 된다. */
export function applyGlossaryToSegments(segments) {
  for (const seg of segments) {
    if (seg && seg.type !== 'link') seg.text = applyGlossary(seg.text);
  }
  return segments;
}

export { ENTRIES as GLOSSARY_ENTRIES };
