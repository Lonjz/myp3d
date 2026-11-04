from datetime import datetime, timedelta, timezone

from models.sync import SyncPlaylistRecord, SyncQueueRecord
from services import database_sync, favorite_playlist, music_playlist_service, playlist_service, queue_service
from services.db import connect
from services.music_playlist_service import ApplePlaylist, Snapshot, plan_sync
from services.music_service import FIELD_SEP
from services.playlist_service import PlaylistState

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


FILE_OF = {"P1": "a.mp3", "P2": "b.mp3", "P3": "c.mp3", "P4": "d.mp3"}


def local_state(filenames: list[str]) -> PlaylistState:
    stamp = NOW.isoformat()
    return PlaylistState(
        id="local", name="mix", description="", filenames=filenames, cover_hash=None,
        is_favorites=False, created_at=stamp, updated_at=stamp, deleted_at=None,
    )


def apple_playlist(track_ids: list[str]) -> ApplePlaylist:
    return ApplePlaylist(persistent_id="APL", name="mix", description="", track_ids=track_ids)


def paired(local: list[str], track_ids: list[str], synced_local: list[str], synced_apple: list[str], **flags):
    flags.setdefault("ordered", True)
    links = {"local": ("APL", Snapshot(name="mix", local=synced_local, apple=synced_apple, **flags))}
    [plan] = plan_sync([apple_playlist(track_ids)], [local_state(local)], links, FILE_OF, set(FILE_OF.values()))
    return plan


def test_a_song_added_at_the_bottom_is_one_add():
    plan = paired(["c.mp3", "b.mp3", "a.mp3", "d.mp3"], ["P3", "P2", "P1"], ["c.mp3", "b.mp3", "a.mp3"], ["c.mp3", "b.mp3", "a.mp3"])
    assert (plan.action, plan.apple_remove, plan.apple_add) == ("push", [], ["d.mp3"])


def test_a_song_pushed_onto_the_stack_rebuilds_the_apple_playlist_below_it():
    plan = paired(["d.mp3", "c.mp3", "b.mp3", "a.mp3"], ["P3", "P2", "P1"], ["c.mp3", "b.mp3", "a.mp3"], ["c.mp3", "b.mp3", "a.mp3"])
    assert plan.action == "push"
    assert plan.apple_remove == [(3, "P1"), (2, "P2"), (1, "P3")]
    assert plan.apple_add == ["d.mp3", "c.mp3", "b.mp3", "a.mp3"]
    assert plan.apple == ["d.mp3", "c.mp3", "b.mp3", "a.mp3"]


def test_a_song_removed_from_the_middle_is_one_delete():
    plan = paired(["c.mp3", "a.mp3"], ["P3", "P2", "P1"], ["c.mp3", "b.mp3", "a.mp3"], ["c.mp3", "b.mp3", "a.mp3"])
    assert (plan.action, plan.apple_remove, plan.apple_add) == ("push", [(2, "P2")], [])


def test_a_myp3d_reorder_keeps_the_longest_matching_run_at_the_top():
    plan = paired(["b.mp3", "a.mp3", "c.mp3"], ["P3", "P2", "P1"], ["c.mp3", "b.mp3", "a.mp3"], ["c.mp3", "b.mp3", "a.mp3"])
    assert (plan.apple_remove, plan.apple_add) == ([(1, "P3")], ["c.mp3"])

    plan = paired(["a.mp3", "c.mp3", "b.mp3"], ["P3", "P2", "P1"], ["c.mp3", "b.mp3", "a.mp3"], ["c.mp3", "b.mp3", "a.mp3"])
    assert (plan.apple_remove, plan.apple_add) == ([(2, "P2"), (1, "P3")], ["c.mp3", "b.mp3"])


def test_an_apple_reorder_pulls_into_myp3d():
    plan = paired(["c.mp3", "b.mp3", "a.mp3", "gone.mp3"], ["P1", "P3", "P2"], ["c.mp3", "b.mp3", "a.mp3", "gone.mp3"], ["c.mp3", "b.mp3", "a.mp3"])
    assert plan.action == "pull"
    assert plan.local == ["a.mp3", "c.mp3", "b.mp3", "gone.mp3"]
    assert (plan.apple_remove, plan.apple_add, plan.write_apple) == ([], [], False)


def test_a_flipped_view_is_not_an_apple_edit():
    plan = paired(["c.mp3", "b.mp3", "a.mp3"], ["P3", "P2", "P1"], ["c.mp3", "b.mp3", "a.mp3"], ["a.mp3", "b.mp3", "c.mp3"])
    assert plan.action == "in_sync"
    assert plan.refreshed.apple == ["c.mp3", "b.mp3", "a.mp3"]

    plan = paired(["c.mp3", "b.mp3", "a.mp3"], ["P1", "P2", "P3"], ["c.mp3", "b.mp3", "a.mp3"], ["c.mp3", "b.mp3", "a.mp3"])
    assert (plan.action, plan.local) == ("push", ["c.mp3", "b.mp3", "a.mp3"])


def test_removals_are_sent_from_the_bottom_up_before_the_additions(monkeypatch):
    sent: list[str] = []

    def write(name, *args, timeout=0):
        sent.extend(args[4:])
        return f"APL{FIELD_SEP}noart"

    monkeypatch.setattr(music_playlist_service, "run_script", write)
    plan = paired(["a.mp3", "c.mp3", "b.mp3"], ["P3", "P2", "P1"], ["c.mp3", "b.mp3", "a.mp3"], ["c.mp3", "b.mp3", "a.mp3"])
    music_playlist_service._write_apple(plan, "APL", {"b.mp3": "P2", "c.mp3": "P3"})
    assert sent == ["-2:P2", "-1:P3", "+P3", "+P2"]


def test_songs_only_in_apple_music_are_never_removed():
    plan = paired(["b.mp3", "a.mp3", "c.mp3"], ["P2", "X9", "P1", "X8"], ["b.mp3", "a.mp3"], ["b.mp3", "a.mp3"])
    assert (plan.apple_remove, plan.apple_add) == ([], ["c.mp3"])

    plan = paired(["b.mp3", "a.mp3"], ["P2", "X9", "P1", "X8"], ["b.mp3", "a.mp3"], ["b.mp3", "a.mp3"])
    assert plan.action == "in_sync"


def test_copies_are_removed_by_position():
    plan = paired(["a.mp3", "b.mp3", "a.mp3"], ["P2", "P1", "P1"], ["b.mp3", "a.mp3", "a.mp3"], ["b.mp3", "a.mp3", "a.mp3"])
    assert (plan.apple_remove, plan.apple_add) == ([(3, "P1"), (1, "P2")], ["b.mp3", "a.mp3"])


def test_an_old_link_ignores_apple_order_and_keeps_myp3d_order():
    plan = paired(["c.mp3", "b.mp3", "a.mp3"], ["P1", "P2", "P3"], ["c.mp3", "b.mp3", "a.mp3"], ["c.mp3", "b.mp3", "a.mp3"], ordered=False)
    assert (plan.action, plan.local) == ("push", ["c.mp3", "b.mp3", "a.mp3"])
    assert (plan.apple_remove, plan.apple_add) == ([(2, "P2"), (1, "P1")], ["b.mp3", "a.mp3"])


def test_an_old_link_pulls_apple_additions_without_reordering_myp3d():
    plan = paired(["c.mp3", "b.mp3", "a.mp3"], ["P4", "P3", "P2", "P1"], ["c.mp3", "b.mp3", "a.mp3"], ["a.mp3", "b.mp3", "c.mp3"], ordered=False)
    assert (plan.action, plan.local) == ("pull", ["d.mp3", "c.mp3", "b.mp3", "a.mp3"])
    assert (plan.apple_remove, plan.apple_add) == ([], [])


def test_an_interrupted_apple_write_is_retried_instead_of_pulled():
    plan = paired(["c.mp3", "b.mp3", "a.mp3"], ["P1"], ["c.mp3", "b.mp3", "a.mp3"], ["c.mp3", "b.mp3", "a.mp3"], pending=True)
    assert (plan.action, plan.local) == ("push", ["c.mp3", "b.mp3", "a.mp3"])
    assert (plan.apple_remove, plan.apple_add) == ([(1, "P1")], ["c.mp3", "b.mp3", "a.mp3"])


def test_exports_add_top_down_and_imports_keep_the_shown_order():
    [export] = plan_sync([], [local_state(["c.mp3", "b.mp3", "a.mp3"])], {}, FILE_OF, set(FILE_OF.values()))
    assert (export.action, export.apple, export.apple_add) == ("export", ["c.mp3", "b.mp3", "a.mp3"], ["c.mp3", "b.mp3", "a.mp3"])

    [imported] = plan_sync([apple_playlist(["P3", "P2", "P1"])], [], {}, FILE_OF, set(FILE_OF.values()))
    assert (imported.action, imported.local) == ("import", ["c.mp3", "b.mp3", "a.mp3"])


def test_a_first_link_puts_apple_only_songs_on_top():
    [plan] = plan_sync([apple_playlist(["P4", "P1"])], [local_state(["b.mp3", "a.mp3"])], {}, FILE_OF, set(FILE_OF.values()))
    assert (plan.action, plan.local) == ("link", ["d.mp3", "b.mp3", "a.mp3"])
    assert (plan.apple_remove, plan.apple_add) == ([(2, "P1")], ["b.mp3", "a.mp3"])
