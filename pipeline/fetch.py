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
    # --- intact-protein mHDX-MS: Ferrari et al. 2026 (Nature), Rocklin lab ---
    {
        "id": "zenodo_dataset3",
        "file": "Dataset_3_MeasurablyStable.json",
        "url": f"{ZENODO}/Dataset_3_MeasurablyStable.json?download=1",
        "license": ZENODO_LICENSE,
        "level": "L1",
        "title": "mHDX-MS isotope distributions and fitted exchange rates, measurably stable domains",
    },
    {
        "id": "pride_pxd061702",
        "file": "PXD061702.json",
        "url": "https://www.ebi.ac.uk/pride/ws/archive/v3/projects/PXD061702",
        "license": "CC0-1.0",
        "level": "L0",
        "title": "PRIDE project record for the raw mHDX-MS files",
    },
    {
        "id": "pride_pxd061702_files",
        "file": "PXD061702_files.json",
        "url": "https://www.ebi.ac.uk/pride/ws/archive/v3/projects/PXD061702/files/all",
        "license": "CC0-1.0",
        "level": "L0",
        "title": "PRIDE file listing for PXD061702 (names, sizes, FTP locations)",
    },
    # --- peptide-level HDX-MS: ecDHFR, Glasgow lab (Lu et al. 2026, Nat. Chem. Biol.) ---
    {
        "id": "pride_pxd057539",
        "file": "PXD057539.json",
        "url": "https://www.ebi.ac.uk/pride/ws/archive/v3/projects/PXD057539",
        "license": "CC0-1.0",
        "level": "L0",
        "title": "PRIDE project record for the PIGEON-FEATHER datasets (protocols, software, thresholds)",
    },
    {
        "id": "pride_pxd057539_files",
        "file": "PXD057539_files.json",
        "url": "https://www.ebi.ac.uk/pride/ws/archive/v3/projects/PXD057539/files/all",
        "license": "CC0-1.0",
        "level": "L0",
        "title": "PRIDE file listing for PXD057539",
    },
    # UniProt records of the proteins: name, gene, organism and reference sequence. Each
    # accession is checked in the build (reference structures' _struct_ref for ecDHFR;
    # sequence alignment for every protein).
    *[
        {
            "id": f"uniprot_{acc.lower()}",
            "file": f"uniprot_{acc}.json",
            "url": f"https://rest.uniprot.org/uniprotkb/{acc}.json",
            "license": "CC-BY-4.0",
            "level": "reference",
            "title": f"UniProtKB {acc} ({entry}), {desc}",
        }
        for acc, entry, desc in [
            ("P0ABQ4", "DYR_ECOLI", "dihydrofolate reductase, E. coli"),
            ("Q46798", "YGER_ECOLI", "uncharacterized lipoprotein YgeR, E. coli"),
            ("Q9V853", "SMUF1_DROME", "E3 ubiquitin-protein ligase Smurf1, D. melanogaster"),
            ("Q8CFI0", "NED4L_MOUSE", "E3 ubiquitin-protein ligase NEDD4-like, mouse"),
            ("Q9DBH0", "WWP2_MOUSE", "NEDD4-like E3 ubiquitin-protein ligase WWP2, mouse"),
        ]
    ],
    # The journal site blocks scripted downloads, so this file is placed by hand and
    # checked against its pinned hash (see README, "How to use it").
    {
        "id": "hxms_supplement",
        "file": "btag113_supplementary_data.zip",
        "url": "https://academic.oup.com/bioinformatics/article/42/4/btag113/8512511",
        "manual": True,
        "expected_sha256": "77b3d872a37e0af7a3b0de8646d98c0bfab76e3eaee6563f1bf504e611e53fd4",
        "license": "unverified (preprint version CC-BY-4.0)",
        "level": "L1",
        "title": "Supplementary data of Weber et al., HXMS format (Bioinformatics 2026): ecDHFR APO/MTX/TMP .hxms files",
    },
    *[
        {
            "id": f"pdb_{pdb.lower()}",
            "file": f"{pdb}.cif",
            "url": f"https://files.rcsb.org/download/{pdb}.cif",
            "license": "CC0-1.0",
            "level": "L2",
            "title": f"PDB {pdb}, X-ray structure of E. coli DHFR, {state}",
        }
        for pdb, state in [("5DFR", "unliganded"), ("1RG7", "methotrexate complex"), ("6XG5", "trimethoprim complex")]
    ],
]

# Code is pinned by commit, not downloaded: the lock records what was current when fetched.
REPOS = ["Rocklin-Lab/mhdx_pipeline", "Rocklin-Lab/hdxrate_pipeline", "Rocklin-Lab/mhdx_analysis",
         "glasgowlab/PIGEON-FEATHER"]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def download(src: dict) -> dict:
    path = RAW / src["file"]
    if src.get("manual"):
        # placed by hand: take it from ~/Downloads if it is not in data/raw yet
        candidate = Path.home() / "Downloads" / src["file"]
        if not path.exists() and candidate.exists():
            path.write_bytes(candidate.read_bytes())
        if not path.exists():
            raise SystemExit(f"{src['file']}: download it from {src['url']} and put it in data/raw/ or ~/Downloads")
        digest = sha256(path)
        if digest != src["expected_sha256"]:
            raise SystemExit(f"{src['file']}: SHA-256 {digest} does not match the pinned {src['expected_sha256']}")
        return {k: v for k, v in src.items() if k != "expected_sha256"} | {"sha256": digest, "bytes": path.stat().st_size}
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
    pinned = {r["repo"]: r for r in previous.get("repos", [])}
    repos = [pinned.get(f"https://github.com/{r}") or head_commit(r) for r in REPOS]
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
