from typing import Optional

from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile

from models.schemas import PlaylistCreate, PlaylistDetail, PlaylistInfo, PlaylistTracksRequest, PlaylistUpdate
from services import playlist_service
from services.cover_service import CoverSize, get_image_variant
from services.mp3_service import make_square_cover
from services.playlist_service import PlaylistError

router = APIRouter(prefix="/playlists", tags=["Playlists"])

IMMUTABLE_CACHE_HEADER = {"Cache-Control": "public, max-age=31536000, immutable"}


def _raise(exc: PlaylistError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.get("", response_model=list[PlaylistInfo])
def list_playlists():
    return playlist_service.list_playlists()


@router.post("", response_model=PlaylistDetail)
def create_playlist(payload: PlaylistCreate):
    try:
        return playlist_service.create(payload.name, payload.filenames, payload.description)
    except PlaylistError as exc:
        _raise(exc)


@router.get("/{playlist_id}", response_model=PlaylistDetail)
def get_playlist(playlist_id: str):
    try:
        return playlist_service.get_playlist(playlist_id)
    except PlaylistError as exc:
        _raise(exc)


@router.put("/{playlist_id}", response_model=PlaylistDetail)
def update_playlist(playlist_id: str, payload: PlaylistUpdate):
    try:
        return playlist_service.update(playlist_id, payload.name, payload.filenames, payload.description)
    except PlaylistError as exc:
        _raise(exc)


@router.post("/{playlist_id}/tracks", response_model=PlaylistInfo)
def add_playlist_tracks(playlist_id: str, payload: PlaylistTracksRequest):
    try:
        return playlist_service.add_tracks(playlist_id, payload.filenames)
    except PlaylistError as exc:
        _raise(exc)


@router.post("/{playlist_id}/cover", response_model=PlaylistInfo)
def update_playlist_cover(playlist_id: str, cover: UploadFile = File(...)):
    if not (cover.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    try:
        image_data, _ = make_square_cover(cover.file.read())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        return playlist_service.set_cover(playlist_id, image_data)
    except PlaylistError as exc:
        _raise(exc)


@router.get("/{playlist_id}/cover")
def get_playlist_cover(
    playlist_id: str,
    size: Optional[CoverSize] = Query(None),
    v: Optional[str] = Query(None, max_length=64),
):
    try:
        cover = playlist_service.get_cover(playlist_id)
    except PlaylistError as exc:
        _raise(exc)
    if cover is None:
        raise HTTPException(status_code=404, detail="No cover image found")
    image_data, updated_at = cover
    if size:
        content, media_type = get_image_variant(f"playlist:{playlist_id}:{updated_at}", image_data, size)
    else:
        content, media_type = image_data, "image/jpeg"
    headers = IMMUTABLE_CACHE_HEADER if v else {"Cache-Control": "no-cache"}
    return Response(content=content, media_type=media_type, headers=headers)


@router.delete("/{playlist_id}")
def delete_playlist(playlist_id: str):
    try:
        playlist_service.delete(playlist_id)
    except PlaylistError as exc:
        _raise(exc)
    return {"success": True}
