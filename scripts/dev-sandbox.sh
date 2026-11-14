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

if ! cmp -s "$BACKEND_DIR/requirements.txt" "$BACKEND_DIR/venv/installed-requirements.txt"; then
    echo "Backend packages are missing or out of date. Installing them."
    "$PYTHON_BIN" -m pip install -r "$BACKEND_DIR/requirements.txt"
    cp "$BACKEND_DIR/requirements.txt" "$BACKEND_DIR/venv/installed-requirements.txt"
fi

if [[ "$FRONTEND_DIR/package-lock.json" -nt "$FRONTEND_DIR/node_modules/.package-lock.json" ]]; then
    echo "Frontend packages are missing or out of date. Installing them."
    (
        cd "$FRONTEND_DIR"
        npm install
    )
fi

(
    cd "$BACKEND_DIR"
    exec "$PYTHON_BIN" tests/sandbox.py "$@"
) &
BACKEND_PID=$!

cleanup() {
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

cd "$FRONTEND_DIR"
npm run dev -- --mode sandbox --port 5174 --strictPort
