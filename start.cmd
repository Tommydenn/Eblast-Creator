@echo off
cd /d "%~dp0"

echo.
echo ============================================
echo   Eblast Drafter - local dev
echo ============================================
echo.

if not exist node_modules (
    echo Installing dependencies (one-time, ~60 seconds)...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo npm install failed. Make sure Node.js is on PATH.
        echo Try opening a fresh PowerShell and running 'node --version'.
        pause
        exit /b 1
    )
    echo.
)

echo Starting dev server...
echo When you see "Ready", open http://localhost:3000 in your browser.
echo Press Ctrl+C in this window to stop the server.
echo.

start "" http://localhost:3000
call npm run dev
