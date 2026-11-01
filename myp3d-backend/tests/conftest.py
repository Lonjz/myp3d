import atexit
import ipaddress
import json
import os
import shutil
import socket
import sys
import tempfile
import threading
import time
import urllib.request
from pathlib import Path
from typing import Callable, Optional

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

SESSION_DIR = Path(tempfile.mkdtemp(prefix="myp3d-tests-")).resolve()
LIBRARY_DIR = SESSION_DIR / "library"
PEER_DIR = SESSION_DIR / "peer"
AUDIO_CACHE = SESSION_DIR / "audio"
DB_FILE = SESSION_DIR / "myp3d.db"
atexit.register(shutil.rmtree, SESSION_DIR, True)

os.environ.update(
    MYP3D_LIBRARY_DIR=str(LIBRARY_DIR),
    MYP3D_DB_PATH=str(DB_FILE),
    YTDLP_COOKIES_BROWSER="firefox",
    YTDLP_COOKIES_PROFILE="",
    YTDLP_PLAYER_CLIENTS="default,tv,ios",
)

from services import config  # noqa: E402

if config.OUTPUT_DIR.resolve() != LIBRARY_DIR.resolve() or config.DB_PATH.resolve() != DB_FILE.resolve():
    pytest.exit("Tests must run against the temporary library, not the real one", returncode=2)

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from services import (  # noqa: E402
    audio_fingerprint,
    cover_service,
    date_service,
    favorite_playlist,
    favorite_service,
    health_service,
    mp3_service,
    music_playlist_service,
    music_service,
    playlist_service,
    queue_service,
    spotify_service,
    sync_service,
    youtube_service,
)
from services.discovery_service import discovery  # noqa: E402
from tests import seed  # noqa: E402
from tests.fakes import FakeWeb, FakeYoutube, FakeYTMusic  # noqa: E402

LOCAL_HOSTS = {"localhost", "", socket.gethostname()}

(SESSION_DIR / "Probe").touch()
CASE_INSENSITIVE_FS = (SESSION_DIR / "probe").exists()


def _is_local(host) -> bool:
    if host is None or str(host) in LOCAL_HOSTS:
        return True
    try:
        return ipaddress.ip_address(str(host).split("%")[0]).is_loopback
    except ValueError:
        return False


def wait_for(predicate: Callable[[], bool], timeout: float = 10.0, message: str = "condition") -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.02)
    raise AssertionError(f"Timed out waiting for {message}")


def _settle_background_work() -> None:
    worker = queue_service._worker
    if worker is not None:
        worker.join(timeout=15)
    wait_for(lambda: health_service._scan is None or health_service._scan.status != "scanning", 30, "the silence scan")


def _reset_state() -> None:
    discovery.stop()
    for directory in (LIBRARY_DIR, PEER_DIR):
        shutil.rmtree(directory, ignore_errors=True)
        directory.mkdir(parents=True)
    for path in SESSION_DIR.glob("myp3d.db*"):
        path.unlink()
    queue_service.init()
    playlist_service.init()
    favorite_service.init()
    date_service.init()
    music_playlist_service.init()
    mp3_service.invalidate_library_cache()
    mp3_service._file_infos.clear()
    youtube_service._download_locks.clear()
    audio_fingerprint._fingerprints.clear()
    audio_fingerprint._cover_hashes.clear()
    cover_service.clear_cover_cache()
    health_service._scan = None
    health_service._tails.clear()
    queue_service._progress.clear()
    queue_service._worker = None
    sync_service._session = None
    sync_service._fingerprints.clear()
    music_service._sync = None
    music_playlist_service._sync = None
    spotify_service._track_entity.cache_clear()
    spotify_service._track_details.cache_clear()


@pytest.fixture(autouse=True)
def network_guard(monkeypatch):
    attempts: list[str] = []
    real_connect = socket.socket.connect
    real_getaddrinfo = socket.getaddrinfo

    def guarded_connect(sock, address):
        host = address[0] if isinstance(address, tuple) else address
        if not _is_local(host):
            attempts.append(f"connect {host}")
            raise ConnectionRefusedError(f"Tests can't reach {host}")
        return real_connect(sock, address)

    def guarded_getaddrinfo(host, *args, **kwargs):
        if not _is_local(host):
            attempts.append(f"lookup {host}")
            raise socket.gaierror(f"Tests can't look up {host}")
        return real_getaddrinfo(host, *args, **kwargs)

    monkeypatch.setattr(socket.socket, "connect", guarded_connect)
    monkeypatch.setattr(socket, "getaddrinfo", guarded_getaddrinfo)
    yield attempts
    if attempts:
        pytest.fail(f"Tests tried to reach the network: {attempts}. Use the web, youtube or ytmusic fixtures.")


@pytest.fixture(autouse=True)
def web(network_guard, monkeypatch) -> FakeWeb:
    fake = FakeWeb(lambda url: network_guard.append(f"urlopen {url}"))
    monkeypatch.setattr(urllib.request, "urlopen", fake.urlopen)
    return fake


@pytest.fixture(autouse=True)
def youtube(monkeypatch) -> FakeYoutube:
    fake = FakeYoutube(lambda seconds, freq: seed.make_audio(AUDIO_CACHE, seconds, freq))
    monkeypatch.setattr(youtube_service, "YoutubeDL", fake.ydl)
    return fake


@pytest.fixture(autouse=True)
def ytmusic(monkeypatch) -> FakeYTMusic:
    fake = FakeYTMusic()
    monkeypatch.setattr(spotify_service, "YTMusic", fake.client)
    monkeypatch.setattr(spotify_service, "_ytmusic", threading.local())
    return fake


@pytest.fixture(autouse=True)
def clean_state(youtube):
    _reset_state()
    yield
    youtube.release()
    _settle_background_work()


class Library:
    def __init__(self, directory: Path) -> None:
        self.dir = directory

    def path(self, filename: str) -> Path:
        return self.dir / filename

    def add(self, filename: str, title=None, artist=None, album=None, seconds: float = 3, freq: int = 440,
            cover: Optional[tuple[int, int, int]] = None, silence_tail: float = 0) -> Path:
        path = seed.make_mp3(self.dir, seed.Track(filename, title, artist, album, seconds, freq, cover, silence_tail), AUDIO_CACHE)
        mp3_service.invalidate_library_cache()
        return path

    def add_tracks(self, tracks: list[seed.Track]) -> None:
        seed.seed_library(self.dir, tracks, AUDIO_CACHE)
        mp3_service.invalidate_library_cache()

    def tags(self, filename: str) -> dict:
        return seed.read_tags(self.path(filename))

    def names(self) -> list[str]:
        return sorted(path.name for path in self.dir.iterdir() if path.suffix.lower() == ".mp3")


def _requires_ffmpeg() -> None:
    if seed.ffmpeg_path() is None:
        pytest.skip("ffmpeg isn't installed")


@pytest.fixture
def library() -> Library:
    _requires_ffmpeg()
    return Library(LIBRARY_DIR)


@pytest.fixture
def seeded_library(library) -> Library:
    library.add_tracks(seed.DEFAULT_LIBRARY)
    return library


@pytest.fixture
def peer_library() -> Library:
    _requires_ffmpeg()
    return Library(PEER_DIR)


@pytest.fixture
def client():
    with TestClient(main.app, base_url="http://127.0.0.1", client=("127.0.0.1", 50000)) as test_client:
        yield test_client


@pytest.fixture
def make_client():
    clients: list[TestClient] = []

    def build(host: str = "127.0.0.1", base_url: str = "http://127.0.0.1", **kwargs) -> TestClient:
        test_client = TestClient(main.app, base_url=base_url, client=(host, 50000), **kwargs)
        clients.append(test_client)
        return test_client

    yield build
    for test_client in clients:
        test_client.close()


@pytest.fixture
def make_playlist():
    def build(name: str, filenames: list[str] = (), description: str = "") -> str:
        return playlist_service.create(name, list(filenames), description).id

    return build


@pytest.fixture
def star():
    def build(*filenames: str) -> None:
        favorite_service.set_many(filenames, [])
        favorite_playlist.ensure()

    return build


@pytest.fixture
def manifest():
    def build(directory: Path) -> dict[str, dict]:
        from models.schemas import SyncManifestEntry

        entries = {}
        for path in sorted(directory.glob("*.mp3")):
            info = mp3_service.get_mp3_info(path)
            entry = SyncManifestEntry(
                filename=path.name,
                size=path.stat().st_size,
                fingerprint=sync_service._fingerprint(path),
                audio_fingerprint=audio_fingerprint.audio_fingerprint(path),
                tag_fingerprint=sync_service._tag_fingerprint(path),
                duration=info.duration,
                title=info.title,
                artist=info.artist,
                album=info.album,
                has_cover=info.has_cover,
                date_added=info.date_added,
            )
            entries[path.name] = json.loads(entry.model_dump_json())
        return entries

    return build


@pytest.fixture
def cover_jpeg() -> bytes:
    return seed.make_cover((120, 90, 200))
