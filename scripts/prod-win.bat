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

powershell -NoProfile -Command "$installed = '%FRONTEND%\node_modules\.package-lock.json'; if (-not (Test-Path $installed) -or (Get-Item '%FRONTEND%\package-lock.json').LastWriteTime -gt (Get-Item $installed).LastWriteTime) { exit 1 }"
if errorlevel 1 (
    echo Frontend packages are missing or out of date. Installing them.
    pushd "%FRONTEND%"
    call npm install
    if errorlevel 1 (
        popd
        echo Failed to install the frontend packages.
        exit /b 1
    )
    popd
)

wt --window new new-tab --title "Backend" --suppressApplicationTitle -d "%BACKEND%" cmd /k "%PYTHON% main.py" ; new-tab --title "Frontend" --suppressApplicationTitle -d "%FRONTEND%" cmd /k "npm run build && npm run preview -- --port 4173 --strictPort"
