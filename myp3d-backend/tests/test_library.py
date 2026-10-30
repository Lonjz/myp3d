from services.mp3_service import make_album_key
from tests.seed import DEFAULT_LIBRARY


def names(items) -> list[str]:
    return [item["filename"] for item in items]


def test_empty_library_lists_nothing(client, library):
    body = client.get("/mp3s/paged").json()
    assert body["items"] == []
    assert body["meta"]["total"] == 0
    assert body["meta"]["total_pages"] == 1


def test_lists_every_track_with_tags(client, seeded_library):
    tracks = {track["filename"]: track for track in client.get("/mp3s/all").json()}
    assert set(tracks) == {track.filename for track in DEFAULT_LIBRARY}
    glass = tracks["dreams.mp3"]
    assert (glass["title"], glass["artist"], glass["album"]) == ("Dreams", "Fleetwood Mac", "Rumours")
    assert glass["has_cover"] is True
    assert 2.5 < glass["duration"] < 3.5
    assert tracks["redbone.mp3"]["title"] is None
    assert tracks["good days.mp3"]["has_cover"] is False


def test_pagination(client, seeded_library):
    first = client.get("/mp3s/paged", params={"limit": 5, "sort_by": "filename", "sort_direction": "asc"}).json()
    last = client.get("/mp3s/paged", params={"limit": 5, "page": 3, "sort_by": "filename", "sort_direction": "asc"}).json()
    assert first["meta"] == {"total": 12, "page": 1, "limit": 5, "total_pages": 3, "returned": 5}
    assert last["meta"]["returned"] == 2
    assert names(first["items"])[0] == "Broken_Clocks!.mp3"


def test_sorting(client, seeded_library):
    by_duration = names(client.get("/mp3s/all", params={"sort_by": "duration", "sort_direction": "desc"}).json())
    assert by_duration[0] == "videotape.mp3"
    by_artist = client.get("/mp3s/all", params={"sort_by": "artist", "sort_direction": "asc"}).json()
    assert by_artist[0]["artist"] is None
    assert by_artist[-1]["artist"] == "SZA, Kendrick Lamar"


def test_search_and_field_filters(client, seeded_library):
    assert set(names(client.get("/mp3s/all", params={"search": "reckon"}).json())) == {"reckoner.mp3", "reckoner live.mp3"}
    assert set(names(client.get("/mp3s/all", params={"search": "rumours", "filter_by": "album"}).json())) == {
        "dreams.mp3", "songbird.mp3", "the chain.mp3",
    }
    assert client.get("/mp3s/all", params={"search": "rumours", "filter_by": "title"}).json() == []


def test_duration_filter(client, seeded_library):
    assert client.get("/mp3s/all", params={"duration": "2-3"}).json() == []
    assert len(client.get("/mp3s/all", params={"duration": "under-2"}).json()) == 12


def test_issue_filters(client, seeded_library, make_playlist, star):
    def issue(name: str) -> set[str]:
        return set(names(client.get("/mp3s/all", params={"issue": name}).json()))

    assert issue("title") == {"redbone.mp3"}
    assert issue("album") == {"redbone.mp3", "good days.mp3"}
    assert issue("cover") == {"redbone.mp3", "good days.mp3"}
    assert issue("duplicate") == {"reckoner.mp3", "reckoner live.mp3"}
    make_playlist("Mix", ["dreams.mp3"])
    assert "dreams.mp3" not in issue("playlist")
    star("the chain.mp3")
    assert names(client.get("/mp3s/all", params={"favorites": True}).json()) == ["the chain.mp3"]


def test_track_info_and_audio(client, seeded_library):
    info = client.get("/mp3s/the chain.mp3/info").json()
    assert info["title"] == "The Chain"
    audio = client.get("/mp3s/the chain.mp3")
    assert audio.status_code == 200
    assert audio.headers["content-type"] == "audio/mpeg"
    assert audio.content == seeded_library.path("the chain.mp3").read_bytes()


def test_covers(client, seeded_library):
    full = client.get("/mp3s/dreams.mp3/cover")
    assert full.status_code == 200
    assert full.headers["content-type"] == "image/jpeg"
    thumb = client.get("/mp3s/dreams.mp3/cover", params={"size": "thumb"})
    assert thumb.status_code == 200
    assert client.get("/mp3s/good days.mp3/cover").status_code == 404


def test_albums_group_tracks(client, seeded_library):
    albums = {album["album_name"]: album for album in client.get("/albums/paged", params={"limit": 50}).json()["items"]}
    assert albums["Rumours"]["track_count"] == 3
    assert albums["Rumours"]["artists"] == ["Fleetwood Mac"]
    assert albums["(No Album)"]["track_count"] == 2
    detail = client.get(f"/albums/{make_album_key('Rumours')}").json()
    assert [track["title"] for track in detail["tracks"]] == ["Dreams", "Songbird", "The Chain"]
    assert client.get(f"/albums/{make_album_key('rumours')}").status_code == 200
    assert client.get("/albums/nope").status_code == 404


def test_album_search_and_cover(client, seeded_library):
    found = client.get("/albums/paged", params={"search": "radiohead"}).json()["items"]
    assert {album["album_name"] for album in found} == {"In Rainbows", "In Rainbows (From the Basement)"}
    found = client.get("/albums/paged", params={"search": "kendrick"}).json()["items"]
    assert [album["album_name"] for album in found] == ["Ctrl"]
    cover = client.get(f"/albums/{make_album_key('Rumours')}/cover", params={"size": "thumb"})
    assert cover.status_code == 200


def test_spotlight_search(client, seeded_library):
    results = client.get("/search", params={"q": "fleetwood"}).json()
    assert {track["artist"] for track in results["tracks"]} == {"Fleetwood Mac"}
    assert [album["album_name"] for album in results["albums"]] == ["Rumours"]
    assert client.get("/search", params={"q": ""}).json() == {"tracks": [], "albums": []}


def test_stats(client, seeded_library, star):
    star("dreams.mp3")
    stats = client.get("/stats").json()
    assert stats["total_tracks"] == 12
    assert stats["total_favorites"] == 1
    assert stats["health"]["missing_title"] == 1
    assert stats["health"]["duplicates"] == 2
    assert {artist["name"]: artist["track_count"] for artist in stats["top_artists"][:2]} == {"Radiohead": 3, "Fleetwood Mac": 3}
    assert stats["tracks_with_cover"] == 10


def test_edits_only_reread_changed_files(client, seeded_library, monkeypatch):
    from services import mp3_service

    client.get("/mp3s/all")
    reads: list[str] = []
    original = mp3_service.get_mp3_info
    monkeypatch.setattr(mp3_service, "get_mp3_info", lambda path: reads.append(path.name) or original(path))
    client.put("/mp3s/the chain.mp3/metadata", json={"title": "The Chain II"})
    tracks = {track["filename"]: track for track in client.get("/mp3s/all").json()}
    assert reads == ["the chain.mp3"]
    assert tracks["the chain.mp3"]["title"] == "The Chain II"
    assert tracks["the chain.mp3"]["album_key"] == make_album_key("Rumours")
