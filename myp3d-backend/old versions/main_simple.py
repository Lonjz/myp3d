from yt_dlp import YoutubeDL
import os
import sys

def download_as_mp3(url, output_path="downloads"):
    ffmpeg_path = os.path.join(os.path.dirname(sys.argv[0]), "ffmpeg.exe")
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": f"{output_path}/%(title)s.%(ext)s",
        "ffmpeg_location": ffmpeg_path,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudioQ",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }
        ],
        "quiet": False,
        "noplaylist": True,
    }

    with YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

if __name__ == "__main__":
    url = input("Enter YouTube URL: ").strip()
    download_as_mp3(url)
