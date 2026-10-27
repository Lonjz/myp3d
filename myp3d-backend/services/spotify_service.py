import json
import re
import threading
import time
import unicodedata
import urllib.error
import urllib.request
from difflib import SequenceMatcher
from functools import lru_cache
from html import unescape
from typing import Optional

from ytmusicapi import YTMusic

from models.schemas import (
    SpotifyCandidate,
    SpotifyResolveResult,
    SpotifyTrack,
    SpotifyTrackMatch,
    SpotifyTrackRef,
)
from services.mp3_service import list_mp3_infos
from services.youtube_service import search_youtube

USER_AGENT = "Mozilla/5.0"
FETCH_TIMEOUT_S = 15
EMBED_TRACK_LIMIT = 100
SEARCH_LIMIT = 10
MATCH_LIMIT = 5
GOOD_SCORE = 0.7
RETRY_STATUSES = {429, 500, 502, 503, 504}
FETCH_RETRIES = 2
MAX_RETRY_WAIT_S = 10.0
NOT_FOUND_DETAILS = {
    "playlist": "Couldn't open that playlist. If it's private, make it public or paste its song links",
    "album": "Spotify album not found",
    "track": "Spotify song not found",
}

LINK_PATTERN = re.compile(r"(?:open\.spotify\.com/(?:intl-[a-z-]+/)?|spotify:)(track|album|playlist)[/:]([A-Za-z0-9]{22})")
NEXT_DATA_PATTERN = re.compile(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', re.S)
DESCRIPTION_PATTERN = re.compile(r'<meta property="og:description" content="([^"]*)"')
FEAT_PATTERN = re.compile(r"\s*[(\[](?:feat\.?|ft\.?|featuring|with)\s[^)\]]*[)\]]", re.I)

STOP_TOKENS = {
    "official", "music", "video", "audio", "lyric", "lyrics", "visualizer", "hd", "hq", "4k", "mv",
    "feat", "ft", "featuring", "with", "prod", "topic",
}
VARIANT_PHRASES = (
    "live", "remix", "cover", "sped up", "slowed", "karaoke", "instrumental", "acoustic", "nightcore", "8d",
    "reverb", "extended", "demo", "tribute", "made popular by", "originally performed", "in the style of", "backing",
    "piano version", "lullaby",
)
CLEAN_PHRASES = ("clean", "radio edit", "censored")


class SpotifyError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


_ytmusic = threading.local()


def _client() -> YTMusic:
    client = getattr(_ytmusic, "client", None)
    if client is None:
        client = YTMusic()
        _ytmusic.client = client
    return client


def _retry_wait(exc: urllib.error.HTTPError, attempt: int) -> float:
    retry_after = exc.headers.get("Retry-After") if exc.headers else None
    wait = float(retry_after) if retry_after and retry_after.isdigit() else 1.5 * (attempt + 1)
    return min(wait, MAX_RETRY_WAIT_S)


def _fetch(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "en"})
    for attempt in range(FETCH_RETRIES + 1):
        try:
            with urllib.request.urlopen(request, timeout=FETCH_TIMEOUT_S) as response:
                return response.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                raise SpotifyError(404, "Spotify link not found") from exc
            if exc.code in RETRY_STATUSES and attempt < FETCH_RETRIES:
                time.sleep(_retry_wait(exc, attempt))
                continue
            raise SpotifyError(502, "Couldn't reach Spotify") from exc
        except OSError as exc:
            raise SpotifyError(502, "Couldn't reach Spotify") from exc
    raise SpotifyError(502, "Couldn't reach Spotify")


def _embed_entity(kind: str, spotify_id: str) -> dict:
    match = NEXT_DATA_PATTERN.search(_fetch(f"https://open.spotify.com/embed/{kind}/{spotify_id}"))
    if not match:
        raise SpotifyError(502, "Couldn't read the Spotify page")
    try:
        page_props = json.loads(match.group(1))["props"]["pageProps"]
        if page_props.get("status") == 404:
            raise SpotifyError(404, NOT_FOUND_DETAILS[kind])
        entity = page_props["state"]["data"]["entity"]
    except (ValueError, KeyError, TypeError, AttributeError) as exc:
        raise SpotifyError(502, "Couldn't read the Spotify page") from exc
    if not isinstance(entity, dict):
        raise SpotifyError(404, NOT_FOUND_DETAILS[kind])
    return entity


@lru_cache(maxsize=2048)
def _track_entity(spotify_id: str) -> dict:
    return _embed_entity("track", spotify_id)


def _largest_image(entity: dict) -> Optional[str]:
    images = (entity.get("visualIdentity") or {}).get("image") or (entity.get("coverArt") or {}).get("sources") or []
    best = max(images, key=lambda image: image.get("maxWidth") or image.get("width") or 0, default=None)
    return best.get("url") if best else None


def _seconds(milliseconds: object) -> Optional[float]:
    return float(round(milliseconds / 1000)) if isinstance(milliseconds, (int, float)) and milliseconds > 0 else None


def _normalize(value: Optional[str]) -> str:
    decomposed = unicodedata.normalize("NFKD", value or "")
    text = "".join(char for char in decomposed if not unicodedata.combining(char)).casefold()
    return " ".join(re.findall(r"[^\W_]+", text.replace("&", " and ")))


def _has_phrase(text: str, phrase: str) -> bool:
    return f" {phrase} " in f" {text} "


def base_title(name: str) -> str:
    return FEAT_PATTERN.sub("", name).strip() or name.strip()


def format_title(name: str, artists: list[str]) -> str:
    title = base_title(name)
    featured = artists[1:]
    return f"{title} (feat. {', '.join(featured)})" if featured else title


def default_filename(name: str) -> Optional[str]:
    letters = re.sub(r"[^a-z0-9 ]", "", base_title(name).lower())
    return " ".join(letters.split()) or None


def resolve(text: str) -> SpotifyResolveResult:
    links = list(dict.fromkeys(LINK_PATTERN.findall(text)))
    if not links:
        raise SpotifyError(400, "No Spotify links found")

    tracks: list[SpotifyTrackRef] = []
    seen: set[str] = set()
    truncated = False
    failures: list[SpotifyError] = []
    for kind, spotify_id in links:
        if kind == "track":
            refs = [SpotifyTrackRef(id=spotify_id, name="")]
        else:
            try:
                entity = _embed_entity(kind, spotify_id)
            except SpotifyError as exc:
                if len(links) == 1:
                    raise
                failures.append(exc)
                continue
            items = entity.get("trackList") or []
            album = (entity.get("name") or entity.get("title")) if kind == "album" else None
            cover = _largest_image(entity) if kind == "album" else None
            refs = [
                SpotifyTrackRef(
                    id=item["uri"].rsplit(":", 1)[-1],
                    name=item.get("title") or "",
                    subtitle=(item.get("subtitle") or "").replace(" ", " "),
                    duration=_seconds(item.get("duration")),
                    explicit=bool(item.get("isExplicit")),
                    album=album,
                    cover_url=cover,
                )
                for item in items
                if str(item.get("uri", "")).startswith("spotify:track:")
            ]
            if kind == "playlist" and len(items) >= EMBED_TRACK_LIMIT:
                truncated = True
        for ref in refs:
            if ref.id not in seen:
                seen.add(ref.id)
                tracks.append(ref)

    if not tracks and failures:
        raise failures[0]
    return SpotifyResolveResult(tracks=tracks, truncated=truncated, skipped=len(failures))


def _album_from_page(spotify_id: str) -> Optional[str]:
    try:
        page = _fetch(f"https://open.spotify.com/track/{spotify_id}")
    except SpotifyError:
        return None
    match = DESCRIPTION_PATTERN.search(page)
    if not match:
        return None
    parts = [part.strip() for part in unescape(match.group(1)).split("·")]
    return parts[-3] or None if len(parts) >= 4 else None


@lru_cache(maxsize=1024)
def _track_details(spotify_id: str, album_hint: Optional[str]) -> SpotifyTrack:
    entity = _track_entity(spotify_id)
    return SpotifyTrack(
        id=spotify_id,
        url=f"https://open.spotify.com/track/{spotify_id}",
        name=entity.get("name") or entity.get("title") or "",
        artists=[artist["name"] for artist in entity.get("artists") or [] if artist.get("name")],
        album=album_hint or _album_from_page(spotify_id),
        duration=_seconds(entity.get("duration")),
        explicit=bool(entity.get("isExplicit")),
        cover_url=_largest_image(entity),
    )


def _ytmusic_results(query: str, kind: str) -> list[dict]:
    results = []
    for result in _client().search(query, filter=kind, limit=SEARCH_LIMIT)[:SEARCH_LIMIT]:
        video_id = result.get("videoId")
        if not video_id:
            continue
        thumbnails = result.get("thumbnails") or []
        results.append(
            {
                "video_id": video_id,
                "url": f"https://www.youtube.com/watch?v={video_id}",
                "title": result.get("title") or "",
                "artists": [artist["name"] for artist in result.get("artists") or [] if artist.get("name")],
                "album": (result.get("album") or {}).get("name"),
                "duration": result.get("duration_seconds"),
                "thumbnail_url": thumbnails[-1].get("url") if thumbnails else None,
                "explicit": result.get("isExplicit") if kind == "songs" else None,
                "kind": "song" if kind == "songs" else "video",
            }
        )
    return results


def _youtube_results(query: str) -> list[dict]:
    return [
        {
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
        for result in search_youtube(query, SEARCH_LIMIT)
    ]


def _title_score(title: str, candidate_title: str, artists: list[str]) -> float:
    target = _normalize(title).split()
    if not target:
        return 0.0
    artist_tokens = set(_normalize(" ".join(artists)).split())
    candidate = [
        token
        for token in _normalize(FEAT_PATTERN.sub("", candidate_title)).split()
        if token not in STOP_TOKENS and (token in target or token not in artist_tokens)
    ]
    if not candidate:
        return 0.0
    target_set, candidate_set = set(target), set(candidate)
    shared = len(target_set & candidate_set) / len(target_set)
    extra = len(candidate_set - target_set) / len(candidate_set)
    ratio = SequenceMatcher(None, " ".join(target), " ".join(candidate)).ratio()
    return max(ratio, shared - 0.4 * extra)


def _artist_score(artists: list[str], candidate: dict) -> float:
    if not artists:
        return 0.5
    credited = _normalize(" ".join(candidate["artists"]))
    anywhere = _normalize(" ".join([*candidate["artists"], candidate["title"]]))

    def present(name: str, haystack: str) -> bool:
        normalized = _normalize(name)
        return bool(normalized) and _has_phrase(haystack, normalized)

    featured = artists[1:]
    rest = sum(present(name, anywhere) for name in featured) / len(featured) if featured else 1.0
    main = present(artists[0], credited if candidate["kind"] == "song" else anywhere)
    return 0.75 * main + 0.25 * rest


def _duration_score(expected: Optional[float], actual: Optional[float]) -> float:
    if not expected or not actual:
        return 0.5
    difference = abs(expected - actual)
    return 1.0 if difference <= 2 else max(0.0, 1 - (difference - 2) / 13)


def _score(track: SpotifyTrack, candidate: dict) -> float:
    title_score = _title_score(base_title(track.name), candidate["title"], track.artists)
    artist_score = _artist_score(track.artists, candidate)
    score = (
        (0.4 * _duration_score(track.duration, candidate["duration"]) + 0.35 * title_score + 0.25 * artist_score)
        * (0.4 + 0.6 * title_score)
        * (0.5 + 0.5 * artist_score)
    )
    if candidate["kind"] == "song":
        score += 0.05
    if candidate["explicit"]:
        score += 0.1
    if track.album and candidate["album"] and _normalize(candidate["album"]).startswith(_normalize(track.album)):
        score += 0.05

    spotify_text = _normalize(f"{track.name} {track.album or ''}")
    candidate_text = _normalize(f"{candidate['title']} {candidate['album'] or ''}")
    if any(_has_phrase(candidate_text, phrase) and not _has_phrase(spotify_text, phrase) for phrase in VARIANT_PHRASES):
        score -= 0.25
    if any(_has_phrase(candidate_text, phrase) and not _has_phrase(spotify_text, phrase) for phrase in CLEAN_PHRASES):
        score -= 0.15
    return score


def _candidates(track: SpotifyTrack) -> list[SpotifyCandidate]:
    query = " ".join(filter(None, [track.artists[0] if track.artists else None, base_title(track.name)]))
    try:
        results = _ytmusic_results(query, "songs")
        if not results or max(_score(track, result) for result in results) < GOOD_SCORE:
            results += _ytmusic_results(query, "videos")
    except Exception:
        results = _youtube_results(query)

    unique: dict[str, dict] = {}
    for result in results:
        unique.setdefault(result["video_id"], result)
    ranked = sorted(((_score(track, result), result) for result in unique.values()), key=lambda pair: pair[0], reverse=True)
    return [
        SpotifyCandidate(**result, score=round(min(1.0, max(0.0, score)), 3))
        for score, result in ranked[:MATCH_LIMIT]
    ]


def _in_library(title: str, artist: Optional[str], filename: Optional[str]) -> bool:
    key = (_normalize(base_title(title)), _normalize(artist))
    for info in list_mp3_infos():
        if filename and info.filename.lower() == f"{filename}.mp3":
            return True
        if info.title and (_normalize(base_title(info.title)), _normalize(info.artist)) == key:
            return True
    return False


def match_track(spotify_id: str, album_hint: Optional[str] = None) -> SpotifyTrackMatch:
    if not re.fullmatch(r"[A-Za-z0-9]{22}", spotify_id):
        raise SpotifyError(400, "Invalid Spotify track")
    track = _track_details(spotify_id, album_hint or None)
    artist = track.artists[0] if track.artists else None
    filename = default_filename(track.name)
    return SpotifyTrackMatch(
        track=track,
        title=format_title(track.name, track.artists),
        artist=artist,
        filename=filename,
        in_library=_in_library(track.name, artist, filename),
        candidates=_candidates(track),
    )
