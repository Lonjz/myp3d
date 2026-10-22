import sqlite3
from contextlib import contextmanager
from typing import Iterator

from services.config import BASE_DIR

DB_PATH = BASE_DIR / "myp3d.db"


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        with conn:
            yield conn
    finally:
        conn.close()
