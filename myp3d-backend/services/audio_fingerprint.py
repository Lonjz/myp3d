import hashlib
import json
import os
import threading
from io import BytesIO
from pathlib import Path
from typing import Any, Callable, Optional

from PIL import Image

from services.cover_service import get_album_cover
from services.db import connect

SAMPLE_BYTES = 64 * 1024
ID3V1_LENGTH = 128
APE_FOOTER_LENGTH = 32
APE_HAS_HEADER = 1 << 31
COVER_HASH_SIZE = (9, 8)
COVER_MATCH_DISTANCE = 6

SCHEMA = """
CREATE TABLE IF NOT EXISTS file_cache (
    kind TEXT NOT NULL,
    path TEXT NOT NULL,
    size INTEGER NOT NULL,
    mtime_ns INTEGER NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (kind, path)
)
"""

_lock = threading.Lock()
_caches: dict[str, dict[str, tuple[int, int, Any]]] = {}


def id3_tag_length(header: bytes) -> int:
    if len(header) < 10 or header[:3] != b"ID3":
        return 0
    size = (header[6] & 0x7F) << 21 | (header[7] & 0x7F) << 14 | (header[8] & 0x7F) << 7 | (header[9] & 0x7F)
    footer = 10 if header[5] & 0x10 else 0
    return 10 + size + footer


def init() -> None:
    with connect() as conn:
        conn.execute(SCHEMA)


def prune_file_cache() -> None:
    with connect() as conn:
        paths = [row["path"] for row in conn.execute("SELECT DISTINCT path FROM file_cache")]
        conn.executemany("DELETE FROM file_cache WHERE path = ?", [(path,) for path in paths if not os.path.exists(path)])


def clear_file_cache() -> None:
    with _lock, connect() as conn:
        _caches.clear()
        conn.execute("DELETE FROM file_cache")


def _cache(kind: str) -> dict[str, tuple[int, int, Any]]:
    with _lock:
        cache = _caches.get(kind)
    if cache is not None:
        return cache
    with connect() as conn:
        rows = conn.execute("SELECT path, size, mtime_ns, value FROM file_cache WHERE kind = ?", (kind,)).fetchall()
    loaded = {row["path"]: (row["size"], row["mtime_ns"], json.loads(row["value"])) for row in rows}
    with _lock:
        return _caches.setdefault(kind, loaded)


def stat_cached(kind: str, path: Path, compute: Callable[[Path, int], Any]) -> Any:
    try:
        stats = path.stat()
    except OSError:
        return None
    key = str(path)
    cache = _cache(kind)
    with _lock:
        cached = cache.get(key)
    if cached is not None and cached[:2] == (stats.st_size, stats.st_mtime_ns):
        return cached[2]
    value = compute(path, stats.st_size)
    with _lock:
        cache[key] = (stats.st_size, stats.st_mtime_ns, value)
    with connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO file_cache (kind, path, size, mtime_ns, value) VALUES (?, ?, ?, ?, ?)",
            (kind, key, stats.st_size, stats.st_mtime_ns, json.dumps(value)),
        )
    return value


def _payload_end(handle, start: int, size: int) -> int:
    end = size
    if end - start >= ID3V1_LENGTH:
        handle.seek(end - ID3V1_LENGTH)
        if handle.read(3) == b"TAG":
            end -= ID3V1_LENGTH
    if end - start >= APE_FOOTER_LENGTH:
        handle.seek(end - APE_FOOTER_LENGTH)
        footer = handle.read(APE_FOOTER_LENGTH)
        if footer[:8] == b"APETAGEX":
            tag_size = int.from_bytes(footer[12:16], "little")
            flags = int.from_bytes(footer[20:24], "little")
            tag_size += APE_FOOTER_LENGTH if flags & APE_HAS_HEADER else 0
            end = max(start, end - tag_size)
    return end


def audio_bounds(handle, size: int) -> tuple[int, int]:
    handle.seek(0)
    start = min(size, id3_tag_length(handle.read(10)))
    return start, _payload_end(handle, start, size)


def splice_audio(tags_source: Path, audio_source: Path, destination: Path) -> None:
    with open(tags_source, "rb") as tagged, open(audio_source, "rb") as audio, open(destination, "wb") as handle:
        start, end = audio_bounds(tagged, os.fstat(tagged.fileno()).st_size)
        audio_start, audio_end = audio_bounds(audio, os.fstat(audio.fileno()).st_size)
        if audio_end <= audio_start:
            raise OSError("The file has no audio")
        tagged.seek(0)
        handle.write(tagged.read(start))
        audio.seek(audio_start)
        handle.write(audio.read(audio_end - audio_start))
        tagged.seek(end)
        handle.write(tagged.read())


def _compute_fingerprint(path: Path, size: int) -> Optional[str]:
    try:
        with open(path, "rb") as handle:
            start, end = audio_bounds(handle, size)
            length = end - start
            if length <= 0:
                return None
            digest = hashlib.sha1(str(length).encode("ascii"))
            handle.seek(start)
            digest.update(handle.read(min(length, SAMPLE_BYTES)))
            tail_start = max(start + SAMPLE_BYTES, end - SAMPLE_BYTES)
            if tail_start < end:
                handle.seek(tail_start)
                digest.update(handle.read(end - tail_start))
    except OSError:
        return None
    return digest.hexdigest()


def audio_fingerprint(path: Path) -> Optional[str]:
    return stat_cached("audio", path, _compute_fingerprint)


def _compute_cover_hash(path: Path, _: int) -> Optional[int]:
    try:
        cover = get_album_cover([path])
    except Exception:
        return None
    if cover is None:
        return None
    try:
        with Image.open(BytesIO(cover[0])) as image:
            pixels = list(image.convert("L").resize(COVER_HASH_SIZE, Image.Resampling.LANCZOS).getdata())
    except Exception:
        return None
    width, height = COVER_HASH_SIZE
    value = 0
    for row in range(height):
        for column in range(width - 1):
            left = pixels[row * width + column]
            right = pixels[row * width + column + 1]
            value = (value << 1) | (1 if left > right else 0)
    return value


def cover_hash(path: Path) -> Optional[int]:
    return stat_cached("cover", path, _compute_cover_hash)


def covers_match(first: Optional[int], second: Optional[int]) -> bool:
    if first is None or second is None:
        return first is second
    return bin(first ^ second).count("1") <= COVER_MATCH_DISTANCE
