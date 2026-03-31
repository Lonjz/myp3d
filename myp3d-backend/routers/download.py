from fastapi import APIRouter, HTTPException

from models.schemas import DownloadRequest, DownloadResponse
from services.mp3_service import download_as_mp3

router = APIRouter(tags=["Download"])


@router.post("/download", response_model=DownloadResponse)
async def download_mp3(request: DownloadRequest):
    """Download a YouTube video as MP3 at 320kbps."""
    try:
        metadata = {
            "title": request.title,
            "artist": request.artist,
            "album": request.album
        }
        filename = download_as_mp3(request.url, metadata, request.custom_filename)
        return DownloadResponse(
            success=True,
            filename=filename,
            message=f"Successfully downloaded: {filename}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
