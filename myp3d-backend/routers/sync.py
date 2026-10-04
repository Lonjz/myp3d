from fastapi import APIRouter, HTTPException

from models.schemas import SyncPeer, SyncStartRequest, SyncStatus
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

