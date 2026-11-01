import pytest

from services import favorite_service, playlist_service
from tests.conftest import wait_for


def scan(client) -> dict:
    assert client.post("/health/silence/scan").json()["status"] == "scanning"
    wait_for(lambda: client.get("/health/silence").json()["status"] != "scanning", 30, "the scan")
    return client.get("/health/silence").json()


def test_scan_finds_silent_tails(client, seeded_library):
    result = scan(client)
    assert result["status"] == "done"
    assert result["total"] == 12
    assert [(track["filename"], round(track["silence"], 1)) for track in result["tracks"]] == [("videotape.mp3", 1.5)]


def test_trim_removes_the_silence_and_keeps_tags(client, seeded_library):
    before = seeded_library.tags("videotape.mp3")
    scan(client)
    result = client.post("/health/silence/trim", json={"filenames": ["videotape.mp3"]}).json()
    assert result["updated"] == ["videotape.mp3"]

    after = seeded_library.tags("videotape.mp3")
    assert after["duration"] < before["duration"] - 1
    assert {key: after[key] for key in ("title", "artist", "album", "has_cover")} == {
        key: before[key] for key in ("title", "artist", "album", "has_cover")
    }
    assert scan(client)["tracks"] == []


def test_naming_issues_and_fix(client, seeded_library, make_playlist, star):
    issues = {track["filename"]: track["suggested"] for track in client.get("/health/naming").json()}
    assert issues == {"Broken_Clocks!.mp3": "broken clocks"}

    playlist_id = make_playlist("Mix", ["Broken_Clocks!.mp3"])
    star("Broken_Clocks!.mp3")
    result = client.post("/health/naming/fix", json={"items": [{"filename": "Broken_Clocks!.mp3", "new_name": "broken clocks"}]}).json()
    assert result["updated"] == ["Broken_Clocks!.mp3"]
    assert "broken clocks.mp3" in seeded_library.names()
    assert playlist_service.stored_filenames(playlist_id) == ["broken clocks.mp3"]
    assert "broken clocks.mp3" in favorite_service.list_filenames()
    assert client.get("/health/naming").json() == []


def test_naming_fix_rejects_bad_names(client, seeded_library):
    result = client.post("/health/naming/fix", json={"items": [{"filename": "Broken_Clocks!.mp3", "new_name": "Still Bad!"}]}).json()
    assert result["failed"][0]["filename"] == "Broken_Clocks!.mp3"
    result = client.post("/health/naming/fix", json={"items": [{"filename": "Broken_Clocks!.mp3", "new_name": "the chain"}]}).json()
    assert result["failed"][0]["detail"] == "A file with that name already exists"


def test_artist_issues_and_fix(client, seeded_library):
    [issue] = client.get("/health/artists").json()
    assert issue["filename"] == "doves in the wind.mp3"
    assert issue["artists"] == ["SZA", "Kendrick Lamar"]
    assert issue["titles"] == ["Doves in the Wind (feat. Kendrick Lamar)", "Doves in the Wind (feat. SZA)"]

    client.post("/health/artists/fix", json={"items": [{"filename": "doves in the wind.mp3", "artist": "SZA"}]})
    tags = seeded_library.tags("doves in the wind.mp3")
    assert (tags["title"], tags["artist"]) == ("Doves in the Wind (feat. Kendrick Lamar)", "SZA")
    assert client.get("/health/artists").json() == []


def test_silence_bounds_skip_quiet_edges(client, library, youtube):
    video = youtube.add_video(seconds=3, silence_head=1, silence_tail=1.5)
    bounds = client.post("/youtube/silence", json={"url": video.url}).json()
    assert bounds["start"] == pytest.approx(0.9, abs=0.1)
    assert bounds["end"] == pytest.approx(bounds["duration"] - 1.4, abs=0.1)
    assert bounds["duration"] == pytest.approx(5.5, abs=0.15)
    assert library.names() == []


def test_silent_video_has_no_bounds(client, library, youtube):
    video = youtube.add_video(freq=0)
    assert client.post("/youtube/silence", json={"url": video.url}).status_code == 422


def test_silence_bounds_report_download_errors(client, library, youtube):
    youtube.fail_next()
    assert client.post("/youtube/silence", json={"url": "https://youtu.be/missing"}).status_code == 502
