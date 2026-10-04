import json
import socket
import threading
import time
from dataclasses import dataclass
from typing import Optional

from services.config import API_PORT
from services.device_service import DEVICE_ID, get_device_name

APP_TAG = "myp3d"
BROADCAST_INTERVAL_S = 2.0
PEER_TTL_S = 6.0
HEARTBEAT_TIMEOUT_S = 10.0
MIN_PORT = 1024
MAX_PORT = 65535


@dataclass
class Peer:
    id: str
    name: str
    host: str
    port: int
    last_seen: float


def _broadcast_targets() -> set[str]:
    targets = {"255.255.255.255"}
    try:
        infos = socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)
    except OSError:
        return targets
    for info in infos:
        address = info[4][0]
        if address.startswith("127."):
            continue
        targets.add(".".join(address.split(".")[:3] + ["255"]))
    return targets


class _Discovery:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._sock: Optional[socket.socket] = None
        self._stop_event: Optional[threading.Event] = None
        self._port: Optional[int] = None
        self._peers: dict[str, Peer] = {}
        self._last_heartbeat = 0.0

    def start(self, port: int) -> None:
        if not MIN_PORT <= port <= MAX_PORT:
            raise ValueError(f"Port must be between {MIN_PORT} and {MAX_PORT}")

        with self._lock:
            self._last_heartbeat = time.monotonic()
            if self._port == port and self._is_running():
                return

        self.stop()

        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        try:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            sock.bind(("", port))
            sock.settimeout(0.5)
        except OSError:
            sock.close()
            raise

        stop_event = threading.Event()
        with self._lock:
            self._sock = sock
            self._stop_event = stop_event
            self._port = port
            self._peers = {}
            self._last_heartbeat = time.monotonic()

        threading.Thread(target=self._listen, args=(sock, stop_event), daemon=True).start()
        threading.Thread(target=self._announce, args=(sock, port, stop_event), daemon=True).start()

    def stop(self) -> None:
        with self._lock:
            sock, stop_event = self._sock, self._stop_event
            self._sock = None
            self._stop_event = None
            self._port = None
            self._peers = {}
        if stop_event:
            stop_event.set()
        if sock:
            sock.close()

    def touch(self) -> None:
        with self._lock:
            self._last_heartbeat = time.monotonic()

    def is_active(self) -> bool:
        with self._lock:
            return self._is_running()

    def port(self) -> Optional[int]:
        with self._lock:
            return self._port if self._is_running() else None

    def list_peers(self) -> list[Peer]:
        now = time.monotonic()
        with self._lock:
            peers = [peer for peer in self._peers.values() if now - peer.last_seen <= PEER_TTL_S]
        return sorted(peers, key=lambda peer: peer.name.casefold())

    def get_peer(self, peer_id: str) -> Optional[Peer]:
        return next((peer for peer in self.list_peers() if peer.id == peer_id), None)

    def _is_running(self) -> bool:
        return self._stop_event is not None and not self._stop_event.is_set()

    def _listen(self, sock: socket.socket, stop_event: threading.Event) -> None:
        while not stop_event.is_set():
            try:
                data, (host, _) = sock.recvfrom(4096)
            except socket.timeout:
                continue
            except OSError:
                return
            try:
                message = json.loads(data.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                continue
            if not isinstance(message, dict) or message.get("app") != APP_TAG:
                continue
            peer_id, name, port = message.get("id"), message.get("name"), message.get("port")
            if peer_id == DEVICE_ID or not isinstance(peer_id, str) or not isinstance(port, int):
                continue
            with self._lock:
                if self._stop_event is stop_event:
                    self._peers[peer_id] = Peer(
                        id=peer_id,
                        name=str(name or host)[:64],
                        host=host,
                        port=port,
                        last_seen=time.monotonic(),
                    )

    def _announce(self, sock: socket.socket, port: int, stop_event: threading.Event) -> None:
        targets = _broadcast_targets()
        while not stop_event.is_set():
            with self._lock:
                stale = time.monotonic() - self._last_heartbeat > HEARTBEAT_TIMEOUT_S
            if stale:
                if self._stop_event is stop_event:
                    self.stop()
                return
            payload = json.dumps(
                {"app": APP_TAG, "id": DEVICE_ID, "name": get_device_name(), "port": API_PORT}
            ).encode("utf-8")
            for target in targets:
                try:
                    sock.sendto(payload, (target, port))
                except OSError:
                    continue
            stop_event.wait(BROADCAST_INTERVAL_S)


discovery = _Discovery()
