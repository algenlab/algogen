import argparse
import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Dict, List, Tuple


def _parse_group(stem: str) -> str:
    m = re.match(r"^(\d+)__", stem)
    if m:
        return f"chapter_{m.group(1)}"
    return "misc"


def _friendly_title(stem: str) -> str:
    s = stem
    if "__" in s:
        s = s.split("__", 1)[1]
    s = re.sub(r"_tracker(_v\d+)?$", "", s)
    return s


def _get_duration_seconds(path: Path, ffprobe: str) -> float:
    try:
        r = subprocess.run(
            [ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
            capture_output=True,
            text=True,
            check=False,
        )
        return float((r.stdout or "").strip())
    except Exception:
        return 0.0


def _get_video_codec(path: Path, ffprobe: str) -> str:
    try:
        r = subprocess.run(
            [
                ffprobe,
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=codec_name,codec_tag_string,profile",
                "-of",
                "csv=p=0",
                str(path),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        return ((r.stdout or "").strip() or "unknown")
    except Exception:
        return "unknown"


def _ensure_h264_mp4(dst: Path, ffmpeg: str, ffprobe: str) -> None:
    codec = _get_video_codec(dst, ffprobe)
    if "h264" in codec and "avc1" in codec:
        return

    tmp = dst.with_name(dst.stem + ".__h264_tmp__.mp4")
    if tmp.exists():
        tmp.unlink()

    cmd = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(dst),
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-profile:v",
        "high",
        "-level",
        "4.2",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-tag:v",
        "avc1",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        str(tmp),
    ]
    subprocess.run(cmd, check=True)
    tmp.replace(dst)


def _select_videos(
    candidates: List[Tuple[Path, float, int, str, str]],
    count: int,
) -> List[Tuple[Path, float, int, str, str]]:
    groups: Dict[str, List[Tuple[Path, int, str, str]]] = {}
    for p, duration_s, size, group, stem in candidates:
        groups.setdefault(group, []).append((p, duration_s, size, group, stem))

    for g in groups:
        groups[g].sort(key=lambda x: (-x[1], -x[2], x[4]))

    selected: List[Tuple[Path, int, str, str]] = []
    selected: List[Tuple[Path, float, int, str, str]] = []

    for g in sorted(groups.keys()):
        if len(selected) >= count:
            break
        if groups[g]:
            selected.append(groups[g].pop(0))

    remaining: List[Tuple[Path, int, str, str]] = []
    for g in groups:
        remaining.extend(groups[g])

    remaining.sort(key=lambda x: (-x[1], -x[2], x[4]))

    for item in remaining:
        if len(selected) >= count:
            break
        selected.append(item)

    return selected


def _copy_if_needed(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        try:
            if dst.stat().st_size == src.stat().st_size:
                return
        except Exception:
            pass
    shutil.copy2(src, dst)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=30)
    ap.add_argument("--min-duration", type=float, default=10.0)
    ap.add_argument("--max-size-mb", type=float, default=80.0)
    ap.add_argument("--transcode-h264", action="store_true")
    args = ap.parse_args()

    repo_root = Path(__file__).resolve().parents[2]
    source_video_dir = repo_root / "tracker_v2" / "algorithm_analysis" / "videos"
    site_root = repo_root / "aigogen_project_page"
    assets_dir = site_root / "assets"
    out_video_dir = assets_dir / "videos"
    data_json_path = assets_dir / "data.json"

    if not source_video_dir.exists():
        raise FileNotFoundError(f"source_video_dir not found: {source_video_dir}")
    if not data_json_path.exists():
        raise FileNotFoundError(f"data.json not found: {data_json_path}")

    ffprobe = "/usr/bin/ffprobe" if Path("/usr/bin/ffprobe").exists() else (shutil.which("ffprobe") or "ffprobe")
    ffmpeg = "/usr/bin/ffmpeg" if Path("/usr/bin/ffmpeg").exists() else (shutil.which("ffmpeg") or "ffmpeg")

    candidates: List[Tuple[Path, float, int, str, str]] = []
    for p in sorted(source_video_dir.glob("*.mp4")):
        stem = p.stem
        size = p.stat().st_size
        group = _parse_group(stem)
        duration_s = _get_duration_seconds(p, ffprobe)

        candidates.append((p, duration_s, size, group, stem))

    if not candidates:
        raise RuntimeError(f"no mp4 found under: {source_video_dir}")

    filtered: List[Tuple[Path, float, int, str, str]] = []
    for p, duration_s, size, group, stem in candidates:
        size_mb = size / 1024 / 1024
        if duration_s >= args.min_duration and size_mb <= args.max_size_mb:
            filtered.append((p, duration_s, size, group, stem))

    base_pool = filtered if len(filtered) >= max(1, args.count) else candidates
    selected = _select_videos(base_pool, max(1, args.count))

    records = []
    for p, duration_s, size, group, stem in selected:
        dst = out_video_dir / p.name
        _copy_if_needed(p, dst)

        if args.transcode_h264:
            _ensure_h264_mp4(dst, ffmpeg=ffmpeg, ffprobe=ffprobe)

        records.append(
            {
                "id": f"algorithm_analysis__{stem}",
                "category": "algorithm_analysis",
                "task_id": stem,
                "group": group,
                "display_title": _friendly_title(stem),
                "video_file": p.name,
                "duration_s": round(duration_s, 2),
                "size_mb": round(size / 1024 / 1024, 2),
                "original_video_path": str(p),
            }
        )

    with open(data_json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    data["algorithm_analysis_videos"] = records
    data.setdefault("stats", {})["algorithm_analysis_selected"] = len(records)

    with open(data_json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    total_mb = sum(r["size_mb"] for r in records)
    print(f"✓ Selected {len(records)} videos")
    print(f"✓ Copied to: {out_video_dir}")
    print(f"✓ Updated: {data_json_path}")
    print(f"✓ Total size (MB): {round(total_mb, 2)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
