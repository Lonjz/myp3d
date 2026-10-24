from fastapi import APIRouter, HTTPException

from services import favorite_service
from services.favorite_service import FavoriteError

router = APIRouter(prefix="/favorites", tags=["Favorites"])


def _set(filename: str, on: bool) -> dict:
    try:
        favorite_service.set_favorite(filename, on)
    except FavoriteError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return {"success": True}


@router.get("", response_model=list[str])
def list_favorites():
    return sorted(favorite_service.list_filenames())


@router.put("/{filename}")
def add_favorite(filename: str):
    return _set(filename, True)


@router.delete("/{filename}")
def remove_favorite(filename: str):
    return _set(filename, False)
