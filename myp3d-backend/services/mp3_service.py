import hashlib
import os
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Iterator, Literal, Optional

import eyed3

from models.library import AlbumInfo, LibraryNames, MP3Info
from services import date_service
from services.config import OUTPUT_DIR
from services.cover_service import set_cover_images
from services.db import connect as _connect


CACHE_TTL_SECONDS = 120.0
NO_ALBUM_LABEL = "(No Album)"
IN_USE = "The song is in use. Stop playing it and try again"

SCHEMA = """
CREATE TABLE IF NOT EXISTS track_tags (
    filename TEXT PRIMARY KEY,
    size INTEGER NOT NULL,
    mtime_ns INTEGER NOT NULL,
    info TEXT NOT NULL
)
"""


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


@dataclass
class _LibraryCache:
    mp3_infos: Optional[list[MP3Info]] = None
    album_groups: Optional[dict[str, "AlbumGroup"]] = None
    built_at: float = 0.0
    dirty: bool = True
    generation: int = 0


_cache_lock = threading.Lock()
_rebuild_lock = threading.Lock()
_library_cache = _LibraryCache()
_file_infos: dict[str, tuple[int, int, MP3Info]] = {}


def init() -> None:
    with _connect() as conn:
        conn.execute(SCHEMA)


def invalidate_library_cache() -> None:
    with _cache_lock:
        _library_cache.mp3_infos = None
        _library_cache.album_groups = None
        _library_cache.built_at = 0.0
        _library_cache.dirty = True
        _library_cache.generation += 1


def clear_tag_cache() -> None:
    with _rebuild_lock, _connect() as conn:
        _file_infos.clear()
        conn.execute("DELETE FROM track_tags")
    invalidate_library_cache()


def _should_rebuild_cache(now: float) -> bool:
    return _library_cache.dirty or (now - _library_cache.built_at) > CACHE_TTL_SECONDS


def _normalize_album_value(album_name: Optional[str]) -> str:
    return (album_name or "").strip()


def _album_key(normalized_album: str) -> str:
    return hashlib.sha1(normalized_album.encode("utf-8")).hexdigest()


def make_album_key(album_name: Optional[str]) -> str:
    normalized_album = _normalize_album_value(album_name).casefold()
    return _album_key(normalized_album)


def sweep_partial_files() -> None:
    for path in OUTPUT_DIR.glob(".*.part"):
        path.unlink(missing_ok=True)


def _mp3_entries() -> Iterator[os.DirEntry]:
    with os.scandir(OUTPUT_DIR) as entries:
        yield from (entry for entry in entries if os.path.splitext(entry.name)[1].lower() == ".mp3" and entry.is_file())


def library_names() -> set[str]:
    return {entry.name for entry in _mp3_entries()}


def list_mp3_filepaths() -> list[Path]:
    return sorted((Path(entry.path) for entry in _mp3_entries()), key=lambda path: path.name.lower())


def _cached_mp3_infos() -> Optional[list[MP3Info]]:
    with _cache_lock:
        if _library_cache.mp3_infos is not None and not _should_rebuild_cache(time.monotonic()):
            return list(_library_cache.mp3_infos)
    return None


def _restore_tags() -> None:
    with _connect() as conn:
        rows = conn.execute("SELECT filename, size, mtime_ns, info FROM track_tags").fetchall()
    for row in rows:
        info = MP3Info.model_validate_json(row["info"])
        if info.model_fields_set == MP3Info.model_fields.keys():
            _file_infos[row["filename"]] = (row["size"], row["mtime_ns"], info)


def _store_tags(changed: dict[str, tuple[int, int, MP3Info]], removed: set[str]) -> None:
    if not changed and not removed:
        return
    with _connect() as conn:
        conn.executemany(
            "INSERT OR REPLACE INTO track_tags (filename, size, mtime_ns, info) VALUES (?, ?, ?, ?)",
            [(filename, size, mtime_ns, info.model_dump_json()) for filename, (size, mtime_ns, info) in changed.items()],
        )
        conn.executemany("DELETE FROM track_tags WHERE filename = ?", [(filename,) for filename in removed])


def _read_library() -> list[MP3Info]:
    if not _file_infos:
        _restore_tags()
    seen: dict[str, tuple[int, int, MP3Info]] = {}
    changed: dict[str, tuple[int, int, MP3Info]] = {}
    for path in list_mp3_filepaths():
        try:
            stats = path.stat()
            entry = _file_infos.get(path.name)
            if entry is None or entry[:2] != (stats.st_size, stats.st_mtime_ns):
                entry = changed[path.name] = (stats.st_size, stats.st_mtime_ns, get_mp3_info(path))
        except OSError:
            continue
        seen[path.name] = entry
    _store_tags(changed, _file_infos.keys() - seen.keys())
    _file_infos.clear()
    _file_infos.update(seen)
    return [info.model_copy() for _, _, info in seen.values()]


def list_mp3_infos() -> list[MP3Info]:
    cached = _cached_mp3_infos()
    if cached is not None:
        return cached

    with _rebuild_lock:
        cached = _cached_mp3_infos()
        if cached is not None:
            return cached

        with _cache_lock:
            generation = _library_cache.generation

        mp3_infos = with_real_dates(_read_library())

        with _cache_lock:
            if _library_cache.generation == generation:
                _library_cache.mp3_infos = mp3_infos
                _library_cache.album_groups = None
                _library_cache.built_at = time.monotonic()
                _library_cache.dirty = False

    return list(mp3_infos)


def _distinct(values: Iterable[Optional[str]]) -> list[str]:
    seen: dict[str, str] = {}
    for value in values:
        text = (value or "").strip()
        if text:
            seen.setdefault(text.casefold(), text)
    return sorted(seen.values(), key=str.casefold)


def tag_names() -> LibraryNames:
    infos = list_mp3_infos()
    return LibraryNames(
        artists=_distinct(info.artist for info in infos),
        albums=_distinct(info.album for info in infos),
    )


def build_album_groups() -> dict[str, AlbumGroup]:
    now = time.monotonic()
    with _cache_lock:
        if _library_cache.album_groups is not None and not _should_rebuild_cache(now):
            return _library_cache.album_groups
        generation = _library_cache.generation

    groups: dict[str, AlbumGroup] = {}

    for track in list_mp3_infos():
        filepath = OUTPUT_DIR / track.filename
        if not filepath.exists():
            continue
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

    with _cache_lock:
        if _library_cache.generation == generation:
            _library_cache.album_groups = groups

    return groups


MP3FilterBy = Literal["all", "title", "artist", "filename", "album"]
MP3SortBy = Literal["date_added", "filename", "size", "artist", "title", "album", "duration"]
MP3DurationRange = Literal["any", "under-2", "2-3", "3-4", "4-5", "5-7", "over-7"]
MP3Issue = Literal["any", "title", "artist", "album", "cover", "duplicate", "playlist"]
SortDirection = Literal["asc", "desc"]

DURATION_RANGES: dict[str, tuple[float, float]] = {
    "under-2": (0, 120),
    "2-3": (120, 180),
    "3-4": (180, 240),
    "4-5": (240, 300),
    "5-7": (300, 420),
    "over-7": (420, float("inf")),
}


def is_blank(value: Optional[str]) -> bool:
    return not (value or "").strip()


def duplicate_filenames(tracks: list[MP3Info]) -> set[str]:
    groups: dict[tuple[str, str], list[str]] = {}
    for track in tracks:
        if is_blank(track.title) or is_blank(track.artist):
            continue
        key = (track.title.strip().casefold(), track.artist.strip().casefold())
        groups.setdefault(key, []).append(track.filename)
    return {filename for filenames in groups.values() if len(filenames) > 1 for filename in filenames}


def _has_issue(track: MP3Info, issue: MP3Issue, duplicates: set[str], listed: set[str]) -> bool:
    if issue == "title":
        return is_blank(track.title)
    if issue == "artist":
        return is_blank(track.artist)
    if issue == "album":
        return is_blank(track.album)
    if issue == "cover":
        return not track.has_cover
    if issue == "duplicate":
        return track.filename in duplicates
    if issue == "playlist":
        return track.filename not in listed
    return True


def filter_sort_mp3_infos(
    search: str,
    filter_by: MP3FilterBy,
    sort_by: MP3SortBy,
    sort_direction: SortDirection,
    duration_range: MP3DurationRange = "any",
    only: Optional[set[str]] = None,
    issue: MP3Issue = "any",
    listed: Optional[set[str]] = None,
) -> list[MP3Info]:
    mp3s = list_mp3_infos()
    duplicates = duplicate_filenames(mp3s) if issue == "duplicate" else set()
    if only is not None:
        mp3s = [track for track in mp3s if track.filename in only]
    if issue != "any":
        mp3s = [track for track in mp3s if _has_issue(track, issue, duplicates, listed or set())]
    search_query = search.strip().casefold()

    if duration_range in DURATION_RANGES:
        lower, upper = DURATION_RANGES[duration_range]
        mp3s = [track for track in mp3s if track.duration is not None and lower <= track.duration < upper]

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
    elif sort_by == "duration":
        mp3s.sort(key=lambda track: (track.duration or 0, track.filename.casefold()))
    else:
        mp3s.sort(key=lambda track: track.filename.casefold())

    if sort_direction == "desc":
        mp3s.reverse()

    return mp3s


def query_mp3_infos(
    page: int,
    limit: int,
    search: str,
    filter_by: MP3FilterBy,
    sort_by: MP3SortBy,
    sort_direction: SortDirection,
    duration_range: MP3DurationRange = "any",
    only: Optional[set[str]] = None,
    issue: MP3Issue = "any",
    listed: Optional[set[str]] = None,
) -> tuple[list[MP3Info], int]:
    mp3s = filter_sort_mp3_infos(search, filter_by, sort_by, sort_direction, duration_range, only, issue, listed)
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
    albums = [group.to_info() for group in build_album_groups().values()]
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


@contextmanager
def edit_tags(path: Path) -> Iterator[eyed3.id3.tag.Tag]:
    audio = eyed3.load(str(path))
    if audio is None:
        raise ValueError("Couldn't read the song's tags")
    if audio.tag is None:
        audio.initTag()
    yield audio.tag
    audio.tag.save(version=(2, 3, 0))


def set_track_tags(
    filepaths: list[Path],
    artist: Optional[str] = None,
    album: Optional[str] = None,
) -> None:
    if artist is None and album is None:
        return

    for filepath in filepaths:
        try:
            with edit_tags(filepath) as tag:
                if artist is not None:
                    tag.artist = artist.strip() or None
                if album is not None:
                    tag.album = album.strip() or None
        except ValueError:
            continue

    invalidate_library_cache()


def set_album_cover(filepaths: list[Path], image_data: bytes, mime_type: str) -> None:
    for filepath in filepaths:
        try:
            with edit_tags(filepath) as tag:
                set_cover_images(tag, image_data, mime_type)
        except ValueError:
            continue

    invalidate_library_cache()


def with_real_dates(infos: list[MP3Info]) -> list[MP3Info]:
    dates = date_service.resolve({info.filename: info.date_added for info in infos if info.date_added})
    for info in infos:
        info.date_added = dates.get(info.filename, info.date_added)
    return infos


def get_mp3_info(filepath: Path) -> MP3Info:
    audio = eyed3.load(str(filepath))
    file_stats = filepath.stat()
    created = getattr(file_stats, "st_birthtime", file_stats.st_ctime)
    info = MP3Info(
        filename=filepath.name,
        file_size=file_stats.st_size,
        date_added=datetime.fromtimestamp(min(created, file_stats.st_mtime), tz=timezone.utc),
    )
    if audio and audio.tag:
        info.title = audio.tag.title
        info.artist = audio.tag.artist
        info.album = audio.tag.album
        info.has_cover = bool(audio.tag.images)
    info.album_key = make_album_key(info.album)
    if audio and audio.info:
        info.duration = audio.info.time_secs
    return info


