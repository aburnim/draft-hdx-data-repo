"""Peptide-level HDX-MS: E. coli DHFR (Lu et al. 2026, Nat. Chem. Biol.; PRIDE PXD057539).

Builds one peptide-level HDX entry (states APO, MTX, TMP), three reference-structure
entries (5DFR, 1RG7, 6XG5) and their cross-entry view. Levels follow the comments of the
HDX-MS review: L1a peptide identification, L1b uptake with charge states merged, L1c
fully deuterated controls, L1d corrected uptake (a separate run; uncorrected values are
kept), L2 differential classification and residue projection, L3 mapping to structural
models. Every operation done here is a run with declared parameters.

Called from build_entries.main().
"""

from __future__ import annotations

import io
import json
import math
import re
import statistics
import zipfile
from collections import defaultdict

import gemmi
from scipy import stats

import build_entries as be

NAME = "ecDHFR"
# The protein's UniProt accession. build() checks that every reference structure maps to it
# (_struct_ref) and aligns the construct to the UniProt sequence.
UNIPROT = "P0ABQ4"
PRIDE = "PXD057539"
PAPER_DOI = "10.1038/s41589-025-02049-1"
PREPRINT_DOI = "10.1101/2024.08.04.606547"
HXMS_DOI = "10.1093/bioinformatics/btag113"
CITATION = ("Lu et al., Site-resolved energetic information from HX-MS experiments. Nat. Chem. Biol. (2026); "
            "Weber et al., HXMS: a standardized file format for HX-MS data. Bioinformatics (2026).")
STATES = {
    "APO": {"label": "apo", "ligand": None, "pdb": "5DFR"},
    "MTX": {"label": "methotrexate", "ligand": "MTX", "pdb": "1RG7"},
    "TMP": {"label": "trimethoprim", "ligand": "TOP", "pdb": "6XG5"},
}
HXMS_MEMBERS = {s: f"Supplemental_Data_2/ecDHFR/ecDHFR_2026-02-17_{s}.hxms" for s in STATES}

# --- declared parameters of the runs done here (shown on the site, stored in the records) ---
PARAMS = {
    "merge": {"method": "intensity-weighted mean of uptake across charge states",
              "weight": "summed intensity of the MATCH envelope peaks; unweighted mean when no peaks are listed",
              "keeps": "per-charge records in the HXMS file"},
    "time_bins": {"method": "consecutive labeling times grouped while t <= 1.15 x the first time of the group",
                  "relative_tolerance": 0.15, "reason": "actual times come from instrument logs and differ slightly by replicate"},
    "correction": {"method": "fully deuterated control normalization", "formula": "D_corr = D / D_FD x N_ex",
                   "D_FD": "mean uptake at TIME = inf, same state, all replicates", "n_fastamides": 2,
                   "N_ex": "peptide length - 2 - prolines after position 2", "missing_FD": "not corrected (null)"},
    "differential": {"test": "hybrid significance: Welch t-test per peptide and time AND |dD| > global limit (Hageman & Weis, Anal. Chem. 2019)",
                     "alpha": 0.01, "global_limit": "t(1 - alpha/2, df) x s_pooled x sqrt(2 / n)",
                     "values": "uncorrected uptake (Da); a state-independent back-exchange cancels in the difference",
                     "replicates": "only replicate ids present in both states (same-day pairing)",
                     "min_replicates": 2, "excluded_times": "0 s and fully deuterated",
                     "zero_variance": "p undefined (null) and not significant when all replicate values are identical"},
    "classification": {"more rigid": "uptake significantly lower with ligand at one or more times, never higher",
                       "more flexible": "significantly higher at one or more times, never lower",
                       "mixed": "significantly lower at some times and higher at others",
                       "no observable difference": "tested, no significant time",
                       "not tested": "fewer than 2 paired replicates at every time"},
    "projection": {"method": "a residue takes the classes of the peptides whose exchangeable span covers it (first 2 residues excluded)",
                   "class": "more rigid or more flexible if all significant covering peptides agree; mixed if they disagree",
                   "value": "mean over covering tested peptides of max-|dD| / N_ex (signed), weighted by 1 / peptide length"},
    "mapping": {"method": "construct residue mapped to each structure's label_seq_id by sequence alignment (difflib, blocks > 5 residues)",
                "mismatches": "recorded per structure"},
    "ligand_contacts": {"method": "polymer residues of the reference chain with a heavy atom within the cutoff of a ligand heavy atom",
                        "cutoff_angstrom": 4.0, "model": "first model; same asymmetric unit, no symmetry mates",
                        "excluded_components": ["HOH", "CL", "GOL"],
                        "excluded_reason": "water, chloride and glycerol: crystallization or cryoprotection components",
                        "numbering": "contacts mapped to construct positions through the structure alignment",
                        "status": "a contact marks where a ligand sits in a crystal structure; it is not an HDX observation"},
}
DIFF_CLASSES = ["more rigid", "more flexible", "mixed", "no observable difference", "not tested"]


# --- parsing --------------------------------------------------------------------------------


def read_hxms() -> dict[str, dict]:
    """{state: {meta, records}} from the nested supplement zip, without extracting it."""
    outer = zipfile.ZipFile(be.RAW / "btag113_supplementary_data.zip")
    inner = zipfile.ZipFile(io.BytesIO(outer.read("Supplemental_Data_2.zip")))
    out = {}
    for state, member in HXMS_MEMBERS.items():
        raw = inner.read(member)
        meta, tps, matches = {}, {}, {}
        for line in raw.decode().splitlines():
            p = line.split()
            if not p:
                continue
            if p[0] == "METADATA":
                meta[p[1]] = " ".join(p[2:])
            elif p[0] == "TP":
                t = p[7].lower()
                tps[p[1]] = {"start": int(p[3]), "end": int(p[4]), "rep": int(p[5]),
                             "time": math.inf if t == "inf" else float(t), "uptake": float(p[8])}
            elif p[0] == "MATCH":
                # a MATCH line without a peak list contributes zero weight to the charge merge
                peaks = [x for chunk in p[6].split(",") for x in chunk.split(";") if ":" in x] if len(p) > 6 else []
                intensity = sum(float(x.split(":")[1]) for x in peaks)
                matches[p[1]] = {"conf": float(p[2]), "rt": float(p[3]), "z": int(p[4]), "intensity": intensity}
        for k, m in matches.items():
            tps[k] |= m
        out[state] = {"meta": meta, "records": list(tps.values()), "sha256": be.hashlib.sha256(raw).hexdigest(),
                      "bytes": len(raw), "member": member}
    return out


def n_exchangeable(seq: str, n_fast: int = 2) -> int:
    return max(0, len(seq) - n_fast - seq[n_fast:].count("P"))


def merge_charges(records: list[dict]) -> dict[tuple, dict]:
    """(start, end, rep, time) -> merged record (L1b, charges merged)."""
    groups = defaultdict(list)
    for r in records:
        groups[(r["start"], r["end"], r["rep"], r["time"])].append(r)
    out = {}
    for key, rs in groups.items():
        w = [max(r["intensity"], 0.0) for r in rs]
        total = sum(w)
        uptake = sum(r["uptake"] * x for r, x in zip(rs, w)) / total if total > 0 else statistics.fmean(r["uptake"] for r in rs)
        out[key] = {"uptake": uptake, "charges": sorted(r["z"] for r in rs), "conf": max(r["conf"] for r in rs),
                    "rt": statistics.fmean(r["rt"] for r in rs)}
    return out


def time_bins(times: list[float]) -> list[dict]:
    finite = sorted({t for t in times if math.isfinite(t) and t > 0})
    bins, cur = [], []
    for t in finite:
        if cur and t > cur[0] * (1 + PARAMS["time_bins"]["relative_tolerance"]):
            bins.append(cur)
            cur = []
        cur.append(t)
    if cur:
        bins.append(cur)
    out = [{"id": "t0", "label": "0 s", "t_s": 0.0, "times": [0.0]}]
    for i, b in enumerate(bins):
        out.append({"id": f"t{i + 1}", "label": None, "t_s": round(statistics.median(b), 1), "times": b})
    out.append({"id": "fd", "label": "fully deuterated", "t_s": None, "times": [math.inf]})
    return out


def bin_of(bins: list[dict], t: float) -> str:
    for b in bins:
        if t in b["times"]:
            return b["id"]
    raise KeyError(t)


def ligand_contacts(pdb: str, chain_id: str, construct_of: dict[int, int], state_ligand: str | None) -> list[dict]:
    """Per ligand (CCD code) in a structure: construct positions of reference-chain residues in
    contact, as declared in PARAMS["ligand_contacts"]."""
    p = PARAMS["ligand_contacts"]
    path = be.RAW / f"{pdb}.cif"
    block = gemmi.cif.read(str(path)).sole_block()
    names = dict(zip(block.find_values("_chem_comp.id"), block.find_values("_chem_comp.name")))
    st = gemmi.read_structure(str(path))
    st.setup_entities()
    model = st[0]
    ns = gemmi.NeighborSearch(model, st.cell, 6).populate()
    found: dict[str, dict] = {}
    for ch in model:
        for res in ch:
            if res.entity_type != gemmi.EntityType.NonPolymer or res.name in p["excluded_components"]:
                continue
            hit = set()
            for atom in res:
                if atom.is_hydrogen():
                    continue
                for mark in ns.find_atoms(atom.pos, "\0", radius=p["cutoff_angstrom"]):
                    cra = mark.to_cra(model)
                    # same asymmetric unit only: the untransformed distance must be within the cutoff
                    if (cra.chain.name != chain_id or cra.residue.entity_type != gemmi.EntityType.Polymer
                            or cra.atom.is_hydrogen() or cra.atom.pos.dist(atom.pos) > p["cutoff_angstrom"]):
                        continue
                    hit.add(cra.residue.label_seq)
            if hit:
                f = found.setdefault(res.name, {"label_seq": set(), "instances": 0})
                f["label_seq"] |= hit
                f["instances"] += 1
    pos_of = {v: k for k, v in construct_of.items()}
    return [{"ccd": ccd, "name": gemmi.cif.as_string(names.get(ccd, "")).lower() or None,
             "role": "HDX state ligand" if ccd == state_ligand else "not in the HDX sample",
             "instances": f["instances"],
             "contacts": sorted(pos_of[s] for s in f["label_seq"] if s in pos_of),
             "unmapped_label_seq_ids": sorted(s for s in f["label_seq"] if s not in pos_of)}
            for ccd, f in sorted(found.items())]


def fmt_time(s: float) -> str:
    if s < 90:
        return f"{s:.0f} s"
    if s < 5400:
        return f"{s / 60:.1f} min"
    return f"{s / 3600:.1f} h"


# --- analysis -------------------------------------------------------------------------------


def welch(a: list[float], b: list[float]) -> tuple[float, float]:
    res = stats.ttest_ind(b, a, equal_var=False)
    return float(res.statistic), float(res.pvalue)


def build(revision: dict) -> tuple[dict, list[dict], dict]:
    hx = read_hxms()
    construct = hx["APO"]["meta"]["PROTEIN_SEQUENCE"]
    conditions = {k: hx["APO"]["meta"][k] for k in ("TEMPERATURE(K)", "pH(READ)", "D2O_SATURATION")}
    for s in STATES:
        assert hx[s]["meta"]["PROTEIN_SEQUENCE"] == construct
        assert all(hx[s]["meta"][k] == v for k, v in conditions.items()), "states differ in labeling conditions"

    merged = {s: merge_charges(hx[s]["records"]) for s in STATES}
    bins = time_bins([k[3] for s in STATES for k in merged[s]])
    for b in bins[1:-1]:
        b["label"] = fmt_time(b["t_s"])

    # peptides (L1a summary): every peptide with at least one record in any state
    pep_keys = sorted({(k[0], k[1]) for s in STATES for k in merged[s]})
    peptides = []
    for i, (st, en) in enumerate(pep_keys):
        seq = construct[st - 1:en]
        recs = [v for s in STATES for k, v in merged[s].items() if (k[0], k[1]) == (st, en)]
        peptides.append({"id": f"p{i + 1:03d}", "start": st, "end": en, "seq": seq, "n_ex": n_exchangeable(seq),
                         "conf": round(max(r["conf"] for r in recs), 2), "rt_min": round(statistics.fmean(r["rt"] for r in recs), 2),
                         "charges": sorted({z for r in recs for z in r["charges"]}),
                         "states": [s for s in STATES if any((k[0], k[1]) == (st, en) for k in merged[s])]})
    pid = {(p["start"], p["end"]): p["id"] for p in peptides}
    nex = {p["id"]: p["n_ex"] for p in peptides}

    # uptake table (L1b) and FD controls (L1c), then corrected uptake (L1d)
    uptake, fd = {s: defaultdict(list) for s in STATES}, {s: {} for s in STATES}
    for s in STATES:
        fdvals = defaultdict(list)
        for (st, en, rep, t), v in merged[s].items():
            if math.isinf(t):
                fdvals[pid[(st, en)]].append(v["uptake"])
        fd[s] = {p: round(statistics.fmean(v), 4) for p, v in fdvals.items() if v}
        for (st, en, rep, t), v in merged[s].items():
            p = pid[(st, en)]
            b = bin_of(bins, t)
            corr = None
            if b not in ("t0", "fd") and fd[s].get(p, 0) > 0:
                corr = round(v["uptake"] / fd[s][p] * nex[p], 4)
            elif b == "t0":
                corr = 0.0
            uptake[s][p].append([b, rep, round(t, 1) if math.isfinite(t) else None, round(v["uptake"], 4), corr])
        for p in uptake[s]:
            uptake[s][p].sort(key=lambda x: (x[2] if x[2] is not None else math.inf, x[1]))

    # technical reproducibility (L1 evaluation): replicate SD per peptide and time
    def values(s, p, b, reps=None):
        return [x[3] for x in uptake[s].get(p, []) if x[0] == b and (reps is None or x[1] in reps)]

    repro, sds_by_state = {}, {}
    for s in STATES:
        sds = []
        for p in uptake[s]:
            for b in bins[1:-1]:
                v = values(s, p, b["id"])
                if len(v) >= 2:
                    sds.append(statistics.stdev(v))
        sds_by_state[s] = sds
        sds_sorted = sorted(sds)
        repro[s] = {"n_points": len(sds), "median_sd_da": round(statistics.median(sds), 4),
                    "p95_sd_da": round(sds_sorted[int(0.95 * (len(sds_sorted) - 1))], 4),
                    "pooled_sd_da": round(math.sqrt(statistics.fmean([x * x for x in sds])), 4),
                    "replicates": sorted({x[1] for p in uptake[s] for x in uptake[s][p]})}

    # differential (L2): APO vs each ligand state, same-day replicates only
    alpha = PARAMS["differential"]["alpha"]
    comparisons = []
    for lig in ("MTX", "TMP"):
        reps = sorted(set(repro["APO"]["replicates"]) & set(repro[lig]["replicates"]))
        n = len(reps)
        sq, k = [], 0
        cells = []
        for p in pid.values():
            for b in bins[1:-1]:
                a, c = values("APO", p, b["id"], reps), values(lig, p, b["id"], reps)
                if len(a) >= 2 and len(c) >= 2:
                    cells.append((p, b["id"], a, c))
                    sq += [statistics.variance(a), statistics.variance(c)]
        s_pooled = math.sqrt(statistics.fmean(sq)) if sq else None
        df = 2 * n - 2
        limit = stats.t.ppf(1 - alpha / 2, df) * s_pooled * math.sqrt(2 / n) if s_pooled else None
        results = defaultdict(list)
        for p, b, a, c in cells:
            d = statistics.fmean(c) - statistics.fmean(a)
            # identical replicate values in both states: the t-test is undefined, so not significant
            pv = welch(a, c)[1] if statistics.variance(a) + statistics.variance(c) > 0 else math.nan
            sig = bool(pv < alpha and abs(d) > limit)
            results[p].append([b, round(d, 4), float(f"{pv:.3e}") if math.isfinite(pv) else None, sig])
        classes = {}
        for p in pid.values():
            r = results.get(p, [])
            if not r:
                classes[p] = "not tested"
                continue
            neg = any(x[3] and x[1] < 0 for x in r)
            pos = any(x[3] and x[1] > 0 for x in r)
            classes[p] = "mixed" if neg and pos else "more rigid" if neg else "more flexible" if pos else "no observable difference"
        # residue projection (construct numbering)
        residue = {}
        by_pep = {pp["id"]: pp for pp in peptides}
        for pos in range(1, len(construct) + 1):
            cov = [pp for pp in peptides if pp["start"] + 2 <= pos <= pp["end"] and classes[pp["id"]] != "not tested"]
            if not cov:
                continue
            sig = {classes[pp["id"]] for pp in cov} - {"no observable difference"}
            cls = ("no observable difference" if not sig else sig.pop() if len(sig) == 1 and "mixed" not in sig else "mixed")
            num, den = 0.0, 0.0
            for pp in cov:
                r = results[pp["id"]]
                dmax = max(r, key=lambda x: abs(x[1]))[1]
                w = 1 / len(pp["seq"])
                if pp["n_ex"] > 0:
                    num += w * dmax / pp["n_ex"]
                    den += w
            residue[pos] = {"class": cls, "value": round(num / den, 4) if den else None, "n_peptides": len(cov)}
        counts = {c: sum(1 for v in classes.values() if v == c) for c in DIFF_CLASSES}
        comparisons.append({"id": f"APO_vs_{lig}", "a": "APO", "b": lig, "replicates": reps, "n": n,
                            "s_pooled_da": round(s_pooled, 4) if s_pooled else None, "df": df,
                            "limit_da": round(limit, 4) if limit else None, "alpha": alpha,
                            "results": dict(results), "classes": classes, "counts": counts,
                            "residue": {str(k): v for k, v in residue.items()}})

    # structures and mapping (L3)
    view_id = "view_ecdhfr"
    ids = {"hdx": be.opaque_id(f"{NAME}|HDX-MS peptide")} | {s: be.opaque_id(f"{STATES[s]['pdb']}|structure") for s in STATES}
    structures = []
    excluded = PARAMS["ligand_contacts"]["excluded_components"]
    for s, info in STATES.items():
        st = be.read_structure(info["pdb"])
        # the protein is identified by UniProt; every reference structure must map to it
        if st["uniprot"] != [UNIPROT]:
            raise SystemExit(f"{info['pdb']} maps to UniProt {st['uniprot']}, expected {UNIPROT}")
        mapping, mism = be.align(construct, st["sequence"])
        seq_of_pos = {p["pos"]: p["seq"] for p in st["chain"]["positions"]}
        structures.append({
            "pdb": info["pdb"], "entry": ids[s], "state": s, "title": st["title"], "method": st["method"],
            "resolution": st["resolution"], "ligands": st["ligands"], "chain": st["chain"], "struct": st,
            "label_of": {str(k): v for k, v in mapping.items()},
            "auth_of": {str(k): seq_of_pos[v] for k, v in mapping.items() if v in seq_of_pos},
            "mismatches": mism,
            "ligand_contacts": ligand_contacts(info["pdb"], st["chain"]["id"], mapping, info["ligand"]),
            "notes": ([f"sequence differs from the HDX construct at label_seq_id {m['label_seq_id']}: "
                       f"{m['construct']} (construct) vs {m['structure']} (structure)" for m in mism]
                      + ([f"contains ligands not in the HDX state: {', '.join(x for x in st['ligands'] if x not in (info['ligand'], *excluded))}"]
                         if any(x not in (info["ligand"], *excluded) for x in st["ligands"]) else [])),
        })

    # --- provenance nodes and runs (view) ---
    lock = be.LOCK
    commit_pf = be.COMMIT.get("PIGEON-FEATHER")
    pride_files = json.loads((be.RAW / "PXD057539_files.json").read_text())
    ftp = {f["fileName"]: next(l["value"] for l in f["publicFileLocations"] if l["name"] == "FTP Protocol") for f in pride_files}
    size = {f["fileName"]: int(f["fileSizeBytes"]) for f in pride_files}
    eco_raw = sorted(n for n in ftp if n.startswith("ecDHFR-Rep"))
    eco_mgf = sorted(n for n in ftp if n.startswith("ar4_") and n.endswith(".mgf"))
    eco_lists = sorted(n for n in ftp if (n.startswith("ar4_") and n.endswith(".csv")) or re.match(r"new_peps[-_]2401|new_peps[-_]2402|new_peps[-_]2403|new_peps-2406", n))
    project = json.loads((be.RAW / "PXD057539.json").read_text())
    supp = lock["hxms_supplement"]
    prj_uri = f"https://www.ebi.ac.uk/pride/archive/projects/{PRIDE}"
    nodes = [
        {"id": "a_raw", "kind": "artifact", "entry": ids["hdx"], "short": f"PRIDE {PRIDE}", "level": "L0",
         "title": f"{len(eco_raw)} raw Bruker .d archives (ecDHFR replicates), including fully deuterated controls",
         "format": "bruker .d (zip)", "uri": prj_uri, "sha256": None, "license": "CC0-1.0", "held": False},
        {"id": "a_mgf", "kind": "artifact", "entry": ids["hdx"], "short": f"PRIDE {PRIDE}", "level": "L0",
         "title": f"{len(eco_mgf)} MS/MS search files (.mgf) of undeuterated samples", "format": "mgf",
         "uri": prj_uri, "sha256": None, "license": "CC0-1.0", "held": False},
        {"id": "a_ids", "kind": "artifact", "entry": ids["hdx"], "short": f"PRIDE {PRIDE}", "level": "L1",
         "title": f"L1a peptide identification: {len(eco_lists)} peptide lists, raw and curated (CLEANED)", "format": "csv",
         "uri": prj_uri, "sha256": None, "license": "CC0-1.0", "held": False},
        {"id": "a_hxms", "kind": "artifact", "entry": ids["hdx"], "short": "HXMS", "level": "L1",
         "title": "L1b uptake per charge state with envelopes (3 HXMS files: APO, MTX, TMP); L1c fully deuterated controls (TIME = inf)",
         "format": "hxms", "uri": supp["url"], "sha256": supp["sha256"], "license": supp["license"], "held": False},
        {"id": "a_merged", "kind": "artifact", "entry": ids["hdx"], "short": "view record", "level": "L1",
         "title": "L1b uptake with charge states merged (computed here)", "format": "json",
         "uri": f"views/{view_id}.json", "sha256": None, "license": "CC-BY-4.0", "held": True},
        {"id": "a_corr", "kind": "artifact", "entry": ids["hdx"], "short": "view record", "level": "L1",
         "title": "L1d corrected uptake, FD-normalized (computed here; uncorrected kept)", "format": "json",
         "uri": f"views/{view_id}.json", "sha256": None, "license": "CC-BY-4.0", "held": True},
        {"id": "a_repro", "kind": "artifact", "entry": ids["hdx"], "short": "view record", "level": "L1",
         "title": "L1 technical reproducibility: replicate SD per peptide and time (computed here)", "format": "json",
         "uri": f"views/{view_id}.json", "sha256": None, "license": "CC-BY-4.0", "held": True},
        {"id": "m_diff", "kind": "model", "entry": ids["hdx"], "short": "view record", "level": "L2",
         "title": "Model: differential classification and residue projection, APO vs MTX and APO vs TMP (computed here)",
         "format": "json", "uri": f"views/{view_id}.json", "sha256": None, "license": "CC-BY-4.0", "held": True, "stored_in": "a_view"},
        *[{"id": f"a_pdb_{x['pdb'].lower()}", "kind": "artifact", "entry": x["entry"], "short": f"PDB {x['pdb']}", "level": "L2",
           "title": f"PDB {x['pdb']}: {x['method'].lower()}, {x['resolution']} Å; ligands {', '.join(x['ligands']) or 'none'}",
           "format": "mmcif", "uri": be.lock_uri(f"pdb_{x['pdb'].lower()}"), "sha256": lock[f"pdb_{x['pdb'].lower()}"]["sha256"],
           "license": "CC0-1.0", "held": True} for x in structures],
        {"id": "a_view", "kind": "artifact", "entry": None, "short": "view record", "level": "L3",
         "title": "L3 mapping to structural models: residue classes on 5DFR, 1RG7, 6XG5 (computed here)", "format": "json",
         "uri": f"views/{view_id}.json", "sha256": None, "license": "CC-BY-4.0", "held": True},
    ]
    runs = [
        {"id": "r_id", "software": "Compass DataAnalysis 5.1 + Biotools 3.2 (Bruker)", "version": "5.1 / 3.2",
         "description": "Peptide identification from MS/MS: no enzyme, 30 ppm, 0.020 Da MS/MS, 20 partials, 150-25000 Da, monoisotopic",
         "inputs": ["a_mgf"], "outputs": ["a_ids"], "parsed_from": "PRIDE dataProcessingProtocol"},
        {"id": "r_extract", "software": "PIGEON + HDExaminer, exported with PFLink", "version": commit_pf,
         "description": "Peptide pool deconvolution (PIGEON), deuterated envelope extraction (HDExaminer), conversion to HXMS (PFLink)",
         "inputs": ["a_raw", "a_ids"], "outputs": ["a_hxms"], "parsed_from": "PRIDE protocol and HXMS paper; HDExaminer and PFLink versions not stated"},
        {"id": "r_merge", "software": "hdx-data-repo pipeline/build_peptide.py", "version": be.VERSION,
         "description": "Merge charge states (intensity-weighted mean); group labeling times (15% tolerance)",
         "inputs": ["a_hxms"], "outputs": ["a_merged"], "parsed_from": "this repository"},
        {"id": "r_correct", "software": "hdx-data-repo pipeline/build_peptide.py", "version": be.VERSION,
         "description": "Back-exchange correction by FD normalization: D_corr = D / D_FD x N_ex; uncorrected values kept",
         "inputs": ["a_merged"], "outputs": ["a_corr"], "parsed_from": "this repository"},
        {"id": "r_repro", "software": "hdx-data-repo pipeline/build_peptide.py", "version": be.VERSION,
         "description": "Replicate standard deviation per peptide and time; median, 95th percentile and pooled SD per state",
         "inputs": ["a_merged"], "outputs": ["a_repro"], "parsed_from": "this repository"},
        {"id": "r_diff", "software": "hdx-data-repo pipeline/build_peptide.py", "version": be.VERSION,
         "description": "Hybrid significance test per peptide and time (alpha 0.01, same-day replicates), peptide classes, residue projection",
         "inputs": ["a_merged", "a_repro"], "outputs": ["m_diff"], "parsed_from": "this repository"},
        {"id": "r_map", "software": "hdx-data-repo pipeline/build_peptide.py", "version": be.VERSION,
         "description": "Map residue classes onto each structure by sequence alignment; record mismatches",
         "inputs": ["m_diff", *[f"a_pdb_{x['pdb'].lower()}" for x in structures]], "outputs": ["a_view"], "parsed_from": "this repository"},
        {"id": "r_contacts", "software": "hdx-data-repo pipeline/build_peptide.py", "version": be.VERSION,
         "description": f"Ligand contacts per reference structure: heavy atoms within {PARAMS['ligand_contacts']['cutoff_angstrom']} Å, mapped to construct positions",
         "inputs": [f"a_pdb_{x['pdb'].lower()}" for x in structures], "outputs": ["a_view"], "parsed_from": "this repository"},
    ]

    # metrics: L1 reproducibility and L2 class counts
    metrics = []
    for s in STATES:
        metrics.append({"key": f"repro_median_sd_{s}", "value": repro[s]["median_sd_da"], "unit": "Da", "level": "L1",
                        "interpretation": "a_repro", "source_field": f"replicate SD, {s}", "computed_here": True, "entry": ids["hdx"]})
    for c in comparisons:
        for cls in ("more rigid", "more flexible", "mixed"):
            metrics.append({"key": f"{c['id']}:{cls}", "value": c["counts"][cls], "unit": "peptides", "level": "L2",
                            "interpretation": "m_diff", "source_field": f"{c['id']} {cls}", "computed_here": True, "entry": ids["hdx"]})

    protein, unp_mapping = be.uniprot_record(UNIPROT, construct)

    members = [{"id": ids["hdx"], "kind": "hdx", "method": "HDX-MS (peptide)", "title": f"{NAME}: peptide-level HDX-MS, APO / MTX / TMP"}] + [
        {"id": x["entry"], "kind": "structure", "method": x["method"], "title": f"{x['pdb']}: {x['title']}"} for x in structures]

    view = {
        "schema_version": be.VERSION, "id": view_id, "kind": "peptide", "name": NAME,
        "title": "E. coli dihydrofolate reductase: apo, methotrexate and trimethoprim states",
        "grouping": "Entries whose sequences align to the ecDHFR HDX construct (His-tag and TEV site excluded).",
        "members": members,
        "protein": {"name": NAME, "origin": "natural protein", "topology": None, "uniprot": UNIPROT, "organism": "Escherichia coli"},
        "construct": {"sequence": construct, "note": "His-tag and TEV site (MTGHHHHHHENLYFQ) precede ecDHFR; S16 replaces M1"},
        "labeling_conditions": {"temperature_K": float(conditions["TEMPERATURE(K)"]), "pH_read": float(conditions["pH(READ)"]),
                       "d2o_saturation": float(conditions["D2O_SATURATION"])},
        "states": [{"id": s, "label": STATES[s]["label"], "ligand": STATES[s]["ligand"], "replicates": repro[s]["replicates"],
                    "n_peptides": len(uptake[s]), "pdb": STATES[s]["pdb"]} for s in STATES],
        "chain": structures[0]["chain"],
        "structures": [{k: v for k, v in x.items() if k != "struct"} for x in structures],
        "time_bins": [{"id": b["id"], "label": b["label"], "t_s": b["t_s"], "n_times": len(b["times"])} for b in bins],
        "peptides": peptides,
        "uptake": {s: dict(uptake[s]) for s in STATES},
        "uptake_columns": ["time_bin", "replicate", "time_s", "uptake_da_uncorrected", "uptake_corrected"],
        "fd": fd,
        "reproducibility": repro,
        "comparisons": comparisons,
        "parameters": PARAMS,
        "identification_protocol": project.get("dataProcessingProtocol"),
        "external_refs": {"pdb": ", ".join(x["pdb"] for x in structures), "pride": PRIDE, "doi": PAPER_DOI, "hxms_doi": HXMS_DOI},
        "artifacts": nodes, "runs": runs, "metrics": metrics,
        "license": "Derived from PRIDE PXD057539 (CC0) and the HXMS supplement (license unverified); structures CC0-1.0",
        "citation": CITATION,
    }
    view["derivations"] = derivations(view, ids, structures)

    # --- entry records ---
    hdx_entry = {
        "schema_version": be.VERSION, "id": ids["hdx"], "kind": "hdx", "state": "active", "revision": revision,
        "title": f"{NAME}: peptide-level HDX-MS, apo / methotrexate / trimethoprim",
        "method": "HDX-MS (peptide level)",
        "polymer_entities": [{"id": "pe_1", "description": "dihydrofolate reductase (E. coli)", "construct": "His-tag + TEV site + ecDHFR (S16 replaces M1)",
                              "sequence": construct, "source_organisms": [{"scientific_name": "Escherichia coli", "ncbi_taxonomy_id": 562}],
                              "mutations": [], "uniprot_mappings": [unp_mapping]}],
        "ligands_by_sample": {s: STATES[s]["ligand"] for s in STATES},
        "hdx": {
            "samples": [{"id": s, "polymer_entity": "pe_1", "state": STATES[s]["label"], "ligand": STATES[s]["ligand"],
                         "replicates": repro[s]["replicates"], "pH": float(conditions["pH(READ)"]), "pH_kind": "pH(read)",
                         "temperature_kelvin": float(conditions["TEMPERATURE(K)"]), "d2o_saturation": float(conditions["D2O_SATURATION"]),
                         "buffer": None, "labeling_times_s": sorted({x[2] for v in uptake[s].values() for x in v if x[2] is not None}),
                         "source": {"artifact": f"a_hxms_{s.lower()}", "rows": []}} for s in STATES],
            "peptide_map": {"n_peptides": len(peptides), "coverage_residues": len({i for p in peptides for i in range(p["start"], p["end"] + 1)}),
                            "construct_length": len(construct), "identification_run": "r_id", "curation": "PRIDE peptide lists (raw and CLEANED)"},
        },
        "artifacts": [
            *[{"id": f"a_raw_{i + 1:03d}", "name": n, "level": "L0", "type": "other", "format": "bruker .d (zip)", "uri": ftp[n],
               "size_bytes": size[n], "sha256": None, "license": "CC0-1.0", "stored": False} for i, n in enumerate(eco_raw)],
            *[{"id": f"a_mgf_{i + 1:03d}", "name": n, "level": "L0", "type": "other", "format": "mgf", "uri": ftp[n],
               "size_bytes": size[n], "sha256": None, "license": "CC0-1.0", "stored": False} for i, n in enumerate(eco_mgf)],
            *[{"id": f"a_ids_{i + 1:03d}", "name": n, "level": "L1", "type": "other", "format": "csv", "uri": ftp[n],
               "size_bytes": size[n], "sha256": None, "license": "CC0-1.0", "stored": False} for i, n in enumerate(eco_lists)],
            *[{"id": f"a_hxms_{s.lower()}", "name": HXMS_MEMBERS[s].rsplit("/", 1)[1], "level": "L1", "type": "other", "format": "hxms",
               "uri": supp["url"], "size_bytes": hx[s]["bytes"], "sha256": hx[s]["sha256"], "license": supp["license"], "stored": False}
              for s in STATES],
        ],
        "runs": [
            {"id": "r_id", "software_name": "Compass DataAnalysis + Biotools (Bruker)", "software_version": "5.1 / 3.2", "command": None,
             "parameters": {"enzyme": None, "precursor_error_ppm": 30, "msms_error_da": 0.020, "partials": 20, "mass_range_da": [150, 25000], "ions": "monoisotopic"},
             "inputs": [{"artifact": f"a_mgf_{i + 1:03d}"} for i in range(len(eco_mgf))],
             "outputs": [{"artifact": f"a_ids_{i + 1:03d}"} for i in range(len(eco_lists))]},
            {"id": "r_extract", "software_name": "PIGEON (PIGEON-FEATHER) + HDExaminer + PFLink", "software_version": commit_pf, "command": None,
             "parameters": None,
             "inputs": [{"artifact": f"a_raw_{i + 1:03d}"} for i in range(len(eco_raw))] + [{"artifact": f"a_ids_{i + 1:03d}"} for i in range(len(eco_lists))],
             "outputs": [{"artifact": f"a_hxms_{s.lower()}"} for s in STATES]},
            *[{"id": r, "software_name": "hdx-data-repo pipeline/build_peptide.py", "software_version": be.VERSION, "command": "python pipeline/build_entries.py",
               "parameters": PARAMS[key], "inputs": [{"artifact": f"a_hxms_{s.lower()}"} for s in STATES], "outputs": [{"model": out}] if out else []}
              for r, key, out in [("r_merge", "merge", None), ("r_correct", "correction", None), ("r_diff", "differential", f"{ids['hdx']}_m_001")]],
        ],
        "models": [{
            "id": f"{ids['hdx']}_m_001", "revision_number": 1, "title": "Differential classification and residue projection (APO vs MTX, APO vs TMP)",
            "model_type": "HDX differential set", "purpose": "Model Building", "model_source": "ext", "authors": ["this repository"],
            "run": "r_diff", "source": {"artifact": "a_hxms_apo"},
            "residue_frame": {"entry": ids["APO"], "model": f"{ids['APO']}_m_001", "mapping": PARAMS["mapping"]["method"]},
            "residue_data": None,
            "metrics": [{"key": m["key"], "value": m["value"], "unit": m["unit"], "software_name": "hdx-data-repo pipeline/build_peptide.py",
                         "software_version": be.VERSION, "source_field": m["source_field"]} for m in metrics],
        }],
        "external_refs": {"pride": PRIDE, "doi": PAPER_DOI},
        "view": view_id,
        "linked_entries": [{"entry": x["entry"], "method": x["method"], "basis": "sequence alignment (same cross-entry view)"} for x in structures],
        "extensions": [
            "hdx.samples: one per ligand state, with replicate ids, pH(read), temperature, D2O saturation",
            "hdx.peptide_map: peptide count and coverage, with the identification run",
            "model_type 'HDX differential set': per-peptide and per-residue classes without coordinates",
            "runs done here declare their parameters (charge merging, time grouping, FD correction, hybrid test, projection, mapping)",
            "raw and identification artifacts lack sha256: PRIDE lists no checksum and the files were not downloaded",
            "HXMS supplement license unverified (preprint CC-BY-4.0)",
        ],
        "citation": CITATION,
    }
    structure_entries = []
    for x in structures:
        linked = [{"entry": ids["hdx"], "method": "HDX-MS (peptide)", "basis": "sequence alignment (same cross-entry view)"}] + [
            {"entry": y["entry"], "method": y["method"], "basis": "sequence alignment (same cross-entry view)"} for y in structures if y is not x]
        structure_entries.append(be.structure_record(x["pdb"], x["struct"], x["entry"], view_id, linked, CITATION, revision, x["notes"]))
    return view, [hdx_entry, *structure_entries], protein


def derivations(view: dict, ids: dict, structures: list[dict]) -> list[dict]:
    hdx = ids["hdx"]

    def rec(id_, label, tier, entry, inputs, op=None, code=None, check=None, value=None, unit=None):
        ups = [be.upstream(view, i["artifact"]) for i in inputs]
        status = "blocked" if any(u["status"] == "blocked" for u in ups) else (
            "deposited" if all(u["status"] == "deposited" for u in ups) else "pipelines")
        chain = []
        for u in ups:
            chain += [r for r in u["runs"] if r not in chain]
        return {"id": id_, "label": label, "tier": tier, "entry": entry, "value": value, "unit": unit, "inputs": inputs,
                "runs": chain, "raw": status, "operation": op, "code": code, "check": check}

    vj = "web/public/views/view_ecdhfr.json"
    hx = [{"artifact": "a_hxms", "fields": ["TP", "MATCH"], "rows": ["APO", "MTX", "TMP"]}]
    out = [
        rec("plot:peptide_map", "Peptide map (L1a)", "copied", hdx, hx + [{"artifact": "a_ids", "fields": ["Sequence", "Start", "End", "Score"], "rows": []}],
            op="Peptides with at least one uptake record in any state; confidence and charges from MATCH records.",
            check=f"jq '.peptides | length' {vj}"),
        rec("plot:uptake", "Uptake curves (L1b, L1d)", "computed", hdx, [{"artifact": "a_merged", "fields": ["uptake"], "rows": []}],
            op=PARAMS["merge"]["method"] + "; corrected: " + PARAMS["correction"]["formula"] + ".",
            code="pipeline/build_peptide.py (merge_charges, correction)", check=f"jq '.uptake.APO.p001' {vj}"),
        rec("plot:repro", "Technical reproducibility (L1)", "computed", hdx, [{"artifact": "a_merged", "fields": ["uptake"], "rows": []}],
            op="Standard deviation over replicates for each peptide and time with 2 or more replicates.",
            code="pipeline/build_peptide.py (reproducibility)", check=f"jq '.reproducibility' {vj}"),
        rec("plot:woods", "Woods plot (L2)", "computed", hdx, [{"artifact": "a_merged", "fields": ["uptake"], "rows": []}],
            op=PARAMS["differential"]["test"] + "; " + PARAMS["differential"]["replicates"] + ".",
            code="pipeline/build_peptide.py (differential)", check=f"jq '.comparisons[0].limit_da' {vj}"),
        rec("plot:volcano", "Volcano plot (L2)", "computed", hdx, [{"artifact": "a_merged", "fields": ["uptake"], "rows": []}],
            op=PARAMS["differential"]["test"] + ".", code="pipeline/build_peptide.py (differential)"),
        rec("plot:chiclet", "ΔD per peptide and time (L2)", "computed", hdx, [{"artifact": "a_merged", "fields": ["uptake"], "rows": []}],
            op="Mean uptake difference (ligand minus apo) per peptide and time bin; outlined cells pass the hybrid test.",
            code="pipeline/build_peptide.py (differential)"),
        rec("color:class", "Structure colored by differential class (L2 → L3)", "computed", None,
            [{"artifact": "m_diff", "fields": ["classes", "residue"], "rows": []}],
            op=PARAMS["projection"]["method"] + ". " + PARAMS["mapping"]["method"] + ".",
            code="pipeline/build_peptide.py (projection, align)", check=f"jq '.comparisons[0].residue[\"40\"]' {vj}"),
        rec("color:value", "Structure colored by max |ΔD| per amide (L2 → L3)", "computed", None,
            [{"artifact": "m_diff", "fields": ["residue"], "rows": []}], op=PARAMS["projection"]["value"] + ".",
            code="pipeline/build_peptide.py (projection)"),
        rec("color:coverage", "Structure colored by coverage depth (L1a → L3)", "computed", hdx, hx,
            op="Number of peptides whose span covers each residue, per state.", code="web/src/hdx/PeptideExplorer.tsx (coverage)"),
    ]
    for x in structures:
        out.append(rec(f"structure:coords:{x['pdb']}", f"Structure coordinates ({x['pdb']})", "copied", x["entry"],
                       [{"artifact": f"a_pdb_{x['pdb'].lower()}", "fields": ["whole file"], "rows": []}],
                       check=f"shasum -a 256 web/public/structures/{x['pdb']}.cif"))
    lc = PARAMS["ligand_contacts"]
    for x in structures:
        for c in x["ligand_contacts"]:
            out.append(rec(f"lane:contacts:{x['pdb']}:{c['ccd']}", f"{c['ccd']} contacts in {x['pdb']} (L3)", "computed", x["entry"],
                           [{"artifact": f"a_pdb_{x['pdb'].lower()}", "fields": ["_atom_site"], "rows": [c["ccd"]]}],
                           op=f"{lc['method']}; cutoff {lc['cutoff_angstrom']} Å; {lc['model']}. {lc['numbering']}.",
                           code="pipeline/build_peptide.py (ligand_contacts)",
                           check=f"jq '.structures[] | select(.pdb==\"{x['pdb']}\") | .ligand_contacts[] | select(.ccd==\"{c['ccd']}\")' {vj}"))
    for m in view["metrics"]:
        out.append(rec(f"metric:{m['key']}", m["key"], "computed", m["entry"],
                       [{"artifact": "a_repro" if m["level"] == "L1" else "m_diff", "fields": [m["source_field"]], "rows": []}],
                       op="See the run parameters.", code="pipeline/build_peptide.py", value=m["value"], unit=m["unit"],
                       check=f"jq '.metrics[] | select(.key==\"{m['key']}\")' {vj}"))
    return out
