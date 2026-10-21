# Prism HDX entries (prototype)

A registry-style view of hydrogen-deuterium exchange (HDX) data in which every displayed
value is traced to its archived source file. Built for the Prism project (Astera
Institute) as a first test of how HDX-MS could sit alongside Dynamic PDB.

Status: prototype, schemas `0.2.0` (draft). Six proteins: 11 HDX entries (10 intact-protein
mHDX-MS or HDX-NMR, 1 peptide-level HDX-MS) and 8 reference-structure entries. Field names
follow the Dynamic PDB schema v0.2.0 (2026-10-16); HDX additions are listed per record.

## The problem

HDX-MS reports how fast backbone amides exchange with solvent, which measures local
stability and flexibility. The data for one protein is usually scattered:

- raw spectra in PRIDE,
- processed tables in Zenodo or a supplement,
- analysis code on GitHub,
- the structure in the PDB.

Nothing ties these together per protein, so results are hard to reuse, compare across
methods, or audit. The agreed direction (see `planning-hdx-ms-data-repo.md`) is:

- do not build new storage; raw data stays in **PRIDE** and is cited by file;
- build a **protein-rooted analysis and visualization layer** on top;
- start from a **draft metadata format** and refine it with real data.

## The proteins

Five de novo miniproteins from Ferrari et al. (Nature, 2026). Each has mHDX-MS data, HDX-NMR
data, and a PDB structure whose sequence is identical to its 6xHis HDX-NMR construct
(checked by sequence against Dataset_4 and RCSB).

| Protein | PDB | HDX-NMR measurements | mHDX-MS (Dataset_3 row, library, pH) |
| --- | --- | --- | --- |
| EEHEE_rd4_0642 | [8SKE](https://www.rcsb.org/structure/8SKE) | 6xHis ×2 + mean; No-His ×1 | 214, mutants04, pH6 |
| EEHEE_rd4_0871 | [8SKD](https://www.rcsb.org/structure/8SKD) | 6xHis ×2 + mean; No-His ×3 + mean | 85, Lib14, pH6 |
| HHH_rd4_0518 | [8SKX](https://www.rcsb.org/structure/8SKX) | 6xHis ×1; No-His ×2 + mean | 49, Lib09, pH6 + pH9 merged |
| HEEH_rd4_0097 | [5UYO](https://www.rcsb.org/structure/5UYO) | 6xHis ×1 | 12, Lib09, pH6 |
| EHEE_rd2_0005 | [8SHM](https://www.rcsb.org/structure/8SHM) | 6xHis ×2 + mean | 285, Lib11, pH6 + pH9 merged |

| Source | Identifier | License | Used for |
| --- | --- | --- | --- |
| PRIDE | [PXD061702](https://www.ebi.ac.uk/pride/archive/projects/PXD061702) | CC0 | Raw mHDX-MS data: 1,183 mzML files, cited per file |
| Zenodo | [10.5281/zenodo.14983481](https://doi.org/10.5281/zenodo.14983481) | CC-BY-4.0 | Dataset_3 (mHDX-MS), Dataset_4 (HDX-NMR) |
| PDB | 8SKE, 8SKD, 8SKX, 5UYO, 8SHM | CC0 | Reference structures (20-model NMR ensembles) |
| GitHub | [Rocklin-Lab](https://github.com/Rocklin-Lab) `mhdx_pipeline`, `hdxrate_pipeline`, `mhdx_analysis` | see repos | Analysis code, pinned by commit |

## Peptide-level HDX-MS: E. coli DHFR

Ferrari et al. measure intact proteins, so their data has no peptides. Most HDX-MS work is
peptide-level, so the prototype also holds one peptide-level entry: *E. coli* DHFR in apo,
methotrexate (MTX) and trimethoprim (TMP) states, from the Glasgow lab (Lu et al., *Nat. Chem.
Biol.* 2026; PRIDE [PXD057539](https://www.ebi.ac.uk/pride/archive/projects/PXD057539), CC0;
HXMS files from the supplement of Weber et al., *Bioinformatics* 2026). Reference structures:
[5DFR](https://www.rcsb.org/structure/5DFR) (apo), [1RG7](https://www.rcsb.org/structure/1RG7)
(MTX), [6XG5](https://www.rcsb.org/structure/6XG5) (TMP).

| Level | Holds | Run and parameters |
| --- | --- | --- |
| L0 | 5 raw Bruker `.d` archives (with fully deuterated controls); 13 MS/MS `.mgf` files | PRIDE, cited per file |
| L1a peptide identification | 11 peptide lists (raw and curated "CLEANED"); 314 peptides, 165 of 174 construct residues | Compass DataAnalysis 5.1 + Biotools 3.2: no enzyme, 30 ppm, 0.020 Da MS/MS, 20 partials (PRIDE protocol) |
| L1b uptake | 3 HXMS files (state × time × replicate × peptide, per charge state, with envelopes) | PIGEON + HDExaminer + PFLink (authors); **charge states merged here** (intensity-weighted); times grouped within 15% |
| L1c controls | fully deuterated controls (`TIME = inf`) | in the HXMS files |
| L1d corrected uptake | D_corr = D / D_FD × N_ex; uncorrected values kept, with a toggle on the uptake plot | computed here (`r_correct`) |
| L1 reproducibility | replicate SD per peptide and time; median 0.06 to 0.08 Da per state | computed here (`r_repro`) |
| L2 differential | per-peptide classes (more rigid, more flexible, mixed, no observable difference, not tested) and residue projection | computed here (`r_diff`): hybrid test (Welch p < 0.01 and \|ΔD\| > global limit, Hageman & Weis 2019), same-day replicates only |
| L3 mapping to structural models | residue classes on 5DFR, 1RG7, 6XG5 via sequence alignment; mismatches recorded | computed here (`r_map`) |

Results, exploratory and dependent on the parameters above:

- **APO vs TMP** (4 paired replicates, limit 0.37 Da): 66 peptides more rigid with TMP, none
  more flexible.
- **APO vs MTX** (2 paired replicates, limit 1.26 Da): 2 peptides more rigid (residues 10 to
  17 and 50 to 62); 260 peptides not tested. Two paired replicates give low power.
- 6XG5 differs from the HDX construct at residue 37 (N vs D) and also contains NADPH; both
  are noted on its entry.

## Data model

Per protein there are three **entries**, each one experimental context as in Dynamic PDB
v0.2.0 (`method` is a single field):

| Entry | Polymer entities | Samples (`hdx.samples`) | Models |
| --- | --- | --- | --- |
| mHDX-MS | the mHDX-MS construct | library, pH labels, 32 to 62 labeling times | hdxrate_pipeline fit: sorted site ΔG (`HDX ΔG set`) |
| HDX-NMR | 6xHis and/or No-His constructs | one per measurement, with its own pH, temperature and buffer; means list the rows they average | per-residue ΔG, k_obs, k_int (`HDX ΔG set`) |
| Reference structure | the deposited sequence | none | Deposited model, `purpose: Reference` |

- **Constructs are polymer entities, not separate entries.** Mutations would use
  `mutations[]` (none added yet).
- **The structure is its own entry.** v0.2.0 keeps `external_refs.pdb` unique across
  active entries, so HDX entries cannot claim the PDB ID. HDX-NMR residue data instead
  name the structure model as their `residue_frame`.
- **Residue data use `label_*` keys** (`label_asym_id`, `label_seq_id`, `label_comp_id`)
  with `auth_*` kept, as v0.2.0 specifies.
- **Cross-entry views are derived, not declared.** Entries whose polymer-entity
  sequences are contained in the same structure sequence form one view
  (`views/view_<pdb>.json`). The Explore tab draws the view; the other tabs describe one
  entry's record.
- **IDs:** `hdx_` + 8 characters per entry, derived from a stable key so rebuilds keep them;
  models `<entry>_m_NNN` as in v0.2.0.

Levels follow v0.2.0: L0 raw files (PRIDE mzML; the NMR spectra are not located), L1
processed files (Dataset_3, Dataset_4), L2 interpretations (the ΔG sets and the deposited
model), L3 evaluations (agreement metrics computed here).

### Extensions to Dynamic PDB v0.2.0

Each entry lists the fields or values it uses that v0.2.0 does not define:

- `hdx.samples`: an HDX experimental block, modeled on `crystallography.crystals[]`.
- `model_type: "HDX ΔG set"`: an L2 interpretation without coordinates.
- `site_data`: values for exchanging sites not assigned to residues (mHDX-MS).
- Residue-data keys `dg`, `kobs`, `kint`, `logpf`, `too_slow`; metric keys `dg_max`,
  `cooperativity`, `fit_rmse`, `idotp_max`, `backexchange_final` and others.
- `residue_frame`: the reference model whose numbering the residue data use.
- Run input/output `selector` (fields and rows within a shared multi-row file).
- `undeclared_inputs`: a source with no URI, which v0.2.0 cannot register as an artifact.

### Rules kept

- **Absent is absent.** Unmeasured residues are `null`, never 0.
- **No winning model.** The deposited structure is a reference for comparison and residue
  numbering, not ground truth.
- **Every file gets a SHA-256** (`sources.lock.json`), except the PRIDE mzML files: PRIDE
  lists no checksum and the 1 GB files were not downloaded.

## How to use it

Requirements: macOS or Linux, conda (or mamba), and an internet connection for the
first fetch (about 300 MB).

```zsh
conda env create -f environment.yml
conda activate hdx-data-repo

# one manual file: the journal blocks scripted downloads. Save the "Supplementary data" zip
# of Weber et al. 2026 (Bioinformatics, doi:10.1093/bioinformatics/btag113) as
# ~/Downloads/btag113_supplementary_data.zip; fetch.py checks it against its pinned SHA-256.
python pipeline/fetch.py            # download sources, write sources.lock.json
python pipeline/build_entries.py    # build web/public/{index.json, entries/, views/, structures/}

cd web
npm ci
npm run dev                         # http://localhost:5173
# or: npm run build && npx vite preview
```

The built site (`web/dist/`) is static. Routes:

- `#/` the 11 HDX entries
- `#/entry/<hdx_id>/<tab>`; tabs: Explore (cross-entry view), Overview, Models, Downloads.
  `#/entry/<hdx_id>/provenance` opens the Overview tab at its Provenance section.

### What the entry page shows

- **Linked entries** of the same view, in the header.
- **Explore:** Mol\* structure colored by per-residue ΔG, log protection factor, predicted
  deuteration at time *t*, or secondary structure; a ΔG threshold; sequence lanes (from
  hetstar); sorted-ΔG, uptake, isotope-distribution, chiclet, butterfly and ΔΔG plots.
  Hover and selection are shared between the structure, lanes and residue plots.
- **Overview,** in order: method, metrics and the schema extensions used; a Provenance
  section (the run graph of the linked entries, with this entry's nodes tinted, and the
  entry's artifacts, including the PRIDE raw files with FTP links); polymer entities;
  samples; and a table of where each value comes from.
- **Models:** the entry's models; for intact-protein HDX entries, the exploratory
  cross-method comparison with the linked entry.
- **Per-value provenance:** every metric, plot and structure coloring has a source line
  (file · field · row) and a tier, *copied* or *computed here*. It opens a card with the
  input files and checksums, the run chain at pinned commits, any operation applied here
  with its code location, a `jq` check command, and whether regeneration from raw data is
  possible or the raw input was not found.

## Repository layout

```
environment.yml               conda environment (Python 3.12, Node 20)
sources.lock.json             URL, SHA-256, size and license of every input; pinned commits
schema/hdx_entry.v0.2.json    entry record schema (Dynamic PDB v0.2.0 names + extensions)
schema/hdx_view.v0.2.json     cross-entry view schema (derived display record)
pipeline/fetch.py             downloads sources into data/raw/ (git-ignored)
pipeline/build_entries.py     builds entries and views, validates both, writes web/public/
pipeline/build_peptide.py     peptide-level HDX-MS (ecDHFR): charge merging, correction, test, projection
web/                          Vite + React 18 + TypeScript + Tailwind + Mol* 5.11 + Plotly
  src/vendor/hetstar/         code copied and trimmed from hetstar (each file says what changed)
  src/hdx/                    HDX-specific viewer code
  src/pages/                  entry list (Browse.tsx) and entry page
  public/                     generated data the site serves
out-of-date/                  earlier integration guide and figures (superseded)
```

## How it was developed

- Developed in October 2026 from `planning-hdx-ms-data-repo.md`.
- Field names in Zenodo Dataset_3 and Dataset_4 were read from the files. Units are not
  documented there: exchange rates are treated as s⁻¹ and Dataset_3 `rates_*` as
  natural-log rates, consistent with the reported ΔG.
- **Dataset_4 means are not replicate means.** Each per-construct "mean" row was matched,
  by recomputation (maximum error 7 × 10⁻¹¹), to the rows it averages. Three average
  measurements under different conditions: EEHEE_rd4_0871 No-His (293, 278, 293 K),
  HHH_rd4_0518 No-His (278, 293 K), EHEE_rd2_0005 6xHis (pH 6.54 and 7.54). The site calls
  each row a *measurement*, shows "mixed" conditions for such means, and says when a ΔΔG
  spread includes condition effects.
- Two mHDX-MS rows (HHH_rd4_0518, EHEE_rd2_0005) have no pH value; `merge_exp` and
  `pH_index` show merged pH 6 and pH 9 series. Their uptake plots show one series per pH.
- PRIDE file names encode library, pH, labeling time and replicate. Dataset_3 library
  `mutants04` is assumed to be PRIDE `mut04`; this mapping is inferred, not documented.
- The L3 metrics compare sorted mHDX-MS ΔG with the sorted ΔG of the closest HDX-NMR
  construct over the top-k sites, matched by rank. They are exploratory and computed here.
- The viewer adapts [hetstar](https://github.com/rtviii/hetstar) by rtviii (commit
  `fc08cdb`), the heterogeneity viewer used in Dynamic PDB. Files were copied, not forked,
  with Prism-internal permission; each copied file names its source path and changes.

### Verification done

- `fetch.py` run twice gives identical hashes.
- Every entry and view passes its JSON Schema (checked in `build_entries.py`).
- Spot checks against raw files: EEHEE_rd4_0642 residue 24 (6xHis measurement 1) ΔG
  3.1937; EEHEE_rd4_0871 No-His measurement 2 residues V24, H25, V26, V29 match Dataset_4
  row 11 in value and residue identity; EHEE_rd2_0005 ΔG max 9.1826 matches Dataset_3.
- Brave (headless): all 5 tabs of all 19 entries load with no console errors; selecting a
  peptide shows its uptake curves, and the back-exchange toggle switches between
  corrected and uncorrected values.
- The HXMS supplement and the three ecDHFR files are pinned by SHA-256.

## Scaling path (not built)

- **More proteins.** Add a protein to `PAGES` with a structure whose sequence contains
  its constructs. Dataset_3 has 3,590 proteins; mutants (e.g. EEHEE_rd4_0871_K31L_E36V)
  would be polymer entities with `mutations[]`.
- **Peptide-level HDX-MS.** The continuous-labeling workflow fits the same entry shape:
  L1 a DynamX or HXMS uptake table, L2 residue-level ΔD or ΔG from peptide overlap.
- **Reproducible filters.** A reader's quality thresholds become a recorded run.
- **Deposition.** An agent drafts the entry from a paper's methods section; PRIDE stays
  the storage of record.

## Open questions

Decisions for the Dynamic PDB v0.2.0 open-decision list:

1. Can an L2 model be a ΔG set without coordinates, or should HDX values be residue data
   on the reference model?
2. Definitions and producing software for HDX metric and residue keys.
3. The HDX experimental block: pH or pD, temperature, buffer, labeling times, quench,
   back-exchange correction.
4. One level for a file holding processed data and fit results (Dataset_3, Dataset_4).
5. Raw-data identity: SHA-256 for PRIDE files, and how to declare a source with no URI.
6. Mutation numbering (design vs construct), already open in v0.2.0.

Peptide-level questions:

- License of the *Bioinformatics* supplement (the preprint is CC BY 4.0); until confirmed,
  the HXMS files are not redistributed here, only values derived from them.
- FEATHER ΔGop (the authors' residue-level analysis) as a peer L2 model: the source data
  were not retrieved.
- Thresholds of the authors' envelope processing (HDExaminer) and PFLink versions are not
  stated; exclusion range lists are not in the deposition for ecDHFR.

Data questions:

- How were measurements at different temperatures or pH combined into one ΔG mean?
- Where are the HDX-NMR spectra deposited, if anywhere?
- PRIDE lists PXD061702 as "Top-down proteomics"; 8SKE `_exptl.method` says solid-state
  NMR while its experiment details describe solution NMR.
- hetstar has no LICENSE file; ask rtviii to add one for the record.

## Citation and license

Data: Ferrari et al., *Large-scale discovery, analysis, and design of protein energy
landscapes*, Nature (2026), doi:10.1038/s41586-026-10465-z. Derived data here is
CC-BY-4.0 following the Zenodo release; structure copies are CC0.
