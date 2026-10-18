#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="$ROOT_DIR/myp3d-backend/venv/bin/python"

if [[ ! -x "$PYTHON_BIN" ]]; then
    echo "Backend venv Python not found. Expected venv/bin/python under myp3d-backend."
    exit 1
fi

BEFORE="$("$PYTHON_BIN" -m yt_dlp --version 2>/dev/null || echo none)"
"$PYTHON_BIN" -m pip install --upgrade --disable-pip-version-check "yt-dlp[default]"
AFTER="$("$PYTHON_BIN" -m yt_dlp --version)"

if [[ "$BEFORE" == "$AFTER" ]]; then
    echo "yt-dlp is already up to date ($AFTER)."
else
    echo "Updated yt-dlp from $BEFORE to $AFTER. Restart the backend to use it."
fi
