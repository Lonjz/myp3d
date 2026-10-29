from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Response

from models.schemas import (
    SyncDiff,
    SyncPeer,
    SyncRequestCreate,
    SyncSessionInfo,
    SyncStartRequest,
    SyncStatus,
)
from services import sync_service
from services.cover_service import CoverSize
from services.device_service import get_device
from services.discovery_service import discovery

router = APIRouter(prefix="/sync", tags=["Sync"])


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
    return sync_service.request_sync(payload.peer_id)


@router.post("/session/accept", response_model=SyncSessionInfo)
def accept_sync_request():
    return sync_service.accept()


@router.get("/session/diff", response_model=SyncDiff)
def get_sync_diff():
    return sync_service.diff()


@router.get("/session/cover/{filename}")
def get_peer_cover(filename: str, size: Optional[CoverSize] = Query(None)):
    content, media_type = sync_service.peer_cover(filename, size)
    return Response(content=content, media_type=media_type)


@router.post("/session/start", response_model=SyncSessionInfo)
def start_sync():
    return sync_service.start()


@router.post("/session/decline")
def decline_sync_request():
    sync_service.decline()
    return {"success": True}


@router.post("/session/cancel")
def cancel_sync():
    sync_service.cancel()
    return {"success": True}


@router.post("/session/dismiss")
def dismiss_sync():
    sync_service.dismiss()
    return {"success": True}
