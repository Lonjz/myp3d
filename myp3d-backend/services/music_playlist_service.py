import json
import os
import tempfile
import threading
import unicodedata
from collections import Counter
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

from models.schemas import BulkFailure, MusicPlaylistDiff, MusicPlaylistEntry, MusicPlaylistSyncInfo
from services import favorite_playlist, playlist_service
from services.db import connect as _connect
from services.mp3_service import list_mp3_filepaths, make_square_cover
from services.music_service import (
    FIELD_SEP,
    RECORD_SEP,
    TRACK_TIMEOUT_S,
    MusicError,
    is_available,
    song_links,
    parse_art_state,
    require_folder,
    run_script,
)
from services.playlist_service import PlaylistState

ActionName = Literal["import", "export", "pull", "push", "merge", "link", "delete_local", "delete_music", "in_sync"]
SyncStatusName = Literal["syncing", "done", "failed"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS apple_playlist_links (
    playlist_id TEXT PRIMARY KEY,
    persistent_id TEXT NOT NULL UNIQUE,
    snapshot TEXT NOT NULL,
    synced_at TEXT NOT NULL
)
"""

MUSIC_KEY_PREFIX = "music:"
PLAYLIST_TIMEOUT_S = 300.0


@dataclass
class ApplePlaylist:
    persistent_id: str
    name: str
    description: str
    track_ids: list[str]


@dataclass
class Snapshot:
    name: str = ""
    description: str = ""
    local: list[str] = field(default_factory=list)
    apple: list[str] = field(default_factory=list)
    cover: Optional[str] = None


@dataclass
class Plan:
    key: str
    action: ActionName
    name: str
    description: str = ""
    playlist_id: Optional[str] = None
    persistent_id: Optional[str] = None
    local: list[str] = field(default_factory=list)
    apple: list[str] = field(default_factory=list)
    keep: list[str] = field(default_factory=list)
    write_local: bool = False
    write_apple: bool = False
    push_cover: bool = False
    left_out: int = 0
    has_cover: bool = False
    updated_at: Optional[str] = None
    refreshed: Optional[Snapshot] = None


@dataclass
class _SyncJob:
    status: SyncStatusName
    total: int
    created: int = 0
    updated: int = 0
    deleted: int = 0
    failed: list[BulkFailure] = field(default_factory=list)
    without_art: list[BulkFailure] = field(default_factory=list)
    error: Optional[str] = None

    def info(self) -> MusicPlaylistSyncInfo:
        return MusicPlaylistSyncInfo(
            status=self.status,
            total=self.total,
            created=self.created,
            updated=self.updated,
            deleted=self.deleted,
            failed=list(self.failed),
            without_art=list(self.without_art),
            error=self.error,
        )


_sync_lock = threading.Lock()
_sync: Optional[_SyncJob] = None


def init() -> None:
    with _connect() as conn:
        conn.execute(SCHEMA)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize(value: str) -> str:
    return " ".join(unicodedata.normalize("NFC", value).casefold().split())


def _read_links() -> dict[str, tuple[str, Snapshot]]:
    with _connect() as conn:
        rows = conn.execute("SELECT playlist_id, persistent_id, snapshot FROM apple_playlist_links").fetchall()
    return {row["playlist_id"]: (row["persistent_id"], Snapshot(**json.loads(row["snapshot"]))) for row in rows}


def _save_link(playlist_id: str, persistent_id: str, snapshot: Snapshot) -> None:
    with _connect() as conn:
        conn.execute("DELETE FROM apple_playlist_links WHERE persistent_id = ? AND playlist_id != ?", (persistent_id, playlist_id))
        conn.execute(
            "INSERT INTO apple_playlist_links (playlist_id, persistent_id, snapshot, synced_at) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(playlist_id) DO UPDATE SET persistent_id = excluded.persistent_id, "
            "snapshot = excluded.snapshot, synced_at = excluded.synced_at",
            (playlist_id, persistent_id, json.dumps(asdict(snapshot)), _now()),
        )


def _drop_link(playlist_id: str) -> None:
    with _connect() as conn:
        conn.execute("DELETE FROM apple_playlist_links WHERE playlist_id = ?", (playlist_id,))


def _read_playlists() -> list[ApplePlaylist]:
    output = run_script("export_playlists", timeout=PLAYLIST_TIMEOUT_S)
    playlists: list[ApplePlaylist] = []
    for record in output.split(RECORD_SEP) if output else []:
        fields = record.split(FIELD_SEP)
        if len(fields) < 3 or not fields[0]:
            continue
        playlists.append(
            ApplePlaylist(
                persistent_id=fields[0],
                name=fields[1],
                description=fields[2].strip(),
                track_ids=[value for value in fields[3:] if value],
            )
        )
    return playlists


def _take(order: list[str], counts: Counter) -> list[str]:
    taken: list[str] = []
    for filename in order:
        if counts[filename] > 0:
            counts[filename] -= 1
            taken.append(filename)
    return taken


def _merge(local: list[str], apple: list[str], snapshot: Snapshot) -> list[str]:
    local_changed = local != snapshot.local
    apple_changed = apple != snapshot.apple
    if not apple_changed:
        return local
    local_counts, apple_counts, base_counts = Counter(local), Counter(apple), Counter(snapshot.apple)
    if not local_changed:
        extra = Counter({filename: count - max(apple_counts[filename], base_counts[filename]) for filename, count in local_counts.items()})
        return apple + _take(local, +extra)
    removed = base_counts - apple_counts
    kept = [filename for filename in local if not _take([filename], removed)]
    added = (apple_counts - base_counts) - (local_counts - Counter(snapshot.local))
    return kept + _take(apple, added)


def _merged_text(local: str, apple: str, base: str) -> str:
    if local != base:
        return local
    if apple != base:
        return apple
    return local


def plan_sync(
    apple_playlists: list[ApplePlaylist],
    states: list[PlaylistState],
    links: dict[str, tuple[str, Snapshot]],
    file_of: dict[str, str],
    library: set[str],
) -> list[Plan]:
    pid_of: dict[str, str] = {}
    for persistent_id, filename in file_of.items():
        pid_of.setdefault(filename, persistent_id)
    mappable = set(pid_of)

    def mapped(track_ids: list[str]) -> tuple[list[str], list[str]]:
        files = [file_of[track_id] for track_id in track_ids if track_id in file_of]
        keep = [track_id for track_id in track_ids if track_id not in file_of]
        return files, keep

    def desired(filenames: list[str]) -> list[str]:
        return [filename for filename in filenames if filename in mappable]

    def local_only(filenames: list[str]) -> int:
        return sum(1 for filename in filenames if filename not in mappable and filename in library)

    apple_by_id = {playlist.persistent_id: playlist for playlist in apple_playlists}
    linked_ids = {persistent_id for persistent_id, _ in links.values()}
    unlinked_apple: dict[str, list[ApplePlaylist]] = {}
    for playlist in apple_playlists:
        if playlist.persistent_id not in linked_ids:
            unlinked_apple.setdefault(_normalize(playlist.name), []).append(playlist)

    plans: list[Plan] = []

    def paired_plan(state: PlaylistState, apple: ApplePlaylist, snapshot: Optional[Snapshot]) -> Plan:
        base = snapshot or Snapshot()
        apple_files, keep = mapped(apple.track_ids)
        result = _merge(state.filenames, apple_files, base)
        name = _merged_text(state.name, apple.name, base.name)
        description = _merged_text(state.description, apple.description, base.description)
        target = desired(result)
        push_cover = state.cover_hash is not None and state.cover_hash != base.cover
        write_local = result != state.filenames or name != state.name or description != state.description
        write_apple = target != apple_files or name != apple.name or description != apple.description or push_cover
        if write_local and write_apple:
            action: ActionName = "merge"
        elif write_local:
            action = "pull"
        elif write_apple:
            action = "push"
        else:
            action = "in_sync" if snapshot is not None else "link"
        current = Snapshot(name=name, description=description, local=result, apple=target, cover=state.cover_hash)
        refreshed = current if action == "in_sync" and current != snapshot else None
        return Plan(
            key=state.id,
            action=action,
            name=name,
            description=description,
            playlist_id=state.id,
            persistent_id=apple.persistent_id,
            local=result,
            apple=target,
            keep=keep,
            write_local=write_local,
            write_apple=write_apple,
            push_cover=push_cover,
            left_out=len(keep) + local_only(result),
            has_cover=state.cover_hash is not None,
            updated_at=state.updated_at,
            refreshed=refreshed,
        )

    for state in states:
        link = links.get(state.id)
        if link is not None:
            persistent_id, snapshot = link
            apple = apple_by_id.get(persistent_id)
            if state.deleted_at is not None:
                if apple is not None:
                    plans.append(Plan(key=state.id, action="delete_music", name=apple.name, playlist_id=state.id, persistent_id=persistent_id))
            elif apple is None:
                plans.append(
                    Plan(
                        key=state.id,
                        action="delete_local",
                        name=state.name,
                        playlist_id=state.id,
                        persistent_id=persistent_id,
                        local=state.filenames,
                        has_cover=state.cover_hash is not None,
                        updated_at=state.updated_at,
                    )
                )
            else:
                plans.append(paired_plan(state, apple, snapshot))
            continue

        if state.deleted_at is not None:
            continue
        candidates = unlinked_apple.get(_normalize(state.name))
        if candidates:
            plans.append(paired_plan(state, candidates.pop(0), None))
            continue
        plans.append(
            Plan(
                key=state.id,
                action="export",
                name=state.name,
                description=state.description,
                playlist_id=state.id,
                local=state.filenames,
                apple=desired(state.filenames),
                write_apple=True,
                push_cover=state.cover_hash is not None,
                left_out=local_only(state.filenames),
                has_cover=state.cover_hash is not None,
                updated_at=state.updated_at,
            )
        )

    for candidates in unlinked_apple.values():
        for apple in candidates:
            apple_files, keep = mapped(apple.track_ids)
            plans.append(
                Plan(
                    key=f"{MUSIC_KEY_PREFIX}{apple.persistent_id}",
                    action="import",
                    name=apple.name,
                    description=apple.description,
                    persistent_id=apple.persistent_id,
                    local=apple_files,
                    apple=apple_files,
                    keep=keep,
                    write_local=True,
                    left_out=len(keep),
                )
            )

    return sorted(plans, key=lambda plan: (_normalize(plan.name), plan.key))


def _library_names() -> set[str]:
    return {path.name for path in list_mp3_filepaths()}




def _refresh_snapshots(plans: list[Plan]) -> None:
    for plan in plans:
        if plan.refreshed is not None:
            _save_link(plan.playlist_id, plan.persistent_id, plan.refreshed)


def _to_entry(plan: Plan) -> MusicPlaylistEntry:
    return MusicPlaylistEntry(
        key=plan.key,
        name=plan.name,
        action=plan.action,
        track_count=len(plan.local),
        left_out=plan.left_out,
        playlist_id=plan.playlist_id,
        has_cover=plan.has_cover,
        updated_at=plan.updated_at,
    )


def diff(folder: str) -> MusicPlaylistDiff:
    file_of, songs_pending = song_links(require_folder(folder))
    plans = plan_sync(_read_playlists(), playlist_service.list_states(), _read_links(), file_of, _library_names())
    _refresh_snapshots(plans)
    return MusicPlaylistDiff(
        songs_pending=songs_pending,
        only_in_music=[_to_entry(plan) for plan in plans if plan.action == "import"],
        in_sync=[_to_entry(plan) for plan in plans if plan.action == "in_sync"],
        to_sync=[_to_entry(plan) for plan in plans if plan.action not in ("import", "in_sync")],
    )


def _write_cover_file(playlist_id: str) -> Optional[str]:
    cover = playlist_service.get_cover(playlist_id)
    if cover is None:
        return None
    handle, path = tempfile.mkstemp(prefix="myp3d-playlist-", suffix=".jpg")
    with os.fdopen(handle, "wb") as output:
        output.write(cover[0])
    return path


def _write_apple(plan: Plan, persistent_id: Optional[str], file_of_pid: dict[str, str]) -> tuple[str, Optional[str]]:
    art_path = _write_cover_file(plan.playlist_id) if plan.push_cover and plan.playlist_id else None
    try:
        track_ids = [file_of_pid[filename] for filename in plan.apple] + plan.keep
        result = run_script(
            "write_playlist",
            persistent_id or "",
            plan.name,
            plan.description,
            art_path or "",
            *track_ids,
            timeout=PLAYLIST_TIMEOUT_S,
        )
    finally:
        if art_path:
            Path(art_path).unlink(missing_ok=True)
    new_id, _, art_state = result.partition(FIELD_SEP)
    return new_id, parse_art_state(art_state) if art_path else None


def _import_cover(playlist_id: str, persistent_id: str) -> Optional[str]:
    handle, path = tempfile.mkstemp(prefix="myp3d-playlist-art-")
    os.close(handle)
    try:
        state = run_script("export_playlist_art", persistent_id, path, timeout=TRACK_TIMEOUT_S)
        if state != "art":
            return parse_art_state(state) if ":" in state else None
        try:
            cover, _ = make_square_cover(Path(path).read_bytes())
        except ValueError as exc:
            return str(exc)
        playlist_service.set_cover(playlist_id, cover)
        return None
    finally:
        Path(path).unlink(missing_ok=True)


def _snapshot(playlist_id: str, plan: Plan) -> Snapshot:
    state = next((item for item in playlist_service.list_states() if item.id == playlist_id), None)
    return Snapshot(
        name=plan.name,
        description=plan.description,
        local=playlist_service.stored_filenames(playlist_id),
        apple=plan.apple,
        cover=state.cover_hash if state is not None else None,
    )


def _apply(plan: Plan, file_of_pid: dict[str, str]) -> tuple[str, Optional[str]]:
    if plan.action == "import":
        detail = playlist_service.create(plan.name, plan.local, plan.description)
        art_problem = _import_cover(detail.id, plan.persistent_id)
        _save_link(detail.id, plan.persistent_id, _snapshot(detail.id, plan))
        return "created", art_problem

    if plan.action == "export":
        persistent_id, art_problem = _write_apple(plan, None, file_of_pid)
        _save_link(plan.playlist_id, persistent_id, _snapshot(plan.playlist_id, plan))
        return "created", art_problem

    if plan.action == "delete_local":
        playlist_service.delete(plan.playlist_id)
        _drop_link(plan.playlist_id)
        return "deleted", None

    if plan.action == "delete_music":
        run_script("delete_playlist", plan.persistent_id, timeout=TRACK_TIMEOUT_S)
        _drop_link(plan.playlist_id)
        return "deleted", None

    current = next(state for state in playlist_service.list_states() if state.id == plan.playlist_id)
    if plan.write_local:
        favorite_playlist.update_playlist(
            plan.playlist_id,
            plan.name if plan.name != current.name else None,
            plan.local if plan.local != current.filenames else None,
            plan.description if plan.description != current.description else None,
        )
    art_problem = None
    persistent_id = plan.persistent_id
    if plan.write_apple:
        persistent_id, art_problem = _write_apple(plan, plan.persistent_id, file_of_pid)
    _save_link(plan.playlist_id, persistent_id, _snapshot(plan.playlist_id, plan))
    return "updated", art_problem


def _finish(job: _SyncJob, status: SyncStatusName, error: Optional[str] = None) -> None:
    with _sync_lock:
        job.status = status
        job.error = error


def _run_sync(job: _SyncJob, root: Path) -> None:
    try:
        file_of, songs_pending = song_links(root)
        if songs_pending:
            _finish(job, "failed", "Sync the songs with Apple Music first")
            return
        plans = plan_sync(_read_playlists(), playlist_service.list_states(), _read_links(), file_of, _library_names())
    except Exception as exc:
        _finish(job, "failed", exc.detail if isinstance(exc, MusicError) else "Couldn't read Apple Music playlists")
        return

    pid_of: dict[str, str] = {}
    for persistent_id, filename in file_of.items():
        pid_of.setdefault(filename, persistent_id)

    _refresh_snapshots(plans)
    chosen = [plan for plan in plans if plan.action != "in_sync"]
    with _sync_lock:
        job.total = len(chosen)

    for plan in chosen:
        try:
            outcome, art_problem = _apply(plan, pid_of)
        except Exception as exc:
            detail = exc.detail if isinstance(exc, MusicError) else str(exc) or "Couldn't sync the playlist"
            with _sync_lock:
                job.failed.append(BulkFailure(filename=plan.name, detail=detail))
            continue
        with _sync_lock:
            if outcome == "created":
                job.created += 1
            elif outcome == "deleted":
                job.deleted += 1
            else:
                job.updated += 1
            if art_problem:
                job.without_art.append(BulkFailure(filename=plan.name, detail=art_problem))

    favorite_playlist.ensure()
    _finish(job, "done")


def start_sync(folder: str) -> MusicPlaylistSyncInfo:
    global _sync
    if not is_available():
        raise MusicError(501, "Apple Music sync needs macOS")
    root = require_folder(folder)
    with _sync_lock:
        if _sync is not None and _sync.status == "syncing":
            raise MusicError(409, "A playlist sync with Apple Music is already running")
        job = _SyncJob(status="syncing", total=0)
        _sync = job
    threading.Thread(target=_run_sync, args=(job, root), daemon=True).start()
    return job.info()


def get_sync() -> Optional[MusicPlaylistSyncInfo]:
    with _sync_lock:
        return _sync.info() if _sync is not None else None


def dismiss_sync() -> None:
    global _sync
    with _sync_lock:
        if _sync is not None and _sync.status == "syncing":
            raise MusicError(409, "The playlist sync with Apple Music is still running")
        _sync = None
