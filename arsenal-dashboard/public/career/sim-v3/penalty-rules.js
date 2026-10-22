import * as D from './detmath.js';
// v3 서버 판정과 브라우저 파워 미터가 같은 결정적 계산을 쓴다.
export function penaltyPowerProfile({x,y,power}){
 const center=68+4*Math.max(0,.5-y);
 const deviation=(power-center)/(power<center?center:100-center);
 // 높거나 구석인 조준은 파워 오차에 더 민감하다.
 const precision=3+2*(1-y)+.5*Math.abs(2*x-1);
 const chance=power<=0||power>=100?0:.8*D.pow(Math.max(0,D.cos(Math.abs(deviation)*Math.PI/2)),precision);
 return {center,deviation,chance};
}
export function penaltyKickKind(input,rng){
 const {chance,deviation}=penaltyPowerProfile(input);
 if(rng()<chance)return 'goal';
 // 파워 오차가 커지면 선방에서 약한 슛·오버슈팅으로 이어진다.
 if(rng()<D.pow(Math.abs(deviation),1.5)){
  if(deviation<0)return 'weak';
  return rng()<.4?'post':'wide';
 }
 return 'save';
}
