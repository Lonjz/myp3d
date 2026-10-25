from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse

from models.schemas import SyncDatabase, SyncIncomingRequest, SyncManifestEntry, SyncProgress, SyncSessionInfo
from services import sync_service
from services.cover_service import CoverSize, get_cover_variant
from services.mp3_service import get_album_cover
from services.sync_service import SyncError

router = APIRouter(prefix="/peer", tags=["Peer"])


def _raise(exc: SyncError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


def _client_host(request: Request) -> str:
    host = request.client.host if request.client else ""
    if not host:
        raise HTTPException(status_code=400, detail="Unknown sender")
    return host


@router.post("/incoming", response_model=SyncSessionInfo)
def receive_sync_request(payload: SyncIncomingRequest, request: Request):
    try:
        return sync_service.receive_request(
            payload.session_id,
            payload.device.model_dump(),
            payload.port,
            _client_host(request),
        )
    except SyncError as exc:
        _raise(exc)


@router.get("/sessions/{session_id}/manifest", response_model=list[SyncManifestEntry])
def get_sync_manifest(session_id: str, request: Request):
    try:
        return sync_service.manifest(session_id, _client_host(request))
    except SyncError as exc:
        _raise(exc)


@router.get("/sessions/{session_id}/database", response_model=SyncDatabase)
def get_sync_database(session_id: str, request: Request):
    try:
        return sync_service.database(session_id, _client_host(request))
    except SyncError as exc:
        _raise(exc)


@router.get("/sessions/{session_id}/records/{kind}/{key}/cover")
def get_sync_record_cover(session_id: str, kind: str, key: str, request: Request):
    try:
        cover = sync_service.record_cover(session_id, _client_host(request), kind, key)
    except SyncError as exc:
        _raise(exc)
    return Response(content=cover, media_type="image/jpeg")


@router.get("/sessions/{session_id}/files/{filename}")
def get_peer_file(session_id: str, filename: str, request: Request):
    try:
        path = sync_service.peer_file(session_id, _client_host(request), filename)
    except SyncError as exc:
        _raise(exc)
    return FileResponse(path, media_type="audio/mpeg", filename=filename)


@router.get("/sessions/{session_id}/tags/{filename}")
def get_peer_tags(session_id: str, filename: str, request: Request):
    try:
        head, trailer = sync_service.peer_tags(session_id, _client_host(request), filename)
    except SyncError as exc:
        _raise(exc)
    return Response(
        content=head + trailer,
        media_type="application/octet-stream",
        headers={"X-Head-Length": str(len(head))},
    )


@router.get("/sessions/{session_id}/covers/{filename}")
def get_peer_cover(session_id: str, filename: str, request: Request, size: Optional[CoverSize] = Query(None)):
    try:
        path = sync_service.peer_file(session_id, _client_host(request), filename)
    except SyncError as exc:
        _raise(exc)
    cover = get_cover_variant([path], size) if size else get_album_cover([path])
    if cover is None:
        raise HTTPException(status_code=404, detail="No cover image found")
    return Response(content=cover[0], media_type=cover[1])


@router.post("/sessions/{session_id}/accepted")
def peer_accepted(session_id: str, request: Request):
    try:
        sync_service.on_accepted(session_id, _client_host(request))
    except SyncError as exc:
        _raise(exc)
    return {"success": True}


@router.post("/sessions/{session_id}/start")
def peer_started(session_id: str, request: Request):
    try:
        sync_service.on_start(session_id, _client_host(request))
    except SyncError as exc:
        _raise(exc)
    return {"success": True}


@router.post("/sessions/{session_id}/declined")
def peer_declined(session_id: str, request: Request):
    try:
        sync_service.on_declined(session_id, _client_host(request))
    except SyncError as exc:
        _raise(exc)
    return {"success": True}


@router.post("/sessions/{session_id}/cancelled")
def peer_cancelled(session_id: str, request: Request):
    try:
        sync_service.on_cancelled(session_id, _client_host(request))
    except SyncError as exc:
        _raise(exc)
    return {"success": True}


@router.post("/sessions/{session_id}/progress")
def peer_progress(session_id: str, payload: SyncProgress, request: Request):
    try:
        sync_service.on_progress(session_id, _client_host(request), payload)
    except SyncError as exc:
        _raise(exc)
    return {"success": True}
