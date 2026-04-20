import os
import base64
import binascii
import hashlib
import importlib
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from io import BytesIO
from typing import Literal, Optional

import eyed3
from eyed3.id3 import frames as id3_frames
from yt_dlp import YoutubeDL

from models.schemas import AlbumInfo, MP3Info
from services.config import OUTPUT_DIR, get_ffmpeg_path


COVER_SIZE = (500, 500)
NO_ALBUM_LABEL = "(No Album)"


@dataclass
class AlbumGroup:
    album_key: str
    album_name: str
    normalized_album: str
    tracks: list[MP3Info]
    filepaths: list[Path]
    artists: set[str]
    total_size: int = 0
    has_cover: bool = False
    cover_filename: Optional[str] = None
    date_added: Optional[datetime] = None

    def to_info(self) -> AlbumInfo:
        return AlbumInfo(
            album_key=self.album_key,
            album_name=self.album_name,
            track_count=len(self.tracks),
            total_size=self.total_size,
            artists=sorted(self.artists, key=lambda artist: artist.lower()),
            has_cover=self.has_cover,
            cover_filename=self.cover_filename,
            date_added=self.date_added,
        )


def _normalize_album_value(album_name: Optional[str]) -> str:
    return (album_name or "").strip()


def _album_key(normalized_album: str) -> str:
    return hashlib.sha1(normalized_album.encode("utf-8")).hexdigest()


def make_album_key(album_name: Optional[str]) -> str:
    normalized_album = _normalize_album_value(album_name).casefold()
    return _album_key(normalized_album)


def list_mp3_filepaths() -> list[Path]:
    return sorted(
        [path for path in OUTPUT_DIR.iterdir() if path.is_file() and path.suffix.lower() == ".mp3"],
        key=lambda path: path.name.lower(),
    )


def list_mp3_infos() -> list[MP3Info]:
    return [get_mp3_info(filepath) for filepath in list_mp3_filepaths()]


def build_album_groups() -> dict[str, AlbumGroup]:
    groups: dict[str, AlbumGroup] = {}

    for filepath in list_mp3_filepaths():
        track = get_mp3_info(filepath)
        album_value = _normalize_album_value(track.album)
        normalized_album = album_value.casefold()
        album_key = _album_key(normalized_album)

        group = groups.get(album_key)
        if group is None:
            group = AlbumGroup(
                album_key=album_key,
                album_name=album_value or NO_ALBUM_LABEL,
                normalized_album=normalized_album,
                tracks=[],
                filepaths=[],
                artists=set(),
            )
            groups[album_key] = group

        group.tracks.append(track)
        group.filepaths.append(filepath)
        group.total_size += track.file_size

        artist_value = (track.artist or "").strip()
        if artist_value:
            group.artists.add(artist_value)

        if track.has_cover and not group.has_cover:
            group.has_cover = True
            group.cover_filename = track.filename

        if track.date_added and (group.date_added is None or track.date_added > group.date_added):
            group.date_added = track.date_added

        if album_value and group.album_name == NO_ALBUM_LABEL:
            group.album_name = album_value

    return groups


def list_albums() -> list[AlbumInfo]:
    groups = build_album_groups()
    albums = [group.to_info() for group in groups.values()]
    return sorted(albums, key=lambda album: (album.album_name or "").lower())


def query_mp3_infos(
    page: int,
    limit: int,
    search: str,
    filter_by: Literal["all", "title", "artist", "filename", "album"],
    sort_by: Literal["date_added", "filename", "size", "artist", "title", "album"],
    sort_direction: Literal["asc", "desc"],
) -> tuple[list[MP3Info], int]:
    mp3s = list_mp3_infos()
    search_query = search.strip().casefold()

    if search_query:
        def matches_query(track: MP3Info) -> bool:
            title = (track.title or "").casefold()
            artist = (track.artist or "").casefold()
            album = (track.album or "").casefold()
            filename = track.filename.casefold()

            if filter_by == "title":
                return search_query in title
            if filter_by == "artist":
                return search_query in artist
            if filter_by == "album":
                return search_query in album
            if filter_by == "filename":
                return search_query in filename
            return (
                search_query in title
                or search_query in artist
                or search_query in album
                or search_query in filename
            )

        mp3s = [track for track in mp3s if matches_query(track)]

    if sort_by == "date_added":
        mp3s.sort(
            key=lambda track: (
                track.date_added or datetime.min.replace(tzinfo=timezone.utc),
                track.filename.casefold(),
            )
        )
    elif sort_by == "size":
        mp3s.sort(key=lambda track: (track.file_size, track.filename.casefold()))
    elif sort_by == "artist":
        mp3s.sort(key=lambda track: ((track.artist or "").casefold(), track.filename.casefold()))
    elif sort_by == "title":
        mp3s.sort(key=lambda track: ((track.title or "").casefold(), track.filename.casefold()))
    elif sort_by == "album":
        mp3s.sort(key=lambda track: ((track.album or "").casefold(), track.filename.casefold()))
    else:
        mp3s.sort(key=lambda track: track.filename.casefold())

    if sort_direction == "desc":
        mp3s.reverse()

    total = len(mp3s)
    start = (page - 1) * limit
    end = start + limit
    return mp3s[start:end], total


def query_albums(
    page: int,
    limit: int,
    search: str,
    sort_by: Literal["album_name", "track_count", "total_size", "date_added"],
    sort_direction: Literal["asc", "desc"],
) -> tuple[list[AlbumInfo], int]:
    albums = list_albums()
    search_query = search.strip().casefold()

    if search_query:
        albums = [
            album
            for album in albums
            if (
                search_query in (album.album_name or "").casefold()
                or search_query in " ".join(album.artists).casefold()
            )
        ]

    if sort_by == "track_count":
        albums.sort(key=lambda album: (album.track_count, (album.album_name or "").casefold()))
    elif sort_by == "total_size":
        albums.sort(key=lambda album: (album.total_size, (album.album_name or "").casefold()))
    elif sort_by == "date_added":
        albums.sort(
            key=lambda album: (
                album.date_added or datetime.min.replace(tzinfo=timezone.utc),
                (album.album_name or "").casefold(),
            )
        )
    else:
        albums.sort(key=lambda album: (album.album_name or "").casefold())

    if sort_direction == "desc":
        albums.reverse()

    total = len(albums)
    start = (page - 1) * limit
    end = start + limit
    return albums[start:end], total


def get_album_group(album_key: str) -> Optional[AlbumGroup]:
    groups = build_album_groups()
    return groups.get(album_key)


def set_album_name(filepaths: list[Path], album_name: str) -> None:
    normalized_name = album_name.strip()
    tag_album_value = normalized_name or None

    for filepath in filepaths:
        audio = eyed3.load(str(filepath))
        if audio is None:
            continue
        if audio.tag is None:
            audio.initTag()
        audio.tag.album = tag_album_value
        audio.tag.save(version=(2, 3, 0))


def set_album_cover(filepaths: list[Path], image_data: bytes, mime_type: str) -> None:
    for filepath in filepaths:
        audio = eyed3.load(str(filepath))
        if audio is None:
            continue
        if audio.tag is None:
            audio.initTag()
        set_cover_images(audio.tag, image_data, mime_type)
        audio.tag.save(version=(2, 3, 0))


def get_album_cover(filepaths: list[Path]) -> Optional[tuple[bytes, str]]:
    for filepath in filepaths:
        audio = eyed3.load(str(filepath))
        if not audio or not audio.tag or not audio.tag.images:
            continue
        image = audio.tag.images[0]
        return image.image_data, image.mime_type or "image/jpeg"
    return None


def _decode_base64_image(image_base64: str) -> bytes:
    """Decode either raw base64 or a data URL into image bytes."""
    if not image_base64:
        raise ValueError("Cover image data is empty")

    payload = image_base64
    if image_base64.startswith("data:"):
        parts = image_base64.split(",", 1)
        if len(parts) != 2:
            raise ValueError("Invalid cover image data URL")
        payload = parts[1]

    try:
        return base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Invalid base64 cover image data") from exc


def make_square_cover(image_data: bytes) -> tuple[bytes, str]:
    """Center-crop and resize an image to a 500x500 JPEG cover."""
    try:
        image_module = importlib.import_module("PIL.Image")
        image_ops_module = importlib.import_module("PIL.ImageOps")
    except ModuleNotFoundError as exc:
        raise ValueError("Pillow is required for cover image processing. Install dependencies and try again.") from exc

    unidentified_image_error = getattr(image_module, "UnidentifiedImageError", Exception)

    try:
        with image_module.open(BytesIO(image_data)) as image:
            image = image.convert("RGB")
            resampling_enum = getattr(image_module, "Resampling", None)
            if resampling_enum is not None:
                resampling = resampling_enum.LANCZOS
            else:
                # Older Pillow versions expose filters at module level.
                resampling = getattr(image_module, "LANCZOS", getattr(image_module, "BICUBIC", 3))
            square = image_ops_module.fit(image, COVER_SIZE, method=resampling, centering=(0.5, 0.5))
            output = BytesIO()
            square.save(output, format="JPEG", quality=92)
            return output.getvalue(), "image/jpeg"
    except unidentified_image_error as exc:
        raise ValueError("Uploaded cover is not a valid image") from exc


def set_cover_images(tag: eyed3.id3.tag.Tag, image_data: bytes, mime_type: str) -> None:
    """Write cover art using a single APIC frame shaped like common iTunes files."""
    # Clear all existing APIC frames so stale descriptors/types do not confuse players.
    existing_descriptions = [img.description for img in list(tag.images)]
    for description in existing_descriptions:
        while tag.images.remove(description) is not None:
            pass

    # Match the observed iTunes style: picture_type=OTHER (0), empty description.
    tag.images.set(id3_frames.ImageFrame.OTHER, image_data, mime_type, description="")


def get_mp3_info(filepath: Path) -> MP3Info:
    """Extract MP3 metadata."""
    audio = eyed3.load(str(filepath))
    file_stats = filepath.stat()
    info = MP3Info(
        filename=filepath.name,
        file_size=file_stats.st_size,
        date_added=datetime.fromtimestamp(file_stats.st_ctime, tz=timezone.utc),
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
        if metadata.get("cover_image_base64"):
            cover_image_data = _decode_base64_image(metadata["cover_image_base64"])
            processed_cover, mime_type = make_square_cover(cover_image_data)
            set_cover_images(audio.tag, processed_cover, mime_type)
        audio.tag.save(version=(2, 3, 0))

    return os.path.basename(mp3_file)
