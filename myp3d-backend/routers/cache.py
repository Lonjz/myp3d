from fastapi import APIRouter

from services.mp3_service import invalidate_library_cache

router = APIRouter(prefix="/cache", tags=["Cache"])


@router.post("/clear")
async def clear_cache():
    invalidate_library_cache()
    return {"success": True}
