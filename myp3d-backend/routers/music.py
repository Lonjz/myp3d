from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from models.library import BulkResult
from models.music import (
    MusicAlbumFixRequest,
    MusicAlbumIssue,
    MusicDiff,
    MusicFolderRequest,
    MusicPlaylistDiff,
    MusicPlaylistSyncInfo,
    MusicStatus,
    MusicSyncInfo,
)
from services import music_playlist_service, music_service
from services.errors import AppError

router = APIRouter(prefix="/music", tags=["Music"])


def _is_syncing(info: Optional[MusicSyncInfo | MusicPlaylistSyncInfo]) -> bool:
    return info is not None and info.status == "syncing"


@router.get("/status", response_model=MusicStatus)
def get_music_status(detect: bool = Query(True)):
    if not music_service.is_available():
        return MusicStatus(available=False)
    if not detect:
        return MusicStatus(available=True)
    try:
        folder = music_service.detect_folder()
    except AppError:
        folder = None
    return MusicStatus(available=True, detected_folder=folder)


@router.post("/diff", response_model=MusicDiff)
def get_music_diff(payload: MusicFolderRequest):
    return music_service.diff(payload.folder)


@router.post("/sync", response_model=MusicSyncInfo)
def start_music_sync(payload: MusicFolderRequest):
    if _is_syncing(music_playlist_service.get_sync()):
        raise HTTPException(status_code=409, detail="Wait for the playlist sync to finish")
    return music_service.start_sync(payload.folder)


@router.post("/art/check", response_model=MusicDiff)
def check_music_art(payload: MusicFolderRequest):
    if _is_syncing(music_service.get_sync()) or _is_syncing(music_playlist_service.get_sync()):
        raise HTTPException(status_code=409, detail="Wait for the sync to finish")
    return music_service.check_art(payload.folder)


@router.get("/sync", response_model=Optional[MusicSyncInfo])
def get_music_sync():
    return music_service.get_sync()


@router.post("/sync/dismiss")
def dismiss_music_sync():
    music_service.dismiss_sync()
    return {"success": True}


@router.post("/playlists/diff", response_model=MusicPlaylistDiff)
def get_music_playlist_diff(payload: MusicFolderRequest):
    return music_playlist_service.diff(payload.folder)


@router.post("/playlists/sync", response_model=MusicPlaylistSyncInfo)
def start_music_playlist_sync(payload: MusicFolderRequest):
    if _is_syncing(music_service.get_sync()):
        raise HTTPException(status_code=409, detail="Wait for the song sync to finish")
    return music_playlist_service.start_sync(payload.folder)


@router.get("/playlists/sync", response_model=Optional[MusicPlaylistSyncInfo])
def get_music_playlist_sync():
    return music_playlist_service.get_sync()


@router.post("/playlists/sync/dismiss")
def dismiss_music_playlist_sync():
    music_playlist_service.dismiss_sync()
    return {"success": True}


@router.get("/albums", response_model=list[MusicAlbumIssue])
def get_music_album_issues():
    return music_service.album_issues()


@router.post("/albums/fix", response_model=BulkResult)
def fix_music_albums(payload: MusicAlbumFixRequest):
    if _is_syncing(music_service.get_sync()) or _is_syncing(music_playlist_service.get_sync()):
        raise HTTPException(status_code=409, detail="Wait for the sync to finish")
    return music_service.clear_album_artists(payload.keys)
