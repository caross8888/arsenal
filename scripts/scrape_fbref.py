#!/usr/bin/env python3
"""
FBref 아스날 선수 스탯 스크래퍼
GitHub Actions에서 매일 UTC 23:00 실행
결과: arsenal-dashboard/public/data/players.json
"""

import json
import os
import time
import sys
from pathlib import Path

import pandas as pd

OUTPUT_PATH = Path("arsenal-dashboard/public/data/players.json")
OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

TEAM = "Arsenal"
LEAGUE = "ENG-Premier League"

# 현재 시즌 자동 계산
from datetime import datetime
now = datetime.utcnow()
year = now.year
month = now.month
start_year = year if month >= 8 else year - 1
SEASON = f"{str(start_year)[2:]}{str(start_year+1)[2:]}"  # 예: "2526"

print(f"🔍 FBref 스크래핑 시작 - {TEAM} {SEASON}")

try:
    import soccerdata as sd
except ImportError:
    print("❌ soccerdata 없음")
    sys.exit(1)

STAT_TYPES = [
    ("standard", "기본 스탯"),
    ("shooting", "슈팅"),
    ("passing", "패스"),
    ("defense", "수비"),
    ("misc", "기타"),
]

def safe_val(val, default=0):
    try:
        if pd.isna(val):
            return default
        v = float(val)
        return int(v) if v == int(v) else round(v, 2)
    except:
        return default


def flatten_cols(df):
    """멀티인덱스 컬럼 평탄화"""
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = ['_'.join(str(c).strip() for c in col if str(c) != '').strip('_') 
                      for col in df.columns]
    return df


fbref = sd.FBref(leagues=LEAGUE, seasons=SEASON)
all_stats = {}

for stat_type, label in STAT_TYPES:
    print(f"  📥 {label} 수집 중...")
    try:
        df = fbref.read_player_season_stats(stat_type=stat_type)
        df = flatten_cols(df.reset_index())

        # 아스날 필터 (team 컬럼)
        team_col = next((c for c in df.columns if 'team' in c.lower()), None)
        if team_col:
            arsenal_df = df[df[team_col].str.contains('Arsenal', na=False)]
        else:
            arsenal_df = df

        if arsenal_df.empty:
            print(f"    ⚠️ {label}: 아스날 데이터 없음")
            continue

        print(f"    ✅ {label}: {len(arsenal_df)}명")

        # player 컬럼 찾기
        player_col = next((c for c in df.columns if 'player' in c.lower()), df.columns[0])

        for _, row in arsenal_df.iterrows():
            name = str(row.get(player_col, ''))
            if not name or name == 'nan':
                continue
            if name not in all_stats:
                all_stats[name] = {"name": name}
            for col in arsenal_df.columns:
                if col not in (player_col, team_col, 'season', 'league'):
                    all_stats[name][f"{stat_type}_{col}"] = safe_val(row[col])

        time.sleep(4)  # 차단 방지 딜레이

    except Exception as e:
        print(f"    ❌ {label} 실패: {e}")
        continue

if not all_stats:
    print("❌ 수집된 데이터 없음 - players.json 빈 파일로 저장")
    output = {"updated_at": datetime.utcnow().isoformat(), "season": SEASON,
              "source": "FBref via soccerdata", "players": []}
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    sys.exit(0)

# 핵심 지표 추출
players_output = []
for name, raw in all_stats.items():
    p = {
        "name": name,
        # 기본
        "appearances":      raw.get("standard_MP", 0),
        "starts":           raw.get("standard_Starts", 0),
        "minutes":          raw.get("standard_Min", 0),
        "goals":            raw.get("standard_Gls", 0),
        "assists":          raw.get("standard_Ast", 0),
        "xG":               raw.get("standard_xG", 0),
        "xA":               raw.get("standard_xAG", 0),
        # 슈팅
        "shots":            raw.get("shooting_Sh", 0),
        "shots_on_target":  raw.get("shooting_SoT", 0),
        "shot_accuracy":    raw.get("shooting_SoT%", 0),
        # 패스
        "pass_accuracy":    raw.get("passing_Cmp%", 0),
        "key_passes":       raw.get("passing_KP", 0),
        "passes_total":     raw.get("passing_Att", 0),
        # 수비
        "tackles":          raw.get("defense_Tkl", 0),
        "tackles_won":      raw.get("defense_TklW", 0),
        "interceptions":    raw.get("defense_Int", 0),
        "blocks":           raw.get("defense_Blocks", 0),
        "clearances":       raw.get("defense_Clr", 0),
        # 기타
        "dribbles_success": raw.get("misc_Succ", 0),
        "yellow_cards":     raw.get("misc_CrdY", 0),
        "red_cards":        raw.get("misc_CrdR", 0),
        "fouls":            raw.get("misc_Fls", 0),
    }
    players_output.append(p)

players_output.sort(key=lambda x: x["minutes"], reverse=True)

output = {
    "updated_at": datetime.utcnow().isoformat(),
    "season": SEASON,
    "source": "FBref via soccerdata",
    "players": players_output
}

with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f"✅ 완료! {len(players_output)}명 저장 → {OUTPUT_PATH}")
if players_output:
    print(f"   1위: {players_output[0]['name']} - {players_output[0]['minutes']}분")
