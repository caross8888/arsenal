// api/injuries.js — Vercel Serverless Function
const FPL_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';
const ARSENAL_TEAM_NAME = 'Arsenal';
const STATUS_LABEL = {'i':'부상','d':'출전 의심','s':'출장 정지','u':'결장'};
const POS_LABEL = {1:'GK',2:'DF',3:'MF',4:'FW'};
const LOAN_KEYWORDS = /loan|loaned|joined|transferred|released|left the club/i;

const cache = {};
const TTL = 15 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Cache-Control','public, max-age=900');

  if(cache.data && Date.now()-cache.ts<TTL) return res.json(cache.data);

  try {
    const r = await fetch(FPL_URL, {
      headers:{
        'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept':'application/json',
        'Referer':'https://fantasy.premierleague.com/',
      },
      signal:AbortSignal.timeout(8000),
    });
    if(!r.ok) throw new Error(`FPL API: ${r.status}`);
    const json = await r.json();

    const arsenalTeam = json.teams.find(t=>t.name===ARSENAL_TEAM_NAME);
    if(!arsenalTeam) throw new Error('Arsenal not found');
    const arsenalId = arsenalTeam.id;

    const allArsenal = json.elements
      .filter(p => p.team===arsenalId)
      .map(p => ({
        id: p.id,
        name: p.web_name,
        fullName: `${p.first_name} ${p.second_name}`,
        status: p.status,
        statusLabel: STATUS_LABEL[p.status]||p.status,
        news: p.news||'',
        chanceOfPlaying: p.chance_of_playing_next_round,
        position: POS_LABEL[p.element_type]||'?',
        positionType: p.element_type,
        minutes: p.minutes,
      }));

    const injured = allArsenal
      .filter(p => {
        if(p.status === 'a') return false;
        // 임대/방출 키워드 있으면 제외
        if(p.news && LOAN_KEYWORDS.test(p.news)) return false;
        // GK는 minutes 무관 포함
        if(p.positionType === 1) return true;
        // 나머지는 1군 출전 기록 있어야
        return p.minutes > 0;
      })
      .sort((a,b)=>({i:0,d:1,s:2,u:3}[a.status]??9)-({i:0,d:1,s:2,u:3}[b.status]??9));

    const result = {
      teamId: arsenalId,
      totalPlayers: allArsenal.length,
      injuredCount: injured.length,
      availableCount: allArsenal.filter(p=>p.status==='a'&&(p.positionType===1||p.minutes>0)&&(!p.news||!LOAN_KEYWORDS.test(p.news))).length,
      injured,
      updatedAt: new Date().toISOString(),
    };

    cache.data = result;
    cache.ts = Date.now();
    return res.json(result);

  } catch(err){
    return res.status(500).json({error: err.message});
  }
}
