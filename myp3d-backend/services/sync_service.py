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

from pydantic import ValidationError

from models.schemas import (
    SyncDatabase,
    SyncDiff,
    SyncDiffRecord,
    SyncDiffTrack,
    SyncManifestEntry,
    SyncPeer,
    SyncProgress,
    SyncSessionInfo,
)
from services import database_sync, favorite_playlist, favorite_service, playlist_service
from services.audio_fingerprint import audio_bounds, audio_fingerprint, id3_tag_length, splice_audio
from services.database_sync import RecordKind, RecordPull
from services.config import API_PORT, OUTPUT_DIR
from services.device_service import get_device
from services.discovery_service import discovery
from services.mp3_service import invalidate_library_cache, list_mp3_filepaths, list_mp3_infos

SyncStatusName = Literal["requested", "incoming", "paired", "syncing", "done", "declined", "failed", "cancelled"]
PullKind = Literal["new", "update"]
AudioSwap = Literal["theirs", "splice"]

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


@dataclass
class _Pull:
    entry: dict
    kind: PullKind
    source: Optional[str]
    target: str
    retag: bool = False
    swap: Optional[AudioSwap] = None
    same_audio: bool = True


@dataclass
class _Plan:
    pulls: list[_Pull]
    filenames: dict[str, str]
    pairs: dict[str, str]

    def renames(self) -> dict[str, str]:
        return {
            pull.source: pull.target
            for pull in self.pulls
            if pull.kind == "update" and pull.source is not None and pull.source != pull.target
        }


_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
_lock = threading.Lock()
_session: Optional[_Session] = None
_fingerprint_lock = threading.Lock()
_fingerprints: dict[tuple[str, str, int, int], str] = {}


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


def _file_digest(handle, size: int) -> str:
    digest = hashlib.sha1(str(size).encode("ascii"))
    head_length = id3_tag_length(handle.read(10)) + FINGERPRINT_SAMPLE_BYTES
    handle.seek(0)
    digest.update(handle.read(head_length))
    handle.seek(max(head_length, size - FINGERPRINT_SAMPLE_BYTES))
    digest.update(handle.read())
    return digest.hexdigest()


def _tag_digest(handle, size: int) -> str:
    start, end = audio_bounds(handle, size)
    handle.seek(0)
    digest = hashlib.sha1(handle.read(start))
    handle.seek(end)
    digest.update(handle.read())
    return digest.hexdigest()


def _cached_digest(path: Path, kind: str, compute) -> Optional[str]:
    try:
        stats = path.stat()
        key = (kind, path.name, stats.st_size, stats.st_mtime_ns)
        with _fingerprint_lock:
            cached = _fingerprints.get(key)
        if cached is not None:
            return cached
        with open(path, "rb") as handle:
            fingerprint = compute(handle, stats.st_size)
    except OSError:
        return None

    with _fingerprint_lock:
        _fingerprints[key] = fingerprint
    return fingerprint


def _fingerprint(path: Path) -> Optional[str]:
    return _cached_digest(path, "file", _file_digest)


def _tag_fingerprint(path: Path) -> Optional[str]:
    return _cached_digest(path, "tags", _tag_digest)


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
                audio_fingerprint=audio_fingerprint(path),
                tag_fingerprint=_tag_fingerprint(path),
                duration=info.duration if info else None,
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


def database(session_id: str, host: str) -> SyncDatabase:
    with _lock:
        _require(session_id, PEER_STATUSES, host)
    return database_sync.local_database()


def record_cover(session_id: str, host: str, kind: str, key: str) -> bytes:
    with _lock:
        _require(session_id, PEER_STATUSES, host)
    cover = database_sync.local_cover(kind, key) if kind in ("playlist", "download") else None
    if cover is None:
        raise SyncError(404, "No cover image found")
    return cover


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


def peer_tags(session_id: str, host: str, filename: str) -> tuple[bytes, bytes]:
    path = peer_file(session_id, host, filename)
    try:
        with open(path, "rb") as handle:
            size = os.fstat(handle.fileno()).st_size
            start, end = audio_bounds(handle, size)
            handle.seek(0)
            head = handle.read(start)
            handle.seek(end)
            return head, handle.read()
    except OSError as exc:
        raise SyncError(404, "MP3 file not found") from exc


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


def _remote_database(session: _Session) -> SyncDatabase:
    try:
        payload = _request_json(session, "GET", f"/peer/sessions/{session.id}/database", timeout=TRANSFER_TIMEOUT_S)
    except SyncError as exc:
        if exc.status_code == 404:
            raise SyncError(409, f"Update myp3d on {session.peer.name} to sync playlists and downloads") from exc
        raise
    try:
        return SyncDatabase.model_validate(payload)
    except ValidationError as exc:
        raise SyncError(502, f"{session.peer.name} sent playlists or downloads that couldn't be read") from exc


def _fetch_record_cover(session: _Session, kind: RecordKind, key: str) -> bytes:
    url = _peer_url(session, f"/peer/sessions/{session.id}/records/{kind}/{urllib.parse.quote(key)}/cover")
    with _opener.open(url, timeout=TRANSFER_TIMEOUT_S) as response:
        return response.read()


def _local_entries() -> dict[str, dict]:
    return {entry.filename: entry.model_dump() for entry in _local_manifest()}


def _differs(local: dict, remote: dict) -> bool:
    if local.get("size") != remote.get("size"):
        return True
    remote_fingerprint = remote.get("fingerprint")
    return remote_fingerprint is not None and remote_fingerprint != local.get("fingerprint")


def _audio(entry: dict) -> Optional[str]:
    fingerprint = entry.get("audio_fingerprint")
    return fingerprint if isinstance(fingerprint, str) and fingerprint else None


def _field(entry: dict, name: str) -> str:
    value = entry.get(name)
    return value.strip().casefold() if isinstance(value, str) else ""


def _song_key(filename: str, entry: dict) -> Optional[tuple]:
    title, artist = _field(entry, "title"), _field(entry, "artist")
    if not title or not artist or not isinstance(entry.get("duration"), (int, float)):
        return None
    return filename.casefold(), title, artist, _field(entry, "album"), entry.get("has_cover") is True


def _swap(local: dict, remote: dict, prefer_remote: bool) -> Optional[AudioSwap]:
    ours, theirs = local["duration"], remote["duration"]
    if theirs < ours or (theirs == ours and prefer_remote):
        return "theirs" if prefer_remote else "splice"
    return None


def _pair(local: dict[str, dict], remote: dict[str, dict]) -> tuple[dict[str, str], set[str]]:
    groups: dict[str, tuple[list[str], list[str]]] = {}
    for filename, entry in local.items():
        fingerprint = _audio(entry)
        if fingerprint is not None:
            groups.setdefault(fingerprint, ([], []))[0].append(filename)
    for filename, entry in remote.items():
        fingerprint = _audio(entry)
        if fingerprint in groups:
            groups[fingerprint][1].append(filename)

    pairs: dict[str, str] = {}
    for mine, theirs in groups.values():
        same = set(mine) & set(theirs)
        pairs.update((filename, filename) for filename in same)
        pairs.update(
            zip(
                sorted(filename for filename in mine if filename not in same),
                sorted(filename for filename in theirs if filename not in same),
            )
        )

    unpaired: dict[tuple, str] = {}
    for filename in sorted(local):
        key = _song_key(filename, local[filename]) if filename not in pairs else None
        if key is not None:
            unpaired.setdefault(key, filename)
    paired_remote = set(pairs.values())
    retracked: set[str] = set()
    for filename in sorted(remote):
        key = _song_key(filename, remote[filename]) if filename not in paired_remote else None
        mine = unpaired.pop(key, None) if key is not None else None
        if mine is not None:
            pairs[mine] = filename
            retracked.add(mine)
    return pairs, retracked


def _free_name(filename: str, taken: set[str]) -> str:
    if filename.casefold() not in taken:
        return filename
    path = Path(filename)
    counter = 2
    while f"{path.stem} ({counter}){path.suffix}".casefold() in taken:
        counter += 1
    return f"{path.stem} ({counter}){path.suffix}"


def _plan_pulls(local: dict[str, dict], remote: dict[str, dict], prefer_remote: bool) -> _Plan:
    pairs, retracked = _pair(local, remote)
    by_remote = {theirs: mine for mine, theirs in pairs.items()}
    taken = {filename.casefold() for filename in local}
    pulls: list[_Pull] = []
    filenames: dict[str, str] = {}

    for filename in sorted(by_remote):
        entry = remote[filename]
        mine = by_remote[filename]
        filenames[filename] = mine
        same_audio = mine not in retracked
        swap = None if same_audio else _swap(local[mine], entry, prefer_remote)
        if not prefer_remote:
            if swap is not None:
                pulls.append(_Pull(entry, "update", mine, mine, swap=swap, same_audio=False))
            continue
        if swap is not None:
            retag = False
        elif same_audio:
            retag = _differs(local[mine], entry)
        else:
            retag = entry.get("tag_fingerprint") != local[mine].get("tag_fingerprint")
        target = mine
        if filename != mine and (filename.casefold() == mine.casefold() or filename.casefold() not in taken):
            target = filename
            taken.add(target.casefold())
        if swap is not None or retag or target != mine:
            pulls.append(_Pull(entry, "update", mine, target, retag, swap, same_audio))
            filenames[filename] = target

    for filename in sorted(set(remote) - set(by_remote)):
        target = _free_name(filename, taken)
        taken.add(target.casefold())
        pulls.append(_Pull(remote[filename], "new", None, target))
        filenames[filename] = target

    return _Plan(pulls, filenames, pairs)


def _record_pulls(
    plan: _Plan,
    local_database: SyncDatabase,
    remote_database: SyncDatabase,
    prefer_remote: bool,
    busy: set[str] = frozenset(),
) -> list[RecordPull]:
    return database_sync.plan_pulls(
        database_sync.translate(local_database, plan.renames()),
        database_sync.translate(remote_database, plan.filenames),
        prefer_remote,
        busy,
    )


def _text(value: Any) -> Optional[str]:
    return value if isinstance(value, str) else None


def _diff_track(entry: dict, pull: Optional[_Pull] = None) -> SyncDiffTrack:
    return SyncDiffTrack(
        filename=entry["filename"],
        title=_text(entry.get("title")),
        artist=_text(entry.get("artist")),
        album=_text(entry.get("album")),
        has_cover=entry.get("has_cover") is True,
        updates=pull is not None and pull.kind == "update" and pull.swap is None,
        audio=pull is not None and pull.swap is not None,
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
    incoming_moving = {pull.entry["filename"] for pull in incoming.pulls}
    outgoing_moving = {pull.entry["filename"] for pull in outgoing.pulls}

    remote_database = _remote_database(session)
    local_database = database_sync.local_database()
    incoming_records = _record_pulls(
        incoming, local_database, remote_database, session.direction == "outgoing", database_sync.busy_downloads()
    )
    outgoing_records = _record_pulls(outgoing, remote_database, local_database, session.direction == "incoming")
    moving_records = {(pull.kind, pull.key) for pull in incoming_records + outgoing_records}

    def visible(pulls: list[RecordPull]) -> list[SyncDiffRecord]:
        return sorted(
            (database_sync.diff_record(pull.kind, pull.record, pull.replaces) for pull in pulls if database_sync.is_visible(pull)),
            key=lambda record: (record.kind, record.name.casefold()),
        )

    return SyncDiff(
        incoming=sorted((_diff_track(pull.entry, pull) for pull in incoming.pulls), key=_diff_sort_key),
        both=sorted(
            (
                _diff_track(local[mine])
                for mine, theirs in incoming.pairs.items()
                if mine not in outgoing_moving and theirs not in incoming_moving
            ),
            key=_diff_sort_key,
        ),
        outgoing=sorted((_diff_track(pull.entry, pull) for pull in outgoing.pulls), key=_diff_sort_key),
        incoming_records=visible(incoming_records),
        both_records=sorted(
            database_sync.shared_records(local_database, remote_database, moving_records),
            key=lambda record: (record.kind, record.name.casefold()),
        ),
        outgoing_records=visible(outgoing_records),
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


def _download(session: _Session, filename: str, target: str, overwrite: bool) -> bool:
    destination = OUTPUT_DIR / target
    if destination.exists() and not overwrite:
        return True
    partial = OUTPUT_DIR / f".{target}.part"
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


def _fetch_tags(session: _Session, filename: str) -> tuple[bytes, bytes]:
    url = _peer_url(session, f"/peer/sessions/{session.id}/tags/{urllib.parse.quote(filename)}")
    with _opener.open(url, timeout=TRANSFER_TIMEOUT_S) as response:
        body = response.read()
        head_length = int(response.headers.get("X-Head-Length", ""))
    if not 0 <= head_length <= len(body):
        raise ValueError("The tags didn't arrive intact")
    return body[:head_length], body[head_length:]


def _copy_range(source, destination, length: int) -> None:
    while length > 0:
        chunk = source.read(min(COPY_CHUNK_BYTES, length))
        if not chunk:
            raise OSError("The file ended early")
        destination.write(chunk)
        length -= len(chunk)


def _retag(session: _Session, pull: _Pull, source: str) -> bool:
    path = OUTPUT_DIR / source
    partial = OUTPUT_DIR / f".{source}.tags.part"
    try:
        try:
            head, trailer = _fetch_tags(session, pull.entry["filename"])
        except ValueError:
            return pull.same_audio and _download(session, pull.entry["filename"], source, True)
        with open(path, "rb") as original, open(partial, "wb") as handle:
            start, end = audio_bounds(original, os.fstat(original.fileno()).st_size)
            handle.write(head)
            original.seek(start)
            _copy_range(original, handle, end - start)
            handle.write(trailer)
        if not pull.same_audio:
            if _tag_fingerprint(partial) != pull.entry.get("tag_fingerprint"):
                return False
        elif partial.stat().st_size != pull.entry.get("size") or _fingerprint(partial) != pull.entry.get("fingerprint"):
            return _download(session, pull.entry["filename"], source, True)
        shutil.copyfile(partial, path)
        return True
    except (urllib.error.URLError, OSError):
        return False
    finally:
        partial.unlink(missing_ok=True)


def _swap_audio(session: _Session, pull: _Pull, source: str) -> bool:
    path = OUTPUT_DIR / source
    download = OUTPUT_DIR / f".{source}.audio.part"
    joined = OUTPUT_DIR / f".{source}.joined.part"
    url = _peer_url(session, f"/peer/sessions/{session.id}/files/{urllib.parse.quote(pull.entry['filename'])}")
    try:
        with _opener.open(url, timeout=TRANSFER_TIMEOUT_S) as response, open(download, "wb") as handle:
            shutil.copyfileobj(response, handle, COPY_CHUNK_BYTES)
        if audio_fingerprint(download) != _audio(pull.entry):
            return False
        if pull.swap == "splice":
            splice_audio(path, download, joined)
            shutil.copyfile(joined, path)
        else:
            shutil.copyfile(download, path)
        return True
    except (urllib.error.URLError, OSError):
        return False
    finally:
        download.unlink(missing_ok=True)
        joined.unlink(missing_ok=True)


def _rename(source: str, target: str) -> bool:
    try:
        (OUTPUT_DIR / source).rename(OUTPUT_DIR / target)
    except OSError:
        return False
    playlist_service.rename_track(source, target)
    favorite_service.rename_track(source, target)
    return True


def _apply_pull(session: _Session, pull: _Pull) -> bool:
    if pull.kind == "new":
        return _download(session, pull.entry["filename"], pull.target, False)
    source = pull.source or pull.target
    if pull.swap is not None and not _swap_audio(session, pull, source):
        return False
    if pull.retag and not _retag(session, pull, source):
        return False
    return source == pull.target or _rename(source, pull.target)


def _apply_records(session: _Session, pulls: list[RecordPull]) -> bool:
    local_database = database_sync.local_database()
    for pull in pulls:
        if not _still_syncing(session):
            return False
        try:
            database_sync.apply_pull(pull, local_database, lambda kind, key: _fetch_record_cover(session, kind, key))
            succeeded = True
        except Exception:
            succeeded = False
        with _lock:
            if succeeded:
                session.local.done += 1
            else:
                session.local.failed += 1
        if not _report(session):
            return False
    return True


def _pull_worker(session: _Session) -> None:
    try:
        remote = _remote_manifest(session)
        remote_database = _remote_database(session)
    except SyncError as exc:
        _fail(session, exc.detail)
        return

    plan = _plan_pulls(_local_entries(), remote, session.direction == "outgoing")
    pulls = plan.pulls
    record_pulls = _record_pulls(
        plan,
        database_sync.local_database(),
        remote_database,
        session.direction == "outgoing",
        database_sync.busy_downloads(),
    )

    with _lock:
        session.local.total = len(pulls) + len(record_pulls)
    if not _report(session):
        return

    try:
        for pull in pulls:
            if not _still_syncing(session):
                return
            succeeded = _apply_pull(session, pull)
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

    applied = _apply_records(session, record_pulls)
    if record_pulls:
        favorite_playlist.ensure()
    if not applied:
        return

    with _lock:
        session.local.finished = True
        _maybe_finish(session)
    _report(session)
