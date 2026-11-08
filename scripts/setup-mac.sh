#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/myp3d-backend"
FRONTEND_DIR="$ROOT_DIR/myp3d-frontend"

PYTHON_BIN="$BACKEND_DIR/venv/bin/python"

if ! python3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >/dev/null 2>&1; then
    echo "Python 3.10+ is required, and python3 is missing or too old. Install it and run this again."
    exit 1
fi

if ! node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit((major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22 ? 0 : 1)" >/dev/null 2>&1; then
    echo "Node 20.19+ or 22.12+ is required, and node is missing or too old. Install it from https://nodejs.org and run this again."
    exit 1
fi

if [[ ! -x "$PYTHON_BIN" ]]; then
    python3 -m venv "$BACKEND_DIR/venv"
fi

"$PYTHON_BIN" -m pip install -r "$BACKEND_DIR/requirements.txt"

(
    cd "$FRONTEND_DIR"
    npm install
)

if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "Warning: ffmpeg not found. Install ffmpeg on your PATH before downloading."
fi

echo "Setup complete. Start the app with: ./scripts/dev-mac.sh"
