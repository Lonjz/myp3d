import re
from pathlib import Path
from typing import Optional

from models.schemas import AlbumInfo, MP3Info, SearchResults
from services.mp3_service import build_album_groups, list_mp3_infos


_WORD_SPLIT = re.compile(r"[\W_]+", re.UNICODE)


def _split_words(value: str) -> list[str]:
    return [word for word in _WORD_SPLIT.split(value.casefold()) if word]


def _match_rank(word: str, field: str) -> Optional[int]:
    if not field:
        return None
    if field == word:
        return 0
    if field.startswith(word):
        return 1
    if any(part.startswith(word) for part in _split_words(field)):
        return 2
    if word in field:
        return 3
    return None


def _score(words: list[str], fields: list[str]) -> Optional[int]:
    weight = len(fields)
    total = 0
    for word in words:
        best: Optional[int] = None
        for index, field in enumerate(fields):
            rank = _match_rank(word, field)
            if rank is None:
                continue
            value = rank * weight + index
            if best is None or value < best:
                best = value
        if best is None:
            return None
        total += best
    return total


def _track_fields(track: MP3Info) -> list[str]:
    return [
        (track.title or "").casefold(),
        (track.artist or "").casefold(),
        (track.album or "").casefold(),
        Path(track.filename).stem.casefold(),
    ]


def search_library(query: str, limit: int) -> SearchResults:
    words = _split_words(query)
    if not words:
        return SearchResults(tracks=[], albums=[])

    scored_tracks: list[tuple[int, str, MP3Info]] = []
    for track in list_mp3_infos():
        score = _score(words, _track_fields(track))
        if score is not None:
            sort_name = (track.title or track.filename).casefold()
            scored_tracks.append((score, sort_name, track))

    scored_albums: list[tuple[int, str, AlbumInfo]] = []
    for group in build_album_groups().values():
        if not group.normalized_album:
            continue
        fields = [group.normalized_album, *(artist.casefold() for artist in group.artists)]
        score = _score(words, fields)
        if score is not None:
            scored_albums.append((score, group.normalized_album, group.to_info()))

    scored_tracks.sort(key=lambda entry: (entry[0], entry[1]))
    scored_albums.sort(key=lambda entry: (entry[0], entry[1]))

    return SearchResults(
        tracks=[entry[2] for entry in scored_tracks[:limit]],
        albums=[entry[2] for entry in scored_albums[:limit]],
    )
