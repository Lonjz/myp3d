$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $root "myp3d-backend"
$frontendDir = Join-Path $root "myp3d-frontend"
$venvDir = Join-Path $backendDir "venv"
$pythonExe = Join-Path $venvDir "Scripts\python.exe"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "Python not found. Install Python 3.10+ from https://www.python.org/downloads/ and run this again."
}

python -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)"
if ($LASTEXITCODE -ne 0) {
    throw "Python 3.10+ is required. Install it from https://www.python.org/downloads/ and run this again."
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node not found. Install Node 20.19+ or 22.12+ from https://nodejs.org and run this again."
}

node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit((major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22 ? 0 : 1)"
if ($LASTEXITCODE -ne 0) {
    throw "Node 20.19+ or 22.12+ is required. Install it from https://nodejs.org and run this again."
}

if (-not (Test-Path $pythonExe)) {
    python -m venv $venvDir
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create the backend venv at $venvDir"
    }
}

& $pythonExe -m pip install -r (Join-Path $backendDir "requirements.txt")
if ($LASTEXITCODE -ne 0) {
    throw "Failed to install the backend packages."
}

Push-Location $frontendDir
npm install
$npmExitCode = $LASTEXITCODE
Pop-Location
if ($npmExitCode -ne 0) {
    throw "Failed to install the frontend packages."
}

$hasBundledFfmpeg = Test-Path (Join-Path $backendDir "ffmpeg.exe") -PathType Leaf
if (-not $hasBundledFfmpeg -and -not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    Write-Warning "ffmpeg not found. Put ffmpeg.exe in myp3d-backend or install ffmpeg on your PATH before downloading."
}

Write-Host "Setup complete. Start the app with: powershell -ExecutionPolicy Bypass -File scripts\dev-win.ps1"
