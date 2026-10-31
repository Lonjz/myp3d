$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $root "myp3d-backend"
$frontendDir = Join-Path $root "myp3d-frontend"
$pythonExe = Join-Path $backendDir "venv\Scripts\python.exe"

if (-not (Test-Path $pythonExe)) {
    throw "Backend Python executable not found at $pythonExe"
}

if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
    throw "Frontend packages not installed. Run npm install in myp3d-frontend first."
}

$backendCommand = "Set-Location '$backendDir'; & '$pythonExe' tests\sandbox.py $args"
$frontendCommand = "Set-Location '$frontendDir'; npm run dev -- --mode sandbox --port 5174 --strictPort"

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

Write-Host "Started the sandbox: http://localhost:5174 (API on 8001)"
