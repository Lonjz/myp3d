import sqlite3
import threading
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from models.schemas import QueueItem, QueueItemCreate, QueueItemUpdate
from services.config import OUTPUT_DIR
from services.db import connect as _connect
from services.mp3_service import download_as_mp3, make_square_cover, square_cover_from_base64, validate_trim_range

COVER_FETCH_TIMEOUT_S = 15
EDITABLE_STATUSES = ("pending", "failed")

SCHEMA = """
CREATE TABLE IF NOT EXISTS queue_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    position INTEGER NOT NULL,
    url TEXT NOT NULL,
    custom_filename TEXT,
    title TEXT,
    artist TEXT,
    album TEXT,
    cover BLOB,
    start_time REAL,
    end_time REAL,
    overwrite INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    filename TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    finished_at TEXT
)
"""

ITEM_COLUMNS = (
    "id, url, custom_filename, title, artist, album, cover IS NOT NULL AS has_cover, start_time, end_time, "
    "overwrite, status, error, filename, created_at, updated_at, finished_at"
)


class QueueError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


_lock = threading.Lock()
_progress: dict[int, float] = {}
_worker: Optional[threading.Thread] = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean(value: Optional[str]) -> Optional[str]:
    return value.strip() or None if value else None


def _clean_filename(value: Optional[str]) -> Optional[str]:
    name = _clean(value)
    if name is None:
        return None
    name = name.lower()
    if Path(name).name != name:
        raise ValueError("Invalid file name")
    return name


def _square_cover(image_base64: Optional[str]) -> Optional[bytes]:
    return square_cover_from_base64(image_base64)[0] if image_base64 else None


def _remote_cover(url: str) -> Optional[bytes]:
    if not url.startswith("https://"):
        return None
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(request, timeout=COVER_FETCH_TIMEOUT_S) as response:
            return make_square_cover(response.read())[0]
    except (OSError, ValueError):
        return None


def _to_item(row: sqlite3.Row) -> QueueItem:
    data = dict(row)
    data["has_cover"] = bool(data["has_cover"])
    data["overwrite"] = bool(data["overwrite"])
    data["progress"] = _progress.get(data["id"]) if data["status"] == "running" else None
    return QueueItem(**data)


def _select(conn: sqlite3.Connection, where: str = "1", params: tuple = ()) -> list[sqlite3.Row]:
    return conn.execute(f"SELECT {ITEM_COLUMNS} FROM queue_items WHERE {where} ORDER BY position, id", params).fetchall()


def _require(conn: sqlite3.Connection, item_id: int) -> sqlite3.Row:
    rows = _select(conn, "id = ?", (item_id,))
    if not rows:
        raise QueueError(404, "Download not found")
    return rows[0]


def init() -> None:
    with _connect() as conn:
        conn.execute(SCHEMA)
        conn.execute("UPDATE queue_items SET status = 'pending' WHERE status IN ('queued', 'running')")


def list_items() -> list[QueueItem]:
    with _lock, _connect() as conn:
        return [_to_item(row) for row in _select(conn)]


def add_items(items: list[QueueItemCreate]) -> list[QueueItem]:
    prepared = []
    remote_covers: dict[str, Optional[bytes]] = {}
    for item in items:
        url = _clean(item.url)
        if not url:
            raise ValueError("URL is required")
        validate_trim_range(item.start_time, item.end_time)
        cover = _square_cover(item.cover_image_base64)
        if cover is None and item.cover_url:
            if item.cover_url not in remote_covers:
                remote_covers[item.cover_url] = _remote_cover(item.cover_url)
            cover = remote_covers[item.cover_url]
        prepared.append(
            (
                url,
                _clean_filename(item.custom_filename),
                _clean(item.title),
                _clean(item.artist),
                _clean(item.album),
                cover,
                item.start_time,
                item.end_time,
                int(item.overwrite),
            )
        )

    now = _now()
    with _lock, _connect() as conn:
        position = conn.execute("SELECT COALESCE(MAX(position), 0) FROM queue_items").fetchone()[0]
        ids: list[int] = []
        for values in prepared:
            position += 1
            cursor = conn.execute(
                "INSERT INTO queue_items (position, url, custom_filename, title, artist, album, cover, start_time, "
                "end_time, overwrite, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (position, *values, now, now),
            )
            ids.append(cursor.lastrowid)
        placeholders = ", ".join("?" for _ in ids)
        return [_to_item(row) for row in _select(conn, f"id IN ({placeholders})", tuple(ids))]


def update_item(item_id: int, update: QueueItemUpdate) -> QueueItem:
    fields = update.model_fields_set
    values: dict[str, object] = {}
    if "url" in fields:
        url = _clean(update.url)
        if not url:
            raise ValueError("URL is required")
        values["url"] = url
    if "custom_filename" in fields:
        values["custom_filename"] = _clean_filename(update.custom_filename)
    for name in ("title", "artist", "album"):
        if name in fields:
            values[name] = _clean(getattr(update, name))
    if "cover_image_base64" in fields:
        values["cover"] = _square_cover(update.cover_image_base64)
    if update.overwrite is not None:
        values["overwrite"] = int(update.overwrite)

    with _lock, _connect() as conn:
        if _require(conn, item_id)["status"] not in EDITABLE_STATUSES:
            raise QueueError(409, "This download is already queued")
        values.update(status="pending", error=None, updated_at=_now())
        assignments = ", ".join(f"{name} = ?" for name in values)
        conn.execute(f"UPDATE queue_items SET {assignments} WHERE id = ?", (*values.values(), item_id))
        return _to_item(_require(conn, item_id))


def delete_item(item_id: int) -> None:
    with _lock, _connect() as conn:
        if _require(conn, item_id)["status"] == "running":
            raise QueueError(409, "This download is running")
        conn.execute("DELETE FROM queue_items WHERE id = ?", (item_id,))


def get_cover(item_id: int) -> Optional[bytes]:
    with _connect() as conn:
        row = conn.execute("SELECT cover FROM queue_items WHERE id = ?", (item_id,)).fetchone()
    if row is None:
        raise QueueError(404, "Download not found")
    return row["cover"]


def start(ids: Optional[list[int]] = None) -> list[QueueItem]:
    with _lock:
        with _connect() as conn:
            if ids is None:
                conn.execute(
                    "UPDATE queue_items SET status = 'queued', error = NULL, updated_at = ? WHERE status = 'pending'",
                    (_now(),),
                )
            elif ids:
                placeholders = ", ".join("?" for _ in ids)
                conn.execute(
                    "UPDATE queue_items SET status = 'queued', error = NULL, updated_at = ? "
                    f"WHERE status IN ('pending', 'failed') AND id IN ({placeholders})",
                    (_now(), *ids),
                )
        _ensure_worker()
    return list_items()


def stop() -> list[QueueItem]:
    with _lock, _connect() as conn:
        conn.execute("UPDATE queue_items SET status = 'pending', updated_at = ? WHERE status = 'queued'", (_now(),))
    return list_items()


def clear_done() -> list[QueueItem]:
    with _lock, _connect() as conn:
        conn.execute("DELETE FROM queue_items WHERE status = 'done'")
    return list_items()


def _ensure_worker() -> None:
    global _worker
    if _worker is None or not _worker.is_alive():
        _worker = threading.Thread(target=_run_worker, daemon=True)
        _worker.start()


def _claim_next() -> Optional[sqlite3.Row]:
    global _worker
    with _lock, _connect() as conn:
        row = conn.execute(
            "SELECT * FROM queue_items WHERE status = 'queued' ORDER BY position, id LIMIT 1"
        ).fetchone()
        if row is None:
            _worker = None
            return None
        conn.execute(
            "UPDATE queue_items SET status = 'running', error = NULL, updated_at = ? WHERE id = ?",
            (_now(), row["id"]),
        )
        _progress[row["id"]] = 0.0
        return row


def _finish(item_id: int, status: str, error: Optional[str] = None, filename: Optional[str] = None) -> None:
    now = _now()
    with _lock, _connect() as conn:
        _progress.pop(item_id, None)
        conn.execute(
            "UPDATE queue_items SET status = ?, error = ?, filename = ?, updated_at = ?, finished_at = ? WHERE id = ?",
            (status, error, filename, now, now, item_id),
        )


def _run_item(row: sqlite3.Row) -> None:
    item_id = row["id"]

    def on_progress(status: dict) -> None:
        if status.get("status") != "downloading":
            return
        total = status.get("total_bytes") or status.get("total_bytes_estimate")
        if total:
            with _lock:
                _progress[item_id] = min(1.0, (status.get("downloaded_bytes") or 0) / total)

    custom_filename = row["custom_filename"]
    try:
        if custom_filename and not row["overwrite"] and (OUTPUT_DIR / f"{custom_filename}.mp3").exists():
            raise ValueError("Already in library")
        metadata = {"title": row["title"], "artist": row["artist"], "album": row["album"], "cover_image": row["cover"]}
        filename = download_as_mp3(
            row["url"], metadata, custom_filename, row["start_time"], row["end_time"], on_progress
        )
    except Exception as exc:
        _finish(item_id, "failed", error=str(exc) or "Download failed")
        return
    _finish(item_id, "done", filename=filename)


def _run_worker() -> None:
    while True:
        row = _claim_next()
        if row is None:
            return
        _run_item(row)
