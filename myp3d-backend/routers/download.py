from fastapi import APIRouter, HTTPException

from models.schemas import DownloadRequest, DownloadResponse
from services.mp3_service import download_as_mp3

router = APIRouter(tags=["Download"])


@router.post("/download", response_model=DownloadResponse)
async def download_mp3(request: DownloadRequest):
    """Download a YouTube video as MP3 at 320kbps."""
    try:
        if (request.start_time is None) ^ (request.end_time is None):
            raise ValueError("Both start and end times are required for trimming")
        if request.start_time is not None:
            if request.start_time < 0:
                raise ValueError("Trim start must be 0 or greater")
            if request.end_time is None or request.end_time <= request.start_time:
                raise ValueError("Trim end must be greater than start")

        metadata = {
            "title": request.title,
            "artist": request.artist,
            "album": request.album,
            "cover_image_base64": request.cover_image_base64,
        }
        filename = download_as_mp3(
            request.url,
            metadata,
            request.custom_filename,
            request.start_time,
            request.end_time,
        )
        return DownloadResponse(
            success=True,
            filename=filename,
            message=f"Successfully downloaded: {filename}"
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
