# HDX data organization

|  |  |
|------------------------------------|------------------------------------|
| Document version | 2.0 |
| Date | 2026-10-21 |
| Describes | `schema/hdx_entry.v0.2.json` and `schema/hdx_view.v0.2.json` (0.2.0) |
| Repository state reviewed | `feature/eehee-prototype`, commit `743422c` |
| Status | Draft; documentation revision, not a schema change |
| Contact | Andy Burnim, Astera Institute (Prism) |
| Companion | [Metadata dictionary](2026-10-21%20hdx%20metadata%20dictionary.md) |
| Review | [Expert profiles and findings](2026-10-21%20hdx%20data%20organization%20review.md) |

## 1. Scope

The Prism prototype organizes HDX observations, processing runs, interpretations and mappings to reference structures. It holds 11 HDX entries and eight supporting structure entries: five miniproteins with mHDX-MS, HDX-NMR and structure entries each; one peptide-level ecDHFR entry; and three ecDHFR structures. The front page lists HDX entries.

This is a build-time registry linking distributed archives. Section 6 proposes requirements for federation; it does not describe an implemented federated query service.

## 2. Measurement and interpretation

Backbone amide hydrogens exchange with solvent. Proline lacks a backbone amide hydrogen; the protein N-terminus is not a backbone amide. The intrinsic exchange rate, k_int, describes an unstructured reference and depends on sequence, temperature and solution conditions. In the base-catalyzed range, it increases approximately tenfold per pH unit at fixed temperature.

PF = k_int/k_obs. Under EX2 kinetics and the rare-opening approximation, RT ln(PF) can represent an opening free energy if the intrinsic-rate model applies. These conditions are not tested here. The repository retains source ΔG without assigning it to global unfolding or local opening. See [Englander](https://pmc.ncbi.nlm.nih.gov/articles/PMC3412065/).

MS measures isotope mass shifts, approximately 1.006 Da per retained deuterium. NMR follows signal decay for assigned amides. Neither detection method alone establishes the exchange regime or a unique structural interpretation.

## 3. Objects, levels and provenance

Field names follow Dynamic PDB v0.2.0; HDX additions appear in `extensions`.

| Object | Meaning |
|------------------------------------|------------------------------------|
| Entry | One experimental context and method; `hdx_` plus eight base-36 characters from a stable key. |
| Polymer entity | Measured construct, including its sequence, tags and recorded mutations. |
| Sample | Construct and state with conditions, measurement or replicate identifiers in `hdx.samples`. |
| Artifact | Referenced or stored file, with format, location, license and checksum where known. |
| Run | Processing step with declared inputs, outputs, software and available parameters. |
| Model | Interpretation, including a ΔG set, differential set or deposited coordinate model. |
| View | Generated cross-entry display record; grouping uses construct-to-reference sequence mapping. |
| Derivation | Displayed-value provenance: input fields/rows, upstream runs, operation, code and check command. |

| Level | Content |
|------------------------------------|------------------------------------|
| L0 | Instrument data; MS files are cited in PRIDE, not copied. Raw NMR spectra were not located. |
| L1a | Peptide identification, evidence and curation. |
| L1b | Peptide uptake per state, time and replicate, with charges merged. |
| L1c | Maximally labeled controls, designated fully deuterated (FD), or the alternative method. |
| L1d | Calibrated or corrected values in separate runs; retain uncorrected inputs. |
| L1 evaluation | Technical reproducibility, including replicate uptake SD. |
| L2 | Fits, ΔG sets, validity filters, differential tests, classes and residue projection. |
| L3 | Mapping to structural models. Current records also label cross-method comparisons L3. |

Sublevels describe peptide processing. Artifact schemas store only L0–L3. Shared files can contain several levels; selectors identify the content used. A coordinate artifact is L2; its use as an HDX mapping reference is L3.

Absent numeric values use `null`, never a replacement zero. Distinguish no amide, no assignment, no value reported and a possible detection bound where supported. A missing value does not establish why it is missing.

`derivations.tier` stores `copied` or `computed`; the latter displays as “computed here”. Source summary numbers may be rounded during export. `raw: blocked` displays “raw input not found”. Other raw-status values describe the recorded graph, not verified execution from raw data. A `jq` check verifies a selected value, not the full upstream analysis.

## 4. Measurement types

### 4.1 Intact-protein mHDX-MS

Ferrari et al. 2026 provide pooled miniprotein labeling series at pH 6 and/or pH 9. LC-MS isotope distributions are fitted to exchange rates without residue assignments; the source reports sorted site ΔG.

| Level | Source |
|------------------------------------|------------------------------------|
| L0 | `.mzML.gz` files in PRIDE PXD061702; raw-file checksums are not recorded. |
| L1/L2 | Isotope distributions, fits and QC fields in `Dataset_3_MeasurablyStable.json`, Zenodo DOI `10.5281/zenodo.14983481`. |
| L2 | Sorted site ΔG and summary metrics copied from Dataset_3. |

Two selected rows combine pH 6 and pH 9 data; uptake plots retain separate pH series. Instrument and complete quench metadata are not captured in the entries. Identification and envelope evidence in Dataset_3, including EX1 flags, is not fully surfaced.

### 4.2 HDX-NMR

Ferrari et al. report assigned-residue exchange rates and ΔG in `Dataset_4_HDXNMR.json` at the same Zenodo DOI. The file combines processed and interpreted values: `obs_rates`, `intrinsic_rates`, `free_energy_nc_corrected` and `too_slow_array`. Spectrum type, assignment evidence and fit uncertainty are not documented here; raw spectra have no known location.

Each Dataset_4 row is a measurement, not necessarily a replicate. Mean rows identify `mean_of_rows`; differing conditions display as “mixed”. Reproducing an arithmetic mean does not establish comparability across temperature or pH. Exact sequence containment maps constructs to reference numbering.

Computed here: log₁₀ PF from positive k_int and k_obs. Displayed ΔG is copied from the net-charge-corrected field; it is not necessarily RT ln(PF) from those stored rates. The uncorrected ΔG field is not yet exposed as a separate correction run.

### 4.3 Peptide-level HDX-MS

The ecDHFR entry uses Lu et al. 2026 data and Weber et al. 2026 HXMS files. States are APO, methotrexate (MTX) and trimethoprim (TMP; CCD `TOP`). The build copies APO metadata to all states: pH(read) 7.0, 293.15 K and 0.90 D₂O fraction. Independent per-state verification is not implemented. Buffer and complete quench/digestion conditions are not recorded in the entry. Labeling extends to 54,073 s; `TIME = inf` denotes FD controls.

1.  **Identification.** Curated lists contain 314 peptides spanning 165/174 construct residues. This is sequence coverage, not a count of measurable amides. PRIDE PXD057539 holds Bruker `.d` archives, exported `.mgf` MS/MS spectra and peptide CSV files. MGF is processed spectral evidence, although currently grouped with the L0 source node.
2.  **Uptake.** HXMS per-charge uptake is merged using summed envelope intensities; zero-total-intensity groups use an unweighted mean. Positive times are grouped while t ≤ 1.15 times the group's first time; original times remain available.
3.  **Correction, computed here.** D_corr = D/D_FD × N_ex. D_FD is the peptide's mean control uptake within the same state across replicates. N_ex excludes the first two peptide positions and subsequent prolines. This is a processing convention. Missing or nonpositive FD uptake prevents normalization of positive-time values; corrected zero-time uptake is explicitly set to zero. Control saturation and recovery equivalence are assumptions; uncertainty propagation is not implemented.
4.  **Differential analysis, computed here and exploratory.** ΔD = ligand − APO using uncorrected uptake. Shared replicate IDs select days; the test is an unpaired Welch test, not a paired test. Each peptide/time cell needs at least two values per state. Both p \< 0.01 and \|ΔD\| \> t(0.995, df) × s_pooled × √(2/n) are required. Here n is the comparison-wide number of shared IDs, df = 2n − 2, and s_pooled is the square root of the mean eligible within-cell variances. Cell counts can differ from n. Zero-time and FD cells are excluded. Undefined p-values are stored as `null`. No separate multiple-testing adjustment is applied; overall error control is not established for this implementation of the [Hageman–Weis hybrid approach](https://pubmed.ncbi.nlm.nih.gov/31099554/).
5.  **Classes and projection, computed here and exploratory.** “More rigid” means significantly lower ligand uptake at one or more times and never significantly higher; “more flexible” reverses the sign. These labels do not directly measure mechanical rigidity. Mixed indicates opposing significant signs; no observable difference means tested without a significant result. Untested peptides remain distinct. Residue classes summarize covering peptides after their first two positions. Numeric projection averages signed maximum-\|ΔD\|/N_ex values with inverse-length weights. Peptide maxima can occur at different times; these are peptide-resolution summaries, not individual-amide uptake.

HXMS files remain local because their license is unverified. All processing parameters are declared in `pipeline/build_peptide.py`. Uncorrected uptake remains available. Equal fractional back-exchange can attenuate ΔD; it does not generally cancel. Reporting uptake, controls and replicate counts follows the concerns identified by [Masson et al.](https://doi.org/10.1038/s41592-019-0459-y).

### 4.4 Reference structures

Miniproteins use 8SKE, 8SKD, 8SKX, 5UYO and 8SHM. ecDHFR uses 5DFR, 1RG7 and 6XG5, with per-structure alignments and recorded mismatches. Mapping must distinguish construct positions, `label_seq_id`, author numbering, chains and insertion codes. The ecDHFR mapper uses sequence matching blocks longer than five residues; coverage can be incomplete. 6XG5 has N37 where the HDX construct has D37 and contains NADPH, which is not listed in the HDX sample metadata. Structures support numbering and comparison; none is scored against HDX.

## 5. Metrics and comparisons

| Metrics | Scope and interpretation |
|------------------------------------|------------------------------------|
| `repro_median_sd_{APO,MTX,TMP}` | L1, computed here: median uncorrected uptake SD over eligible peptide/time cells, in Da. |
| `dg_max`, `dg_median`, `n_protected`, `n_exchangeable` | L2, copied: sorted ΔG summaries and source-defined site counts. |
| `cooperativity`, `cooperativity_normalized` | L2, copied: source measures; definitions and thresholds are not established here. |
| `fit_rmse`, `fit_rmse_max`, `idotp_max`, `backexchange_final` | Copied mHDX-MS fit/QC summaries; not comparable quality scores across methods. |
| `APO_vs_{MTX,TMP}:{more rigid,more flexible,mixed}` | L2, computed here: peptide class counts. |
| `landscape_rmsd_top_k`, `dg_max_difference` | Current L3 labels, computed here: rank-based RMSD and maximum-ΔG difference, in kcal/mol. |

The cross-method comparison is exploratory. k is the smaller available site count; the k largest values are matched by rank. NMR selection prefers No-His, otherwise 6xHis, and its mean row when available. Construct differences, mixed conditions, incomplete assignments and censoring limit interpretation. The comparison establishes no residue correspondence. Structure colors summarize mapped NMR values, predicted deuteration, secondary structure or peptide projections, each with provenance.

## 6. FAIR and federation requirements proposed for implementation

The [FAIR principles](https://doi.org/10.1038/sdata.2016.18) motivate persistent identity, qualified links, reuse terms and retained metadata. The following are review recommendations:

| Requirement | Proposed contract |
|------------------------------------|------------------------------------|
| Identity and versions | Govern a global namespace and resolver. Keep entry identity, immutable revision identity and schema version distinct; retain withdrawn-record metadata. |
| Source authority | Archives remain authoritative for deposits; Prism owns its processing assertions. Preserve exact source snapshots, selectors and retrieval dates. |
| Reconciliation | Type relationships such as sequence mapping, reference structure and input to analysis. Record evidence and mismatches; do not merge entries solely by protein name or accession. |
| Integrity and access | Separate accession/filename identity from verified byte identity. Record checksum status, last access check and failure reason. Review upstream changes before publishing a new revision. |
| Interchange | Publish versioned metadata exports, units and vocabulary mappings. Evaluate [DCAT 3](https://www.w3.org/TR/vocab-dcat-3/) for catalog exchange and [PROV-O](https://www.w3.org/TR/prov-o/) for provenance exchange. |
| Reuse | State metadata and file licenses separately; do not infer supplementary-file permission from a paper's license. |

`sources.lock.json` pins downloaded source bytes. PRIDE raw-file checksums remain unknown. Schema validation in the build checks record structure; it does not establish scientific validity, FAIR conformance or raw-data reproducibility.

## 7. Unresolved scientific ambiguities

- How were Dataset_4 measurements across pH or temperature combined into mean ΔG?
- What transformation and assumptions define the net-charge correction?
- Does `too_slow` specify a lower ΔG bound, and what detection limit applies?
- Where are the raw HDX-NMR spectra, assignments and fitting records deposited?
- Are FD controls saturated, baseline-referenced and comparable across states and days?
- Do shared replicate IDs identify independent experimental units, and are per-cell counts adequate for the global threshold?
- Is `mutants04` the same library as PRIDE `mut04`, as currently inferred?
- Why does 8SKE list solid-state NMR while its experiment details describe solution NMR?