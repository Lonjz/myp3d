@echo off
setlocal

cd /d "%~dp0.."
set "ROOT=%CD%"
set "BACKEND=%ROOT%\myp3d-backend"
set "FRONTEND=%ROOT%\myp3d-frontend"
set "PYTHON=%BACKEND%\venv\Scripts\python.exe"

if not exist "%PYTHON%" (
    echo Backend Python executable not found at %PYTHON%
    exit /b 1
)

wt --window 0 new-tab --title "Backend" --suppressApplicationTitle -d "%BACKEND%" cmd /k "%PYTHON% main.py" ; new-tab --title "Frontend" --suppressApplicationTitle -d "%FRONTEND%" cmd /k "npm run dev"
