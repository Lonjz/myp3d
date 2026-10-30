import time

from models.schemas import SyncPeer
from services import db, music_playlist_service, music_service, sync_service
from tests.conftest import LIBRARY_DIR


def session(status: str) -> sync_service._Session:
    created = sync_service._Session(
        id="a" * 32,
        peer=SyncPeer(id="peer", name="Peer", host="127.0.0.1"),
        port=9,
        direction="outgoing",
        status=status,
    )
    sync_service._session = created
    return created


def test_a_crashing_device_sync_fails_instead_of_hanging(library, monkeypatch):
    def broken(_):
        raise ValueError("bad json from the peer")

    monkeypatch.setattr(sync_service, "_remote_manifest", broken)
    current = session("syncing")
    sync_service._pull_worker(current)
    assert (current.status, current.error) == ("failed", "The sync stopped unexpectedly")


def test_a_crashing_apple_music_sync_fails_instead_of_hanging(library, monkeypatch, tmp_path):
    for module in (music_service, music_playlist_service):
        def broken(job, root):
            raise RuntimeError("osascript vanished")

        monkeypatch.setattr(module, "_run_sync", broken)
        job = module._SyncJob(status="syncing", total=0)
        module._run_guarded(job, tmp_path)
        assert (job.status, job.error) == ("failed", "The sync stopped unexpectedly")


def test_stale_sessions_do_not_block_new_ones(library, monkeypatch):
    monkeypatch.setattr(sync_service.discovery, "is_active", lambda: True)
    stale = session("paired")
    stale.created_at = time.monotonic() - sync_service.PAIRED_TIMEOUT_S - 1
    info = sync_service.receive_request("b" * 32, {"id": "other", "name": "Other"}, 8000, "127.0.0.2", "1.0.0")
    assert info.status == "incoming"
    assert stale.status == "cancelled"


def test_startup_uses_wal(library, client):
    with db.connect() as conn:
        assert conn.execute("PRAGMA journal_mode").fetchone()[0] == "wal"


def test_startup_removes_partial_files(library, make_client):
    leftover = LIBRARY_DIR / ".song.mp3.part"
    leftover.write_bytes(b"half a song")
    keep = library.add("keep.mp3", "Keep")
    with make_client():
        pass
    assert not leftover.exists()
    assert keep.exists()


def test_spotify_fallback_failure_is_a_clear_error(client, library, web, ytmusic, youtube):
    from tests.fakes import spotify_track

    track_id = "4uLU6hMCjMI75M1A2tKUQC"
    web.spotify("track", track_id, spotify_track(track_id, "Song", ["Band"]))
    ytmusic.error = RuntimeError("down")
    youtube.fail_next(times=2)
    response = client.get(f"/spotify/tracks/{track_id}", params={"album": "x"})
    assert (response.status_code, response.json()["detail"]) == (502, "Couldn't search YouTube")
