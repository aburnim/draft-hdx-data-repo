"""Intact-protein mHDX-MS: natural domains from Ferrari et al. 2026 (Nature; Zenodo Dataset_3,
PRIDE PXD061702).

Builds one entry and one view per domain listed in DOMAINS. Each domain is identified by the
UniProt accession in its Dataset_3 name (`<accession>.<sequence version>_<start>-<end>`); the
build checks that the measured sequence aligns to UniProt residues start..end. Intact-protein
data give sorted site ΔG without residue assignment, so the views carry no structure.
Called from build_entries.main(); code reused from build_entries.py at commit 0612dc7.
"""

from __future__ import annotations

import json
import re

import gemmi
import ijson
from ijson.common import ObjectBuilder

import build_entries as be

# Pilot: the natural domains whose UniProt entries are reviewed (Swiss-Prot).
DOMAINS = ["Q46798.2_42-84", "Q9V853.3_169-198", "Q8CFI0.2_528-557", "Q9DBH0.1_446-475"]
NAME = re.compile(r"^([A-Z0-9]{6,10})\.(\d+)_(\d+)-(\d+)$")

# Dataset_3 library names that differ from the PRIDE file names. Inferred, not documented.
PRIDE_LIBRARY_ALIAS = {"mutants04": "mut04"}

DOI = "10.1038/s41586-026-10465-z"
PRIDE = "PXD061702"
ZENODO_DOI = "10.5281/zenodo.14983481"
CITATION = "Ferrari et al., Large-scale discovery, analysis, and design of protein energy landscapes. Nature (2026)."
D3 = "data/raw/Dataset_3_MeasurablyStable.json"

D3_COLS = {
    "name", "library", "pH", "pH_index", "merge_exp", "sequence", "PF", "RT", "group",
    "dg_max", "dg_mean", "dg_median", "n_exch_res",
    "normalized_cooperativity_model_global", "rate_fitting_rmse_total",
    "max_idotp", "backexchange_final_tp",
    "true_time", "exp_distribution", "pred_distribution", "backexchange",
    "free_energy", "rates_mean", "rates_ci_5", "rates_ci_95",
    "cooperativity_model_global", "rate_fitting_rmse_max", "n_protected_res",
}

MHDX_METRICS = [
    ("dg_max", "dg_max", "kcal/mol"), ("dg_median", "dg_median", "kcal/mol"),
    ("cooperativity", "cooperativity_model_global", None),
    ("cooperativity_normalized", "normalized_cooperativity_model_global", None),
    ("fit_rmse", "rate_fitting_rmse_total", None), ("fit_rmse_max", "rate_fitting_rmse_max", None),
    ("idotp_max", "max_idotp", None), ("backexchange_final", "backexchange_final_tp", None),
    ("n_exchangeable", "n_exch_res", None), ("n_protected", "n_protected_res", None),
]


# --- sources --------------------------------------------------------------------------------


def read_dataset3(names: set[str]) -> dict[str, dict]:
    """Stream the 286 MB column-oriented JSON once, keeping only the rows of `names`.
    Returns {row_id: {col: value}}."""
    rows: dict[str, dict] = {}
    keep_rows: set[str] = set()
    col = row = None
    builder: ObjectBuilder | None = None

    def finish():
        nonlocal builder
        if builder is not None:
            rows.setdefault(row, {})[col] = builder.value
        builder = None

    with (be.RAW / "Dataset_3_MeasurablyStable.json").open("rb") as f:
        for prefix, event, value in ijson.parse(f, use_float=True):
            if prefix == "" and event == "map_key":
                col = value
                continue
            if prefix == col and event in ("map_key", "end_map"):
                finish()
                if event == "map_key":
                    row = value
                    keep = col == "name" or (col in D3_COLS and row in keep_rows)
                    builder = ObjectBuilder() if keep else None
                elif col == "name":
                    # name is the first column; from here on we know which rows to keep
                    keep_rows = {r for r, v in rows.items() if v.get("name") in names}
                continue
            if builder is not None:
                builder.event(event, value)
    return {r: v for r, v in rows.items() if r in keep_rows}


def read_pride_files() -> list[dict]:
    """PRIDE file records with name, size and FTP location."""
    out = []
    for f in json.loads((be.RAW / "PXD061702_files.json").read_text()):
        ftp = next((loc["value"] for loc in f["publicFileLocations"] if loc["name"] == "FTP Protocol"), None)
        m = re.match(r"^\d+_([^_]+)_(pH\d)_(\d+)s_(\d+)\.mzML\.gz$", f["fileName"])
        out.append({"name": f["fileName"], "size_bytes": int(f["fileSizeBytes"]), "uri": ftp,
                    "library": m.group(1) if m else None, "pH": m.group(2) if m else None,
                    "time_s": int(m.group(3)) if m else None, "replicate": int(m.group(4)) if m else None})
    return out


# --- one measurement ------------------------------------------------------------------------


def centroid(dist: list) -> float | None:
    w = [be.num(x) or 0.0 for x in dist]
    s = sum(w)
    return sum(i * x for i, x in enumerate(w)) / s if s > 0 else None


def mhdx_measurement(rid: str, r: dict) -> dict:
    phs = sorted(set(r.get("pH_index") or [])) or ([r["pH"]] if r["pH"] else [])
    return {
        "id": f"mhdx_{rid}",
        "source_row": int(rid),
        "library": r["library"],
        "pH_label": r["pH"] or "+".join(phs) + " (merged)",
        "pH_labels": phs,
        "merged": bool(r.get("merge_exp")),
        "retention_time_min": be.num(r["RT"]),
        "sequence": r["sequence"],
        "timepoints_s": be.rounded(r["true_time"], 3),
        "pH_index": r.get("pH_index") or [r["pH"]] * len(r["true_time"]),
        "exp_distribution": [be.rounded(d, 5) for d in r["exp_distribution"]],
        "pred_distribution": [be.rounded(d, 5) for d in r["pred_distribution"]],
        "exp_centroid": [None if c is None else round(c, 3) for c in map(centroid, r["exp_distribution"])],
        "pred_centroid": [None if c is None else round(c, 3) for c in map(centroid, r["pred_distribution"])],
        "backexchange": be.rounded(r["backexchange"], 4),
        "dg_sorted": be.rounded(r["free_energy"], 4),
        "ln_k_sorted": be.rounded(r["rates_mean"], 4),
        "ln_k_ci5": be.rounded(r["rates_ci_5"], 4),
        "ln_k_ci95": be.rounded(r["rates_ci_95"], 4),
        "group": r["group"],
    }


def construct_chain(seq: str) -> dict:
    """The measured sequence as the view's chain, numbered by construct position (the
    residues outside the UniProt range have no UniProt number)."""
    return {"id": "A", "entity_description": None, "secondary": [],
            "positions": [{"pos": i, "compId": gemmi.expand_one_letter(c, gemmi.ResidueKind.AA), "letter": c, "seq": i}
                          for i, c in enumerate(seq, start=1)]}


# --- one domain: entry and view --------------------------------------------------------------


def build_domain(name: str, rid: str, r: dict, pride: list[dict], revision: dict) -> tuple[dict, dict, dict]:
    acc, version, start, end = NAME.match(name).groups()
    m = mhdx_measurement(rid, r)
    protein, mapping = be.uniprot_record(acc, m["sequence"])
    # the name states the UniProt range; the measured sequence must align to exactly that range
    if (mapping["unp_begin"], mapping["unp_end"]) != (int(start), int(end)) or mapping["mismatches"]:
        raise SystemExit(f"{name}: sequence aligns to UniProt {mapping['unp_begin']}-{mapping['unp_end']} "
                         f"with mismatches {mapping['mismatches']}, expected {start}-{end}")
    extra = len(m["sequence"]) - (mapping["construct_end"] - mapping["construct_begin"] + 1)
    entry_id = be.opaque_id(f"{name}|mHDX-MS")
    view_id = be.opaque_id(name, prefix="view")
    row = str(m["source_row"])

    # raw files of this measurement: same library and pH as the Dataset_3 row
    lib = PRIDE_LIBRARY_ALIAS.get(m["library"], m["library"])
    raw_files = sorted((f for f in pride if f["library"] == lib and f["pH"] in m["pH_labels"]),
                       key=lambda f: (f["pH"], f["time_s"], f["replicate"]))
    d3_uri, d3_sha = be.lock_uri("zenodo_dataset3"), be.LOCK["zenodo_dataset3"]["sha256"]
    alias_note = f"; PRIDE library '{lib}' assumed to be Dataset_3 '{m['library']}'" if lib != m["library"] else ""
    title = f"{protein['name']} {start}-{end} ({r.get('PF') or 'domain'}): mHDX-MS, {m['library']}, {m['pH_label']}"

    nodes = [
        {"id": "a_raw", "kind": "artifact", "entry": entry_id, "short": f"PRIDE {PRIDE}", "level": "L0",
         "title": f"{len(raw_files)} mzML files, {lib} {'+'.join(m['pH_labels'])}, PRIDE {PRIDE}; each file holds the whole library{alias_note}",
         "format": "mzml.gz", "uri": f"https://www.ebi.ac.uk/pride/archive/projects/{PRIDE}", "sha256": None,
         "license": "CC0-1.0", "held": False},
        {"id": "a_d3", "kind": "artifact", "entry": entry_id, "short": "Dataset_3", "level": "L1",
         "title": "Zenodo Dataset_3: isotope distributions and fit results", "format": "json",
         "uri": d3_uri, "sha256": d3_sha, "license": "CC-BY-4.0", "held": False},
        {"id": "m_mhdx", "kind": "model", "entry": entry_id, "short": "Dataset_3", "level": "L2",
         "title": "Model: sorted site ΔG (hdxrate_pipeline fit), stored in Dataset_3", "format": "json",
         "uri": d3_uri, "sha256": d3_sha, "license": "CC-BY-4.0", "held": False, "stored_in": "a_d3"},
    ]
    runs = [
        {"id": "r_mhdx", "software": "mhdx_pipeline", "version": be.COMMIT.get("mhdx_pipeline"),
         "description": "Extracts one intact-protein isotope distribution per labeling time from the raw data",
         "inputs": ["a_raw"], "outputs": ["a_d3"], "parsed_from": "paper and repository README"},
        {"id": "r_rates", "software": "hdxrate_pipeline", "version": be.COMMIT.get("hdxrate_pipeline"),
         "description": "Fits sorted exchange rates to the isotope distributions; reports ΔG per site (Dataset_3 free_energy)",
         "inputs": ["a_d3"], "outputs": ["m_mhdx"], "parsed_from": "Dataset_3 field names and repository README"},
    ]
    metrics = [
        {"key": key, "value": round(be.num(r[field]), 4), "unit": unit, "level": "L2", "interpretation": "m_mhdx",
         "source_field": field, "computed_here": False, "entry": entry_id}
        for key, field, unit in MHDX_METRICS if be.num(r.get(field)) is not None
    ]
    view = {
        "schema_version": be.VERSION,
        "id": view_id,
        "kind": "intact",
        "name": f"{protein['name']} {start}-{end}",
        "title": title,
        "grouping": "One intact-protein mHDX-MS entry; no reference structure.",
        "members": [{"id": entry_id, "kind": "hdx", "method": "mHDX-MS", "title": title}],
        "protein": {"name": f"{protein['name']} {start}-{end}", "origin": "natural domain", "topology": r.get("PF"), "uniprot": acc},
        "chain": construct_chain(m["sequence"]),
        "conditions": [{"id": m["id"], "label": f"mHDX-MS, {m['library']}, {m['pH_label']}", "method": "mHDX-MS",
                        "construct": "Dataset_3 sequence", "replicate": None, "pH": m["pH_label"], "temp_K": None,
                        "buffer": None, "source_row": m["source_row"]}],
        "external_refs": {"pdb": None, "pride": PRIDE, "zenodo": ZENODO_DOI, "doi": DOI,
                          "github": [x["repo"] for x in be.REPOS if "Rocklin-Lab" in x["repo"]]},
        "artifacts": nodes,
        "runs": runs,
        "mhdx": [m],
        "metrics": metrics,
        "license": "CC-BY-4.0 (derived from Zenodo 14983481)",
        "citation": CITATION,
    }
    view["derivations"] = derivations(view, entry_id, row)

    entry = {
        "schema_version": be.VERSION, "id": entry_id, "kind": "hdx", "state": "active", "revision": revision,
        "title": title,
        "method": "mHDX-MS",
        "polymer_entities": [{
            "id": "pe_1", "description": f"{protein['name']}, residues {start}-{end}",
            "construct": f"UniProt {acc} {start}-{end}" + (f" with {extra} N-terminal residues not in UniProt" if extra else ""),
            "sequence": m["sequence"],
            "source_organisms": [{"scientific_name": protein["organism"], "ncbi_taxonomy_id": protein["taxon_id"]}],
            "mutations": [], "uniprot_mappings": [mapping]}],
        "hdx": {"samples": [{
            "id": m["id"], "polymer_entity": "pe_1", "library": m["library"], "pH_labels": m["pH_labels"],
            "merged_pH_series": m["merged"], "temperature_kelvin": None, "buffer": None,
            "labeling_times_s": m["timepoints_s"], "source": {"artifact": "a_d3", "rows": [row]},
        }]},
        "artifacts": [
            *[{"id": f"a_raw_{i + 1:03d}", "name": f["name"], "level": "L0", "type": "other", "format": "mzml.gz",
               "uri": f["uri"], "size_bytes": f["size_bytes"], "sha256": None, "license": "CC0-1.0", "stored": False}
              for i, f in enumerate(raw_files)],
            {"id": "a_d3", "name": "Dataset_3_MeasurablyStable.json", "level": "L1", "type": "other", "format": "json",
             "uri": d3_uri, "size_bytes": be.LOCK["zenodo_dataset3"]["bytes"], "sha256": d3_sha, "license": "CC-BY-4.0", "stored": False},
        ],
        "runs": [
            {"id": "r_mhdx", "software_name": "mhdx_pipeline", "software_version": be.COMMIT.get("mhdx_pipeline"),
             "command": None, "parameters": None,
             "inputs": [{"artifact": f"a_raw_{i + 1:03d}"} for i in range(len(raw_files))],
             "outputs": [{"artifact": "a_d3", "selector": {"fields": ["exp_distribution", "true_time", "backexchange"], "rows": [row]}}]},
            {"id": "r_rates", "software_name": "hdxrate_pipeline", "software_version": be.COMMIT.get("hdxrate_pipeline"),
             "command": None, "parameters": None,
             "inputs": [{"artifact": "a_d3", "selector": {"fields": ["exp_distribution", "true_time"], "rows": [row]}}],
             "outputs": [{"model": f"{entry_id}_m_001"}]},
        ],
        "models": [{
            "id": f"{entry_id}_m_001", "revision_number": 1, "title": "Sorted site ΔG, hdxrate_pipeline fit",
            "model_type": "HDX ΔG set", "purpose": "Model Building", "model_source": "ext", "authors": ["Ferrari et al."],
            "run": "r_rates",
            "source": {"artifact": "a_d3", "selector": {"fields": ["free_energy", "rates_mean", "rates_ci_5", "rates_ci_95", "pred_distribution"], "rows": [row]}},
            "residue_data": None,
            "site_data": {"resolution": "sites not assigned to residues", "dg_sorted": m["dg_sorted"], "ln_k_sorted": m["ln_k_sorted"],
                          "ln_k_ci5": m["ln_k_ci5"], "ln_k_ci95": m["ln_k_ci95"]},
            "metrics": [{"key": x["key"], "value": x["value"], "unit": x["unit"], "software_name": "hdxrate_pipeline",
                         "software_version": be.COMMIT.get("hdxrate_pipeline"), "source_field": x["source_field"]} for x in metrics],
        }],
        "external_refs": {"pride": PRIDE, "zenodo": ZENODO_DOI, "doi": DOI},
        "view": view_id, "linked_entries": [],
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
    return view, entry, protein


def derivations(view: dict, entry_id: str, row: str) -> list[dict]:
    """One record per displayed value or plot: owning entry, inputs (node, fields, rows), the
    upstream run chain, any operation done here, and a command that checks the value."""

    def rec(id_, label, tier, inputs, op=None, code=None, check=None, value=None, unit=None):
        ups = [be.upstream(view, i["artifact"]) for i in inputs]
        status = "blocked" if any(u["status"] == "blocked" for u in ups) else (
            "deposited" if all(u["status"] == "deposited" for u in ups) else "pipelines")
        chain = []
        for u in ups:
            chain += [x for x in u["runs"] if x not in chain]
        return {"id": id_, "label": label, "tier": tier, "entry": entry_id, "value": value, "unit": unit, "inputs": inputs,
                "runs": chain, "raw": status, "operation": op, "code": code, "check": check}

    out = [rec(f"metric:{m['key']}", m["key"], "copied", [{"artifact": "m_mhdx", "fields": [m["source_field"]], "rows": [row]}],
               check=f"jq '.{m['source_field']}[\"{row}\"]' {D3}", value=m["value"], unit=m["unit"])
           for m in view["metrics"]]
    out += [
        rec("plot:landscape", "Sorted site ΔG (mHDX-MS)", "copied", [{"artifact": "m_mhdx", "fields": ["free_energy"], "rows": [row]}],
            op="Values sorted in descending order for display.", check=f"jq '.free_energy[\"{row}\"]' {D3}"),
        rec("plot:isotope", "Isotope distributions over time", "copied",
            [{"artifact": "a_d3", "fields": ["exp_distribution", "true_time", "pH_index"], "rows": [row]},
             {"artifact": "m_mhdx", "fields": ["pred_distribution"], "rows": [row]}],
            op="Each distribution scaled to its maximum for display.", check=f"jq '.exp_distribution[\"{row}\"][1]' {D3}"),
        rec("plot:uptake", "Deuterium uptake, intact protein", "computed",
            [{"artifact": "a_d3", "fields": ["exp_distribution", "true_time", "pH_index"], "rows": [row]},
             {"artifact": "m_mhdx", "fields": ["pred_distribution"], "rows": [row]}],
            op="Centroid = Σ i·p(i) / Σ p(i) over mass-shift bins i; no back-exchange correction. One series per pH label.",
            code="pipeline/build_intact.py (centroid)", check=f"jq '.mhdx[0].exp_centroid' web/public/views/{view['id']}.json"),
    ]
    return out


def build(revision: dict) -> list[tuple[dict, dict, dict]]:
    """(view, entry, UniProt protein summary) per domain in DOMAINS."""
    rows = read_dataset3(set(DOMAINS))
    by_name = {r["name"]: (rid, r) for rid, r in rows.items()}
    missing = [n for n in DOMAINS if n not in by_name]
    if missing:
        raise SystemExit(f"not in Dataset_3: {missing}")
    pride = read_pride_files()
    revision = revision | {"change_summary": "Initial import from the Ferrari et al. 2026 archives"}
    return [build_domain(n, *by_name[n], pride, revision) for n in DOMAINS]
