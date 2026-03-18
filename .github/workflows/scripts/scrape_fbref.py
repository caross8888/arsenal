#!/usr/bin/env python3
"""
FBref 아스날 선수 스탯 스크래퍼
soccerdata 라이브러리로 Cloudflare 우회
매일 GitHub Actions에서 실행 → players.json 업데이트
"""

import json
import os
import time
from pathlib import Path

import pandas as pd
import soccerdata as sd

OUTPUT_PATH = Path("arsenal-dashboard/public/data/players.json")
OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

TEAM = "Arsenal"
LEAGUE = "ENG-Premier League"
SEASON = "2526"  # 2025-26 시즌

# FBref 스탯 타입들
STAT_TYPES = [
    "standard",    # 기본 (골/어시/출전)
    "shooting",    # 슈팅 (xG, 유효슈팅)
    "passing",     # 패스 (패스%, 키패스, xA)
    "defense",     # 수비 (태클, 인터셉트, 클리어런스)
    "misc",        # 기타 (드리블, 파울, 카드)
]

def safe_val(val, default=0):
    """NaN/None 안전 변환"""
    if pd.isna(val):
        return default
    if isinstance(val, float) and val == int(val):
        return int(val)
    return round(float(val), 2) if isinstance(val, float) else val


def scrape_fbref():
    print(f"🔍 FBref 스크래핑 시작 - {TEAM} {SEASON}")
    fbref = sd.FBref(leagues=LEAGUE, seasons=SEASON)

    all_stats = {}

    for stat_type in STAT_TYPES:
        print(f"  📥 {stat_type} 스탯 수집 중...")
        try:
            df = fbref.read_player_season_stats(stat_type=stat_type)
            # 아스날 선수만 필터
            arsenal_df = df[df.index.get_level_values('team') == TEAM]
            if arsenal_df.empty:
                # 팀명 형식이 다를 수 있음
                teams = df.index.get_level_values('team').unique()
                ars = [t for t in teams if 'Arsenal' in str(t)]
                if ars:
                    arsenal_df = df[df.index.get_level_values('team') == ars[0]]

            for idx, row in arsenal_df.iterrows():
                player_name = idx[1] if isinstance(idx, tuple) else str(idx)
                if player_name not in all_stats:
                    all_stats[player_name] = {"name": player_name}
                # 컬럼 값 저장 (멀티인덱스 컬럼 평탄화)
                for col in arsenal_df.columns:
                    col_key = '_'.join(str(c) for c in col) if isinstance(col, tuple) else str(col)
                    all_stats[player_name][f"{stat_type}_{col_key}"] = safe_val(row[col])

            time.sleep(3)  # 요청 간격 (차단 방지)

        except Exception as e:
            print(f"  ⚠️  {stat_type} 실패: {e}")
            continue

    if not all_stats:
        print("❌ 데이터 없음 - 종료")
        return

    # 핵심 지표만 추출해서 깔끔하게 정리
    players_output = []
    for name, raw in all_stats.items():
        player = {
            "name": name,
            # 기본
            "appearances":    raw.get("standard_Playing Time_MP", 0),
            "starts":         raw.get("standard_Playing Time_Starts", 0),
            "minutes":        raw.get("standard_Playing Time_Min", 0),
            "goals":          raw.get("standard_Performance_Gls", 0),
            "assists":        raw.get("standard_Performance_Ast", 0),
            "xG":             raw.get("standard_Expected_xG", 0),
            "xA":             raw.get("standard_Expected_xAG", 0),
            # 슈팅
            "shots":          raw.get("shooting_Standard_Sh", 0),
            "shots_on_target":raw.get("shooting_Standard_SoT", 0),
            "shot_accuracy":  raw.get("shooting_Standard_SoT%", 0),
            "xG_shooting":    raw.get("shooting_Expected_xG", 0),
            # 패스
            "passes":         raw.get("passing_Total_Att", 0),
            "pass_accuracy":  raw.get("passing_Total_Cmp%", 0),
            "key_passes":     raw.get("passing_KP", 0),
            "xA_passing":     raw.get("passing_xAG", 0),
            # 수비
            "tackles":        raw.get("defense_Tackles_Tkl", 0),
            "tackles_won":    raw.get("defense_Tackles_TklW", 0),
            "interceptions":  raw.get("defense_Int", 0),
            "blocks":         raw.get("defense_Blocks_Blocks", 0),
            "clearances":     raw.get("defense_Clr", 0),
            # 기타
            "dribbles":       raw.get("misc_Performance_Succ", 0),  # 드리블 성공
            "yellow_cards":   raw.get("misc_Performance_CrdY", 0),
            "red_cards":      raw.get("misc_Performance_CrdR", 0),
            "fouls_committed":raw.get("misc_Performance_Fls", 0),
            "fouls_drawn":    raw.get("misc_Performance_Fld", 0),
        }
        players_output.append(player)

    # 출전 시간 순 정렬
    players_output.sort(key=lambda p: p["minutes"], reverse=True)

    output = {
        "updated_at": pd.Timestamp.now().isoformat(),
        "season": SEASON,
        "source": "FBref via soccerdata",
        "players": players_output,
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"✅ 완료! {len(players_output)}명 → {OUTPUT_PATH}")
    print(f"   샘플: {players_output[0] if players_output else 'N/A'}")


if __name__ == "__main__":
    scrape_fbref()
