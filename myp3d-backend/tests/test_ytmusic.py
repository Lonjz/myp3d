from tests.fakes import ytmusic_result

PLAYLIST_URL = "https://music.youtube.com/playlist?list={}"
ALBUM_ART = "https://lh3.googleusercontent.com/discovery=w544-h544-l90-rj"


def playlist(client, playlist_id: str):
    return client.get("/youtube/playlist", params={"url": PLAYLIST_URL.format(playlist_id)})


def test_playlist_songs_get_tags_names_and_covers(client, library, ytmusic):
    library.add("money trees.mp3", "Money Trees (feat. Jay Rock)", "Kendrick Lamar")
    ytmusic.playlists["PLmix"] = {
        "title": "Mix",
        "tracks": [
            ytmusic_result("song0000001", "Money Trees", ["Kendrick Lamar", "Jay Rock"], "good kid, m.A.A.d city", explicit=True),
            ytmusic_result("song0000002", "Nights", ["Frank Ocean"], "Blonde"),
            ytmusic_result("video000001", "Nights (Live)", ["Frank Ocean"], song=False),
            ytmusic_result("gone0000001", "Gone", ["Somebody"], available=False),
            {"title": "No video"},
        ],
    }
    body = playlist(client, "PLmix").json()
    assert (body["title"], body["unavailable"]) == ("Mix", 2)

    money, nights, live = body["tracks"]
    assert money["title"] == "Money Trees (feat. Jay Rock)"
    assert (money["artist"], money["album"], money["filename"]) == ("Kendrick Lamar", "good kid, m.A.A.d city", "money trees")
    assert (money["kind"], money["explicit"], money["in_library"]) == ("song", True, True)
    assert money["cover_url"] == "https://lh3.googleusercontent.com/song0000001=w544-h544-l90-rj"
    assert (nights["in_library"], nights["explicit"]) == (False, False)
    assert (live["kind"], live["filename"], live["cover_url"], live["explicit"]) == ("video", None, None, None)


def test_playlist_falls_back_to_youtube(client, ytmusic, youtube):
    ytmusic.error = RuntimeError("ytmusic is down")
    youtube.add_playlist("PLuploads", "Uploads", [youtube.add_video("Nights", uploader="Frank Ocean"), None])
    body = playlist(client, "PLuploads").json()
    assert (body["title"], body["unavailable"]) == ("Uploads", 1)
    assert [(track["title"], track["artist"], track["kind"], track["filename"]) for track in body["tracks"]] == [
        ("Nights", "Frank Ocean", "video", None)
    ]


def test_playlist_link_errors(client, ytmusic):
    no_list = client.get("/youtube/playlist", params={"url": "https://www.youtube.com/watch?v=abc"})
    assert (no_list.status_code, no_list.json()["detail"]) == (400, "No YouTube playlist in that link")
    ytmusic.error = RuntimeError("ytmusic is down")
    missing = playlist(client, "PLmissing")
    assert (missing.status_code, missing.json()["detail"]) == (502, "Couldn't open that playlist")


def test_search_lists_explicit_songs_then_videos(client, ytmusic):
    ytmusic.results["songs"] = [
        ytmusic_result("clean000001", "Money Trees (Clean)", ["Kendrick Lamar", "Jay Rock"]),
        ytmusic_result("radio000001", "Money Trees", ["Kendrick Lamar", "Jay Rock"]),
        ytmusic_result("swimming001", "Swimming Pools (Drank)", ["Kendrick Lamar"], explicit=True),
        ytmusic_result("explicit001", "Money Trees", ["Kendrick Lamar", "Jay Rock"], explicit=True),
    ]
    ytmusic.results["videos"] = [
        ytmusic_result("explicit001", "Money Trees", ["Kendrick Lamar"], song=False),
        ytmusic_result("video000001", "Money Trees (Official Video)", ["Kendrick Lamar"], song=False),
    ]
    body = client.get("/youtube/search", params={"query": "money trees", "limit": 10}).json()
    assert [(result["video_id"], result["kind"]) for result in body["results"]] == [
        ("explicit001", "song"),
        ("swimming001", "song"),
        ("video000001", "video"),
    ]
    assert body["results"][0]["title"] == "Money Trees (feat. Jay Rock)"
    assert ytmusic.searches == [("money trees", "songs"), ("money trees", "videos")]


def test_search_only_uses_youtube_music(client, ytmusic, youtube):
    ytmusic.error = RuntimeError("ytmusic is down")
    response = client.get("/youtube/search", params={"query": "anything"})
    assert (response.status_code, response.json()["detail"]) == (502, "Couldn't reach YouTube Music")
    assert youtube.calls == []


def test_artist_lists_top_songs_and_releases(client, library, ytmusic):
    library.add("one more time.mp3", "One More Time", "Daft Punk", "Discovery")
    ytmusic.results["artists"] = [
        {"artist": "Daft Punk Tribute", "browseId": "UCtribute"},
        {"artist": "Daft Punk", "browseId": "UCdaftpunk"},
    ]
    ytmusic.artists["UCdaftpunk"] = {
        "name": "Daft Punk",
        "songs": {"browseId": "VLtopsongs", "results": [ytmusic_result("song0000001", "One More Time", ["Daft Punk"])]},
        "albums": {
            "browseId": "MPADUCdaftpunk",
            "params": "albums",
            "results": [{"title": "Discovery", "browseId": "MPREb_discovery", "year": "2001"}],
        },
        "singles": {"results": [{"title": "Get Lucky", "browseId": "MPREb_getlucky", "type": "Single", "year": "2013"}]},
    }
    ytmusic.playlists["VLtopsongs"] = {
        "tracks": [
            ytmusic_result("song0000001", "One More Time", ["Daft Punk"], "Discovery"),
            ytmusic_result("song0000002", "Around the World", ["Daft Punk"], "Homework"),
        ]
    }
    ytmusic.artist_albums[("MPADUCdaftpunk", "albums")] = [
        {"title": "Discovery", "browseId": "MPREb_discovery", "type": "Album", "year": "2001"},
        {"title": "Homework", "browseId": "MPREb_homework", "type": "Album", "year": "1997"},
    ]

    body = client.get("/youtube/artist", params={"name": "daft punk"}).json()
    assert body["name"] == "Daft Punk"
    assert [(song["title"], song["in_library"]) for song in body["songs"]] == [("One More Time", True), ("Around the World", False)]
    assert [(release["title"], release["kind"], release["year"], release["in_library"]) for release in body["releases"]] == [
        ("Discovery", "album", "2001", True),
        ("Homework", "album", "1997", False),
        ("Get Lucky", "single", "2013", False),
    ]


def test_album_tracks_take_the_album_and_its_art(client, ytmusic):
    ytmusic.albums["MPREb_discovery"] = {
        "title": "Discovery",
        "thumbnails": [{"url": ALBUM_ART}],
        "artists": [{"name": "Daft Punk"}],
        "tracks": [
            {"videoId": "track000001", "title": "One More Time", "artists": [{"name": "Daft Punk"}], "videoType": "MUSIC_VIDEO_TYPE_OMV",
             "isAvailable": True, "isExplicit": False, "duration_seconds": 320, "thumbnails": None},
            {"videoId": "track000002", "title": "Aerodynamic", "artists": None, "isAvailable": True, "duration": "3:27"},
        ],
    }
    body = client.get("/youtube/album/MPREb_discovery").json()
    assert body["title"] == "Discovery"
    assert [(track["title"], track["artist"], track["album"], track["kind"], track["duration"]) for track in body["tracks"]] == [
        ("One More Time", "Daft Punk", "Discovery", "song", 320),
        ("Aerodynamic", "Daft Punk", "Discovery", "song", 207),
    ]
    assert body["tracks"][0]["cover_url"] == ALBUM_ART
    assert body["tracks"][0]["filename"] == "one more time"
    assert client.get("/youtube/album/not-an-album").status_code == 400


def test_similar_songs_start_from_the_library_song(client, library, ytmusic):
    library.add("nights.mp3", "Nights", "Frank Ocean")
    library.add("pink white.mp3", "Pink + White", "Frank Ocean")
    ytmusic.results["songs"] = [
        ytmusic_result("cover000001", "Nights", ["Someone Else"]),
        ytmusic_result("seed0000001", "Nights", ["Frank Ocean"]),
    ]
    ytmusic.radios["seed0000001"] = [
        ytmusic_result("seed0000001", "Nights", ["Frank Ocean"]),
        ytmusic_result("radio000001", "Pink + White", ["Frank Ocean"]),
        ytmusic_result("radio000002", "Ivy", ["Frank Ocean"]),
    ]
    body = client.get("/youtube/similar", params={"filename": "nights.mp3"}).json()
    assert ytmusic.radio_seeds == ["seed0000001"]
    assert body["title"] == "Nights"
    assert [(track["title"], track["in_library"]) for track in body["tracks"]] == [("Pink + White", True), ("Ivy", False)]


def test_discovery_errors(client, library, ytmusic):
    library.add("nights.mp3", "Nights", "Frank Ocean")
    assert client.get("/youtube/similar", params={"filename": "missing.mp3"}).status_code == 404
    not_found = client.get("/youtube/similar", params={"filename": "nights.mp3"})
    assert (not_found.status_code, not_found.json()["detail"]) == (404, "Couldn't find that song on YouTube Music")
    unknown = client.get("/youtube/artist", params={"name": "Nobody"})
    assert (unknown.status_code, unknown.json()["detail"]) == (404, "Couldn't find that artist on YouTube Music")

    ytmusic.error = RuntimeError("ytmusic is down")
    for response in (
        client.get("/youtube/artist", params={"name": "Frank Ocean"}),
        client.get("/youtube/album/MPREb_discovery"),
        client.get("/youtube/similar", params={"filename": "nights.mp3"}),
    ):
        assert (response.status_code, response.json()["detail"]) == (502, "Couldn't reach YouTube Music")
