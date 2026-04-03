import eyed3
from fastapi import APIRouter, HTTPException, UploadFile, File, Response
from fastapi.responses import FileResponse

from models.schemas import MP3Info, MetadataUpdate, NormalizeAudioResponse
from services.config import DEFAULT_NORMALIZE_TARGET_PEAK_DB, OUTPUT_DIR
from services.mp3_service import get_mp3_info, normalize_all_mp3s

router = APIRouter(prefix="/mp3s", tags=["MP3s"])


@router.get("", response_model=list[MP3Info])
async def list_mp3s():
    """List all downloaded MP3 files."""
    mp3_files = []
    for f in OUTPUT_DIR.iterdir():
        if f.suffix.lower() == ".mp3":
            mp3_files.append(get_mp3_info(f))
    return mp3_files


@router.post("/normalize-all", response_model=NormalizeAudioResponse)
async def normalize_all_audio(target_peak_db: float = DEFAULT_NORMALIZE_TARGET_PEAK_DB):
    """Normalize all MP3 files by reducing tracks above target peak dB."""
    try:
        return normalize_all_mp3s(target_peak_db=target_peak_db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/{filename}")
async def get_mp3(filename: str):
    """Get a specific MP3 file for download."""
    filepath = OUTPUT_DIR / filename
    if not filepath.exists() or filepath.suffix.lower() != ".mp3":
        raise HTTPException(status_code=404, detail="MP3 file not found")
    return FileResponse(filepath, media_type="audio/mpeg", filename=filename)


@router.get("/{filename}/info", response_model=MP3Info)
async def get_mp3_metadata(filename: str):
    """Get metadata for a specific MP3 file."""
    filepath = OUTPUT_DIR / filename
    if not filepath.exists() or filepath.suffix.lower() != ".mp3":
        raise HTTPException(status_code=404, detail="MP3 file not found")
    return get_mp3_info(filepath)


@router.put("/{filename}/metadata")
async def update_metadata(filename: str, metadata: MetadataUpdate):
    """Update MP3 metadata (title, artist, album, filename)."""
    filepath = OUTPUT_DIR / filename
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
        new_name = metadata.new_filename
        if not new_name.lower().endswith(".mp3"):
            new_name += ".mp3"
        new_path = OUTPUT_DIR / new_name
        if new_path.exists():
            raise HTTPException(status_code=400, detail="A file with that name already exists")
        filepath.rename(new_path)
        new_filename = new_name

    return {"success": True, "filename": new_filename, "message": "Metadata updated successfully"}


@router.post("/{filename}/cover")
async def update_cover(filename: str, cover: UploadFile = File(...)):
    """Update the cover image for an MP3 file."""
    filepath = OUTPUT_DIR / filename
    if not filepath.exists() or filepath.suffix.lower() != ".mp3":
        raise HTTPException(status_code=404, detail="MP3 file not found")

    # Validate image
    if not cover.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    audio = eyed3.load(str(filepath))
    if audio.tag is None:
        audio.initTag()

    image_data = await cover.read()
    mime_type = cover.content_type or "image/jpeg"
    audio.tag.images.set(3, image_data, mime_type)  # 3 = front cover
    audio.tag.save(version=(2, 3, 0))

    return {"success": True, "message": "Cover image updated successfully"}


@router.get("/{filename}/cover")
async def get_cover(filename: str):
    """Get the cover image from an MP3 file."""
    filepath = OUTPUT_DIR / filename
    if not filepath.exists() or filepath.suffix.lower() != ".mp3":
        raise HTTPException(status_code=404, detail="MP3 file not found")

    audio = eyed3.load(str(filepath))
    if not audio or not audio.tag or not audio.tag.images:
        raise HTTPException(status_code=404, detail="No cover image found")

    image = audio.tag.images[0]
    return Response(
        content=image.image_data,
        media_type=image.mime_type or "image/jpeg"
    )


@router.delete("/{filename}")
async def delete_mp3(filename: str):
    """Delete an MP3 file."""
    filepath = OUTPUT_DIR / filename
    if not filepath.exists() or filepath.suffix.lower() != ".mp3":
        raise HTTPException(status_code=404, detail="MP3 file not found")
    
    filepath.unlink()
    return {"success": True, "message": f"Deleted: {filename}"}


@router.post("/upload")
async def upload_mp3(file: UploadFile = File(...)):
    """Upload an MP3 file to the library."""
    if not file.filename.lower().endswith(".mp3"):
        raise HTTPException(status_code=400, detail="Only MP3 files are allowed")
    
    filepath = OUTPUT_DIR / file.filename
    if filepath.exists():
        raise HTTPException(status_code=400, detail="A file with that name already exists")
    
    with open(filepath, "wb") as f:
        content = await file.read()
        f.write(content)
    
    return {"success": True, "filename": file.filename, "message": "File uploaded successfully"}


