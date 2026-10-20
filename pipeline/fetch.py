"""Download every source file the entries are built from, and pin it.

Writes data/raw/<file> and sources.lock.json (url, sha256, bytes, license, retrieved).
Files already on disk are not downloaded again; their hashes are recomputed so the
lock always describes the bytes the build actually read.

    python pipeline/fetch.py
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
LOCK = ROOT / "sources.lock.json"

ZENODO = "https://zenodo.org/records/14983481/files"
ZENODO_LICENSE = "CC-BY-4.0"

# One row per file. `level` follows Dynamic PDB's data levels, used loosely for HDX
# (see README, "Data model").
SOURCES = [
    {
        "id": "zenodo_dataset4",
        "file": "Dataset_4_HDXNMR.json",
        "url": f"{ZENODO}/Dataset_4_HDXNMR.json?download=1",
        "license": ZENODO_LICENSE,
        "level": "L2",
        "title": "HDX-NMR per-residue exchange rates and unfolding free energies (13 proteins)",
    },
    {
        "id": "zenodo_dataset3",
        "file": "Dataset_3_MeasurablyStable.json",
        "url": f"{ZENODO}/Dataset_3_MeasurablyStable.json?download=1",
        "license": ZENODO_LICENSE,
        "level": "L1",
        "title": "mHDX-MS isotope distributions and fitted exchange rates, measurably stable domains",
    },
    {
        "id": "pdb_8ske",
        "file": "8SKE.cif",
        "url": "https://files.rcsb.org/download/8SKE.cif",
        "license": "CC0-1.0",
        "level": "L2",
        "title": "PDB 8SKE, NMR solution structure of EEHEE_rd4_0642 (20 models)",
    },
    {
        "id": "pride_pxd061702",
        "file": "PXD061702.json",
        "url": "https://www.ebi.ac.uk/pride/ws/archive/v3/projects/PXD061702",
        "license": "CC0-1.0",
        "level": "L0",
        "title": "PRIDE project record for the raw mHDX-MS files",
    },
]

# Code is pinned by commit, not downloaded: the lock records what was current when fetched.
REPOS = ["Rocklin-Lab/mhdx_pipeline", "Rocklin-Lab/hdxrate_pipeline", "Rocklin-Lab/mhdx_analysis"]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def download(src: dict) -> dict:
    path = RAW / src["file"]
    if not path.exists():
        print(f"downloading {src['file']}", file=sys.stderr)
        tmp = path.with_suffix(path.suffix + ".part")
        with requests.get(src["url"], stream=True, timeout=120) as r:
            r.raise_for_status()
            with tmp.open("wb") as f:
                for block in r.iter_content(1 << 20):
                    f.write(block)
        tmp.rename(path)
    return {**src, "sha256": sha256(path), "bytes": path.stat().st_size}


def head_commit(repo: str) -> dict:
    r = requests.get(f"https://api.github.com/repos/{repo}/commits/HEAD", timeout=30)
    r.raise_for_status()
    return {"repo": f"https://github.com/{repo}", "commit": r.json()["sha"]}


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    previous = json.loads(LOCK.read_text()) if LOCK.exists() else {}
    # Two at a time: the archives rate-limit, and production crawls at 8 have caused 503s.
    with ThreadPoolExecutor(max_workers=2) as pool:
        files = list(pool.map(download, SOURCES))
    # Keep pinned commits once recorded, so a re-run reproduces the same lock.
    repos = previous.get("repos") or [head_commit(r) for r in REPOS]
    lock = {
        "retrieved": previous.get("retrieved") or dt.date.today().isoformat(),
        "files": files,
        "repos": repos,
    }
    LOCK.write_text(json.dumps(lock, indent=2) + "\n")
    for f in files:
        print(f"{f['sha256'][:12]}  {f['bytes']:>11,}  {f['file']}")


if __name__ == "__main__":
    main()
