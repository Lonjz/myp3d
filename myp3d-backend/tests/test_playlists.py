import pytest

from services import favorite_playlist, favorite_service, playlist_service
from services.errors import AppError


def test_reading_one_playlist_state(client, seeded_library, make_playlist, cover_jpeg):
    playlist_id = make_playlist("Mix", ["the chain.mp3", "reckoner.mp3"])
    make_playlist("Other", ["dreams.mp3"])
    client.post(f"/playlists/{playlist_id}/cover", files={"cover": ("c.jpg", cover_jpeg, "image/jpeg")})

    state = playlist_service.get_state(playlist_id)
    assert state.filenames == ["the chain.mp3", "reckoner.mp3"]
    assert state.cover_hash is not None
    assert state in playlist_service.list_states()
    with pytest.raises(AppError):
        playlist_service.get_state("0123456789abcdef0123456789abcdef")


def test_create_and_read(client, seeded_library):
    created = client.post("/playlists", json={"name": " Road Trip ", "description": "long drives", "filenames": ["the chain.mp3", "reckoner.mp3"]}).json()
    assert created["name"] == "Road Trip"
    assert [track["filename"] for track in created["tracks"]] == ["the chain.mp3", "reckoner.mp3"]
    listed = client.get("/playlists").json()
    assert [(playlist["name"], playlist["track_count"]) for playlist in listed] == [("Road Trip", 2)]


def test_update_reorders_and_keeps_missing_tracks(client, seeded_library, make_playlist):
    playlist_id = make_playlist("Mix", ["the chain.mp3", "gone.mp3", "reckoner.mp3"])
    updated = client.put(f"/playlists/{playlist_id}", json={"name": "Renamed", "filenames": ["reckoner.mp3", "the chain.mp3"]}).json()
    assert updated["name"] == "Renamed"
    assert [track["filename"] for track in updated["tracks"]] == ["reckoner.mp3", "the chain.mp3"]
    assert playlist_service.stored_filenames(playlist_id) == ["reckoner.mp3", "the chain.mp3", "gone.mp3"]


def test_add_tracks_puts_new_ones_first(client, seeded_library, make_playlist):
    playlist_id = make_playlist("Mix", ["the chain.mp3"])
    info = client.post(f"/playlists/{playlist_id}/tracks", json={"filenames": ["reckoner.mp3", "the chain.mp3"]}).json()
    assert info["track_count"] == 2
    assert playlist_service.stored_filenames(playlist_id) == ["reckoner.mp3", "the chain.mp3"]


def test_cover(client, seeded_library, make_playlist, cover_jpeg):
    playlist_id = make_playlist("Mix")
    assert client.post(f"/playlists/{playlist_id}/cover", files={"cover": ("c.jpg", cover_jpeg, "image/jpeg")}).json()["has_cover"] is True
    assert client.get(f"/playlists/{playlist_id}/cover").headers["content-type"] == "image/jpeg"


def test_delete_leaves_a_tombstone(client, seeded_library, make_playlist):
    playlist_id = make_playlist("Mix", ["the chain.mp3"])
    assert client.delete(f"/playlists/{playlist_id}").status_code == 200
    assert client.get(f"/playlists/{playlist_id}").status_code == 404
    [record] = playlist_service.sync_records()
    assert record.deleted_at is not None
    assert record.filenames == []


def test_bad_requests(client, seeded_library):
    assert client.post("/playlists", json={"name": "   "}).status_code == 400
    assert client.post("/playlists", json={"name": "Mix", "filenames": ["../x.mp3"]}).status_code == 400
    assert client.get("/playlists/0123456789abcdef0123456789abcdef").status_code == 404


def test_favourites(client, seeded_library):
    assert client.put("/favorites/the chain.mp3").status_code == 200
    client.put("/favorites/reckoner.mp3")
    client.delete("/favorites/the chain.mp3")
    assert client.get("/favorites").json() == ["reckoner.mp3"]
    assert client.put("/favorites/notes.txt").status_code == 400


def test_faves_playlist_follows_stars(client, seeded_library, make_playlist):
    playlist_id = make_playlist("faves")
    favorite_playlist.ensure()
    assert playlist_service.favorites_id() == playlist_id

    client.put("/favorites/the chain.mp3")
    client.put("/favorites/reckoner.mp3")
    assert playlist_service.stored_filenames(playlist_id) == ["reckoner.mp3", "the chain.mp3"]
    client.delete("/favorites/the chain.mp3")
    assert playlist_service.stored_filenames(playlist_id) == ["reckoner.mp3"]


def test_unstarring_keeps_a_tombstone(seeded_library, star):
    star("the chain.mp3")
    favorite_service.set_many([], ["the chain.mp3"])
    [record] = favorite_service.sync_records()
    assert (record.filename, record.deleted_at is not None) == ("the chain.mp3", True)
