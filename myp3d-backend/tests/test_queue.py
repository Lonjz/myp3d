import pytest

from tests.conftest import wait_for


def queue(client) -> list[dict]:
    return client.get("/queue").json()


def settled(client) -> list[dict]:
    wait_for(lambda: all(item["status"] not in ("queued", "running") for item in queue(client)), message="the queue")
    return queue(client)


def test_add_edit_and_delete(client, library, youtube):
    video = youtube.add_video()
    [item] = client.post("/queue", json={"items": [{"url": video.url, "custom_filename": "  My Song ", "title": "My Song"}]}).json()
    assert item["status"] == "pending"
    assert item["custom_filename"] == "my song"

    edited = client.patch(f"/queue/{item['id']}", json={"artist": "Someone"}).json()
    assert edited["artist"] == "Someone"

    assert client.delete(f"/queue/{item['id']}").status_code == 200
    assert queue(client) == []


def test_edit_the_trim(client, library, youtube):
    video = youtube.add_video(seconds=6)
    [item] = client.post("/queue", json={"items": [{"url": video.url, "custom_filename": "trimmed"}]}).json()

    edited = client.patch(f"/queue/{item['id']}", json={"start_time": 1, "end_time": 3}).json()
    assert (edited["start_time"], edited["end_time"]) == (1, 3)
    assert client.patch(f"/queue/{item['id']}", json={"start_time": 3, "end_time": 1}).status_code == 400
    assert client.patch(f"/queue/{item['id']}", json={"start_time": 2}).status_code == 400

    client.post("/queue/start", json={})
    settled(client)
    [download] = youtube.downloads()
    assert download.opts["download_ranges"].ranges == [(1, 3)]


def test_clear_the_trim(client, library, youtube):
    video = youtube.add_video()
    [item] = client.post("/queue", json={"items": [{"url": video.url, "start_time": 1, "end_time": 2}]}).json()
    cleared = client.patch(f"/queue/{item['id']}", json={"start_time": None, "end_time": None}).json()
    assert (cleared["start_time"], cleared["end_time"]) == (None, None)


def test_items_wait_until_started(client, library, youtube):
    videos = [youtube.add_video(f"Song {index}") for index in range(3)]
    client.post("/queue", json={"items": [{"url": video.url, "custom_filename": f"song {index}"} for index, video in enumerate(videos)]})
    assert youtube.calls == []

    client.post("/queue/start", json={})
    items = settled(client)
    assert [item["status"] for item in items] == ["done"] * 3
    assert [item["filename"] for item in items] == ["song 0.mp3", "song 1.mp3", "song 2.mp3"]
    assert library.names() == ["song 0.mp3", "song 1.mp3", "song 2.mp3"]


def test_start_selected_items(client, library, youtube):
    first, second = (youtube.add_video(), youtube.add_video())
    items = client.post("/queue", json={"items": [{"url": first.url, "custom_filename": "one"}, {"url": second.url, "custom_filename": "two"}]}).json()
    client.post("/queue/start", json={"ids": [items[1]["id"]]})
    statuses = {item["custom_filename"]: item["status"] for item in settled(client)}
    assert statuses == {"one": "pending", "two": "done"}


def test_failures_can_be_retried(client, library, youtube):
    video = youtube.add_video()
    [item] = client.post("/queue", json={"items": [{"url": video.url, "custom_filename": "flaky"}]}).json()
    youtube.fail_next(times=2)
    client.post("/queue/start", json={})
    [failed] = settled(client)
    assert failed["status"] == "failed"
    assert failed["error"]

    client.post("/queue/start", json={"ids": [item["id"]]})
    assert settled(client)[0]["status"] == "done"


def test_existing_names_are_skipped_unless_overwriting(client, library, youtube):
    library.add("taken.mp3", "Taken")
    video = youtube.add_video()
    client.post("/queue", json={"items": [{"url": video.url, "custom_filename": "taken"}]})
    client.post("/queue/start", json={})
    [item] = settled(client)
    assert (item["status"], item["error"]) == ("failed", "Already in library")
    assert youtube.downloads() == []


def test_clear_finished(client, library, youtube):
    video = youtube.add_video()
    client.post("/queue", json={"items": [{"url": video.url, "custom_filename": "done"}, {"url": video.url, "custom_filename": "later"}]})
    client.post("/queue/start", json={"ids": [queue(client)[0]["id"]]})
    settled(client)
    assert [item["custom_filename"] for item in client.post("/queue/clear").json()] == ["later"]


def test_progress_and_stop(client, library, youtube):
    video = youtube.add_video()
    client.post("/queue", json={"items": [{"url": video.url, "custom_filename": "first"}, {"url": video.url, "custom_filename": "second"}]})
    youtube.hold()
    client.post("/queue/start", json={})
    assert youtube.started.wait(5)

    running, waiting = queue(client)
    assert running["status"] == "running"
    assert running["progress"] == pytest.approx(0.5, abs=0.01)
    assert waiting["status"] == "queued"
    assert [item["status"] for item in client.post("/queue/stop").json()] == ["running", "pending"]
    assert client.delete(f"/queue/{running['id']}").status_code == 409

    youtube.release()
    assert [item["status"] for item in settled(client)] == ["done", "pending"]


def test_cover_from_url(client, library, web, cover_jpeg):
    web.route("https://i.ytimg.com/vi/abc/hq.jpg", cover_jpeg)
    [item] = client.post("/queue", json={"items": [{"url": "https://youtu.be/abc", "cover_url": "https://i.ytimg.com/vi/abc/hq.jpg"}]}).json()
    assert item["has_cover"] is True
    assert client.get(f"/queue/{item['id']}/cover").headers["content-type"] == "image/jpeg"


def test_unreachable_cover_url_is_skipped(client, library, web):
    web.route("https://i.ytimg.com/vi/abc/hq.jpg", status=404)
    [item] = client.post("/queue", json={"items": [{"url": "https://youtu.be/abc", "cover_url": "https://i.ytimg.com/vi/abc/hq.jpg"}]}).json()
    assert item["has_cover"] is False


def test_bad_items_are_rejected(client, library):
    assert client.post("/queue", json={"items": [{"url": "x", "custom_filename": "a/b"}]}).status_code == 400
    assert client.post("/queue", json={"items": [{"url": "x", "start_time": 3, "end_time": 1}]}).status_code == 400


def test_cancel_a_running_download(client, library, youtube):
    video = youtube.add_video()
    [item] = client.post("/queue", json={"items": [{"url": video.url, "custom_filename": "cancel me"}]}).json()
    youtube.hold()
    client.post("/queue/start", json={})
    assert youtube.started.wait(5)

    statuses = {entry["id"]: entry["status"] for entry in client.post(f"/queue/{item['id']}/cancel").json()}
    assert statuses[item["id"]] == "running"
    youtube.release()

    [cancelled] = settled(client)
    assert (cancelled["status"], cancelled["error"]) == ("pending", None)
    assert library.names() == []
    assert len(youtube.downloads()) == 1


def test_only_running_downloads_can_be_cancelled(client, library, youtube):
    [item] = client.post("/queue", json={"items": [{"url": youtube.add_video().url}]}).json()
    assert client.post(f"/queue/{item['id']}/cancel").status_code == 409
