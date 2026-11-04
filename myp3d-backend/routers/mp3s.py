from pathlib import Path
from typing import Literal, Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, Response, UploadFile
from fastapi.responses import FileResponse

from models.library import (
    BulkFailure,
    BulkMetadataUpdate,
    BulkResult,
    BulkTracksRequest,
    LibraryNames,
    MP3Info,
    MetadataUpdate,
    PaginatedMP3Response,
    PaginationMeta,
)
from routers.common import CACHE_CONTROL_HEADER, cache_headers, read_cover, require_mp3, track_path
from services import favorite_service, playlist_service, track_records
from services.cover_service import CoverSize, get_album_cover, get_cover_variant, set_cover_images
from services.mp3_service import (
    IN_USE,
    MP3DurationRange,
    MP3Issue,
    MP3SortBy,
    edit_tags,
    filter_sort_mp3_infos,
    get_mp3_info,
    invalidate_library_cache,
    query_mp3_infos,
    set_album_cover,
    set_track_tags,
    tag_names,
    with_real_dates,
)

router = APIRouter(prefix="/mp3s", tags=["MP3s"])


@router.get("/paged", response_model=PaginatedMP3Response)
def list_mp3s_paged(
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=200),
    search: str = Query(""),
    filter_by: Literal["all", "title", "artist", "filename", "album"] = Query("all"),
    sort_by: MP3SortBy = Query("date_added"),
    sort_direction: Literal["asc", "desc"] = Query("desc"),
    duration: MP3DurationRange = Query("any"),
    favorites: bool = Query(False),
    issue: MP3Issue = Query("any"),
):
    items, total = query_mp3_infos(
        page=page,
        limit=limit,
        search=search,
        filter_by=filter_by,
        sort_by=sort_by,
        sort_direction=sort_direction,
        duration_range=duration,
        only=favorite_service.list_filenames() if favorites else None,
        issue=issue,
        listed=playlist_service.listed_filenames() if issue == "playlist" else None,
    )
    return PaginatedMP3Response(items=items, meta=PaginationMeta.of(total, page, limit, len(items)))


@router.get("/all", response_model=list[MP3Info])
def list_all_mp3s(
    search: str = Query(""),
    filter_by: Literal["all", "title", "artist", "filename", "album"] = Query("all"),
    sort_by: MP3SortBy = Query("date_added"),
    sort_direction: Literal["asc", "desc"] = Query("desc"),
    duration: MP3DurationRange = Query("any"),
    favorites: bool = Query(False),
    issue: MP3Issue = Query("any"),
):
    only = favorite_service.list_filenames() if favorites else None
    listed = playlist_service.listed_filenames() if issue == "playlist" else None
    return filter_sort_mp3_infos(search, filter_by, sort_by, sort_direction, duration, only, issue, listed)


@router.get("/names", response_model=LibraryNames)
def list_tag_names():
    return tag_names()


def _resolve_bulk_paths(filenames: list[str]) -> tuple[list[Path], list[BulkFailure]]:
    paths: list[Path] = []
    failed: list[BulkFailure] = []
    for filename in dict.fromkeys(filenames):
        try:
            paths.append(require_mp3(filename))
        except HTTPException as exc:
            failed.append(BulkFailure(filename=filename, detail=exc.detail))
    return paths, failed


@router.post("/bulk/metadata", response_model=BulkResult)
def bulk_update_metadata(payload: BulkMetadataUpdate):
    paths, failed = _resolve_bulk_paths(payload.filenames)
    set_track_tags(paths, artist=payload.artist, album=payload.album)
    return BulkResult(success=not failed, updated=[path.name for path in paths], failed=failed)


@router.post("/bulk/cover", response_model=BulkResult)
def bulk_update_cover(cover: UploadFile = File(...), filenames: list[str] = Form(...)):
    processed_cover, mime_type = read_cover(cover)
    paths, failed = _resolve_bulk_paths(filenames)
    set_album_cover(paths, processed_cover, mime_type)
    return BulkResult(success=not failed, updated=[path.name for path in paths], failed=failed)


@router.post("/bulk/delete", response_model=BulkResult)
def bulk_delete(payload: BulkTracksRequest):
    paths, failed = _resolve_bulk_paths(payload.filenames)
    deleted: list[str] = []
    for filepath in paths:
        try:
            filepath.unlink()
        except OSError as exc:
            detail = IN_USE if isinstance(exc, PermissionError) else exc.strerror or "Delete failed"
            failed.append(BulkFailure(filename=filepath.name, detail=detail))
            continue
        deleted.append(filepath.name)

    track_records.remove(deleted)
    invalidate_library_cache()
    return BulkResult(success=not failed, updated=deleted, failed=failed)


@router.get("/{filename}")
def get_mp3(filename: str):
    return FileResponse(require_mp3(filename), media_type="audio/mpeg", filename=filename, headers=CACHE_CONTROL_HEADER)


@router.get("/{filename}/info", response_model=MP3Info)
def get_mp3_metadata(filename: str):
    return with_real_dates([get_mp3_info(require_mp3(filename))])[0]


@router.put("/{filename}/metadata")
def update_metadata(filename: str, metadata: MetadataUpdate):
    filepath = require_mp3(filename)

    new_filename = filename
    if metadata.new_filename and metadata.new_filename != filename:
        new_filename = metadata.new_filename.lower()
        if not new_filename.endswith(".mp3"):
            new_filename += ".mp3"
    new_path = track_path(new_filename)
    if new_filename != filename and new_path.exists() and not new_path.samefile(filepath):
        raise HTTPException(status_code=400, detail="A file with that name already exists")

    try:
        with edit_tags(filepath) as tag:
            if metadata.title is not None:
                tag.title = metadata.title
            if metadata.artist is not None:
                tag.artist = metadata.artist
            if metadata.album is not None:
                tag.album = metadata.album
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if new_filename != filename:
        try:
            filepath.rename(new_path)
        except PermissionError as exc:
            invalidate_library_cache()
            raise HTTPException(status_code=409, detail=IN_USE) from exc
        track_records.rename(filename, new_filename)

    invalidate_library_cache()
    return {"success": True, "filename": new_filename, "message": "Metadata updated successfully"}


@router.post("/{filename}/cover")
def update_cover(filename: str, cover: UploadFile = File(...)):
    filepath = require_mp3(filename)
    processed_cover, mime_type = read_cover(cover)
    try:
        with edit_tags(filepath) as tag:
            set_cover_images(tag, processed_cover, mime_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    invalidate_library_cache()
    return {"success": True, "message": "Cover image updated successfully (500x500 center crop)"}


@router.get("/{filename}/cover")
def get_cover(
    filename: str,
    size: Optional[CoverSize] = Query(None),
    v: Optional[str] = Query(None, max_length=64),
):
    filepath = require_mp3(filename)
    cover = get_cover_variant([filepath], size) if size else get_album_cover([filepath])
    if cover is None:
        raise HTTPException(status_code=404, detail="No cover image found")
    return Response(content=cover[0], media_type=cover[1], headers=cache_headers(v))


@router.delete("/{filename}")
def delete_mp3(filename: str):
    filepath = require_mp3(filename)
    try:
        filepath.unlink()
    except PermissionError as exc:
        raise HTTPException(status_code=409, detail=IN_USE) from exc
    track_records.remove([filepath.name])
    invalidate_library_cache()
    return {"success": True, "message": f"Deleted: {filename}"}
