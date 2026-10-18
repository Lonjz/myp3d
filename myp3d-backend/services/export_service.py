import io
import zipfile
from io import BytesIO
from pathlib import Path
from typing import Iterator

from PIL import Image

from services.mp3_service import (
    COVER_SIZE,
    build_album_groups,
    get_album_cover,
    list_mp3_filepaths,
    make_square_cover,
    safe_path_part,
)

CHUNK_SIZE = 1024 * 1024
JPEG_MIME_TYPES = {"image/jpeg", "image/jpg"}


class _ZipBuffer(io.RawIOBase):
    def __init__(self) -> None:
        super().__init__()
        self._chunks: list[bytes] = []

    def writable(self) -> bool:
        return True

    def write(self, data) -> int:
        self._chunks.append(bytes(data))
        return len(data)

    def drain(self) -> bytes:
        data = b"".join(self._chunks)
        self._chunks.clear()
        return data


def track_paths() -> list[Path]:
    return list_mp3_filepaths()


def albums_with_covers() -> list[tuple[str, list[Path]]]:
    groups = sorted(build_album_groups().values(), key=lambda group: group.album_name.casefold())
    return [(group.album_name, group.filepaths) for group in groups if group.normalized_album and group.has_cover]


def stream_tracks(paths: list[Path]) -> Iterator[bytes]:
    buffer = _ZipBuffer()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_STORED) as archive:
        for path in paths:
            try:
                source = path.open("rb")
            except OSError:
                continue
            with source, archive.open(path.name, "w") as entry:
                while chunk := source.read(CHUNK_SIZE):
                    entry.write(chunk)
                    yield buffer.drain()
    yield buffer.drain()


def _export_cover(image_data: bytes, mime_type: str) -> bytes:
    if mime_type.lower() in JPEG_MIME_TYPES:
        try:
            with Image.open(BytesIO(image_data)) as image:
                if image.format == "JPEG" and image.size == COVER_SIZE:
                    return image_data
        except (OSError, ValueError):
            pass
    return make_square_cover(image_data)[0]


def _unique_name(base: str, used: set[str]) -> str:
    name = f"{base}.jpg"
    counter = 2
    while name.casefold() in used:
        name = f"{base} ({counter}).jpg"
        counter += 1
    used.add(name.casefold())
    return name


def stream_album_art(albums: list[tuple[str, list[Path]]]) -> Iterator[bytes]:
    buffer = _ZipBuffer()
    used: set[str] = set()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_STORED) as archive:
        for album_name, filepaths in albums:
            cover = get_album_cover(filepaths)
            if cover is None:
                continue
            try:
                image_data = _export_cover(*cover)
            except ValueError:
                continue
            archive.writestr(_unique_name(safe_path_part(album_name, "Album"), used), image_data)
            yield buffer.drain()
    yield buffer.drain()
