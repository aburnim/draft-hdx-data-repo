"""Build entry records, cross-entry views and the entry list from the pinned sources.

Entries follow the Dynamic PDB schema v0.2.0 where it applies (one experimental context
per entry; polymer entities for constructs; models, runs and artifacts), with HDX
extensions listed in each record's `extensions`. Per protein there are three entries:
the mHDX-MS measurement, the HDX-NMR measurement, and the reference structure. Entries
whose polymer-entity sequences are contained in the same structure sequence form one
cross-entry view (the Explore tab).

Reads data/raw/ (see fetch.py) and writes, under web/public/:
  index.json                     the HDX entries (front page list)
  entries/<id>.json              entry records (schema/hdx_entry.v0.1.json)
  entries/<id>.residues.csv      per-residue values of an HDX-NMR entry
  views/<view>.json              cross-entry views (schema/hdx_view.v0.1.json)
  structures/<pdb>.cif           reference coordinates

    python pipeline/build_entries.py
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
import re
import shutil
from pathlib import Path

import gemmi
import ijson
import jsonschema
from ijson.common import ObjectBuilder

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "web" / "public"
SCHEMA_ENTRY = json.loads((ROOT / "schema" / "hdx_entry.v0.1.json").read_text())
SCHEMA_VIEW = json.loads((ROOT / "schema" / "hdx_view.v0.1.json").read_text())
LOCK = {f["id"]: f for f in json.loads((ROOT / "sources.lock.json").read_text())["files"]}
REPOS = json.loads((ROOT / "sources.lock.json").read_text())["repos"]
COMMIT = {r["repo"].rsplit("/", 1)[1]: r["commit"] for r in REPOS}
VERSION = "0.1.0"

# Proteins with HDX-NMR data and a PDB structure whose sequence is identical to their
# 6xHis HDX-NMR construct (checked against Dataset_4; see README).
PAGES = {
    "EEHEE_rd4_0642": "8SKE",
    "EEHEE_rd4_0871": "8SKD",
    "HHH_rd4_0518": "8SKX",
    "HEEH_rd4_0097": "5UYO",
    "EHEE_rd2_0005": "8SHM",
}
# Dataset_3 library names that differ from the PRIDE file names. Inferred, not documented.
PRIDE_LIBRARY_ALIAS = {"mutants04": "mut04"}

DOI = "10.1038/s41586-026-10465-z"
PRIDE = "PXD061702"
ZENODO_DOI = "10.5281/zenodo.14983481"
CITATION = "Ferrari et al., Large-scale discovery, analysis, and design of protein energy landscapes. Nature (2026)."
TAG = "MGSSHHHHHHSSGLVPRGSH"

D3_COLS = {
    "name", "library", "pH", "pH_index", "merge_exp", "sequence", "PF", "RT", "group",
    "dg_max", "dg_mean", "dg_median", "n_exch_res",
    "normalized_cooperativity_model_global", "rate_fitting_rmse_total",
    "max_idotp", "backexchange_final_tp",
    "true_time", "exp_distribution", "pred_distribution", "backexchange",
    "free_energy", "rates_mean", "rates_ci_5", "rates_ci_95",
    "cooperativity_model_global", "rate_fitting_rmse_max", "n_protected_res",
}


def opaque_id(key: str, prefix: str = "hdx") -> str:
    """prefix_ + 8 base-36 characters, derived from a stable key so rebuilds keep ids."""
    n = int(hashlib.sha256(key.encode()).hexdigest(), 16)
    chars = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    for _ in range(8):
        n, r = divmod(n, 36)
        out += chars[r]
    return f"{prefix}_{out}"


def origin_of(name: str) -> tuple[str, str | None]:
    """(origin, accession). Designs carry a round tag (_rd4_); PDB-derived domains are
    named PDB<id>; natural domains are <UniProt>.<version>_<start>-<end>."""
    if re.search(r"_rd\d+_", name):
        return ("design variant" if re.search(r"_[A-Z]\d+[A-Z]", name) else "de novo design"), None
    m = re.match(r"^PDB([0-9][A-Z0-9]{3})$", name)
    if m:
        return "PDB-derived domain", m.group(1)
    m = re.match(r"^([A-Z0-9]{6,10})\.\d+_", name)
    return "natural domain", (m.group(1) if m else None)


def num(x):
    """Finite float or None: absent stays absent, never zero."""
    if x is None:
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def rounded(xs, nd=4):
    return [None if num(v) is None else round(float(v), nd) for v in xs]


def lock_uri(key: str) -> str:
    return LOCK[key]["url"].replace("?download=1", "")


# --- sources ---------------------------------------------------------------------------


def read_dataset3() -> dict[str, dict]:
    """Stream the 286 MB column-oriented JSON once, keeping only the rows of PAGES proteins.
    Returns {row_id: {col: value}}."""
    rows: dict[str, dict] = {}
    page_rows: set[str] = set()
    col = row = None
    builder: ObjectBuilder | None = None

    def finish():
        nonlocal builder
        if builder is not None:
            rows.setdefault(row, {})[col] = builder.value
        builder = None

    with (RAW / "Dataset_3_MeasurablyStable.json").open("rb") as f:
        for prefix, event, value in ijson.parse(f, use_float=True):
            if prefix == "" and event == "map_key":
                col = value
                continue
            if prefix == col and event in ("map_key", "end_map"):
                finish()
                if event == "map_key":
                    row = value
                    keep = col == "name" or (col in D3_COLS and row in page_rows)
                    builder = ObjectBuilder() if keep else None
                elif col == "name":
                    # name is the first column; from here on we know which rows to keep
                    page_rows = {r for r, v in rows.items() if v.get("name") in PAGES}
                continue
            if builder is not None:
                builder.event(event, value)
    return {r: v for r, v in rows.items() if r in page_rows}


def read_dataset4() -> list[dict]:
    d = json.loads((RAW / "Dataset_4_HDXNMR.json").read_text())
    return [{k: d[k][i] for k in d} | {"row": int(i)} for i in d["name"]]


def read_pride_files() -> list[dict]:
    """PRIDE file records with name, size and FTP location."""
    out = []
    for f in json.loads((RAW / "PXD061702_files.json").read_text()):
        ftp = next((loc["value"] for loc in f["publicFileLocations"] if loc["name"] == "FTP Protocol"), None)
        m = re.match(r"^\d+_([^_]+)_(pH\d)_(\d+)s_(\d+)\.mzML\.gz$", f["fileName"])
        out.append({"name": f["fileName"], "size_bytes": int(f["fileSizeBytes"]), "uri": ftp,
                    "library": m.group(1) if m else None, "pH": m.group(2) if m else None,
                    "time_s": int(m.group(3)) if m else None, "replicate": int(m.group(4)) if m else None})
    return out


def read_structure(pdb: str) -> dict:
    path = RAW / f"{pdb}.cif"
    block = gemmi.cif.read(str(path)).sole_block()
    scheme = block.find("_pdbx_poly_seq_scheme.", ["asym_id", "seq_id", "mon_id", "pdb_seq_num", "pdb_strand_id"])
    chain_id = scheme[0][4]
    positions = [
        {"pos": int(r[1]), "compId": r[2], "letter": gemmi.find_tabulated_residue(r[2]).one_letter_code.upper(),
         "seq": int(r[3]), "label_asym_id": r[0]}
        for r in scheme
        if r[4] == chain_id
    ]
    pos_of = {p["seq"]: p["pos"] for p in positions}
    secondary = [
        {"start": pos_of[int(r[0])], "end": pos_of[int(r[1])], "kind": "helix"}
        for r in block.find("_struct_conf.", ["beg_auth_seq_id", "end_auth_seq_id"])
    ] + [
        {"start": pos_of[int(r[0])], "end": pos_of[int(r[1])], "kind": "strand"}
        for r in block.find("_struct_sheet_range.", ["beg_auth_seq_id", "end_auth_seq_id"])
    ]
    secondary.sort(key=lambda s: s["start"])
    st = gemmi.read_structure(str(path))
    first = st[0]
    heavy = sum(1 for ch in first for res in ch for at in res if at.element.name not in ("H", "D"))
    return {
        "chain": {
            "id": chain_id,
            "entity_description": gemmi.cif.as_string(block.find_value("_entity.pdbx_description") or "") or None,
            "positions": [{k: p[k] for k in ("pos", "compId", "letter", "seq")} for p in positions],
            "secondary": secondary,
        },
        "label_asym_id": positions[0]["label_asym_id"],
        "title": gemmi.cif.as_string(block.find_value("_struct.title")),
        "method": gemmi.cif.as_string(block.find_value("_exptl.method")),
        "n_models": len(st),
        "atom_count": heavy,
        "modeled_residues": sum(len(ch) for ch in first),
        "sequence": "".join(p["letter"] for p in positions),
        "positions": positions,
    }


# --- per-residue tracks and centroids --------------------------------------------------


def track(metric_id: str, unit: str, keys: list[dict], values: list) -> dict:
    vals = [num(v) for v in values]
    present = [v for v in vals if v is not None]
    domain = [min(present), max(present)] if present else [0.0, 1.0]
    return {"metricId": metric_id, "level": "residue", "unit": unit, "domain": domain, "keys": keys,
            "values": [None if v is None else round(v, 4) for v in vals]}


def centroid(dist: list) -> float | None:
    w = [num(x) or 0.0 for x in dist]
    s = sum(w)
    return sum(i * x for i, x in enumerate(w)) / s if s > 0 else None


def mean_composition(mean_row: dict, measured: list[dict]) -> tuple[list[int], float]:
    """Which measured rows a Dataset_4 per-construct mean averages: the subset whose
    per-residue mean reproduces it best. Returns (rows, max absolute error)."""
    from itertools import combinations
    target = mean_row["free_energy_nc_corrected"]
    best: tuple[list[int], float] | None = None
    for k in range(1, len(measured) + 1):
        for combo in combinations(measured, k):
            err, ok = 0.0, True
            for j, t in enumerate(target):
                if t is None:
                    continue
                xs = [r["free_energy_nc_corrected"][j] for r in combo if r["free_energy_nc_corrected"][j] is not None]
                if not xs:
                    ok = False
                    break
                err = max(err, abs(sum(xs) / len(xs) - t))
            if ok and (best is None or err < best[1]):
                best = ([r["row"] for r in combo], err)
    return best if best else ([], float("nan"))


def common(values: list):
    """The shared value, or None when the inputs differ."""
    vs = {v for v in values}
    return vs.pop() if len(vs) == 1 else None


def nmr_conditions(name: str, d4_rows: list[dict], full_seq: str, seq_of_pos: dict, chain_id: str):
    """One condition per Dataset_4 row of this protein. Rows that repeat another row's values
    are dropped, and so is a per-construct mean of a single measurement. Measurements of one
    construct are not assumed to be replicates: their labeling conditions can differ."""
    nmr = sorted((r for r in d4_rows if r["name"] == name), key=lambda r: r["row"])
    seen, by_construct = set(), {}
    for r in nmr:
        sig = (r["construct"], tuple(rounded(r["free_energy_nc_corrected"], 6)))
        if sig not in seen:
            seen.add(sig)
            by_construct.setdefault(r["construct"], []).append(r)
    conditions, tracks, residues = [], {}, []
    for construct, rs in by_construct.items():
        measured = [r for r in rs if r["obs_rates"] is not None]
        rep = 0
        for r in rs:
            is_mean = r["obs_rates"] is None
            if is_mean and len(measured) < 2:
                continue
            if not is_mean:
                rep += 1
            offset = full_seq.find(r["seq"])
            if offset < 0:
                raise ValueError(f"{name} {construct} sequence not found in the structure sequence")
            keys = [{"chain": chain_id, "seq": seq_of_pos[offset + i + 1], "ins": ""} for i in range(len(r["seq"]))]
            cid = f"nmr_{construct.lower().replace('-', '')}_{'mean' if is_mean else f'r{rep}'}"
            cond = {
                "id": cid, "method": "HDX-NMR", "construct": construct, "replicate": "mean" if is_mean else rep,
                "source_row": r["row"], "offset": offset, "sequence": r["seq"],
            }
            if is_mean:
                rows_used, err = mean_composition(r, measured)
                used = [x for x in measured if x["row"] in rows_used]
                ph, temp = common([num(x["pH"]) for x in used]), common([num(x["temp"]) for x in used])
                buf = common([(x["buffer"] or "").upper() or None for x in used])
                cond |= {"label": f"{construct}, mean of {len(used)} measurements", "pH": ph, "temp_K": temp, "buffer": buf,
                         "mean_of_rows": rows_used, "mean_check_max_abs_error": float(f"{err:.2e}"),
                         "conditions_differ": ph is None or temp is None or buf is None}
            else:
                cond |= {"label": f"{construct}, measurement {rep}", "pH": num(r["pH"]), "temp_K": num(r["temp"]),
                         "buffer": (r["buffer"] or "").upper() or None}
            conditions.append(cond)
            tracks[f"dg:{cid}"] = track("dg", "kcal/mol", keys, r["free_energy_nc_corrected"])
            if not is_mean:
                kobs = [num(x) for x in r["obs_rates"]]
                kint = [num(x) for x in r["intrinsic_rates"]]
                tracks[f"kobs:{cid}"] = track("kobs", "1/s", keys, kobs)
                tracks[f"logpf:{cid}"] = track(
                    "logpf", "log10", keys,
                    [math.log10(a / b) if a and b and a > 0 and b > 0 else None for a, b in zip(kint, kobs)],
                )
            for i, key in enumerate(keys):
                residues.append({
                    "sample": cid, "pos": offset + i + 1, "auth_seq_id": key["seq"], "residue": r["seq"][i],
                    "dg": num(r["free_energy_nc_corrected"][i]),
                    "kobs": None if is_mean else num(r["obs_rates"][i]),
                    "kint": None if is_mean else num(r["intrinsic_rates"][i]),
                    "too_slow": bool(r["too_slow_array"][i]) if r.get("too_slow_array") else None,
                })
    return conditions, tracks, residues


def mhdx_measurement(rid: str, r: dict, full_seq: str, seq_of_pos: dict) -> dict:
    offset = full_seq.find(r["sequence"])
    phs = sorted(set(r.get("pH_index") or [])) or ([r["pH"]] if r["pH"] else [])
    return {
        "id": f"mhdx_{rid}",
        "source_row": int(rid),
        "library": r["library"],
        "pH_label": r["pH"] or "+".join(phs) + " (merged)",
        "pH_labels": phs,
        "merged": bool(r.get("merge_exp")),
        "retention_time_min": num(r["RT"]),
        "sequence": r["sequence"],
        "offset": offset,
        "first_auth_seq": seq_of_pos.get(offset + 1) if offset >= 0 else None,
        "timepoints_s": rounded(r["true_time"], 3),
        "pH_index": r.get("pH_index") or [r["pH"]] * len(r["true_time"]),
        "exp_distribution": [rounded(d, 5) for d in r["exp_distribution"]],
        "pred_distribution": [rounded(d, 5) for d in r["pred_distribution"]],
        "exp_centroid": [None if c is None else round(c, 3) for c in map(centroid, r["exp_distribution"])],
        "pred_centroid": [None if c is None else round(c, 3) for c in map(centroid, r["pred_distribution"])],
        "backexchange": rounded(r["backexchange"], 4),
        "dg_sorted": rounded(r["free_energy"], 4),
        "ln_k_sorted": rounded(r["rates_mean"], 4),
        "ln_k_ci5": rounded(r["rates_ci_5"], 4),
        "ln_k_ci95": rounded(r["rates_ci_95"], 4),
        "group": r["group"],
    }


MHDX_METRICS = [
    ("dg_max", "dg_max", "kcal/mol"), ("dg_median", "dg_median", "kcal/mol"),
    ("cooperativity", "cooperativity_model_global", None),
    ("cooperativity_normalized", "normalized_cooperativity_model_global", None),
    ("fit_rmse", "rate_fitting_rmse_total", None), ("fit_rmse_max", "rate_fitting_rmse_max", None),
    ("idotp_max", "max_idotp", None), ("backexchange_final", "backexchange_final_tp", None),
    ("n_exchangeable", "n_exch_res", None), ("n_protected", "n_protected_res", None),
]


def representative(conditions: list[dict], construct: str) -> dict | None:
    """The condition that stands for a construct: its mean if present, else replicate 1."""
    cs = [c for c in conditions if c["construct"] == construct]
    return next((c for c in cs if c["replicate"] == "mean"), cs[0] if cs else None)


# --- one protein: three entries and their view ------------------------------------------


def build_protein(name: str, pdb: str, d3_rows: list[tuple[str, dict]], d4_rows: list[dict], pride: list[dict]):
    struct = read_structure(pdb)
    chain = struct["chain"]
    full_seq = struct["sequence"]
    seq_of_pos = {p["pos"]: p["seq"] for p in chain["positions"]}
    origin, accession = origin_of(name)
    ids = {"mhdx": opaque_id(f"{name}|mHDX-MS"), "nmr": opaque_id(f"{name}|HDX-NMR"), "structure": opaque_id(f"{pdb}|structure")}
    view_id = f"view_{pdb.lower()}"

    nmr_conds, tracks, nmr_residues = nmr_conditions(name, d4_rows, full_seq, seq_of_pos, chain["id"])
    measurements = [mhdx_measurement(rid, r, full_seq, seq_of_pos) for rid, r in sorted(d3_rows, key=lambda x: int(x[0]))]
    m = measurements[0]
    d3row = d3_rows[0][1]
    mhdx_conds = [{
        "id": m["id"], "label": f"mHDX-MS, {m['library']}, {m['pH_label']}", "method": "mHDX-MS",
        "construct": "Dataset_3 sequence", "replicate": None, "pH": m["pH_label"], "temp_K": None, "buffer": None,
        "source_row": m["source_row"],
    }]
    # every polymer-entity sequence must lie in the structure sequence: that is the grouping rule
    if m["offset"] < 0 or any(c["offset"] < 0 for c in nmr_conds):
        raise ValueError(f"{name}: a construct is not contained in {pdb}")

    # raw files of this measurement: same library and pH as the Dataset_3 row
    lib = PRIDE_LIBRARY_ALIAS.get(m["library"], m["library"])
    raw_files = sorted((f for f in pride if f["library"] == lib and f["pH"] in m["pH_labels"]),
                       key=lambda f: (f["pH"], f["time_s"], f["replicate"]))

    # --- the view: everything the Explore tab draws, with provenance nodes ---
    d3_uri, d3_sha = lock_uri("zenodo_dataset3"), LOCK["zenodo_dataset3"]["sha256"]
    d4_uri, d4_sha = lock_uri("zenodo_dataset4"), LOCK["zenodo_dataset4"]["sha256"]
    pdb_key = f"pdb_{pdb.lower()}"
    alias_note = f"; PRIDE library '{lib}' assumed to be Dataset_3 '{m['library']}'" if lib != m["library"] else ""
    nodes = [
        {"id": "a_raw", "kind": "artifact", "entry": ids["mhdx"], "short": f"PRIDE {PRIDE}", "level": "L0",
         "title": f"{len(raw_files)} mzML files, {lib} {'+'.join(m['pH_labels'])}, PRIDE {PRIDE}{alias_note}",
         "format": "mzml.gz", "uri": f"https://www.ebi.ac.uk/pride/archive/projects/{PRIDE}", "sha256": None,
         "license": "CC0-1.0", "held": False},
        {"id": "a_nmr_raw", "kind": "artifact", "entry": ids["nmr"], "short": "NMR spectra", "level": "L0",
         "title": "HDX-NMR spectra (location not stated in the cited sources)", "format": "NMR spectra",
         "uri": None, "sha256": None, "license": "unknown", "held": False},
        {"id": "a_d3", "kind": "artifact", "entry": ids["mhdx"], "short": "Dataset_3", "level": "L1",
         "title": "Zenodo Dataset_3: isotope distributions and fit results", "format": "json",
         "uri": d3_uri, "sha256": d3_sha, "license": "CC-BY-4.0", "held": False},
        {"id": "a_d4", "kind": "artifact", "entry": ids["nmr"], "short": "Dataset_4", "level": "L1",
         "title": "Zenodo Dataset_4: HDX-NMR exchange rates and ΔG", "format": "json",
         "uri": d4_uri, "sha256": d4_sha, "license": "CC-BY-4.0", "held": False},
        {"id": "m_mhdx", "kind": "model", "entry": ids["mhdx"], "short": "Dataset_3", "level": "L2",
         "title": "Model: sorted site ΔG (hdxrate_pipeline fit), stored in Dataset_3", "format": "json",
         "uri": d3_uri, "sha256": d3_sha, "license": "CC-BY-4.0", "held": False, "stored_in": "a_d3"},
        {"id": "m_nmr", "kind": "model", "entry": ids["nmr"], "short": "Dataset_4", "level": "L2",
         "title": "Model: per-residue ΔG (HDX-NMR analysis), stored in Dataset_4", "format": "json",
         "uri": d4_uri, "sha256": d4_sha, "license": "CC-BY-4.0", "held": False, "stored_in": "a_d4"},
        {"id": "a_pdb", "kind": "artifact", "entry": ids["structure"], "short": f"PDB {pdb}", "level": "L2",
         "title": f"PDB {pdb}: deposited model, {struct['n_models']} conformers", "format": "mmcif",
         "uri": lock_uri(pdb_key), "sha256": LOCK[pdb_key]["sha256"], "license": "CC0-1.0", "held": True},
        {"id": "a_view", "kind": "artifact", "entry": None, "short": "view record", "level": "L3",
         "title": "Cross-entry view, with L3 metrics computed by this repository", "format": "json",
         "uri": f"views/{view_id}.json", "sha256": None, "license": "CC-BY-4.0", "held": True},
    ]
    runs = [
        {"id": "r_mhdx", "software": "mhdx_pipeline", "version": COMMIT.get("mhdx_pipeline"),
         "description": "Extracts one intact-protein isotope distribution per labeling time from the raw data",
         "inputs": ["a_raw"], "outputs": ["a_d3"], "parsed_from": "paper and repository README"},
        {"id": "r_rates", "software": "hdxrate_pipeline", "version": COMMIT.get("hdxrate_pipeline"),
         "description": "Fits sorted exchange rates to the isotope distributions; reports ΔG per site (Dataset_3 free_energy)",
         "inputs": ["a_d3"], "outputs": ["m_mhdx"], "parsed_from": "Dataset_3 field names and repository README"},
        {"id": "r_nmr", "software": "HDX-NMR analysis (Ferrari et al. 2026)", "version": None,
         "description": "Per-amide exchange rates and ΔG from HDX-NMR; method described in Ferrari et al.",
         "inputs": ["a_nmr_raw"], "outputs": ["a_d4", "m_nmr"], "parsed_from": "paper"},
        {"id": "r_build", "software": "hdx-data-repo pipeline/build_entries.py", "version": VERSION,
         "description": "Groups entries by shared sequence, maps residues to the reference structure, computes L3 metrics",
         "inputs": ["m_mhdx", "m_nmr", "a_pdb"], "outputs": ["a_view"], "parsed_from": "this repository"},
    ]
    metrics = [
        {"key": key, "value": round(num(d3row[field]), 4), "unit": unit, "level": "L2", "interpretation": "m_mhdx",
         "source_field": field, "computed_here": False, "entry": ids["mhdx"]}
        for key, field, unit in MHDX_METRICS if num(d3row.get(field)) is not None
    ]
    # L3: compare the sorted mHDX-MS landscape with the closest NMR construct's landscape.
    ref_nmr = representative(nmr_conds, "No-His") or representative(nmr_conds, "6xHis")
    if ref_nmr:
        a = sorted((v for v in m["dg_sorted"] if v is not None), reverse=True)
        b = sorted((v for v in tracks[f"dg:{ref_nmr['id']}"]["values"] if v is not None), reverse=True)
        k = min(len(a), len(b))
        for key, value, field in [
            ("landscape_rmsd_top_k", math.sqrt(sum((x - y) ** 2 for x, y in zip(a[:k], b[:k])) / k), f"top {k} sorted ΔG"),
            ("dg_max_difference", a[0] - b[0], "max sorted ΔG"),
        ]:
            metrics.append({"key": key, "value": round(value, 4), "unit": "kcal/mol", "level": "L3",
                            "interpretation": "m_mhdx vs m_nmr", "source_field": field, "computed_here": True,
                            "entry": None, "nmr_condition": ref_nmr["id"]})

    members = [
        {"id": ids["mhdx"], "kind": "hdx", "method": "mHDX-MS", "title": f"{name}: mHDX-MS, {m['library']}, {m['pH_label']}"},
        {"id": ids["nmr"], "kind": "hdx", "method": "HDX-NMR", "title": f"{name}: HDX-NMR, " + ", ".join(sorted({c["construct"] for c in nmr_conds}))},
        {"id": ids["structure"], "kind": "structure", "method": struct["method"], "title": f"{pdb}: {struct['title']}"},
    ]
    view = {
        "schema_version": VERSION,
        "id": view_id,
        "name": name,
        "title": struct["title"],
        "grouping": f"Entries whose polymer-entity sequences are contained in the {pdb} sequence.",
        "members": members,
        "protein": {"name": name, "origin": origin, "topology": d3row.get("PF"), "uniprot": accession if origin == "natural domain" else None},
        "chain": chain,
        "conditions": nmr_conds_public(nmr_conds) + mhdx_conds,
        "external_refs": {"pdb": pdb, "pride": PRIDE, "zenodo": ZENODO_DOI, "doi": DOI, "github": [r["repo"] for r in REPOS]},
        "artifacts": nodes,
        "runs": runs,
        "tracks": tracks,
        "mhdx": [{k: v for k, v in x.items() if k != "offset"} for x in measurements],
        "metrics": metrics,
        "license": "CC-BY-4.0 (derived from Zenodo 14983481); structure CC0-1.0",
        "citation": CITATION,
    }
    view["derivations"] = build_derivations(view, ids, ref_nmr, nmr_conds, pdb)

    # --- entry records (Dynamic PDB v0.2.0 field names where they exist) ---
    revision = {"revision_number": 1, "parent_revision_id": None, "state": "active", "published_at": None,
                "change_summary": "Initial import from the Ferrari et al. 2026 archives"}
    linked = [{"entry": x["id"], "method": x["method"], "basis": "shared sequence (same cross-entry view)"} for x in members]
    label_asym = struct["label_asym_id"]
    pos_info = {p["pos"]: p for p in struct["positions"]}

    def polymer_entity(pid: str, construct: str, seq: str) -> dict:
        return {"id": pid, "description": name, "construct": construct, "sequence": seq,
                "source_organisms": [], "mutations": [], "uniprot_mappings": []}

    mhdx_entry = {
        "schema_version": VERSION, "id": ids["mhdx"], "kind": "hdx", "state": "active", "revision": revision,
        "title": f"{name}: mHDX-MS, {m['library']}, {m['pH_label']}",
        "method": "mHDX-MS",
        "polymer_entities": [polymer_entity("pe_1", "mHDX-MS construct", m["sequence"])],
        "hdx": {"samples": [{
            "id": m["id"], "polymer_entity": "pe_1", "library": m["library"], "pH_labels": m["pH_labels"],
            "merged_pH_series": m["merged"], "temperature_kelvin": None, "buffer": None,
            "labeling_times_s": m["timepoints_s"], "source": {"artifact": "a_d3", "rows": [str(m["source_row"])]},
        }]},
        "artifacts": [
            *[{"id": f"a_raw_{i + 1:03d}", "name": f["name"], "level": "L0", "type": "other", "format": "mzml.gz",
               "uri": f["uri"], "size_bytes": f["size_bytes"], "sha256": None, "license": "CC0-1.0", "stored": False}
              for i, f in enumerate(raw_files)],
            {"id": "a_d3", "name": "Dataset_3_MeasurablyStable.json", "level": "L1", "type": "other", "format": "json",
             "uri": d3_uri, "size_bytes": LOCK["zenodo_dataset3"]["bytes"], "sha256": d3_sha, "license": "CC-BY-4.0", "stored": False},
        ],
        "runs": [
            {"id": "r_mhdx", "software_name": "mhdx_pipeline", "software_version": COMMIT.get("mhdx_pipeline"),
             "command": None, "parameters": None,
             "inputs": [{"artifact": f"a_raw_{i + 1:03d}"} for i in range(len(raw_files))],
             "outputs": [{"artifact": "a_d3", "selector": {"fields": ["exp_distribution", "true_time", "backexchange"], "rows": [str(m["source_row"])]}}]},
            {"id": "r_rates", "software_name": "hdxrate_pipeline", "software_version": COMMIT.get("hdxrate_pipeline"),
             "command": None, "parameters": None,
             "inputs": [{"artifact": "a_d3", "selector": {"fields": ["exp_distribution", "true_time"], "rows": [str(m["source_row"])]}}],
             "outputs": [{"model": f"{ids['mhdx']}_m_001"}]},
        ],
        "models": [{
            "id": f"{ids['mhdx']}_m_001", "revision_number": 1, "title": "Sorted site ΔG, hdxrate_pipeline fit",
            "model_type": "HDX ΔG set", "purpose": "Model Building", "model_source": "ext", "authors": ["Ferrari et al."],
            "run": "r_rates",
            "source": {"artifact": "a_d3", "selector": {"fields": ["free_energy", "rates_mean", "rates_ci_5", "rates_ci_95", "pred_distribution"], "rows": [str(m["source_row"])]}},
            "residue_data": None,
            "site_data": {"resolution": "sites not assigned to residues", "dg_sorted": m["dg_sorted"], "ln_k_sorted": m["ln_k_sorted"],
                          "ln_k_ci5": m["ln_k_ci5"], "ln_k_ci95": m["ln_k_ci95"]},
            "metrics": [{"key": x["key"], "value": x["value"], "unit": x["unit"], "software_name": "hdxrate_pipeline",
                         "software_version": COMMIT.get("hdxrate_pipeline"), "source_field": x["source_field"]}
                        for x in metrics if x["level"] == "L2"],
        }],
        "external_refs": {"pride": PRIDE, "zenodo": ZENODO_DOI, "doi": DOI},
        "view": view_id, "linked_entries": [x for x in linked if x["entry"] != ids["mhdx"]],
        "extensions": [
            "hdx.samples: HDX experimental block (library, pH labels, labeling times), modeled on crystallography.crystals[]",
            "model_type 'HDX ΔG set': an L2 interpretation without coordinates",
            "site_data: values for exchanging sites not assigned to residues",
            "metric keys dg_max, dg_median, cooperativity, cooperativity_normalized, fit_rmse, fit_rmse_max, idotp_max, backexchange_final, n_exchangeable, n_protected",
            "run input/output selectors: fields and rows within a shared multi-row file",
            "raw artifacts lack sha256: PRIDE lists no checksum and the files were not downloaded",
        ],
        "citation": CITATION,
    }

    residue_data = []
    for r in nmr_residues:
        p = pos_info[r["pos"]]
        residue_data.append({
            "sample": r["sample"], "label_asym_id": label_asym, "label_seq_id": r["pos"], "label_comp_id": p["compId"],
            "auth_asym_id": chain["id"], "auth_seq_id": r["auth_seq_id"], "pdbx_pdb_ins_code": None,
            "dg": r["dg"], "kobs": r["kobs"], "kint": r["kint"],
            "logpf": math.log10(r["kint"] / r["kobs"]) if r["kint"] and r["kobs"] and r["kint"] > 0 and r["kobs"] > 0 else None,
            "too_slow": r["too_slow"],
        })
    constructs = sorted({c["construct"] for c in nmr_conds})
    pe_of = {c: f"pe_{i + 1}" for i, c in enumerate(constructs)}
    nmr_entry = {
        "schema_version": VERSION, "id": ids["nmr"], "kind": "hdx", "state": "active", "revision": revision,
        "title": f"{name}: HDX-NMR, " + ", ".join(constructs),
        "method": "HDX-NMR",
        "polymer_entities": [polymer_entity(pe_of[c], c, next(x["sequence"] for x in nmr_conds if x["construct"] == c)) for c in constructs],
        "hdx": {"samples": [{
            "id": c["id"], "polymer_entity": pe_of[c["construct"]], "measurement": c["replicate"],
            "pH": c["pH"], "temperature_kelvin": c["temp_K"], "buffer": c["buffer"],
            **({"mean_of_rows": [str(x) for x in c["mean_of_rows"]], "conditions_differ": c["conditions_differ"],
                "mean_check_max_abs_error": c["mean_check_max_abs_error"]} if c["replicate"] == "mean" else {}),
            "source": {"artifact": "a_d4", "rows": [str(c["source_row"])]},
        } for c in nmr_conds]},
        "artifacts": [
            {"id": "a_d4", "name": "Dataset_4_HDXNMR.json", "level": "L1", "type": "other", "format": "json",
             "uri": d4_uri, "size_bytes": LOCK["zenodo_dataset4"]["bytes"], "sha256": d4_sha, "license": "CC-BY-4.0", "stored": False},
        ],
        "runs": [
            {"id": "r_nmr", "software_name": "HDX-NMR analysis (Ferrari et al. 2026)", "software_version": None,
             "command": None, "parameters": None, "inputs": [],
             "outputs": [{"artifact": "a_d4"}, {"model": f"{ids['nmr']}_m_001"}]},
        ],
        "undeclared_inputs": ["HDX-NMR spectra: location not stated in the cited sources"],
        "models": [{
            "id": f"{ids['nmr']}_m_001", "revision_number": 1, "title": "Per-residue ΔG, HDX-NMR analysis",
            "model_type": "HDX ΔG set", "purpose": "Model Building", "model_source": "ext", "authors": ["Ferrari et al."],
            "run": "r_nmr",
            "source": {"artifact": "a_d4", "selector": {"fields": ["free_energy_nc_corrected", "obs_rates", "intrinsic_rates", "too_slow_array"],
                                                        "rows": [str(c["source_row"]) for c in nmr_conds]}},
            "residue_frame": {"entry": ids["structure"], "model": f"{ids['structure']}_m_001",
                              "mapping": "construct residue i mapped to the reference sequence by exact substring match"},
            "residue_data": residue_data,
            "metrics": [],
        }],
        "external_refs": {"zenodo": ZENODO_DOI, "doi": DOI},
        "view": view_id, "linked_entries": [x for x in linked if x["entry"] != ids["nmr"]],
        "extensions": [
            "hdx.samples: per-construct, per-measurement labeling conditions, modeled on crystallography.crystals[]; a mean sample lists the rows it averages (verified by recomputation)",
            "model_type 'HDX ΔG set': an L2 interpretation without coordinates",
            "residue_data keys dg, kobs, kint, logpf, too_slow",
            "residue_frame: residue identity taken from the reference structure entry",
            "undeclared_inputs: a source that cannot be registered as an artifact (no URI)",
            "run software_version is unknown",
        ],
        "citation": CITATION,
    }

    structure_entry = {
        "schema_version": VERSION, "id": ids["structure"], "kind": "structure", "state": "active", "revision": revision,
        "title": struct["title"],
        "method": struct["method"],
        "method_source": "mmCIF _exptl.method",
        "polymer_entities": [polymer_entity("pe_1", chain["entity_description"] or "deposited construct", full_seq)],
        "artifacts": [
            {"id": "a_pdb", "name": f"{pdb}.cif", "level": "L2", "type": "model", "format": "mmcif",
             "uri": lock_uri(pdb_key), "size_bytes": LOCK[pdb_key]["bytes"], "sha256": LOCK[pdb_key]["sha256"],
             "license": "CC0-1.0", "stored": True},
        ],
        "runs": [],
        "models": [{
            "id": f"{ids['structure']}_m_001", "revision_number": 1, "title": f"Deposited model (PDB {pdb})",
            "model_type": "Deposited", "purpose": "Reference", "model_source": "pdb", "authors": [],
            "primary_artifact": "a_pdb", "ensemble_members": struct["n_models"],
            "atom_count": struct["atom_count"], "modeled_residues": struct["modeled_residues"], "unique_protein_chains": 1,
            "metrics": [],
        }],
        "external_refs": {"pdb": pdb},
        "view": view_id, "linked_entries": [x for x in linked if x["entry"] != ids["structure"]],
        "extensions": ["atom_count and modeled_residues are counted on the first of the ensemble's conformers"],
        "citation": CITATION,
    }

    csv_rows = [{"sample": r["sample"], "label_seq_id": r["label_seq_id"], "auth_seq_id": r["auth_seq_id"],
                 "label_comp_id": r["label_comp_id"], "dG_kcal_mol": r["dg"], "kobs_per_s": r["kobs"],
                 "kint_per_s": r["kint"], "too_slow": r["too_slow"]} for r in residue_data]
    return view, [mhdx_entry, nmr_entry, structure_entry], csv_rows


def nmr_conds_public(conds: list[dict]) -> list[dict]:
    return [{k: v for k, v in c.items() if k not in ("offset", "sequence")} for c in conds]


# --- derivations: where each displayed value comes from -------------------------------

TIERS = ("copied", "computed")


def upstream(view: dict, node_id: str) -> dict:
    """Walk runs backwards from a node to raw data. Returns the run chain (raw first) and
    whether regeneration from raw data is possible ("pipelines"), blocked by an input with
    no known location ("blocked"), or not applicable to a deposited file ("deposited")."""
    by_output = {o: r for r in view["runs"] for o in r["outputs"]}
    nodes = {a["id"]: a for a in view["artifacts"]}
    chain, status, frontier, seen = [], "pipelines", [node_id], set()
    while frontier:
        aid = frontier.pop()
        run = by_output.get(aid)
        if run is None or run["id"] in seen:
            continue
        seen.add(run["id"])
        chain.insert(0, run["id"])
        for i in run["inputs"]:
            if nodes[i]["uri"] is None:
                status = "blocked"
            frontier.append(i)
    if not chain:
        status = "deposited"
    return {"runs": chain, "status": status}


def build_derivations(view: dict, ids: dict, ref_nmr: dict | None, conds: list[dict], pdb: str) -> list[dict]:
    """One record per displayed value or plot: owning entry, inputs (node, fields, rows), the
    upstream run chain, any operation done here, and a command that checks the value."""
    vid = view["id"]
    d3_row = str(view["mhdx"][0]["source_row"])
    rows = {c["id"]: str(c["source_row"]) for c in conds}
    nmr_rows = sorted(rows.values(), key=int)
    measured = [rows[c["id"]] for c in conds if c["replicate"] != "mean"]
    mapping = f"Residue i of each NMR construct is mapped to {pdb} auth_seq_id by exact sequence match."
    d3 = "data/raw/Dataset_3_MeasurablyStable.json"
    d4 = "data/raw/Dataset_4_HDXNMR.json"
    reps = [c for c in (representative(conds, "6xHis"), representative(conds, "No-His")) if c]
    first_measured = next((c["id"] for c in conds if c["replicate"] != "mean"), None)

    def rec(id_, label, tier, entry, inputs, op=None, code=None, check=None, value=None, unit=None):
        assert tier in TIERS
        ups = [upstream(view, i["artifact"]) for i in inputs]
        status = "blocked" if any(u["status"] == "blocked" for u in ups) else (
            "deposited" if all(u["status"] == "deposited" for u in ups) else "pipelines")
        chain = []
        for u in ups:
            chain += [r for r in u["runs"] if r not in chain]
        return {"id": id_, "label": label, "tier": tier, "entry": entry, "value": value, "unit": unit, "inputs": inputs,
                "runs": chain, "raw": status, "operation": op, "code": code, "check": check}

    out = []
    for m in view["metrics"]:
        if not m["computed_here"]:
            out.append(rec(f"metric:{m['key']}", m["key"], "copied", ids["mhdx"],
                           [{"artifact": "m_mhdx", "fields": [m["source_field"]], "rows": [d3_row]}],
                           check=f"jq '.{m['source_field']}[\"{d3_row}\"]' {d3}", value=m["value"], unit=m["unit"]))
        else:
            op = ("RMSD over the k highest sorted ΔG of each set; k = smaller site count; sites matched by rank."
                  if m["key"] == "landscape_rmsd_top_k" else "Highest mHDX-MS ΔG minus highest HDX-NMR ΔG.")
            out.append(rec(f"metric:{m['key']}", m["key"], "computed", None,
                           [{"artifact": "m_mhdx", "fields": ["free_energy"], "rows": [d3_row]},
                            {"artifact": "m_nmr", "fields": ["free_energy_nc_corrected"], "rows": [rows[m["nmr_condition"]]]}],
                           op=op + f" HDX-NMR condition: {m['nmr_condition']}.", code="pipeline/build_entries.py (build_protein, L3 metrics)",
                           check=f"jq '.metrics[] | select(.key==\"{m['key']}\")' web/public/views/{vid}.json",
                           value=m["value"], unit=m["unit"]))
    out += [
        rec("plot:landscape", "Sorted ΔG: mHDX-MS and HDX-NMR", "copied", None,
            [{"artifact": "m_mhdx", "fields": ["free_energy"], "rows": [d3_row]},
             {"artifact": "m_nmr", "fields": ["free_energy_nc_corrected"], "rows": nmr_rows}],
            op="Values sorted in descending order for display.", check=f"jq '.free_energy[\"{d3_row}\"]' {d3}"),
        rec("plot:isotope", "Isotope distributions over time", "copied", ids["mhdx"],
            [{"artifact": "a_d3", "fields": ["exp_distribution", "true_time", "pH_index"], "rows": [d3_row]},
             {"artifact": "m_mhdx", "fields": ["pred_distribution"], "rows": [d3_row]}],
            op="Each distribution scaled to its maximum for display.", check=f"jq '.exp_distribution[\"{d3_row}\"][1]' {d3}"),
        rec("plot:uptake", "Deuterium uptake, intact protein", "computed", ids["mhdx"],
            [{"artifact": "a_d3", "fields": ["exp_distribution", "true_time", "pH_index"], "rows": [d3_row]},
             {"artifact": "m_mhdx", "fields": ["pred_distribution"], "rows": [d3_row]}],
            op="Centroid = Σ i·p(i) / Σ p(i) over mass-shift bins i; no back-exchange correction. One series per pH label.",
            code="pipeline/build_entries.py (centroid)", check=f"jq '.mhdx[0].exp_centroid' web/public/views/{vid}.json"),
        rec("plot:chiclet", "ΔG per residue by HDX-NMR condition", "copied", ids["nmr"],
            [{"artifact": "m_nmr", "fields": ["free_energy_nc_corrected"], "rows": nmr_rows}],
            op=mapping, check=f"jq '.free_energy_nc_corrected[\"{nmr_rows[0]}\"]' {d4}"),
        rec("color:dg", "Structure colored by ΔG (HDX-NMR)", "copied", ids["nmr"],
            [{"artifact": "m_nmr", "fields": ["free_energy_nc_corrected"], "rows": nmr_rows}],
            op=mapping, check=f"jq '.free_energy_nc_corrected[\"{nmr_rows[0]}\"]' {d4}"),
        rec("color:logpf", "Structure colored by log₁₀ protection factor", "computed", ids["nmr"],
            [{"artifact": "a_d4", "fields": ["intrinsic_rates", "obs_rates"], "rows": measured}],
            op="log₁₀(k_int / k_obs) per residue. " + mapping, code="pipeline/build_entries.py (nmr_conditions, logpf tracks)",
            check=f"jq '.tracks[\"logpf:{first_measured}\"].values' web/public/views/{vid}.json"),
        rec("color:deut", "Structure colored by predicted deuteration at t", "computed", ids["nmr"],
            [{"artifact": "a_d4", "fields": ["obs_rates"], "rows": measured}],
            op="D = 1 − exp(−k_obs · t) per residue; single-exponential exchange, no back-exchange. " + mapping,
            code="web/src/hdx/model.ts (deuterationTrack)"),
        rec("structure:coords", f"Structure coordinates ({pdb})", "copied", ids["structure"],
            [{"artifact": "a_pdb", "fields": ["whole file"], "rows": []}],
            check=f"shasum -a 256 web/public/structures/{pdb}.cif"),
    ]
    if len(reps) == 2:
        out += [
            rec("plot:butterfly", f"ΔG per residue: {reps[0]['label']} and {reps[1]['label']}", "copied", ids["nmr"],
                [{"artifact": "m_nmr", "fields": ["free_energy_nc_corrected"], "rows": [rows[reps[0]["id"]], rows[reps[1]["id"]]]}],
                op=mapping, check=f"jq '.free_energy_nc_corrected[\"{rows[reps[1]['id']]}\"]' {d4}"),
            rec("plot:woods", "ΔΔG per residue, 6xHis minus No-His", "computed", ids["nmr"],
                [{"artifact": "m_nmr", "fields": ["free_energy_nc_corrected"], "rows": nmr_rows}],
                op="ΔΔG = ΔG(6xHis representative) − ΔG(No-His representative); whisker = largest range (max − min) across the measurements of a construct with two or more. Measurements can differ in labeling conditions. " + mapping,
                code="web/src/hdx/plots.tsx (TagEffectPlot)"),
        ]
    return out


# --- entry list ------------------------------------------------------------------------


def list_row(entry: dict, view: dict) -> dict:
    """What the front page shows for one HDX entry."""
    model = entry["models"][0]
    metric = {m["key"]: m["value"] for m in model["metrics"]}
    samples = entry["hdx"]["samples"]
    structure = next(x for x in view["members"] if x["kind"] == "structure")
    return {
        "id": entry["id"],
        "name": view["name"],
        "method": entry["method"],
        "samples": len(samples),
        "constructs": sorted({pe["construct"] for pe in entry["polymer_entities"]}),
        "dg_max": metric.get("dg_max"),
        "pdb": view["external_refs"]["pdb"],
        "structure_entry": structure["id"],
        "raw": f"PRIDE {PRIDE}" if entry["method"] == "mHDX-MS" else None,
    }


def main() -> None:
    d3 = read_dataset3()
    d4 = read_dataset4()
    pride = read_pride_files()
    for sub in ("entries", "views", "structures", "schema"):
        (OUT / sub).mkdir(parents=True, exist_ok=True)
    for old in list((OUT / "entries").glob("*")):
        old.unlink()  # entry ids changed with the split; drop stale records
    listed = []
    for name, pdb in PAGES.items():
        rows = [(rid, r) for rid, r in d3.items() if r["name"] == name]
        view, entries, csv_rows = build_protein(name, pdb, rows, d4, pride)
        jsonschema.validate(view, SCHEMA_VIEW)
        (OUT / "views" / f"{view['id']}.json").write_text(json.dumps(view, separators=(",", ":")))
        for e in entries:
            jsonschema.validate(e, SCHEMA_ENTRY)
            (OUT / "entries" / f"{e['id']}.json").write_text(json.dumps(e, separators=(",", ":")))
            if e["kind"] == "hdx":
                listed.append(list_row(e, view))
        nmr_id = entries[1]["id"]
        with (OUT / "entries" / f"{nmr_id}.residues.csv").open("w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(csv_rows[0]))
            w.writeheader()
            w.writerows(csv_rows)
        shutil.copyfile(RAW / f"{pdb}.cif", OUT / "structures" / f"{pdb}.cif")
        raw_n = sum(1 for a in entries[0]["artifacts"] if a["level"] == "L0")
        print(f"{view['id']:10s} {name:16s} entries={[e['id'] for e in entries]} nmr_samples={len(entries[1]['hdx']['samples'])} raw_files={raw_n}")
    shutil.copyfile(ROOT / "sources.lock.json", OUT / "sources.lock.json")
    for f in ("hdx_entry.v0.1.json", "hdx_view.v0.1.json"):
        shutil.copyfile(ROOT / "schema" / f, OUT / "schema" / f)
    (OUT / "index.json").write_text(json.dumps({"schema_version": VERSION, "entries": listed}, indent=2) + "\n")
    print(f"index: {len(listed)} HDX entries")


if __name__ == "__main__":
    main()
