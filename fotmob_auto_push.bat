@echo off
cd /d C:\arsenal

echo [%date% %time%] git pull...
git pull

echo [%date% %time%] scraping fotmob...
python scripts/scrape_fotmob_local.py
if %errorlevel% neq 0 (
    echo [%date% %time%] scrape failed.
    exit /b 1
)

git add arsenal-dashboard/public/data/players.json
git diff --staged --quiet
if %errorlevel% equ 0 (
    echo [%date% %time%] no changes.
    exit /b 0
)

git commit -m "fotmob stats update"
git push

echo [%date% %time%] done.
