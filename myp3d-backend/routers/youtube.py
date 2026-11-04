from fastapi import APIRouter, HTTPException, Query

from models.health import SilenceBoundsRequest, TrimRange
from models.library import TagSuggestion
from models.queue import YouTubeSearchResponse
from services import health_service, spotify_service
from services.errors import AppError
from services.youtube_service import search_youtube

router = APIRouter(tags=["YouTube"])


@router.get("/youtube/search", response_model=YouTubeSearchResponse)
def youtube_search(
    query: str = Query(..., min_length=1, description="YouTube search query"),
    limit: int = Query(12, ge=1, le=30, description="Maximum number of results"),
):
    try:
        results = search_youtube(query, limit)
        return YouTubeSearchResponse(query=query, results=results)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"YouTube search failed: {exc}") from exc


@router.post("/youtube/silence", response_model=TrimRange)
def youtube_silence(payload: SilenceBoundsRequest):
    try:
        return health_service.silence_bounds(payload.url)
    except AppError:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Couldn't read the audio: {exc}") from exc


@router.get("/youtube/songs", response_model=list[TagSuggestion])
def youtube_songs(q: str = Query(..., min_length=1, description="Song search query")):
    try:
        return spotify_service.song_suggestions(q)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"YouTube Music search failed: {exc}") from exc
