import shutil
import subprocess
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Optional

import eyed3
from PIL import Image, ImageDraw

eyed3.log.setLevel("ERROR")

BACKEND_DIR = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Track:
    filename: str
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    seconds: float = 3
    freq: int = 440
    cover: Optional[tuple[int, int, int]] = None
    silence_tail: float = 0


DEFAULT_LIBRARY = [
    Track("dreams.mp3", "Dreams", "Fleetwood Mac", "Rumours", 3, 330, (96, 72, 160)),
    Track("songbird.mp3", "Songbird", "Fleetwood Mac", "Rumours", 4, 349, (96, 72, 160)),
    Track("the chain.mp3", "The Chain", "Fleetwood Mac", "Rumours", 5, 370, (96, 72, 160)),
    Track("instant crush.mp3", "Instant Crush (feat. Julian Casablancas)", "Daft Punk", "Random Access Memories", 3, 392, (190, 120, 150)),
    Track("giorgio by moroder.mp3", "Giorgio by Moroder", "Daft Punk", "Random Access Memories", 4, 415, (190, 120, 150)),
    Track("reckoner.mp3", "Reckoner", "Radiohead", "In Rainbows", 3, 440, (230, 170, 110)),
    Track("videotape.mp3", "Videotape", "Radiohead", "In Rainbows", 6, 466, (230, 170, 110), silence_tail=1.5),
    Track("reckoner live.mp3", "Reckoner", "Radiohead", "In Rainbows (From the Basement)", 3, 494, (230, 140, 90)),
    Track("Broken_Clocks!.mp3", "Broken Clocks", "SZA", "Ctrl", 3, 523, (110, 160, 190)),
    Track("doves in the wind.mp3", "Doves in the Wind", "SZA, Kendrick Lamar", "Ctrl", 3, 554, (110, 160, 190)),
    Track("redbone.mp3", seconds=3, freq=587),
    Track("good days.mp3", "Good Days", "SZA", None, 3, 622),
]


def ffmpeg_path() -> Optional[str]:
    bundled = BACKEND_DIR / "ffmpeg.exe"
    if bundled.is_file():
        return str(bundled)
    return shutil.which("ffmpeg")


def _audio_key(seconds: float, freq: int, silence_tail: float, mono: bool, silence_head: float) -> str:
    head = f"{silence_head:g}lead-" if silence_head else ""
    return f"{head}{seconds:g}s-{freq}hz-{silence_tail:g}pad{'-mono' if mono else ''}.mp3"


def make_audio(cache_dir: Path, seconds: float, freq: int, silence_tail: float = 0, mono: bool = False, silence_head: float = 0) -> Path:
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / _audio_key(seconds, freq, silence_tail, mono, silence_head)
    if path.exists():
        return path
    ffmpeg = ffmpeg_path()
    if ffmpeg is None:
        raise RuntimeError("ffmpeg isn't installed")
    filters = ([f"adelay={silence_head * 1000:g}:all=1"] if silence_head else []) + ([f"apad=pad_dur={silence_tail:g}"] if silence_tail else [])
    pad = ["-af", ",".join(filters)] if filters else []
    layout = ["-ac", "1" if mono else "2", "-ar", "44100", "-b:a", "64k"]
    partial = path.with_suffix(".part.mp3")
    subprocess.run(
        [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
         "-i", f"sine=frequency={freq}:duration={seconds:g}", *pad, *layout, str(partial)],
        check=True,
    )
    partial.replace(path)
    return path


def make_cover(color: tuple[int, int, int], size: tuple[int, int] = (600, 600), fmt: str = "JPEG") -> bytes:
    image = Image.new("RGB", size, color)
    draw = ImageDraw.Draw(image)
    width, height = size
    for row in range(height):
        shade = tuple(min(255, int(channel * (0.55 + 0.6 * row / height))) for channel in color)
        draw.line([(0, row), (width, row)], fill=shade)
    draw.ellipse([width * 0.3, height * 0.3, width * 0.7, height * 0.7], outline=(255, 255, 255), width=max(2, width // 60))
    output = BytesIO()
    image.save(output, format=fmt)
    return output.getvalue()


def write_tags(path: Path, title=None, artist=None, album=None, cover: Optional[bytes] = None) -> None:
    audio = eyed3.load(str(path))
    if audio.tag is None:
        audio.initTag()
    audio.tag.title = title
    audio.tag.artist = artist
    audio.tag.album = album
    for description in [image.description for image in list(audio.tag.images)]:
        audio.tag.images.remove(description)
    if cover is not None:
        audio.tag.images.set(0, cover, "image/jpeg", description="")
    audio.tag.save(version=(2, 3, 0))


def read_tags(path: Path) -> dict:
    audio = eyed3.load(str(path))
    tag = audio.tag if audio else None
    return {
        "title": tag.title if tag else None,
        "artist": tag.artist if tag else None,
        "album": tag.album if tag else None,
        "has_cover": bool(tag and tag.images),
        "duration": audio.info.time_secs if audio and audio.info else None,
    }


def make_mp3(directory: Path, track: Track, cache_dir: Path, mono: bool = False) -> Path:
    path = directory / track.filename
    shutil.copyfile(make_audio(cache_dir, track.seconds, track.freq, track.silence_tail, mono), path)
    cover = make_cover(track.cover) if track.cover else None
    write_tags(path, track.title, track.artist, track.album, cover)
    return path


def seed_library(directory: Path, tracks: list[Track], cache_dir: Path, mono: bool = False) -> list[Path]:
    directory.mkdir(parents=True, exist_ok=True)
    return [make_mp3(directory, track, cache_dir, mono) for track in tracks]
