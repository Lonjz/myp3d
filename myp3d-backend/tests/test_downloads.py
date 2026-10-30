import base64

from yt_dlp.utils import DownloadError

from tests.conftest import LIBRARY_DIR


def test_download_with_tags_and_cover(client, library, youtube, cover_jpeg):
    video = youtube.add_video("Fleetwood Mac - Dreams (Official Music Video)")
    response = client.post(
        "/download",
        json={
            "url": video.url,
            "custom_filename": "Dreams",
            "title": "Dreams",
            "artist": "Fleetwood Mac",
            "album": "Rumours",
            "cover_image_base64": "data:image/jpeg;base64," + base64.b64encode(cover_jpeg).decode(),
        },
    )
    assert response.status_code == 200
    assert response.json()["filename"] == "dreams.mp3"
    tags = library.tags("dreams.mp3")
    assert (tags["title"], tags["artist"], tags["album"], tags["has_cover"]) == ("Dreams", "Fleetwood Mac", "Rumours", True)
    assert client.get("/mp3s/all").json()[0]["filename"] == "dreams.mp3"


def test_download_without_name_uses_video_title(client, library, youtube):
    video = youtube.add_video("Let It Happen")
    assert client.post("/download", json={"url": video.url}).json()["filename"] == "Let It Happen.mp3"
    assert library.names() == ["Let It Happen.mp3"]


def test_download_options(client, library, youtube):
    video = youtube.add_video()
    client.post("/download", json={"url": video.url, "custom_filename": "trimmed", "start_time": 1, "end_time": 3})
    opts = youtube.downloads()[-1].opts
    assert opts["download_ranges"].ranges == [(1, 3)]
    assert opts["extractor_args"] == {"youtube": {"player_client": ["default", "tv", "ios"]}}
    assert opts["postprocessors"][0]["preferredquality"] == "320"
    assert "cookiesfrombrowser" not in opts


def test_download_retries_with_browser_cookies(client, library, youtube):
    video = youtube.add_video()
    youtube.fail_next()
    assert client.post("/download", json={"url": video.url, "custom_filename": "retry"}).status_code == 200
    first, second = youtube.downloads()
    assert "cookiesfrombrowser" not in first.opts
    assert second.opts["cookiesfrombrowser"][0] == "firefox"


def test_download_rejects_bad_trim(client, library, youtube):
    video = youtube.add_video()
    response = client.post("/download", json={"url": video.url, "start_time": 5, "end_time": 2})
    assert response.status_code == 400
    assert youtube.calls == []


def test_unavailable_video_fails(client, library, youtube):
    response = client.post("/download", json={"url": "https://www.youtube.com/watch?v=missing0000"})
    assert response.status_code == 500
    assert "unavailable" in response.json()["detail"]
    assert library.names() == []


def test_download_name_cannot_escape_the_library(client, library, youtube):
    video = youtube.add_video()
    response = client.post("/download", json={"url": video.url, "custom_filename": "../escaped"})
    assert response.status_code == 400
    assert not (LIBRARY_DIR.parent / "escaped.mp3").exists()


def test_download_name_keeps_percent_signs(client, library, youtube):
    video = youtube.add_video()
    response = client.post("/download", json={"url": video.url, "custom_filename": "100%(id)s"})
    assert response.json()["filename"] == "100%(id)s.mp3"
    assert library.names() == ["100%(id)s.mp3"]


def test_youtube_search(client, youtube):
    youtube.search_results = [youtube.add_video("Nights"), youtube.add_video("White Ferrari", uploader="Frank Ocean")]
    body = client.get("/youtube/search", params={"query": "nights", "limit": 5}).json()
    assert [result["title"] for result in body["results"]] == ["Nights", "White Ferrari"]
    assert body["results"][1]["artist"] == "Frank Ocean"
    assert youtube.calls[0].url == "ytsearch5:nights"


def test_youtube_search_reports_failures(client, youtube):
    youtube.fail_next(DownloadError("boom"), times=2)
    response = client.get("/youtube/search", params={"query": "anything"})
    assert response.status_code == 500


def test_existing_names_need_overwrite(client, library, youtube):
    library.add("taken.mp3", "Original")
    video = youtube.add_video()
    response = client.post("/download", json={"url": video.url, "custom_filename": "taken"})
    assert (response.status_code, response.json()["detail"]) == (400, "Already in library")
    assert youtube.calls == []

    assert client.post("/download", json={"url": video.url, "custom_filename": "taken", "title": "Replaced", "overwrite": True}).status_code == 200
    assert library.tags("taken.mp3")["title"] == "Replaced"


def test_failed_cookie_retry_reports_the_original_error(client, library, youtube):
    video = youtube.add_video()
    youtube.fail_next(DownloadError("ERROR: Sign in to confirm you're not a bot"))
    youtube.fail_next(DownloadError("ERROR: could not find firefox cookies database"))
    response = client.post("/download", json={"url": video.url})
    assert "Sign in to confirm" in response.json()["detail"]
