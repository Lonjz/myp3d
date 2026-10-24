from typing import Iterable, Optional

from models.schemas import PlaylistDetail, PlaylistInfo
from services import favorite_service, playlist_service
from services.mp3_service import list_mp3_filepaths

PLAYLIST_NAME = "faves"


def _library_names() -> set[str]:
    return {path.name for path in list_mp3_filepaths()}


def playlist_id() -> Optional[str]:
    return playlist_service.favorites_id()


def reconcile() -> None:
    target = playlist_id()
    if target is None:
        return
    starred = favorite_service.list_ordered()
    starred_set = set(starred)
    library = _library_names()
    current = playlist_service.stored_filenames(target)
    kept = [filename for filename in current if filename in starred_set or filename not in library]
    added = [filename for filename in starred if filename not in current and filename in library]
    playlist_service.replace_tracks(target, kept + added)


def ensure() -> None:
    if playlist_id() is None:
        found = playlist_service.find_by_name(PLAYLIST_NAME)
        if found is None:
            return
        playlist_service.mark_favorites(found)
    reconcile()


def _follow_stars(add: Iterable[str], remove: Iterable[str]) -> None:
    target = playlist_id()
    if target is None:
        return
    removed = set(remove)
    current = [filename for filename in playlist_service.stored_filenames(target) if filename not in removed]
    library = _library_names()
    added = [filename for filename in dict.fromkeys(add) if filename not in current and filename in library]
    playlist_service.replace_tracks(target, current + added)


def set_many(add: Iterable[str], remove: Iterable[str]) -> None:
    added, removed = list(add), list(remove)
    favorite_service.set_many(added, removed)
    _follow_stars(added, removed)


def set_favorite(filename: str, on: bool) -> None:
    set_many([filename] if on else [], [] if on else [filename])


def _follow_playlist(target: str, before: list[str]) -> None:
    if target != playlist_id():
        return
    after = playlist_service.stored_filenames(target)
    favorite_service.set_many(set(after) - set(before), set(before) - set(after))


def update_playlist(
    target: str,
    name: Optional[str],
    filenames: Optional[list[str]],
    description: Optional[str] = None,
) -> PlaylistDetail:
    before = playlist_service.stored_filenames(target)
    detail = playlist_service.update(target, name, filenames, description)
    _follow_playlist(target, before)
    return detail


def add_tracks(target: str, filenames: list[str]) -> PlaylistInfo:
    before = playlist_service.stored_filenames(target)
    info = playlist_service.add_tracks(target, filenames)
    _follow_playlist(target, before)
    return info
