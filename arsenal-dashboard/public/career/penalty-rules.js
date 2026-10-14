// Shared by the server verdict and the browser meter; no separate success band.
export function penaltyPowerProfile({x,y,power}){
 const center=68+4*Math.max(0,.5-y);
 const deviation=(power-center)/(power<center?center:100-center);
 // High/corner aims need more precise power, without discrete aim zones.
 const precision=3+2*(1-y)+.5*Math.abs(2*x-1);
 const chance=power<=0||power>=100?0:.8*Math.max(0,Math.cos(Math.abs(deviation)*Math.PI/2))**precision;
 return {center,deviation,chance};
}
export function penaltyKickKind(input,rng){
 const {chance,deviation}=penaltyPowerProfile(input);
 if(rng()<chance)return 'goal';
 // Mistakes gradually shift from ordinary saves to weak catches or overshoots.
 if(rng()<Math.abs(deviation)**1.5){
  if(deviation<0)return 'weak';
  return rng()<.4?'post':'wide';
 }
 return 'save';
}
