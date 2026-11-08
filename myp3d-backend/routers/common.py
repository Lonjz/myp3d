from pathlib import Path
from typing import Optional

from fastapi import HTTPException, Response, UploadFile

from services.config import OUTPUT_DIR
from services.cover_service import CoverSize, get_album_cover, get_cover_variant, make_square_cover
from services.filenames import is_track_name

CACHE_CONTROL_HEADER = {"Cache-Control": "public, max-age=300"}
IMMUTABLE_CACHE_HEADER = {"Cache-Control": "public, max-age=31536000, immutable"}


def cache_headers(version: object) -> dict[str, str]:
    return IMMUTABLE_CACHE_HEADER if version else CACHE_CONTROL_HEADER


def track_path(filename: str) -> Path:
    if not is_track_name(filename):
        raise HTTPException(status_code=400, detail="Invalid filename")
    return OUTPUT_DIR / filename


def require_mp3(filename: str) -> Path:
    path = track_path(filename)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="MP3 file not found")
    return path


def cover_response(filepaths: list[Path], size: Optional[CoverSize], headers: Optional[dict[str, str]] = None) -> Response:
    cover = get_cover_variant(filepaths, size) if size else get_album_cover(filepaths)
    if cover is None:
        raise HTTPException(status_code=404, detail="No cover image found")
    return Response(content=cover[0], media_type=cover[1], headers=headers)


def read_cover(cover: UploadFile) -> tuple[bytes, str]:
    if not (cover.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    try:
        return make_square_cover(cover.file.read())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
