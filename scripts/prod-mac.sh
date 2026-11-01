#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/myp3d-backend"
FRONTEND_DIR="$ROOT_DIR/myp3d-frontend"

PYTHON_BIN="$BACKEND_DIR/venv/bin/python"

if [[ ! -x "$PYTHON_BIN" ]]; then
    echo "Backend venv Python not found. Expected venv/bin/python under myp3d-backend."
    exit 1
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    echo "Frontend packages not installed. Run npm install in myp3d-frontend first."
    exit 1
fi

(
    cd "$BACKEND_DIR"
    exec "$PYTHON_BIN" main.py
) &
BACKEND_PID=$!

cleanup() {
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

cd "$FRONTEND_DIR"
npm run build
npm run preview -- --port 4173 --strictPort