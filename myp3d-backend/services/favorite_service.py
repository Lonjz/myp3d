import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional

from models.schemas import SyncFavoriteRecord
from services.db import connect as _connect

SCHEMA = """
CREATE TABLE IF NOT EXISTS favorites (
    filename TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS apple_favorite_snapshot (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    filenames TEXT NOT NULL,
    synced_at TEXT NOT NULL
);
"""


class FavoriteError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


_lock = threading.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean_filename(filename: str) -> str:
    if Path(filename).name != filename or not filename.lower().endswith(".mp3"):
        raise FavoriteError(400, f"Invalid file name: {filename}")
    return filename


def init() -> None:
    with _connect() as conn:
        conn.executescript(SCHEMA)


def list_filenames() -> set[str]:
    return set(list_ordered())


def list_ordered() -> list[str]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT filename FROM favorites WHERE deleted_at IS NULL ORDER BY created_at, filename"
        ).fetchall()
    return [row["filename"] for row in rows]


def _star(conn: sqlite3.Connection, filename: str, now: str) -> None:
    conn.execute(
        "INSERT INTO favorites (filename, created_at, updated_at) VALUES (?, ?, ?) "
        "ON CONFLICT(filename) DO UPDATE SET created_at = excluded.created_at, "
        "updated_at = excluded.updated_at, deleted_at = NULL WHERE favorites.deleted_at IS NOT NULL",
        (filename, now, now),
    )


def _unstar(conn: sqlite3.Connection, filename: str, now: str) -> None:
    conn.execute(
        "UPDATE favorites SET updated_at = ?, deleted_at = ? WHERE filename = ? AND deleted_at IS NULL",
        (now, now, filename),
    )


def set_many(add: Iterable[str], remove: Iterable[str]) -> None:
    added = [_clean_filename(filename) for filename in add]
    removed = [_clean_filename(filename) for filename in remove]
    if not added and not removed:
        return
    now = _now()
    with _lock, _connect() as conn:
        for filename in added:
            _star(conn, filename, now)
        for filename in removed:
            _unstar(conn, filename, now)


def _read_snapshot(conn: sqlite3.Connection) -> Optional[list[str]]:
    row = conn.execute("SELECT filenames FROM apple_favorite_snapshot WHERE id = 1").fetchone()
    return json.loads(row["filenames"]) if row is not None else None


def _write_snapshot(conn: sqlite3.Connection, filenames: Iterable[str]) -> None:
    conn.execute(
        "INSERT INTO apple_favorite_snapshot (id, filenames, synced_at) VALUES (1, ?, ?) "
        "ON CONFLICT(id) DO UPDATE SET filenames = excluded.filenames, synced_at = excluded.synced_at",
        (json.dumps(sorted(set(filenames))), _now()),
    )


def apple_snapshot() -> Optional[set[str]]:
    with _connect() as conn:
        snapshot = _read_snapshot(conn)
    return set(snapshot) if snapshot is not None else None


def save_apple_snapshot(filenames: Iterable[str]) -> None:
    with _lock, _connect() as conn:
        _write_snapshot(conn, filenames)


def rename_track(old: str, new: str) -> None:
    if old == new:
        return
    now = _now()
    with _lock, _connect() as conn:
        snapshot = _read_snapshot(conn)
        if snapshot is not None and old in snapshot:
            _write_snapshot(conn, [new if filename == old else filename for filename in snapshot])
        row = conn.execute("SELECT 1 FROM favorites WHERE filename = ? AND deleted_at IS NULL", (old,)).fetchone()
        if row is None:
            return
        _unstar(conn, old, now)
        _star(conn, new, now)


def remove_tracks(filenames: list[str]) -> None:
    if not filenames:
        return
    removed = set(filenames)
    now = _now()
    with _lock, _connect() as conn:
        snapshot = _read_snapshot(conn)
        if snapshot is not None and removed & set(snapshot):
            _write_snapshot(conn, [filename for filename in snapshot if filename not in removed])
        for filename in filenames:
            _unstar(conn, filename, now)


def sync_records() -> list[SyncFavoriteRecord]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT filename, created_at, updated_at, deleted_at FROM favorites ORDER BY filename"
        ).fetchall()
    return [
        SyncFavoriteRecord(
            filename=row["filename"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            deleted_at=row["deleted_at"],
        )
        for row in rows
    ]


def apply_record(record: SyncFavoriteRecord) -> None:
    filename = _clean_filename(record.filename)
    with _lock, _connect() as conn:
        conn.execute(
            "INSERT INTO favorites (filename, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(filename) DO UPDATE SET created_at = excluded.created_at, "
            "updated_at = excluded.updated_at, deleted_at = excluded.deleted_at",
            (filename, record.created_at, record.updated_at, record.deleted_at),
        )
