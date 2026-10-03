from fastapi import APIRouter

from services.cover_service import clear_cover_cache
from services.mp3_service import invalidate_library_cache

router = APIRouter(prefix="/cache", tags=["Cache"])


@router.post("/clear")
async def clear_cache():
    invalidate_library_cache()
    clear_cover_cache()
    return {"success": True}
