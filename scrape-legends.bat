@echo off
cd /d "%~dp0"
echo Arsenal Legends Photo Helper
echo ==============================
echo.
echo [1] Show fotmob URL list + save to legend_fotmob_urls.txt
echo [2] Apply downloaded images (raw folder) to legends.json
echo [3] Show status (which players still missing photo)
echo.
set /p choice=Choose (1/2/3):

if "%choice%"=="1" python scrape_legend_photos.py list
if "%choice%"=="2" python scrape_legend_photos.py apply
if "%choice%"=="3" python scrape_legend_photos.py status

echo.
pause
