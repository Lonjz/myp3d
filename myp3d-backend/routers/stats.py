from fastapi import APIRouter

from models.schemas import LibraryStats
from services.stats_service import compute_library_stats

router = APIRouter(prefix="/stats", tags=["Stats"])


@router.get("", response_model=LibraryStats)
async def get_library_stats():
    return compute_library_stats()
