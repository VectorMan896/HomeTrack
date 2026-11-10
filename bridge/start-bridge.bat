@echo off
REM -- HomeTrack bridge launcher (Windows) --
cd /d "%~dp0"

if not exist "node_modules" call npm install

echo ============================================================
echo  Starting HomeTrack bridge on port 8790
echo  Keep this window open while using Gallery / Chat / Generate.
echo ============================================================
echo.
node server.js

echo.
echo Bridge stopped. Press any key to close.
pause >nul
