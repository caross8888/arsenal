// Cloudflare 복제 사이트의 Worker. 지금은 화면·그림만 확인하는 단계라 API는 아직 연결하지 않았다.
// /api/* 만 여기로 온다(wrangler.jsonc의 run_worker_first). 나머지는 정적 파일로 바로 나간다.
export default {
  async fetch(request){
    return new Response(JSON.stringify({error: 'Cloudflare 복제 사이트 준비 중이에요. API는 아직 연결 전입니다.'}), {
      status: 503,
      headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'},
    });
  },
};
