import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Iterator

from services.config import DB_PATH


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def enable_wal() -> None:
    with connect() as conn:
        conn.execute("PRAGMA journal_mode=WAL")


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        with conn:
            yield conn
    finally:
        conn.close()
