import hashlib
import threading
from io import BytesIO
from pathlib import Path
from typing import Optional

from PIL import Image

from services.mp3_service import get_album_cover

SAMPLE_BYTES = 64 * 1024
ID3V1_LENGTH = 128
APE_FOOTER_LENGTH = 32
APE_HAS_HEADER = 1 << 31
COVER_HASH_SIZE = (9, 8)
COVER_MATCH_DISTANCE = 6

_lock = threading.Lock()
_fingerprints: dict[str, tuple[int, int, Optional[str]]] = {}
_cover_hashes: dict[str, tuple[int, int, Optional[int]]] = {}


def id3_tag_length(header: bytes) -> int:
    if len(header) < 10 or header[:3] != b"ID3":
        return 0
    size = (header[6] & 0x7F) << 21 | (header[7] & 0x7F) << 14 | (header[8] & 0x7F) << 7 | (header[9] & 0x7F)
    footer = 10 if header[5] & 0x10 else 0
    return 10 + size + footer


def _cached(cache: dict, path: Path, compute):
    try:
        stats = path.stat()
    except OSError:
        return None
    key = str(path)
    with _lock:
        cached = cache.get(key)
    if cached is not None and cached[0] == stats.st_size and cached[1] == stats.st_mtime_ns:
        return cached[2]
    value = compute(path, stats.st_size)
    with _lock:
        cache[key] = (stats.st_size, stats.st_mtime_ns, value)
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


def _compute_fingerprint(path: Path, size: int) -> Optional[str]:
    try:
        with open(path, "rb") as handle:
            start = min(size, id3_tag_length(handle.read(10)))
            end = _payload_end(handle, start, size)
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
    return _cached(_fingerprints, path, _compute_fingerprint)


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
    return _cached(_cover_hashes, path, _compute_cover_hash)


def covers_match(first: Optional[int], second: Optional[int]) -> bool:
    if first is None or second is None:
        return first is second
    return bin(first ^ second).count("1") <= COVER_MATCH_DISTANCE
