# 대표팀 바둑알 유니폼 색상

선택 가능한 15개국은 2026년 홈·어웨이 킷을 Football Kit Archive의 사진과 설명으로 확인했다(2026-10-14). 선택 불가능한 상대까지 포함한 현재 전체 73개국의 최신 확인 가능 킷은 [상대국 자료](national-opponents.md)와 [원자료](data/national-teams.json)에 정리한다. 색상은 작은 바둑알에서 읽히도록 사진의 몸통 대표색을 정리한 값이며 제조사의 공식 색상 코드가 아니다.

양 팀은 홈 킷을 우선 사용한다. 바둑알의 몸통 대표색이 비슷하면 상대 팀을 그 국가의 어웨이 킷으로 바꾼다. 상대 어웨이도 겹치면 우리 팀만 어웨이를 사용한다. 전체 73개국의 서로 다른 팀 5,256개 조합에서 식별 가능한 조합을 검증한다. 골키퍼는 두 팀 필드 유니폼과 구별되는 기존 전용 팔레트를 사용한다.

| 국가 | 홈 자료 | 어웨이 자료 |
|---|---|---|
| 잉글랜드 | [White / Navy / Red](https://www.footballkitarchive.com/england-2026-home-kit/) | [Red / Navy / White](https://www.footballkitarchive.com/england-2026-away-kit/) |
| 스페인 | [Red / Navy / Yellow](https://www.footballkitarchive.com/spain-2026-home-kit/) | [Off-white / Claret / Gold](https://www.footballkitarchive.com/spain-2026-away-kit/) |
| 독일 | [White / Black / Red](https://www.footballkitarchive.com/germany-2026-home-kit/) | [Navy / Sky blue / White](https://www.footballkitarchive.com/germany-2026-away-kit/) |
| 이탈리아 | [Blue / Navy / Gold](https://www.footballkitarchive.com/italy-2026-home-kit/) | [Off-white / Navy / Gold](https://www.footballkitarchive.com/italy-2026-away-kit/) |
| 프랑스 | [Navy / Blue / White](https://www.footballkitarchive.com/france-2026-home-kit/) | [Sky blue / Gold](https://www.footballkitarchive.com/france-2026-away-kit/) |
| 포르투갈 | [Red / Green / White](https://www.footballkitarchive.com/portugal-2026-home-kit/) | [Sky blue / White / Green](https://www.footballkitarchive.com/portugal-2026-away-kit/) |
| 네덜란드 | [Orange / Black](https://www.footballkitarchive.com/netherlands-2026-home-kit/) | [White / Orange](https://www.footballkitarchive.com/netherlands-2026-away-kit/) |
| 벨기에 | [Red / Yellow / Black](https://www.footballkitarchive.com/belgium-2026-home-kit/) | [Sky blue / Pink / Black](https://www.footballkitarchive.com/belgium-2026-away-kit/) |
| 브라질 | [Yellow / Green / Green](https://www.footballkitarchive.com/brazil-2026-home-kit/) | [Blue / Navy / Yellow](https://www.footballkitarchive.com/brazil-2026-away-kit/) |
| 아르헨티나 | [White / Sky blue / Navy](https://www.footballkitarchive.com/argentina-2026-home-kit/) | [Black / White / Sky blue](https://www.footballkitarchive.com/argentina-2026-away-kit/) |
| 노르웨이 | [Red / Navy / White](https://www.footballkitarchive.com/norway-2026-home-kit/) | [Black](https://www.footballkitarchive.com/norway-2026-away-kit/) |
| 대한민국 | [Red / White / Black](https://www.footballkitarchive.com/south-korea-2026-home-kit/) | [Purple / Purple / Green](https://www.footballkitarchive.com/south-korea-2026-away-kit/) |
| 일본 | [Blue / White / Red](https://www.footballkitarchive.com/japan-2026-home-kit/) | [Off-white / Black](https://www.footballkitarchive.com/japan-2026-away-kit/) |
| 미국 | [Off-white / Red / Navy](https://www.footballkitarchive.com/usa-2026-home-kit/) | [Black / Red / White](https://www.footballkitarchive.com/usa-2026-away-kit/) |
| 나이지리아 | [Green / Green / White](https://www.footballkitarchive.com/nigeria-2026-home-kit/) | [White / Green / Green](https://www.footballkitarchive.com/nigeria-2026-away-kit/) |

모든 바둑알은 줄무늬 없이 몸통 대표색의 단색으로 표현한다. 등번호는 실제 바둑알 밝기에 따라 밝은 킷에는 검정, 어두운 킷에는 흰색을 사용한다. 선택 국가 이외의 58개 상대국도 홈·어웨이 사진으로 대표색을 보정했다. 국가마다 최신 확인 가능 시즌이 다르며 위 15개국 표와 전체 원자료에 각각 명시한다.

국가명과 내 선수 이름·등번호는 `index.html`에서 해당 경기의 국적·상대 코드와 캐릭터 데이터를 넘긴다. 내 선수 득점·도움에는 캐릭터 이름을 사용한다. 동료·상대 선수는 실명 명단을 생성하지 않으며 기본 등번호를 사용한다.

검증: `node scripts/test_career_national_kits.mjs`.
