from typing import Optional

from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile

from models.schemas import PlaylistCreate, PlaylistDetail, PlaylistInfo, PlaylistTracksRequest, PlaylistUpdate
from services import favorite_playlist, playlist_service
from routers.common import IMMUTABLE_CACHE_HEADER, read_cover
from services.cover_service import CoverSize, get_image_variant

router = APIRouter(prefix="/playlists", tags=["Playlists"])

@router.get("", response_model=list[PlaylistInfo])
def list_playlists():
    return playlist_service.list_playlists()


@router.post("", response_model=PlaylistDetail)
def create_playlist(payload: PlaylistCreate):
    return playlist_service.create(payload.name, payload.filenames, payload.description)


@router.get("/{playlist_id}", response_model=PlaylistDetail)
def get_playlist(playlist_id: str):
    return playlist_service.get_playlist(playlist_id)


@router.put("/{playlist_id}", response_model=PlaylistDetail)
def update_playlist(playlist_id: str, payload: PlaylistUpdate):
    return favorite_playlist.update_playlist(playlist_id, payload.name, payload.filenames, payload.description)


@router.post("/{playlist_id}/tracks", response_model=PlaylistInfo)
def add_playlist_tracks(playlist_id: str, payload: PlaylistTracksRequest):
    return favorite_playlist.add_tracks(playlist_id, payload.filenames)


@router.post("/{playlist_id}/cover", response_model=PlaylistInfo)
def update_playlist_cover(playlist_id: str, cover: UploadFile = File(...)):
    image_data, _ = read_cover(cover)
    return playlist_service.set_cover(playlist_id, image_data)


@router.get("/{playlist_id}/cover")
def get_playlist_cover(
    playlist_id: str,
    size: Optional[CoverSize] = Query(None),
    v: Optional[str] = Query(None, max_length=64),
):
    cover = playlist_service.get_cover(playlist_id)
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
    playlist_service.delete(playlist_id)
    return {"success": True}
