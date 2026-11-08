from pydantic import BaseModel


class SystemInfo(BaseModel):
    version: str
    device_name: str
