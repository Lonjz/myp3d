import re
import shutil
import subprocess
import threading
from array import array
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, Optional

import eyed3

from models.schemas import (
    ArtistFixItem,
    ArtistTrack,
    BulkFailure,
    BulkResult,
    MP3Info,
    NamingTrack,
    RenameItem,
    SilenceScanInfo,
    SilentTrack,
)
from services import favorite_service, playlist_service
from services.audio_fingerprint import splice_audio
from services.config import OUTPUT_DIR, get_ffmpeg_path
from services.mp3_service import invalidate_library_cache, list_mp3_infos
from services.spotify_service import default_filename, format_title

ScanStatusName = Literal["scanning", "done", "failed"]

MIN_SILENCE_S = 0.5
TAIL_WINDOW_S = 15
SAMPLE_RATE = 44100
CHANNELS = 2
SCAN_BLOCK = 4410
SILENCE_LEVEL = 1
KEEP_PAD_S = 0.25
SCAN_WORKERS = 4
FFMPEG_TIMEOUT_S = 120.0

VALID_NAME = re.compile(r"[a-z0-9]+(?: [a-z0-9]+)*\.mp3")
ARTIST_SPLIT = re.compile(r"\s*,\s*|\s+&\s+")
FEATURED = re.compile(r"[(\[](?:feat\.?|ft\.?|featuring|with)\s([^)\]]*)[)\]]", re.I)


class HealthError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass
class _ScanJob:
    status: ScanStatusName
    total: int = 0
    done: int = 0
    tracks: list[SilentTrack] = field(default_factory=list)
    error: Optional[str] = None

    def info(self) -> SilenceScanInfo:
        return SilenceScanInfo(
            status=self.status,
            total=self.total,
            done=self.done,
            tracks=list(self.tracks),
            error=self.error,
        )


_lock = threading.Lock()
_scan: Optional[_ScanJob] = None
_tails: dict[str, tuple[int, int, Optional[float]]] = {}


def _ffmpeg() -> str:
    configured = get_ffmpeg_path()
    if configured is not None:
        if Path(configured).is_file():
            return configured
    else:
        found = shutil.which("ffmpeg")
        if found:
            return found
    raise HealthError(500, "ffmpeg isn't installed")


def _run(args: list[str], capture: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        [_ffmpeg(), "-hide_banner", "-loglevel", "error", *args],
        stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        timeout=FFMPEG_TIMEOUT_S,
    )


def _measure_tail(path: Path, whole: bool = False) -> Optional[float]:
    window = [] if whole else ["-sseof", f"-{TAIL_WINDOW_S}"]
    result = _run(
        [*window, "-i", str(path), "-map", "0:a:0", "-ac", str(CHANNELS), "-ar", str(SAMPLE_RATE), "-f", "s16le", "-"]
    )
    if result.returncode != 0:
        return None
    samples = array("h")
    samples.frombytes(result.stdout[: len(result.stdout) // 2 * 2])
    frames = len(samples) // CHANNELS
    end = frames * CHANNELS
    while end > 0:
        start = max(0, end - SCAN_BLOCK)
        block = samples[start:end]
        if max(block) > SILENCE_LEVEL or min(block) < -SILENCE_LEVEL:
            for index in range(end - 1, start - 1, -1):
                if abs(samples[index]) > SILENCE_LEVEL:
                    return (frames - 1 - index // CHANNELS) / SAMPLE_RATE
        end = start
    return frames / SAMPLE_RATE if frames and not whole else None


def silent_tail(path: Path) -> Optional[float]:
    try:
        stats = path.stat()
    except OSError:
        return None
    key = str(path)
    with _lock:
        cached = _tails.get(key)
    if cached is not None and cached[0] == stats.st_size and cached[1] == stats.st_mtime_ns:
        return cached[2]
    try:
        value = _measure_tail(path)
    except (OSError, subprocess.SubprocessError):
        return None
    with _lock:
        _tails[key] = (stats.st_size, stats.st_mtime_ns, value)
    return value


def _scan_one(job: _ScanJob, track: MP3Info) -> None:
    silence = silent_tail(OUTPUT_DIR / track.filename)
    with _lock:
        job.done += 1
        if silence is not None and silence >= MIN_SILENCE_S:
            job.tracks.append(SilentTrack(**track.model_dump(), silence=silence))


def _run_scan(job: _ScanJob) -> None:
    try:
        tracks = list_mp3_infos()
        with _lock:
            job.total = len(tracks)
        with ThreadPoolExecutor(max_workers=SCAN_WORKERS) as pool:
            list(pool.map(lambda track: _scan_one(job, track), tracks))
    except Exception:
        with _lock:
            job.status = "failed"
            job.error = "Couldn't scan the library"
        return
    with _lock:
        job.tracks.sort(key=lambda track: (-track.silence, track.filename.casefold()))
        job.status = "done"


def start_scan() -> SilenceScanInfo:
    global _scan
    _ffmpeg()
    with _lock:
        if _scan is not None and _scan.status == "scanning":
            raise HealthError(409, "A scan is already running")
        job = _ScanJob(status="scanning")
        _scan = job
    threading.Thread(target=_run_scan, args=(job,), daemon=True).start()
    return job.info()


def get_scan() -> Optional[SilenceScanInfo]:
    with _lock:
        return _scan.info() if _scan is not None else None


def _stream_length(path: Path) -> float:
    result = _run(["-nostats", "-progress", "pipe:1", "-i", str(path), "-map", "0:a:0", "-c", "copy", "-f", "null", "-"])
    if result.returncode != 0:
        raise OSError("ffmpeg couldn't read the song")
    length = None
    for line in result.stdout.decode("utf-8", "replace").splitlines():
        key, _, value = line.partition("=")
        if key == "out_time_us" and value.strip().isdigit():
            length = int(value) / 1_000_000
    if not length:
        raise OSError("ffmpeg couldn't read the song length")
    return length


def _is_safe_filename(name: str) -> bool:
    return Path(name).name == name and not name.startswith(".") and name.lower().endswith(".mp3")


def _trim_one(path: Path) -> None:
    if silent_tail(path) is None:
        raise ValueError("ffmpeg couldn't read the song")
    silence = _measure_tail(path, whole=True)
    if silence is None:
        raise ValueError("The song is all silence")
    if silence < MIN_SILENCE_S:
        raise ValueError("The song doesn't end in silence")
    cut = _stream_length(path) - silence + KEEP_PAD_S
    if cut <= KEEP_PAD_S:
        raise ValueError("The song is all silence")

    audio_part = OUTPUT_DIR / f".{path.name}.trim.part"
    joined_part = OUTPUT_DIR / f".{path.name}.trimmed.part"
    try:
        result = _run(
            [
                "-y", "-i", str(path), "-map", "0:a:0", "-c:a", "copy", "-t", f"{cut:.3f}",
                "-id3v2_version", "0", "-write_id3v1", "0", "-f", "mp3", str(audio_part),
            ],
            capture=False,
        )
        if result.returncode != 0:
            raise OSError("ffmpeg couldn't cut the song")
        splice_audio(path, audio_part, joined_part)
        shutil.copyfile(joined_part, path)
    finally:
        audio_part.unlink(missing_ok=True)
        joined_part.unlink(missing_ok=True)


def _ensure_idle() -> None:
    with _lock:
        if _scan is not None and _scan.status == "scanning":
            raise HealthError(409, "Wait for the scan to finish")


def trim(filenames: list[str]) -> BulkResult:
    _ensure_idle()
    _ffmpeg()

    updated: list[str] = []
    failed: list[BulkFailure] = []
    for filename in dict.fromkeys(filenames):
        path = OUTPUT_DIR / filename
        if not _is_safe_filename(filename) or not path.is_file():
            failed.append(BulkFailure(filename=filename, detail="MP3 file not found"))
            continue
        try:
            _trim_one(path)
        except subprocess.TimeoutExpired:
            failed.append(BulkFailure(filename=filename, detail="ffmpeg took too long"))
            continue
        except (OSError, ValueError, subprocess.SubprocessError) as exc:
            failed.append(BulkFailure(filename=filename, detail=str(exc) or "Couldn't trim the song"))
            continue
        updated.append(filename)

    if updated:
        invalidate_library_cache()
        trimmed = set(updated)
        with _lock:
            if _scan is not None:
                _scan.tracks = [track for track in _scan.tracks if track.filename not in trimmed]

    return BulkResult(success=not failed, updated=updated, failed=failed)


def _track_path(filename: str) -> Path:
    path = OUTPUT_DIR / filename
    if not _is_safe_filename(filename) or not path.is_file():
        raise ValueError("MP3 file not found")
    return path


def _suggest_name(track: MP3Info) -> Optional[str]:
    return default_filename(track.title or "") or default_filename(Path(track.filename).stem)


def naming_issues() -> list[NamingTrack]:
    return [
        NamingTrack(**track.model_dump(), suggested=_suggest_name(track))
        for track in list_mp3_infos()
        if not VALID_NAME.fullmatch(track.filename)
    ]


def _rename_one(item: RenameItem) -> None:
    path = _track_path(item.filename)
    name = f"{' '.join(item.new_name.split())}.mp3"
    if not VALID_NAME.fullmatch(name):
        raise ValueError("Use only lowercase letters, numbers and spaces")
    if name == item.filename:
        return
    target = OUTPUT_DIR / name
    if target.exists() and not target.samefile(path):
        raise ValueError("A file with that name already exists")
    path.rename(target)
    playlist_service.rename_track(item.filename, name)
    favorite_service.rename_track(item.filename, name)


def rename(items: list[RenameItem]) -> BulkResult:
    _ensure_idle()
    updated: list[str] = []
    failed: list[BulkFailure] = []
    for item in {item.filename: item for item in items}.values():
        try:
            _rename_one(item)
        except (OSError, ValueError) as exc:
            failed.append(BulkFailure(filename=item.filename, detail=str(exc) or "Couldn't rename the song"))
            continue
        updated.append(item.filename)

    if updated:
        invalidate_library_cache()
    return BulkResult(success=not failed, updated=updated, failed=failed)


def _split_artists(value: Optional[str]) -> list[str]:
    return list(dict.fromkeys(name for name in ARTIST_SPLIT.split((value or "").strip()) if name))


def _featured_title(title: str, primary: str, artists: list[str]) -> str:
    existing = [name for match in FEATURED.findall(title) for name in _split_artists(match)]
    names: dict[str, str] = {primary.casefold(): primary}
    for name in [*existing, *artists]:
        names.setdefault(name.casefold(), name)
    return format_title(title, list(names.values()))


def artist_issues() -> list[ArtistTrack]:
    issues: list[ArtistTrack] = []
    for track in list_mp3_infos():
        artists = _split_artists(track.artist)
        if len(artists) < 2:
            continue
        title = track.title or Path(track.filename).stem
        titles = [_featured_title(title, artist, artists) for artist in artists]
        issues.append(ArtistTrack(**track.model_dump(), artists=artists, titles=titles))
    return issues


def _fix_artist_one(item: ArtistFixItem) -> None:
    path = _track_path(item.filename)
    audio = eyed3.load(str(path))
    if audio is None or audio.tag is None:
        raise ValueError("Couldn't read the tags")
    artists = _split_artists(audio.tag.artist)
    if len(artists) < 2:
        raise ValueError("The song has only one artist")
    if item.artist not in artists:
        raise ValueError("That artist isn't on the song")
    audio.tag.title = _featured_title(audio.tag.title or path.stem, item.artist, artists)
    audio.tag.artist = item.artist
    audio.tag.save(version=(2, 3, 0))


def fix_artists(items: list[ArtistFixItem]) -> BulkResult:
    _ensure_idle()
    updated: list[str] = []
    failed: list[BulkFailure] = []
    for item in {item.filename: item for item in items}.values():
        try:
            _fix_artist_one(item)
        except (OSError, ValueError, eyed3.Error) as exc:
            failed.append(BulkFailure(filename=item.filename, detail=str(exc) or "Couldn't fix the artist"))
            continue
        updated.append(item.filename)

    if updated:
        invalidate_library_cache()
    return BulkResult(success=not failed, updated=updated, failed=failed)
