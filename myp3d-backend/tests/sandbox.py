import argparse
import os
import random
import shutil
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
SANDBOX_DIR = Path(__file__).resolve().parent / ".sandbox"
LIBRARY_DIR = SANDBOX_DIR / "library"
DB_FILE = SANDBOX_DIR / "myp3d.db"
AUDIO_CACHE = SANDBOX_DIR / "audio"

ALBUMS = [
    ("Fleetwood Mac", "Rumours", 840, ["Second Hand News", "Dreams", "Never Going Back Again", "Don't Stop", "Go Your Own Way", "Songbird", "The Chain"]),
    ("Daft Punk", "Random Access Memories", 610, ["Give Life Back to Music", "Giorgio by Moroder", "Instant Crush (feat. Julian Casablancas)", "Lose Yourself to Dance (feat. Pharrell Williams)", "Get Lucky (feat. Pharrell Williams, Nile Rodgers)", "Doin' It Right (feat. Panda Bear)"]),
    ("Radiohead", "In Rainbows", 455, ["15 Step", "Nude", "Weird Fishes/Arpeggi", "All I Need", "Reckoner", "House of Cards", "Videotape"]),
    ("Frank Ocean", "Blonde", 300, ["Nikes", "Ivy", "Pink + White", "Solo", "Nights", "White Ferrari"]),
    ("Tame Impala", "Currents", 170, ["Let It Happen", "The Moment", "Eventually", "The Less I Know the Better", "New Person, Same Old Mistakes"]),
    ("SZA", "Ctrl", 64, ["Supermodel", "Love Galore (feat. Travis Scott)", "Drew Barrymore", "Prom", "The Weekend", "Broken Clocks"]),
    ("Phoebe Bridgers", "Punisher", 9, ["Garden Song", "Kyoto", "Punisher", "Chinese Satellite", "Moon Song", "I Know the End"]),
    ("Kendrick Lamar", "good kid, m.A.A.d city", 720, ["Backseat Freestyle", "The Art of Peer Pressure", "Money Trees (feat. Jay Rock)", "Poetic Justice (feat. Drake)", "Swimming Pools (Drank)", "m.A.A.d city (feat. MC Eiht)"]),
    ("Arctic Monkeys", "AM", 520, ["Do I Wanna Know?", "R U Mine?", "One for the Road", "Arabella", "Why'd You Only Call Me When You're High?", "Snap Out of It"]),
    ("Lorde", "Melodrama", 380, ["Green Light", "Sober", "Homemade Dynamite", "The Louvre", "Liability", "Supercut"]),
    ("Childish Gambino", "Awaken, My Love!", 250, ["Me and Your Mama", "Have Some Love", "Redbone", "Terrified", "Stand Tall"]),
    ("The Weeknd", "After Hours", 200, ["Alone Again", "Too Late", "Hardest to Love", "Heartless", "Blinding Lights", "In Your Eyes", "Save Your Tears"]),
    ("Billie Eilish", "When We All Fall Asleep, Where Do We Go?", 120, ["Bad Guy", "You Should See Me in a Crown", "All the Good Girls Go to Hell", "Wish You Were Gay", "When the Party's Over", "Bury a Friend"]),
    ("Mitski", "Be the Cowboy", 35, ["Geyser", "Why Didn't You Stop Me?", "Me and My Husband", "Nobody", "Washing Machine Heart", "Two Slow Dancers"]),
]

EXTRAS = [
    ("get lucky single.mp3", "Get Lucky (feat. Pharrell Williams, Nile Rodgers)", "Daft Punk", "Get Lucky", 248),
    ("doves in the wind.mp3", "Doves in the Wind", "SZA, Kendrick Lamar", "Ctrl", 266),
    ("reckoner live.mp3", "Reckoner", "Radiohead", "In Rainbows (From the Basement)", 291),
    ("thinkin bout you.mp3", None, None, None, 200),
    ("Self_Control (1).mp3", "Self Control", "Frank Ocean", "Blonde", 249),
    ("good days.mp3", "Good Days", "SZA", None, 279),
]


def _filename(title: str) -> str:
    return " ".join("".join(char for char in title.lower() if char.isalnum() or char == " ").split()) + ".mp3"


def _tracks():
    from tests.seed import Track

    rng = random.Random(7)
    tracks = []
    freq = 220
    for artist, album, days_ago, titles in ALBUMS:
        for title in titles:
            freq += 9
            tracks.append((Track(_filename(title), title, artist, album, rng.randint(140, 330), freq), max(0, days_ago - rng.choice((0, 0, 1, 2, 3, 5, 8, 13)))))
    for filename, title, artist, album, seconds in EXTRAS:
        freq += 9
        tracks.append((Track(filename, title, artist, album, seconds, freq), rng.randint(0, 900)))
    tracks.append((Track("motion sickness.mp3", "Motion Sickness", "Phoebe Bridgers", "Stranger in the Alps", 230, freq + 9, silence_tail=4), 22))
    return tracks


def _seed() -> None:
    from services import date_service, favorite_playlist, favorite_service, mp3_service, playlist_service, queue_service
    from models.queue import QueueItemCreate
    from tests import seed

    shutil.rmtree(LIBRARY_DIR, ignore_errors=True)
    DB_FILE.unlink(missing_ok=True)
    dated = _tracks()
    tracks = [track for track, _ in dated]
    print(f"Seeding {len(tracks)} songs into {LIBRARY_DIR} ...")
    seed.seed_library(LIBRARY_DIR, tracks, AUDIO_CACHE, mono=True)

    for init in (mp3_service.init, queue_service.init, playlist_service.init, favorite_service.init, date_service.init):
        init()
    rng = random.Random(11)
    now = datetime.now(timezone.utc)
    for track, days_ago in dated:
        date_service.set_date(track.filename, now - timedelta(days=days_ago, minutes=rng.randint(0, 600)))
    mp3_service.invalidate_library_cache()

    names = [track.filename for track in tracks]
    playlist_service.create("Late Night", [name for name in names if rng.random() < 0.25], "after midnight")
    playlist_service.create("Road Trip", [name for name in names if rng.random() < 0.2])
    playlist_service.create("faves", [])
    favorite_service.set_many(rng.sample(names, 14), [])
    favorite_playlist.ensure()

    queue_service.add_items([
        QueueItemCreate(url="https://www.youtube.com/watch?v=sandbox0001", custom_filename="pyramids", title="Pyramids", artist="Frank Ocean", album="Channel Orange"),
        QueueItemCreate(url="https://www.youtube.com/watch?v=sandbox0002", title="Feels Like We Only Go Backwards", artist="Tame Impala", album="Lonerism"),
    ])


def main() -> None:
    parser = argparse.ArgumentParser(description="Run myp3d against a synthetic library")
    parser.add_argument("--port", type=int, default=8001)
    parser.add_argument("--reset", action="store_true", help="throw away the sandbox library and seed it again")
    args = parser.parse_args()

    os.environ.update(MYP3D_LIBRARY_DIR=str(LIBRARY_DIR), MYP3D_DB_PATH=str(DB_FILE), API_PORT=str(args.port))
    sys.path.insert(0, str(BACKEND_DIR))
    from services import config

    if config.OUTPUT_DIR.resolve() != LIBRARY_DIR.resolve() or config.DB_PATH.resolve() != DB_FILE.resolve():
        sys.exit("The sandbox must run against its own library")
    if args.reset or not DB_FILE.exists():
        _seed()

    import uvicorn

    print(f"Sandbox API on http://localhost:{args.port}")
    uvicorn.run("main:app", host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
