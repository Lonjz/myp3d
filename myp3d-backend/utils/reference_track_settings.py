import argparse
import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any

from services.config import OUTPUT_DIR, get_ffmpeg_path

MAX_VOLUME_PATTERN = re.compile(r"max_volume:\s*(-?\d+(?:\.\d+)?)\s+dB")


def resolve_ffmpeg_command() -> str:
    """Resolve ffmpeg executable from config or system PATH."""
    ffmpeg_path = get_ffmpeg_path()
    if ffmpeg_path:
        ffmpeg_file = Path(ffmpeg_path)
        if not ffmpeg_file.exists():
            raise FileNotFoundError(f"ffmpeg not found at configured path: {ffmpeg_file}")
        return str(ffmpeg_file)

    return "ffmpeg"


def resolve_track_path(track: str) -> Path:
    """Resolve track from a user-provided path spec.

    Resolution order:
    1) Exact absolute path
    2) Relative to current working directory
    3) Relative to downloads folder
    """
    raw = os.path.expandvars(os.path.expanduser(track.strip()))
    candidate = Path(raw)

    candidates: list[Path] = []
    if candidate.is_absolute():
        candidates.append(candidate)
    else:
        candidates.append((Path.cwd() / candidate).resolve())
        candidates.append((OUTPUT_DIR / candidate).resolve())

    for path in candidates:
        if path.exists() and path.is_file():
            return path

    attempted = "\n".join(str(p) for p in candidates)
    raise FileNotFoundError(f"Track not found. Tried:\n{attempted}")


def resolve_track_input(positional_track: str | None, optional_track: str | None) -> str:
    """Resolve track input from CLI args or interactive prompt."""
    if optional_track:
        return optional_track
    if positional_track:
        return positional_track

    entered = input("Enter track path: ").strip()
    if not entered:
        raise ValueError("Track path is required")
    return entered


def detect_max_volume_db(track_path: Path, ffmpeg_cmd: str) -> float:
    """Get peak dB from ffmpeg volumedetect."""
    null_output = "NUL" if os.name == "nt" else "/dev/null"
    result = subprocess.run(
        [
            ffmpeg_cmd,
            "-hide_banner",
            "-i",
            str(track_path),
            "-af",
            "volumedetect",
            "-f",
            "null",
            null_output,
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    output = f"{result.stdout}\n{result.stderr}"
    match = MAX_VOLUME_PATTERN.search(output)
    if not match:
        raise RuntimeError("Unable to parse max_volume from ffmpeg output")

    return float(match.group(1))


def parse_loudnorm_json(output: str) -> dict[str, Any]:
    """Extract loudnorm JSON block from ffmpeg output."""
    start = output.find("{")
    end = output.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise RuntimeError("Unable to parse loudnorm JSON from ffmpeg output")

    json_text = output[start : end + 1]
    return json.loads(json_text)


def as_float(value: Any) -> float | None:
    """Convert ffmpeg numeric string values to float."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        stripped = value.strip()
        if stripped in {"inf", "-inf", "nan"}:
            return None
        try:
            return float(stripped)
        except ValueError:
            return None
    return None


def detect_loudnorm_measurements(
    track_path: Path,
    ffmpeg_cmd: str,
    target_i: float,
    target_tp: float,
    target_lra: float,
) -> dict[str, Any]:
    """Run loudnorm first pass and return measured values."""
    null_output = "NUL" if os.name == "nt" else "/dev/null"
    filter_arg = (
        f"loudnorm=I={target_i}:TP={target_tp}:LRA={target_lra}:print_format=json"
    )
    result = subprocess.run(
        [
            ffmpeg_cmd,
            "-hide_banner",
            "-i",
            str(track_path),
            "-af",
            filter_arg,
            "-f",
            "null",
            null_output,
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    output = f"{result.stdout}\n{result.stderr}"
    data = parse_loudnorm_json(output)

    return {
        "input_i": as_float(data.get("input_i")),
        "input_tp": as_float(data.get("input_tp")),
        "input_lra": as_float(data.get("input_lra")),
        "input_thresh": as_float(data.get("input_thresh")),
        "target_offset": as_float(data.get("target_offset")),
        "normalization_type": data.get("normalization_type"),
    }


def build_standard_args(
    reference_track: Path,
    peak_db: float,
    loudnorm: dict[str, Any],
    target_i: float,
    target_tp: float,
    target_lra: float,
    peak_margin_db: float,
) -> dict[str, Any]:
    """Build copy-paste settings derived from the reference track."""
    target_peak_db = round(peak_db - peak_margin_db, 2)

    return {
        "reference_track": str(reference_track),
        "target_peak_db": target_peak_db,
        "peak_margin_db": peak_margin_db,
        "max_volume_db": round(peak_db, 2),
        "api_query": f"target_peak_db={target_peak_db}",
        "loudnorm_standard": {
            "target_i": target_i,
            "target_tp": target_tp,
            "target_lra": target_lra,
            "measured_input_i": loudnorm.get("input_i"),
            "measured_input_tp": loudnorm.get("input_tp"),
            "measured_input_lra": loudnorm.get("input_lra"),
            "measured_input_thresh": loudnorm.get("input_thresh"),
            "measured_target_offset": loudnorm.get("target_offset"),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Analyze a reference track and print normalization settings as JSON."
    )
    parser.add_argument(
        "track",
        nargs="?",
        help="Track path spec (absolute or relative).",
    )
    parser.add_argument(
        "--track",
        dest="track_option",
        help="Track path spec (absolute or relative).",
    )
    parser.add_argument(
        "--i",
        type=float,
        default=-14.0,
        help="Loudnorm target integrated loudness (default: -14.0)",
    )
    parser.add_argument(
        "--tp",
        type=float,
        default=-1.0,
        help="Loudnorm target true peak in dB (default: -1.0)",
    )
    parser.add_argument(
        "--lra",
        type=float,
        default=11.0,
        help="Loudnorm target loudness range (default: 11.0)",
    )
    parser.add_argument(
        "--peak-margin-db",
        type=float,
        default=0.0,
        help="Subtract from reference max volume to add headroom (default: 0.0)",
    )
    parser.add_argument(
        "--args-only",
        action="store_true",
        help="Print only the copy-paste standard args JSON.",
    )
    args = parser.parse_args()

    track_input = resolve_track_input(args.track, args.track_option)
    track_path = resolve_track_path(track_input)
    ffmpeg_cmd = resolve_ffmpeg_command()

    peak_db = detect_max_volume_db(track_path, ffmpeg_cmd)
    loudnorm = detect_loudnorm_measurements(
        track_path,
        ffmpeg_cmd,
        target_i=args.i,
        target_tp=args.tp,
        target_lra=args.lra,
    )

    standard_args = build_standard_args(
        reference_track=track_path,
        peak_db=peak_db,
        loudnorm=loudnorm,
        target_i=args.i,
        target_tp=args.tp,
        target_lra=args.lra,
        peak_margin_db=args.peak_margin_db,
    )

    if args.args_only:
        print(json.dumps(standard_args, indent=2))
        return

    payload = {
        "reference_track": str(track_path),
        "peak_analysis": {
            "max_volume_db": peak_db,
            "suggested_target_peak_db": standard_args["target_peak_db"],
        },
        "loudnorm_first_pass": loudnorm,
        "standard_args_for_copilot": standard_args,
        "notes": [
            "Paste standard_args_for_copilot back to Copilot to lock this as the normalization standard.",
            "Use --args-only if you only want the copy-paste arg block.",
        ],
    }

    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
