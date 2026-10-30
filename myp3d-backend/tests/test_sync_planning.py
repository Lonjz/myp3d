from datetime import datetime, timedelta, timezone

from models.schemas import SyncDatabase, SyncFavoriteRecord, SyncPlaylistRecord, SyncQueueRecord
from services import database_sync, sync_service

NOW = datetime(2026, 10, 1, tzinfo=timezone.utc)


def plan(manifest, peer_library, accepter_is_remote: bool):
    return sync_service._plan_pulls(sync_service._local_entries(), manifest(peer_library.dir), accepter_is_remote)


def pulls(result) -> list[tuple]:
    return [(pull.kind, pull.source, pull.target) for pull in result.pulls]


def test_new_songs_come_over(library, peer_library, manifest):
    library.add("shared.mp3", "Shared", "Band", freq=300)
    peer_library.add("shared.mp3", "Shared", "Band", freq=300)
    peer_library.add("theirs.mp3", "Theirs", "Band", freq=310)
    assert pulls(plan(manifest, peer_library, True)) == [("new", None, "theirs.mp3")]


def test_different_songs_with_the_same_name_are_both_kept(library, peer_library, manifest):
    library.add("song.mp3", "Mine", "Band", freq=300)
    library.add("song (2).mp3", "Mine Too", "Band", freq=305)
    peer_library.add("song.mp3", "Theirs", "Band", freq=310)
    assert pulls(plan(manifest, peer_library, True)) == [("new", None, "song (3).mp3")]


def test_same_song_takes_the_accepters_tags_and_name(library, peer_library, manifest):
    library.add("mine.mp3", "Old Title", "Band", freq=300)
    peer_library.add("theirs.mp3", "New Title", "Band", freq=300)

    [pull] = plan(manifest, peer_library, True).pulls
    assert (pull.kind, pull.source, pull.target, pull.retag, pull.same_audio) == ("update", "mine.mp3", "theirs.mp3", True, True)
    assert plan(manifest, peer_library, False).pulls == []


def test_identical_songs_need_nothing(library, peer_library, manifest):
    library.add("song.mp3", "Song", "Band", freq=300)
    peer_library.path("song.mp3").write_bytes(library.path("song.mp3").read_bytes())
    assert plan(manifest, peer_library, True).pulls == []


def test_trimmed_copy_wins_when_everything_else_matches(library, peer_library, manifest):
    library.add("song.mp3", "Song", "Band", "Album", seconds=5, freq=300, cover=(10, 20, 30))
    peer_library.add("song.mp3", "Song", "Band", "Album", seconds=4, freq=300, cover=(10, 20, 30))

    [pull] = plan(manifest, peer_library, True).pulls
    assert (pull.same_audio, pull.swap) == (False, "theirs")
    [pull] = plan(manifest, peer_library, False).pulls
    assert pull.swap == "splice"


def test_longer_copy_never_replaces_a_trimmed_one(library, peer_library, manifest):
    library.add("song.mp3", "Song", "Band", "Album", seconds=4, freq=300)
    peer_library.add("song.mp3", "Song", "Band", "Album", seconds=5, freq=300)
    assert plan(manifest, peer_library, True).pulls == []
    assert plan(manifest, peer_library, False).pulls == []


def test_fallback_needs_every_tag_to_match(library, peer_library, manifest):
    library.add("song.mp3", "Song", "Band", "Album", seconds=5, freq=300)
    peer_library.add("song.mp3", "Song", "Band", "Other Album", seconds=4, freq=300)
    assert pulls(plan(manifest, peer_library, True)) == [("new", None, "song (2).mp3")]


def test_earlier_date_added_carries_over(library, peer_library, manifest):
    library.add("song.mp3", "Song", "Band", freq=300)
    peer_library.path("song.mp3").write_bytes(library.path("song.mp3").read_bytes())
    remote = manifest(peer_library.dir)
    remote["song.mp3"]["date_added"] = (NOW - timedelta(days=400)).isoformat()
    [pull] = sync_service._plan_pulls(sync_service._local_entries(), remote, False).pulls
    assert pull.redate is True


def playlist(id_: str, name: str, filenames: list[str], updated: datetime, deleted: bool = False) -> SyncPlaylistRecord:
    stamp = updated.isoformat()
    return SyncPlaylistRecord(id=id_, name=name, filenames=filenames, created_at=NOW.isoformat(), updated_at=stamp, deleted_at=stamp if deleted else None)


def download(uid: str, updated: datetime) -> SyncQueueRecord:
    return SyncQueueRecord(uid=uid, url="https://youtu.be/x", status="pending", created_at=NOW.isoformat(), updated_at=updated.isoformat())


PLAYLIST = "a" * 32
DOWNLOAD = "b" * 32


def keys(result) -> list[tuple]:
    return [(pull.kind, pull.key, pull.replaces) for pull in result]


def test_newest_record_wins_and_ties_go_to_the_accepter():
    older = SyncDatabase(playlists=[playlist(PLAYLIST, "Old", [], NOW)])
    newer = SyncDatabase(playlists=[playlist(PLAYLIST, "New", [], NOW + timedelta(minutes=1))])
    tie = SyncDatabase(playlists=[playlist(PLAYLIST, "Tie", [], NOW)])

    assert keys(database_sync.plan_pulls(older, newer, False)) == [("playlist", PLAYLIST, True)]
    assert database_sync.plan_pulls(newer, older, True) == []
    assert keys(database_sync.plan_pulls(older, tie, True)) == [("playlist", PLAYLIST, True)]
    assert database_sync.plan_pulls(older, tie, False) == []


def test_deletions_carry_over_as_tombstones():
    local = SyncDatabase(playlists=[playlist(PLAYLIST, "Mix", ["a.mp3"], NOW)])
    remote = SyncDatabase(playlists=[playlist(PLAYLIST, "Mix", [], NOW + timedelta(minutes=1), deleted=True)])
    [pull] = database_sync.plan_pulls(local, remote, False)
    assert pull.record.deleted_at is not None
    assert database_sync.is_visible(pull)
    assert not database_sync.is_visible(database_sync.plan_pulls(SyncDatabase(), remote, False)[0])


def test_running_downloads_are_left_alone():
    local = SyncDatabase(downloads=[download(DOWNLOAD, NOW)])
    remote = SyncDatabase(downloads=[download(DOWNLOAD, NOW + timedelta(minutes=1))])
    assert database_sync.plan_pulls(local, remote, False, busy={DOWNLOAD}) == []


def test_renamed_songs_are_translated_in_records():
    remote = SyncDatabase(
        playlists=[playlist(PLAYLIST, "Mix", ["theirs.mp3", "other.mp3"], NOW)],
        favorites=[SyncFavoriteRecord(filename="theirs.mp3", created_at=NOW.isoformat(), updated_at=NOW.isoformat())],
    )
    translated = database_sync.translate(remote, {"theirs.mp3": "mine.mp3"})
    assert translated.playlists[0].filenames == ["mine.mp3", "other.mp3"]
    assert translated.favorites[0].filename == "mine.mp3"


def test_applying_records(library):
    from services import favorite_service, playlist_service, queue_service

    record = playlist(PLAYLIST, "From Peer", ["a.mp3"], NOW)
    database_sync.apply_pull(database_sync.RecordPull("playlist", record, False), SyncDatabase(), lambda *_: b"")
    assert playlist_service.stored_filenames(PLAYLIST) == ["a.mp3"]

    favorite = SyncFavoriteRecord(filename="a.mp3", created_at=NOW.isoformat(), updated_at=NOW.isoformat())
    database_sync.apply_pull(database_sync.RecordPull("favorite", favorite, False), SyncDatabase(), lambda *_: b"")
    assert favorite_service.list_filenames() == {"a.mp3"}

    assert database_sync.apply_pull(database_sync.RecordPull("download", download(DOWNLOAD, NOW), False), SyncDatabase(), lambda *_: b"")
    assert [item.url for item in queue_service.list_items()] == ["https://youtu.be/x"]
