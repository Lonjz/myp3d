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

fc /b "%BACKEND%\requirements.txt" "%BACKEND%\venv\installed-requirements.txt" >nul 2>&1
if errorlevel 1 (
    echo Backend packages are missing or out of date. Installing them.
    "%PYTHON%" -m pip install -r "%BACKEND%\requirements.txt"
    if errorlevel 1 (
        echo Failed to install the backend packages.
        exit /b 1
    )
    copy /y "%BACKEND%\requirements.txt" "%BACKEND%\venv\installed-requirements.txt" >nul
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

wt --window new new-tab --title "Backend" --suppressApplicationTitle -d "%BACKEND%" cmd /k "%PYTHON% main.py" ; new-tab --title "Frontend" --suppressApplicationTitle -d "%FRONTEND%" cmd /k "npm run dev"
