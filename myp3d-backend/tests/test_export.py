import zipfile
from io import BytesIO

from PIL import Image


def test_tracks_zip(client, seeded_library):
    response = client.get("/export/tracks.zip")
    assert response.headers["content-type"] == "application/zip"
    archive = zipfile.ZipFile(BytesIO(response.content))
    assert sorted(archive.namelist()) == seeded_library.names()
    assert archive.read("the chain.mp3") == seeded_library.path("the chain.mp3").read_bytes()


def test_album_art_zip(client, seeded_library):
    archive = zipfile.ZipFile(BytesIO(client.get("/export/covers.zip").content))
    assert sorted(archive.namelist()) == ["Ctrl.jpg", "In Rainbows (From the Basement).jpg", "In Rainbows.jpg", "Random Access Memories.jpg", "Rumours.jpg"]
    with Image.open(BytesIO(archive.read("Rumours.jpg"))) as cover:
        assert (cover.format, cover.size) == ("JPEG", (500, 500))


def test_nothing_to_export(client, library):
    assert client.get("/export/tracks.zip").json()["detail"] == "The library is empty"
    library.add("plain.mp3", "Plain", "Artist", "No Art")
    assert client.get("/export/covers.zip").json()["detail"] == "No album has a cover"
