"""Download Google Drive folders published by district sites for collector rates 2026-27."""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "pdfs"

# Prefer Final folders when both draft + final exist
DRIVE_FOLDERS = {
    "ambala": [
        ("predictive_2026", "https://drive.google.com/drive/folders/1Pi1tLA0PqJi_93LRAs8byi5aFDHnTO_F"),
    ],
    "jind": [
        ("final_2026", "https://drive.google.com/drive/folders/1KW4-Kis_37o_YsYPh7d9xG8ViAXVRp8H"),
        # draft kept only if final fails
    ],
    "kaithal": [
        ("final_2026", "https://drive.google.com/drive/folders/1W66H6KLBb7pkPcX09hnIk4-3sbvYUl0k"),
        ("proposed_2026", "https://drive.google.com/drive/folders/1Kp1KNES6dWHmhzeOpJDZaWaftrzk4Yqc"),
    ],
    "kurukshetra": [
        ("draft_2026", "https://drive.google.com/drive/folders/1omr4w0nDEoGhoOLfB2SXRgD9K1uYq9zZ"),
    ],
    "sirsa": [
        ("draft_2026", "https://drive.google.com/drive/folders/1oM66vsHmO0TM5b79PxSxVozO3-aGsri5"),
    ],
    "yamunanagar": [
        ("proposed_2026", "https://drive.google.com/drive/folders/1xaUDdTU9JJGmxhfarBjQfCl9loGC-JLk"),
    ],
}


def folder_id(url: str) -> str:
    m = re.search(r"/folders/([a-zA-Z0-9_-]+)", url)
    if not m:
        raise ValueError(url)
    return m.group(1)


def download_folder(district: str, label: str, url: str) -> None:
    out = ROOT / district
    out.mkdir(parents=True, exist_ok=True)
    fid = folder_id(url)
    print(f"\n=== {district} / {label} ({fid}) ===")
    # gdown folder download
    cmd = [
        sys.executable,
        "-m",
        "gdown",
        "--folder",
        f"https://drive.google.com/drive/folders/{fid}",
        "-O",
        str(out),
        "--remaining-ok",
    ]
    print(" ", " ".join(cmd))
    subprocess.run(cmd, check=False)


def main() -> None:
    for district, folders in DRIVE_FOLDERS.items():
        for label, url in folders:
            download_folder(district, label, url)
    print("\nDone Drive folders.")


if __name__ == "__main__":
    main()
