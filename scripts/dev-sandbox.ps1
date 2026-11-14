$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $root "myp3d-backend"
$frontendDir = Join-Path $root "myp3d-frontend"
$pythonExe = Join-Path $backendDir "venv\Scripts\python.exe"

if (-not (Test-Path $pythonExe)) {
    throw "Backend Python executable not found at $pythonExe"
}

$packageLock = Join-Path $frontendDir "package-lock.json"
$installedLock = Join-Path $frontendDir "node_modules\.package-lock.json"
if (-not (Test-Path $installedLock) -or (Get-Item $packageLock).LastWriteTime -gt (Get-Item $installedLock).LastWriteTime) {
    Write-Host "Frontend packages are missing or out of date. Installing them."
    Push-Location $frontendDir
    npm install
    $npmExitCode = $LASTEXITCODE
    Pop-Location
    if ($npmExitCode -ne 0) {
        throw "Failed to install the frontend packages."
    }
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
