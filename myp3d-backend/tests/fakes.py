import json
import re
import shutil
import threading
import urllib.error
from dataclasses import dataclass, field
from email.message import Message
from io import BytesIO
from pathlib import Path
from typing import Callable, Optional

from yt_dlp.utils import DownloadError

UNSAFE_NAME_CHARS = re.compile(r'[\\/:*?"<>|]')


@dataclass
class Video:
    url: str
    id: str
    title: str
    uploader: str = "Fake Channel"
    seconds: float = 3
    freq: int = 440


@dataclass
class YoutubeCall:
    url: str
    download: bool
    opts: dict


class FakeYoutube:
    def __init__(self, make_audio: Callable[[float, int], Path]) -> None:
        self._make_audio = make_audio
        self.videos: dict[str, Video] = {}
        self.search_results: list[Video] = []
        self.calls: list[YoutubeCall] = []
        self._failures: list[Exception] = []
        self._gate: Optional[threading.Event] = None
        self.started = threading.Event()

    def hold(self) -> None:
        self._gate = threading.Event()
        self.started.clear()

    def release(self) -> None:
        if self._gate is not None:
            self._gate.set()

    def add_video(self, title: str = "Fake Video", uploader: str = "Fake Channel", seconds: float = 3, freq: int = 440, video_id: Optional[str] = None) -> Video:
        video_id = video_id or f"vid{len(self.videos):08d}"[:11]
        video = Video(f"https://www.youtube.com/watch?v={video_id}", video_id, title, uploader, seconds, freq)
        self.videos[video.url] = video
        return video

    def fail_next(self, error: Optional[Exception] = None, times: int = 1) -> None:
        self._failures.extend([error or DownloadError("ERROR: Sign in to confirm you're not a bot")] * times)

    def downloads(self) -> list[YoutubeCall]:
        return [call for call in self.calls if call.download]

    def ydl(self, opts: Optional[dict] = None) -> "FakeYoutubeDL":
        return FakeYoutubeDL(self, opts or {})


def _render(template: str, info: dict) -> str:
    rendered = re.sub(r"%\((\w+)\)s", lambda match: str(info.get(match.group(1), "NA")), template.replace("%%", "\0"))
    return rendered.replace("\0", "%")


class FakeYoutubeDL:
    def __init__(self, youtube: FakeYoutube, opts: dict) -> None:
        self.youtube = youtube
        self.opts = opts

    def __enter__(self) -> "FakeYoutubeDL":
        return self

    def __exit__(self, *_) -> None:
        return None

    def _info(self, video: Video) -> dict:
        return {
            "id": video.id,
            "title": UNSAFE_NAME_CHARS.sub("_", video.title),
            "ext": "webm",
            "duration": video.seconds,
            "uploader": video.uploader,
            "webpage_url": video.url,
        }

    def extract_info(self, url: str, download: bool = True) -> dict:
        self.youtube.calls.append(YoutubeCall(url, download, dict(self.opts)))
        if self.youtube._failures:
            raise self.youtube._failures.pop(0)
        search = re.fullmatch(r"ytsearch(\d+):(.*)", url)
        if search:
            limit = int(search.group(1))
            return {"entries": [{**self._info(video), "thumbnails": [{"url": f"https://i.ytimg.com/vi/{video.id}/hq.jpg"}]} for video in self.youtube.search_results[:limit]]}
        video = self.youtube.videos.get(url)
        if video is None:
            raise DownloadError(f"ERROR: [youtube] {url}: Video unavailable")
        info = self._info(video)
        if download:
            seconds = video.seconds
            ranges = self.opts.get("download_ranges")
            if ranges is not None:
                start, end = ranges.ranges[0]
                seconds = max(1, round(end - start))
            target = Path(_render(self.opts["outtmpl"], {**info, "ext": "mp3"}))
            source = self.youtube._make_audio(seconds, video.freq)
            size = source.stat().st_size
            for hook in self.opts.get("progress_hooks", []):
                hook({"status": "downloading", "downloaded_bytes": size // 2, "total_bytes": size})
            self.youtube.started.set()
            if self.youtube._gate is not None and not self.youtube._gate.wait(10):
                raise DownloadError("ERROR: the test never released the download")
            for hook in self.opts.get("progress_hooks", []):
                hook({"status": "downloading", "downloaded_bytes": size, "total_bytes": size})
            shutil.copyfile(source, target)
            for hook in self.opts.get("progress_hooks", []):
                hook({"status": "finished", "downloaded_bytes": size, "total_bytes": size, "filename": str(target)})
        return info

    def prepare_filename(self, info: dict) -> str:
        return _render(self.opts["outtmpl"], info)


@dataclass
class Route:
    body: bytes
    status: int = 200
    headers: dict = field(default_factory=dict)


class FakeResponse(BytesIO):
    def __init__(self, url: str, route: Route) -> None:
        super().__init__(route.body)
        self.url = url
        self.status = route.status
        self.headers = Message()
        for name, value in route.headers.items():
            self.headers[name] = value

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *_) -> None:
        self.close()

    def getcode(self) -> int:
        return self.status


class FakeWeb:
    def __init__(self, on_unrouted: Callable[[str], None]) -> None:
        self.routes: dict[str, Route] = {}
        self.requests: list[str] = []
        self._on_unrouted = on_unrouted

    def route(self, url: str, body: bytes | str = b"", status: int = 200, headers: Optional[dict] = None) -> None:
        self.routes[url] = Route(body.encode("utf-8") if isinstance(body, str) else body, status, headers or {})

    def spotify(self, kind: str, spotify_id: str, entity: Optional[dict], status: int = 200) -> None:
        self.route(f"https://open.spotify.com/embed/{kind}/{spotify_id}", spotify_embed_page(entity), status)

    def urlopen(self, request, timeout: Optional[float] = None, **_) -> FakeResponse:
        url = request if isinstance(request, str) else request.full_url
        self.requests.append(url)
        route = self.routes.get(url)
        if route is None:
            self._on_unrouted(url)
            raise urllib.error.URLError(f"No fake route for {url}")
        if route.status >= 400:
            raise urllib.error.HTTPError(url, route.status, "Fake error", route.headers, BytesIO(route.body))
        return FakeResponse(url, route)


def spotify_embed_page(entity: Optional[dict]) -> str:
    props = {"status": 404} if entity is None else {"state": {"data": {"entity": entity}}}
    data = json.dumps({"props": {"pageProps": props}})
    return f'<html><script id="__NEXT_DATA__" type="application/json">{data}</script></html>'


def spotify_track(spotify_id: str, name: str, artists: list[str], seconds: float = 200, explicit: bool = False, cover: Optional[str] = None) -> dict:
    return {
        "id": spotify_id,
        "name": name,
        "artists": [{"name": artist} for artist in artists],
        "duration": int(seconds * 1000),
        "isExplicit": explicit,
        "visualIdentity": {"image": [{"url": cover, "maxWidth": 640}]} if cover else {},
    }


def spotify_list(name: str, tracks: list[tuple[str, str, str]], cover: Optional[str] = None) -> dict:
    return {
        "name": name,
        "trackList": [
            {"uri": f"spotify:track:{spotify_id}", "title": title, "subtitle": subtitle, "duration": 200000}
            for spotify_id, title, subtitle in tracks
        ],
        "coverArt": {"sources": [{"url": cover, "width": 640}]} if cover else {},
    }


def ytmusic_result(video_id: str, title: str, artists: list[str], album: Optional[str] = None, seconds: float = 200, explicit: bool = False) -> dict:
    return {
        "videoId": video_id,
        "title": title,
        "artists": [{"name": artist} for artist in artists],
        "album": {"name": album} if album else None,
        "duration_seconds": seconds,
        "isExplicit": explicit,
        "thumbnails": [{"url": f"https://i.ytimg.com/vi/{video_id}/hq.jpg"}],
    }


class FakeYTMusic:
    def __init__(self) -> None:
        self.results: dict[str, list[dict]] = {"songs": [], "videos": []}
        self.searches: list[tuple[str, str]] = []
        self.error: Optional[Exception] = None

    def client(self, *_, **__) -> "FakeYTMusic":
        return self

    def search(self, query: str, filter: str = "songs", limit: int = 10) -> list[dict]:
        self.searches.append((query, filter))
        if self.error is not None:
            raise self.error
        return list(self.results.get(filter, []))[:limit]
