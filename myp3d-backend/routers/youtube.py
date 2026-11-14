from fastapi import APIRouter, HTTPException, Query

from models.health import SilenceBoundsRequest, TrimRange
from models.library import TagSuggestion
from models.queue import YouTubePlaylist, YouTubeSearchResponse
from services import health_service, ytmusic_service
from services.errors import AppError

router = APIRouter(tags=["YouTube"])


@router.get("/youtube/search", response_model=YouTubeSearchResponse)
def youtube_search(
    query: str = Query(..., min_length=1, description="YouTube search query"),
    limit: int = Query(12, ge=1, le=30, description="Maximum number of results"),
):
    return YouTubeSearchResponse(query=query, results=ytmusic_service.search(query, limit))


@router.get("/youtube/playlist", response_model=YouTubePlaylist)
def youtube_playlist(url: str = Query(..., min_length=1, description="YouTube playlist link")):
    return ytmusic_service.playlist(url)


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
        return ytmusic_service.song_suggestions(q)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"YouTube Music search failed: {exc}") from exc
