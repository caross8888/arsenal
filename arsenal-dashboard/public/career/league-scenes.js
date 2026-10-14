// League scenery follows the playing club, including loans and within-season returns.
(function(root){
'use strict';
const names={ENG:['잉글랜드','PREMIER LEAGUE'],ESP:['스페인','LALIGA'],GER:['독일','BUNDESLIGA'],ITA:['이탈리아','SERIE A'],FRA:['프랑스','LIGUE 1'],POR:['포르투갈','PRIMEIRA LIGA'],NED:['네덜란드','EREDIVISIE'],BEL:['벨기에','PRO LEAGUE'],BRA:['브라질','BRASILEIRÃO'],ARG:['아르헨티나','LIGA PROFESIONAL'],NOR:['노르웨이','ELITESERIEN'],KOR:['대한민국','K리그 1'],JPN:['일본','J1리그'],USA:['미국','MLS'],NGA:['나이지리아','NIGERIA PREMIER LEAGUE']};
const leagues=Object.fromEntries(Object.entries(names).map(([id,[country,label]])=>[id,{id,country,label,url:'/img/career-leagues/'+id.toLowerCase()+'.webp?v=1'}]));
function forClub(club){return leagues[club?.nat]||null;}
root.CareerLeagueScenes={leagues,forClub};
})(globalThis);
