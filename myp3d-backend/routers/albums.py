from typing import Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from models.library import AlbumDetail, AlbumUpdate, AlbumUpdateResponse, PaginatedAlbumResponse, PaginationMeta
from routers.common import cache_headers, cover_response, read_cover
from services.cover_service import CoverSize
from services.mp3_service import (
    NO_ALBUM_LABEL,
    AlbumSortBy,
    SortDirection,
    get_album_group,
    make_album_key,
    query_albums,
    set_album_cover,
    set_track_tags,
)

router = APIRouter(prefix="/albums", tags=["Albums"])


def _get_album_group_or_404(album_key: str):
    album_group = get_album_group(album_key)
    if album_group is None:
        raise HTTPException(status_code=404, detail="Album not found")
    return album_group


@router.get("/paged", response_model=PaginatedAlbumResponse)
def list_album_groups_paged(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=200),
    search: str = Query(""),
    sort_by: AlbumSortBy = Query("album_name"),
    sort_direction: SortDirection = Query("asc"),
):
    items, total = query_albums(
        page=page,
        limit=limit,
        search=search,
        sort_by=sort_by,
        sort_direction=sort_direction,
    )
    return PaginatedAlbumResponse(items=items, meta=PaginationMeta.of(total, page, limit, len(items)))


@router.get("/{album_key}", response_model=AlbumDetail)
def get_album(album_key: str):
    album_group = _get_album_group_or_404(album_key)
    tracks = sorted(
        album_group.tracks,
        key=lambda track: ((track.title or "").lower(), track.filename.lower()),
    )
    return AlbumDetail(album=album_group.to_info(), tracks=tracks)


@router.put("/{album_key}", response_model=AlbumUpdateResponse)
def update_album(album_key: str, payload: AlbumUpdate):
    album_group = _get_album_group_or_404(album_key)
    set_track_tags(album_group.filepaths, artist=payload.artist, album=payload.album_name)
    return AlbumUpdateResponse(
        success=True,
        album_key=make_album_key(payload.album_name),
        album_name=payload.album_name.strip() or NO_ALBUM_LABEL,
        updated_tracks=len(album_group.filepaths),
        message="Album metadata updated successfully",
    )


@router.post("/{album_key}/cover")
def update_album_cover(album_key: str, cover: UploadFile = File(...)):
    album_group = _get_album_group_or_404(album_key)
    processed_cover, mime_type = read_cover(cover)
    set_album_cover(album_group.filepaths, processed_cover, mime_type)
    return {
        "success": True,
        "updated_tracks": len(album_group.filepaths),
        "message": "Album cover updated successfully (500x500 center crop)",
    }


@router.get("/{album_key}/cover")
def get_album_cover_image(
    album_key: str,
    size: Optional[CoverSize] = Query(None),
    v: Optional[str] = Query(None, max_length=64),
):
    return cover_response(_get_album_group_or_404(album_key).filepaths, size, cache_headers(v))
