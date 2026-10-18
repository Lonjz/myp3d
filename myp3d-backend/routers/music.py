from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from models.schemas import MusicDiff, MusicFolderRequest, MusicStatus, MusicSyncInfo, MusicSyncRequest
from services import music_service
from services.music_service import MusicError

router = APIRouter(prefix="/music", tags=["Music"])


def _raise(exc: MusicError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.get("/status", response_model=MusicStatus)
def get_music_status(detect: bool = Query(True)):
    if not music_service.is_available():
        return MusicStatus(available=False)
    if not detect:
        return MusicStatus(available=True)
    try:
        folder = music_service.detect_folder()
    except MusicError:
        folder = None
    return MusicStatus(available=True, detected_folder=folder)


@router.post("/diff", response_model=MusicDiff)
def get_music_diff(payload: MusicFolderRequest):
    try:
        return music_service.diff(payload.folder)
    except MusicError as exc:
        _raise(exc)


@router.post("/sync", response_model=MusicSyncInfo)
def start_music_sync(payload: MusicSyncRequest):
    try:
        return music_service.start_sync(payload.filenames, payload.folder)
    except MusicError as exc:
        _raise(exc)


@router.get("/sync", response_model=Optional[MusicSyncInfo])
def get_music_sync():
    return music_service.get_sync()


@router.post("/sync/dismiss")
def dismiss_music_sync():
    try:
        music_service.dismiss_sync()
    except MusicError as exc:
        _raise(exc)
    return {"success": True}
