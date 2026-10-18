from datetime import date
from typing import Iterator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from services import export_service

router = APIRouter(prefix="/export", tags=["Export"])


def _zip_response(chunks: Iterator[bytes], name: str) -> StreamingResponse:
    filename = f"myp3d-{name}-{date.today().isoformat()}.zip"
    return StreamingResponse(
        chunks,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/tracks.zip")
def export_tracks():
    paths = export_service.track_paths()
    if not paths:
        raise HTTPException(status_code=404, detail="The library is empty")
    return _zip_response(export_service.stream_tracks(paths), "tracks")


@router.get("/covers.zip")
def export_album_art():
    albums = export_service.albums_with_covers()
    if not albums:
        raise HTTPException(status_code=404, detail="No album has a cover")
    return _zip_response(export_service.stream_album_art(albums), "album-art")
