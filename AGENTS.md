# AGENTS.md

Instructions for AI agents and engineers working in this repository. Read this before
changing code or data. `README.md` describes the project for human readers; this file
records what exists, what remains, and the rules the work must follow.

Status as of 2026-10-22, branch `feature/eehee-prototype` (not merged to `main`).

## What this is

A prototype registry for hydrogen-deuterium exchange mass spectrometry (HDX-MS) data, for the Prism project
(Astera Institute). Each entry is one experimental context. Every displayed value is traced
to an archived source file. Raw data is cited in PRIDE, never copied. Field names follow the
Dynamic PDB schema v0.2.0
(`/Users/astera_andy/andy-dev/dynamic-pdb-aab-project-home/docs/schema/2026-10-16 dynamic pdb schema.md`),
with HDX additions listed per record in `extensions`.

## Requirements

### Scientific and data requirements

These come from the project owner and an HDX-MS reviewer. Do not relax them.

- **HDX-MS only.** The registry holds HDX-MS data. HDX-NMR and intact-protein mHDX-MS
  (Ferrari et al. 2026) were removed on 2026-10-22 and are out of scope; do not add them
  back unless the owner asks.
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
- **Wording.** L3 is "mapping to structural models", not "agreement".
- **Exploratory analyses say so.** Anything computed here (the differential test,
  projection, mapping, corrections) is labeled "computed here" with its
  parameters, and is not presented as validated.

### Writing requirements (site text, captions, README, docs)

Write in the style of scientific documentation: precise, concise, and accessible to readers
with relevant scientific knowledge.

- **Name the object, operation and scope.** Say which data, models, measurements or
  methods a sentence concerns (for example "APO vs TMP differential classes, ecDHFR
  HXMS files", not "the results").
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
| replicate | | Only for repeated measurements under the same conditions (e.g. same-day HDX-MS runs, `REP` in HXMS). |
| not reported | 0, blank | A condition or value the source does not give. |
| no value reported | not measured | A missing per-residue value (the source does not say why). |
| raw input not found | blocked | Regeneration from raw data is not possible because an input has no known location. |
| copied | | A value read verbatim from an archived file. |
| computed here | derived, calculated | A value produced by this repository's code, with a code location and parameters. |
| mapping to structural models | agreement | L3: projecting values onto a structure with a recorded residue mapping. |
| reference structure | true structure, ground truth | A deposited model used for comparison and residue numbering. |
| ΔG, with its method and source | energy landscape (as a measured quantity) | Do not assert whether a ΔG is a global unfolding or a local opening free energy unless the source defines it. |
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
- `data/raw/` holds about 18 MB (mostly the HXMS supplement zip). It is git-ignored.

## Layout

```
pipeline/fetch.py            sources -> data/raw/, sources.lock.json
pipeline/build_entries.py    entry list, schema validation, shared helpers; calls build_peptide
pipeline/build_peptide.py    peptide-level entry (ecDHFR), its structure entries and view
schema/hdx_entry.v0.2.json   entry record schema
schema/hdx_view.v0.2.json    cross-entry view schema (derived display records)
web/src/pages/               Browse.tsx (entry list), Entry.tsx (tabs)
web/src/hdx/                 PeptideExplorer.tsx (Explore tab), card.tsx, Plot.tsx, Provenance.tsx,
                             provenance-card.tsx, colors.ts, value-theme.ts, types.ts
web/src/vendor/hetstar/      Mol* wrapper and sequence lanes copied from hetstar
web/public/                  generated data served by the site (committed)
```

## What was built

### Entries (4 total)

| Group | Entries | Source |
| --- | --- | --- |
| ecDHFR (apo, methotrexate, trimethoprim) | 1 peptide-level HDX-MS entry; 3 structures (5DFR, 1RG7, 6XG5) | Lu et al. 2026; PRIDE PXD057539; HXMS supplement of Weber et al. 2026 |

The five Ferrari et al. 2026 miniproteins (mHDX-MS, HDX-NMR and NMR reference structures)
were removed on 2026-10-22. They remain in the git history up to commit `743422c`.

### Pipeline

- Peptide-level data: HXMS parsed from the nested zip; charge states merged
  (intensity-weighted); times grouped within 15%; FD-normalized correction; replicate SD;
  hybrid test (Welch p < 0.01 and |ΔD| above a pooled-SD global limit, same-day replicates
  only); peptide classes; residue projection; alignment to each structure with mismatches
  recorded. All parameters are in `PARAMS` in `build_peptide.py` and stored in the records.
- The cross-entry view groups entries whose sequences align to the HDX construct
  (`views/view_ecdhfr.json`).

### Site

- Front page: list of HDX entries (1).
- Entry page tabs: Explore (cross-entry view), Overview (in order: record, metrics and
  schema extensions; Provenance section with the run graph and artifacts; polymer
  entities; samples; "where each value comes from"), Models, Downloads. `#/entry/<id>/provenance` opens the Overview
  tab at the Provenance section.
- Explore: structure colored by differential class, ΔD per amide, or coverage;
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
3. **Envelope viewer** for peptide-level data (HXMS envelopes per peptide, time, replicate).
4. **Reproducible user filters**: record a reader's thresholds as a run so a shared link
   reproduces the view.
5. **Merge** `feature/eehee-prototype` into `main` after review.
6. **Raw-file checksums.** PRIDE lists none; computing them means downloading up to 27 GB
   per file. Decide whether to compute, or record PRIDE accessions as file identity
   (decision).
7. **Schema cleanup (decision).** The v0.2 and v0.3 schemas still allow intact-protein
   values (`method` enum `HDX-NMR`/`mHDX-MS`, view `kind: "intact"`, Dataset_4 sample
   fields). Removing them is a removal, so it needs a major version bump under the rule
   above.
8. **Dynamic PDB open decisions** (also in README): L2 interpretations without
   coordinates; HDX metric and residue keys; HDX experimental block; one level for
   multi-level files; declaring sources with no URI; cross-entry relations.

### Open data questions

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
- Entry IDs are derived from keys such as `"ecDHFR|HDX-MS peptide"`; changing a key changes
  the ID and breaks links.
