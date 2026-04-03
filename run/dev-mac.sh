#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/myp3d-backend"
FRONTEND_DIR="$ROOT_DIR/myp3d-frontend"

PYTHON_BIN="$BACKEND_DIR/venv/bin/python"
if [[ ! -x "$PYTHON_BIN" ]]; then
    PYTHON_BIN="$BACKEND_DIR/.venv/bin/python"
fi

if [[ ! -x "$PYTHON_BIN" ]]; then
    echo "Backend venv Python not found. Expected venv/bin/python or .venv/bin/python under myp3d-backend."
    exit 1
fi

(
    cd "$BACKEND_DIR"
    "$PYTHON_BIN" main.py
) &
BACKEND_PID=$!

cleanup() {
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

cd "$FRONTEND_DIR"
npm run dev