from fastapi import APIRouter, HTTPException, Query

from models.schemas import YouTubeSearchResponse
from services.youtube_service import search_youtube

router = APIRouter(tags=["YouTube"])


@router.get("/youtube/search", response_model=YouTubeSearchResponse)
async def youtube_search(
    query: str = Query(..., min_length=1, description="YouTube search query"),
    limit: int = Query(12, ge=1, le=30, description="Maximum number of results"),
):
    """Search YouTube using yt-dlp without requiring an API key."""
    try:
        results = search_youtube(query, limit)
        return YouTubeSearchResponse(query=query, results=results)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"YouTube search failed: {exc}") from exc
