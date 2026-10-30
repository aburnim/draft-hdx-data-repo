"""Build entry records, cross-entry views and the entry list from the pinned sources.

Entries follow the Dynamic PDB schema v0.2.0 where it applies (one experimental context
per entry; polymer entities for constructs; models, runs and artifacts), with HDX
extensions listed in each record's `extensions`. The registry holds one peptide-level
HDX-MS entry (ecDHFR, built by build_peptide.py) with its reference-structure entries, and
intact-protein mHDX-MS entries of natural domains (build_intact.py). Each HDX entry and its
structures form one cross-entry view (the Explore tab).

Reads data/raw/ (see fetch.py) and writes, under web/public/:
  index.json                     proteins by UniProt accession, each with its HDX entries (front page)
  entries/<id>.json              entry records (schema/hdx_entry.v0.2.json)
  views/<view>.json              cross-entry views (schema/hdx_view.v0.2.json)
  structures/<pdb>.cif           reference coordinates

    python pipeline/build_entries.py
"""

from __future__ import annotations

import hashlib
import json
import math
import shutil
from difflib import SequenceMatcher
from pathlib import Path

import gemmi
import jsonschema

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "web" / "public"
SCHEMA_ENTRY = json.loads((ROOT / "schema" / "hdx_entry.v0.2.json").read_text())
SCHEMA_VIEW = json.loads((ROOT / "schema" / "hdx_view.v0.2.json").read_text())
LOCK = {f["id"]: f for f in json.loads((ROOT / "sources.lock.json").read_text())["files"]}
REPOS = json.loads((ROOT / "sources.lock.json").read_text())["repos"]
COMMIT = {r["repo"].rsplit("/", 1)[1]: r["commit"] for r in REPOS}
VERSION = "0.2.0"
REVISION = {"revision_number": 1, "parent_revision_id": None, "state": "active", "published_at": None,
            "change_summary": "Initial import from the published archives"}


def opaque_id(key: str, prefix: str = "hdx") -> str:
    """prefix_ + 8 base-36 characters, derived from a stable key so rebuilds keep ids."""
    n = int(hashlib.sha256(key.encode()).hexdigest(), 16)
    chars = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    for _ in range(8):
        n, r = divmod(n, 36)
        out += chars[r]
    return f"{prefix}_{out}"


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
        "ligands": sorted({gemmi.cif.as_string(r[0]) for r in block.find("_pdbx_nonpoly_scheme.", ["mon_id"])} - {"HOH"}),
        "uniprot": sorted({gemmi.cif.as_string(r[1]) for r in block.find("_struct_ref.", ["db_name", "pdbx_db_accession"])
                           if gemmi.cif.as_string(r[0]) == "UNP"}),
        "resolution": num(gemmi.cif.as_string(block.find_value("_refine.ls_d_res_high") or "")) if block.find_value("_refine.ls_d_res_high") else None,
    }


# --- sequences: alignment and UniProt --------------------------------------------------


def align(construct: str, seq: str) -> tuple[dict[int, int], list[dict]]:
    """construct position (1-based) -> structure label_seq_id, plus mismatches inside the
    aligned region (single-residue gaps between matching blocks)."""
    sm = SequenceMatcher(None, construct, seq, autojunk=False)
    blocks = [b for b in sm.get_matching_blocks() if b.size > 5]
    mapping, mism = {}, []
    for b in blocks:
        for i in range(b.size):
            mapping[b.a + i + 1] = b.b + i + 1
    for b1, b2 in zip(blocks, blocks[1:]):
        ga, gb = b2.a - (b1.a + b1.size), b2.b - (b1.b + b1.size)
        if ga == gb:
            for i in range(ga):
                a, s = b1.a + b1.size + i, b1.b + b1.size + i
                mapping[a + 1] = s + 1
                mism.append({"construct_pos": a + 1, "label_seq_id": s + 1, "construct": construct[a], "structure": seq[s]})
    return mapping, mism


def uniprot_record(accession: str, construct: str) -> tuple[dict, dict]:
    """(protein summary for the index, polymer-entity mapping) from the pinned UniProt file."""
    key = f"uniprot_{accession.lower()}"
    d = json.loads((RAW / LOCK[key]["file"]).read_text())
    seq = d["sequence"]["value"]
    pos, mism = align(construct, seq)
    mapped = sorted(pos)
    mapping = {
        "accession": accession, "unp_entry_version": d["entryAudit"]["entryVersion"],
        "construct_begin": mapped[0], "construct_end": mapped[-1],
        "unp_begin": pos[mapped[0]], "unp_end": pos[mapped[-1]],
        "mismatches": [{"construct_pos": m["construct_pos"], "unp_pos": m["label_seq_id"],
                        "construct": m["construct"], "uniprot": m["structure"]} for m in mism],
        "source": "alignment of the construct to the UniProt sequence (difflib, blocks > 5 residues)",
    }
    # a construct residue just before the first matching block that stands in for UniProt
    # residue 1 (e.g. S16 replacing the initiator M1) is a substitution, not a gap, so align()
    # does not report it. Other leading residues (tags) stay outside the mapping.
    first, unp_first = mapped[0], pos[mapped[0]]
    if unp_first == 2 and first >= 2 and construct[first - 2] != seq[0]:
        mapping["mismatches"].insert(0, {"construct_pos": first - 1, "unp_pos": 1, "construct": construct[first - 2], "uniprot": seq[0]})
        mapping["construct_begin"], mapping["unp_begin"] = first - 1, 1
    protein = {
        "uniprot": accession, "uniprot_id": d["uniProtkbId"], "reviewed": d["entryType"].endswith("(Swiss-Prot)"),
        "name": d["proteinDescription"]["recommendedName"]["fullName"]["value"],
        "gene": next((g["geneName"]["value"] for g in d.get("genes", []) if "geneName" in g), None),
        "organism": d["organism"]["scientificName"], "taxon_id": d["organism"]["taxonId"],
        "length": d["sequence"]["length"], "entry_version": d["entryAudit"]["entryVersion"],
        "source": {"url": LOCK[key]["url"], "sha256": LOCK[key]["sha256"], "license": LOCK[key]["license"]},
    }
    return protein, mapping


# --- reference structures --------------------------------------------------------------


def structure_record(pdb: str, struct: dict, entry_id: str, view_id: str, linked: list[dict], citation: str,
                     revision: dict, notes: list[str] | None = None) -> dict:
    """A reference-structure entry: the deposited model as a v0.2.0 'Deposited' model with
    purpose 'Reference'. Used for comparison and residue numbering, not as ground truth."""
    pdb_key = f"pdb_{pdb.lower()}"
    ensemble = struct["n_models"] > 1
    return {
        "schema_version": VERSION, "id": entry_id, "kind": "structure", "state": "active", "revision": revision,
        "title": struct["title"],
        "method": struct["method"],
        "method_source": "mmCIF _exptl.method",
        "polymer_entities": [{"id": "pe_1", "description": struct["chain"]["entity_description"] or "deposited construct",
                              "construct": None, "sequence": struct["sequence"], "source_organisms": [], "mutations": [],
                              "uniprot_mappings": []}],
        "ligands": struct["ligands"],
        "resolution": struct["resolution"],
        "artifacts": [
            {"id": "a_pdb", "name": f"{pdb}.cif", "level": "L2", "type": "model", "format": "mmcif",
             "uri": lock_uri(pdb_key), "size_bytes": LOCK[pdb_key]["bytes"], "sha256": LOCK[pdb_key]["sha256"],
             "license": "CC0-1.0", "stored": True},
        ],
        "runs": [],
        "models": [{
            "id": f"{entry_id}_m_001", "revision_number": 1, "title": f"Deposited model (PDB {pdb})",
            "model_type": "Deposited", "purpose": "Reference", "model_source": "pdb", "authors": [],
            "primary_artifact": "a_pdb", "ensemble_members": struct["n_models"],
            "atom_count": struct["atom_count"], "modeled_residues": struct["modeled_residues"], "unique_protein_chains": 1,
            "metrics": [],
        }],
        "external_refs": {"pdb": pdb},
        "view": view_id, "linked_entries": linked,
        "extensions": (["atom_count and modeled_residues are counted on the first of the ensemble's conformers"] if ensemble else [])
                      + (notes or []),
        "citation": citation,
    }


# --- provenance ------------------------------------------------------------------------


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


# --- build -----------------------------------------------------------------------------


def main() -> None:
    for sub in ("entries", "views", "structures", "schema"):
        (OUT / sub).mkdir(parents=True, exist_ok=True)
    for sub in ("entries", "views", "structures"):
        for old in list((OUT / sub).glob("*")):
            old.unlink()  # drop records of entries that are no longer built
    shutil.copyfile(ROOT / "sources.lock.json", OUT / "sources.lock.json")
    # peptide-level HDX-MS (ecDHFR)
    import build_peptide
    pview, pentries, protein = build_peptide.build(REVISION)
    jsonschema.validate(pview, SCHEMA_VIEW)
    (OUT / "views" / f"{pview['id']}.json").write_text(json.dumps(pview, separators=(",", ":")))
    for e in pentries:
        jsonschema.validate(e, SCHEMA_ENTRY)
        (OUT / "entries" / f"{e['id']}.json").write_text(json.dumps(e, separators=(",", ":")))
    for x in pview["structures"]:
        shutil.copyfile(RAW / f"{x['pdb']}.cif", OUT / "structures" / f"{x['pdb']}.cif")
    pe = pentries[0]
    row = {"id": pe["id"], "name": pview["name"], "title": pe["title"], "method": "HDX-MS (peptide)",
           "samples": len(pe["hdx"]["samples"]), "constructs": [s["id"] for s in pe["hdx"]["samples"]],
           "structures": [{"pdb": x["pdb"], "entry": x["entry"], "state": x["state"]} for x in pview["structures"]],
           "raw": f"PRIDE {build_peptide.PRIDE}"}
    print(f"{pview['id']:10s} {pview['name']:16s} entries={[e['id'] for e in pentries]} peptides={len(pview['peptides'])}")
    # the front page lists proteins by UniProt accession; each lists its HDX-MS entries
    proteins: dict[str, dict] = {}
    proteins.setdefault(protein["uniprot"], protein | {"entries": []})["entries"].append(row)
    # intact-protein mHDX-MS (natural domains, Ferrari et al. 2026)
    import build_intact
    for view, entry, protein in build_intact.build(REVISION):
        jsonschema.validate(view, SCHEMA_VIEW)
        jsonschema.validate(entry, SCHEMA_ENTRY)
        (OUT / "views" / f"{view['id']}.json").write_text(json.dumps(view, separators=(",", ":")))
        (OUT / "entries" / f"{entry['id']}.json").write_text(json.dumps(entry, separators=(",", ":")))
        sample = entry["hdx"]["samples"][0]
        proteins.setdefault(protein["uniprot"], protein | {"entries": []})["entries"].append(
            {"id": entry["id"], "name": view["name"], "title": entry["title"], "method": "mHDX-MS (intact protein)",
             "samples": 1, "constructs": [f"{sample['library']}, {'+'.join(sample['pH_labels'])}"],
             "structures": [], "raw": f"PRIDE {build_intact.PRIDE}"})
        raw_n = sum(1 for a in entry["artifacts"] if a["level"] == "L0")
        print(f"{view['id']:14s} {view['name']:40s} entry={entry['id']} raw_files={raw_n}")
    for f in ("hdx_entry.v0.2.json", "hdx_view.v0.2.json"):
        shutil.copyfile(ROOT / "schema" / f, OUT / "schema" / f)
    listed = sorted(proteins.values(), key=lambda p: p["uniprot"])
    (OUT / "index.json").write_text(json.dumps({"schema_version": VERSION, "proteins": listed}, indent=2) + "\n")
    print(f"index: {len(listed)} proteins, {sum(len(p['entries']) for p in listed)} HDX entries")


if __name__ == "__main__":
    main()
