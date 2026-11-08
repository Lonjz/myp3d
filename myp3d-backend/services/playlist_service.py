import sqlite3
import threading
import uuid
from dataclasses import asdict, dataclass
from typing import Iterable, Optional

from models.library import MP3Info
from models.playlists import PlaylistDetail, PlaylistInfo
from models.sync import SyncPlaylistRecord
from services.cover_service import cover_digest
from services.db import connect as _connect
from services.db import now as _now
from services.mp3_service import library_names, list_mp3_infos
from services.errors import AppError
from services.filenames import is_track_name

SCHEMA = """
CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    cover BLOB,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS playlist_tracks (
    playlist_id TEXT NOT NULL REFERENCES playlists(id),
    position INTEGER NOT NULL,
    filename TEXT NOT NULL,
    PRIMARY KEY (playlist_id, position)
);
CREATE INDEX IF NOT EXISTS playlist_tracks_filename ON playlist_tracks(filename);
"""

PLAYLIST_COLUMNS = "id, name, description, cover IS NOT NULL AS has_cover, is_favorites, updated_at"
STATE_COLUMNS = "id, name, description, cover, is_favorites, created_at, updated_at, deleted_at"


@dataclass
class PlaylistState:
    id: str
    name: str
    description: str
    filenames: list[str]
    cover_hash: Optional[str]
    is_favorites: bool
    created_at: str
    updated_at: str
    deleted_at: Optional[str]


_lock = threading.Lock()


def _clean_name(name: str) -> str:
    cleaned = name.strip()
    if not cleaned:
        raise AppError(400, "Name is required")
    return cleaned


def _clean_filenames(filenames: Iterable[str]) -> list[str]:
    cleaned: list[str] = []
    for filename in filenames:
        if not is_track_name(filename):
            raise AppError(400, f"Invalid file name: {filename}")
        cleaned.append(filename)
    return cleaned


def _require(conn: sqlite3.Connection, playlist_id: str) -> sqlite3.Row:
    row = conn.execute(
        f"SELECT {PLAYLIST_COLUMNS} FROM playlists WHERE id = ? AND deleted_at IS NULL", (playlist_id,)
    ).fetchone()
    if row is None:
        raise AppError(404, "Playlist not found")
    return row


def _filenames(conn: sqlite3.Connection, playlist_id: str) -> list[str]:
    rows = conn.execute(
        "SELECT filename FROM playlist_tracks WHERE playlist_id = ? ORDER BY position", (playlist_id,)
    ).fetchall()
    return [row["filename"] for row in rows]


def _all_tracks(conn: sqlite3.Connection) -> dict[str, list[str]]:
    tracks: dict[str, list[str]] = {}
    for track in conn.execute("SELECT playlist_id, filename FROM playlist_tracks ORDER BY playlist_id, position"):
        tracks.setdefault(track["playlist_id"], []).append(track["filename"])
    return tracks


def _favorite_ids(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute(
        "SELECT id FROM playlists WHERE is_favorites = 1 AND deleted_at IS NULL ORDER BY created_at, id"
    ).fetchall()
    return [row["id"] for row in rows]


def _write_tracks(conn: sqlite3.Connection, playlist_id: str, filenames: list[str]) -> None:
    conn.execute("DELETE FROM playlist_tracks WHERE playlist_id = ?", (playlist_id,))
    conn.executemany(
        "INSERT INTO playlist_tracks (playlist_id, position, filename) VALUES (?, ?, ?)",
        [(playlist_id, position, filename) for position, filename in enumerate(filenames)],
    )


def _touch(conn: sqlite3.Connection, playlist_id: str) -> None:
    conn.execute("UPDATE playlists SET updated_at = ? WHERE id = ?", (_now(), playlist_id))


def _to_info(row: sqlite3.Row, filenames: list[str], names: set[str]) -> PlaylistInfo:
    return PlaylistInfo(
        id=row["id"],
        name=row["name"],
        description=row["description"],
        track_count=sum(1 for filename in filenames if filename in names),
        has_cover=bool(row["has_cover"]),
        is_favorites=bool(row["is_favorites"]),
        updated_at=row["updated_at"],
    )


def _to_detail(row: sqlite3.Row, filenames: list[str]) -> PlaylistDetail:
    infos: dict[str, MP3Info] = {info.filename: info for info in list_mp3_infos()}
    tracks = [infos[filename] for filename in filenames if filename in infos]
    return PlaylistDetail(
        **_to_info(row, filenames, set(infos)).model_dump(),
        tracks=tracks,
    )


def _to_state(row: sqlite3.Row, filenames: list[str]) -> PlaylistState:
    return PlaylistState(
        id=row["id"],
        name=row["name"],
        description=row["description"],
        filenames=filenames,
        cover_hash=cover_digest(row["cover"]),
        is_favorites=bool(row["is_favorites"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        deleted_at=row["deleted_at"],
    )


def init() -> None:
    with _connect() as conn:
        conn.executescript(SCHEMA)
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(playlists)")}
        if "description" not in columns:
            conn.execute("ALTER TABLE playlists ADD COLUMN description TEXT NOT NULL DEFAULT ''")
        if "is_favorites" not in columns:
            conn.execute("ALTER TABLE playlists ADD COLUMN is_favorites INTEGER NOT NULL DEFAULT 0")


def list_playlists() -> list[PlaylistInfo]:
    names = library_names()
    with _connect() as conn:
        rows = conn.execute(
            f"SELECT {PLAYLIST_COLUMNS} FROM playlists WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE, id"
        ).fetchall()
        tracks = _all_tracks(conn)
    return [_to_info(row, tracks.get(row["id"], []), names) for row in rows]


def listed_filenames() -> set[str]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT DISTINCT t.filename FROM playlist_tracks t JOIN playlists p ON p.id = t.playlist_id "
            "WHERE p.deleted_at IS NULL AND p.is_favorites = 0"
        ).fetchall()
    return {row["filename"] for row in rows}


def list_states() -> list[PlaylistState]:
    with _connect() as conn:
        rows = conn.execute(f"SELECT {STATE_COLUMNS} FROM playlists ORDER BY id").fetchall()
        tracks = _all_tracks(conn)
    return [_to_state(row, tracks.get(row["id"], [])) for row in rows]


def get_state(playlist_id: str) -> PlaylistState:
    with _connect() as conn:
        row = conn.execute(f"SELECT {STATE_COLUMNS} FROM playlists WHERE id = ?", (playlist_id,)).fetchone()
        if row is None:
            raise AppError(404, "Playlist not found")
        return _to_state(row, _filenames(conn, playlist_id))


def favorites_id() -> Optional[str]:
    with _connect() as conn:
        ids = _favorite_ids(conn)
    return ids[0] if ids else None


def had_favorites() -> bool:
    with _connect() as conn:
        return conn.execute("SELECT 1 FROM playlists WHERE is_favorites = 1").fetchone() is not None


def merge_favorites() -> None:
    with _lock, _connect() as conn:
        ids = _favorite_ids(conn)
        if len(ids) < 2:
            return
        keep, *others = ids
        merged = _filenames(conn, keep)
        now = _now()
        for other in others:
            merged += [filename for filename in _filenames(conn, other) if filename not in merged]
            _write_tracks(conn, other, [])
            conn.execute(
                "UPDATE playlists SET cover = NULL, updated_at = ?, deleted_at = ? WHERE id = ?",
                (now, now, other),
            )
        _write_tracks(conn, keep, merged)
        _touch(conn, keep)


def find_by_name(name: str) -> Optional[str]:
    with _connect() as conn:
        rows = conn.execute("SELECT id, name FROM playlists WHERE deleted_at IS NULL ORDER BY created_at, id").fetchall()
    wanted = name.casefold()
    return next((row["id"] for row in rows if row["name"].strip().casefold() == wanted), None)


def mark_favorites(playlist_id: str) -> None:
    with _lock, _connect() as conn:
        _require(conn, playlist_id)
        conn.execute("UPDATE playlists SET is_favorites = 1 WHERE id = ?", (playlist_id,))
        _touch(conn, playlist_id)


def replace_tracks(playlist_id: str, filenames: list[str]) -> None:
    cleaned = _clean_filenames(filenames)
    with _lock, _connect() as conn:
        _require(conn, playlist_id)
        if _filenames(conn, playlist_id) == cleaned:
            return
        _write_tracks(conn, playlist_id, cleaned)
        _touch(conn, playlist_id)


def stored_filenames(playlist_id: str) -> list[str]:
    with _connect() as conn:
        return _filenames(conn, playlist_id)


def get_playlist(playlist_id: str) -> PlaylistDetail:
    with _connect() as conn:
        row = _require(conn, playlist_id)
        filenames = _filenames(conn, playlist_id)
    return _to_detail(row, filenames)


def create(name: str, filenames: list[str], description: str = "") -> PlaylistDetail:
    cleaned_name = _clean_name(name)
    cleaned = _clean_filenames(filenames)
    playlist_id = uuid.uuid4().hex
    now = _now()
    with _lock, _connect() as conn:
        conn.execute(
            "INSERT INTO playlists (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (playlist_id, cleaned_name, description.strip(), now, now),
        )
        _write_tracks(conn, playlist_id, cleaned)
    return get_playlist(playlist_id)


def update(
    playlist_id: str,
    name: Optional[str],
    filenames: Optional[list[str]],
    description: Optional[str] = None,
) -> PlaylistDetail:
    cleaned_name = _clean_name(name) if name is not None else None
    cleaned = _clean_filenames(filenames) if filenames is not None else None
    names = library_names() if cleaned is not None else set()
    with _lock, _connect() as conn:
        _require(conn, playlist_id)
        if cleaned_name is not None:
            conn.execute("UPDATE playlists SET name = ? WHERE id = ?", (cleaned_name, playlist_id))
        if description is not None:
            conn.execute("UPDATE playlists SET description = ? WHERE id = ?", (description.strip(), playlist_id))
        if cleaned is not None:
            missing = [
                filename
                for filename in _filenames(conn, playlist_id)
                if filename not in names and filename not in cleaned
            ]
            _write_tracks(conn, playlist_id, cleaned + missing)
        _touch(conn, playlist_id)
    return get_playlist(playlist_id)


def add_tracks(playlist_id: str, filenames: list[str]) -> PlaylistInfo:
    cleaned = _clean_filenames(filenames)
    names = library_names()
    with _lock, _connect() as conn:
        row = _require(conn, playlist_id)
        current = _filenames(conn, playlist_id)
        added = [filename for filename in cleaned if filename not in current]
        if added:
            _write_tracks(conn, playlist_id, added + current)
            _touch(conn, playlist_id)
            row = _require(conn, playlist_id)
        return _to_info(row, added + current, names)


def set_cover(playlist_id: str, cover: bytes) -> PlaylistInfo:
    names = library_names()
    with _lock, _connect() as conn:
        _require(conn, playlist_id)
        conn.execute("UPDATE playlists SET cover = ? WHERE id = ?", (cover, playlist_id))
        _touch(conn, playlist_id)
        return _to_info(_require(conn, playlist_id), _filenames(conn, playlist_id), names)


def get_cover(playlist_id: str) -> Optional[tuple[bytes, str]]:
    with _connect() as conn:
        _require(conn, playlist_id)
        row = conn.execute("SELECT cover, updated_at FROM playlists WHERE id = ?", (playlist_id,)).fetchone()
    if row["cover"] is None:
        return None
    return row["cover"], row["updated_at"]


def delete(playlist_id: str) -> None:
    now = _now()
    with _lock, _connect() as conn:
        _require(conn, playlist_id)
        _write_tracks(conn, playlist_id, [])
        conn.execute(
            "UPDATE playlists SET cover = NULL, updated_at = ?, deleted_at = ? WHERE id = ?",
            (now, now, playlist_id),
        )


def _rewrite_containing(conn: sqlite3.Connection, filenames: list[str], rewrite) -> None:
    placeholders = ", ".join("?" for _ in filenames)
    rows = conn.execute(
        f"SELECT DISTINCT playlist_id FROM playlist_tracks WHERE filename IN ({placeholders})", filenames
    ).fetchall()
    for row in rows:
        playlist_id = row["playlist_id"]
        _write_tracks(conn, playlist_id, rewrite(_filenames(conn, playlist_id)))
        _touch(conn, playlist_id)


def rename_track(old: str, new: str) -> None:
    if old == new:
        return
    with _lock, _connect() as conn:
        _rewrite_containing(conn, [old], lambda current: [new if filename == old else filename for filename in current])


def remove_tracks(filenames: list[str]) -> None:
    if not filenames:
        return
    removed = set(filenames)
    with _lock, _connect() as conn:
        _rewrite_containing(conn, filenames, lambda current: [filename for filename in current if filename not in removed])


def sync_records() -> list[SyncPlaylistRecord]:
    return [SyncPlaylistRecord(**asdict(state)) for state in list_states()]


def cover_by_id(playlist_id: str) -> Optional[bytes]:
    with _connect() as conn:
        row = conn.execute("SELECT cover FROM playlists WHERE id = ?", (playlist_id,)).fetchone()
    return row["cover"] if row is not None else None


def apply_record(record: SyncPlaylistRecord, cover: Optional[bytes]) -> None:
    filenames = _clean_filenames(record.filenames)
    with _lock, _connect() as conn:
        conn.execute(
            "INSERT INTO playlists (id, name, description, cover, is_favorites, created_at, updated_at, deleted_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, "
            "description = excluded.description, cover = excluded.cover, is_favorites = excluded.is_favorites, "
            "created_at = excluded.created_at, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at",
            (record.id, record.name, record.description, cover, int(record.is_favorites), record.created_at, record.updated_at, record.deleted_at),
        )
        _write_tracks(conn, record.id, filenames)
