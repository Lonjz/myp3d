import sqlite3
import tempfile
from pathlib import Path

from services import system_service
from services.config import VERSION


def test_info_reports_version_and_device(client):
    body = client.get("/system/info").json()

    assert body["version"] == VERSION
    assert body["device_name"]


def test_backup_is_a_complete_database(client):
    client.post("/playlists", json={"name": "Road Trip"})

    response = client.get("/system/backup.db")

    assert response.status_code == 200
    assert "myp3d-backup-" in response.headers["content-disposition"]
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "backup.db"
        path.write_bytes(response.content)
        conn = sqlite3.connect(path)
        try:
            names = [row[0] for row in conn.execute("SELECT name FROM playlists")]
        finally:
            conn.close()
    assert "Road Trip" in names


def test_backup_removes_its_temporary_file(client, monkeypatch):
    created = []
    original = system_service.create_backup

    def tracked():
        created.append(original())
        return created[-1]

    monkeypatch.setattr(system_service, "create_backup", tracked)

    assert client.get("/system/backup.db").status_code == 200
    assert not created[0].exists()


def test_system_routes_are_local_only(client):
    response = client.get("/system/info", headers={"origin": "http://evil.example"})

    assert response.status_code == 403
