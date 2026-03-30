from yt_dlp import YoutubeDL
import eyed3
import os
import sys

def download_as_mp3(url, output_path="downloads", metadata=None, cover_path=None):
    ffmpeg_path = os.path.join(os.path.dirname(sys.argv[0]), "ffmpeg.exe")
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": f"{output_path}/%(title)s.%(ext)s",
        "ffmpeg_location": ffmpeg_path,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "320",
            }
        ],
        "quiet": False,
        "noplaylist": True,
    }

    # Ensure output folder exists
    os.makedirs(output_path, exist_ok=True)

    with YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        filename = ydl.prepare_filename(info)
        mp3_file = os.path.splitext(filename)[0] + ".mp3"

    # Apply metadata if provided
    if metadata:
        audio = eyed3.load(mp3_file)
        if audio.tag is None:
            audio.initTag()

        if "title" in metadata:
            audio.tag.title = metadata["title"]
        if "artist" in metadata:
            audio.tag.artist = metadata["artist"]
        if "album" in metadata:
            audio.tag.album = metadata["album"]

        # Add cover art if provided
        if cover_path and os.path.exists(cover_path):
            with open(cover_path, "rb") as img:
                audio.tag.images.set(3, img.read(), "image/jpeg")

        audio.tag.save()

    return mp3_file


if __name__ == "__main__":
    url = input("Enter YouTube URL: ").strip()
    title = input("Enter title (optional): ").strip()
    artist = input("Enter artist (optional): ").strip()
    album = input("Enter album (optional): ").strip()
    cover = input("Enter path to cover image (optional): ").strip()

    metadata = {}
    if title: metadata["title"] = title
    if artist: metadata["artist"] = artist
    if album: metadata["album"] = album

    mp3_file = download_as_mp3(url, metadata=metadata, cover_path=cover if cover else None)
    print(f"\n✅ Saved as {mp3_file}")
