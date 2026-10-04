import json
import os
import shutil
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, Optional

from models.schemas import SyncManifestEntry, SyncPeer, SyncProgress, SyncSessionInfo
from services.config import API_PORT, OUTPUT_DIR
from services.device_service import get_device
from services.discovery_service import discovery
from services.mp3_service import invalidate_library_cache, list_mp3_filepaths

SyncStatusName = Literal["requested", "incoming", "syncing", "done", "declined", "failed", "cancelled"]

ACTIVE_STATUSES = {"requested", "incoming", "syncing"}
REQUEST_TIMEOUT_S = 120.0
STALL_TIMEOUT_S = 120.0
HTTP_TIMEOUT_S = 5.0
TRANSFER_TIMEOUT_S = 60.0
COPY_CHUNK_BYTES = 1024 * 1024


class SyncError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass
class _Session:
    id: str
    peer: SyncPeer
    port: int
    direction: Literal["outgoing", "incoming"]
    status: SyncStatusName
    local: SyncProgress = field(default_factory=SyncProgress)
    remote: SyncProgress = field(default_factory=SyncProgress)
    error: Optional[str] = None
    created_at: float = field(default_factory=time.monotonic)
    remote_updated_at: float = field(default_factory=time.monotonic)

    def info(self) -> SyncSessionInfo:
        return SyncSessionInfo(
            id=self.id,
            peer=self.peer,
            direction=self.direction,
            status=self.status,
            local=self.local.model_copy(),
            remote=self.remote.model_copy(),
            error=self.error,
        )


_lock = threading.Lock()
_session: Optional[_Session] = None


def _peer_url(session: _Session, path: str) -> str:
    return f"http://{session.peer.host}:{session.port}{path}"


def _request_json(session: _Session, method: str, path: str, payload: Optional[dict] = None) -> Any:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        _peer_url(session, path),
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if data is not None else {},
    )
    try:
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_S) as response:
            body = response.read()
    except urllib.error.HTTPError as exc:
        try:
            detail = json.loads(exc.read().decode("utf-8")).get("detail")
        except (ValueError, AttributeError):
            detail = None
        raise SyncError(exc.code, str(detail or f"{session.peer.name} refused the request")) from exc
    except (urllib.error.URLError, OSError) as exc:
        raise SyncError(502, f"Couldn't reach {session.peer.name}") from exc
    return json.loads(body.decode("utf-8")) if body else None


def _notify(session: _Session, path: str, payload: Optional[dict] = None) -> None:
    try:
        _request_json(session, "POST", path, payload or {})
    except SyncError:
        pass


def _is_active(session: Optional[_Session]) -> bool:
    return session is not None and session.status in ACTIVE_STATUSES


def _expire(session: _Session) -> None:
    now = time.monotonic()
    if session.status in ("requested", "incoming") and now - session.created_at > REQUEST_TIMEOUT_S:
        session.status = "declined" if session.status == "requested" else "cancelled"
        session.error = "The request timed out"
    elif session.status == "syncing" and not session.remote.finished and now - session.remote_updated_at > STALL_TIMEOUT_S:
        session.status = "failed"
        session.error = f"Lost connection to {session.peer.name}"


def _require(session_id: str, statuses: set[str]) -> _Session:
    if _session is None or _session.id != session_id:
        raise SyncError(404, "Unknown sync session")
    if _session.status not in statuses:
        raise SyncError(409, "The sync session is not in a state for that")
    return _session


def _maybe_finish(session: _Session) -> None:
    if session.status == "syncing" and session.local.finished and session.remote.finished:
        session.status = "done"


def get_session() -> Optional[SyncSessionInfo]:
    with _lock:
        if _session is None:
            return None
        _expire(_session)
        return _session.info()


def request_sync(peer_id: str) -> SyncSessionInfo:
    global _session
    peer = discovery.get_peer(peer_id)
    if peer is None:
        raise SyncError(404, "That device is no longer available")

    with _lock:
        if _is_active(_session):
            raise SyncError(409, "A sync is already in progress")
        session = _Session(
            id=uuid.uuid4().hex,
            peer=SyncPeer(id=peer.id, name=peer.name, host=peer.host),
            port=peer.port,
            direction="outgoing",
            status="requested",
        )
        _session = session

    try:
        _request_json(
            session,
            "POST",
            "/sync/incoming",
            {"session_id": session.id, "device": get_device(), "port": API_PORT},
        )
    except SyncError:
        with _lock:
            if _session is session:
                _session = None
        raise

    return session.info()


def receive_request(session_id: str, device: dict, port: int, host: str) -> SyncSessionInfo:
    global _session
    if not discovery.is_active():
        raise SyncError(409, "Sync isn't open on that device")

    with _lock:
        if _is_active(_session):
            raise SyncError(409, "That device is busy with another sync")
        _session = _Session(
            id=session_id,
            peer=SyncPeer(id=device["id"], name=device["name"], host=host),
            port=port,
            direction="incoming",
            status="incoming",
        )
        return _session.info()


def _start_syncing(session: _Session) -> None:
    session.status = "syncing"
    session.remote_updated_at = time.monotonic()
    threading.Thread(target=_pull_worker, args=(session,), daemon=True).start()


def accept() -> SyncSessionInfo:
    with _lock:
        if _session is None or _session.status != "incoming":
            raise SyncError(409, "There is no sync request to accept")
        session = _session

    _request_json(session, "POST", f"/sync/sessions/{session.id}/accepted", {})

    with _lock:
        if _session is session and session.status == "incoming":
            _start_syncing(session)
        return session.info()


def on_accepted(session_id: str) -> None:
    with _lock:
        _start_syncing(_require(session_id, {"requested"}))


def decline() -> None:
    with _lock:
        if _session is None or _session.status != "incoming":
            raise SyncError(409, "There is no sync request to decline")
        session = _session
        session.status = "declined"
    _notify(session, f"/sync/sessions/{session.id}/declined")


def on_declined(session_id: str) -> None:
    with _lock:
        _require(session_id, {"requested"}).status = "declined"


def cancel() -> None:
    with _lock:
        if _session is None or _session.status not in ("requested", "syncing"):
            raise SyncError(409, "There is no sync to cancel")
        session = _session
        session.status = "cancelled"
    _notify(session, f"/sync/sessions/{session.id}/cancelled")


def on_cancelled(session_id: str) -> None:
    with _lock:
        session = _require(session_id, ACTIVE_STATUSES)
        session.status = "cancelled"
        session.error = f"The sync was stopped on {session.peer.name}"


def on_progress(session_id: str, progress: SyncProgress) -> None:
    with _lock:
        session = _require(session_id, ACTIVE_STATUSES)
        session.remote = progress
        session.remote_updated_at = time.monotonic()
        _maybe_finish(session)


def dismiss() -> None:
    global _session
    with _lock:
        if _is_active(_session):
            raise SyncError(409, "The sync is still running")
        _session = None


def manifest(session_id: str) -> list[SyncManifestEntry]:
    with _lock:
        _require(session_id, ACTIVE_STATUSES)
    return [
        SyncManifestEntry(filename=path.name, size=path.stat().st_size)
        for path in list_mp3_filepaths()
    ]


def _is_safe_filename(name: Any) -> bool:
    return (
        isinstance(name, str)
        and Path(name).name == name
        and not name.startswith(".")
        and name.lower().endswith(".mp3")
    )


def _still_syncing(session: _Session) -> bool:
    with _lock:
        return _session is session and session.status == "syncing"


def _fail(session: _Session, message: str) -> None:
    with _lock:
        if _session is session and session.status == "syncing":
            session.status = "failed"
            session.error = message
    _notify(session, f"/sync/sessions/{session.id}/cancelled")


def _report(session: _Session) -> bool:
    with _lock:
        payload = session.local.model_dump()
    try:
        _request_json(session, "POST", f"/sync/sessions/{session.id}/progress", payload)
    except SyncError as exc:
        _fail(session, exc.detail)
        return False
    return True


def _download(session: _Session, filename: str) -> bool:
    destination = OUTPUT_DIR / filename
    if destination.exists():
        return True
    partial = OUTPUT_DIR / f".{filename}.part"
    url = _peer_url(session, f"/mp3s/{urllib.parse.quote(filename)}")
    try:
        with urllib.request.urlopen(url, timeout=TRANSFER_TIMEOUT_S) as response, open(partial, "wb") as handle:
            shutil.copyfileobj(response, handle, COPY_CHUNK_BYTES)
        if destination.exists():
            partial.unlink(missing_ok=True)
        else:
            os.replace(partial, destination)
        return True
    except (urllib.error.URLError, OSError):
        partial.unlink(missing_ok=True)
        return False


def _pull_worker(session: _Session) -> None:
    try:
        entries = _request_json(session, "GET", f"/sync/manifest?session_id={session.id}")
    except SyncError as exc:
        _fail(session, exc.detail)
        return

    local_names = {path.name for path in list_mp3_filepaths()}
    missing = [
        entry["filename"]
        for entry in entries or []
        if isinstance(entry, dict) and _is_safe_filename(entry.get("filename")) and entry["filename"] not in local_names
    ]

    with _lock:
        session.local.total = len(missing)
    if not _report(session):
        return

    try:
        for filename in missing:
            if not _still_syncing(session):
                return
            succeeded = _download(session, filename)
            with _lock:
                if succeeded:
                    session.local.done += 1
                else:
                    session.local.failed += 1
            if not _report(session):
                return
    finally:
        if missing:
            invalidate_library_cache()

    with _lock:
        session.local.finished = True
        _maybe_finish(session)
    _report(session)
