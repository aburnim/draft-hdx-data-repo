"""Build entry records and the entry list from the pinned sources.

Reads data/raw/ (see fetch.py) and writes, under web/public/:
  index.json                     one row per entry (the front page list)
  entries/<id>.json              full entry records (the proteins listed in PAGES)
  entries/<id>.residues.csv      per-residue HDX-NMR values of that entry
  structures/<pdb>.cif           coordinates the entry pages load

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
SCHEMA = json.loads((ROOT / "schema" / "hdx_entry.v0.json").read_text())
LOCK = {f["id"]: f for f in json.loads((ROOT / "sources.lock.json").read_text())["files"]}
REPOS = json.loads((ROOT / "sources.lock.json").read_text())["repos"]

# Proteins that get a full entry page, with the PDB structure their NMR construct matches.
# Only pairings checked by hand belong here: 8SKE's sequence is identical to the 6xHis
# construct in Dataset_4 rows 4/6/37.
PAGES = {"EEHEE_rd4_0642": "8SKE"}

DOI = "10.1038/s41586-026-10465-z"
PRIDE = "PXD061702"
ZENODO_DOI = "10.5281/zenodo.14983481"

# Dataset_3 columns an entry uses.
D3_COLS = {
    "name", "library", "pH", "sequence", "PF", "RT", "group",
    "dg_max", "dg_mean", "dg_median", "n_exch_res",
    "normalized_cooperativity_model_global", "rate_fitting_rmse_total",
    "max_idotp", "backexchange_final_tp",
    "true_time", "exp_distribution", "pred_distribution", "backexchange",
    "free_energy", "rates_mean", "rates_ci_5", "rates_ci_95",
    "cooperativity_model_global", "rate_fitting_rmse_max", "n_protected_res",
    "n_measurable_obs_rates", "free_energy_integrated_per_res", "file_path",
}


def opaque_id(name: str) -> str:
    """hdx_ + 8 base-36 characters. Opaque to readers, but derived from the protein name
    so a rebuild gives every entry the same id."""
    n = int(hashlib.sha256(name.encode()).hexdigest(), 16)
    chars = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    for _ in range(8):
        n, r = divmod(n, 36)
        out += chars[r]
    return f"hdx_{out}"


def origin_of(name: str) -> tuple[str, str | None]:
    """(origin, accession). Designs carry a round tag (_rd4_); PDB-derived domains are
    named PDB<id>; natural domains are <UniProt>.<version>_<start>-<end>. The accession is
    a UniProt id for natural domains and a PDB id for PDB-derived ones."""
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


def read_structure(pdb: str) -> dict:
    block = gemmi.cif.read(str(RAW / f"{pdb}.cif")).sole_block()
    scheme = block.find("_pdbx_poly_seq_scheme.", ["seq_id", "mon_id", "pdb_seq_num", "pdb_strand_id"])
    chain_id = scheme[0][3]
    positions = [
        {"pos": int(r[0]), "compId": r[1], "letter": gemmi.find_tabulated_residue(r[1]).one_letter_code.upper(), "seq": int(r[2])}
        for r in scheme
        if r[3] == chain_id
    ]
    secondary = [
        {"start": int(r[0]), "end": int(r[1]), "kind": "helix"}
        for r in block.find("_struct_conf.", ["beg_auth_seq_id", "end_auth_seq_id"])
    ] + [
        {"start": int(r[0]), "end": int(r[1]), "kind": "strand"}
        for r in block.find("_struct_sheet_range.", ["beg_auth_seq_id", "end_auth_seq_id"])
    ]
    # auth numbering equals position numbering for 8SKE; map anyway so other entries work
    pos_of = {p["seq"]: p["pos"] for p in positions}
    for s in secondary:
        s["start"], s["end"] = pos_of[s["start"]], pos_of[s["end"]]
    secondary.sort(key=lambda s: s["start"])
    return {
        "chain": {
            "id": chain_id,
            "entity_description": gemmi.cif.as_string(block.find_value("_entity.pdbx_description") or "") or None,
            "positions": positions,
            "secondary": secondary,
        },
        "title": gemmi.cif.as_string(block.find_value("_struct.title")),
        "n_models": len(gemmi.read_structure(str(RAW / f"{pdb}.cif"))),
        "sequence": "".join(p["letter"] for p in positions),
    }


# --- entry -----------------------------------------------------------------------------


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


def build_entry(name: str, pdb: str, d3_rows: list[dict], d4_rows: list[dict]) -> tuple[dict, list[dict]]:
    struct = read_structure(pdb)
    chain = struct["chain"]
    full_seq = struct["sequence"]
    seq_of_pos = {p["pos"]: p["seq"] for p in chain["positions"]}
    origin, accession = origin_of(name)
    uniprot = accession if origin == "natural domain" else None

    # HDX-NMR: one condition per Dataset_4 row. Rows that only repeat another row's
    # values (the per-construct aggregate of a single replicate) are dropped.
    nmr = sorted((r for r in d4_rows if r["name"] == name), key=lambda r: r["row"])
    seen: dict[tuple, int] = {}
    conditions, tracks, residue_rows = [], {}, []
    by_construct: dict[str, list[dict]] = {}
    for r in nmr:
        sig = (r["construct"], tuple(rounded(r["free_energy_nc_corrected"], 6)))
        if sig in seen:
            continue
        seen[sig] = r["row"]
        by_construct.setdefault(r["construct"], []).append(r)

    for construct, rs in by_construct.items():
        measured = [r for r in rs if r["obs_rates"] is not None]
        for k, r in enumerate(rs):
            is_mean = r["obs_rates"] is None
            offset = full_seq.find(r["seq"])
            if offset < 0:
                raise ValueError(f"{name} {construct} sequence not found in {pdb}")
            keys = [{"chain": chain["id"], "seq": seq_of_pos[offset + i + 1], "ins": ""} for i in range(len(r["seq"]))]
            cid = f"nmr_{construct.lower().replace('-', '')}_{'mean' if is_mean else f'r{k + 1}'}"
            label = f"{construct}, {'mean of replicates' if is_mean else f'replicate {k + 1}'}"
            if is_mean and len(measured) < 2:
                continue
            conditions.append({
                "id": cid, "label": label, "method": "HDX-NMR", "construct": construct,
                "replicate": "mean" if is_mean else k + 1,
                "pH": num(r["pH"]) if not is_mean else num(measured[0]["pH"]),
                "temp_K": num(r["temp"]) if not is_mean else num(measured[0]["temp"]),
                "buffer": (r["buffer"] or measured[0]["buffer"] or "").upper() or None,
                "source_row": r["row"],
            })
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
                    residue_rows.append({
                        "condition": cid, "chain": key["chain"], "auth_seq_id": key["seq"],
                        "residue": r["seq"][i], "dG_kcal_mol": num(r["free_energy_nc_corrected"][i]),
                        "kobs_per_s": kobs[i], "kint_per_s": kint[i],
                        "too_slow": bool(r["too_slow_array"][i]) if r["too_slow_array"] else None,
                    })

    # mHDX-MS: Dataset_3 rows for this protein (one per library / retention-time group)
    measurements = []
    for rid, r in sorted(d3_rows, key=lambda x: int(x[0])):
        offset = full_seq.find(r["sequence"])
        times = rounded(r["true_time"], 3)
        exp = [rounded(d, 5) for d in r["exp_distribution"]]
        pred = [rounded(d, 5) for d in r["pred_distribution"]]
        measurements.append({
            "id": f"mhdx_{rid}",
            "source_row": int(rid),
            "library": r["library"],
            "pH_label": r["pH"],
            "retention_time_min": num(r["RT"]),
            "sequence": r["sequence"],
            "first_auth_seq": seq_of_pos.get(offset + 1) if offset >= 0 else None,
            "timepoints_s": times,
            "exp_distribution": exp,
            "pred_distribution": pred,
            "exp_centroid": [None if c is None else round(c, 3) for c in map(centroid, r["exp_distribution"])],
            "pred_centroid": [None if c is None else round(c, 3) for c in map(centroid, r["pred_distribution"])],
            "backexchange": rounded(r["backexchange"], 4),
            "dg_sorted": rounded(r["free_energy"], 4),
            "ln_k_sorted": rounded(r["rates_mean"], 4),
            "ln_k_ci5": rounded(r["rates_ci_5"], 4),
            "ln_k_ci95": rounded(r["rates_ci_95"], 4),
            "group": r["group"],
        })
        conditions.append({
            "id": f"mhdx_{rid}", "label": f"mHDX-MS, {r['library']}, {r['pH']}", "method": "mHDX-MS",
            "construct": "HM + design (cleaved)" if offset >= 0 else None, "replicate": None,
            "pH": r["pH"], "temp_K": None, "buffer": None, "source_row": int(rid),
        })

    nmr_ids = [c["id"] for c in conditions if c["method"] == "HDX-NMR"]
    mhdx_ids = [m["id"] for m in measurements]
    lock_uri = lambda k: LOCK[k]["url"].replace("?download=1", "")  # noqa: E731
    d3_uri, d3_sha = lock_uri("zenodo_dataset3"), LOCK["zenodo_dataset3"]["sha256"]
    artifacts = [
        {"id": "a_raw", "level": "L0", "title": "Raw Waters .raw files (mHDX-MS, SYNAPT G2-Si)", "format": "Waters RAW",
         "uri": f"https://www.ebi.ac.uk/pride/archive/projects/{PRIDE}", "sha256": None, "license": "CC0-1.0", "held": False},
        {"id": "a_nmr_raw", "level": "L0", "title": "HDX-NMR spectra (location not stated in the sources)", "format": "NMR spectra",
         "uri": None, "sha256": None, "license": "unknown", "held": False},
        # Dataset_3 is one file holding two levels; each artifact names the fields it covers.
        {"id": "a_d3_iso", "level": "L1", "title": "Isotope distributions per timepoint (Zenodo Dataset_3)", "format": "JSON",
         "uri": d3_uri, "sha256": d3_sha, "license": "CC-BY-4.0", "held": False,
         "fields": ["true_time", "exp_distribution", "backexchange"]},
        {"id": "a_d3_fit", "level": "L2", "title": "Fitted exchange rates and ΔG (Zenodo Dataset_3)", "format": "JSON",
         "uri": d3_uri, "sha256": d3_sha, "license": "CC-BY-4.0", "held": False,
         "fields": ["rates_mean", "rates_ci_5", "rates_ci_95", "free_energy", "pred_distribution", "dg_*", "cooperativity_*"]},
        {"id": "a_d4", "level": "L2", "title": "HDX-NMR per-residue rates and ΔG (Zenodo Dataset_4)", "format": "JSON",
         "uri": lock_uri("zenodo_dataset4"), "sha256": LOCK["zenodo_dataset4"]["sha256"], "license": "CC-BY-4.0", "held": False},
        {"id": "a_pdb", "level": "L2", "title": f"PDB {pdb}: NMR structure, {struct['n_models']} models", "format": "mmCIF",
         "uri": lock_uri(f"pdb_{pdb.lower()}"), "sha256": LOCK[f"pdb_{pdb.lower()}"]["sha256"], "license": "CC0-1.0", "held": True},
        {"id": "a_entry", "level": "L3", "title": "This entry record, with agreement metrics computed here", "format": "JSON",
         "uri": f"entries/{opaque_id(name)}.json", "sha256": None, "license": "CC-BY-4.0", "held": True},
    ]
    commit = {r["repo"].rsplit("/", 1)[1]: r["commit"] for r in REPOS}
    runs = [
        {"id": "r_mhdx", "software": "mhdx_pipeline", "version": commit.get("mhdx_pipeline"),
         "description": "Isotope-cluster extraction from LC-IMS-MS runs, one distribution per timepoint",
         "inputs": ["a_raw"], "outputs": ["a_d3_iso"], "parsed_from": "paper and repository README"},
        {"id": "r_rates", "software": "hdxrate_pipeline", "version": commit.get("hdxrate_pipeline"),
         "description": "Bayesian fit of sorted exchange rates to the isotope distributions; ΔG from rate / intrinsic rate",
         "inputs": ["a_d3_iso"], "outputs": ["a_d3_fit"], "parsed_from": "Dataset_3 field names and repository README"},
        {"id": "r_nmr", "software": "HDX-NMR analysis (Ferrari et al. 2026)", "version": None,
         "description": "Per-amide exchange rates from NMR peak decay, converted to ΔG",
         "inputs": ["a_nmr_raw"], "outputs": ["a_d4"], "parsed_from": "paper"},
        {"id": "r_build", "software": "hdx-data-repo pipeline/build_entries.py", "version": "0.0.1",
         "description": "Joins the sources by protein name, maps residues to PDB auth numbering, computes L3 agreement",
         "inputs": ["a_d3_fit", "a_d4", "a_pdb"], "outputs": ["a_entry"], "parsed_from": "this repository"},
    ]
    interpretations = [
        {"id": "m_001", "title": "Energy landscape from mHDX-MS", "method": "mHDX-MS + hdxrate_pipeline",
         "resolution": "whole protein (unassigned)", "artifact": "a_d3_fit", "run": "r_rates", "conditions": mhdx_ids},
        {"id": "m_002", "title": "Energy landscape from HDX-NMR", "method": "HDX-NMR",
         "resolution": "residue", "artifact": "a_d4", "run": "r_nmr", "conditions": nmr_ids},
        {"id": "m_003", "title": f"Deposited NMR ensemble ({pdb})", "method": "Solution NMR",
         "resolution": "atomic model", "artifact": "a_pdb", "run": None, "conditions": []},
    ]

    metrics = []
    if measurements:
        r = d3_rows[0][1]
        for key, field, unit in [
            ("dg_max", "dg_max", "kcal/mol"), ("dg_median", "dg_median", "kcal/mol"),
            ("cooperativity", "cooperativity_model_global", None),
            ("cooperativity_normalized", "normalized_cooperativity_model_global", None),
            ("fit_rmse", "rate_fitting_rmse_total", None), ("fit_rmse_max", "rate_fitting_rmse_max", None),
            ("idotp_max", "max_idotp", None), ("backexchange_final", "backexchange_final_tp", None),
            ("n_exchangeable", "n_exch_res", None), ("n_protected", "n_protected_res", None),
        ]:
            if num(r.get(field)) is not None:
                metrics.append({"key": key, "value": round(num(r[field]), 4), "unit": unit, "level": "L2",
                                "interpretation": "m_001", "source_field": field, "computed_here": False})
    # L3: do the two landscapes agree? Compare the k most stable sites of each, where k is
    # the smaller count. A sketch, not a published metric: the constructs differ by the tag.
    mean_nmr = next((t for k, t in tracks.items() if k.startswith("dg:") and "nohis" in k), None) or \
        next((t for k, t in tracks.items() if k.startswith("dg:")), None)
    if measurements and mean_nmr:
        a = sorted((v for v in measurements[0]["dg_sorted"] if v is not None), reverse=True)
        b = sorted((v for v in mean_nmr["values"] if v is not None), reverse=True)
        k = min(len(a), len(b))
        rmsd = math.sqrt(sum((x - y) ** 2 for x, y in zip(a[:k], b[:k])) / k)
        metrics.append({"key": "landscape_rmsd_top_k", "value": round(rmsd, 4), "unit": "kcal/mol", "level": "L3",
                        "interpretation": "m_001 vs m_002", "source_field": f"top {k} sorted ΔG", "computed_here": True})
        metrics.append({"key": "dg_max_difference", "value": round(a[0] - b[0], 4), "unit": "kcal/mol", "level": "L3",
                        "interpretation": "m_001 vs m_002", "source_field": "max sorted ΔG", "computed_here": True})

    entry = {
        "schema_version": "0.0.1",
        "id": opaque_id(name),
        "name": name,
        "title": struct["title"],
        "protein": {"name": name, "origin": origin, "topology": d3_rows[0][1].get("PF") if d3_rows else None, "uniprot": uniprot},
        "chain": chain,
        "conditions": conditions,
        "external_refs": {"pdb": pdb, "pride": PRIDE, "zenodo": ZENODO_DOI, "doi": DOI, "github": [r["repo"] for r in REPOS]},
        "artifacts": artifacts,
        "runs": runs,
        "interpretations": interpretations,
        "tracks": tracks,
        "mhdx": measurements,
        "metrics": metrics,
        "license": "CC-BY-4.0 (derived from Zenodo 14983481); structure CC0-1.0",
        "citation": "Ferrari et al., Large-scale discovery, analysis, and design of protein energy landscapes. Nature (2026).",
    }
    return entry, residue_rows


# --- entry list ------------------------------------------------------------------------


def list_row(entry: dict) -> dict:
    """What the front page shows for one entry."""
    metric = {m["key"]: m["value"] for m in entry["metrics"]}
    return {
        "id": entry["id"],
        "name": entry["name"],
        "title": entry["title"],
        "origin": entry["protein"]["origin"],
        "topology": entry["protein"]["topology"],
        "length": len(entry["chain"]["positions"]),
        "methods": sorted({c["method"] for c in entry["conditions"]}, reverse=True),
        "n_conditions": len(entry["conditions"]),
        "pdb": entry["external_refs"]["pdb"],
        "pride": entry["external_refs"]["pride"],
        "dg_max": metric.get("dg_max"),
    }


def main() -> None:
    d3 = read_dataset3()
    d4 = read_dataset4()
    listed = []
    (OUT / "entries").mkdir(parents=True, exist_ok=True)
    (OUT / "structures").mkdir(parents=True, exist_ok=True)

    for name, pdb in PAGES.items():
        rows = [(rid, r) for rid, r in d3.items() if r["name"] == name]
        entry, residues = build_entry(name, pdb, rows, d4)
        jsonschema.validate(entry, SCHEMA)
        (OUT / "entries" / f"{entry['id']}.json").write_text(json.dumps(entry, separators=(",", ":")))
        with (OUT / "entries" / f"{entry['id']}.residues.csv").open("w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(residues[0]))
            w.writeheader()
            w.writerows(residues)
        shutil.copyfile(RAW / f"{pdb}.cif", OUT / "structures" / f"{pdb}.cif")
        listed.append(list_row(entry))
        print(f"{entry['id']}  {name}  conditions={len(entry['conditions'])} tracks={len(entry['tracks'])} mhdx={len(entry['mhdx'])}")
    shutil.copyfile(ROOT / "sources.lock.json", OUT / "sources.lock.json")
    (OUT / "schema").mkdir(exist_ok=True)
    shutil.copyfile(ROOT / "schema" / "hdx_entry.v0.json", OUT / "schema" / "hdx_entry.v0.json")

    (OUT / "index.json").write_text(json.dumps({"schema_version": "0.0.1", "entries": listed}, indent=2) + "\n")
    print(f"index: {len(listed)} entries")


if __name__ == "__main__":
    main()
