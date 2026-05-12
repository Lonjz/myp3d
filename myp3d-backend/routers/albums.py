from typing import Literal

from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile

from models.schemas import (
    AlbumDetail,
    AlbumUpdate,
    AlbumUpdateResponse,
    PaginatedAlbumResponse,
    PaginationMeta,
)
from services.mp3_service import (
    get_album_cover,
    get_album_group,
    make_album_key,
    make_square_cover,
    query_albums,
    set_album_cover,
    set_album_name,
)


router = APIRouter(prefix="/albums", tags=["Albums"])


CACHE_CONTROL_HEADER = {"Cache-Control": "public, max-age=300"}


def _get_album_group_or_404(album_key: str):
    album_group = get_album_group(album_key)
    if album_group is None:
        raise HTTPException(status_code=404, detail="Album not found")
    return album_group


@router.get("/paged", response_model=PaginatedAlbumResponse)
async def list_album_groups_paged(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=200),
    search: str = Query(""),
    sort_by: Literal["album_name", "track_count", "total_size", "date_added"] = Query("album_name"),
    sort_direction: Literal["asc", "desc"] = Query("asc"),
):
    """List albums using server-side pagination, filtering, and sorting."""
    items, total = query_albums(
        page=page,
        limit=limit,
        search=search,
        sort_by=sort_by,
        sort_direction=sort_direction,
    )
    total_pages = max(1, (total + limit - 1) // limit)
    return PaginatedAlbumResponse(
        items=items,
        meta=PaginationMeta(
            total=total,
            page=page,
            limit=limit,
            total_pages=total_pages,
            returned=len(items),
        ),
    )


@router.get("/{album_key}", response_model=AlbumDetail)
async def get_album(album_key: str):
    """Get album summary and all tracks in that album."""
    album_group = _get_album_group_or_404(album_key)
    tracks = sorted(
        album_group.tracks,
        key=lambda track: ((track.title or "").lower(), track.filename.lower()),
    )
    return AlbumDetail(album=album_group.to_info(), tracks=tracks)


@router.put("/{album_key}", response_model=AlbumUpdateResponse)
async def update_album(album_key: str, payload: AlbumUpdate):
    """Update album name for every track in the selected album."""
    album_group = _get_album_group_or_404(album_key)
    set_album_name(album_group.filepaths, payload.album_name)

    new_album_key = make_album_key(payload.album_name)
    normalized_name = payload.album_name.strip() or "(No Album)"
    return AlbumUpdateResponse(
        success=True,
        album_key=new_album_key,
        album_name=normalized_name,
        updated_tracks=len(album_group.filepaths),
        message="Album metadata updated successfully",
    )


@router.post("/{album_key}/cover")
async def update_album_cover(album_key: str, cover: UploadFile = File(...)):
    """Set the same cover image on every track in the album."""
    album_group = _get_album_group_or_404(album_key)

    content_type = cover.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    image_data = await cover.read()
    try:
        processed_cover, mime_type = make_square_cover(image_data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    set_album_cover(album_group.filepaths, processed_cover, mime_type)
    return {
        "success": True,
        "updated_tracks": len(album_group.filepaths),
        "message": "Album cover updated successfully (500x500 center crop)",
    }


@router.get("/{album_key}/cover")
async def get_album_cover_image(album_key: str):
    """Get the first embedded cover image found in this album."""
    album_group = _get_album_group_or_404(album_key)
    cover = get_album_cover(album_group.filepaths)
    if cover is None:
        raise HTTPException(status_code=404, detail="No cover image found")

    image_data, mime_type = cover
    return Response(content=image_data, media_type=mime_type, headers=CACHE_CONTROL_HEADER)
