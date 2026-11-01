import pytest

from services import music_service
from services.music_service import FIELD_SEP, GROUP_SEP, RECORD_SEP


class FakeMusic:
    def __init__(self) -> None:
        self.tracks: dict[str, tuple[str, str, str]] = {}
        self.art_replies: list[str] = []
        self.missing_art: list[str] = []

    def run_script(self, name: str, *args: str, timeout: float = 0) -> str:
        if name == "export_library":
            tracks = RECORD_SEP.join(FIELD_SEP.join([pid, title, artist, "", ""]) for pid, (title, artist, _) in self.tracks.items())
            locations = RECORD_SEP.join(f"{pid}{FIELD_SEP}{path}" for pid, (_, _, path) in self.tracks.items())
            return f"{tracks}{GROUP_SEP}{locations}{GROUP_SEP}"
        if name == "add_track":
            pid = f"P{len(self.tracks) + 1}"
            self.tracks[pid] = ("Song", "Artist", args[0])
            return f"{pid}{FIELD_SEP}{self.art_replies.pop(0)}"
        if name == "update_track":
            return self.art_replies.pop(0)
        if name == "export_missing_art":
            return FIELD_SEP.join(self.missing_art)
        raise AssertionError(f"Unexpected script {name}")


@pytest.fixture
def music(monkeypatch) -> FakeMusic:
    fake = FakeMusic()
    monkeypatch.setattr(music_service, "run_script", fake.run_script)
    return fake


def sync(root) -> music_service._SyncJob:
    job = music_service._SyncJob(status="syncing", total=0)
    music_service._run_sync(job, root)
    return job


def changes(root) -> list[str]:
    [pair] = music_service.diff(str(root)).both
    return pair.changes


def test_a_cover_music_refused_stays_to_sync_until_it_is_set(library, music, tmp_path):
    library.add("song.mp3", "Song", "Artist", cover=(200, 40, 40))
    music.art_replies = ["noart:The track is busy"]
    assert [failure.detail for failure in sync(tmp_path).without_art] == ["The track is busy"]
    assert changes(tmp_path) == ["art"]

    music.art_replies = ["art"]
    assert sync(tmp_path).without_art == []
    assert changes(tmp_path) == []


def test_the_full_cover_check_finds_covers_music_lost(library, music, client, tmp_path):
    library.add("song.mp3", "Song", "Artist", cover=(200, 40, 40))
    music.art_replies = ["art"]
    sync(tmp_path)
    assert changes(tmp_path) == []

    music.missing_art = ["P1"]
    response = client.post("/music/art/check", json={"folder": str(tmp_path)})
    assert response.status_code == 200
    assert response.json()["both"][0]["changes"] == ["art"]

    music.missing_art = []
    client.post("/music/art/check", json={"folder": str(tmp_path)})
    assert changes(tmp_path) == []
