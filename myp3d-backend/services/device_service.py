import socket
import uuid

DEVICE_ID = uuid.uuid4().hex


def get_device_name() -> str:
    return socket.gethostname() or "Unknown device"


def get_device() -> dict[str, str]:
    return {"id": DEVICE_ID, "name": get_device_name()}
