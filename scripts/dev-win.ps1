$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $root "myp3d-backend"
$frontendDir = Join-Path $root "myp3d-frontend"
$pythonExe = Join-Path $backendDir "venv\Scripts\python.exe"

if (-not (Test-Path $pythonExe)) {
    throw "Backend Python executable not found at $pythonExe"
}

$requirements = Join-Path $backendDir "requirements.txt"
$installedRequirements = Join-Path $backendDir "venv\installed-requirements.txt"
if (-not (Test-Path $installedRequirements) -or (Get-FileHash $requirements).Hash -ne (Get-FileHash $installedRequirements).Hash) {
    Write-Host "Backend packages are missing or out of date. Installing them."
    & $pythonExe -m pip install -r $requirements
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to install the backend packages."
    }
    Copy-Item $requirements $installedRequirements
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