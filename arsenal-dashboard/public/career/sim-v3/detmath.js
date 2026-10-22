// 엔진별 libm 차이를 피한다. 사칙연산·정수 연산·IEEE 754 sqrt만 사용한다.
// exp는 ln(2) 범위 축소 후 테일러 급수, log는 지수 분리 후 atanh 급수다.
const LN2=.6931471805599453,PI=3.141592653589793;
export function exp(x){
 if(Number.isNaN(x))return NaN;if(x>709.782712893384)return Infinity;if(x< -745)return 0;
 const n=Math.round(x/LN2),r=(x-n*.6931471803691238)-n*1.9082149292705877e-10;
 let term=1,sum=1;for(let i=1;i<=18;i++){term*=r/i;sum+=term;}
 let k=n;while(k>0){const d=Math.min(k,512);sum*=integerPow(2,d);k-=d;}
 while(k<0){const d=Math.min(-k,512);sum/=integerPow(2,d);k+=d;}return sum;
}
export function log(x){
 if(x<0||Number.isNaN(x))return NaN;if(x===0)return -Infinity;if(x===Infinity)return Infinity;
 let n=0;while(x>1.4142135623730951){x/=2;n++;}while(x<.7071067811865476){x*=2;n--;}
 const z=(x-1)/(x+1),z2=z*z;let term=z,sum=z;
 for(let i=3;i<=39;i+=2){term*=z2;sum+=term/i;}return 2*sum+n*LN2;
}
function integerPow(x,n){let value=1;while(n>0){if(n%2===1)value*=x;n=Math.floor(n/2);if(n)x*=x;}return value;}
export function pow(x,y){
 if(y===0)return 1;if(Number.isInteger(y))return y<0?1/integerPow(x,-y):integerPow(x,y);
 if(x===0)return y>0?0:Infinity;if(x<0)return NaN;return exp(y*log(x));
}
export function cos(x){
 if(!Number.isFinite(x))return NaN;x%=2*PI;if(x>PI)x-=2*PI;if(x< -PI)x+=2*PI;
 let sign=1;if(x>PI/2){x=PI-x;sign=-1;}else if(x< -PI/2){x=PI+x;sign=-1;}
 const xx=x*x;let term=1,sum=1;for(let i=1;i<=12;i++){term*= -xx/((2*i-1)*(2*i));sum+=term;}return sign*sum;
}
