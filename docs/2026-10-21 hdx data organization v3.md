# HDX data organization

|  |  |
|------------------------------------|------------------------------------|
| Document version | 3.2 |
| Date | 2026-10-22 |
| Status | Draft, including proposed PRIDE-linked submission and import |
| Current implementation reviewed | `feature/eehee-prototype` after commit `743422c`, peptide-level HDX-MS entry only; schemas 0.2.0 |
| Proposed schemas | [Entry 0.3.0](../schema/hdx_entry.v0.3.json), [view 0.3.0](../schema/hdx_view.v0.3.json) |
| Schema audit and validation | [Coverage, migration and limitations](2026-10-21%20hdx%20schema%20v0.3%20coverage.md) |
| Metadata dictionary | [Scientific metadata and proposed submission fields](2026-10-21%20hdx%20metadata%20dictionary%20v3.md) |
| Contact | Andy Burnim, Astera Institute (Prism) |

## 1. Scope and status

The workflow described here is peptide-level HDX-MS: peptide identification from undeuterated samples, envelope evaluation, uptake, controls, calibration, reproducibility, validity and interpretation. The registry holds peptide-level HDX-MS data only.

The prototype currently holds one HDX entry (ecDHFR, peptide-level HDX-MS) and three supporting structure entries. One entry represents an experimental context and method; constructs are polymer entities, and states, conditions and replicate IDs belong to samples. The front page lists HDX entries.

Schema 0.3.0 is a new proposal. The existing pipeline and published JSON remain at 0.2.0. Statements below distinguish required documentation from information currently recorded.

## 2. Processing levels

| Level | Output and scope |
|------------------------------------|------------------------------------|
| L0 | Raw instrument files, referenced in their source archive. |
| L1a | Peptide map from undeuterated identification data, with evidence, flags and curation decisions. This precedes deuterated uptake analysis. |
| L1b | Evaluated deuterated envelopes and uptake by state × actual time × replicate × peptide, with charges merged for the uptake table. |
| L1c | Optional, recommended fully deuterated (FD) controls, or the method used to estimate maximum uptake; internal exchange reporter metadata where applicable. |
| L1d | Calibrated measurements from separate correction runs; all uncorrected inputs retained. |
| L1 evaluation | Technical reproducibility of uptake measurements. |
| L2 | L1 validity decisions, differential tests, peptide classes and residue projection. |
| L3 | Mapping to structural models, with alignment evidence and mismatches. |

The 0.3.0 workflow records every stage as `recorded`, `not recorded`, `not performed` or `not applicable`. “Not recorded” does not establish that a procedure was not performed. Missing numeric observations remain `null`; measured zero remains zero. Artifact `level` retains L0–L3; optional `processing_roles` and selectors distinguish contents of multi-level files, including HXMS files containing both uptake and FD controls.

## 3. Identification and envelope evaluation

### 3.1 L1a: how proteins and peptides were identified

**Required record.** Identify the measured construct and sequence reference. Record each software tool and version, identification strategy, database or supplied target sequences, search parameters and acceptance thresholds. Separate search tolerances from criteria that accept or reject an identification. Preserve MS/MS evidence, scores, flags, excluded candidates and curation decisions, including the review method and record where available.

The first analysis output is the peptide map: construct positions and sequences identified from undeuterated samples. A deuterated uptake series subsequently refers to these peptide identities. A map reconstructed from detected uptake records is a downstream subset and does not establish the complete identification map.

**ecDHFR information recorded.** The archived [PRIDE PXD057539 protocol](https://www.ebi.ac.uk/pride/archive/projects/PXD057539), `data/raw/PXD057539.json:dataProcessingProtocol`, states:

| Operation or setting | Recorded value |
|------------------------------------|------------------------------------|
| Peptide identification and deconvolution | Compass DataAnalysis 5.1, Bruker |
| Sequence matching | Biotools 3.2 SequenceEditor, Bruker |
| Enzyme constraint in search | No enzyme specified |
| Mass tolerance | 30 ppm; MS/MS tolerance 0.020 Da |
| Other settings | “20 partials”; mass range 150–25,000 Da; monoisotopic ions |
| Output and subsequent use | Peptide lists used for PIGEON peptide deconvolution |

These are search settings, not a documented score or false-discovery threshold. The meaning of “20 partials”, sequence-search space, acceptance scores and false-discovery procedure are not recorded here. PRIDE contains MS/MS `.mgf` files and peptide CSV files, including `CLEANED` lists. Their filenames do not establish the individual curation decisions or manual-review criteria. MGF is processed spectral evidence, although current records label its source artifact L0.

The displayed map contains 314 peptides spanning 165/174 construct residues. The build creates this map from peptides present in HXMS records. It does not independently reconstruct the full undeuterated identification map from the CSV and MS/MS evidence. Sequence coverage is distinct from measurable-amide coverage.

Schema path: `hdx.peptide_workflow.identification`. It defines software roles, search parameters, acceptance-criteria status, evidence-bearing peptide rows, flags and curation.

### 3.2 L1b: how deuterated envelopes were processed and evaluated

**Required record.** Link the identification map and raw labeled measurements to extraction software and versions. Document chromatographic and mass-window selection, isotope-envelope handling, uptake determination, quality scores and acceptance thresholds. Record manual validation status, criteria and review history. Keep excluded envelopes and reasons, rather than retaining only accepted centroids. Record overlap, interference or other flags when assessed; do not infer that an unrecorded flag was checked and passed.

**ecDHFR information recorded.** `pipeline/build_peptide.py` distinguishes PIGEON peptide pool deconvolution, HDExaminer envelope extraction, and PFLink conversion to HXMS. The locked PIGEON-FEATHER repository commit is `ad0d9f3092825f3269cd3ef16914ea30460a6827`. That code snapshot does not establish the exact version executed for every deposited measurement, or the versions of HDExaminer and PFLink. The latter versions, extraction windows, acceptance thresholds and manual-envelope validation history are not recorded in the imported run parameters.

HXMS supplies per-charge records, envelope peaks, confidence fields, retention times and uptake. Parsing a confidence value does not establish its definition, threshold or manual validation status. Those meanings require source evidence.

Schema path: `hdx.peptide_workflow.envelope_processing`. Per-charge rows identify peptide, sample, state, replicate, time/control type, charge, spectral evidence, uptake, scores, flags and acceptance decision. This stage is distinct from the repository's charge merging.

## 4. Uptake, controls, calibration and reproducibility

### 4.1 L1b: merged uptake

The canonical measurement retains peptide, sample, state, actual labeling time, replicate ID, contributing charges and envelope IDs. Actual times remain available when display bins are used. Charge states are observations of the same peptide measurement, not independent replicates.

Computed here: merge per-charge uptake using summed envelope intensities; use an unweighted mean when total intensity is zero. Group positive times while t ≤ 1.15 times the group's first time. The 15% grouping rule and fallback require declared parameters. Schema path: `hdx.peptide_workflow.uptake`.

### 4.2 L1c: controls and alternative estimates

Document control preparation, deuterium fraction, evidence for maximal labeling, baseline, matching or pooling across states/days, and uncertainty. If FD controls are absent, record whether maximum uptake is estimated, an internal exchange reporter is used, or no correction is performed. Describe the estimator or reporter and its evidence. Do not invent an FD measurement for an estimated value.

ecDHFR HXMS files designate FD controls with `TIME = inf`. The proposed format uses a control type and `null` time instead of an infinite JSON number. The build averages FD uptake per peptide within each state across replicates. Control saturation, preparation and recovery equivalence are not established by that averaging operation. Schema path: `hdx.peptide_workflow.controls`.

### 4.3 L1d: calibrated measurements

Each correction is a separate run with a method, formula, parameters, control links, exact input/output selectors and missing-control policy. Record the output unit and scale. Internal reporter corrections follow the same contract. Preserve the original measurements and each correction branch. Repeating or replacing a correction starts from retained inputs; an algebraic inverse is not required.

Computed here for ecDHFR: D_corr = D/D_FD × N_ex. N_ex excludes the first two peptide positions and subsequent prolines. This is a processing convention. Missing or nonpositive FD uptake prevents positive-time normalization; corrected zero-time uptake is explicitly set to zero. Uncertainty propagation is not implemented. Uncorrected uptake remains available, but current entry runs do not fully link the generated merged and corrected outputs. The proposed contract requires those links.

Schema path: `hdx.peptide_workflow.calibration`. A supplemental validator rejects overlapping input/output selections and inconsistent run parameters. Schema validation cannot establish that an external archive physically retains the referenced bytes.

### 4.4 L1 technical reproducibility

Record the replicate type, independent experimental unit, grouping, actual per-cell counts, uptake version, mean, SD and units. Do not combine measurements under different conditions as technical replicates without justification.

Computed here: SD of uncorrected uptake for peptide/time cells with at least two values; summaries include median, 95th percentile and pooled SD per state. Replicate IDs select acquisition days in comparisons; their statistical independence remains to be confirmed. Schema path: `hdx.peptide_workflow.reproducibility`, explicitly at L1.

## 5. L2 validity and interpretation; L3 mapping

**Validity.** Store accepted, excluded and not-tested decisions about L1 observations with criteria, flags and reasons. Distinguish an invalid measurement from a valid measurement without a significant difference. Current envelope acceptance and a complete per-observation validity ledger are not imported. The differential test's minimum-count and time exclusions do not substitute for that ledger. Schema path: `hdx.peptide_workflow.validity`.

**Differential testing, computed here and exploratory.** ΔD = ligand − APO using uncorrected uptake. Shared replicate IDs select days; an unpaired Welch test compares eligible cells with at least two values per state. Require p \< 0.01 and \|ΔD\| above t(0.995, df) × s_pooled × √(2/n). Here n is the comparison-wide shared-ID count, df = 2n − 2, and s_pooled is the square root of the mean within-cell variances. Cell counts can differ from n. Zero-time and FD cells are excluded. No separate multiplicity adjustment is implemented; overall error control is not established. Equal fractional back-exchange can attenuate ΔD; it does not generally cancel.

“More rigid” means significantly lower ligand uptake at one or more times and never significantly higher. “More flexible” reverses the sign. Mixed denotes opposing significant signs; no observable difference means tested without significance. Untested remains distinct. These are parameter-dependent HDX classes, not direct measurements of mechanical rigidity. Schema path: `hdx.peptide_workflow.differential`.

**Residue projection, computed here and exploratory.** Overlapping peptide classes are projected in construct coordinates, excluding the first two peptide positions. Conflicting significant classes produce mixed residues. Numeric summaries average signed peptide maximum-\|ΔD\|/N_ex with inverse-length weights. Maxima can occur at different times; projected values retain peptide resolution. The current projector does not explicitly mask every proline. L2 projection does not require coordinates. Schema path: `hdx.peptide_workflow.projection`.

**Mapping to structural models.** L3 links construct positions to specific reference models, chains, internal and author residue identifiers, insertion codes, mismatches and unmapped positions. ecDHFR uses 5DFR, 1RG7 and 6XG5. The latter has N37 where the HDX construct has D37 and contains NADPH, absent from HDX sample metadata. No structure is scored against HDX. Schema path: `hdx.peptide_workflow.structural_mapping`.

## 6. Provenance and federation

Every displayed output retains source selectors, upstream runs, operation, code and check command. `copied` and `computed` are stored provenance tiers; the latter displays “computed here”. Missing raw locations display “raw input not found”. Graph connectivity does not demonstrate reproducibility from raw data.

Federation remains proposed: persistent entry/revision resolution, source snapshots, typed relations with mapping evidence, explicit licenses, access checks and source-change review. Linked archives alone do not implement federated search. Raw-file checksums remain unknown where bytes were not obtained. HXMS supplement redistribution remains restricted pending license verification. See [v2 §6](2026-10-21%20hdx%20data%20organization%20v2.md#6-fair-and-federation-requirements-proposed-for-implementation) for the proposed federation contract.

## 7. Proposed PRIDE-linked submission and import

A submitter can provide a PRIDE accession and upload or select supported processed HDX
files. The system preserves the original files, records the import run, maps their contents
into the HDX processing levels, and produces a draft entry with explicit provenance and
missing-information reports. This capability is proposed; the current importer handles
predefined datasets.

### 7.1 Submission workflow

1. **Identify the deposit.** Accept a PRIDE project URL or accession. Retrieve project
   metadata and file information through the [PRIDE API](https://www.ebi.ac.uk/pride/ws/archive/v2/docs/api-guide.html).
   Retain the retrieved metadata and retrieval date. A project can contain several
   experimental contexts; it does not automatically become one entry.
2. **Select or upload processed files.** Allow selection of accessible processed files in
   the deposit or upload of associated files. Initial format targets are HXMS and explicitly
   specified peptide-identification and uptake tables. Declare supported formats and
   dialects; report unsupported files. Preserve original uploaded bytes, names, sizes,
   checksums, licenses and storage locations. Raw instrument files remain archive references.
3. **Link results to source files.** Associate each processed artifact with the relevant
   PRIDE project and, where known, specific source files. Record whether each association
   is supplied, inferred or verified, with its evidence. A project link alone does not
   establish which raw files produced a result. A checksum can verify byte identity, but
   does not establish the analytical relationship between two files.
4. **Parse and reconcile.** Create normalized artifacts and record parser software/version,
   parameters, input/output selectors and transformations as an import run. Identify
   constructs, peptides, states, actual times, replicates, controls and correction branches.
   Preserve distinctions between uncorrected and corrected values. Present ambiguous
   sequence, column or sample mappings for submitter resolution and retain their decisions.
5. **Validate and preview.** Check record structure, linked tables and scientific identifiers.
   Show parsed values, validation errors, unsupported content and missing metadata. Resolve
   errors before publication. Missing upstream methods remain explicitly “not recorded”;
   import success does not establish identification confidence, envelope validation or
   reproducibility from raw data.
6. **Review and publish.** Retain the submission and mapping decisions as a review record.
   Publish a reviewed entry revision with its source snapshots and provenance. Reimports
   produce new draft revisions and preserve previous published content.

### 7.2 Scope and schema requirements

Importing processed files preserves their scientific processing level. The parsing run is
distinct from the original identification, envelope extraction, correction or statistical
analysis. Retrieving PRIDE metadata does not generate peptide identifications or uptake from
raw spectra. Raw-data analysis requires separately specified software, parameters and
execution infrastructure.

The proposed entry/view schemas 0.3.0 can represent normalized scientific records, artifacts
and run links. They do not yet define or validate the complete submission workflow. A
separate submission/import record must specify submission identity, submitter, source
accession and snapshot, file associations and evidence, parser execution, validation
report, mapping decisions, import/review status and resulting entry revisions. Its
relationships to entry artifacts and runs must be defined before implementation. Submission
status is distinct from both scientific processing level and entry revision status.

## 8. Unresolved scientific ambiguities

- What do “20 partials” and HXMS confidence scores mean, and what acceptance thresholds were used?
- What identification and envelope decisions were manually reviewed, and where is the history?
- Are FD controls saturated and comparable across states/days, and are replicate units independent?
