from datetime import datetime, timedelta, timezone

from models.schemas import SyncPlaylistRecord, SyncQueueRecord
from services import database_sync, favorite_playlist, playlist_service, queue_service
from services.db import connect

NOW = datetime(2026, 10, 1, tzinfo=timezone.utc)


def queue_record(uid: str, created: datetime, **overrides) -> SyncQueueRecord:
    stamp = created.isoformat()
    return SyncQueueRecord(uid=uid, url="https://youtu.be/same", status="pending", created_at=stamp, updated_at=stamp, **overrides)


def live_queue() -> list[tuple[str, bool]]:
    with connect() as conn:
        rows = conn.execute("SELECT uid, deleted_at FROM queue_items ORDER BY uid").fetchall()
    return [(row["uid"], row["deleted_at"] is None) for row in rows]


def test_the_same_download_queued_on_both_devices_converges(library):
    older, newer = "a" * 32, "b" * 32
    queue_service.apply_record(queue_record(newer, NOW + timedelta(minutes=5)), None)
    queue_service.apply_record(queue_record(older, NOW), None)
    assert live_queue() == [(older, True), (newer, False)]


def test_the_older_local_copy_wins(library):
    older, newer = "a" * 32, "b" * 32
    queue_service.apply_record(queue_record(older, NOW), None)
    queue_service.apply_record(queue_record(newer, NOW + timedelta(minutes=5)), None)
    assert live_queue() == [(older, True), (newer, False)]


def test_different_trims_are_different_downloads(library):
    queue_service.apply_record(queue_record("a" * 32, NOW), None)
    queue_service.apply_record(queue_record("b" * 32, NOW, start_time=1, end_time=5), None)
    assert live_queue() == [("a" * 32, True), ("b" * 32, True)]


def test_old_tombstones_are_purged(library, make_playlist):
    fresh, stale = make_playlist("Fresh"), make_playlist("Stale")
    playlist_service.delete(fresh)
    playlist_service.delete(stale)
    old = (datetime.now(timezone.utc) - timedelta(days=database_sync.TOMBSTONE_DAYS + 1)).isoformat()
    with connect() as conn:
        conn.execute("UPDATE playlists SET deleted_at = ? WHERE id = ?", (old, stale))
    database_sync.purge_tombstones()
    assert [record.id for record in playlist_service.sync_records()] == [fresh]


def favorites_record(playlist_id: str, filenames: list[str], created: datetime) -> SyncPlaylistRecord:
    stamp = created.isoformat()
    return SyncPlaylistRecord(id=playlist_id, name="faves", filenames=filenames, is_favorites=True, created_at=stamp, updated_at=stamp)


def test_two_faves_playlists_merge_into_the_oldest(seeded_library):
    mine, theirs = "a" * 32, "b" * 32
    playlist_service.apply_record(favorites_record(theirs, ["reckoner.mp3", "the chain.mp3"], NOW + timedelta(days=1)), None)
    playlist_service.apply_record(favorites_record(mine, ["the chain.mp3"], NOW), None)
    playlist_service.merge_favorites()
    assert playlist_service.stored_filenames(mine) == ["the chain.mp3", "reckoner.mp3"]

    favorite_playlist.ensure()
    assert playlist_service.favorites_id() == mine
    assert [record.id for record in playlist_service.sync_records() if record.deleted_at is None] == [mine]


def test_a_playlist_named_faves_is_only_adopted_once(library, make_playlist):
    first = make_playlist("faves")
    favorite_playlist.ensure()
    assert playlist_service.favorites_id() == first

    playlist_service.delete(first)
    make_playlist("Faves")
    favorite_playlist.ensure()
    assert playlist_service.favorites_id() is None
