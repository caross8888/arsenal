// netlify/functions/config.js
// 위젯용 API 키를 클라이언트에 자동 전달
// → 라이브 탭 매번 키 입력 불필요

exports.handler = async () => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify({
      widgetKey: process.env.API_FOOTBALL_KEY || '',
    }),
  };
};
