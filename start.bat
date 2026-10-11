@echo off
cd /d "%~dp0"
echo Starting development servers...

:: Start Backend
start "Backend" cmd /k "cd backend && uv run --locked python -m uvicorn app.main:app --port 8001 --reload"

:: Start Frontend
start "Frontend" cmd /k "cd frontend\web && npm run dev -- --port 3000"

:: Open browser after a short delay; first startup may take longer.
timeout /t 5 >nul
start "" "http://localhost:3000"
