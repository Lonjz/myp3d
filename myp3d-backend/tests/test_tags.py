from services import favorite_service, playlist_service
from services.mp3_service import make_album_key


def test_edit_tags(client, seeded_library):
    response = client.put("/mp3s/the chain.mp3/metadata", json={"title": "The Chain (Live)", "artist": "Fleetwood Mac", "album": "Live"})
    assert response.json()["filename"] == "the chain.mp3"
    tags = seeded_library.tags("the chain.mp3")
    assert (tags["title"], tags["artist"], tags["album"]) == ("The Chain (Live)", "Fleetwood Mac", "Live")
    assert client.get("/mp3s/the chain.mp3/info").json()["album"] == "Live"


def test_rename_moves_playlists_favourites_and_dates(client, seeded_library, make_playlist, star):
    playlist_id = make_playlist("Mix", ["dreams.mp3", "the chain.mp3"])
    star("the chain.mp3")
    added = client.get("/mp3s/the chain.mp3/info").json()["date_added"]

    response = client.put("/mp3s/the chain.mp3/metadata", json={"new_filename": "Deep Water"})
    assert response.json()["filename"] == "deep water.mp3"

    assert "deep water.mp3" in seeded_library.names()
    assert "the chain.mp3" not in seeded_library.names()
    assert playlist_service.stored_filenames(playlist_id) == ["dreams.mp3", "deep water.mp3"]
    assert "deep water.mp3" in favorite_service.list_filenames()
    assert "the chain.mp3" not in favorite_service.list_filenames()
    assert client.get("/mp3s/deep water.mp3/info").json()["date_added"] == added


def test_rename_refuses_to_overwrite(client, seeded_library):
    response = client.put("/mp3s/the chain.mp3/metadata", json={"new_filename": "dreams.mp3"})
    assert response.status_code == 400
    assert "the chain.mp3" in seeded_library.names()


def test_failed_rename_leaves_tags_alone(client, seeded_library):
    client.put("/mp3s/the chain.mp3/metadata", json={"title": "Changed", "new_filename": "dreams.mp3"})
    assert seeded_library.tags("the chain.mp3")["title"] == "The Chain"


def test_case_only_rename(client, library):
    library.add("Song.mp3", "Song", "Artist")
    response = client.put("/mp3s/Song.mp3/metadata", json={"new_filename": "song"})
    assert response.status_code == 200
    assert library.names() == ["song.mp3"]


def test_cover_upload(client, seeded_library, cover_jpeg):
    response = client.post("/mp3s/good days.mp3/cover", files={"cover": ("cover.jpg", cover_jpeg, "image/jpeg")})
    assert response.status_code == 200
    assert seeded_library.tags("good days.mp3")["has_cover"] is True


def test_cover_upload_rejects_non_images(client, seeded_library):
    response = client.post("/mp3s/good days.mp3/cover", files={"cover": ("cover.jpg", b"not an image", "image/jpeg")})
    assert response.status_code == 400
    response = client.post("/mp3s/good days.mp3/cover", files={"cover": ("notes.txt", b"hello", "text/plain")})
    assert response.status_code == 400


def test_bulk_metadata(client, seeded_library):
    response = client.post("/mp3s/bulk/metadata", json={"filenames": ["reckoner.mp3", "videotape.mp3", "missing.mp3"], "album": "Kid A"})
    body = response.json()
    assert body["updated"] == ["reckoner.mp3", "videotape.mp3"]
    assert body["failed"] == [{"filename": "missing.mp3", "detail": "MP3 file not found"}]
    assert seeded_library.tags("reckoner.mp3")["album"] == "Kid A"
    assert seeded_library.tags("reckoner.mp3")["artist"] == "Radiohead"


def test_bulk_cover(client, seeded_library, cover_jpeg):
    response = client.post(
        "/mp3s/bulk/cover",
        files={"cover": ("cover.jpg", cover_jpeg, "image/jpeg")},
        data={"filenames": ["redbone.mp3", "good days.mp3"]},
    )
    assert response.json()["updated"] == ["redbone.mp3", "good days.mp3"]
    assert seeded_library.tags("redbone.mp3")["has_cover"] is True


def test_bulk_delete_cleans_up(client, seeded_library, make_playlist, star):
    playlist_id = make_playlist("Mix", ["dreams.mp3", "the chain.mp3"])
    star("the chain.mp3")
    response = client.post("/mp3s/bulk/delete", json={"filenames": ["the chain.mp3"]})
    assert response.json()["updated"] == ["the chain.mp3"]
    assert "the chain.mp3" not in seeded_library.names()
    assert playlist_service.stored_filenames(playlist_id) == ["dreams.mp3"]
    assert "the chain.mp3" not in favorite_service.list_filenames()


def test_single_delete(client, seeded_library):
    assert client.delete("/mp3s/the chain.mp3").status_code == 200
    assert "the chain.mp3" not in seeded_library.names()
    assert client.delete("/mp3s/the chain.mp3").status_code == 404


def test_album_rename_merges_into_existing(client, seeded_library):
    response = client.put(f"/albums/{make_album_key('In Rainbows (From the Basement)')}", json={"album_name": "In Rainbows"})
    assert response.json()["album_key"] == make_album_key("In Rainbows")
    detail = client.get(f"/albums/{make_album_key('In Rainbows')}").json()
    assert detail["album"]["track_count"] == 3
    assert client.get(f"/albums/{make_album_key('In Rainbows (From the Basement)')}").status_code == 404


def test_album_artist_edit(client, seeded_library):
    client.put(f"/albums/{make_album_key('Ctrl')}", json={"album_name": "Ctrl", "artist": "SZA"})
    assert {seeded_library.tags(name)["artist"] for name in ("Broken_Clocks!.mp3", "doves in the wind.mp3")} == {"SZA"}


def test_album_cover(client, seeded_library, cover_jpeg):
    key = make_album_key("Rumours")
    response = client.post(f"/albums/{key}/cover", files={"cover": ("c.jpg", cover_jpeg, "image/jpeg")})
    assert response.json()["updated_tracks"] == 3


def test_dates_survive_cache_rebuilds(client, seeded_library):
    first = client.get("/mp3s/dreams.mp3/info").json()["date_added"]
    seeded_library.path("dreams.mp3").touch()
    client.post("/cache/clear")
    assert client.get("/mp3s/dreams.mp3/info").json()["date_added"] == first


def test_rename_keeps_the_favourite_position(client, seeded_library, star):
    star("the chain.mp3")
    star("reckoner.mp3")
    client.put("/mp3s/the chain.mp3/metadata", json={"new_filename": "deep water"})
    assert client.get("/favorites").json() == ["deep water.mp3", "reckoner.mp3"]


def test_deleting_a_song_in_use(client, seeded_library, monkeypatch):
    def locked(self, missing_ok=False):
        raise PermissionError(13, "Permission denied")

    monkeypatch.setattr("pathlib.Path.unlink", locked)
    response = client.delete("/mp3s/the chain.mp3")
    assert (response.status_code, response.json()["detail"]) == (409, "The song is in use. Stop playing it and try again")
    bulk = client.post("/mp3s/bulk/delete", json={"filenames": ["reckoner.mp3"]}).json()
    assert bulk["failed"][0]["detail"] == "The song is in use. Stop playing it and try again"


def test_broken_embedded_covers_have_no_thumbnail(client, library):
    import eyed3

    path = library.add("broken.mp3", "Broken", "Band", cover=(1, 2, 3))
    audio = eyed3.load(str(path))
    audio.tag.images.set(0, b"\xff\xd8\xff\xe0 not really a jpeg", "image/jpeg", description="")
    audio.tag.save(version=(2, 3, 0))
    assert client.get("/mp3s/broken.mp3/cover", params={"size": "thumb"}).status_code == 404


def test_rename_reaches_queue_history_and_apple_snapshots(client, seeded_library, make_playlist):
    from services import music_playlist_service, queue_service
    from services.db import connect, now

    playlist_id = make_playlist("Mix", ["the chain.mp3"])
    music_playlist_service._save_link(playlist_id, "PID", music_playlist_service.Snapshot(local=["the chain.mp3"], apple=["the chain.mp3"]))
    with connect() as conn:
        conn.execute(
            "INSERT INTO queue_items (uid, position, url, status, filename, created_at, updated_at) VALUES (?, 1, 'x', 'done', 'the chain.mp3', ?, ?)",
            ("c" * 32, now(), now()),
        )

    client.put("/mp3s/the chain.mp3/metadata", json={"new_filename": "deep water"})
    assert [item.filename for item in queue_service.list_items()] == ["deep water.mp3"]
    snapshot = music_playlist_service._read_links()[playlist_id][1]
    assert (snapshot.local, snapshot.apple) == (["deep water.mp3"], ["deep water.mp3"])
