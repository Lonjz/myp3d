from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request

from models.schemas import (
    SyncIncomingRequest,
    SyncManifestEntry,
    SyncPeer,
    SyncProgress,
    SyncRequestCreate,
    SyncSessionInfo,
    SyncStartRequest,
    SyncStatus,
)
from services import sync_service
from services.device_service import get_device
from services.discovery_service import discovery
from services.sync_service import SyncError

router = APIRouter(prefix="/sync", tags=["Sync"])


def _raise(exc: SyncError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


def _status() -> SyncStatus:
    return SyncStatus(device=get_device(), port=discovery.port())


@router.get("/device", response_model=SyncStatus)
def get_sync_device():
    return _status()


@router.post("/start", response_model=SyncStatus)
def start_sync_discovery(payload: SyncStartRequest):
    try:
        discovery.start(payload.port)
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Couldn't listen on port {payload.port}") from exc
    return _status()


@router.post("/stop", response_model=SyncStatus)
def stop_sync_discovery():
    discovery.stop()
    return _status()


@router.get("/peers", response_model=list[SyncPeer])
def list_sync_peers():
    discovery.touch()
    return [SyncPeer(id=peer.id, name=peer.name, host=peer.host) for peer in discovery.list_peers()]


@router.get("/session", response_model=Optional[SyncSessionInfo])
def get_sync_session():
    discovery.touch()
    return sync_service.get_session()


@router.post("/requests", response_model=SyncSessionInfo)
def create_sync_request(payload: SyncRequestCreate):
    try:
        return sync_service.request_sync(payload.peer_id)
    except SyncError as exc:
        _raise(exc)


@router.post("/session/accept", response_model=SyncSessionInfo)
def accept_sync_request():
    try:
        return sync_service.accept()
    except SyncError as exc:
        _raise(exc)


@router.post("/session/decline")
def decline_sync_request():
    try:
        sync_service.decline()
    except SyncError as exc:
        _raise(exc)
    return {"success": True}


@router.post("/session/cancel")
def cancel_sync():
    try:
        sync_service.cancel()
    except SyncError as exc:
        _raise(exc)
    return {"success": True}


@router.post("/session/dismiss")
def dismiss_sync():
    try:
        sync_service.dismiss()
    except SyncError as exc:
        _raise(exc)
    return {"success": True}


@router.get("/manifest", response_model=list[SyncManifestEntry])
def get_sync_manifest(session_id: str = Query(...)):
    try:
        return sync_service.manifest(session_id)
    except SyncError as exc:
        _raise(exc)


@router.post("/incoming", response_model=SyncSessionInfo)
def receive_sync_request(payload: SyncIncomingRequest, request: Request):
    host = request.client.host if request.client else ""
    if not host:
        raise HTTPException(status_code=400, detail="Unknown sender")
    try:
        return sync_service.receive_request(
            payload.session_id,
            payload.device.model_dump(),
            payload.port,
            host,
        )
    except SyncError as exc:
        _raise(exc)


@router.post("/sessions/{session_id}/accepted")
def peer_accepted(session_id: str):
    try:
        sync_service.on_accepted(session_id)
    except SyncError as exc:
        _raise(exc)
    return {"success": True}


@router.post("/sessions/{session_id}/declined")
def peer_declined(session_id: str):
    try:
        sync_service.on_declined(session_id)
    except SyncError as exc:
        _raise(exc)
    return {"success": True}


@router.post("/sessions/{session_id}/cancelled")
def peer_cancelled(session_id: str):
    try:
        sync_service.on_cancelled(session_id)
    except SyncError as exc:
        _raise(exc)
    return {"success": True}


@router.post("/sessions/{session_id}/progress")
def peer_progress(session_id: str, payload: SyncProgress):
    try:
        sync_service.on_progress(session_id, payload)
    except SyncError as exc:
        _raise(exc)
    return {"success": True}
