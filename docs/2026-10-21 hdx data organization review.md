# HDX data organization: expert profiles and review

Date: 2026-10-21. Reviewed document: [version 1.0](2026-10-21%20hdx%20data%20organization.md). Repository: `feature/eehee-prototype`, commit `743422c4f13a6cfcdf967549ebbfd78a4c1c6339`. Revision: [version 2.0](2026-10-21%20hdx%20data%20organization%20v2.md).

## 1. Expert profiles established before review

These are constructed review perspectives, not statements that external experts reviewed or endorsed the document.

### Profile A: HDX-MS and HDX-NMR specialist

**Scope of expertise.** Backbone amide exchange kinetics; EX1 and EX2 regimes; intrinsic-rate models; intact-protein isotope-envelope fitting; peptide identification and uptake; maximally labeled controls; NMR assignments and signal-decay fitting; uncertainty and censoring; differential statistics; construct and structure alignment.

**Review questions.**

1.  Can the reader distinguish instrument observations, fitted rates, thermodynamic interpretations and structural projections?
2.  Are sample conditions, labeling times, charge aggregation, controls and replicate units sufficiently specified to interpret each comparison?
3.  Are EX2, reference-rate and correction assumptions stated without assigning an unsupported physical meaning to ΔG?
4.  Are absent observations, bounds and structurally inapplicable values distinguished?
5.  Do significance, spatial resolution and class names reflect the actual computations?

**Evidence required.** Source fields and rows, executable processing code, parameters and recorded controls. A source field name alone does not establish a physical interpretation. The review uses the [HDX-MS reporting recommendations of Masson et al.](https://doi.org/10.1038/s41592-019-0459-y) and the exchange-mechanism treatment in [Englander, *Mechanisms and uses of hydrogen exchange*](https://pmc.ncbi.nlm.nih.gov/articles/PMC3412065/). The former guides experimental reporting; the latter supports the kinetic qualifications.

### Profile B: FAIR data manager with federated-database expertise

**Scope of expertise.** Persistent identifiers and namespaces; dataset and file identity; metadata harvesting; schema and vocabulary mappings; entity reconciliation; revision history; provenance graphs; file integrity; access and licensing; preservation and failure handling across independently managed archives.

**Review questions.**

1.  Which institution or archive is authoritative for each object and assertion?
2.  Can another system identify, retrieve and cite the exact revision and source bytes?
3.  Are relationships typed, qualified and supported by mapping evidence?
4.  Can machines distinguish unavailable data, unknown locations, unverified integrity and incomplete execution provenance?
5.  What happens when upstream metadata change, a file moves, or access fails?

**Evidence required.** Schemas, exported records, source manifests, revision policy and demonstrated access behavior. Linked archives alone do not establish interoperable federated search. The review uses the [FAIR principles](https://doi.org/10.1038/sdata.2016.18), [W3C DCAT 3](https://www.w3.org/TR/vocab-dcat-3/) for catalog interoperability, and [W3C PROV-O](https://www.w3.org/TR/prov-o/) for provenance interchange. These standards inform recommendations; no conformance assessment was performed.

## 2. Evidence and scope

Read the original document, companion metadata dictionary, `AGENTS.md`, `README.md`, both JSON schemas, `sources.lock.json`, `pipeline/build_entries.py`, `pipeline/build_peptide.py`, and the local Dynamic PDB schema v0.2.0 document. Scientific and standards references were checked online. The review inspected code; it did not rerun source analyses, audit every archived measurement, or verify live federation.

## 3. Findings from the scientific profile

| Priority | Location in v1 | Finding and evidence | Treatment in v2 |
|------------------|------------------|------------------|------------------|
| High | §2, §6 | EX2 alone is insufficient for an unqualified opening-free-energy interpretation. The usual relation also uses the rare-opening approximation and an applicable intrinsic-rate model. The repository does not establish these conditions. | Qualify the equation and retain the unresolved physical meaning of source ΔG. |
| High | §4.3, §6 | `PARAMS.differential.values` claims state-independent back-exchange cancels. With a common fractional recovery, ΔD is scaled by that fraction. Equal recovery can support a relative comparison, but does not recover its absolute magnitude. | Remove the cancellation and unconditional-validity claims; state the recovery assumption. |
| High | §4.3 | Shared replicate IDs select the included days. `welch()` still implements an unpaired test. The global threshold uses the comparison-wide count of shared IDs, not necessarily the count in each peptide/time cell. | State selection, test, pooling, degrees of freedom and the cell-count limitation separately. |
| High | §4.3 | No separate multiplicity adjustment is implemented. Classification uses significance at any tested time. The cited hybrid method is not evidence that this particular implementation has validated error control. | Label the analysis exploratory and avoid an overall error-rate claim. See [Hageman and Weis](https://pubmed.ncbi.nlm.nih.gov/31099554/) for the cited method. |
| High | §4.3, §5 | Projection averages signed maximum-absolute peptide differences using inverse peptide-length weights. Different peptide maxima can occur at different times. Projection excludes the first two peptide positions but does not explicitly mask all prolines. | Describe an exploratory display summary, not a residue-specific or common-time measurement. |
| Medium | §4.3 | `D_FD` is pooled across replicates within each state. The first-two-amide exclusion is a processing convention. The code forces corrected uptake at time zero to 0. Neither control preparation nor uncertainty propagation is established by the formula. | Specify the denominator, convention and zero-time behavior; flag the remaining control questions. |
| Medium | §4.2, §6 | A reconstructed arithmetic mean does not establish comparability across different pH or temperatures. Rate-derived PF may also differ from the displayed net-charge-corrected ΔG. | Preserve constituent rows and distinguish rate-derived log PF from corrected ΔG. |
| Medium | §3, §4.3 | Missing values have several causes. Sequence coverage does not establish measurable amide coverage. Exported `.mgf` spectra are processed MS/MS data, even though their source artifact is currently grouped under L0. | Retain `null` and distinguish these meanings in prose. Flag the artifact-level mismatch. |
| Medium | §4.4, §5 | Sequence relatedness does not establish identical constructs or conditions. The rank comparison preferentially selects No-His NMR, otherwise 6xHis, and prefers its mean row. | State mapping and selection rules. Retain condition and construct limitations. |

Existing strengths are the separation of measurements from interpretations, preservation of uncorrected uptake, per-value provenance, explicit missing raw NMR inputs, and the use of reference structures without assigning them evidentiary priority.

## 4. Findings from the FAIR and federation profile

| Priority | Location in v1 | Finding and evidence | Treatment in v2 |
|------------------|------------------|------------------|------------------|
| High | §1, §3 | The implementation is a build-time registry with links to distributed archives. Its description does not establish a shared federation protocol, harvest contract or cross-provider query service. | State present architecture and mark federation requirements as proposed. |
| High | §3 | An eight-character local identifier is stable only while its generation key remains stable. It does not establish a globally governed namespace or persistent resolver. Revision fields do not demonstrate historical retrieval. | Separate entry identity, revision identity and schema version; recommend a resolver and immutable snapshots. |
| High | §3, §6 | An accession and filename identify a referenced deposit but do not prove byte identity. `derivations.raw` is inferred by graph traversal and URI presence, not successful execution from raw inputs. | Distinguish deposit, integrity, accessibility and demonstrated reproducibility. |
| High | §3, §4 | Links and free-text `basis` fields do not establish equivalence across archives. A shared protein or sequence region does not justify merging scientific records. | Propose typed, evidence-bearing relations and explicit source authority. |
| Medium | §3, §6 | Access failure, source updates, record withdrawal and metadata retention lack an operational policy in this document. | Propose dated source snapshots, availability checks, update review and retained metadata. |
| Medium | §3 | A single artifact level cannot fully describe mixed-content Dataset_3, Dataset_4 or HXMS files. Fine-grained levels are conceptual; schema artifact enums remain L0–L3. | State this distinction without inventing schema support. |
| Medium | §4.3 | Unknown file licensing remains a reuse barrier. A publication license does not by itself resolve supplementary-file terms. | Preserve the redistribution restriction and separate metadata licensing as proposed work. |

The revision recommends a namespace and resolver, versioned snapshots, typed relationships, vocabulary mappings, source-change handling and retained metadata. These are design recommendations based on this review. DCAT and PROV offer exchange models, but do not prescribe the registry's database or query architecture.

## 5. Revision decisions

Version 2 retains the entry inventory, processing formulas, metric keys and open scientific questions. It corrects claims about implemented behavior and adds a concise proposed federation contract. It does not change code, schemas, data or the companion dictionary. The document version becomes 2.0; the described JSON schema remains 0.2.0.

Follow-up implementation priorities are to verify control and replicate semantics; assess the statistical implementation; resolve ΔG corrections and censoring; and define revision retrieval and interoperable relationship semantics. These actions require separate work.