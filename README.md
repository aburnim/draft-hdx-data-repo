# Prism HDX entries (prototype)

A registry-style view of hydrogen-deuterium exchange (HDX) data in which every displayed
value is traced to its archived source file. Built for the Prism project (Astera
Institute) as a first test of how HDX-MS could sit alongside Dynamic PDB.

Status: prototype, schemas `0.2.0` (draft). The registry covers HDX-MS only, peptide-level
and intact-protein. Five proteins: *E. coli* DHFR (1 peptide-level HDX-MS entry and 3
reference-structure entries) and 4 natural domains with intact-protein mHDX-MS (pilot,
1 entry each). Field names
follow the Dynamic PDB schema v0.2.0 (2026-10-16); HDX additions are listed per record.

## The problem

HDX-MS reports how fast backbone amides exchange with solvent, which measures local
stability and flexibility. The data for one protein is usually scattered:

- raw spectra in PRIDE,
- processed tables in a supplement or a data repository,
- analysis code on GitHub,
- the structure in the PDB.

Nothing ties these together per protein, so results are hard to reuse, compare across
studies, or audit. The agreed direction (see `planning-hdx-ms-data-repo.md`) is:

- do not build new storage; raw data stays in **PRIDE** and is cited by file;
- build a **protein-rooted analysis and visualization layer** on top;
- start from a **draft metadata format** and refine it with real data.

## The data: E. coli DHFR, peptide-level HDX-MS

One peptide-level HDX-MS entry: *E. coli* DHFR in apo, methotrexate (MTX) and trimethoprim
(TMP) states, from the Glasgow lab (Lu et al., *Nat. Chem. Biol.* 2026; PRIDE
[PXD057539](https://www.ebi.ac.uk/pride/archive/projects/PXD057539), CC0; HXMS files from
the supplement of Weber et al., *Bioinformatics* 2026). Reference structures:
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
| L3 ligand contacts | residues within 4 Å of each ligand in each reference structure (MTX in 1RG7; TMP and NADPH in 6XG5), in construct positions | computed here (`r_contacts`); water, chloride and glycerol excluded |

Results, exploratory and dependent on the parameters above:

- **APO vs TMP** (4 paired replicates, limit 0.37 Da): 66 peptides more rigid with TMP, none
  more flexible.
- **APO vs MTX** (2 paired replicates, limit 1.26 Da): 2 peptides more rigid (residues 10 to
  17 and 50 to 62); 260 peptides not tested. Two paired replicates give low power.
- At UniProt residue 37 (construct residue 52), the HDX construct, 5DFR and 1RG7 have D;
  UniProt P0ABQ4 (strain K-12) and 6XG5 have N. 6XG5 also contains NADPH. Both
  differences are recorded on the entries.

## The data: intact-protein mHDX-MS of natural domains (pilot)

Four natural domains from Ferrari et al. (*Nature* 2026; Zenodo
[10.5281/zenodo.14983481](https://doi.org/10.5281/zenodo.14983481) Dataset_3, CC-BY-4.0; PRIDE
[PXD061702](https://www.ebi.ac.uk/pride/archive/projects/PXD061702), CC0). Of 3,590 proteins in
Dataset_3, 1,637 are natural domains named `<UniProt>.<version>_<start>-<end>`; the pilot takes
the 4 whose UniProt entries are reviewed.

| Domain | UniProt | Family (Dataset_3 `PF`) | Library, pH | Raw mzML files |
| --- | --- | --- | --- | --- |
| YgeR 42-84, *E. coli* | Q46798 | LysM | Lib09, pH 6 | 34 |
| Smurf1 169-198, *D. melanogaster* | Q9V853 | WW | Lib08, pH 6 + pH 9 merged | 67 |
| NEDD4L 528-557, mouse | Q8CFI0 | WW | Lib11, pH 6 | 34 |
| WWP2 446-475, mouse | Q9DBH0 | WW | Lib13, pH 6 + pH 9 merged | 68 |

- **What intact data show:** isotope distributions over time, uptake (centroid), and sorted
  site ΔG from the authors' rate fit. Sites are ranks, not residues, so there is no
  structure coloring and there are no residue lanes.
- **Identity check:** each measured sequence is HM + UniProt residues start..end; the build
  fails if the alignment differs. The origin of HM is not stated.
- **Raw files:** the experiment is multiplexed, so each mzML file holds a whole library and is
  cited by every domain in it.

## Data model

Each **entry** is one experimental context, as in Dynamic PDB v0.2.0 (`method` is a single
field):

| Entry | Polymer entities | Samples (`hdx.samples`) | Models |
| --- | --- | --- | --- |
| HDX-MS (peptide level) | the HDX construct (His-tag + TEV site + ecDHFR, 174 residues) | one per ligand state, with replicate ids, pH(read), temperature and D2O saturation | per-peptide and per-residue differential classes (`HDX differential set`) |
| Reference structure | the deposited sequence | none | Deposited model, `purpose: Reference` |

- **Constructs are polymer entities, not separate entries.** Mutations would use
  `mutations[]` (none added yet).
- **Each structure is its own entry.** v0.2.0 keeps `external_refs.pdb` unique across
  active entries, so the HDX entry cannot claim a PDB ID. Its model instead names a
  structure model as its `residue_frame`.
- **Residue data use `label_*` keys** (`label_asym_id`, `label_seq_id`, `label_comp_id`)
  with `auth_*` kept, as v0.2.0 specifies.
- **Cross-entry views are derived, not declared.** Entries whose sequences align to the same
  HDX construct form one view (`views/view_ecdhfr.json`). The Explore tab draws the view;
  the other tabs describe one entry's record.
- **Proteins are identified by UniProt.** The front page lists proteins by accession. The
  accession is checked against each reference structure (`_struct_ref`); the name, gene and
  organism come from the pinned UniProt record. The construct is aligned to the UniProt
  sequence, and the mapping and mismatches are stored in `uniprot_mappings`.
- **IDs:** `hdx_` + 8 characters per entry, derived from a stable key so rebuilds keep them;
  models `<entry>_m_NNN` as in v0.2.0.

### Extensions to Dynamic PDB v0.2.0

Each entry lists the fields or values it uses that v0.2.0 does not define:

- `hdx.samples`: an HDX experimental block, modeled on `crystallography.crystals[]`.
- `hdx.peptide_map`: peptide count and coverage, with the identification run.
- `model_type: "HDX differential set"`: per-peptide and per-residue classes without coordinates.
- `residue_frame`: the reference model whose numbering the residue data use.
- Run `parameters` for runs done here (charge merging, time grouping, FD correction, hybrid
  test, projection, mapping).
- Run input/output `selector` (fields and rows within a shared multi-row file).

### Rules kept

- **Absent is absent.** Unmeasured residues are `null`, never 0.
- **No winning model.** The deposited structure is a reference for comparison and residue
  numbering, not ground truth.
- **Every file gets a SHA-256** (`sources.lock.json`), except the PRIDE raw and
  identification files: PRIDE lists no checksum and the files (up to 27 GB each) were not
  downloaded.

## How to use it

Requirements: macOS or Linux, conda (or mamba), and an internet connection for the
first fetch (about 305 MB; Dataset_3 is 286 MB).

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

- `#/` proteins by UniProt accession
- `#/protein/<accession>` one protein and its HDX-MS entries
- `#/entry/<hdx_id>/<tab>`; tabs: Explore (cross-entry view), Overview, Models, Downloads.
  `#/entry/<hdx_id>/provenance` opens the Overview tab at its Provenance section.

### What the entry page shows

- **Reference structures** in the header: on the HDX entry, one per state; on a structure
  entry, the HDX entry and state it is the reference for.
- **Explore:** Mol\* structure colored by differential class, ΔD per amide, or coverage; a
  structure selector; sequence lanes (from hetstar), including one ligand contact lane per
  ligand and reference structure, drawn on the displayed structure; peptide map, uptake (with a
  back-exchange correction toggle), Woods, volcano, ΔD chiclet and reproducibility plots;
  an identification panel.
- **Overview,** in order: method, metrics and the schema extensions used; a Provenance
  section (the run graph of the linked entries, with this entry's nodes tinted, and the
  entry's artifacts, including the PRIDE raw files with FTP links); polymer entities, with
  their UniProt mapping;
  samples; and a table of where each value comes from.
- **Models:** the entry's models.
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
pipeline/build_entries.py     builds the entry list, validates entries and views, writes web/public/
pipeline/build_peptide.py     peptide-level HDX-MS (ecDHFR): charge merging, correction, test, projection
web/                          Vite + React 18 + TypeScript + Tailwind + Mol* 5.11 + Plotly
  src/vendor/hetstar/         code copied and trimmed from hetstar (each file says what changed)
  src/hdx/                    HDX-specific viewer code
  src/pages/                  protein list (Browse.tsx), protein page, entry page
  public/                     generated data the site serves
out-of-date/                  earlier integration guide and figures (superseded)
```

## How it was developed

- Developed in October 2026 from `planning-hdx-ms-data-repo.md`.
- The viewer adapts [hetstar](https://github.com/rtviii/hetstar) by rtviii (commit
  `fc08cdb`), the heterogeneity viewer used in Dynamic PDB. Files were copied, not forked,
  with Prism-internal permission; each copied file names its source path and changes.
- 2026-10-22: the registry was narrowed to HDX-MS. The five Ferrari et al. 2026
  miniproteins (mHDX-MS, HDX-NMR and NMR reference structures) were removed; they remain in
  the git history up to commit `743422c`. The same day, intact-protein mHDX-MS returned as a
  pilot of 4 natural domains with reviewed UniProt entries (HDX-NMR stays out).

### Verification done

- `fetch.py` run twice gives identical hashes.
- Every entry and view passes its JSON Schema (checked in `build_entries.py`).
- Brave (headless), 2026-10-22: all tabs of all 4 entries load with no console errors, in
  `npm run dev` and in a production build.
- Earlier Brave check: selecting a peptide shows its uptake curves, and the back-exchange
  toggle switches between corrected and uncorrected values.
- The HXMS supplement and the three ecDHFR files are pinned by SHA-256.

## Scaling path (not built)

- **More proteins.** Add a peptide-level dataset (an HXMS or DynamX uptake table, with raw
  files in PRIDE) through a builder like `build_peptide.py`.
- **Reproducible filters.** A reader's quality thresholds become a recorded run.
- **Deposition.** An agent drafts the entry from a paper's methods section; PRIDE stays
  the storage of record.

## Open questions

Decisions for the Dynamic PDB v0.2.0 open-decision list:

1. Can an L2 model be a set of HDX values without coordinates (differential classes, ΔG),
   or should HDX values be residue data on the reference model?
2. Definitions and producing software for HDX metric and residue keys.
3. The HDX experimental block: pH or pD, temperature, buffer, labeling times, quench,
   back-exchange correction.
4. One level for a file holding both processed data and fit results.
5. Raw-data identity: SHA-256 for PRIDE files, and how to declare a source with no URI.
6. Mutation numbering (design vs construct), already open in v0.2.0.

Peptide-level questions:

- License of the *Bioinformatics* supplement (the preprint is CC BY 4.0); until confirmed,
  the HXMS files are not redistributed here, only values derived from them.
- FEATHER ΔGop (the authors' residue-level analysis) as a peer L2 model: the source data
  were not retrieved.
- Thresholds of the authors' envelope processing (HDExaminer) and PFLink versions are not
  stated; exclusion range lists are not in the deposition for ecDHFR.

Other:

- Entries without a UniProt accession (de novo designs, fusions, complexes) need a browse
  key; none exist yet.
- The source of the D37 variant in the HDX construct is not stated. The entry records
  `ncbi_taxonomy_id` 562 (*E. coli*); UniProt P0ABQ4 is strain K-12 (taxon 83333).
- hetstar has no LICENSE file; ask rtviii to add one for the record.

## Citation and license

Data: Ferrari et al., *Large-scale discovery, analysis, and design of protein energy
landscapes*, Nature (2026), doi:10.1038/s41586-026-10465-z (Zenodo 14983481, CC-BY-4.0; PRIDE
PXD061702, CC0); Lu et al., *Site-resolved energetic information from HX-MS experiments*, Nat. Chem.
Biol. (2026), doi:10.1038/s41589-025-02049-1 (PRIDE PXD057539, CC0); Weber et al., *HXMS: a
standardized file format for HX-MS data*, Bioinformatics (2026),
doi:10.1093/bioinformatics/btag113 (supplement license unverified). Derived values are
labeled CC-BY-4.0 in the records, pending confirmation of the supplement license. Structure
copies are CC0.
