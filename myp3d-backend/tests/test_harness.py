import socket
import urllib.error
import urllib.request

import pytest

from services import config
from services.db import DB_PATH
from tests.conftest import BACKEND_DIR, SESSION_DIR


def test_library_and_database_are_temporary():
    assert SESSION_DIR in config.OUTPUT_DIR.resolve().parents
    assert SESSION_DIR in DB_PATH.resolve().parents
    assert BACKEND_DIR / "downloads" not in [config.OUTPUT_DIR.resolve(), *config.OUTPUT_DIR.resolve().parents]


def test_unrouted_web_requests_are_caught(network_guard):
    with pytest.raises(urllib.error.URLError):
        urllib.request.urlopen("https://example.com/")
    assert network_guard == ["urlopen https://example.com/"]
    network_guard.clear()


def test_real_sockets_are_caught(network_guard):
    with socket.socket() as sock, pytest.raises(ConnectionRefusedError):
        sock.connect(("93.184.216.34", 443))
    with pytest.raises(socket.gaierror):
        socket.getaddrinfo("example.com", 443)
    assert network_guard == ["connect 93.184.216.34", "lookup example.com"]
    network_guard.clear()
