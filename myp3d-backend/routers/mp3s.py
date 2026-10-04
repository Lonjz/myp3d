import eyed3
from pathlib import Path
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query, Response
from fastapi.responses import FileResponse

from models.schemas import (
    BulkFailure,
    BulkMetadataUpdate,
    BulkResult,
    BulkTracksRequest,
    MP3Info,
    MetadataUpdate,
    PaginatedMP3Response,
    PaginationMeta,
)
from services.config import OUTPUT_DIR
from services.cover_service import CoverSize, get_cover_variant
from services.mp3_service import (
    filter_sort_mp3_infos,
    get_mp3_info,
    invalidate_library_cache,
    make_square_cover,
    query_mp3_infos,
    set_album_cover,
    set_cover_images,
    set_track_tags,
)

router = APIRouter(prefix="/mp3s", tags=["MP3s"])


CACHE_CONTROL_HEADER = {"Cache-Control": "public, max-age=300"}
IMMUTABLE_CACHE_HEADER = {"Cache-Control": "public, max-age=31536000, immutable"}


def _sanitize_filename(filename: str) -> str:
    safe_name = Path(filename).name
    if not safe_name or safe_name != filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    return safe_name


def _resolve_mp3_path(filename: str) -> Path:
    safe_name = _sanitize_filename(filename)
    return OUTPUT_DIR / safe_name


@router.get("/paged", response_model=PaginatedMP3Response)
async def list_mp3s_paged(
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=200),
    search: str = Query(""),
    filter_by: Literal["all", "title", "artist", "filename", "album"] = Query("all"),
    sort_by: Literal["date_added", "filename", "size", "artist", "title", "album"] = Query("date_added"),
    sort_direction: Literal["asc", "desc"] = Query("desc"),
):
    """List MP3 files using server-side pagination, filtering, and sorting."""
    items, total = query_mp3_infos(
        page=page,
        limit=limit,
        search=search,
        filter_by=filter_by,
        sort_by=sort_by,
        sort_direction=sort_direction,
    )
    total_pages = max(1, (total + limit - 1) // limit)
    return PaginatedMP3Response(
        items=items,
        meta=PaginationMeta(
            total=total,
            page=page,
            limit=limit,
            total_pages=total_pages,
            returned=len(items),
        ),
    )


@router.get("/all", response_model=list[MP3Info])
async def list_all_mp3s(
    search: str = Query(""),
    filter_by: Literal["all", "title", "artist", "filename", "album"] = Query("all"),
    sort_by: Literal["date_added", "filename", "size", "artist", "title", "album"] = Query("date_added"),
    sort_direction: Literal["asc", "desc"] = Query("desc"),
):
    return filter_sort_mp3_infos(search, filter_by, sort_by, sort_direction)


def _resolve_bulk_paths(filenames: list[str]) -> tuple[list[Path], list[BulkFailure]]:
    paths: list[Path] = []
    failed: list[BulkFailure] = []
    for filename in dict.fromkeys(filenames):
        try:
            filepath = _resolve_mp3_path(filename)
        except HTTPException as exc:
            failed.append(BulkFailure(filename=filename, detail=exc.detail))
            continue
        if not filepath.exists() or filepath.suffix.lower() != ".mp3":
            failed.append(BulkFailure(filename=filename, detail="MP3 file not found"))
            continue
        paths.append(filepath)
    return paths, failed


@router.post("/bulk/metadata", response_model=BulkResult)
async def bulk_update_metadata(payload: BulkMetadataUpdate):
    paths, failed = _resolve_bulk_paths(payload.filenames)
    set_track_tags(paths, artist=payload.artist, album=payload.album)
    return BulkResult(success=not failed, updated=[path.name for path in paths], failed=failed)


@router.post("/bulk/cover", response_model=BulkResult)
async def bulk_update_cover(cover: UploadFile = File(...), filenames: list[str] = Form(...)):
    content_type = cover.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    image_data = await cover.read()
    try:
        processed_cover, mime_type = make_square_cover(image_data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    paths, failed = _resolve_bulk_paths(filenames)
    set_album_cover(paths, processed_cover, mime_type)
    return BulkResult(success=not failed, updated=[path.name for path in paths], failed=failed)


@router.post("/bulk/delete", response_model=BulkResult)
async def bulk_delete(payload: BulkTracksRequest):
    paths, failed = _resolve_bulk_paths(payload.filenames)
    deleted: list[str] = []
    for filepath in paths:
        try:
            filepath.unlink()
        except OSError as exc:
            failed.append(BulkFailure(filename=filepath.name, detail=exc.strerror or "Delete failed"))
            continue
        deleted.append(filepath.name)

    invalidate_library_cache()
    return BulkResult(success=not failed, updated=deleted, failed=failed)


@router.get("/{filename}")
async def get_mp3(filename: str):
    """Get a specific MP3 file for download."""
    filepath = _resolve_mp3_path(filename)
    if not filepath.exists() or filepath.suffix.lower() != ".mp3":
        raise HTTPException(status_code=404, detail="MP3 file not found")
    return FileResponse(
        filepath,
        media_type="audio/mpeg",
        filename=filename,
        headers=CACHE_CONTROL_HEADER,
    )


@router.get("/{filename}/info", response_model=MP3Info)
async def get_mp3_metadata(filename: str):
    """Get metadata for a specific MP3 file."""
    filepath = _resolve_mp3_path(filename)
    if not filepath.exists() or filepath.suffix.lower() != ".mp3":
        raise HTTPException(status_code=404, detail="MP3 file not found")
    return get_mp3_info(filepath)


@router.put("/{filename}/metadata")
async def update_metadata(filename: str, metadata: MetadataUpdate):
    """Update MP3 metadata (title, artist, album, filename)."""
    filepath = _resolve_mp3_path(filename)
    if not filepath.exists() or filepath.suffix.lower() != ".mp3":
        raise HTTPException(status_code=404, detail="MP3 file not found")

    audio = eyed3.load(str(filepath))
    if audio.tag is None:
        audio.initTag()

    if metadata.title is not None:
        audio.tag.title = metadata.title
    if metadata.artist is not None:
        audio.tag.artist = metadata.artist
    if metadata.album is not None:
        audio.tag.album = metadata.album
    
    audio.tag.save(version=(2, 3, 0))

    # Handle filename change
    new_filename = filename
    if metadata.new_filename and metadata.new_filename != filename:
        new_name = _sanitize_filename(metadata.new_filename)
        if not new_name.lower().endswith(".mp3"):
            new_name += ".mp3"
        new_path = OUTPUT_DIR / new_name
        if new_path.exists():
            raise HTTPException(status_code=400, detail="A file with that name already exists")
        filepath.rename(new_path)
        new_filename = new_name

    invalidate_library_cache()

    return {"success": True, "filename": new_filename, "message": "Metadata updated successfully"}


@router.post("/{filename}/cover")
async def update_cover(filename: str, cover: UploadFile = File(...)):
    """Update the cover image for an MP3 file."""
    filepath = _resolve_mp3_path(filename)
    if not filepath.exists() or filepath.suffix.lower() != ".mp3":
        raise HTTPException(status_code=404, detail="MP3 file not found")

    # Validate image
    if not cover.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    audio = eyed3.load(str(filepath))
    if audio.tag is None:
        audio.initTag()

    image_data = await cover.read()
    try:
        processed_cover, mime_type = make_square_cover(image_data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    set_cover_images(audio.tag, processed_cover, mime_type)
    audio.tag.save(version=(2, 3, 0))

    invalidate_library_cache()

    return {"success": True, "message": "Cover image updated successfully (500x500 center crop)"}


@router.get("/{filename}/cover")
def get_cover(
    filename: str,
    size: Optional[CoverSize] = Query(None),
    v: Optional[str] = Query(None, max_length=64),
):
    """Get the cover image from an MP3 file."""
    filepath = _resolve_mp3_path(filename)
    if not filepath.exists() or filepath.suffix.lower() != ".mp3":
        raise HTTPException(status_code=404, detail="MP3 file not found")

    headers = IMMUTABLE_CACHE_HEADER if v else CACHE_CONTROL_HEADER

    if size:
        variant = get_cover_variant([filepath], size)
        if variant is None:
            raise HTTPException(status_code=404, detail="No cover image found")
        return Response(content=variant[0], media_type=variant[1], headers=headers)

    audio = eyed3.load(str(filepath))
    if not audio or not audio.tag or not audio.tag.images:
        raise HTTPException(status_code=404, detail="No cover image found")

    image = audio.tag.images[0]
    return Response(
        content=image.image_data,
        media_type=image.mime_type or "image/jpeg",
        headers=headers,
    )


@router.delete("/{filename}")
async def delete_mp3(filename: str):
    """Delete an MP3 file."""
    filepath = _resolve_mp3_path(filename)
    if not filepath.exists() or filepath.suffix.lower() != ".mp3":
        raise HTTPException(status_code=404, detail="MP3 file not found")
    
    filepath.unlink()
    invalidate_library_cache()
    return {"success": True, "message": f"Deleted: {filename}"}


@router.post("/upload")
async def upload_mp3(file: UploadFile = File(...)):
    """Upload an MP3 file to the library."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    safe_name = _sanitize_filename(file.filename)
    if not safe_name.lower().endswith(".mp3"):
        raise HTTPException(status_code=400, detail="Only MP3 files are allowed")

    filepath = OUTPUT_DIR / safe_name
    if filepath.exists():
        raise HTTPException(status_code=400, detail="A file with that name already exists")
    
    with open(filepath, "wb") as f:
        content = await file.read()
        f.write(content)

    invalidate_library_cache()
    return {"success": True, "filename": safe_name, "message": "File uploaded successfully"}
