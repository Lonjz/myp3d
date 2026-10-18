import os
import shutil
import subprocess
import sys
import tempfile
import threading
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, Optional

from models.schemas import BulkFailure, MP3Info, MusicDiff, MusicPair, MusicSyncInfo, MusicTrack
from services.audio_fingerprint import audio_fingerprint, cover_hash, covers_match
from services.config import BASE_DIR, OUTPUT_DIR
from services.mp3_service import get_album_cover, list_mp3_infos, make_square_cover

SyncStatusName = Literal["syncing", "done", "failed"]
ChangeName = Literal["title", "artist", "album", "art"]
MatchKey = tuple[str, str]

SCRIPTS_DIR = BASE_DIR / "applescripts"
EXPORT_TIMEOUT_S = 300.0
TRACK_TIMEOUT_S = 60.0
FIELD_SEP = "\x1f"
RECORD_SEP = "\x1e"
GROUP_SEP = "\x1d"
NOT_AUTHORIZED_CODE = "-1743"
UNSAFE_CHARS = set('/:\\*?"<>|')
MAX_PART_LENGTH = 120


class MusicError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass
class _LibraryTrack:
    info: MusicTrack
    location: Optional[str] = None


@dataclass
class _Pair:
    track: MP3Info
    music: _LibraryTrack
    changes: list[ChangeName]


@dataclass
class _Match:
    pairs: list[_Pair]
    unpaired: list[MP3Info]
    loose: dict[str, Path]
    only_in_music: list[_LibraryTrack]


@dataclass
class _SyncJob:
    status: SyncStatusName
    total: int
    added: int = 0
    updated: int = 0
    failed: list[BulkFailure] = field(default_factory=list)
    without_art: list[str] = field(default_factory=list)
    error: Optional[str] = None

    def info(self) -> MusicSyncInfo:
        return MusicSyncInfo(
            status=self.status,
            total=self.total,
            added=self.added,
            updated=self.updated,
            failed=list(self.failed),
            without_art=list(self.without_art),
            error=self.error,
        )


_sync_lock = threading.Lock()
_sync: Optional[_SyncJob] = None


def is_available() -> bool:
    return sys.platform == "darwin"


def _run_script(name: str, *args: str, timeout: float = EXPORT_TIMEOUT_S) -> str:
    if not is_available():
        raise MusicError(501, "Apple Music sync needs macOS")
    try:
        result = subprocess.run(
            ["osascript", str(SCRIPTS_DIR / f"{name}.applescript"), *args],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        raise MusicError(504, "Music took too long to respond") from exc
    except OSError as exc:
        raise MusicError(502, "Couldn't run osascript") from exc
    if result.returncode != 0:
        stderr = result.stderr.strip()
        if NOT_AUTHORIZED_CODE in stderr:
            raise MusicError(
                403,
                "Allow myp3d to control Music in System Settings → Privacy & Security → Automation",
            )
        raise MusicError(502, stderr or "Music returned an error")
    return result.stdout.rstrip("\n")


def _normalize(value: Optional[str]) -> str:
    return " ".join(unicodedata.normalize("NFC", value or "").casefold().split())


def _match_key(title: Optional[str], artist: Optional[str]) -> MatchKey:
    return _normalize(title), _normalize(artist)


def _local_key(track: MP3Info) -> MatchKey:
    return _match_key(track.title or Path(track.filename).stem, track.artist)


def _path_key(path: str) -> str:
    return unicodedata.normalize("NFC", os.path.normpath(path)).casefold()


def _read_library() -> list[_LibraryTrack]:
    tracks_text, _, locations_text = _run_script("export_library").partition(GROUP_SEP)
    locations: dict[str, str] = {}
    for record in locations_text.split(RECORD_SEP) if locations_text else []:
        persistent_id, _, location = record.partition(FIELD_SEP)
        if persistent_id and location:
            locations[persistent_id] = location

    tracks: list[_LibraryTrack] = []
    for record in tracks_text.split(RECORD_SEP) if tracks_text else []:
        persistent_id, name, artist, album = (record.split(FIELD_SEP) + ["", "", ""])[:4]
        if not persistent_id:
            continue
        tracks.append(
            _LibraryTrack(
                info=MusicTrack(persistent_id=persistent_id, name=name, artist=artist or None, album=album or None),
                location=locations.get(persistent_id),
            )
        )
    return tracks


def detect_folder() -> Optional[str]:
    roots = Counter(
        str(Path(track.location).parents[2])
        for track in _read_library()
        if track.location and len(Path(track.location).parents) > 3
    )
    if not roots:
        return None
    return roots.most_common(1)[0][0]


def _is_within(path: Path, ancestor: Path) -> bool:
    return any(os.path.samefile(candidate, ancestor) for candidate in (path, *path.parents))


def _require_folder(folder: str) -> Path:
    path = Path(folder.strip()).expanduser()
    if not path.is_absolute() or not path.is_dir():
        raise MusicError(400, "That folder doesn't exist")
    resolved = path.resolve()
    downloads = OUTPUT_DIR.resolve()
    if _is_within(resolved, downloads) or _is_within(downloads, resolved):
        raise MusicError(400, "The Apple Music folder can't overlap the myp3d library")
    return resolved


def _music_file(track: _LibraryTrack) -> Optional[Path]:
    if not track.location:
        return None
    path = Path(track.location)
    return path if path.is_file() else None


def _folder_fingerprints(root: Path, skip: set[str]) -> dict[str, Path]:
    fingerprints: dict[str, Path] = {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [name for name in dirnames if not name.startswith(".")]
        for filename in filenames:
            if filename.startswith(".") or not filename.lower().endswith(".mp3"):
                continue
            path = os.path.join(dirpath, filename)
            if _path_key(path) in skip:
                continue
            fingerprint = audio_fingerprint(Path(path))
            if fingerprint is not None:
                fingerprints.setdefault(fingerprint, Path(path))
    return fingerprints


def _differs(ours: Optional[str], theirs: Optional[str]) -> bool:
    value = (ours or "").strip()
    return bool(value) and value != (theirs or "").strip()


def _changes(track: MP3Info, music: _LibraryTrack) -> list[ChangeName]:
    changes: list[ChangeName] = []
    if _differs(track.title, music.info.name):
        changes.append("title")
    if _differs(track.artist, music.info.artist):
        changes.append("artist")
    if _differs(track.album, music.info.album):
        changes.append("album")
    music_file = _music_file(music)
    if track.has_cover and music_file is not None:
        ours = cover_hash(OUTPUT_DIR / track.filename)
        if ours is not None and not covers_match(ours, cover_hash(music_file)):
            changes.append("art")
    return changes


def _first_unused(candidates: list[_LibraryTrack], used: set[str]) -> Optional[_LibraryTrack]:
    return next((candidate for candidate in candidates if candidate.info.persistent_id not in used), None)


def _match(root: Path, library: list[_LibraryTrack], local_tracks: list[MP3Info]) -> _Match:
    by_fingerprint: dict[str, list[_LibraryTrack]] = {}
    for music in library:
        music_file = _music_file(music)
        fingerprint = audio_fingerprint(music_file) if music_file is not None else None
        if fingerprint is not None:
            by_fingerprint.setdefault(fingerprint, []).append(music)

    used: set[str] = set()
    claimed: dict[str, _LibraryTrack] = {}
    pairs: list[_Pair] = []
    leftover: list[MP3Info] = []
    local_fingerprints: dict[str, Optional[str]] = {}

    for track in local_tracks:
        fingerprint = audio_fingerprint(OUTPUT_DIR / track.filename)
        local_fingerprints[track.filename] = fingerprint
        music = _first_unused(by_fingerprint.get(fingerprint, []), used) if fingerprint else None
        if music is not None:
            used.add(music.info.persistent_id)
            claimed[fingerprint] = music
            pairs.append(_Pair(track, music, _changes(track, music)))
        elif fingerprint in claimed:
            pairs.append(_Pair(track, claimed[fingerprint], []))
        else:
            leftover.append(track)

    by_key: dict[MatchKey, list[_LibraryTrack]] = {}
    for music in library:
        by_key.setdefault(_match_key(music.info.name, music.info.artist), []).append(music)

    unpaired: list[MP3Info] = []
    for track in leftover:
        music = _first_unused(by_key.get(_local_key(track), []), used)
        if music is not None:
            used.add(music.info.persistent_id)
            pairs.append(_Pair(track, music, _changes(track, music)))
        else:
            unpaired.append(track)

    loose: dict[str, Path] = {}
    if unpaired:
        library_paths = {_path_key(music.location) for music in library if music.location}
        folder_fingerprints = _folder_fingerprints(root, library_paths)
        for track in unpaired:
            fingerprint = local_fingerprints.get(track.filename)
            path = folder_fingerprints.pop(fingerprint, None) if fingerprint else None
            if path is not None:
                loose[track.filename] = path

    return _Match(
        pairs=pairs,
        unpaired=unpaired,
        loose=loose,
        only_in_music=[music for music in library if music.info.persistent_id not in used],
    )


def _track_sort_key(track: MP3Info) -> tuple[str, str]:
    return _normalize(track.artist), _normalize(track.title or track.filename)


def diff(folder: str) -> MusicDiff:
    root = _require_folder(folder)
    matched = _match(root, _read_library(), list_mp3_infos())
    return MusicDiff(
        only_in_music=sorted(
            (music.info for music in matched.only_in_music),
            key=lambda track: (_normalize(track.artist), _normalize(track.name)),
        ),
        both=sorted(
            (MusicPair(track=pair.track, music=pair.music.info, changes=pair.changes) for pair in matched.pairs),
            key=lambda pair: _track_sort_key(pair.track),
        ),
        only_in_library=sorted(matched.unpaired, key=_track_sort_key),
    )


def _safe_part(value: Optional[str], fallback: str) -> str:
    cleaned = "".join("_" if char in UNSAFE_CHARS or ord(char) < 32 else char for char in value or "")
    cleaned = cleaned.strip().strip(".").strip()[:MAX_PART_LENGTH].strip()
    return cleaned or fallback


def _copy_into(root: Path, source: Path, track: MP3Info) -> Path:
    directory = root / _safe_part(track.artist, "Unknown Artist") / _safe_part(track.album, "Unknown Album")
    directory.mkdir(parents=True, exist_ok=True)
    stem = _safe_part(track.title, _safe_part(source.stem, "Unknown"))
    suffix = 0
    while True:
        target = directory / (f"{stem}.mp3" if suffix == 0 else f"{stem} {suffix}.mp3")
        try:
            with open(target, "xb") as output, open(source, "rb") as input_file:
                shutil.copyfileobj(input_file, output)
        except FileExistsError:
            suffix += 1
            continue
        except OSError:
            target.unlink(missing_ok=True)
            raise
        shutil.copystat(source, target)
        return target


def _write_cover(source: Path) -> Optional[str]:
    cover = get_album_cover([source])
    if cover is None:
        return None
    try:
        image_data, _ = make_square_cover(cover[0])
    except ValueError:
        return None
    handle, art_path = tempfile.mkstemp(prefix="myp3d-cover-", suffix=".jpg")
    with os.fdopen(handle, "wb") as output:
        output.write(image_data)
    return art_path


def _add_one(root: Path, source: Path, track: MP3Info, existing: Optional[Path]) -> bool:
    art_path = _write_cover(source)
    try:
        target = existing if existing is not None else _copy_into(root, source, track)
        args = [str(target)] + ([art_path] if art_path else [])
        try:
            result = _run_script("add_track", *args, timeout=TRACK_TIMEOUT_S)
        except MusicError as exc:
            if existing is None and exc.status_code != 504:
                target.unlink(missing_ok=True)
            raise
        return art_path is None or result.endswith(f"{FIELD_SEP}art")
    finally:
        if art_path:
            Path(art_path).unlink(missing_ok=True)


def _update_one(source: Path, pair: _Pair) -> bool:
    art_path = _write_cover(source) if "art" in pair.changes else None
    try:
        args = [
            pair.music.info.persistent_id,
            (pair.track.title or "").strip() if "title" in pair.changes else "",
            (pair.track.artist or "").strip() if "artist" in pair.changes else "",
            (pair.track.album or "").strip() if "album" in pair.changes else "",
        ] + ([art_path] if art_path else [])
        result = _run_script("update_track", *args, timeout=TRACK_TIMEOUT_S)
        return "art" not in pair.changes or result == "art"
    finally:
        if art_path:
            Path(art_path).unlink(missing_ok=True)


def _finish(job: _SyncJob, status: SyncStatusName, error: Optional[str] = None) -> None:
    with _sync_lock:
        job.status = status
        job.error = error


def _record_failure(job: _SyncJob, filename: str, exc: Exception) -> None:
    detail = exc.detail if isinstance(exc, MusicError) else str(exc) or "Couldn't sync the song"
    with _sync_lock:
        job.failed.append(BulkFailure(filename=filename, detail=detail))


def _run_sync(job: _SyncJob, root: Path, filenames: list[str]) -> None:
    try:
        matched = _match(root, _read_library(), list_mp3_infos())
    except Exception as exc:
        _finish(job, "failed", exc.detail if isinstance(exc, MusicError) else "Couldn't read the Apple Music library")
        return

    selected = set(filenames)
    updates = [pair for pair in matched.pairs if pair.track.filename in selected and pair.changes]
    adds: list[MP3Info] = []
    seen: set[object] = set()
    for track in matched.unpaired:
        if track.filename not in selected:
            continue
        fingerprint = audio_fingerprint(OUTPUT_DIR / track.filename)
        keys = {_local_key(track)} | ({fingerprint} if fingerprint else set())
        if keys & seen:
            continue
        seen |= keys
        adds.append(track)

    with _sync_lock:
        job.total = len(updates) + len(adds) + len(job.failed)

    for pair in updates:
        source = OUTPUT_DIR / pair.track.filename
        try:
            with_art = _update_one(source, pair)
        except Exception as exc:
            _record_failure(job, source.name, exc)
            continue
        with _sync_lock:
            job.updated += 1
            if not with_art:
                job.without_art.append(source.name)

    for track in adds:
        source = OUTPUT_DIR / track.filename
        try:
            with_art = _add_one(root, source, track, matched.loose.get(track.filename))
        except Exception as exc:
            _record_failure(job, source.name, exc)
            continue
        with _sync_lock:
            job.added += 1
            if not with_art:
                job.without_art.append(source.name)

    _finish(job, "done")


def start_sync(filenames: list[str], folder: str) -> MusicSyncInfo:
    global _sync
    if not is_available():
        raise MusicError(501, "Apple Music sync needs macOS")
    root = _require_folder(folder)

    present: list[str] = []
    missing: list[BulkFailure] = []
    for filename in dict.fromkeys(filenames):
        if Path(filename).name != filename or not filename.lower().endswith(".mp3"):
            raise MusicError(400, "Invalid filename")
        if (OUTPUT_DIR / filename).is_file():
            present.append(filename)
        else:
            missing.append(BulkFailure(filename=filename, detail="MP3 file not found"))

    with _sync_lock:
        if _sync is not None and _sync.status == "syncing":
            raise MusicError(409, "A sync with Apple Music is already running")
        job = _SyncJob(status="syncing", total=len(present) + len(missing), failed=missing)
        _sync = job

    threading.Thread(target=_run_sync, args=(job, root, present), daemon=True).start()
    return job.info()


def get_sync() -> Optional[MusicSyncInfo]:
    with _sync_lock:
        return _sync.info() if _sync is not None else None


def dismiss_sync() -> None:
    global _sync
    with _sync_lock:
        if _sync is not None and _sync.status == "syncing":
            raise MusicError(409, "The sync with Apple Music is still running")
        _sync = None
