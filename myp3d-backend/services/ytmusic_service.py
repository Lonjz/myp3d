import re
import threading
import unicodedata
from functools import lru_cache
from typing import Callable, Optional, TypeVar

from ytmusicapi import YTMusic

from models.library import TagSuggestion
from models.queue import YouTubeArtist, YouTubePlaylist, YouTubeRelease, YouTubeSearchResult
from services.errors import AppError
from services.mp3_service import list_mp3_infos
from services.youtube_service import playlist_entries

FEAT_PATTERN = re.compile(r"\s*[(\[](?:feat\.?|ft\.?|featuring|with)\s[^)\]]*[)\]]", re.I)
PLAYLIST_ID_PATTERN = re.compile(r"[?&]list=([A-Za-z0-9_-]+)")
SIZE_PATTERN = re.compile(r"=w\d+-h\d+")
CLEAN_PHRASES = ("clean", "radio edit", "censored")
SONG_VIDEO_TYPE = "MUSIC_VIDEO_TYPE_ATV"
COVER_SIZE = "=w544-h544"
SUGGESTION_LIMIT = 5
RADIO_LIMIT = 50
ALBUM_ID_PATTERN = re.compile(r"MPREb_[A-Za-z0-9_-]+")
RELEASE_KINDS = {"album": "album", "single": "single", "ep": "ep"}
UNREACHABLE = "Couldn't reach YouTube Music"

LibraryIndex = tuple[set[str], set[tuple[str, str]]]
T = TypeVar("T")

_ytmusic = threading.local()


def client() -> YTMusic:
    found = getattr(_ytmusic, "client", None)
    if found is None:
        found = YTMusic()
        _ytmusic.client = found
    return found


def normalize(value: Optional[str]) -> str:
    decomposed = unicodedata.normalize("NFKD", value or "")
    text = "".join(char for char in decomposed if not unicodedata.combining(char)).casefold()
    return " ".join(re.findall(r"[^\W_]+", text.replace("&", " and ")))


def has_phrase(text: str, phrase: str) -> bool:
    return f" {phrase} " in f" {text} "


def adds_phrase(phrases: tuple[str, ...], text: str, original: str) -> bool:
    return any(has_phrase(text, phrase) and not has_phrase(original, phrase) for phrase in phrases)


def base_title(name: str) -> str:
    return FEAT_PATTERN.sub("", name).strip() or name.strip()


@lru_cache(maxsize=32768)
def song_key(title: str, artist: Optional[str]) -> tuple[str, str]:
    return normalize(base_title(title)), normalize(artist)


def format_title(name: str, artists: list[str]) -> str:
    title = base_title(name)
    featured = artists[1:]
    return f"{title} (feat. {', '.join(featured)})" if featured else title


def default_filename(name: str) -> Optional[str]:
    letters = re.sub(r"[^a-z0-9 ]", "", base_title(name).lower())
    return " ".join(letters.split()) or None


def library_index() -> LibraryIndex:
    filenames: set[str] = set()
    keys: set[tuple[str, str]] = set()
    for info in list_mp3_infos():
        filenames.add(info.filename.lower())
        if info.title:
            keys.add(song_key(info.title, info.artist))
    return filenames, keys


def in_library(title: str, artist: Optional[str], filename: Optional[str], index: LibraryIndex) -> bool:
    filenames, keys = index
    if filename and f"{filename}.mp3" in filenames:
        return True
    return song_key(title, artist) in keys


def _seconds(entry: dict) -> Optional[int]:
    seconds = entry.get("duration_seconds")
    if isinstance(seconds, (int, float)):
        return int(seconds)
    text = entry.get("duration") or entry.get("length")
    if not isinstance(text, str) or not re.fullmatch(r"\d+(?::\d+)+", text):
        return None
    total = 0
    for part in text.split(":"):
        total = total * 60 + int(part)
    return total


def _album_name(album: object) -> Optional[str]:
    if isinstance(album, dict):
        return album.get("name")
    return album if isinstance(album, str) else None


def parse_entry(entry: dict, kind: Optional[str] = None) -> Optional[dict]:
    video_id = entry.get("videoId")
    if not video_id:
        return None
    thumbnails = entry.get("thumbnails") or entry.get("thumbnail") or []
    resolved = kind or ("song" if entry.get("videoType") == SONG_VIDEO_TYPE else "video")
    explicit = entry.get("isExplicit")
    return {
        "video_id": video_id,
        "url": f"https://www.youtube.com/watch?v={video_id}",
        "title": entry.get("title") or "",
        "artists": [artist["name"] for artist in entry.get("artists") or [] if artist.get("name")],
        "album": _album_name(entry.get("album")),
        "duration": _seconds(entry),
        "thumbnail_url": thumbnails[-1].get("url") if thumbnails else None,
        "explicit": bool(explicit) if resolved == "song" and explicit is not None else None,
        "kind": resolved,
    }


def from_youtube(result: dict) -> dict:
    return {
        "video_id": result["video_id"],
        "url": result["url"],
        "title": result["title"],
        "artists": [result["artist"]] if result.get("artist") else [],
        "album": None,
        "duration": result.get("duration"),
        "thumbnail_url": result.get("thumbnail_url"),
        "explicit": None,
        "kind": "video",
    }


def search_entries(query: str, kind: str, limit: int) -> list[dict]:
    entries = client().search(query, filter=kind, limit=limit)[:limit]
    parsed = (parse_entry(entry, "song" if kind == "songs" else "video") for entry in entries)
    return [result for result in parsed if result is not None]


def best_songs(songs: list[dict], query: str) -> list[dict]:
    wanted = normalize(query)
    chosen: dict[tuple[str, str], dict] = {}
    for song in songs:
        title = normalize(song["title"])
        if not title or adds_phrase(CLEAN_PHRASES, title, wanted):
            continue
        key = song_key(song["title"], song["artists"][0] if song["artists"] else None)
        current = chosen.get(key)
        if current is None or (song["explicit"] and not current["explicit"]):
            chosen[key] = song
    return list(chosen.values())


def song_suggestions(query: str) -> list[TagSuggestion]:
    songs = [song for song in search_entries(query, "songs", 10) if song["artists"]]
    return [
        TagSuggestion(title=format_title(song["title"], song["artists"]), artist=song["artists"][0], album=song["album"])
        for song in best_songs(songs, query)[:SUGGESTION_LIMIT]
    ]


def search(query: str, limit: int) -> list[YouTubeSearchResult]:
    wanted = query.strip()
    if not wanted:
        raise AppError(400, "Search query cannot be empty")
    try:
        songs = best_songs(search_entries(wanted, "songs", limit), wanted)
        listed = {song["video_id"] for song in songs}
        videos = [video for video in search_entries(wanted, "videos", limit // 2) if video["video_id"] not in listed]
    except Exception as exc:
        raise AppError(502, UNREACHABLE) from exc
    raws = [*songs, *videos]
    index = library_index()
    return [to_result(raw, index) for raw in raws]


def _cover_url(raw: dict) -> Optional[str]:
    thumbnail = raw["thumbnail_url"]
    if raw["kind"] != "song" or not thumbnail or not SIZE_PATTERN.search(thumbnail):
        return None
    return SIZE_PATTERN.sub(COVER_SIZE, thumbnail)


def to_result(raw: dict, index: LibraryIndex) -> YouTubeSearchResult:
    artists = raw["artists"]
    song = raw["kind"] == "song"
    title = format_title(raw["title"], artists) if song else raw["title"]
    artist = artists[0] if artists else None
    filename = default_filename(raw["title"]) if song else None
    return YouTubeSearchResult(
        video_id=raw["video_id"],
        url=raw["url"],
        title=title or "Untitled",
        artist=artist,
        album=raw["album"],
        thumbnail_url=raw["thumbnail_url"],
        duration=raw["duration"],
        kind=raw["kind"],
        explicit=raw["explicit"],
        in_library=in_library(raw["title"], artist, filename, index),
        filename=filename,
        cover_url=_cover_url(raw),
    )


def _playlist_id(url: str) -> str:
    match = PLAYLIST_ID_PATTERN.search(url)
    if not match:
        raise AppError(400, "No YouTube playlist in that link")
    return match.group(1)


def _results(entries: list[dict], kind: Optional[str] = None) -> tuple[list[YouTubeSearchResult], int]:
    index = library_index()
    results: list[YouTubeSearchResult] = []
    seen: set[str] = set()
    unavailable = 0
    for entry in entries:
        raw = parse_entry(entry, kind) if entry.get("isAvailable", True) else None
        if raw is None:
            unavailable += 1
            continue
        if raw["video_id"] in seen:
            continue
        seen.add(raw["video_id"])
        results.append(to_result(raw, index))
    return results, unavailable


def playlist(url: str) -> YouTubePlaylist:
    playlist_id = _playlist_id(url)
    try:
        data = client().get_playlist(playlist_id, limit=None)
    except Exception:
        return _youtube_playlist(playlist_id)
    tracks, unavailable = _results(data.get("tracks") or [])
    return YouTubePlaylist(title=data.get("title") or "", tracks=tracks, unavailable=unavailable)


def _youtube_playlist(playlist_id: str) -> YouTubePlaylist:
    try:
        title, entries, unavailable = playlist_entries(playlist_id)
    except Exception as exc:
        raise AppError(502, "Couldn't open that playlist") from exc
    index = library_index()
    tracks = [to_result(from_youtube(entry), index) for entry in entries]
    return YouTubePlaylist(title=title, tracks=tracks, unavailable=unavailable)


def _reachable(fetch: Callable[[str], T], argument: str) -> T:
    try:
        return fetch(argument)
    except AppError:
        raise
    except Exception as exc:
        raise AppError(502, UNREACHABLE) from exc


def _find_artist(name: str) -> dict:
    wanted = normalize(name)
    hits = [hit for hit in client().search(name, filter="artists", limit=5) if hit.get("browseId")]
    if not hits:
        raise AppError(404, "Couldn't find that artist on YouTube Music")
    return next((hit for hit in hits if normalize(hit.get("artist")) == wanted), hits[0])


def _top_songs(section: dict) -> list[dict]:
    entries = section.get("results") or []
    if not section.get("browseId"):
        return entries
    try:
        return client().get_playlist(section["browseId"], limit=None).get("tracks") or entries
    except Exception:
        return entries


def _release_items(section: dict) -> list[dict]:
    items = section.get("results") or []
    if not section.get("browseId") or not section.get("params"):
        return items
    try:
        return client().get_artist_albums(section["browseId"], section["params"], limit=None) or items
    except Exception:
        return items


def _releases(data: dict, albums: set[str]) -> list[YouTubeRelease]:
    releases: dict[str, YouTubeRelease] = {}
    for key, default in (("albums", "album"), ("singles", "single")):
        for item in _release_items(data.get(key) or {}):
            browse_id, title = item.get("browseId"), item.get("title")
            if not browse_id or not title or browse_id in releases:
                continue
            thumbnails = item.get("thumbnails") or []
            year = item.get("year")
            releases[browse_id] = YouTubeRelease(
                browse_id=browse_id,
                title=title,
                year=str(year) if year else None,
                kind=RELEASE_KINDS.get(str(item.get("type") or "").lower(), default),
                thumbnail_url=thumbnails[-1].get("url") if thumbnails else None,
                in_library=normalize(title) in albums,
            )
    return list(releases.values())


def _artist(name: str) -> YouTubeArtist:
    hit = _find_artist(name)
    data = client().get_artist(hit["browseId"])
    songs, _ = _results(_top_songs(data.get("songs") or {}))
    albums = {normalize(info.album) for info in list_mp3_infos() if info.album}
    return YouTubeArtist(name=data.get("name") or hit.get("artist") or name, songs=songs, releases=_releases(data, albums))


def artist(name: str) -> YouTubeArtist:
    if not name.strip():
        raise AppError(400, "Artist name is required")
    return _reachable(_artist, name.strip())


def _album(browse_id: str) -> YouTubePlaylist:
    data = client().get_album(browse_id)
    title = data.get("title") or ""
    thumbnails = data.get("thumbnails") or []
    entries = [
        {**track, "album": title, "thumbnails": thumbnails, "artists": track.get("artists") or data.get("artists")}
        for track in data.get("tracks") or []
    ]
    tracks, unavailable = _results(entries, "song")
    return YouTubePlaylist(title=title, tracks=tracks, unavailable=unavailable)


def album(browse_id: str) -> YouTubePlaylist:
    if not ALBUM_ID_PATTERN.fullmatch(browse_id):
        raise AppError(400, "Invalid album")
    return _reachable(_album, browse_id)


def _seed_song(title: str, artist_name: Optional[str]) -> dict:
    wanted = song_key(title, artist_name)
    songs = search_entries(" ".join(filter(None, [title, artist_name])), "songs", 10)
    if not songs:
        raise AppError(404, "Couldn't find that song on YouTube Music")
    return next(
        (song for song in songs if song_key(song["title"], song["artists"][0] if song["artists"] else None) == wanted),
        songs[0],
    )


def _similar(filename: str) -> YouTubePlaylist:
    track = next((info for info in list_mp3_infos() if info.filename == filename), None)
    if track is None:
        raise AppError(404, "MP3 file not found")
    title = track.title or filename.removesuffix(".mp3")
    seed = _seed_song(title, track.artist)
    radio = client().get_watch_playlist(seed["video_id"], radio=True, limit=RADIO_LIMIT)
    entries = [entry for entry in radio.get("tracks") or [] if entry.get("videoId") != seed["video_id"]]
    tracks, unavailable = _results(entries)
    return YouTubePlaylist(title=title, tracks=tracks, unavailable=unavailable)


def similar(filename: str) -> YouTubePlaylist:
    return _reachable(_similar, filename)
