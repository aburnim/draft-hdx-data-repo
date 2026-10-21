# AGENTS.md

Instructions for AI agents and engineers working in this repository. Read this before
changing code or data. `README.md` describes the project for human readers; this file
records what exists, what remains, and the rules the work must follow.

Status as of 2026-10-20, branch `feature/eehee-prototype` (not merged to `main`).

## What this is

A prototype registry for hydrogen-deuterium exchange (HDX) data, for the Prism project
(Astera Institute). Each entry is one experimental context. Every displayed value is traced
to an archived source file. Raw data is cited in PRIDE, never copied. Field names follow the
Dynamic PDB schema v0.2.0
(`/Users/astera_andy/andy-dev/dynamic-pdb-aab-project-home/docs/schema/2026-10-16 dynamic pdb schema.md`),
with HDX additions listed per record in `extensions`.

## Requirements

### Scientific and data requirements

These come from the project owner and an HDX-MS reviewer. Do not relax them.

- **HDX-centered.** The front page lists HDX entries only (`#/`). Structures are supporting
  entries, reached from HDX entries.
- **One entry per experimental context** (Dynamic PDB v0.2.0: one `method` per entry).
  Constructs are polymer entities; conditions and replicates are samples (`hdx.samples`).
- **IDs use the `hdx_` prefix**, not `dpdb_`. Entry IDs are `hdx_` + 8 base-36 characters
  derived from a stable key (`opaque_id`); models are `<entry>_m_NNN`.
- **Absent is absent.** Unmeasured values are `null`, never 0. Show them as missing.
- **No winning model.** A deposited structure is a reference for comparison and residue
  numbering, not ground truth.
- **Provenance per value.** Every metric, plot and structure coloring has a `derivations`
  record: inputs (artifact, fields, rows), upstream run chain, operation, code location,
  check command, tier (`copied` or `computed`), and raw-data status. If raw input has no
  known location, the site shows "raw input not found" (stored value `blocked`).
- **Corrections never overwrite.** A correction is a separate run with declared
  parameters; uncorrected values stay available and the site can switch between them.
- **Peptide-level levels** (from the reviewer): L0 raw; L1a peptide identification with
  evidence and curation; L1b uptake (state × time × replicate × peptide, charges merged);
  L1c fully deuterated controls or the method used instead; L1d calibrated values as
  separate runs; L1 technical reproducibility; L2 validity filters, statistical tests,
  differential classes and residue projection; L3 mapping to structural models.
- **Wording.** L3 is "mapping to structural models", not "agreement". Dataset_4 rows are
  "measurements", not "replicates": several per-construct means average measurements at
  different temperatures or pH.
- **Exploratory analyses say so.** Anything computed here (L3 cross-method metrics, the
  differential test, projection, corrections) is labeled "computed here" with its
  parameters, and is not presented as validated.

### Writing requirements (site text, captions, README, docs)

Write in the style of scientific documentation: precise, concise, and accessible to readers
with relevant scientific knowledge.

- **Name the object, operation and scope.** Say which data, models, measurements or
  methods a sentence concerns (for example "sorted mHDX-MS ΔG, Dataset_3 row 214", not
  "the landscape").
- **Describe, do not decorate.** Replace conversational phrases, metaphors, slogans and
  editorial commentary with specific descriptions. Substituting more formal vocabulary is
  not enough.
- **Separate observations, interpretations, assumptions and limitations.** Preserve
  uncertainty, but do not add generic caveats.
- **Match verbs to the evidence.** "Explains", "demonstrates" and "validates" need strong
  support; prefer "represents", "compares" or "is consistent with" otherwise.
- **State methodological status directly.** If an analysis is exploratory, say what is
  unvalidated or unstandardized when that is known.
- **Distinguish a reference from a result.** A model can serve as a reference for
  comparison or numbering without being treated as ground truth.
- **Preserve provenance, technical distinctions and qualifications.** Do not invent
  validation, consensus, equivalence, method details, thresholds or software versions;
  write "not stated" or "not recorded".
- **Cut rhetoric.** Remove rhetorical contrasts, personification, motivational framing and
  concluding statements that add no scientific information.
- **Keep sentences short and connected.** Avoid unnecessary jargon, inflated vocabulary and
  excessive passive voice.
- **Flag ambiguity.** If a phrase is scientifically ambiguous, flag it for clarification
  instead of silently assigning a meaning.
- **When revising existing text:** return the revised text followed only by unresolved
  scientific ambiguities, at about the same length or shorter.
- No em dashes; use short sentences instead. Use "Prism" for the project ("DiffUSE" only
  for work before 2026-09-08). No emojis.

#### Project terms

Use these terms consistently in code, records and site text.

| Use | Not | Meaning |
| --- | --- | --- |
| measurement | replicate | A Dataset_4 row. Rows of one construct can differ in temperature or pH, so they are not assumed to be replicates. |
| replicate | | Only for repeated measurements under the same conditions (e.g. same-day HDX-MS runs, `REP` in HXMS). |
| mean of N measurements | mean of replicates | A Dataset_4 per-construct mean; list the rows it averages (`mean_of_rows`). |
| mixed | (a single value) | A condition of a mean whose measurements differ in that condition. |
| not reported | 0, blank | A condition or value the source does not give. |
| no value reported | not measured | A missing per-residue value (the source does not say why). |
| raw input not found | blocked | Regeneration from raw data is not possible because an input has no known location. |
| copied | | A value read verbatim from an archived file. |
| computed here | derived, calculated | A value produced by this repository's code, with a code location and parameters. |
| mapping to structural models | agreement | L3: projecting values onto a structure with a recorded residue mapping. |
| cross-method comparison (exploratory) | agreement, validation | Comparison of mHDX-MS and HDX-NMR ΔG, matched by rank, not by residue. |
| reference structure | true structure, ground truth | A deposited model used for comparison and residue numbering. |
| ΔG (HDX-NMR), sorted site ΔG (mHDX-MS) | energy landscape (as a measured quantity) | Whether ΔG is an unfolding or a local opening free energy is unresolved; do not assert either. |
| more rigid / more flexible / no observable difference | protected, stabilized | Differential classes from the hybrid test; they depend on the declared parameters. |

### Code and repository requirements

- Make file changes only with the owner's explicit permission. Look, don't touch.
- Commit only when asked. Work on a feature branch; never commit directly to `main`.
- GitHub: read-only. Use `gh api` GET calls only. Never fork, star, watch, clone, comment,
  or open issues or PRs on other repositories.
- hetstar (`rtviii/hetstar`, commit `fc08cdb`) code may be copied with credit (Prism
  internal permission; the repo has no LICENSE). Each copied file in
  `web/src/vendor/hetstar/` starts with its source path, commit and changes. Keep that header.
- Do not redistribute files whose license is unverified (currently the HXMS supplement).
  Keep them in `data/raw/` (git-ignored) and serve only derived values.
- Pin every source: `sources.lock.json` records URL, SHA-256, size, license and code
  commits. `fetch.py` run twice must give identical hashes.
- Validate every entry and view against its JSON Schema in the build (already done in
  `build_entries.py`). Bump the schema version for additions (minor) or removals (major).

## Environment

- macOS, zsh. Python env: `conda env create -f environment.yml` (name `hdx-data-repo`,
  Python 3.12). Node 20 or later for `web/`.
- Build:
  ```zsh
  python pipeline/fetch.py            # needs ~/Downloads/btag113_supplementary_data.zip (see below)
  python pipeline/build_entries.py    # writes web/public/{index.json, entries/, views/, structures/, schema/}
  cd web && npm ci && npm run dev     # http://localhost:5173
  ```
- **Manual input:** the *Bioinformatics* site blocks scripted downloads. The supplementary
  zip of Weber et al. 2026 (doi:10.1093/bioinformatics/btag113) must be saved by hand as
  `~/Downloads/btag113_supplementary_data.zip`; `fetch.py` copies it and checks SHA-256
  `77b3d872…3fd4`.
- `data/raw/` holds about 300 MB (Dataset_3 is 286 MB). It is git-ignored.

## Layout

```
pipeline/fetch.py            sources -> data/raw/, sources.lock.json
pipeline/build_entries.py    intact-protein entries (mHDX-MS, HDX-NMR, structures), views, index
pipeline/build_peptide.py    peptide-level entry (ecDHFR) and its view; called from build_entries.main()
schema/hdx_entry.v0.2.json   entry record schema
schema/hdx_view.v0.2.json    cross-entry view schema (derived display records)
web/src/pages/               Browse.tsx (entry list), Entry.tsx (tabs)
web/src/hdx/                 Explorer.tsx (intact view), PeptideExplorer.tsx (peptide view),
                             plots.tsx, Provenance.tsx, provenance-card.tsx, model.ts, types.ts
web/src/vendor/hetstar/      Mol* wrapper and sequence lanes copied from hetstar
web/public/                  generated data served by the site (committed)
```

## What was built

### Entries (19 total)

| Group | Entries | Source |
| --- | --- | --- |
| 5 de novo miniproteins (EEHEE_rd4_0642, EEHEE_rd4_0871, HHH_rd4_0518, HEEH_rd4_0097, EHEE_rd2_0005) | per protein: mHDX-MS, HDX-NMR, reference structure (8SKE, 8SKD, 8SKX, 5UYO, 8SHM) | Ferrari et al. 2026; Zenodo 14983481 (Dataset_3, Dataset_4); PRIDE PXD061702 |
| ecDHFR (apo, methotrexate, trimethoprim) | 1 peptide-level HDX-MS entry; 3 structures (5DFR, 1RG7, 6XG5) | Lu et al. 2026; PRIDE PXD057539; HXMS supplement of Weber et al. 2026 |

### Pipeline

- Intact-protein data: Dataset_3 streamed with `ijson` (only listed proteins kept);
  Dataset_4 per-residue values mapped to PDB numbering by exact sequence containment;
  per-construct means matched to the rows they average by recomputation; merged pH 6 +
  pH 9 mHDX series kept as separate series; raw mzML files cited per file from the PRIDE
  listing (`mutants04` assumed to be PRIDE `mut04`, flagged as inferred).
- Peptide-level data: HXMS parsed from the nested zip; charge states merged
  (intensity-weighted); times grouped within 15%; FD-normalized correction; replicate SD;
  hybrid test (Welch p < 0.01 and |ΔD| above a pooled-SD global limit, same-day replicates
  only); peptide classes; residue projection; alignment to each structure with mismatches
  recorded. All parameters are in `PARAMS` in `build_peptide.py` and stored in the records.
- Cross-entry views group entries by sequence (`views/view_<pdb>.json`,
  `views/view_ecdhfr.json`).

### Site

- Front page: list of 11 HDX entries.
- Entry page tabs: Explore (cross-entry view), Overview (in order: record, metrics and
  schema extensions; Provenance section with the run graph and artifacts; polymer
  entities; samples; "where each value comes from"), Models, Downloads. `#/entry/<id>/provenance` opens the Overview
  tab at the Provenance section.
- Intact Explore: Mol* structure colored by ΔG, log protection factor, predicted
  deuteration at t, or secondary structure; ΔG threshold; sequence lanes; sorted-ΔG,
  uptake, isotope, chiclet, butterfly and ΔΔG plots.
- Peptide Explore: structure colored by differential class, ΔD per amide, or coverage;
  structure selector; peptide map, uptake (corrected toggle), Woods, volcano, ΔD chiclet,
  reproducibility; identification panel.
- Provenance cards on every source line: files, checksums, run chain, operation, `jq`
  check command, raw-data status.

## What is left

Prioritized. Items marked (decision) need the owner or the Dynamic PDB team.

1. **Verify the HXMS supplement license** (preprint is CC BY 4.0). If open, host the HXMS
   files and drop the manual-download step.
2. **Add FEATHER ΔGop as a peer L2 model** for ecDHFR (authors' residue-level analysis;
   *Nat. Chem. Biol.* Source Data, apo states). Not retrieved yet.
3. **Surface intact-protein identification and envelope evidence** already in Dataset_3:
   retention time, `idotp` per charge, `PO_total_score`, `group`, EX1 flags. Check whether
   `mhdx_pipeline`'s `config.yaml` holds the thresholds and link it as run parameters.
4. **Register the Dataset_4 net-charge correction** as an L1d run
   (`free_energy_no_nc_correction` → `free_energy_nc_corrected`) with a toggle, as done
   for the peptide-level back-exchange correction.
5. **Mutants** EEHEE_rd4_0871_K31L_E36V and HHH_rd4_0518_R35D_G45L (HDX-NMR, and mHDX-MS
   rows in Dataset_3): polymer entities with `mutations[]`. Mutation numbering is open in
   Dynamic PDB v0.2.0 (decision).
6. **Raw-file checksums.** PRIDE lists none; computing them means downloading 1 to 27 GB
   per file. Decide whether to compute, or record PRIDE accessions as file identity
   (decision).
7. **Envelope viewer** for peptide-level data (HXMS envelopes per peptide, time, replicate).
8. **Reproducible user filters**: record a reader's thresholds as a run so a shared link
   reproduces the view.
9. **Merge** `feature/eehee-prototype` into `main` after review.
10. **Dynamic PDB open decisions** (also in README): L2 interpretations without
    coordinates; HDX metric and residue keys; HDX experimental block; one level for
    multi-level files; declaring sources with no URI; cross-entry relations.

### Open data questions

- How were Dataset_4 measurements at different temperatures or pH combined into one ΔG mean?
- Where are the HDX-NMR spectra deposited, if anywhere?
- 8SKE `_exptl.method` says solid-state NMR; its experiment details describe solution NMR.
- PRIDE lists PXD061702 as "Top-down proteomics".
- 6XG5 differs from the ecDHFR HDX construct at residue 37 (N vs D) and contains NADPH.

## Testing

- Run the build: it validates every entry and view against the schemas.
- Typecheck: `cd web && npx tsc --noEmit`.
- Browser: test in **Brave** (`/Applications/Brave Browser.app`), in `npm run dev` mode and
  in a production build. A crash that only appeared in newer Chromium (an effect returning
  `scrollTo`'s Promise) passed in Playwright's older Chromium. Playwright Chromium and
  WebKit are cached in `~/Library/Caches/ms-playwright/`; use them from a scratch folder
  with `playwright-core`, not from this repo.
- Sweep every tab of every entry for console errors after UI changes.
- Spot-check displayed values against the raw files with the `jq` commands in the
  provenance cards.

## Gotchas

- zsh does not word-split `$VAR`; use `${=VAR}` when passing a list of IDs.
- macOS `sed` does not support `\b`; use `perl -pi -e` for word-boundary replacements.
- `echo =====` fails in zsh (`=` expansion); use `echo ---`.
- Newer Chromium returns a Promise from `window.scrollTo`; React effects must use braces
  so they return nothing (an implicit return crashed the app as "destroy is not a function").
- Entry IDs are derived from keys such as `"<name>|<method>"`; changing a key changes the
  ID and breaks links.
