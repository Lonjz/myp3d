@echo off
setlocal

set "ROOT=%~dp0.."
set "BACKEND=%ROOT%\myp3d-backend"
set "FRONTEND=%ROOT%\myp3d-frontend"
set "PYTHON=%BACKEND%\venv\Scripts\python.exe"

if not exist "%PYTHON%" (
    echo Backend Python executable not found at %PYTHON%
    exit /b 1
)

start "Backend" cmd /k "cd /d "%BACKEND%" && "%PYTHON%" main.py"
start "Frontend" cmd /k "cd /d "%FRONTEND%" && npm run dev"

echo Started backend and frontend in separate windows.
