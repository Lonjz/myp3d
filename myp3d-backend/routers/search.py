from fastapi import APIRouter, Query

from models.schemas import SearchResults
from services.search_service import search_library

router = APIRouter(prefix="/search", tags=["Search"])


@router.get("", response_model=SearchResults)
async def search(
    q: str = Query("", max_length=200),
    limit: int = Query(5, ge=1, le=20),
):
    return search_library(q, limit)
