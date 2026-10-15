// 2026-10-15 calibration. All anchors are gross annual EUR, not live contracts.
// Sources/coverage/assumptions: docs/career-mode/salary-calibration.md.
// [reference OVR, reference annual salary, floor, soft ceiling].
export const WAGE_PROFILES={
 ENG:[75,35000*52/.85,31000,50000000],ESP:[75,1650000,200000,40000000],
 GER:[75,1550000,35000,35000000],ITA:[75,1450000,60000,30000000],
 FRA:[74,1100000,36000,35000000],POR:[68,300000,15000,8000000],
 NED:[68,260000,30000,6500000],BEL:[66,200000,25000,4500000],
 NOR:[62,100000,20000,1500000],BRA:[68,350000,8000,8000000],
 ARG:[66,180000,6000,3500000],USA:[62,400000,78600,35000000],
 KOR:[60,216093000/1500,20000,2000000000/1500],
 JPN:[60,31880000/160,30000,330000000/160],NGA:[45,6000,1200,60000],
};
// Piecewise log interpolation: no sudden salary step at an OVR boundary.
export const WAGE_CURVE=[[-45,.008],[-30,.015],[-20,.035],[-15,.075],[-10,.15],[-5,.45],[0,1],[5,1.8],[10,3.4],[15,6],[20,9],[24,11.3],[40,19],[70,40]];
export const ROLE_CURVE=[[-60,.01],[-20,.04],[-10,.2],[-5,.55],[0,1],[5,1.4],[10,1.7],[30,2.1]];
// MLS needs a separate high-end curve: DP stars and ordinary roster members
// cannot be represented by one low league-wide ceiling.
export const MLS_CURVE=[[30,60000],[45,78600],[54,110000],[60,300000],[65,650000],[70,1300000],[75,2400000],[80,3500000],[85,5000000],[90,8000000],[95,13000000],[99,19400000]];
// Negotiating indices, not claimed audited club payroll figures. No club.r use.
// Missing clubs use the ordinary-club fallback below, never a reputation budget.
export const CLUB_WAGE_INDEX={
 '맨체스터 시티':1.33,'아스날':1.25,'리버풀':1.3,'첼시':1.12,
 '맨체스터 유나이티드':1.18,'토트넘':1.02,'뉴캐슬 유나이티드':1.02,
 '애스턴 빌라':1,'브라이튼':.72,'노팅엄 포레스트':.8,'크리스털 팰리스':.72,
 '본머스':.66,'브렌트퍼드':.62,'에버턴':.68,'풀럼':.7,'리즈 유나이티드':.55,
 '선덜랜드':.48,'입스위치 타운':.42,'헐 시티':.35,'코번트리 시티':.35,
 '레알 마드리드':1.65,'바르셀로나':1.5,'아틀레티코 마드리드':1.2,
 '바이에른 뮌헨':1.58,'보루시아 도르트문트':1.12,'바이어 레버쿠젠':1.08,
 '인테르':1.4,'유벤투스':1.3,'AC 밀란':1.18,'나폴리':1.18,
 '파리 생제르맹':1.8,'마르세유':1.12,'AS 모나코':1.08,
 '벤피카':1.55,'FC 포르투':1.45,'스포르팅 CP':1.32,
 '아약스':1.45,'PSV 에인트호번':1.4,'페예노르트':1.3,
 '클뤼프 브뤼허':1.4,'안데를레흐트':1.2,'보되/글림트':1.7,
 '플라멩구':1.6,'파우메이라스':1.5,'리버 플레이트':1.65,'보카 주니어스':1.55,
 '인터 마이애미':1.15,'LAFC':1.15,'LA 갤럭시':1.1,
};
// Conservative ordinary-club negotiating bands where a club-level source is
// missing. They are calibration assumptions, not measured league averages.
export const DEFAULT_WAGE_INDEX={ENG:.7,ESP:.45,GER:.55,ITA:.5,FRA:.45,POR:.45,NED:.55,BEL:.6,NOR:.65,BRA:.6,ARG:.65,USA:.8,KOR:.75,JPN:.7,NGA:.8};
// K League 2025 official domestic base-salary averages / league domestic average.
// Keeps Daejeon's spending above teams with greater sporting reputation.
const KOREA_BASE={
 '울산 HD':477339000,'전북 현대':273597000,'대전 하나 시티즌':396607000,
 'FC 서울':267959000,'제주 SK':251227000,'포항 스틸러스':161780000,
 '강원 FC':146676000,'광주 FC':139520000,'FC 안양':143276000,
 '인천 유나이티드':172885000,'부천 FC 1995':63634000,
};
for(const [name,annual] of Object.entries(KOREA_BASE))CLUB_WAGE_INDEX[name]=annual/216093000;
// J1 2025 published estimates; compact relative bands, not an official payroll.
Object.assign(CLUB_WAGE_INDEX,{
 '비셀 고베':1.45,'우라와 레즈':1.4,'나고야 그램퍼스':1.2,'감바 오사카':1.2,
 '요코하마 F. 마리노스':1.2,'FC 도쿄':1.15,'가시마 앤틀러스':1.15,
 '마치다 젤비아':1.15,'가와사키 프론탈레':1.12,'세레소 오사카':1.05,
 '교토 상가':1,'산프레체 히로시마':1,'가시와 레이솔':.9,'아비스파 후쿠오카':.9,
 '시미즈 S펄스':.8,'도쿄 베르디':.7,'파지아노 오카야마':.75,
});
export function interpolateCurve(points,value){
 if(value<=points[0][0])return points[0][1];
 for(let i=1;i<points.length;i++)if(value<=points[i][0]){
  const [x0,y0]=points[i-1],[x1,y1]=points[i],t=(value-x0)/(x1-x0);
  return Math.exp(Math.log(y0)*(1-t)+Math.log(y1)*t);
 }
 return points.at(-1)[1];
}
export function softenSalary(raw,ceiling){
 const start=ceiling*.65;if(raw<=start)return raw;
 const room=ceiling-start,excess=raw-start;
 // A continuous, strictly increasing tail rather than clipping every star.
 return start+room*excess/(room+excess);
}
export function salaryFloor(nat,age){
 if(nat==='JPN')return age<=18?19000:4800000/160;
 // Official MLS 2026 reserve and senior minima, converted at fixed audit USD/EUR.
 if(nat==='USA')return (age<=25?88025:113400)/1.1195;
 return WAGE_PROFILES[nat]?.[2]??22000;
}
