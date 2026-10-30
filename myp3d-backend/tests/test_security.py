import pytest


def test_loopback_client_is_allowed(client):
    assert client.get("/").status_code == 200


@pytest.mark.parametrize(
    ("host", "base_url"),
    [
        ("192.168.1.20", "http://127.0.0.1"),
        ("127.0.0.1", "http://192.168.1.5:8000"),
        ("127.0.0.1", "http://evil.test"),
    ],
)
def test_non_loopback_requests_are_refused(make_client, host, base_url):
    response = make_client(host, base_url).get("/mp3s/all")
    assert response.status_code == 403


def test_peer_routes_skip_the_loopback_check_but_need_a_session(make_client):
    response = make_client("192.168.1.20", "http://192.168.1.5:8000").get("/peer/sessions/abc/manifest")
    assert response.status_code == 404


def test_unknown_files_are_rejected(client, library):
    assert client.get("/mp3s/missing.mp3/info").status_code == 404
    assert client.get("/mp3s/..%5Csecret.mp3/info").status_code in (400, 404)


@pytest.mark.parametrize("origin", ["http://evil.test", "null", "http://localhost:9999"])
def test_other_websites_are_refused(client, library, origin):
    response = client.post("/cache/clear", headers={"Origin": origin})
    assert response.status_code == 403


def test_the_app_itself_is_allowed(client, library):
    assert client.post("/cache/clear", headers={"Origin": "http://localhost:5173"}).status_code == 200


def handshake(version: str) -> dict:
    return {"session_id": "d" * 32, "device": {"id": "peer", "name": "Peer"}, "port": 8000, "version": version}


def test_peers_on_another_major_version_are_refused(make_client, library, monkeypatch):
    from services import sync_service

    monkeypatch.setattr(sync_service.discovery, "is_active", lambda: True)
    peer = make_client("192.168.1.20", "http://192.168.1.5:8000")
    response = peer.post("/peer/incoming", json=handshake("0.9"))
    assert response.status_code == 409
    assert "Update myp3d on both devices" in response.json()["detail"]
    assert peer.post("/peer/incoming", json=handshake("1.4.2")).json()["status"] == "incoming"


def test_handshake_rejects_malformed_sessions(make_client, library, monkeypatch):
    from services import sync_service

    monkeypatch.setattr(sync_service.discovery, "is_active", lambda: True)
    peer = make_client("192.168.1.20", "http://192.168.1.5:8000")
    assert peer.post("/peer/incoming", json={**handshake("1.0.0"), "session_id": "../../x"}).status_code == 422
