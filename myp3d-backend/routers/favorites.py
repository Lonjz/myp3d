from fastapi import APIRouter

from services import favorite_playlist, favorite_service

router = APIRouter(prefix="/favorites", tags=["Favorites"])


def _set(filename: str, on: bool) -> dict:
    favorite_playlist.set_favorite(filename, on)
    return {"success": True}


@router.get("", response_model=list[str])
def list_favorites():
    return favorite_service.list_ordered()


@router.put("/{filename}")
def add_favorite(filename: str):
    return _set(filename, True)


@router.delete("/{filename}")
def remove_favorite(filename: str):
    return _set(filename, False)
