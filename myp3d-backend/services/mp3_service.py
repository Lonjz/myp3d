import os
from pathlib import Path
from typing import Optional

import eyed3
from yt_dlp import YoutubeDL

from models.schemas import MP3Info
from services.config import OUTPUT_DIR, get_ffmpeg_path


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
        "js_runtimes": {
            "node": {},
        },
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
