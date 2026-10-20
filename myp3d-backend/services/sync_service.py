import hashlib
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

from models.schemas import SyncDiff, SyncDiffTrack, SyncManifestEntry, SyncPeer, SyncProgress, SyncSessionInfo
from services.audio_fingerprint import id3_tag_length
from services.config import API_PORT, OUTPUT_DIR
from services.device_service import get_device
from services.discovery_service import discovery
from services.mp3_service import invalidate_library_cache, list_mp3_filepaths, list_mp3_infos

SyncStatusName = Literal["requested", "incoming", "paired", "syncing", "done", "declined", "failed", "cancelled"]

ACTIVE_STATUSES = {"requested", "incoming", "paired", "syncing"}
PEER_STATUSES = {"paired", "syncing"}
REQUEST_TIMEOUT_S = 120.0
STALL_TIMEOUT_S = 120.0
HTTP_TIMEOUT_S = 5.0
TRANSFER_TIMEOUT_S = 60.0
COPY_CHUNK_BYTES = 1024 * 1024
FINGERPRINT_SAMPLE_BYTES = 64 * 1024


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


_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
_lock = threading.Lock()
_session: Optional[_Session] = None
_fingerprint_lock = threading.Lock()
_fingerprints: dict[tuple[str, int, int], str] = {}


def _peer_url(session: _Session, path: str) -> str:
    return f"http://{session.peer.host}:{session.port}{path}"


def _request_json(
    session: _Session,
    method: str,
    path: str,
    payload: Optional[dict] = None,
    timeout: float = HTTP_TIMEOUT_S,
) -> Any:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        _peer_url(session, path),
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if data is not None else {},
    )
    try:
        with _opener.open(request, timeout=timeout) as response:
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


def _require(session_id: str, statuses: set[str], host: str) -> _Session:
    if _session is None or _session.id != session_id or _session.peer.host != host:
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
            "/peer/incoming",
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
        session.status = "paired"

    try:
        _request_json(session, "POST", f"/peer/sessions/{session.id}/accepted", {})
    except SyncError:
        with _lock:
            if _session is session and session.status == "paired":
                session.status = "incoming"
        raise

    with _lock:
        return session.info()


def on_accepted(session_id: str, host: str) -> None:
    with _lock:
        _require(session_id, {"requested"}, host).status = "paired"


def start() -> SyncSessionInfo:
    with _lock:
        if _session is None or _session.status != "paired":
            raise SyncError(409, "No device is paired")
        session = _session

    _request_json(session, "POST", f"/peer/sessions/{session.id}/start", {})

    with _lock:
        if _session is session and session.status == "paired":
            _start_syncing(session)
        return session.info()


def on_start(session_id: str, host: str) -> None:
    with _lock:
        session = _require(session_id, PEER_STATUSES, host)
        if session.status == "paired":
            _start_syncing(session)


def decline() -> None:
    with _lock:
        if _session is None or _session.status != "incoming":
            raise SyncError(409, "There is no sync request to decline")
        session = _session
        session.status = "declined"
    _notify(session, f"/peer/sessions/{session.id}/declined")


def on_declined(session_id: str, host: str) -> None:
    with _lock:
        _require(session_id, {"requested"}, host).status = "declined"


def cancel() -> None:
    with _lock:
        if _session is None or _session.status not in ("requested", "paired", "syncing"):
            raise SyncError(409, "There is no sync to cancel")
        session = _session
        session.status = "cancelled"
    _notify(session, f"/peer/sessions/{session.id}/cancelled")


def on_cancelled(session_id: str, host: str) -> None:
    with _lock:
        session = _require(session_id, ACTIVE_STATUSES, host)
        session.status = "cancelled"
        session.error = f"The sync was stopped on {session.peer.name}"


def on_progress(session_id: str, host: str, progress: SyncProgress) -> None:
    with _lock:
        session = _require(session_id, ACTIVE_STATUSES, host)
        session.remote = progress
        session.remote_updated_at = time.monotonic()
        _maybe_finish(session)


def dismiss() -> None:
    global _session
    with _lock:
        if _is_active(_session):
            raise SyncError(409, "The sync is still running")
        _session = None


def _fingerprint(path: Path) -> Optional[str]:
    try:
        stats = path.stat()
        key = (path.name, stats.st_size, stats.st_mtime_ns)
        with _fingerprint_lock:
            cached = _fingerprints.get(key)
        if cached is not None:
            return cached

        digest = hashlib.sha1(str(stats.st_size).encode("ascii"))
        with open(path, "rb") as handle:
            head_length = id3_tag_length(handle.read(10)) + FINGERPRINT_SAMPLE_BYTES
            handle.seek(0)
            digest.update(handle.read(head_length))
            handle.seek(max(head_length, stats.st_size - FINGERPRINT_SAMPLE_BYTES))
            digest.update(handle.read())
    except OSError:
        return None

    fingerprint = digest.hexdigest()
    with _fingerprint_lock:
        _fingerprints[key] = fingerprint
    return fingerprint


def _local_manifest() -> list[SyncManifestEntry]:
    infos = {info.filename: info for info in list_mp3_infos()}
    entries: list[SyncManifestEntry] = []
    for path in list_mp3_filepaths():
        try:
            size = path.stat().st_size
        except OSError:
            continue
        info = infos.get(path.name)
        entries.append(
            SyncManifestEntry(
                filename=path.name,
                size=size,
                fingerprint=_fingerprint(path),
                title=info.title if info else None,
                artist=info.artist if info else None,
                album=info.album if info else None,
                has_cover=info.has_cover if info else False,
            )
        )
    return entries


def manifest(session_id: str, host: str) -> list[SyncManifestEntry]:
    with _lock:
        _require(session_id, PEER_STATUSES, host)
    return _local_manifest()


def _is_safe_filename(name: Any) -> bool:
    return (
        isinstance(name, str)
        and Path(name).name == name
        and not name.startswith(".")
        and name.lower().endswith(".mp3")
    )


def peer_file(session_id: str, host: str, filename: str) -> Path:
    with _lock:
        _require(session_id, PEER_STATUSES, host)
    path = OUTPUT_DIR / filename
    if not _is_safe_filename(filename) or not path.is_file():
        raise SyncError(404, "MP3 file not found")
    return path


def _remote_manifest(session: _Session) -> dict[str, dict]:
    entries = _request_json(
        session,
        "GET",
        f"/peer/sessions/{session.id}/manifest",
        timeout=TRANSFER_TIMEOUT_S,
    )
    if not isinstance(entries, list):
        return {}
    return {
        entry["filename"]: entry
        for entry in entries
        if isinstance(entry, dict) and _is_safe_filename(entry.get("filename"))
    }


def _local_entries() -> dict[str, dict]:
    return {entry.filename: entry.model_dump() for entry in _local_manifest()}


def _differs(local: dict, remote: dict) -> bool:
    if local.get("size") != remote.get("size"):
        return True
    remote_fingerprint = remote.get("fingerprint")
    return remote_fingerprint is not None and remote_fingerprint != local.get("fingerprint")


def _plan_pulls(local: dict[str, dict], remote: dict[str, dict], overwrite: bool) -> list[tuple[dict, bool]]:
    pulls: list[tuple[dict, bool]] = []
    for filename, entry in remote.items():
        current = local.get(filename)
        if current is None:
            pulls.append((entry, False))
        elif overwrite and _differs(current, entry):
            pulls.append((entry, True))
    return pulls


def _text(value: Any) -> Optional[str]:
    return value if isinstance(value, str) else None


def _diff_track(entry: dict, replaces: bool = False) -> SyncDiffTrack:
    return SyncDiffTrack(
        filename=entry["filename"],
        title=_text(entry.get("title")),
        artist=_text(entry.get("artist")),
        album=_text(entry.get("album")),
        has_cover=entry.get("has_cover") is True,
        replaces=replaces,
    )


def _diff_sort_key(track: SyncDiffTrack) -> tuple[str, str]:
    return (track.artist or "").casefold(), (track.title or track.filename).casefold()


def diff() -> SyncDiff:
    with _lock:
        if _session is None or _session.status != "paired":
            raise SyncError(409, "No device is paired")
        session = _session

    remote = _remote_manifest(session)
    local = _local_entries()
    incoming = _plan_pulls(local, remote, session.direction == "outgoing")
    outgoing = _plan_pulls(remote, local, session.direction == "incoming")
    moving = {entry["filename"] for entry, _ in incoming + outgoing}

    return SyncDiff(
        incoming=sorted((_diff_track(entry, replaces) for entry, replaces in incoming), key=_diff_sort_key),
        both=sorted(
            (_diff_track(entry) for filename, entry in local.items() if filename in remote and filename not in moving),
            key=_diff_sort_key,
        ),
        outgoing=sorted((_diff_track(entry, replaces) for entry, replaces in outgoing), key=_diff_sort_key),
    )


def peer_cover(filename: str, size: Optional[str]) -> tuple[bytes, str]:
    if not _is_safe_filename(filename):
        raise SyncError(404, "No cover image found")
    with _lock:
        if not _is_active(_session):
            raise SyncError(404, "No cover image found")
        session = _session

    query = f"?size={urllib.parse.quote(size)}" if size else ""
    url = _peer_url(session, f"/peer/sessions/{session.id}/covers/{urllib.parse.quote(filename)}{query}")
    try:
        with _opener.open(url, timeout=HTTP_TIMEOUT_S) as response:
            return response.read(), response.headers.get_content_type()
    except (urllib.error.URLError, OSError) as exc:
        raise SyncError(404, "No cover image found") from exc


def _still_syncing(session: _Session) -> bool:
    with _lock:
        return _session is session and session.status == "syncing"


def _fail(session: _Session, message: str) -> None:
    with _lock:
        if _session is session and session.status == "syncing":
            session.status = "failed"
            session.error = message
    _notify(session, f"/peer/sessions/{session.id}/cancelled")


def _report(session: _Session) -> bool:
    with _lock:
        payload = session.local.model_dump()
    try:
        _request_json(session, "POST", f"/peer/sessions/{session.id}/progress", payload)
    except SyncError as exc:
        _fail(session, exc.detail)
        return False
    return True


def _download(session: _Session, filename: str, overwrite: bool) -> bool:
    destination = OUTPUT_DIR / filename
    if destination.exists() and not overwrite:
        return True
    partial = OUTPUT_DIR / f".{filename}.part"
    url = _peer_url(session, f"/peer/sessions/{session.id}/files/{urllib.parse.quote(filename)}")
    try:
        with _opener.open(url, timeout=TRANSFER_TIMEOUT_S) as response, open(partial, "wb") as handle:
            shutil.copyfileobj(response, handle, COPY_CHUNK_BYTES)
        if destination.exists() and not overwrite:
            partial.unlink(missing_ok=True)
        else:
            os.replace(partial, destination)
        return True
    except (urllib.error.URLError, OSError):
        partial.unlink(missing_ok=True)
        return False


def _pull_worker(session: _Session) -> None:
    try:
        remote = _remote_manifest(session)
    except SyncError as exc:
        _fail(session, exc.detail)
        return

    pulls = [
        (entry["filename"], overwrite)
        for entry, overwrite in _plan_pulls(_local_entries(), remote, session.direction == "outgoing")
    ]

    with _lock:
        session.local.total = len(pulls)
    if not _report(session):
        return

    try:
        for filename, overwrite in pulls:
            if not _still_syncing(session):
                return
            succeeded = _download(session, filename, overwrite)
            with _lock:
                if succeeded:
                    session.local.done += 1
                else:
                    session.local.failed += 1
            if not _report(session):
                return
    finally:
        if pulls:
            invalidate_library_cache()

    with _lock:
        session.local.finished = True
        _maybe_finish(session)
    _report(session)
