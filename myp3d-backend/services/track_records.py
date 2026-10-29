from services import date_service, favorite_service, music_playlist_service, playlist_service, queue_service


def rename(old: str, new: str) -> None:
    if old == new:
        return
    playlist_service.rename_track(old, new)
    favorite_service.rename_track(old, new)
    date_service.rename_track(old, new)
    music_playlist_service.rename_track(old, new)
    queue_service.rename_track(old, new)


def remove(filenames: list[str]) -> None:
    playlist_service.remove_tracks(filenames)
    favorite_service.remove_tracks(filenames)
    date_service.remove_tracks(filenames)
