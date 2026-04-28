@echo off
cd /d "%~dp0"

echo.
echo ============================================
echo   Push Eblast Drafter to GitHub
echo ============================================
echo.

REM First-time setup: initialize git and connect remote.
if not exist .git (
    echo First-time setup: initializing git...
    git init
    git branch -M main
    git remote add origin https://github.com/Tommydenn/Eblast-Creator.git
    echo.
)

echo Staging changes...
git add .

echo.
echo --- Files staged for commit ---
git status --short
echo --------------------------------
echo.

REM Read commit message from arg or default.
set "MSG=%~1"
if "%MSG%"=="" set "MSG=Update from Claude"

echo Committing with message: "%MSG%"
git commit -m "%MSG%"

echo.
echo Pushing to GitHub...
echo (If this is the first push, it will replace any existing GitHub state.)
echo.

REM Detect first push by absence of upstream tracking.
git rev-parse --abbrev-ref --symbolic-full-name @{u} >nul 2>&1
if errorlevel 1 (
    git push -u origin main --force
) else (
    git push
)

echo.
echo Done. Vercel will auto-deploy in ~30 seconds.
echo.
pause
