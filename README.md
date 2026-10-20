# Prism HDX entries (prototype)

A protein-rooted, PDB-style view of hydrogen-deuterium exchange (HDX) data, with
provenance from every plotted value back to the archived source files. Built for the
Prism project (Astera Institute) as a first test of how HDX-MS could sit alongside
Dynamic PDB.

Status: prototype, schema `0.0.1` (rough draft). A front page listing HDX-MS entries,
and one full entry page so far.

## The problem

HDX-MS reports how fast backbone amides exchange with solvent, which measures local
stability and flexibility. The data for one protein is usually scattered:

- raw spectra in PRIDE,
- processed uptake tables in Zenodo or a supplement,
- analysis code on GitHub,
- the structure in the PDB.

Nothing ties these together per protein. Results are therefore hard to reuse, compare
across methods, or audit. The agreed direction (see `planning-hdx-ms-data-repo.md`) is:

- do not build new storage; raw data stays in **PRIDE** and is cited by accession;
- build a **protein-rooted analysis and visualization layer** on top;
- start from a **rough-draft metadata format** and refine it with real data.

This repository is that first test.

## The test sample

`EEHEE_rd4_0642`, a 64-residue de novo miniprotein from Ferrari et al. (Nature, 2026).
It connects all four archives:

| Source | Identifier | License | Used for |
| --- | --- | --- | --- |
| PRIDE | [PXD061702](https://www.ebi.ac.uk/pride/archive/projects/PXD061702) | CC0 | Raw mHDX-MS spectra (referenced, not copied) |
| Zenodo | [10.5281/zenodo.14983481](https://doi.org/10.5281/zenodo.14983481) | CC-BY-4.0 | Dataset_3 (mHDX-MS), Dataset_4 (HDX-NMR) |
| PDB | [8SKE](https://www.rcsb.org/structure/8SKE) | CC0 | NMR structure, 20 models |
| GitHub | [Rocklin-Lab](https://github.com/Rocklin-Lab) `mhdx_pipeline`, `hdxrate_pipeline`, `mhdx_analysis` | see repos | Analysis code, pinned by commit |

It has two independent readings of the same stability landscape:

- **mHDX-MS** measures the whole protein at once: 32 timepoints of isotope
  distributions, fitted to 42 sorted exchange rates and ΔG values. It cannot say which
  residue each value belongs to.
- **HDX-NMR** measures each residue: ΔG, exchange rate and intrinsic rate for two
  constructs (6xHis, two replicates plus their mean; No-His, one replicate), all at
  pH 6.3, 293 K, MES.

8SKE's sequence is identical to the 6xHis construct. The No-His construct starts at
residue 18 and the mHDX-MS construct at residue 20.

## Data model

Dynamic PDB's model is used loosely. One protein is one entry, and every
interpretation of its exchange data is a peer.

| Dynamic PDB | Here | Example |
| --- | --- | --- |
| Entry | Protein construct + measurements | `hdx_z917r9ih` (EEHEE_rd4_0642) |
| L0 Source | Raw instrument files, referenced | PRIDE `.raw`; NMR spectra (location not stated) |
| L1 Processed | Isotope distributions per timepoint | Dataset_3 fields `exp_distribution`, `true_time` |
| L2 Interpreted | ΔG landscapes and structures | mHDX-MS fit, HDX-NMR per-residue ΔG, PDB 8SKE |
| L3 Evaluated | Agreement between interpretations | sorted-landscape RMSD, computed here |
| Run | One software step with inputs and outputs | `mhdx_pipeline`, `hdxrate_pipeline`, this build |

Rules kept from Dynamic PDB:

- **Absent is absent.** Prolines, the N-terminus and unmeasured amides are `null`, never 0.
- **No winning model.** The deposited structure is one interpretation among others.
- **Declare sources you do not hold.** The NMR spectra appear as an L0 artifact with
  no URI, so the gap is visible.
- **Every file gets a SHA-256** (`sources.lock.json`).
- **Opaque IDs.** `hdx_` + 8 characters, derived from the protein name so rebuilds are stable.

Deviation, logged as an open question: Dynamic PDB defines L2 as *atomic* models. Here
L2 also holds ΔG landscapes.

## How to use it

Requirements: macOS or Linux, conda (or mamba), and an internet connection for the
first fetch (about 290 MB).

```zsh
conda env create -f environment.yml
conda activate hdx-data-repo

python pipeline/fetch.py            # download sources, write sources.lock.json
python pipeline/build_entries.py    # build web/public/{index.json, entries/, structures/}

cd web
npm ci
npm run dev                         # http://localhost:5173
# or: npm run build && npx vite preview
```

The built site (`web/dist/`) is static and can be served from any host. Routes:

- `#/` the list of HDX-MS entries; click one to open it
- `#/entry/hdx_z917r9ih` the full entry; tabs: Explore, Overview, Interpretations,
  Provenance, Downloads

### What the entry page shows

- **Mol\* structure** colored by per-residue ΔG, log protection factor, predicted
  deuteration at time *t*, or secondary structure. Grey means not measured.
- **ΔG threshold slider.** Keep only sites at least X kcal/mol stable. This shows which
  parts of the fold open last, and how many mHDX-MS sites reach the same stability.
- **Time cursor.** Predicted deuteration per residue, D = 1 − e^(−k·t), from the NMR
  rates. The cursor is shared with the mHDX-MS uptake plot.
- **Sequence lanes** (from hetstar): sequence, secondary structure, construct coverage,
  ΔG per condition, deuteration at *t*.
- **Plots:** sorted energy landscape (mHDX-MS vs HDX-NMR), uptake curve, isotope
  distributions over time, chiclet heatmap, butterfly, and a Woods-style ΔΔG plot with
  replicate noise.
- Hover or click a residue anywhere and the structure, lanes and residue plots follow.
- **Per-value provenance.** Every metric, plot and structure coloring has a source line
  (file · field · row) with a tier: *copied* (verbatim from an archived file) or
  *computed here* (derived by this repository). Clicking it opens a card with the input
  files and checksums, the upstream run chain at pinned commits, any operation applied
  here with its code location, a copyable reproduce command (`jq` check), and whether
  regeneration from raw data is possible or the raw input was not found. The Overview tab lists all of them
  in one table. The records are the `derivations` list in each entry JSON.

## Repository layout

```
environment.yml               conda environment (Python 3.12, Node 20)
sources.lock.json             URL, SHA-256, size and license of every input; pinned commits
schema/hdx_entry.v0.json      entry JSON Schema, draft 0.0.1
pipeline/fetch.py             downloads sources into data/raw/ (git-ignored)
pipeline/build_entries.py     joins sources, validates entries, writes web/public/
web/                          Vite + React 18 + TypeScript + Tailwind + Mol* 5.11 + Plotly
  src/vendor/hetstar/         code copied and trimmed from hetstar (each file says what changed)
  src/hdx/                    HDX-specific viewer code
  src/pages/                  entry list (Browse.tsx) and entry page
  public/                     generated data the site serves
out-of-date/                  earlier integration guide and figures (superseded)
```

## How it was developed

- Developed in October 2026 from `planning-hdx-ms-data-repo.md`.
- Field names in Zenodo Dataset_3 and Dataset_4 were read from the files themselves.
  Units were not documented in the files: exchange rates are treated as s⁻¹ and
  Dataset_3 `rates_*` as natural-log rates, consistent with the reported ΔG.
- Dataset_4 rows 4 and 6 are the two 6xHis replicates; row 37 is their mean (checked
  value by value). Row 33 repeats row 5 and is dropped.
- Dataset_3 is one file at two levels, so it appears as two artifacts (`a_d3_iso` L1,
  `a_d3_fit` L2) with the same URI and the fields each covers.
- The L3 metrics compare the sorted mHDX-MS landscape with the No-His NMR landscape (the
  closest construct) over the top-k sites. They are sketches computed here, not
  published values.
- The viewer adapts [hetstar](https://github.com/rtviii/hetstar) by rtviii (commit
  `fc08cdb`), the heterogeneity viewer used in Dynamic PDB. Files were copied, not
  forked, with Prism-internal permission. Each copied file names its source path and
  changes.

### Verification done

- `fetch.py` run twice gives identical hashes.
- Every entry passes `schema/hdx_entry.v0.json` (checked in `build_entries.py`).
- Spot checks against raw Dataset_4: residue 24 (6xHis r1) ΔG 3.1937 and residue 43
  (6xHis mean) ΔG 5.74 match the page and the lanes.
- Headless Chromium and Brave: the entry list and entry page load with no console errors; hover syncs
  lanes and 3D; threshold and time modes recolor; layout holds at 390 px width.

## Scaling path (not built)

- **More entries.** Add a protein to `PAGES` in `pipeline/build_entries.py` and it gets
  a page and a row on the front page. Dataset_3 has 3,590 proteins; AlphaFold models (Zenodo Dataset_9) fill in structure where no PDB exists,
  labeled as predicted.
- **Peptide-level HDX-MS.** The classic continuous-labeling workflow fits the same
  schema: L1 becomes a DynamX or HXMS uptake table, L2 a residue-level ΔD or ΔG from
  peptide overlap, and HaDeX2-style plots (Woods, volcano, uptake curves) become native lanes.
- **Reproducible filters.** A reader's quality thresholds become a recorded run, so a
  shared link reproduces the filtered view.
- **Deposition.** An agent drafts the entry from a paper's methods section and asks
  only for what it cannot find. PRIDE stays the storage of record.
- **Dynamic PDB.** The viewer shares hetstar's stack, so it can move into the
  dynamic-pdb website later.

## Open questions

- Should ΔG landscapes count as Dynamic PDB L2, or need their own representation?
- PRIDE lists PXD061702 as "Top-down proteomics"; worth a curation note to PRIDE.
- 8SKE `_exptl.method` says solid-state NMR, while the experiment details describe
  solution NMR.
- Where are the HDX-NMR spectra deposited, if anywhere?
- hetstar has no LICENSE file; ask rtviii to add one for the record.

## Citation and license

Data: Ferrari et al., *Large-scale discovery, analysis, and design of protein energy
landscapes*, Nature (2026), doi:10.1038/s41586-026-10465-z. Derived data here is
CC-BY-4.0 following the Zenodo release; the 8SKE copy is CC0.
