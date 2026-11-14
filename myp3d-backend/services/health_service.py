import os
import re
import shutil
import subprocess
import tempfile
import threading
from array import array
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Callable, Optional, TypeVar

import eyed3

from models.health import ArtistFixItem, ArtistTrack, NamingTrack, RenameItem, SilenceScanInfo, SilentTrack, TrimRange
from models.library import BulkFailure, BulkResult, MP3Info
from services import track_records
from services.audio_fingerprint import splice_audio, stat_cached
from services.config import OUTPUT_DIR, get_ffmpeg_path
from services.mp3_service import IN_USE, edit_tags, invalidate_library_cache, list_mp3_infos
from services.spotify_service import default_filename, format_title
from services.youtube_service import audio_opts, extract_info
from services.errors import AppError
from services.filenames import is_track_name

T = TypeVar("T")

MIN_SILENCE_S = 0.5
TAIL_WINDOW_S = 2
SAMPLE_RATE = 44100
CHANNELS = 2
SCAN_BLOCK = 4410
SILENCE_LEVEL = 1
KEEP_PAD_S = 0.25
SMART_SILENCE_LEVEL = 33
SMART_PAD_S = 0.1
SCAN_WORKERS = 4
FFMPEG_TIMEOUT_S = 120.0

VALID_NAME = re.compile(r"[a-z0-9]+(?: [a-z0-9]+)*\.mp3")
ARTIST_SPLIT = re.compile(r"\s*,\s*|\s+&\s+")
FEATURED = re.compile(r"[(\[](?:feat\.?|ft\.?|featuring|with)\s([^)\]]*)[)\]]", re.I)


_lock = threading.Lock()
_scan: Optional[SilenceScanInfo] = None


def _ffmpeg() -> str:
    found = get_ffmpeg_path() or shutil.which("ffmpeg")
    if found is None:
        raise AppError(500, "ffmpeg isn't installed")
    return found


def _run(args: list[str], capture: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        [_ffmpeg(), "-hide_banner", "-loglevel", "error", *args],
        stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        timeout=FFMPEG_TIMEOUT_S,
    )


def _decode(path: Path, window: Optional[int]) -> array:
    seek = [] if window is None else ["-sseof", f"-{window}"]
    result = _run(
        [*seek, "-i", str(path), "-map", "0:a:0", "-ac", str(CHANNELS), "-ar", str(SAMPLE_RATE), "-f", "s16le", "-"]
    )
    if result.returncode != 0:
        raise OSError("ffmpeg couldn't read the song")
    samples = array("h")
    samples.frombytes(result.stdout[: len(result.stdout) // 2 * 2])
    return samples


def _trailing_silence(samples: array, level: int = SILENCE_LEVEL) -> Optional[float]:
    frames = len(samples) // CHANNELS
    end = frames * CHANNELS
    while end > 0:
        start = max(0, end - SCAN_BLOCK)
        block = samples[start:end]
        if max(block) > level or min(block) < -level:
            for index in range(end - 1, start - 1, -1):
                if abs(samples[index]) > level:
                    return (frames - 1 - index // CHANNELS) / SAMPLE_RATE
        end = start
    return None


def _leading_silence(samples: array, level: int) -> Optional[float]:
    total = len(samples) // CHANNELS * CHANNELS
    start = 0
    while start < total:
        end = min(total, start + SCAN_BLOCK)
        block = samples[start:end]
        if max(block) > level or min(block) < -level:
            for index in range(start, end):
                if abs(samples[index]) > level:
                    return index // CHANNELS / SAMPLE_RATE
        start = end
    return None


def silence_bounds(url: str) -> TrimRange:
    with tempfile.TemporaryDirectory() as folder:
        extract_info(audio_opts(str(Path(folder) / "audio.%(ext)s")), url, download=True)
        downloaded = [path for path in Path(folder).iterdir() if path.is_file()]
        if len(downloaded) != 1:
            raise AppError(502, "Couldn't download the audio")
        samples = _decode(downloaded[0], None)
    lead = _leading_silence(samples, SMART_SILENCE_LEVEL)
    tail = _trailing_silence(samples, SMART_SILENCE_LEVEL)
    if lead is None or tail is None:
        raise AppError(422, "The video is silent")
    duration = len(samples) // CHANNELS / SAMPLE_RATE
    return TrimRange(
        start=round(max(0.0, lead - SMART_PAD_S), 2),
        end=round(min(duration, duration - tail + SMART_PAD_S), 2),
        duration=round(duration, 2),
    )


def _measure_tail(path: Path, duration: float) -> Optional[float]:
    window = TAIL_WINDOW_S
    while window < duration:
        silence = _trailing_silence(_decode(path, window))
        if silence is not None:
            return silence
        window *= 2
    return _trailing_silence(_decode(path, None))


def silent_tail(path: Path, duration: Optional[float] = None) -> Optional[float]:
    try:
        return stat_cached("tail", path, lambda target, _:_measure_tail(target, duration or _stream_length(target)))
    except (OSError, subprocess.SubprocessError):
        return None


def _scan_one(job: SilenceScanInfo, track: MP3Info) -> None:
    silence = silent_tail(OUTPUT_DIR / track.filename, track.duration)
    with _lock:
        job.done += 1
        if silence is not None and silence >= MIN_SILENCE_S:
            job.tracks.append(SilentTrack(**track.model_dump(), silence=silence))


def _run_scan(job: SilenceScanInfo) -> None:
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
            raise AppError(409, "A scan is already running")
        job = SilenceScanInfo(status="scanning")
        _scan = job
    threading.Thread(target=_run_scan, args=(job,), daemon=True).start()
    return job.model_copy(deep=True)


def get_scan() -> Optional[SilenceScanInfo]:
    with _lock:
        return _scan.model_copy(deep=True) if _scan is not None else None


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


def _trim_one(path: Path) -> None:
    length = _stream_length(path)
    silence = _measure_tail(path, length)
    if silence is None:
        raise ValueError("The song is all silence")
    if silence < MIN_SILENCE_S:
        raise ValueError("The song doesn't end in silence")
    cut = length - silence + KEEP_PAD_S
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
        os.replace(joined_part, path)
    finally:
        audio_part.unlink(missing_ok=True)
        joined_part.unlink(missing_ok=True)


def _ensure_idle() -> None:
    with _lock:
        if _scan is not None and _scan.status == "scanning":
            raise AppError(409, "Wait for the scan to finish")


def _bulk(items: dict[str, T], apply: Callable[[T], None], fallback: str) -> BulkResult:
    updated: list[str] = []
    failed: list[BulkFailure] = []
    for filename, item in items.items():
        try:
            apply(item)
        except subprocess.TimeoutExpired:
            failed.append(BulkFailure(filename=filename, detail="ffmpeg took too long"))
        except PermissionError:
            failed.append(BulkFailure(filename=filename, detail=IN_USE))
        except (OSError, ValueError, eyed3.Error, subprocess.SubprocessError) as exc:
            failed.append(BulkFailure(filename=filename, detail=str(exc) or fallback))
        else:
            updated.append(filename)

    if updated:
        invalidate_library_cache()
    return BulkResult(success=not failed, updated=updated, failed=failed)


def trim(filenames: list[str]) -> BulkResult:
    _ensure_idle()
    _ffmpeg()
    result = _bulk({filename: filename for filename in filenames}, lambda filename: _trim_one(_track_path(filename)), "Couldn't trim the song")
    trimmed = set(result.updated)
    with _lock:
        if _scan is not None:
            _scan.tracks = [track for track in _scan.tracks if track.filename not in trimmed]
    return result


def _track_path(filename: str) -> Path:
    path = OUTPUT_DIR / filename
    if not is_track_name(filename) or not path.is_file():
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
    track_records.rename(item.filename, name)


def rename(items: list[RenameItem]) -> BulkResult:
    _ensure_idle()
    return _bulk({item.filename: item for item in items}, _rename_one, "Couldn't rename the song")


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
    with edit_tags(path) as tag:
        artists = _split_artists(tag.artist)
        if len(artists) < 2:
            raise ValueError("The song has only one artist")
        if item.artist not in artists:
            raise ValueError("That artist isn't on the song")
        tag.title = _featured_title(tag.title or path.stem, item.artist, artists)
        tag.artist = item.artist


def fix_artists(items: list[ArtistFixItem]) -> BulkResult:
    _ensure_idle()
    return _bulk({item.filename: item for item in items}, _fix_artist_one, "Couldn't fix the artist")
