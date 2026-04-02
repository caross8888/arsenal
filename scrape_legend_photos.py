#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Arsenal Legends Photo Helper

STEP 1 - Run to see fotmob URL list:
    python scrape_legend_photos.py list

STEP 2 - Manually save images from fotmob into:
    arsenal-dashboard/public/data/history_images/legends/raw/
    Filename: <rank>.jpg  (e.g. 1.jpg, 2.jpg, ... 50.jpg)

STEP 3 - Run to apply photos to legends.json:
    python scrape_legend_photos.py apply
"""

import json, os, re, sys, shutil, urllib.parse

BASE       = os.path.dirname(os.path.abspath(__file__))
LEGENDS_JSON = os.path.join(BASE, "arsenal-dashboard", "public", "data", "legends.json")
OUT_DIR    = os.path.join(BASE, "arsenal-dashboard", "public", "data", "history_images", "legends")
RAW_DIR    = os.path.join(BASE, "arsenal-dashboard", "public", "data", "legends_raw")

def load_legends():
    with open(LEGENDS_JSON, encoding="utf-8") as f:
        return json.load(f)

def save_legends(legends):
    with open(LEGENDS_JSON, "w", encoding="utf-8") as f:
        json.dump(legends, f, ensure_ascii=False, indent=2)

def cmd_list():
    legends = load_legends()
    print("=" * 70)
    print("Arsenal Legends - Fotmob Search URLs")
    print("=" * 70)
    print("Save each image as   public/data/legends_raw/<rank>.jpg  (e.g. 1.jpg, 23.jpg)")
    print("")
    for lgd in legends:
        rank = lgd["rank"]
        name = lgd["name"]
        term = urllib.parse.quote(name + " arsenal footballer")
        url  = "https://www.fotmob.com/search?term={}".format(urllib.parse.quote(name))
        already = "*saved*" if lgd.get("photo","").startswith("/data/") else ""
        print("[{:>2}] {:<28} {}  {}".format(rank, name, url, already))
    print("")
    # Also write to txt file for easy reference
    txt_path = os.path.join(BASE, "legend_fotmob_urls.txt")
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write("Arsenal Legends - Fotmob Search URLs\n")
        f.write("Save each image as: arsenal-dashboard/public/data/legends_raw/<rank>.jpg\n\n")
        for lgd in legends:
            f.write("[{:>2}] {:<30} https://www.fotmob.com/search?term={}\n".format(
                lgd["rank"], lgd["name"], urllib.parse.quote(lgd["name"])))
    print("List saved to: legend_fotmob_urls.txt")

def cmd_apply():
    os.makedirs(OUT_DIR, exist_ok=True)
    legends = load_legends()
    legend_map = {lgd["rank"]: lgd for lgd in legends}

    raw_files = []
    if os.path.isdir(RAW_DIR):
        raw_files = os.listdir(RAW_DIR)

    if not raw_files:
        print("No files found in:", RAW_DIR)
        print("Save fotmob images there named <rank>.jpg  (e.g. 1.jpg, 23.jpg)")
        return

    updated = 0
    for fname in sorted(raw_files):
        m = re.match(r'^(\d+)\.(jpg|jpeg|png|webp)$', fname, re.IGNORECASE)
        if not m:
            print("SKIP (bad name): {}  -- rename to <rank>.jpg".format(fname))
            continue
        rank = int(m.group(1))
        ext  = m.group(2).lower()
        if ext == "jpeg":
            ext = "jpg"

        lgd = legend_map.get(rank)
        if not lgd:
            print("SKIP (rank {} not in legends.json)".format(rank))
            continue

        safe_name  = re.sub(r"[^a-z0-9]", "_", lgd["name"].lower())
        dest_fname = "legend_{:02d}_{}.{}".format(rank, safe_name, ext)
        src_path   = os.path.join(RAW_DIR, fname)
        dst_path   = os.path.join(OUT_DIR, dest_fname)
        web_path   = "/data/history_images/legends/{}".format(dest_fname)

        shutil.copy2(src_path, dst_path)
        lgd["photo"] = web_path
        updated += 1
        print("[{:>2}] {} -> {}".format(rank, fname, dest_fname))

    save_legends(legends)
    print("\nDone. {}/{} photos applied to legends.json".format(updated, len(raw_files)))
    if updated:
        print("You can delete the raw/ folder now if you want.")

def cmd_status():
    legends = load_legends()
    have    = [l for l in legends if l.get("photo","").startswith("/data/")]
    missing = [l for l in legends if not l.get("photo","").startswith("/data/")]
    print("Photos saved  : {}/{}".format(len(have), len(legends)))
    if missing:
        print("Still missing :")
        for l in missing:
            print("  [{:>2}] {}".format(l["rank"], l["name"]))

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "list"
    if cmd == "list":
        cmd_list()
    elif cmd == "apply":
        cmd_apply()
    elif cmd == "status":
        cmd_status()
    else:
        print("Usage: python scrape_legend_photos.py [list|apply|status]")
