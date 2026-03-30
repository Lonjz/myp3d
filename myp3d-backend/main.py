import os
import sys
import shutil
from typing import Optional
from pathlib import Path

import eyed3
from yt_dlp import YoutubeDL
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Response
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="MP3 Download API", description="YouTube to MP3 converter and metadata editor")

# CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
USE_SYSTEM_FFMPEG = os.getenv("USE_SYSTEM_FFMPEG", "false").lower() == "true"
OUTPUT_DIR = Path(__file__).parent / "downloads"
OUTPUT_DIR.mkdir(exist_ok=True)

def get_ffmpeg_path() -> Optional[str]:
    """Get ffmpeg path based on OS configuration."""
    if USE_SYSTEM_FFMPEG:
        return None  # Use system ffmpeg from PATH
    return str(Path(__file__).parent / "ffmpeg.exe")


# Request/Response Models
class DownloadRequest(BaseModel):
    url: str
    custom_filename: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None


class MetadataUpdate(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    new_filename: Optional[str] = None


class MP3Info(BaseModel):
    filename: str
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    has_cover: bool = False
    file_size: int = 0


class DownloadResponse(BaseModel):
    success: bool
    filename: str
    message: str


# Helper Functions
def get_mp3_info(filepath: Path) -> MP3Info:
    """Extract MP3 metadata."""
    audio = eyed3.load(str(filepath))
    info = MP3Info(
        filename=filepath.name,
        file_size=filepath.stat().st_size
    )
    if audio and audio.tag:
        info.title = audio.tag.title
        info.artist = audio.tag.artist
        info.album = audio.tag.album
        info.has_cover = bool(audio.tag.images)
    return info


def download_as_mp3(url: str, metadata: Optional[dict] = None, custom_name: Optional[str] = None) -> str:
    """Download YouTube video as MP3."""
    ffmpeg_path = get_ffmpeg_path()
    
    # Output template
    if custom_name:
        outtmpl = str(OUTPUT_DIR / f"{custom_name}.%(ext)s")
    else:
        outtmpl = str(OUTPUT_DIR / "%(title)s.%(ext)s")

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": outtmpl,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "320",
            }
        ],
        "quiet": True,
        "noplaylist": True,
    }
    
    if ffmpeg_path:
        ydl_opts["ffmpeg_location"] = ffmpeg_path

    with YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        filename = ydl.prepare_filename(info)
        mp3_file = os.path.splitext(filename)[0] + ".mp3"
        if custom_name:
            mp3_file = str(OUTPUT_DIR / f"{custom_name}.mp3")

    # Apply metadata if provided
    if metadata and any(metadata.values()):
        audio = eyed3.load(mp3_file)
        if audio.tag is None:
            audio.initTag()
        if metadata.get("title"):
            audio.tag.title = metadata["title"]
        if metadata.get("artist"):
            audio.tag.artist = metadata["artist"]
        if metadata.get("album"):
            audio.tag.album = metadata["album"]
        audio.tag.save(version=(2, 3, 0))

    return os.path.basename(mp3_file)


# API Endpoints

@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "running", "message": "MP3 Download API is active"}


# ============ DOWNLOAD ENDPOINTS ============

@app.post("/download", response_model=DownloadResponse)
async def download_mp3(request: DownloadRequest):
    """Download a YouTube video as MP3 at 320kbps."""
    try:
        metadata = {
            "title": request.title,
            "artist": request.artist,
            "album": request.album
        }
        filename = download_as_mp3(request.url, metadata, request.custom_filename)
        return DownloadResponse(
            success=True,
            filename=filename,
            message=f"Successfully downloaded: {filename}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============ MP3 CRUD ENDPOINTS ============

@app.get("/mp3s", response_model=list[MP3Info])
async def list_mp3s():
    """List all downloaded MP3 files."""
    mp3_files = []
    for f in OUTPUT_DIR.iterdir():
        if f.suffix.lower() == ".mp3":
            mp3_files.append(get_mp3_info(f))
    return mp3_files


@app.get("/mp3s/{filename}")
async def get_mp3(filename: str):
    """Get a specific MP3 file for download."""
    filepath = OUTPUT_DIR / filename
    if not filepath.exists() or filepath.suffix.lower() != ".mp3":
        raise HTTPException(status_code=404, detail="MP3 file not found")
    return FileResponse(filepath, media_type="audio/mpeg", filename=filename)


@app.get("/mp3s/{filename}/info", response_model=MP3Info)
async def get_mp3_metadata(filename: str):
    """Get metadata for a specific MP3 file."""
    filepath = OUTPUT_DIR / filename
    if not filepath.exists() or filepath.suffix.lower() != ".mp3":
        raise HTTPException(status_code=404, detail="MP3 file not found")
    return get_mp3_info(filepath)


@app.put("/mp3s/{filename}/metadata")
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


@app.post("/mp3s/{filename}/cover")
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


@app.get("/mp3s/{filename}/cover")
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


@app.delete("/mp3s/{filename}")
async def delete_mp3(filename: str):
    """Delete an MP3 file."""
    filepath = OUTPUT_DIR / filename
    if not filepath.exists() or filepath.suffix.lower() != ".mp3":
        raise HTTPException(status_code=404, detail="MP3 file not found")
    
    filepath.unlink()
    return {"success": True, "message": f"Deleted: {filename}"}


@app.post("/mp3s/upload")
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


# Run with: uvicorn main:app --reload
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
