from fastapi import APIRouter, HTTPException

from models.queue import DownloadRequest, DownloadResponse
from services.youtube_service import download_as_mp3, validate_trim_range

router = APIRouter(tags=["Download"])


@router.post("/download", response_model=DownloadResponse)
def download_mp3(request: DownloadRequest):
    try:
        validate_trim_range(request.start_time, request.end_time)

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
            overwrite=request.overwrite,
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
