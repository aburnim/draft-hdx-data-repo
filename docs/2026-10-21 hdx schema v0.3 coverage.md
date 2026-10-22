# HDX schema 0.3.0: comment coverage and validation

Date: 2026-10-21. Status: draft proposal, not adopted by the production build. Companion: [organization v3](2026-10-21%20hdx%20data%20organization%20v3.md).

## Audit of schema 0.2.0

The entry schema defines software names/versions and generic run inputs, outputs and parameters. It does not require the metadata needed to answer the reviewer's identification and envelope-evaluation questions. `hdx.peptide_map` is an open object. The view schema declares peptide payload names but places no constraints on their contents. Generic support for arbitrary fields is not a defined, validated representation of these requirements.

| Reviewer requirement | 0.2.0 coverage | New 0.3.0 entry path under `hdx.peptide_workflow` |
|------------------------|------------------------|------------------------|
| Identification software, strategy, thresholds | Generic run fields only | `identification.details`: individual software roles, search space, parameters and acceptance criteria/status |
| Undeuterated peptide map, evidence, flags, curation | Open summary object | `identification.details.peptide_map`, `input_labeling`, `curation`; typed peptide rows |
| Envelope software, processing, thresholds, manual validation | Generic runs; no envelope row contract | `envelope_processing.details`: software, extraction/uptake methods, parameters, quality criteria/status, review and per-charge evidence |
| L1b state × time × replicate × peptide, charges merged | View payload unconstrained | `uptake.details.measurements`: typed dimensions, charges and upstream envelope IDs |
| L1c optional controls or alternate estimate/reporters | View FD payload unconstrained | `controls`: explicit stage status, preparation, saturation, baseline, pooling, alternatives and control records |
| L1d corrections preserve raw values and link runs | Generic parameters; no correction contract | `calibration.details.corrections`: retained original input, selected input, controls, output, formula, parameters and run |
| Technical reproducibility at L1 | View metric level supports L1, summaries unconstrained | `reproducibility`: L1 constant, replicate type/unit, grouping, per-cell n, mean and SD |
| L2 valid/excluded decisions | No decision-table contract | `validity`: criteria and per-observation decisions, flags and reasons |
| L2 differential classes | Model type exists; result payload unconstrained | `differential`: input version, sign, test, thresholds, pairing, multiplicity and typed results |
| L2 residue projection from overlapping peptides | Model type exists; no projection method contract | `projection`: span, overlap rule, weighting, time aggregation, peptides and construct positions |
| L3 mapping to structural models | Partial generic residue-frame support | `structural_mapping`: L3 constant, purpose constant, mapping evidence, mismatches/unmapped residues and both numbering systems |

## Schema design

The new files are [entry 0.3.0](../schema/hdx_entry.v0.3.json) and [view 0.3.0](../schema/hdx_view.v0.3.json). Version 0.3.0 adds structured HDX fields; it does not change Dynamic PDB's version. Existing 0.2.0 files are preserved.

Every workflow stage requires a reporting status, reason, run list, source list and details. `recorded` requires typed details and source/run references. Partial source documentation is allowed: software versions and unknown methods can be `null`, and acceptance criteria have an explicit “not recorded” status. Recorded thresholds require at least one criterion. Other stage statuses require a reason, `null` details and an empty execution-run list; sources may still document why a stage is absent. “Not recorded” does not mean not performed.

Rows can be inline or referenced through an artifact selector with a mapping for every canonical column. The latter requires a normalized table if the original format does not supply those columns. External bytes must subsequently be checked against the corresponding `$defs/*_row` schema. The entry document alone cannot validate external table contents. One-based inclusive construct positions are used for peptide maps and projection. Replicate IDs are normalized to strings in new canonical tables; legacy integer IDs remain unchanged in historical payloads.

Peptide entries declaring `hdx.peptide_map` or `hdx.peptide_workflow`, or using the existing peptide method label, require the new workflow. Future method labels must also declare the workflow explicitly. Structure entries and entries with other methods do not require it. A peptide view requires a canonical `peptide_workflow` mirrored from its owning entry. Historical renderer payloads remain supported but do not substitute for canonical workflow metadata. The view references the entry schema's definitions; local validation resolves this reference without a network request.

## Correction preservation and semantic checks

JSON Schema requires the preservation declaration, exact artifact selectors, parameters and run IDs. It cannot compare arbitrary sibling values or resolve IDs against another array. The supplemental [validator](../pipeline/validate_hdx_v03.py) therefore checks entry-local artifact and workflow run references, unique artifact/run IDs, and nonempty input/output links for declared stages. For each correction it also checks:

- the correction run is declared by the stage and exists in the entry;
- each correction has a distinct ID, execution run and output selection;
- workflow and run parameters agree and are nonempty;
- selected inputs, controls and outputs appear in the run with the declared selectors;
- output selections do not overlap correction inputs, retained uncorrected values or controls.

FD and internal reporter corrections require control links. Inline calibrated rows must name their correction's run; an external calibrated table must select that correction's output.

Same-file inputs and outputs are allowed when their declared field or row selectors are disjoint. Missing/empty selectors conservatively select the whole artifact. The validator cannot inspect undocumented column aliases or prove that external bytes were preserved. Use consistent canonical selectors and immutable source/output snapshots.

Remaining application checks include row-ID uniqueness, reference resolution inside external tables, peptide sequence/coordinate consistency, replicate independence, corrected-row parent links, run-graph cycles, view-to-entry equality and upstream execution reproducibility. These are not claimed as enforced by the draft validator. No scientific threshold, manual validation or method equivalence is inferred by a successful validation result.

## Proposed submission and import layer

[Organization v3 §7](2026-10-21%20hdx%20data%20organization%20v3.md#7-proposed-pride-linked-submission-and-import)
adds a proposed workflow for a PRIDE accession plus uploaded or selected processed files.
Schema 0.3.0 represents the resulting scientific records, artifacts and runs; it does not
yet define a submission/import record or implement the upload service and general parsers.

A separate record must define submission identity and submitter, PRIDE metadata snapshots,
file associations with supplied/inferred/verified evidence, parser execution, validation
reports, mapping decisions, review status and resulting entry revisions. Link it to exact
entry artifacts and import runs. Parsing does not establish that upstream scientific
processing or manual validation occurred. These submission requirements are not enforced
by the current draft schemas or validator and require a subsequent schema addition.

## Adoption and validation

This revision does not migrate data or change `build_entries.py`, `build_peptide.py`, the site or generated public schemas. Existing entries still validate against 0.2.0. Upgrading a peptide entry requires an explicit workflow, not merely changing `schema_version`. The original metadata dictionary describes 0.2.0. The [new dictionary](2026-10-21%20hdx%20metadata%20dictionary%20v3.md) documents scientific schema 0.3.0 and separately identifies proposed submission/import fields that still require a schema.

Before adoption, register normalized tables as artifacts; populate available source evidence; mark missing identification, envelope-review and validity histories explicitly; and correct run output/control links. The current HXMS-based display map must not be presented as an independent reconstruction of the full undeuterated identification map. Preserve archived 0.2.0 revisions when publishing replacements.

With the `hdx-data-repo` environment active:

``` zsh
python -m unittest discover -s tests -p 'test_hdx_schema_v03.py' -v
python pipeline/validate_hdx_v03.py path/to/entry-v03.json path/to/view-v03.json
```

The tests use synthetic observations. They check required scientific metadata, explicit unknown states, null versus observed zero, correction preservation, local references, L1/L2/L3 distinctions, offline cross-schema resolution and compatibility of existing 0.2.0 entry/view records. They do not establish the scientific validity of the analyses.
