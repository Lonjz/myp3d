$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $root "myp3d-backend"
$frontendDir = Join-Path $root "myp3d-frontend"
$pythonExe = Join-Path $backendDir "venv\Scripts\python.exe"

if (-not (Test-Path $pythonExe)) {
    throw "Backend Python executable not found at $pythonExe"
}

$backendCommand = "Set-Location '$backendDir'; & '$pythonExe' main.py"
$frontendCommand = "Set-Location '$frontendDir'; npm run dev"

Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", $backendCommand
) | Out-Null

Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", $frontendCommand
) | Out-Null

Write-Host "Started backend and frontend in separate PowerShell windows."