// api/_paging.js — 미디어 목록 "더보기" 공용 규칙 (뉴스·SNS·유튜브)
//
// `_` 접두사라 Vercel 함수로 배포되지 않는 공용 모듈이다(_translate.js와 같은 방식).
//
// 세 목록 모두 기본 PAGE건을 내려주고, 프런트가 `?limit=`을 올려 보내면 그만큼 더 준다.
// 상한(CAP)은 파일마다 다르다 — 공급량과 번역비가 달라서다(뉴스 60 / SNS 40 / 유튜브 50).
// CAP은 각 파일이 "목록을 조립할 때" 적용하고, 여기서는 조립이 끝난 목록 길이만 본다.
//
// 규칙이 둘이다:
//  · limit을 PAGE의 배수로 올린다 — 주소창에 ?limit=37 같은 값을 넣어도 응답 종류가
//    늘어나지 않는다. CDN 캐시와 함수 메모리 캐시가 limit마다 갈리므로 종류를 묶어둬야
//    캐시가 흩어지지 않는다(뉴스라면 20/40/60 세 가지뿐).
//  · 목록 길이로 한 번 더 클램프한다 — 목록이 상한보다 짧은데 더 큰 limit을 그대로 두면
//    hasMore가 계속 true로 나와 더보기 버튼이 영원히 남는다(눌러도 같은 목록이 온다).
export function pageLimit(raw, page, total) {
  const n = parseInt(raw, 10);
  const want = Number.isFinite(n) && n > 0 ? Math.ceil(n / page) * page : page;
  return Math.max(page, Math.min(want, Math.ceil(total / page) * page));
}
