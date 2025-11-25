import os
import json
import shutil
from pathlib import Path
import glob

# Configuration
SOURCE_DIR = Path("/data/lkp/paper/AIgoGen_final/tracker_v2/deepseek-ai_DeepSeek-V3.1-Terminus")
VIDEO_DIR = SOURCE_DIR / "videos_720p"
OUTPUT_DIR = Path("/data/lkp/paper/AIgoGen_final/project_page")
ASSETS_DIR = OUTPUT_DIR / "assets"
TRACES_DIR = ASSETS_DIR / "traces"
VIDEOS_OUT_DIR = ASSETS_DIR / "videos"
DATA_FILE = ASSETS_DIR / "data.json"

# Ensure directories exist
TRACES_DIR.mkdir(parents=True, exist_ok=True)
VIDEOS_OUT_DIR.mkdir(parents=True, exist_ok=True)

# Categories to find
CATEGORIES = ["array", "dp", "graph", "tree", "sorting", "hashtable"]
SELECTED_SAMPLES = {cat: [] for cat in CATEGORIES}
MAX_SAMPLES_PER_CAT = 1  # Number of interactive demos per category

# Scan for traces
print(f"Scanning {SOURCE_DIR} for traces...")

all_records = []

# Strategy: Find traces that have corresponding videos
# Pattern: tracker__{category}_leetcode_{id}_seed_{seed}_v2_trace.json
trace_files = list(SOURCE_DIR.glob("tracker__*_v2_trace.json"))

print(f"Found {len(trace_files)} trace files.")

for trace_path in trace_files:
    filename = trace_path.name
    # Parse filename to get metadata
    # Format: tracker__{category}_leetcode_{id}_seed_{seed}_v2_trace.json
    try:
        parts = filename.replace("tracker__", "").replace("_v2_trace.json", "").split("_leetcode_")
        category = parts[0]
        rest = parts[1].split("_seed_")
        task_id = rest[0]
        seed = rest[1]
        
        # Construct video filename
        # Format in videos_720p: {category}_leetcode_{id}_seed_{seed}.mp4
        video_filename = f"{category}_leetcode_{task_id}_seed_{seed}.mp4"
        video_path = VIDEO_DIR / video_filename
        
        if not video_path.exists():
            # Try finding by partial match if exact match fails
            # Sometimes category naming might differ slightly
            candidates = list(VIDEO_DIR.glob(f"*{task_id}_seed_{seed}.mp4"))
            if candidates:
                video_path = candidates[0]
            else:
                continue

        record = {
            "id": f"{category}_{task_id}",
            "category": category,
            "task_id": task_id,
            "seed": seed,
            "trace_file": filename,
            "video_file": video_path.name,
            "original_trace_path": str(trace_path),
            "original_video_path": str(video_path)
        }
        
        all_records.append(record)
        
        # Select for interactive demo
        if len(SELECTED_SAMPLES.get(category, [])) < MAX_SAMPLES_PER_CAT:
            SELECTED_SAMPLES[category].append(record)
            
            # Copy trace file
            shutil.copy2(trace_path, TRACES_DIR / filename)
            # Copy video file (optional, but good for the demo section)
            shutil.copy2(video_path, VIDEOS_OUT_DIR / video_path.name)
            print(f"Copied sample: {filename}")

    except Exception as e:
        # print(f"Skipping {filename}: {e}")
        pass

# Sort records by category
all_records.sort(key=lambda x: (x["category"], int(x["task_id"]) if x["task_id"].isdigit() else x["task_id"]))

# Create manifest
manifest = {
    "stats": {
        "total_tasks": len(all_records),
        "categories": CATEGORIES
    },
    "samples": [item for cat in SELECTED_SAMPLES.values() for item in cat],
    "all_videos": all_records
}

with open(DATA_FILE, "w") as f:
    json.dump(manifest, f, indent=2)

print(f"Generated manifest with {len(all_records)} records.")
