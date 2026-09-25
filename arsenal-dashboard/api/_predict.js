// api/_predict.js — 경기 예측 모형의 순수 계산부
//
// `_` 접두어라 Vercel 함수로 배포되지 않고 import 전용이다. football.js(운영)와
// scripts/backtest_predict.mjs(검증)가 **같은 코드**를 쓰게 하려고 분리했다 —
// 백테스트가 다른 수식을 돌리면 튜닝 결과를 운영에 옮길 근거가 사라진다.
//
// 모형 자체는 포아송 + 디슨-콜스(1997) 저스코어 보정이고, 팀 강도는 세 가지를
// 섞는다: 이번 시즌 xG 집계 / 이번 시즌 최근 경기에 가중치를 준 득점 / 지난 시즌
// 기록(사전값). 여기에 일정(휴식일·밀집)과 결장을 곱해 λ를 만든다.

export const PARAMS = {
  // 지난 시즌 사전값 → 이번 시즌 기록으로 넘어가는 속도. w = played/(played+priorK).
  // 8이면 8경기째에 반반. 이게 없으면 시즌 초에 "아스날 = 리그 평균"이 된다.
  priorK: 12,        // 백테스트(3시즌) 최적 12~18 구간, 8과 차이는 0.1%대
  // 승격팀처럼 지난 시즌 기록이 없는 팀의 사전값(리그 평균 대비 공격/실점 배수).
  // 감으로 정한 값이 아니라 실제 승격팀 첫 시즌 기록의 평균이다(2023/24~2025/26
  // 승격 9팀: 공격 0.69, 실점 1.35). 다만 팀별 편차가 매우 커서(공격 0.47~0.94)
  // 이 사전값을 38경기짜리 기록처럼 믿으면 안 된다 — promotedPriorK로 따로
  // 약하게 잡는다(실측: 그냥 믿으면 검증 시즌에서 보정 안 한 것보다 나빠졌다).
  promotedAttack: 0.69,
  promotedDefence: 1.35,
  promotedPriorK: 5,
  // 시간 감쇠 반감기(일). 60일이면 두 달 전 경기의 가중치가 절반.
  halfLifeDays: 90,  // 20~45일은 뚜렷이 나빴고 90~150일이 미세하게 좋았다(차이 0.1%대)
  // 이번 시즌 강도에서 xG 집계 vs 감쇠 득점의 비중. 감으로 0.6을 쓰다가, 5대 리그
  // 247팀-시즌으로 "이번 시즌 xG/득점 중 다음 시즌 득점을 더 잘 맞히는 쪽"을 실측해
  // 대체했다(오차 최소가 되는 혼합비). 수비 쪽이 유독 xG 의존도가 높은데, 실점은
  // 운·골키퍼 선방에 크게 흔들려 실제 실점 수가 신호를 덜 담기 때문이다
  // (다음 시즌 실점과의 상관: 피xG 0.595 vs 실제 실점 0.516).
  // xG가 없는 리그·시즌이면 자동으로 감쇠 득점만 쓴다.
  xgWeight: 0.70,          // 공격
  xgWeightDefence: 0.90,   // 수비
  // 근거가 아무리 적어도 평균으로 당기는 최소 보정(지난 시즌까지 없는 팀 대비)
  shrinkK: 6,
  // 디슨-콜스 저스코어 보정 계수(음수) — 0-0·1-1을 올리고 1-0·0-1을 내린다.
  dcRho: -0.13,
  // 홈 우위: 실제 기록에서 뽑되 표본이 작으면 사전값(0.15)으로 당긴다.
  homeEdgePrior: 0.15,
  homeEdgeK: 100,
  homeEdgeCap: 0.30,
  // 일정 — 기준 휴식일보다 짧으면 하루당 공격 -2%(최대 -8%),
  // 최근 14일 3경기를 넘으면 초과 1경기당 -1.5%(최대 -6%).
  restRef: 5,
  restFloor: 2,
  restPenaltyPerDay: 0.02,
  restCap: 0.08,
  congestionRef: 3,
  congestionWindowDays: 14,
  congestionPenalty: 0.015,
  congestionCap: 0.06,
  // 체력 저하는 공격에 더 크게 온다 — 실점 쪽엔 60%만 반영한다.
  restConcedeRatio: 0.6,
  // 결장(포지션별) — football.js 쪽 주석 참고.
  injuryImpact: 0.45,
  injuryLineCap: 0.75,
  // 유럽대항전에서 그 대회 자체 기록을 믿기 시작하는 속도
  compBlendK: 4,
};

export const POS_LABEL = ['골키퍼', '수비', '미드필더', '공격'];
export const ATTACK_WEIGHT  = [0.02, 0.12, 0.35, 0.51];
export const DEFENCE_WEIGHT = [0.22, 0.45, 0.28, 0.05];

export function poissonPmf(k, lambda){
  if(lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for(let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

// 디슨-콜스 저스코어 보정(0-0, 1-0, 0-1, 1-1만 건드린다)
export function dcTau(x, y, lh, la, rho){
  if(x === 0 && y === 0) return 1 - lh * la * rho;
  if(x === 0 && y === 1) return 1 + lh * rho;
  if(x === 1 && y === 0) return 1 + la * rho;
  if(x === 1 && y === 1) return 1 - rho;
  return 1;
}

// λ 두 개 → 승/무/패·스코어별 확률
export function scoreProbs(lambdaHome, lambdaAway, rho = PARAMS.dcRho, max = 8){
  const grid = [];
  let total = 0;
  for(let x = 0; x <= max; x++){
    grid[x] = [];
    for(let y = 0; y <= max; y++){
      const p = poissonPmf(x, lambdaHome) * poissonPmf(y, lambdaAway) * dcTau(x, y, lambdaHome, lambdaAway, rho);
      grid[x][y] = p;
      total += p;
    }
  }
  let home = 0, draw = 0, away = 0, over25 = 0, btts = 0;
  // 기준선별 오버 확률 — 화면은 이 중 50%에 가장 가까운 선을 골라 보여준다(북메이커 메인 라인과 같은 원리).
  const overLines = {'1.5': 0, '2.5': 0, '3.5': 0};
  const lines = [];
  for(let x = 0; x <= max; x++){
    for(let y = 0; y <= max; y++){
      const p = grid[x][y] / total;
      if(x > y) home += p; else if(x === y) draw += p; else away += p;
      if(x + y > 2.5) over25 += p;
      for(const k in overLines) if(x + y > Number(k)) overLines[k] += p;
      if(x > 0 && y > 0) btts += p;
      lines.push({score: x + '-' + y, home: x, away: y, p});
    }
  }
  lines.sort((a, b) => b.p - a.p);
  return {probs: {home, draw, away}, scorelines: lines, over25, under25: 1 - over25, overLines, btts, bttsNo: 1 - btts};
}

// 경기 목록에서 팀별 "시간 감쇠 득점/실점"을 만든다.
// matches: [{utcTime, homeId, awayId, homeGoals, awayGoals}] (종료 경기만)
// asOf 이전 경기만 쓴다 — 백테스트에서 미래 정보가 새지 않게 하는 핵심.
export function decayedForm(matches, asOf, params = PARAMS){
  const asOfMs = asOf instanceof Date ? asOf.getTime() : new Date(asOf).getTime();
  const lambda = Math.log(2) / params.halfLifeDays;
  const acc = {};
  const touch = id => (acc[id] = acc[id] || {w: 0, gf: 0, ga: 0, matches: 0, last: null, recent: []});
  for(const m of matches){
    const t = new Date(m.utcTime).getTime();
    if(!(t < asOfMs)) continue;
    const ageDays = (asOfMs - t) / 86400000;
    const w = Math.exp(-lambda * ageDays);
    const h = touch(m.homeId), a = touch(m.awayId);
    h.w += w; h.gf += w * m.homeGoals; h.ga += w * m.awayGoals; h.matches++;
    a.w += w; a.gf += w * m.awayGoals; a.ga += w * m.homeGoals; a.matches++;
    for(const [side, opp] of [[h, m.awayGoals], [a, m.homeGoals]]){
      if(side.last == null || t > side.last) side.last = t;
      side.recent.push(t);
    }
  }
  for(const id of Object.keys(acc)){
    const s = acc[id];
    s.gfPerMatch = s.w > 0 ? s.gf / s.w : null;
    s.gaPerMatch = s.w > 0 ? s.ga / s.w : null;
  }
  return acc;
}

// 이번 시즌 기록 + 지난 시즌 사전값을 합쳐 "리그 평균 대비 배수"를 만든다.
// cur*: 이번 시즌, prev*: 지난 시즌(같은 리그 평균으로 나눈 값이라 시즌 간 비교 가능)
export function blendRatio({curXgRate, curDecayRate, curPlayed, prevRatio, leagueAvg, isDefence = false, usePrior = true, params = PARAMS}){
  const xgW = isDefence ? (params.xgWeightDefence != null ? params.xgWeightDefence : params.xgWeight) : params.xgWeight;
  const parts = [];
  if(curXgRate != null && leagueAvg > 0) parts.push({r: curXgRate / leagueAvg, w: xgW});
  if(curDecayRate != null && leagueAvg > 0) parts.push({r: curDecayRate / leagueAvg, w: 1 - xgW});
  let curRatio = null;
  if(parts.length){
    const wSum = parts.reduce((a, p) => a + p.w, 0);
    curRatio = parts.reduce((a, p) => a + p.r * p.w, 0) / (wSum || 1);
  }
  const played = curPlayed || 0;
  // 사전값을 안 쓰는 비교군(백테스트 A안) — 예전처럼 리그 평균 쪽으로만 당긴다.
  if(!usePrior){
    if(curRatio == null) return 1;
    const s = played / (played + params.shrinkK);
    return 1 + s * (curRatio - 1);
  }
  // 지난 시즌이 없는 팀(승격·신생)은 "평균보다 조금 약한 팀"을 사전값으로 둔다.
  const prior = prevRatio != null ? prevRatio
    : (isDefence ? params.promotedDefence : params.promotedAttack);
  if(curRatio == null) return prior;
  // 사전값은 38경기짜리라 따로 더 당기지 않는다 — priorK가 이번 시즌 기록으로
  // 넘어가는 속도를 정한다(8경기째에 반반).
  // 승격팀 사전값은 불확실성이 커서 더 빨리 이번 시즌 기록으로 넘긴다.
  const k = prevRatio != null ? params.priorK : params.promotedPriorK;
  const w = played / (played + k);
  return w * curRatio + (1 - w) * prior;
}

// 홈 우위 — 표본이 작은 대회(UCL 1라운드에서 홈팀이 2배 득점)를 그대로 믿지 않는다.
export function homeEdgeFrom(homeAvg, awayAvg, leagueAvg, teamMatches, params = PARAMS){
  const raw = leagueAvg > 0 ? Math.min(Math.max((homeAvg - awayAvg) / leagueAvg, 0), params.homeEdgeCap) : params.homeEdgePrior;
  const w = teamMatches / (teamMatches + params.homeEdgeK);
  const edge = w * raw + (1 - w) * params.homeEdgePrior;
  return {edge, homeFactor: 1 + edge / 2, awayFactor: 1 - edge / 2};
}

// 일정 — 휴식일이 짧거나 최근 2주에 경기가 몰렸으면 깎는다.
export function restFactor(daysRest, matchesInWindow, params = PARAMS){
  let pen = 0;
  if(daysRest != null && daysRest < params.restRef){
    const short = params.restRef - Math.max(daysRest, params.restFloor);
    pen += Math.min(short * params.restPenaltyPerDay, params.restCap);
  }
  if(matchesInWindow != null && matchesInWindow > params.congestionRef){
    pen += Math.min((matchesInWindow - params.congestionRef) * params.congestionPenalty, params.congestionCap);
  }
  return {
    penalty: pen,
    attack: 1 - pen,
    concede: 1 + pen * params.restConcedeRatio,
    daysRest: daysRest != null ? daysRest : null,
    matches: matchesInWindow != null ? matchesInWindow : null,
  };
}

// 결장 — 포지션 라인별로 나눠 득점/실점에 따로 반영한다.
// ctx: {starters:[{pos,value}], out:[{name,pos,value,doubtful}]}
export function injuryFactors(ctx, params = PARAMS){
  const none = {attackFactor: 1, concedeFactor: 1, lines: [0, 0, 0, 0], attackImpact: 0, concedeImpact: 0, out: []};
  if(!ctx || !(ctx.out || []).length) return none;
  const starters = ctx.starters || [];
  if(!starters.length) return none;

  const size = [0, 0, 0, 0], valSum = [0, 0, 0, 0];
  starters.forEach(st => { const p = st.pos; if(p >= 0 && p <= 3){ size[p]++; valSum[p] += st.value || 0; } });
  const xiMean = starters.reduce((a, st) => a + (st.value || 0), 0) / starters.length;

  const lost = [0, 0, 0, 0];
  ctx.out.forEach(o => {
    const p = (o.pos >= 0 && o.pos <= 3) ? o.pos : 2;
    const mean = size[p] ? valSum[p] / size[p] : xiMean;
    let r = (mean > 0 && o.value > 0) ? o.value / mean : 0.6;
    r = Math.min(Math.max(r, 0.25), 2);
    // 빠질 확률 — FPL은 "출전 가능 75%" 같은 숫자를 주므로 그걸 그대로 쓴다(missWeight).
    // Fotmob은 "Doubtful" 한 단어뿐이라 반반(0.5)으로 본다.
    const w = (typeof o.missWeight === 'number' && o.missWeight >= 0 && o.missWeight <= 1)
      ? o.missWeight : (o.doubtful ? 0.5 : 1);
    lost[p] += r * w;
  });
  const lines = [0, 1, 2, 3].map(p => (size[p] ? Math.min(lost[p] / size[p], params.injuryLineCap) : 0));
  const attackImpact  = lines.reduce((a, sh, p) => a + sh * ATTACK_WEIGHT[p], 0);
  const concedeImpact = lines.reduce((a, sh, p) => a + sh * DEFENCE_WEIGHT[p], 0);
  return {
    attackFactor: 1 - params.injuryImpact * attackImpact,
    concedeFactor: 1 + params.injuryImpact * concedeImpact,
    lines, attackImpact, concedeImpact,
    out: [...ctx.out].sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 4)
      .map(o => ({name: o.name, pos: o.pos, posLabel: POS_LABEL[o.pos] || '', doubtful: !!o.doubtful,
                  missWeight: (typeof o.missWeight === 'number' ? o.missWeight : (o.doubtful ? 0.5 : 1)), type: o.type})),
  };
}

// 최종 λ — 강도 배수 × 일정 × 결장 × 홈/원정
export function lambdasFrom({leagueAvg, homeAttack, homeDefence, awayAttack, awayDefence,
                             homeFactor, awayFactor, homeRest, awayRest, homeInj, awayInj}){
  const one = {attack: 1, concede: 1};
  const hr = homeRest || one, ar = awayRest || one;
  const hi = homeInj || {attackFactor: 1, concedeFactor: 1}, ai = awayInj || {attackFactor: 1, concedeFactor: 1};
  return {
    home: leagueAvg * (homeAttack * hr.attack * hi.attackFactor) * (awayDefence * ar.concede * ai.concedeFactor) * homeFactor,
    away: leagueAvg * (awayAttack * ar.attack * ai.attackFactor) * (homeDefence * hr.concede * hi.concedeFactor) * awayFactor,
  };
}

// AI 해설 캐시 키 — 생성에 쓴 수치가 바뀌면 키도 바뀌어야 한다(부상자 추가, 일정
// 변경 등). 예측 결과에서 문장에 영향을 주는 값만 뽑아 짧은 해시로 만든다.
export function predictAiKey(p){
  const r2 = v => Math.round(v * 100);
  const sideSig = t => [t.id, r2(t.xgFor), r2(t.xgAgainst), t.attackRank, t.defenceRank,
    r2(t.injury ? t.injury.attackFactor : 1), r2(t.injury ? t.injury.concedeFactor : 1),
    (t.injury && t.injury.out || []).map(o => o.name).join('+'),
    t.rest ? Math.round(t.rest.penalty * 100) : 0].join(':');
  const sig = [p.competition.leagueId, sideSig(p.home), sideSig(p.away),
    r2(p.probs.home), r2(p.probs.draw), r2(p.probs.away)].join('|');
  // 짧은 비암호학적 해시(FNV-1a) — 충돌해도 해설 하나가 재사용될 뿐이라 충분하다.
  let h = 0x811c9dc5;
  for(let i = 0; i < sig.length; i++){ h ^= sig.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  // v2: 해설 형식(두 문단·구체 수치)이 바뀌어 예전 해설을 재사용하면 안 된다.
  // v3: 수치+해석 문체, 최근 흐름·맞대결·핵심 선수 추가.
  // v4: 지표 나열 대신 해설위원 말투(관전 포인트 → 근거 → 결론).
  // v5: 격식 있는 문체(구어 어미·속어 금지).
  return `predAI:v5:${p.home.id}:${p.away.id}:${h.toString(36)}`;
}
