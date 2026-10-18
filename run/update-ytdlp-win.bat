@echo off
setlocal

cd /d "%~dp0.."
set "PYTHON=%CD%\myp3d-backend\venv\Scripts\python.exe"

if not exist "%PYTHON%" (
    echo Backend Python executable not found at %PYTHON%
    goto done
)

set "BEFORE=none"
for /f "delims=" %%v in ('""%PYTHON%" -m yt_dlp --version 2>nul"') do set "BEFORE=%%v"

"%PYTHON%" -m pip install --upgrade --disable-pip-version-check "yt-dlp[default]"
if errorlevel 1 (
    echo.
    echo yt-dlp update failed.
    goto done
)

for /f "delims=" %%v in ('""%PYTHON%" -m yt_dlp --version"') do set "AFTER=%%v"

echo.
if "%BEFORE%"=="%AFTER%" (
    echo yt-dlp is already up to date: %AFTER%
) else (
    echo Updated yt-dlp from %BEFORE% to %AFTER%. Restart the backend to use it.
)

:done
echo.
pause
