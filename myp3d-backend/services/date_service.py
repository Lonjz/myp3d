import threading
from datetime import datetime, timezone

from services.db import connect as _connect

SCHEMA = """
CREATE TABLE IF NOT EXISTS track_dates (
    filename TEXT PRIMARY KEY,
    added_at TEXT NOT NULL
);
"""

_lock = threading.Lock()


def _parse(value: str) -> datetime:
    stamp = datetime.fromisoformat(value)
    return stamp if stamp.tzinfo is not None else stamp.replace(tzinfo=timezone.utc)


def init() -> None:
    with _connect() as conn:
        conn.executescript(SCHEMA)


def resolve(fallbacks: dict[str, datetime]) -> dict[str, datetime]:
    if not fallbacks:
        return {}
    with _lock, _connect() as conn:
        conn.executemany(
            "INSERT OR IGNORE INTO track_dates (filename, added_at) VALUES (?, ?)",
            [(filename, stamp.isoformat()) for filename, stamp in fallbacks.items()],
        )
        rows = conn.execute("SELECT filename, added_at FROM track_dates").fetchall()
    return {row["filename"]: _parse(row["added_at"]) for row in rows if row["filename"] in fallbacks}


def set_date(filename: str, stamp: datetime) -> None:
    with _lock, _connect() as conn:
        conn.execute(
            "INSERT INTO track_dates (filename, added_at) VALUES (?, ?) "
            "ON CONFLICT(filename) DO UPDATE SET added_at = excluded.added_at",
            (filename, stamp.isoformat()),
        )


def rename_track(old: str, new: str) -> None:
    if old == new:
        return
    with _lock, _connect() as conn:
        row = conn.execute("SELECT added_at FROM track_dates WHERE filename = ?", (old,)).fetchone()
        if row is None:
            return
        conn.execute("DELETE FROM track_dates WHERE filename = ?", (old,))
        conn.execute(
            "INSERT INTO track_dates (filename, added_at) VALUES (?, ?) "
            "ON CONFLICT(filename) DO UPDATE SET added_at = excluded.added_at",
            (new, row["added_at"]),
        )


def remove_tracks(filenames: list[str]) -> None:
    if not filenames:
        return
    with _lock, _connect() as conn:
        conn.executemany("DELETE FROM track_dates WHERE filename = ?", [(filename,) for filename in filenames])
