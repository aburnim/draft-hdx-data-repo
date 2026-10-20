# Dynamic PDB. Method integration guide

Status: draft, 2026-10-02. Maintained by Andy Burnim, Astera Institute (Prism).

This guide is written for an AI agent or an engineer. Hand it a description of a
new structural-biology method and it should be able to answer:

1. Does the method fit the Dynamic PDB data model, or a system built the same way?
2. Exactly how would its data, models, runs, and metrics be recorded?
3. What would break or be lost today, and what would have to change?

It compiles the planning documents (proposal, schema v0.1.0, wireframes, README)
and the implemented code as of 2026-10-02. Where they disagree, Section 2 says
which one wins.

---

## 0. Instructions for the agent

**Inputs you need before starting.** Ask for whatever is missing.

- The method name, paper or preprint, and code repository.
- The experimental data it consumes, with file formats.
- What it outputs, with file formats, and whether the outputs are atomic.
- The software, versions, and how it is run (command line, config files, logs).
- What it reports as quality or fit measures, and at what scope (global, per
  chain, per residue, per ensemble member).
- One worked example dataset, ideally one with a PDB accession.

**What to produce.** A *Method integration brief* using the template in
Section 9. Nothing else is required.

**Rules.**

- Read only. Do not edit the repository, create GitHub issues, or call `gh`
  write commands. Propose changes in the brief instead.
- Do not crawl production (`dynamicpdb.com`) with more than 1 to 2 concurrent
  requests. Eight parallel requests caused 503s on 2026-09-25.
- Keep "what the schema intends" separate from "what the code accepts today".
  Label every claim with one of: **Normative**, **Implemented**, or **Gap**.
- Do not reintroduce BIC or AIC. They were ruled out of scope on 2026-08-21,
  even though the schema document still describes them.
- Use "Prism" for the project. Use "Dynamic PDB" for the registry.

---

## 1. The model in one page

Dynamic PDB is a registry where **one experimental dataset stays fixed and many
models compete to explain it.** The PDB publishes one structure per experiment.
Dynamic PDB holds the comparison rather than the conclusion.

### Four objects

| Object | What it is | Test |
| --- | --- | --- |
| **Entry** | The fixed experimental context: what was measured, from what sample, under what conditions. | If the measurement changes, it is a new entry. |
| **Model** | One interpretation of the entry's data. Models are peers. | Two analyses of one dataset are two models of one entry. |
| **Artifact** | A file, plus what is known about it (level, sha256, format, uri). | Shared, not duplicated. One file can attach to an entry, several models, and runs. |
| **Run** | One execution of one piece of software, linking the artifacts it consumed to those it produced. | Three processing steps are three runs. |

Entries and models are **versioned** through revisions (`pending`, `in_review`,
`active`, plus `rejected` and `archived` in code). At most one revision is
active per object.

```text
entry ──1:N── entry_revision ──M:N── artifact
  │
  ├──1:N── protein_sequence ── similarity (MMseqs2), polymer_entity (SIFTS/UniProt)
  │
  └──1:N── model ──1:N── model_revision ──M:N── artifact
                              ├── primary_artifact (the coordinates)
                              ├── metrics (key, value)
                              ├── residue_data[] (per-residue values)
                              └──M:N── run ──M:N── artifact (direction: input | output)
```

### Data levels: the only structural vocabulary

Every file gets one level, set by **distance from the instrument**. Adapted from
NASA EOSDIS processing levels. The bins are broad on purpose, so new methods fit
without a new taxonomy. Finer distinctions go in a field within a level, never
in a new level.

| Level | Meaning | Examples |
| --- | --- | --- |
| **L0** Source | Off the instrument, or reduced by a pipeline with no interpretive choices. | Diffraction images, HDF5, cryo-EM movies and particle stacks, FASTA |
| **L1** Processed | Measurements extracted with choices another competent group could make differently. | MTZ, `-sf.cif`, CCP4/MRC/DSN6 maps, NXS diffuse maps |
| **L2** Modeled | Atomic interpretations of source data. Competing explanations live here. | Single-conformer, multiconformer, ensemble, MD trajectory, refinement logs |
| **L3** Evaluated | How well an L2 model explains source data, and its geometry. | Validation reports, R-free, RSCC, clashscore |

**L0 vs L1 boundary test:** did processing involve interpretive choices another
competent group would plausibly make differently? If no, L0. If yes, L1.

"A data level describes a file's role, not its quality." (website docs)

### Core rules a new method must respect

1. **Admissibility is provenance completeness, not correctness.** A model that
   documents its data, software, and parameters is admissible whatever it
   concludes. MUST describes what is recorded, never what a model must find.
2. **No winning model.** A PDB-deposited structure is an L2 model on equal
   footing with every computed model. It is not a reference.
3. **An L2 model MUST declare its source data**, even if the registry does not
   hold that data. The registry requires the statement, not the file.
4. **Levels need not all be filled.** An entry with only a PDB accession and
   models built from it is normal. L3 is never required.
5. **Lineage comes from runs**, not typed edges (W3C PROV-O). An artifact that
   is one run's output and another's input forms a chain.
6. **Absent metrics are absent.** Never zero. Never rank on a metric missing
   from any model in the comparison.
7. **Composition is not quality.** `altloc_fraction` and `unmodeled_fraction`
   describe what a model contains and MUST NOT be standalone sort keys.
8. **Derive, don't ask.** Anything readable from a deposited file is
   registry-derived (Annotator: Registry) and never requested from a depositor.
   Extraction never overwrites a depositor value.
9. **Every file gets a SHA-256**, so any holder can verify identical bytes.
10. **Reuse external standards first** (PDBx/mmCIF, CCD, UniProt/SIFTS,
    NCBITaxon, OBI/EFO, EDAM, wwPDB validation dictionary, bio.tools). Invent
    an internal term only when none exists.

---

## 2. Sources of truth and precedence

| Question | Read this | Notes |
| --- | --- | --- |
| Scientific intent, open questions | `Dynamic PDB Proposal.md` | Heterogeneity framing, `heterogeneity_hierarchy` mmCIF category, validation and data-out questions |
| What a field MUST/SHOULD be | `2026-08-20 dynamic pdb schema.md` (v0.1.0 draft) | Normative. Marks its own "Not implemented" and "Unenforced" gaps. Modeled on the cellxgene curation schema |
| UI and gap analysis | `2026-08-21 dynamic pdb wireframes.md` | Requirement gaps, open questions, P0 to P3 order |
| What the code actually does | Repo `prism-science/dynamic-pdb`, latest worktree `dynamic-pdb-docs/` | Migrations in `backend/migrations/db/public/structure/`, Go types in `backend/internal/models/`, API in `backend/api/openapi.yaml` |
| User-facing explanation | `website/content/docs/*.md` (especially `data-organization.md`, `contributing.md`) | Current plain-language docs |
| Provenance tooling | `ext — User Manual.html` | Astera experiment tracker, extshell.org |

**Superseded or stale. Do not follow these:**

- `SPEC.md` describes `Entity` and `EntityRelation` tables. They do not exist.
  Use it only for scientific prose.
- The schema doc's `DPDB-YYYY-NNNN` accession format is dropped. The shipped
  identifier is `dpdb_xxxxxxxx` (Section 6).
- The schema doc's BIC and AIC sections are out of scope (decided 2026-08-21).
- The README's `Entity` data model section predates the 2026-08-03 schema.

---

## 3. The general pattern (for "a similar system")

If the target is not Dynamic PDB itself but a registry built the same way, these
are the transferable design decisions. Each has a precedent, so it can be
defended to collaborators.

| Decision | Generalized form | Precedent |
| --- | --- | --- |
| Data vs interpretation | Separate the fixed measurement (entry) from competing interpretations (models) | PDB-IHM / IHMCIF multi-state peers; EMDB + EMPIAR |
| Processing levels | A small ordinal scale of distance from the instrument, method-agnostic | NASA EOSDIS L0 to L4 |
| Provenance by activity | Lineage reconstructed from executions with explicit input/output direction | W3C PROV-O; Workflow Run RO-Crate |
| Admissibility | Accept on completeness of provenance; defer correctness | cellxgene curation |
| Annotator split | Every field is Depositor or Registry; Registry values are derived, with an optional sub-source (`archive`, `uploaded_file`, `run_log`, `external_registry`, `computed`) | cellxgene Curator vs Portal |
| Fixity | SHA-256 per file, computed by the registry | BagIt RFC 8493, Zenodo, Dataverse, ext |
| Absence semantics | Missing is missing; no ranking across gaps | wwPDB validation reports |
| Open per-residue values | Fixed residue identity (mmCIF `label_*` and `auth_*` keys), open set of numeric values | IHMCIF; SIFTS |
| Pinned vocabularies | External ontologies pinned to dated releases; internal terms only as a fallback | cellxgene, OBO Foundry |
| Identifiers | Opaque registry accession, no DOI, model IDs bound to one entry | PDB, UniProt, EMDB |
| Licensing | CC0 for content and compilation, attribution requested not imposed | wwPDB, RCSB usage policy |

To reuse the pattern for a different domain, replace three things and keep the
rest: the **level examples**, the **metric vocabulary**, and the **residue
identity keys** (the unit of local comparison).

---

## 4. Mapping procedure

Work through these steps in order. Record each answer in the brief.

### Step 1. Identify the entry (the fixed experiment)

- What is the one measurement every model of this method must explain?
- Does it have an archive accession (PDB, EMDB, EMPIAR, BMRB, SASBDB)? Today only
  `external_refs.pdb` has built-in behavior (uniqueness, RCSB sync).
- **Red flag:** the method produces models with no experimental dataset behind
  them (for example unconstrained MD or pure structure prediction). That breaks
  the core shape. An entry is a fixed experiment. Say so plainly.
- **Red flag:** the method consumes several datasets at once (multi-temperature,
  multi-crystal, time series, fragment screens). The model has no way to say an
  entry relates to other entries. Flag as a many-to-many gap.

Fill: `method`, `organism`, `resolution`, `temperature`, `ph`, `space_group`
(crystallography only), `ligands`, `cofactors`, `construct`, `mutations`,
UniProt segments. Mark which are derivable (Registry) vs asked (Depositor).
Fields that do not apply to the method MUST be omitted, not guessed.

### Step 2. Classify every file into L0 to L3

List every input, intermediate, and output file. For each give:
`name`, `level`, `format` (EDAM term or lowercase token), `type`
(implemented: `model`, `structure_factors`, `fasta`, `other`), typical size,
and whether it would be stored or referenced (S3, http(s) URI, or `ext://`).

- Apply the L0/L1 boundary test literally.
- **Boundary case to flag:** non-atomic interpretations, such as a series of
  heterogeneous cryo-EM volumes, a latent space, or a coarse-grained ensemble.
  L2 is defined as *atomic* interpretation. Do not force-fit. Report it as an
  open question for scientific program direction.
- Files over 1 GiB cannot go through upload. Record them by reference.

### Step 3. Define the model(s)

- `model_type`: `Single Conformer`, `Multiconformer` (altlocs, occupancies sum
  to at most 1), or `Ensemble` (complete models that jointly explain the data;
  trajectories are ensembles). Closed vocabulary.
- `purpose`: `Model Building` or `Refinement`. Closed vocabulary. If neither
  fits, flag it.
- **Primary artifact:** exactly one coordinate file per model revision
  (PDB or mmCIF; mmCIF required past PDB-format limits). Ensembles must be one
  multi-model file today.
- What does one "model" mean for this method? One run? One parameter setting?
  One occupancy level? (Sampleworks makes one model per run directory.)
- **Redundancy:** if the method emits many near-identical models (parameter
  sweeps), the schema says SHOULD keep one representative. The threshold is
  still TBD. Propose what counts as a representative.
- Composition fields the registry computes: `atom_count`, `modeled_residues`,
  `unique_protein_chains`, `altloc_fraction`, `unmodeled_fraction`. Note whether
  they mean anything for this representation.

### Step 4. Define the runs

For each software step: `software_name` (canonical, one spelling),
`software_version` (never `unknown`), `command` verbatim with personal paths
removed, `parameters` as structured JSON, and every input/output artifact with
`direction`.

- Can these be parsed from a log, a config, or `_software` / REMARK 3? If so,
  they are Registry (`run_log`).
- Is there an `ext` experiment? If yes, files are referenced as
  `{experimentId, path, sha256}`. Downloads must be staged **before**
  `ext shell` starts, because `ext experiment publish` refuses experiments that
  contain network commands (`curl`, `wget`, `git clone`, `pip install`).
- Watch for the quiet failure the schema calls out: an input that was used but
  never uploaded (for example a free-R set). Declare it anyway.

### Step 5. Define the metrics

Map each quality measure the method reports onto the vocabulary below. Record
the producing software and version for each one.

| Key | Meaning | Direction |
| --- | --- | --- |
| `r_work` | Agreement with data used in refinement | lower |
| `r_free` | Agreement with held-out data | lower |
| `cc` | Model to data correlation | higher |
| `rscc` | Real-space correlation, per region | higher |
| `clashscore` | Severe overlaps per 1000 atoms | lower |
| `ramachandran_outliers` | % backbone outliers | lower |
| `side_chain_outliers` | % rotamer outliers | lower |
| `molprobity_score` | Composite geometry, as equivalent resolution | lower |
| `wilson_b` | Overall intensity fall-off | context |
| `rmsf` | Fluctuation across ensemble members, Ensemble only | context |

Normative vocabulary from schema v0.1.0, minus BIC/AIC. New keys need a schema
revision (minor version).

For each metric the method reports, classify it:

- **Maps directly** to an existing key with the same wwPDB definition.
- **Maps with caveats.** Same name, different computation. Example: R-free from
  a regenerated free set is not like-for-like. That was found for qFit on
  2026-09-25: 60 of 60 sampled models differed from the depositor set.
- **New key needed.** Examples: FSC resolution, Q-score, map-model CC for
  cryo-EM; restraint violations for NMR; diffuse-scattering agreement.
  Propose a name, definition, direction, scope, and an external definition to
  cite.

Then state the parsimony question honestly. Does the method have a criterion
that charges for added parameters? Without one, conformer counts cannot separate
captured heterogeneity from overfitting. R-free is the only guard in the current
vocabulary.

### Step 6. Define residue-level values

Residue identity is fixed: `label_asym_id`, `label_seq_id`, `label_comp_id`,
`auth_asym_id`, `auth_seq_id`, `pdbx_pdb_ins_code`, optional `label_alt_id`.
Values are open: implemented keys are `rscc`, `b_iso`, `occupancy`,
`conformer_count`, `rmsf`, `uniprot_position`.

- What does the method compute per residue (or per conformer)?
- Never synthesize per-residue values from global ones.
- Multiconformer models SHOULD carry `label_alt_id` and `occupancy`.
- UniProt projection: `unp_position = g.unp_begin + (s - g.seq_begin)` using the
  segment `g` containing `label_seq_id` `s`. A residue in no segment has no
  UniProt position.
- Note if the method's natural unit is not a residue (atom, domain, voxel,
  state). That is a gap.

### Step 7. Identifiers and cross-references

- Entry: `dpdb_` plus 8 random `[0-9a-z]`. Model: `<entry>_m_NNN`. Regex
  `^dpdb_[0-9a-z]{8}(_m_[0-9]{3,})?$`. Opaque on purpose. Never encode the
  method in an ID.
- No DOI per record. Relationships use DataCite relationType terms carried in
  the record (`IsDerivedFrom`, `HasPart`, `IsPartOf`, `IsNewVersionOf`,
  `IsSupplementTo`).
- List every external archive the method's data lives in and which
  `external_refs` key it would need. Only `pdb` exists today.

### Step 8. Annotator table

For every field above, give Annotator (Depositor or Registry) and, for Registry,
the sub-source. The goal is that a depositor is asked only for what cannot be
read from their files.

### Step 9. Ingestion path

Pick the closest existing path and say what it needs:

| Path | Fits when | Constraints |
| --- | --- | --- |
| **CLI manifest** (`dynamic-pdb upload manifest init`, `upload start`) | Batch of models on PDB-accessioned data | Keyed by PDB ID; files without one are skipped. A model is skipped unless it has an artifact with id `coordinates`. Level defaults to L1 if unset. One run inferred, only from REMARK 3 / `_software`. Metrics extracted by `json`/`csv`/`tsv`/`pdb`/`mmcif` rules. Restartable via `<manifest>.upload.jsonl` |
| **Method-specific detector** (only example: Sampleworks, `cli/internal/upload/manifest/sampleworks_*.go`) | Method has a stable output directory layout | Detects `job_metadata.json`, `losses.txt`, `refined.cif`, `run.log`, `trajectory/`. Hardcodes `model_type` and `purpose`. A new method would need its own detector and builder |
| **Website form** | One-off, hand-entered | Five metric fields; ext file picker; client-side sha256 (a known gap) |
| **API directly** | Custom pipelines | `POST /v1/entries` with `model_operations`, or `POST /v1/entries/{id}/models`; files via `POST /v1/files` then `/complete`, then pass `object_url` as `uri`. Client chooses UUIDs for artifacts, runs, metrics. Use `idempotency_key` = primary artifact sha256. 1 MiB request body cap |

External submissions are currently closed (site banner). Writes are limited to
approved GitHub orgs, and entries must be reviewed and activated before their
models.

---

## 5. Implementation reality: what the code accepts today

Read this before promising anything. Status as of `dynamic-pdb-docs` HEAD
`cb761a0`.

**Enforcement is mostly absent.**

- No CHECK constraints or Postgres enums anywhere. `level`, `type`, `state`,
  `direction`, and `metrics.key` are plain text.
- The API does **not** validate `level`. Metric keys accept any non-empty
  string. `model_type`, `purpose`, and `method` are not enum-checked.
- `model_revisions.metadata` is decoded into a fixed Go struct
  (`ModelMetadata`). **Unknown keys are silently dropped.** A method-specific
  model field needs a Go change, not just a new JSON key.
- `artifact.metadata` and `run.parameters` / `run.metadata` are free JSON and
  are preserved. Method-specific detail can live there today, uninterpreted.

**Thin metrics.** The `metrics` table is `id, key, value, created_at`. There is
no producing software, version, unit, scope, or link to a run. The schema
requires software provenance per metric; this needs a migration.

**One coordinate file per model revision.** At most one `model` and one
`structure_factors` artifact per model revision; at most one `fasta` per entry.

**Per-residue data** is `metadata.residue_data[]`, inline in the 1 MiB request.
Only the RCSB sync fills it. The website computes B-factor, conformer count,
occupancies, and RMSF across multi-model files in the browser, and prefers those
values over stored ones.

**Crystallography assumptions a new method will hit:**

- Entry `method` has two values: `X-ray crystallography`, `CryoEM`. Others are
  stored but not recognized by the UI or CLI. The schema wants OBI/EFO CURIEs.
- Entry metadata has `space_group` and `crystallography.crystals[].diffractions[]`.
  There is no equivalent block for cryo-EM, NMR, SAXS, or MD.
- Artifact types have `structure_factors` but no `map`, `trajectory`,
  `restraints`, `nmr_peaks`, or `ensemble_weights`. Use `other`.
- The file download route serves only `cif`, `mmcif`, `structure_factors_cif`.
  PDB-format primaries 404 there.
- The density layer in the website assumes MTZ.
- Run inference recognizes MTZ and structure-factor inputs only.
- Model metadata has no fields for ensemble size, member weights, ordering,
  state labels, or method.
- `altloc_fraction` (CLI) counts any altloc, without the schema's 0.1 occupancy
  floor, and counts atoms in every MODEL of a multi-model file.

**Not implemented from the schema** (relevant to most methods): accession
assignment and resolver prefix, JSON-LD and content negotiation, bulk export,
canonical software list, metric software provenance, ontology pins (only
NCBITaxon verified), similarity `tool_version` / `corpus_snapshot`, structural
similarity, movement classification, whole-protein dynamism, the proposal's
`heterogeneity_hierarchy` mmCIF category.

---

## 6. Method archetypes: quick fit table

Starting points, not conclusions. Verify against the specific method.

| Archetype | Entry | L1 | L2 model | Fit today | Main gaps |
| --- | --- | --- | --- | --- | --- |
| **Multiconformer X-ray** (qFit 3, FLEXR) | PDB dataset | MTZ / `-sf.cif` | Multiconformer mmCIF | Good. Seed batch is qFit | Free-set provenance; RSCC often unpopulated; no qFit importer |
| **Ensemble refinement X-ray** (phenix.ensemble_refinement) | PDB dataset | MTZ | Ensemble, multi-model mmCIF | Good | Member weights and count not recorded |
| **Guided structure prediction / generative refinement** (Sampleworks, experiment-guided AF3) | PDB dataset | `-sf.cif`, maps | Single Conformer or Ensemble | Good. Sampleworks importer exists | Hardcoded model_type; training data and model weights as provenance |
| **Multi-temperature, time-resolved, multi-crystal X-ray** | One entry per dataset | MTZ per dataset | Any | Partial | No entry-to-entry relation; temperature not implemented |
| **Fragment screening** (PanDDA) | Ambiguous: per crystal or per campaign | Event maps, ground-state maps | Bound/unbound ensemble | Partial | Many-to-many datasets; compositional heterogeneity |
| **Cryo-EM atomic heterogeneity** (multi-model fits into maps) | EMDB/EMPIAR dataset | Maps, half maps | Ensemble | Partial | No EMDB ref; FSC, Q-score not in vocabulary; maps are `other` |
| **Cryo-EM continuous heterogeneity** (cryoDRGN, 3DFlex, tomoDRGN) | EMPIAR dataset | Particle stacks (L0), consensus map | Volume series or latent space: **not atomic** | Poor | L2 is atomic by definition; needs a scientific decision |
| **MD constrained by experiment** | The experimental dataset | Whatever it was fit to | Ensemble (trajectory) | Partial | Trajectory ordering not recorded; trajectory files exceed caps; one coordinate file per revision |
| **Unconstrained MD / prediction only** | None | None | Ensemble | **Does not fit** | No fixed experiment to explain. Also note the unrelated Fudan "dynamicPDB" MD dataset owns the name |
| **NMR ensembles** | BMRB data | Shifts, peaks, restraints | Ensemble | Partial | Proposal notes NMR ensembles represent uncertainty, not heterogeneity; method enum; restraint metrics |
| **SAXS / diffuse scattering** | SASBDB or raw data | Curves, NXS maps | Ensemble | Partial | Non-residue fit metrics; method enum |

---

## 7. How to extend the model cleanly

When a method needs something new, propose the smallest change that fits the
existing rules.

- **Prefer a field within a level over a new level.** Never add L4 for one method.
- **Prefer an external term.** Request it from the ontology maintainers; use the
  nearest parent term in the meantime (cellxgene procedure).
- **Internal vocabulary changes** go to Dynamic PDB curation and land as a schema
  revision. Records must not carry out-of-vocabulary values in the interim.
- **Versioning (semver).** Adding an OPTIONAL field or vocabulary value is minor.
  Removing one, or making a field REQUIRED, is major.
- **Reserved names.** Metadata keys MUST NOT start with `__`. Do not reuse a
  defined key for other information.
- **Free JSON is a holding area, not a schema.** Method detail in
  `run.parameters` or `artifact.metadata` survives today, but is not queryable or
  validated. Say so when you use it.
- **New metrics** need: key, definition with an external citation, direction,
  scope (global, per chain, per residue, per member), producing software, and
  whether it is comparable across software.
- **Representation.** Where ordering, states, or hierarchy matter, point to
  IHMCIF and the proposal's `heterogeneity_hierarchy` category rather than
  inventing a format.

---

## 8. Admissibility self-check

Run this against the proposed mapping. Each line is pass, fail, or not
applicable, with a reason.

**MUST (from schema v0.1.0)**

- [ ] There is one fixed experimental context the models explain.
- [ ] Every L2 model declares its source data (held or referenced).
- [ ] Every computed L2 model has at least one run with software name, version,
      and directed inputs and outputs.
- [ ] Every artifact has a level and a registry-computed SHA-256.
- [ ] Every referenced file has a resolvable URI or an archive accession.
- [ ] Metrics carry their producing software; absent metrics are absent.
- [ ] No composition field is used as a ranking key.
- [ ] No personal information beyond authors and affiliation; personal paths
      stripped from commands.
- [ ] Content can be released under CC0 1.0.

**SHOULD**

- [ ] Coordinates are mmCIF.
- [ ] Parameters are structured JSON, and the command is recorded verbatim.
- [ ] The deposited PDB model is included as a peer where one exists.
- [ ] UniProt cross-references with segments, and a declared `source`.
- [ ] Near-identical outputs are reduced to a representative.
- [ ] Per-residue values are supplied where the method computes them.

---

## 9. Output template: Method integration brief

Copy this structure. Keep it short. Use tables.

```markdown
# Method integration brief: <method name>

## Summary
- Fit: good | partial | does not fit
- One-sentence rationale
- Top three blockers

## Method
- Paper, code, license, versions
- What heterogeneity it represents (conformational, compositional, temporal)
- Representation (altlocs, multi-model, trajectory, volumes, other)

## Entry mapping
| Field | Value or source | Annotator / sub-source | Status (Normative / Implemented / Gap) |

## Artifact mapping
| File | Level | Format | Type | Size | Stored or referenced | Status |

## Model mapping
- model_type, purpose, primary artifact, what one model means
- Redundancy and representative selection

## Runs
| Step | software_name | version source | inputs | outputs | parsed from |

## Metrics
| Method's measure | Maps to key | Caveat | Scope | Producing software | Status |
- Parsimony: what guards against overfitting

## Residue-level values
| Key | Meaning | Per residue / per conformer | Status |

## Identifiers and cross-references
- Archives involved, external_refs keys needed

## Ingestion path
- Chosen path, what a detector or manifest would need, sizes vs caps

## Gaps and proposed changes
| Gap | Smallest change | Schema version impact | Owner (science / engineering / data steward) |

## Admissibility self-check
(Section 8 list, filled in)

## Open questions for Andy
```

---

## 10. Worked reference: how qFit 3 maps today

A complete example of the brief's core, using the seed batch.

| Aspect | Mapping |
| --- | --- |
| Entry | One PDB deposition, `external_refs.pdb`. RCSB sync fills method, resolution, space group, crystallography, polymer entities, UniProt via SIFTS |
| Entry artifacts | FASTA (L0, `fasta`), `-sf.cif` (L1, `structure_factors`) |
| Models | Deposited model (L2, `Single Conformer` usually) as a peer; qFit output (L2, `Multiconformer`); re-refined and ensemble-refinement models as further peers |
| Runs | qFit 3 (inputs: starting model, MTZ or map; output: multiconformer mmCIF), then refinement |
| Metrics | `r_work`, `r_free` populated; `rscc` and `molprobity_score` not populated on models checked 2026-09-24 |
| Caveats found 2026-09-25 | qFit models used a regenerated free set, so R-free is not like-for-like with the deposited model. About 70% of the "qFit worse" subset were outputs missing chain B. Dynamic PDB qFit files are byte-identical to the qFit-at-scale Zenodo release, so they are a re-host, not an independent re-run |
| Lesson for any method | Record which free set and which software produced each metric, and check outputs for missing chains before comparing |

---

## 11. Glossary for non-structural-biologists

- **Altloc:** a second placement of the same atom or residue in one file, with a
  fractional occupancy.
- **Ensemble:** a set of complete models that together explain the data.
- **R-free:** agreement with measurements withheld from refinement. The honest
  fit measure, because extra parameters cannot improve it artificially.
- **RSCC:** real-space correlation of a residue with the density map.
- **label_seq_id vs auth_seq_id:** gapless machine numbering vs the depositor's
  numbering used in papers. Record both.
- **SIFTS:** PDBe and UniProt residue-level mapping between PDB entries and
  UniProt sequences.
- **CCD:** the PDB Chemical Component Dictionary of ligand codes.
- **ext:** Astera's experiment tracker. Records commands and file hashes and
  builds replayable bundles.
