# 대표팀 상대국 자료

현재 게임에서 사용하는 73개 팀(선택 국가 15개·상대 전용 58개)의 자료다. 전력은 `api/_career_international.js`의 `NATIONAL_POWER`를 참조하는 게임용 수치이며 공식 FIFA 순위나 포인트가 아니다.

상대의 강함에 따라 승리 확률과 대진 진출을 계산한다. 동일 전력은 50%, 전력차 10은 약 72%, 전력차 20은 약 86%다. 내 팀의 기존 시즌 결과·승부차기 처리는 별도의 시뮬레이션 규칙을 따른다.

유니폼은 Football Kit Archive에서 확인한 최신 검색 가능 시즌의 홈·어웨이다(확인일 2026-10-14). 사진의 몸통 중심부 대표색을 단색 바둑알로 정리하며, 제조사 공식 색상 코드가 아니다. 연령별 대표도 같은 킷을 사용한다. 원본 색 설명·시즌·사진·검증 방식은 `data/national-teams.json`에 저장한다.

대회 구분: 월드컵·올림픽은 게임의 세계 상대 목록, 유로·네이션스리그는 유럽 목록, 아시안컵은 AFC 목록, 아시안게임은 호주를 제외한 아시아 목록이다. 코파·골드컵·아프리카 네이션스컵도 해당 게임 목록을 사용한다. 이는 현재 게임의 간소화된 참가국 목록이며 FIFA 전체 회원국·실제 대회 출전 명단은 아니다. 네이션스리그는 상대 목록만 지원하며 별도 시즌 이벤트는 아직 생성하지 않는다.

양 팀 홈을 우선하고 비슷하면 상대 어웨이, 이후 우리 어웨이를 검토한다. 숫자는 밝은 바둑알에 검정, 어두운 바둑알에 흰색이다. 경기 중에 외부 사이트를 호출하지 않는다.

| 팀 | 연맹 | 전력 | 홈 시즌·색 | 어웨이 시즌·색 |
|---|---|---:|---|---|
| 일본 (`JPN`) | AFC | 78 | [2026 · #233478](https://www.footballkitarchive.com/japan-2026-home-kit/) | [2026 · #eeede9](https://www.footballkitarchive.com/japan-2026-away-kit/) |
| 대한민국 (`KOR`) | AFC | 76 | [2026 · #f31840](https://www.footballkitarchive.com/south-korea-2026-home-kit/) | [2026 · #cbbce4](https://www.footballkitarchive.com/south-korea-2026-away-kit/) |
| 호주 (`AUS`) | AFC | 74 | [2026 · #fec744](https://www.footballkitarchive.com/australia-2026-home-kit-443769/) | [2026 · #026b80](https://www.footballkitarchive.com/australia-2026-away-kit-443768/) |
| 이란 (`IRN`) | AFC | 74 | [2026 · #dedee0](https://www.footballkitarchive.com/iran-2026-home-kit-482883/) | [2026 · #d30c16](https://www.footballkitarchive.com/iran-2026-away-kit-482967/) |
| 우즈베키스탄 (`UZB`) | AFC | 69 | [2026 · #204ab1](https://www.footballkitarchive.com/uzbekistan-2026-home-kit-485364/) | [2026 · #d2d2d2](https://www.footballkitarchive.com/uzbekistan-2026-away-kit-485365/) |
| 사우디아라비아 (`KSA`) | AFC | 67 | [2026 · #1e545d](https://www.footballkitarchive.com/saudi-arabia-2026-home-kit-424839/) | [2026 · #eaedf6](https://www.footballkitarchive.com/saudi-arabia-2026-away-kit-442808/) |
| 이라크 (`IRQ`) | AFC | 66 | [2026 · #f0f0f0](https://www.footballkitarchive.com/iraq-2026-home-kit-484724/) | [2026 · #156949](https://www.footballkitarchive.com/iraq-2026-away-kit-484725/) |
| 카타르 (`QAT`) | AFC | 66 | [2026 · #8e2a35](https://www.footballkitarchive.com/qatar-2026-home-kit-423325/) | [2026 · #efeef5](https://www.footballkitarchive.com/qatar-2026-away-kit-428001/) |
| 요르단 (`JOR`) | AFC | 64 | [2026 · #e4e6f1](https://www.footballkitarchive.com/jordan-2026-home-kit-483806/) | [2026 · #d52a30](https://www.footballkitarchive.com/jordan-2026-away-kit-483805/) |
| 중국 (`CHN`) | AFC | 61 | [2026 · #f74f41](https://www.footballkitarchive.com/china-2026-home-kit-445088/) | [2026 · #fbd742](https://www.footballkitarchive.com/china-2026-away-kit-445089/) |
| 아랍에미리트 (`UAE`) | AFC | 61 | [2026 · #efeff1](https://www.footballkitarchive.com/united-arab-emirates-2026-home-kit-425278/) | [2026 · #d21f45](https://www.footballkitarchive.com/united-arab-emirates-2026-away-kit-465411/) |
| 오만 (`OMN`) | AFC | 60 | [2024 · #c60f10](https://www.footballkitarchive.com/oman-2024-home-kit-200949/) | [2024 · #d9d9d9](https://www.footballkitarchive.com/oman-2024-away-kit-200950/) |
| 바레인 (`BHR`) | AFC | 58 | [2026-27 · #ba0110](https://www.footballkitarchive.com/bahrain-2026-27-home-kit-518118/) | [2026-27 · #e4e4e5](https://www.footballkitarchive.com/bahrain-2026-27-away-kit-524907/) |
| 태국 (`THA`) | AFC | 58 | [2026-27 · #263fd6](https://www.footballkitarchive.com/thailand-2026-27-home-kit-493940/) | [2026-27 · #d4363c](https://www.footballkitarchive.com/thailand-2026-27-away-kit-493947/) |
| 시리아 (`SYR`) | AFC | 56 | [2025-26 · #215142](https://www.footballkitarchive.com/syria-2025-26-home-kit-435967/) | [2025-26 · #dddde8](https://www.footballkitarchive.com/syria-2025-26-away-kit-435966/) |
| 인도 (`IND`) | AFC | 52 | [2026-27 · #0155a6](https://www.footballkitarchive.com/india-2026-27-home-kit-524659/) | [2026-27 · #f28546](https://www.footballkitarchive.com/india-2026-27-away-kit-525014/) |
| 모로코 (`MAR`) | CAF | 79 | [2026 · #bf1536](https://www.footballkitarchive.com/morocco-2026-home-kit-441671/) | [2026 · #f2e0c6](https://www.footballkitarchive.com/morocco-2026-away-kit-464094/) |
| 세네갈 (`SEN`) | CAF | 76 | [2026 · #f3e8ed](https://www.footballkitarchive.com/senegal-2026-home-kit-419614/) | [2026 · #037059](https://www.footballkitarchive.com/senegal-2026-away-kit-419613/) |
| 나이지리아 (`NGA`) | CAF | 74 | [2026 · #26c060](https://www.footballkitarchive.com/nigeria-2026-home-kit/) | [2026 · #ecebf0](https://www.footballkitarchive.com/nigeria-2026-away-kit/) |
| 알제리 (`ALG`) | CAF | 73 | [2026 · #e2dbcf](https://www.footballkitarchive.com/algeria-2026-home-kit-422915/) | [2026 · #089a8a](https://www.footballkitarchive.com/algeria-2026-away-kit-422936/) |
| 코트디부아르 (`CIV`) | CAF | 73 | [2026 · #fd6513](https://www.footballkitarchive.com/ivory-coast-2026-home-kit-465453/) | [2026 · #eeecee](https://www.footballkitarchive.com/ivory-coast-2026-away-kit-465454/) |
| 이집트 (`EGY`) | CAF | 73 | [2026 · #c7343a](https://www.footballkitarchive.com/egypt-2026-home-kit-465452/) | [2026 · #e8e7ec](https://www.footballkitarchive.com/egypt-2026-away-kit-439663/) |
| 카메룬 (`CMR`) | CAF | 71 | [2025-26 · #274e3c](https://www.footballkitarchive.com/cameroon-2025-26-home-kit-435202/) | [2025-26 · #6a695d](https://www.footballkitarchive.com/cameroon-2025-26-away-kit-435201/) |
| 튀니지 (`TUN`) | CAF | 71 | [2026 · #f1f1f1](https://www.footballkitarchive.com/tunisia-2026-home-kit-485834/) | [2026 · #e9001c](https://www.footballkitarchive.com/tunisia-2026-away-kit-485835/) |
| 가나 (`GHA`) | CAF | 70 | [2026 · #e8e9ea](https://www.footballkitarchive.com/ghana-2026-home-kit-441220/) | [2026 · #f9d070](https://www.footballkitarchive.com/ghana-2026-away-kit-430478/) |
| 말리 (`MLI`) | CAF | 70 | [2026-27 · #93948a](https://www.footballkitarchive.com/mali-2026-27-home-kit-525947/) | [2026-27 · #c2b326](https://www.footballkitarchive.com/mali-2026-27-away-kit-525949/) |
| 남아공 (`RSA`) | CAF | 69 | [2026 · #f3d95b](https://www.footballkitarchive.com/south-africa-2026-home-kit-461917/) | [2026 · #126f5d](https://www.footballkitarchive.com/south-africa-2026-away-kit-462709/) |
| 콩고민주공화국 (`COD`) | CAF | 66 | [2026 · #70b2e4](https://www.footballkitarchive.com/democratic-republic-of-the-congo-2026-home-kit-438164/) | [2026 · #f2f3f4](https://www.footballkitarchive.com/democratic-republic-of-the-congo-2026-away-kit-438165/) |
| 부르키나파소 (`BFA`) | CAF | 64 | [2025 · #006851](https://www.footballkitarchive.com/burkina-faso-2025-home-kit-397485/) | [2025 · #ebecec](https://www.footballkitarchive.com/burkina-faso-2025-away-kit-397486/) |
| 앙골라 (`ANG`) | CAF | 63 | [2025-26 · #ea373c](https://www.footballkitarchive.com/angola-2025-26-home-kit-438158/) | [2025-26 · #2c2a2d](https://www.footballkitarchive.com/angola-2025-26-away-kit-438518/) |
| 잠비아 (`ZAM`) | CAF | 63 | [2024 · #1c5e3a](https://www.footballkitarchive.com/zambia-2024-home-kit-218909/) | [2024 · #de994e](https://www.footballkitarchive.com/zambia-2024-away-kit-218908/) |
| 케냐 (`KEN`) | CAF | 55 | [2024-25 · #b92828](https://www.footballkitarchive.com/kenya-2024-25-home-kit-283377/) | [2024-25 · #dbdbdb](https://www.footballkitarchive.com/kenya-2024-25-away-kit-283378/) |
| 멕시코 (`MEX`) | CONCACAF | 77 | [2026 · #075c51](https://www.footballkitarchive.com/mexico-2026-home-kit-399841/) | [2026 · #eae8ee](https://www.footballkitarchive.com/mexico-2026-away-kit-360559/) |
| 미국 (`USA`) | CONCACAF | 77 | [2026 · #f1efed](https://www.footballkitarchive.com/usa-2026-home-kit/) | [2026 · #181d2e](https://www.footballkitarchive.com/usa-2026-away-kit/) |
| 캐나다 (`CAN`) | CONCACAF | 72 | [2026 · #bf0118](https://www.footballkitarchive.com/canada-2026-home-kit-425416/) | [2026 · #242424](https://www.footballkitarchive.com/canada-2026-away-kit-465592/) |
| 코스타리카 (`CRC`) | CONCACAF | 69 | [2026 · #a81530](https://www.footballkitarchive.com/costa-rica-2026-home-kit-423331/) | [2026 · #e0e8f2](https://www.footballkitarchive.com/costa-rica-2026-away-kit-427996/) |
| 자메이카 (`JAM`) | CONCACAF | 65 | [2026 · #f8c74b](https://www.footballkitarchive.com/jamaica-2026-home-kit-425475/) | [2026 · #404448](https://www.footballkitarchive.com/jamaica-2026-away-kit-450195/) |
| 파나마 (`PAN`) | CONCACAF | 65 | [2026 · #ef3338](https://www.footballkitarchive.com/panama-2026-home-kit-474801/) | [2026 · #183e5f](https://www.footballkitarchive.com/panama-2026-away-kit-474803/) |
| 온두라스 (`HON`) | CONCACAF | 60 | [2026 · #034d9d](https://www.footballkitarchive.com/honduras-2026-home-kit-468970/) | [2026 · #5ac9e2](https://www.footballkitarchive.com/honduras-2026-away-kit-468968/) |
| 과테말라 (`GUA`) | CONCACAF | 58 | [2026 · #38a5d4](https://www.footballkitarchive.com/guatemala-2026-home-kit-452046/) | [2026 · #dedee8](https://www.footballkitarchive.com/guatemala-2026-away-kit-452045/) |
| 아이티 (`HAI`) | CONCACAF | 57 | [2026 · #0164d8](https://www.footballkitarchive.com/haiti-2026-home-kit-469693/) | [2026 · #eef7fc](https://www.footballkitarchive.com/haiti-2026-away-kit-469694/) |
| 엘살바도르 (`SLV`) | CONCACAF | 57 | [2026 · #155dc0](https://www.footballkitarchive.com/el-salvador-2026-home-kit-448561/) | [2026 · #cddeee](https://www.footballkitarchive.com/el-salvador-2026-away-kit-448562/) |
| 트리니다드 토바고 (`TTO`) | CONCACAF | 55 | [2024 · #c42d40](https://www.footballkitarchive.com/trinidad-and-tobago-2024-home-kit-237145/) | [2024 · #e6cfce](https://www.footballkitarchive.com/trinidad-and-tobago-2024-away-kit-237144/) |
| 퀴라소 (`CUW`) | CONCACAF | 54 | [2026 · #2a41ac](https://www.footballkitarchive.com/curacao-2026-home-kit-478485/) | [2026 · #f0e0a5](https://www.footballkitarchive.com/curacao-2026-away-kit-467188/) |
| 수리남 (`SUR`) | CONCACAF | 53 | [2026-27 · #ededf8](https://www.footballkitarchive.com/suriname-2026-27-home-kit-468784/) | [2026-27 · #207d56](https://www.footballkitarchive.com/suriname-2026-27-away-kit-468785/) |
| 마르티니크 (`MTQ`) | CONCACAF | 51 | [2026-27 · #181b16](https://www.footballkitarchive.com/martinique-2026-27-home-kit-525525/) | [2026-27 · #a7100b](https://www.footballkitarchive.com/martinique-2026-27-away-kit-525524/) |
| 쿠바 (`CUB`) | CONCACAF | 50 | [2025 · #9f1919](https://www.footballkitarchive.com/cuba-2025-home-kit-358504/) | [2025 · #223a4e](https://www.footballkitarchive.com/cuba-2025-away-kit-358503/) |
| 도미니카공화국 (`DOM`) | CONCACAF | 49 | [2026 · #252e2a](https://www.footballkitarchive.com/dominican-republic-2026-home-kit-525929/) | [2026 · #fceafc](https://www.footballkitarchive.com/dominican-republic-2026-away-kit-525928/) |
| 아르헨티나 (`ARG`) | CONMEBOL | 94 | [2026 · #9dc9e9](https://www.footballkitarchive.com/argentina-2026-home-kit/) | [2026 · #343746](https://www.footballkitarchive.com/argentina-2026-away-kit/) |
| 브라질 (`BRA`) | CONMEBOL | 92 | [2026 · #e6d35a](https://www.footballkitarchive.com/brazil-2026-home-kit/) | [2026 · #182c45](https://www.footballkitarchive.com/brazil-2026-away-kit/) |
| 우루과이 (`URU`) | CONMEBOL | 84 | [2026 · #c8daef](https://www.footballkitarchive.com/uruguay-2026-home-kit-382851/) | [2026 · #192437](https://www.footballkitarchive.com/uruguay-2026-away-kit-382852/) |
| 콜롬비아 (`COL`) | CONMEBOL | 82 | [2026 · #f6dd57](https://www.footballkitarchive.com/colombia-2026-home-kit-406309/) | [2026 · #06a5c2](https://www.footballkitarchive.com/colombia-2026-away-kit-417398/) |
| 에콰도르 (`ECU`) | CONMEBOL | 75 | [2026 · #ebb301](https://www.footballkitarchive.com/ecuador-2026-home-kit-459605/) | [2026 · #161429](https://www.footballkitarchive.com/ecuador-2026-away-kit-459602/) |
| 베네수엘라 (`VEN`) | CONMEBOL | 69 | [2026 · #952946](https://www.footballkitarchive.com/venezuela-2026-home-kit-424840/) | [2026 · #e8e6e1](https://www.footballkitarchive.com/venezuela-2026-away-kit-428923/) |
| 칠레 (`CHI`) | CONMEBOL | 68 | [2026 · #e41d2e](https://www.footballkitarchive.com/chile-2026-home-kit-397365/) | [2026 · #ebe2d8](https://www.footballkitarchive.com/chile-2026-away-kit-427995/) |
| 페루 (`PER`) | CONMEBOL | 68 | [2026 · #ac2d3a](https://www.footballkitarchive.com/peru-2026-home-kit-424844/) | [2026 · #18191d](https://www.footballkitarchive.com/peru-2026-away-kit-428000/) |
| 볼리비아 (`BOL`) | CONMEBOL | 62 | [2026 · #024a49](https://www.footballkitarchive.com/bolivia-2026-home-kit-444633/) | [2026 · #e6dce5](https://www.footballkitarchive.com/bolivia-2026-away-kit-444634/) |
| 프랑스 (`FRA`) | UEFA | 94 | [2026 · #153265](https://www.footballkitarchive.com/france-2026-home-kit/) | [2026 · #c9e7e2](https://www.footballkitarchive.com/france-2026-away-kit/) |
| 스페인 (`ESP`) | UEFA | 93 | [2026 · #ef3439](https://www.footballkitarchive.com/spain-2026-home-kit/) | [2026 · #e2e4d9](https://www.footballkitarchive.com/spain-2026-away-kit/) |
| 잉글랜드 (`ENG`) | UEFA | 91 | [2026 · #e9eef1](https://www.footballkitarchive.com/england-2026-home-kit/) | [2026 · #df0129](https://www.footballkitarchive.com/england-2026-away-kit/) |
| 포르투갈 (`POR`) | UEFA | 89 | [2026 · #a93435](https://www.footballkitarchive.com/portugal-2026-home-kit/) | [2026 · #c4e2dc](https://www.footballkitarchive.com/portugal-2026-away-kit/) |
| 독일 (`GER`) | UEFA | 88 | [2026 · #eeeef3](https://www.footballkitarchive.com/germany-2026-home-kit/) | [2026 · #213651](https://www.footballkitarchive.com/germany-2026-away-kit/) |
| 네덜란드 (`NED`) | UEFA | 87 | [2026 · #f96343](https://www.footballkitarchive.com/netherlands-2026-home-kit/) | [2026 · #e7e8ea](https://www.footballkitarchive.com/netherlands-2026-away-kit/) |
| 이탈리아 (`ITA`) | UEFA | 85 | [2026 · #167ae5](https://www.footballkitarchive.com/italy-2026-home-kit/) | [2026 · #e1e4ed](https://www.footballkitarchive.com/italy-2026-away-kit/) |
| 크로아티아 (`CRO`) | UEFA | 83 | [2026-27 · #e55356](https://www.footballkitarchive.com/croatia-2026-27-home-kit-483065/) | [2026-27 · #0459a0](https://www.footballkitarchive.com/croatia-2026-27-away-kit-487173/) |
| 벨기에 (`BEL`) | UEFA | 82 | [2026 · #d10e2d](https://www.footballkitarchive.com/belgium-2026-home-kit/) | [2026 · #bce6f9](https://www.footballkitarchive.com/belgium-2026-away-kit/) |
| 스위스 (`SUI`) | UEFA | 80 | [2026 · #e41430](https://www.footballkitarchive.com/switzerland-2026-home-kit-415626/) | [2026 · #b9f2bb](https://www.footballkitarchive.com/switzerland-2026-away-kit-465605/) |
| 덴마크 (`DEN`) | UEFA | 79 | [2026 · #bc0c28](https://www.footballkitarchive.com/denmark-2026-home-kit-462385/) | [2026 · #ccc9d0](https://www.footballkitarchive.com/denmark-2026-away-kit-468213/) |
| 오스트리아 (`AUT`) | UEFA | 76 | [2026 · #e82728](https://www.footballkitarchive.com/austria-2026-home-kit-430860/) | [2026 · #dceae9](https://www.footballkitarchive.com/austria-2026-away-kit-466786/) |
| 노르웨이 (`NOR`) | UEFA | 75 | [2026 · #eb1929](https://www.footballkitarchive.com/norway-2026-home-kit/) | [2026 · #141414](https://www.footballkitarchive.com/norway-2026-away-kit/) |
| 튀르키예 (`TUR`) | UEFA | 75 | [2026 · #e7e5ea](https://www.footballkitarchive.com/turkiye-2026-home-kit-378883/) | [2026 · #a52230](https://www.footballkitarchive.com/turkiye-2026-away-kit-378882/) |
| 폴란드 (`POL`) | UEFA | 74 | [2026 · #eae8ed](https://www.footballkitarchive.com/poland-2026-home-kit-379105/) | [2026 · #cb2440](https://www.footballkitarchive.com/poland-2026-away-kit-379104/) |
| 스웨덴 (`SWE`) | UEFA | 74 | [2026 · #f7dc4d](https://www.footballkitarchive.com/sweden-2026-home-kit-424843/) | [2026 · #0354b4](https://www.footballkitarchive.com/sweden-2026-away-kit-427997/) |

재수집(누락분만): `python3 scripts/collect_national_kits.py`

사진 색상 보정(선택, Pillow 필요): `python3 scripts/collect_national_kits.py --sample-photos`

경기용 팔레트·이 표 재생성: `python3 scripts/collect_national_kits.py --render`

검증: `node scripts/test_career_national_kits.mjs`
