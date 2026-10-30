from services import spotify_service
from tests.fakes import spotify_list, spotify_track, ytmusic_result

TRACK_ID = "4uLU6hMCjMI75M1A2tKUQC"
ALBUM_ID = "1A2B3C4D5E6F7G8H9I0J1K"
PLAYLIST_ID = "37i9dQZF1DXcBWIGoYBM5M"


def track_id(number: int) -> str:
    return f"{number:022d}"


def test_title_and_filename_rules():
    assert spotify_service.format_title("Song (feat. B)", ["A", "B", "C"]) == "Song (feat. B, C)"
    assert spotify_service.format_title("Song", ["A"]) == "Song"
    assert spotify_service.default_filename("Héllo, World! (feat. X)") == "hllo world"
    assert spotify_service.default_filename("!!!") is None


def test_resolve_track_links_without_fetching(client, web):
    body = client.post("/spotify/resolve", json={"text": f"https://open.spotify.com/track/{TRACK_ID}?si=x and spotify:track:{TRACK_ID}"}).json()
    assert [track["id"] for track in body["tracks"]] == [TRACK_ID]
    assert web.requests == []


def test_resolve_album(client, web):
    web.spotify("album", ALBUM_ID, spotify_list("Rumours", [(track_id(1), "Dreams", "Fleetwood Mac"), (track_id(2), "The Chain", "Fleetwood Mac")], "https://i.scdn.co/a.jpg"))
    body = client.post("/spotify/resolve", json={"text": f"https://open.spotify.com/album/{ALBUM_ID}"}).json()
    assert [(track["name"], track["album"], track["cover_url"]) for track in body["tracks"]] == [
        ("Dreams", "Rumours", "https://i.scdn.co/a.jpg"),
        ("The Chain", "Rumours", "https://i.scdn.co/a.jpg"),
    ]
    assert body["truncated"] is False


def test_resolve_large_playlist_is_truncated(client, web):
    web.spotify("playlist", PLAYLIST_ID, spotify_list("Big", [(track_id(index), f"Song {index}", "A") for index in range(100)]))
    body = client.post("/spotify/resolve", json={"text": f"https://open.spotify.com/playlist/{PLAYLIST_ID}"}).json()
    assert len(body["tracks"]) == 100
    assert body["truncated"] is True


def test_resolve_errors(client, web):
    assert client.post("/spotify/resolve", json={"text": "no links here"}).status_code == 400
    web.spotify("album", ALBUM_ID, None)
    response = client.post("/spotify/resolve", json={"text": f"https://open.spotify.com/album/{ALBUM_ID}"})
    assert response.status_code == 404
    web.spotify("playlist", PLAYLIST_ID, {}, status=500)
    assert client.post("/spotify/resolve", json={"text": f"https://open.spotify.com/playlist/{PLAYLIST_ID}"}).status_code == 502


def test_one_bad_link_is_skipped(client, web):
    web.spotify("album", ALBUM_ID, spotify_list("Rumours", [(track_id(1), "Dreams", "Fleetwood Mac")]))
    web.spotify("playlist", PLAYLIST_ID, None)
    body = client.post("/spotify/resolve", json={"text": f"spotify:album:{ALBUM_ID} spotify:playlist:{PLAYLIST_ID}"}).json()
    assert (len(body["tracks"]), body["skipped"]) == (1, 1)


def test_match_prefers_explicit_song(client, library, web, ytmusic):
    web.spotify("track", TRACK_ID, spotify_track(TRACK_ID, "Money Trees (feat. Jay Rock)", ["Kendrick Lamar", "Jay Rock"], 201, explicit=True))
    ytmusic.results["songs"] = [
        ytmusic_result("clean000001", "Money Trees (Clean)", ["Kendrick Lamar"], seconds=200),
        ytmusic_result("explicit001", "Money Trees", ["Kendrick Lamar", "Jay Rock"], seconds=201, explicit=True),
        ytmusic_result("cover000001", "Money Trees (Karaoke Version)", ["Sing Along"], seconds=199),
    ]
    body = client.get(f"/spotify/tracks/{TRACK_ID}", params={"album": "good kid, m.A.A.d city"}).json()
    assert body["title"] == "Money Trees (feat. Jay Rock)"
    assert body["artist"] == "Kendrick Lamar"
    assert body["filename"] == "money trees"
    assert body["track"]["album"] == "good kid, m.A.A.d city"
    assert body["candidates"][0]["video_id"] == "explicit001"
    assert body["candidates"][-1]["video_id"] == "cover000001"
    assert body["in_library"] is False


def test_match_searches_videos_when_songs_are_weak(client, library, web, ytmusic):
    web.spotify("track", TRACK_ID, spotify_track(TRACK_ID, "Rare Song", ["Unknown Band"]))
    ytmusic.results["videos"] = [ytmusic_result("video000001", "Unknown Band - Rare Song", ["Unknown Band"])]
    body = client.get(f"/spotify/tracks/{TRACK_ID}", params={"album": "x"}).json()
    assert [query[1] for query in ytmusic.searches] == ["songs", "videos"]
    assert body["candidates"][0]["kind"] == "video"


def test_match_falls_back_to_youtube_search(client, library, web, ytmusic, youtube):
    web.spotify("track", TRACK_ID, spotify_track(TRACK_ID, "Rare Song", ["Unknown Band"]))
    ytmusic.error = RuntimeError("ytmusic is down")
    youtube.search_results = [youtube.add_video("Unknown Band - Rare Song", uploader="Unknown Band")]
    body = client.get(f"/spotify/tracks/{TRACK_ID}", params={"album": "x"}).json()
    assert body["candidates"][0]["title"] == "Unknown Band - Rare Song"


def test_match_knows_songs_already_in_the_library(client, library, web, ytmusic):
    library.add("money trees.mp3", "Money Trees (feat. Jay Rock)", "Kendrick Lamar")
    web.spotify("track", TRACK_ID, spotify_track(TRACK_ID, "Money Trees", ["Kendrick Lamar", "Jay Rock"]))
    assert client.get(f"/spotify/tracks/{TRACK_ID}", params={"album": "x"}).json()["in_library"] is True


def test_match_rejects_bad_ids(client):
    assert client.get("/spotify/tracks/short").status_code == 400
