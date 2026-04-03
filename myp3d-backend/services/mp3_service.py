import os
import re
import subprocess
from pathlib import Path
from typing import Optional

import eyed3
from yt_dlp import YoutubeDL

from models.schemas import MP3Info
from services.config import DEFAULT_NORMALIZE_TARGET_PEAK_DB, OUTPUT_DIR, get_ffmpeg_path


MAX_VOLUME_PATTERN = re.compile(r"max_volume:\s*(-?\d+(?:\.\d+)?)\s+dB")


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


def _resolve_ffmpeg_command() -> str:
    """Resolve ffmpeg executable from config or system PATH."""
    ffmpeg_path = get_ffmpeg_path()
    if ffmpeg_path:
        ffmpeg_file = Path(ffmpeg_path)
        if not ffmpeg_file.exists():
            raise FileNotFoundError(f"ffmpeg not found at configured path: {ffmpeg_file}")
        return str(ffmpeg_file)

    return "ffmpeg"


def _detect_peak_db(filepath: Path, ffmpeg_cmd: str) -> float:
    """Detect peak level for a file using ffmpeg's volumedetect filter."""
    null_output = "NUL" if os.name == "nt" else "/dev/null"
    result = subprocess.run(
        [
            ffmpeg_cmd,
            "-hide_banner",
            "-i",
            str(filepath),
            "-af",
            "volumedetect",
            "-f",
            "null",
            null_output,
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    output = f"{result.stdout}\n{result.stderr}"
    match = MAX_VOLUME_PATTERN.search(output)
    if not match:
        raise RuntimeError("Unable to detect max_volume from ffmpeg output")

    return float(match.group(1))


def _apply_gain(filepath: Path, gain_db: float, ffmpeg_cmd: str) -> None:
    """Apply gain to a file while preserving metadata and embedded cover art."""
    temp_path = filepath.with_name(f"{filepath.stem}.normalized.tmp{filepath.suffix}")
    result = subprocess.run(
        [
            ffmpeg_cmd,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(filepath),
            "-map",
            "0:a:0",
            "-map",
            "0:v?",
            "-af",
            f"volume={gain_db:.2f}dB",
            "-c:a",
            "libmp3lame",
            "-q:a",
            "2",
            "-c:v",
            "copy",
            "-disposition:v",
            "attached_pic",
            "-map_metadata",
            "0",
            "-id3v2_version",
            "3",
            str(temp_path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    if result.returncode != 0:
        if temp_path.exists():
            temp_path.unlink()
        stderr = (result.stderr or "").strip()
        raise RuntimeError(stderr or "ffmpeg failed while normalizing audio")

    os.replace(temp_path, filepath)


def normalize_all_mp3s(target_peak_db: float = DEFAULT_NORMALIZE_TARGET_PEAK_DB) -> dict:
    """Normalize all MP3 files by reducing only tracks above target peak."""
    if target_peak_db >= 0:
        raise ValueError("target_peak_db must be below 0 dB")

    ffmpeg_cmd = _resolve_ffmpeg_command()
    mp3_files = sorted(p for p in OUTPUT_DIR.iterdir() if p.is_file() and p.suffix.lower() == ".mp3")

    results = []
    normalized_count = 0
    skipped_count = 0
    failed_count = 0

    for file in mp3_files:
        try:
            peak_db = _detect_peak_db(file, ffmpeg_cmd)
            gain_db = round(target_peak_db - peak_db, 2)

            if gain_db < 0:
                _apply_gain(file, gain_db, ffmpeg_cmd)
                normalized_count += 1
                results.append(
                    {
                        "filename": file.name,
                        "status": "normalized",
                        "original_peak_db": peak_db,
                        "applied_gain_db": gain_db,
                        "message": f"Applied {gain_db:.2f} dB gain",
                    }
                )
            else:
                skipped_count += 1
                results.append(
                    {
                        "filename": file.name,
                        "status": "skipped",
                        "original_peak_db": peak_db,
                        "applied_gain_db": 0.0,
                        "message": "No reduction needed",
                    }
                )

        except Exception as exc:
            failed_count += 1
            results.append(
                {
                    "filename": file.name,
                    "status": "error",
                    "message": str(exc),
                }
            )

    return {
        "success": failed_count == 0,
        "processed": len(mp3_files),
        "normalized": normalized_count,
        "skipped": skipped_count,
        "failed": failed_count,
        "target_peak_db": target_peak_db,
        "results": results,
    }
