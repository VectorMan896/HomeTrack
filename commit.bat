@echo off
setlocal enableextensions enabledelayedexpansion

if not exist ".git" (
    echo [ERROR] No git repository found in current directory.
    pause
    exit /b 1
)

if exist "f.txt" (
    git rm --cached f.txt >nul 2>&1
)

echo Adding files to git staging...
git add .

echo.
echo Current Status:
echo --------------------------------------------------------
git status --short
echo --------------------------------------------------------
echo.

set /p commit_msg="Enter commit message (press Enter for default): "

if "!commit_msg!"=="" (
    set commit_msg=Update project source files and configuration
)

echo.
echo Committing changes with message: "!commit_msg!"
git commit -m "!commit_msg!"

echo.
set /p push_now="Do you want to push to GitHub now? (Y/N): "
if /i "!push_now!"=="Y" (
    echo Pushing to remote...
    git push
)

echo.
echo Done!
pause