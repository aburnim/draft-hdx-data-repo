# HDX metadata dictionary

|  |  |
|------------------------------------|------------------------------------|
| Document version | 3.1 |
| Date | 2026-10-22 |
| Based on | [HDX data organization v3, document 3.2](2026-10-21%20hdx%20data%20organization%20v3.md), including the PRIDE submission proposal |
| Scientific record schemas | [Entry 0.3.0](../schema/hdx_entry.v0.3.json), [view 0.3.0](../schema/hdx_view.v0.3.json); drafts |
| Submission schema | Not defined; submission field names and vocabularies below are proposed |
| Current implementation | Build and published records remain at schema 0.2.0 |
| Contact | Andy Burnim, Astera Institute (Prism) |

## Scope and conventions

The data tables retain the original dictionary's four columns: **Field**, **Source**, **Allowed values**, **Definition**. This file is a new dictionary; the original is preserved. It covers entry metadata, the structured peptide workflow, canonical scientific tables, view provenance and the proposed PRIDE-linked submission/import record.

- **Source** identifies who supplies a value, not whether it has been independently verified. “Assigned here” denotes registry identifiers or classifications. “Computed here” denotes repository processing with recorded inputs and parameters. A parser copies or transforms source values; parsing does not verify the upstream scientific analysis.
- For schema-defined fields, **Allowed values** describes the schema constraints. Scientific conventions or constraints not enforced by the schema are stated explicitly. Additional properties accepted by an open object do not become defined schema fields.
- Missing numeric observations use `null` where allowed, or an absent optional field. Measured zero is valid. A required non-null field cannot be replaced with `null`; use the relevant stage's reporting status when its required details cannot be represented.
- New workflow strings must be nonempty. Date and timestamp strings in existing scientific schemas are not format-validated. New canonical table replicate IDs are strings; historical sample records may still use integers.
- Fields in a shared-object or row table are relative to the named `$defs` shape. Stage-detail fields are relative to `hdx.peptide_workflow.<stage>.details`. `[]` denotes array members. The scientific tables may be inline or selected from registered artifacts.
- All listed keys in new stage-details, correction, software, criterion, manual-review and scientific-row objects are required, even when their values can be null. The selector in an artifact_ref is optional. Metric objects require key, value and software_name; their remaining fields are optional. New closed shapes reject undeclared keys; parameter maps retain their documented open JSON contents.
- Submission paths beginning `submission.` describe a **separate proposed record**. They are not additional fields in the 0.3.0 entry/view schemas. Their names, types and vocabularies are proposals requiring a future schema, not implemented API fields.
- Entry and view rows whose Definition begins with **Proposed.** are not defined in the 0.3.0 schemas. They describe additions for review. Adding them to the schemas is a minor-version change.

## Entry identity, constructs, samples and files

The following fields retain the existing entry organization. Descriptive conventions remain useful where the schema has not yet constrained their internal shape.

### Identity and versioning

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `schema_version` | Assigned here | `0.3.0` only | Version of the record format. |
| `id` | Assigned here | `hdx_` + 8 characters (0-9, a-z) | Entry ID reproducible while its generation key remains unchanged; this does not establish a global persistent resolver. |
| `kind` | Assigned here | `hdx`, `structure` | HDX measurement or reference structure. |
| `state` | Assigned here | `new`, `active`, `deleted` | Lifecycle of the entry. |
| `revision.revision_number` | Assigned here | Integer ≥ 1 | Version number of the content. |
| `revision.parent_revision_id` | Assigned here | Revision ID or null | Previous version. |
| `revision.state` | Assigned here | `pending`, `in_review`, `active`, `rejected`, `archived` | Review status of this version. |
| `revision.published_at` | Assigned here | Date string or null; format not enforced | Publication date of the version. |
| `revision.change_summary` | Assigned here | Free text or null | What changed. |
| `title` | PDB, or assigned here | Free text | Short description. |
| `citation` | Paper | Free text; no citation format | Publication to cite. |

### Experiment

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `method` | Assigned here; PDB `_exptl.method` | Text; PDBx/mmCIF method names by convention for structures; no controlled vocabulary enforced | Experimental technique. |
| `method_source` | Assigned here | Free text | Where the method was read from. |
| `resolution` | PDB `_refine.ls_d_res_high` | Number in Å by convention; undeclared property | Existing display field for X-ray resolution. It is not explicitly constrained by entry schema 0.3.0. |
| `ligands` | PDB `_pdbx_nonpoly_scheme` | Array of text; CCD codes by convention | Small molecules in the deposited structure, water excluded. CCD membership is not schema-validated. |

### Protein and constructs

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `polymer_entities[].id` | Assigned here | Label, e.g. `pe_1` | One distinct sequence or construct. |
| `polymer_entities[].description` | Dataset name; PDB `_entity.pdbx_description` | Free text | Name of the protein. |
| `polymer_entities[].construct` | Assigned here | Free text or null | Version of the protein measured (e.g. His-tag + TEV site + ecDHFR). |
| `polymer_entities[].sequence` | HXMS, PDB | Text; amino-acid codes by convention | Sequence of the measured construct. The schema does not validate its alphabet. |
| `polymer_entities[].source_organisms` | PRIDE organism | Array; NCBI Taxonomy name/ID by convention | Source organism. The array member shape and taxonomy vocabulary are not validated by the schema. |
| `polymer_entities[].mutations` | Assigned here | Array of text; substitution notation by convention | Amino-acid changes from the parent sequence. Mutation numbering is unresolved; syntax is not constrained. |
| `polymer_entities[].uniprot_mappings` | UniProt; checked by alignment (ecDHFR) | Array; UniProt mapping conventions | Accession, mapping method and release by project convention. The entry schema does not constrain array members or enforce release availability. |

### HDX samples (extension)

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `hdx.samples[].id` | Assigned here | Label | One sample (construct or state). |
| `hdx.samples[].polymer_entity` | Assigned here | A polymer-entity ID in the entry | Construct used. |
| `hdx.samples[].state` | HXMS `PROTEIN_STATE` | Undeclared property; text by convention | Sample state, such as apo, methotrexate or trimethoprim. Not explicitly constrained in samples. |
| `hdx.samples[].ligand` | Assigned here; verified against the RCSB CCD | Undeclared property; CCD code or null by convention | Ligand assigned to the sample. This field does not establish binding occupancy. |
| `hdx.samples[].replicates` | HXMS `REP` | Undeclared property; integers in current records | Replicate run IDs. Use strings in the new canonical scientific tables. |
| `hdx.samples[].pH` | HXMS `pH(READ)` | Number or null | Labeling pH. Interpret only with `pH_kind`. |
| `hdx.samples[].pH_kind` | Source methods; HXMS `pH(READ)` header | Required; `pH read`, `pD corrected`, `not recorded` | Proposed. Convention of `pH`. `pH read`: uncorrected glass-electrode reading of the D₂O labeling solution, as in HXMS `pH(READ)`. `pD corrected`: the reading plus an isotope correction, recorded in `conditions.labeling.ph_correction`. `not recorded`: the source gives no convention, or `pH` is null. Replaces the undeclared text property. |
| `hdx.samples[].temperature_kelvin` | HXMS | Number (K) or null | Labeling temperature. |
| `hdx.samples[].buffer` | Source methods | Free text or null | Labeling buffer. |
| `hdx.samples[].d2o_saturation` | HXMS | Undeclared property; fraction 0–1 by convention | Legacy. Labeling-buffer deuterium fraction. Not explicitly constrained in samples; controls.details.d2o_fraction is constrained. Superseded by the proposed `conditions.labeling.d2o_fraction`. |
| `hdx.samples[].labeling_times_s` | HXMS `TIME(Sec)` | Array of numbers or nulls | Actual D₂O exposure times in seconds by convention. The legacy field does not enforce nonnegative times. |
| `hdx.samples[].source` | Assigned here | Object requiring artifact and rows keys | Source of the sample metadata. This legacy object does not type those keys; use artifact_ref for new workflow links. |
| `hdx.peptide_map` | Computed here (HXMS) | Open object | Historical count/coverage summary reconstructed from HXMS in the current build. It is not an independently validated undeuterated identification map. |
| `hdx.samples[].conditions` | Source methods; PRIDE sample and data processing protocols; submitter | `sample_conditions` object | Proposed. Labeling, quench, digestion, LC and MS conditions of the sample, defined below. |

### Sample-handling conditions (proposed)

Proposed shape: `$defs/sample_conditions`. Field names are relative to `hdx.samples[].conditions`. All rows are proposed and not in schema 0.3.0. Like other new closed shapes, all listed keys are required and values can be null. Labeling pH and temperature remain in `hdx.samples[].pH`, `pH_kind` and `temperature_kelvin`. Unless stated otherwise, the source of every field is the source methods, PRIDE sample and data processing protocols, or the submitter.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `labeling`, `quench`, `digestion`, `lc`, `ms` | Source methods; submitter | Condition-block objects | Proposed. One block per experimental step. |
| `<block>.status` | Source methods; submitter | `recorded`, `not recorded`, `not applicable` | Proposed. Whether the block's conditions are reported. `not applicable` covers steps the method does not use. Statuses other than `recorded` require null values in the block's other fields. |
| `<block>.notes` | Source methods; submitter | Text or null | Proposed. Source wording that the typed fields cannot hold, including ambiguous ratios or units. |

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `labeling.protein_concentration_um` | Source methods; submitter | Number ≥ 0 or null | Proposed. Protein concentration in the labeling reaction, in µM. If the source gives only a stock concentration, use null and record the stock value in `labeling.notes`. |
| `labeling.dilution_factor` | Source methods; submitter | Number ≥ 1 or null | Proposed. Final labeling volume divided by the protein-solution volume. A source ratio such as "1:10" is ambiguous (1 + 9 or 1 + 10 volumes); keep the source text in `labeling.notes` and use null unless the convention is stated. |
| `labeling.d2o_fraction` | Source methods; submitter | Number ≥ 0 ≤ 1 or null | Proposed. Final D₂O fraction in the labeling reaction after dilution. Distinct from `controls.details.d2o_fraction`, which describes the control solution. |
| `labeling.ph_correction` | Source methods; submitter | Number or null | Proposed. Constant added to the glass-electrode reading to give pD. Required as a number when `pH_kind` is `pD corrected`; null otherwise. |
| `quench.ph` | Source methods; submitter | Number or null | Proposed. pH of the quench solution or of the quenched sample, as reported; state which in `quench.notes`. |
| `quench.temperature_kelvin` | Source methods; submitter | Number ≥ 0 or null | Proposed. Quench temperature, in K. |
| `quench.additives[]` | Source methods; submitter | Array of additive objects | Proposed. Denaturants, reductants and other quench components, using the additive fields below. |
| `digestion.mode` | Source methods; submitter | `online`, `offline`, `not recorded` | Proposed. Whether proteolysis ran on an inline protease column or separately before injection. |
| `digestion.proteases[].name` | Source methods; submitter | Nonempty text | Proposed. Protease as reported, such as pepsin. List several in order of use. |
| `digestion.proteases[].term_id` | Curator | CURIE or null; `eccode:` EC number or PSI-MS cleavage-agent term | Proposed. Term for the protease, such as `eccode:3.4.23.1` (pepsin A). |
| `digestion.column` | Source methods; submitter | Text or null | Proposed. Immobilized-protease column product or description, as reported. |
| `digestion.time_s` | Source methods; submitter | Number ≥ 0 or null | Proposed. Digestion time, in seconds. For online digestion, null unless a residence time is reported; record the flow rate in `digestion.notes`. |
| `digestion.temperature_kelvin` | Source methods; submitter | Number ≥ 0 or null | Proposed. Digestion temperature, in K. |
| `lc.trap_column` | Source methods; submitter | Text or null | Proposed. Trap column product or description, as reported. |
| `lc.analytical_column` | Source methods; submitter | Text or null | Proposed. Analytical column product or description, as reported. |
| `lc.gradient_length_s` | Source methods; submitter | Number ≥ 0 or null | Proposed. Duration of the analytical gradient, in seconds; not the total run time. |
| `lc.temperature_kelvin` | Source methods; submitter | Number ≥ 0 or null | Proposed. Temperature of the trap and analytical columns, in K. If they differ, record both in `lc.notes` and use null. |
| `ms.instrument.name` | Source methods; submitter | Nonempty text or null | Proposed. Mass spectrometer model, as reported. |
| `ms.instrument.term_id` | Curator | CURIE or null; PSI-MS instrument-model term (descendant of `MS:1000031`) | Proposed. Term for the instrument model. |
| `ms.ion_mobility` | Source methods; submitter | `used`, `not used`, `not recorded` | Proposed. Whether ion-mobility separation was part of the acquisition. |
| `ms.ion_mobility_method` | Source methods; submitter | Text or null | Proposed. Ion-mobility technique, such as travelling-wave or drift-tube; null unless `ms.ion_mobility` is `used`. |

Additive objects (`quench.additives[]`):

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `role` | Source methods; submitter | `denaturant`, `reductant`, `other` | Proposed. Function of the component in the quench. |
| `name` | Source methods; submitter | Nonempty text | Proposed. Component as reported, such as guanidine hydrochloride or TCEP. |
| `term_id` | Curator | CURIE or null; ChEBI | Proposed. Term for the chemical entity. |
| `concentration` | Source methods; submitter | Number ≥ 0 or null | Proposed. Reported concentration. |
| `concentration_basis` | Source methods; submitter | `final`, `quench buffer`, `not recorded` | Proposed. Whether the concentration is after mixing with the sample or in the quench buffer before mixing. |
| `unit` | Source methods; submitter | Text or null | Proposed. Concentration unit, such as M or mM. |
| `unit_term_id` | Curator | CURIE or null; UO | Proposed. Term for `unit`. |

### Files

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `artifacts[].id` | Assigned here | Label | One file. |
| `artifacts[].name` | PRIDE, RCSB, journal | File name | File name. |
| `artifacts[].level` | Assigned here | `L0`, `L1`, `L2`, `L3` | Raw, processed, interpreted, mapped to structure. |
| `artifacts[].type` | Assigned here | `model`, `structure_factors`, `fasta`, `other` | Role of the file. |
| `artifacts[].format` | Assigned here | Open list, lowercase (e.g. `mmcif`, `json`, `hxms`, `mzml.gz`, `mgf`, `csv`) | File encoding. Lowercase names are conventional, not a schema enumeration. |
| `artifacts[].uri` | PRIDE FTP, RCSB, journal | Text | Artifact locator. URL or registry-relative path by convention; URI syntax and accessibility are not validated. |
| `artifacts[].size_bytes` | PRIDE listing; measured here | Integer ≥ 0 | File size. |
| `artifacts[].sha256` | Computed here (`fetch.py`) | 64 lowercase hex characters, or null | Checksum of the bytes. |
| `artifacts[].license` | PRIDE, RCSB | Free text; SPDX IDs where known (`CC0-1.0`, `CC-BY-4.0`), else `unknown` or `unverified` | Reuse terms. |
| `artifacts[].stored` | Assigned here | true, false | Hosted here, or linked only. |
| `undeclared_inputs` | Assigned here | Array of text | Needed sources with no known location; retain the missing-location explanation. |

### Processing steps (runs)

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `runs[].id` | Assigned here | Label | One processing step. |
| `runs[].software_name` | PRIDE protocol, paper, this repository | Free text (no canonical software list) | Program used. |
| `runs[].software_version` | PRIDE protocol; GitHub commit; this repository | Text or null | Software version or code commit where recorded; the schema does not validate commit length or establish which version was executed. |
| `runs[].command` | This repository | Free text or null | Command run. |
| `runs[].parameters` | PRIDE protocol; this repository `PARAMS` | JSON object or null | Settings and thresholds. |
| `runs[].inputs[].artifact` | Assigned here | Artifact ID | File read. |
| `runs[].outputs[].artifact` / `.model` | Assigned here | Artifact or model ID | File or model produced. |
| `runs[].*.selector` | Assigned here | Lists of field names and row IDs | Part of a shared file used. |

### Interpretations (models)

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `models[].id` | Assigned here | `<entry id>_m_NNN` | One interpretation. |
| `models[].revision_number` | Assigned here | Integer | Model revision number. A positive minimum is not enforced here. |
| `models[].title` | Assigned here | Free text | Short description. |
| `models[].model_type` | Assigned here | `Single Conformer`, `Multiconformer`, `Ensemble`, `Deposited`, `HDX ΔG set`, `HDX differential set` (the last two are extensions) | Kind of model. |
| `models[].purpose` | Assigned here | `Model Building`, `Refinement`, `Reference` | Why the model exists. |
| `models[].model_source` | Assigned here | `pdb`, `ext` | Origin of the model. |
| `models[].authors` | Paper; this repository | Array of text | Authors of the source interpretation or computation. |
| `models[].run` | Assigned here | Run ID | Step that produced it. |
| `models[].primary_artifact` | Assigned here | Artifact ID | Primary artifact, usually the coordinate file for an atomic model. |
| `models[].source` | Assigned here | Artifact ID + selector | Where its values are stored. |
| `models[].residue_frame` | Assigned here | Object requiring entry, model and mapping keys | Reference numbering frame. Legacy contents are not typed; canonical mapping_row provides explicit residue identifiers. |
| `models[].ensemble_members` | Computed here (PDB) | Integer | Conformers in the structure. |
| `models[].atom_count` | Computed here (PDB) | Integer | Non-hydrogen atoms (first conformer). |
| `models[].modeled_residues` | Computed here (PDB) | Integer | Residues with coordinates. |
| `models[].unique_protein_chains` | Assigned here | Integer | Distinct protein chains. |
| `models[].metrics[]` | Source analysis output; computed here | Key: free text (Dynamic PDB's 10 keys plus HDX extensions); value: number; unit: free text | Summary values, each with producing software. |

### Per-residue values

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `models[].residue_data[].sample` | Assigned here | Sample ID | Sample the value belongs to. |
| `models[].residue_data[].label_asym_id` | PDB `_pdbx_poly_seq_scheme` | mmCIF chain ID | Chain, internal numbering. |
| `models[].residue_data[].label_seq_id` | PDB | Integer | Residue position, internal numbering. |
| `models[].residue_data[].label_comp_id` | PDB | CCD code | Amino-acid type. |
| `models[].residue_data[].auth_asym_id` | PDB | Chain ID | Chain as labeled by the authors. |
| `models[].residue_data[].auth_seq_id` | PDB | Integer | Residue number used in papers. |
| `models[].residue_data[].pdbx_pdb_ins_code` | PDB | Text or null | Insertion code. |

### Links between entries

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `external_refs` | PRIDE, PDB, paper | Keys `pdb` (4-character ID), `pride` (`PXD` + 6 digits), `doi`, `hxms_doi` (DOIs) | Archive references by convention; this entry object is open and does not enforce the listed keys or accession syntax. |
| `view` | Computed here | `view_` + lowercase letters and digits | Cross-entry view of the entry. |
| `linked_entries[].entry` | Computed here | Entry ID | Linked entry. |
| `linked_entries[].method` | Assigned here | Free text | Its method. |
| `linked_entries[].basis` | Assigned here | Free text | Why linked. |
| `extensions` | Assigned here | Array of text | Fields or values outside Dynamic PDB v0.2.0. |

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `artifacts[].processing_roles` | Assigned here from selected content | `L0`, `L1a`, `L1b`, `L1c`, `L1d`, `L1 technical reproducibility`, `L2`, `L3`; unique array | Optional finer roles within a multi-level file; selectors identify the actual content used. |
| `runs[].stage` | Assigned here | The ten peptide workflow stage names below | Optional scientific stage of the run. Parsing/import is recorded as a generic run; it is not a new scientific stage. |
| `hdx.peptide_workflow` | Archived evidence and declared processing | `peptide_workflow` object | Structured peptide workflow; all ten stage reports are required when this object is present. |

## Workflow stages and reporting status

Entry prefix: `hdx.peptide_workflow`. A peptide view carries the same canonical workflow at `peptide_workflow`; its IDs refer to the owning entry. Mirroring equality needs an application check. Peptide entries using the current method label or declaring a peptide map/workflow must supply this workflow; other methods do not require it.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `hdx.peptide_workflow.identification` | Archived evidence; submitter; processing runs | Stage-report object | L1a identification and undeuterated peptide map. |
| `hdx.peptide_workflow.envelope_processing` | Archived evidence; submitter; processing runs | Stage-report object | L1b upstream extraction and quality evaluation of per-charge envelopes. |
| `hdx.peptide_workflow.uptake` | Archived evidence; submitter; processing runs | Stage-report object | L1b charges-merged measurements with actual times and replicate identities. |
| `hdx.peptide_workflow.controls` | Archived evidence; submitter; processing runs | Stage-report object | L1c FD controls, maximum-uptake estimates or exchange reporters, if available. |
| `hdx.peptide_workflow.calibration` | Archived evidence; submitter; processing runs | Stage-report object | L1d separate correction branches retaining their original inputs. |
| `hdx.peptide_workflow.reproducibility` | Archived evidence; submitter; processing runs | Stage-report object | L1 technical reproducibility, distinct from L2 interpretation. |
| `hdx.peptide_workflow.validity` | Archived evidence; submitter; processing runs | Stage-report object | L2 accepted/excluded/not-tested decisions about L1 measurements. |
| `hdx.peptide_workflow.differential` | Archived evidence; submitter; processing runs | Stage-report object | L2 tests and parameter-dependent peptide classes. |
| `hdx.peptide_workflow.projection` | Archived evidence; submitter; processing runs | Stage-report object | L2 projection from overlapping peptides in construct numbering; no structure required. |
| `hdx.peptide_workflow.structural_mapping` | Archived evidence; submitter; processing runs | Stage-report object | L3 mapping to structural models; not agreement or validation. |

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `<stage>.status` | Source documentation; submitter; registry | `recorded`, `not recorded`, `not performed`, `not applicable` | Whether stage information is available or the step was performed/applicable. Recorded can still contain explicitly unknown detail fields. |
| `<stage>.reason` | Source documentation or submitter | Nonempty text or null | Explanation. Non-recorded statuses require nonempty text. |
| `<stage>.runs` | Entry run graph | Unique array of nonempty run IDs | Recorded stages require at least one run; other statuses require an empty list. |
| `<stage>.sources` | Archived files and source metadata | Array of artifact_ref objects | Recorded stages require at least one source. Other statuses may cite evidence for their explanation. |
| `<stage>.details` | Stage-specific sources | Typed stage-details object or null | Recorded stages require the appropriate object; all other statuses require null. |

## Shared reference, software, criterion, review and table shapes

### Selectors

Shape: `$defs/selector`. Field names in this table are relative to that object.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `fields` | Source file layout; importer or run declaration | Array of Text | Source fields selected from a shared file; an empty or absent list does not establish field-level separation. |
| `rows` | Source file layout; importer or run declaration | Array of Text | Source row identifiers selected from a shared file, not necessarily physical line numbers. |

### Artifact references

Shape: `$defs/artifact_ref`. Field names in this table are relative to that object.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `artifact` | Entry artifact registry and source file layout | Text | ID of an artifact in the owning entry; the supplemental validator checks local existence. |
| `selector` | Entry artifact registry and source file layout | `selector` object | Optional fields/rows selection using the selector shape. |

### Software

Shape: `$defs/software`. Field names in this table are relative to that object.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `name` | PRIDE protocol; source software output; execution log | Text | One actual tool, not a concatenated pipeline description. |
| `version` | PRIDE protocol; source software output; execution log | Text or null | Recorded version or commit. Null when not recorded; a related repository snapshot does not establish executed software. |
| `role` | PRIDE protocol; source software output; execution log | Text | Operation performed by this tool, such as sequence matching or envelope extraction. |

### Acceptance and statistical criteria

Shape: `$defs/criterion`. Field names in this table are relative to that object.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `name` | Source methods; submitter; declared analysis parameters | Text | Name used to identify the rule or threshold. |
| `operator` | Source methods; submitter; declared analysis parameters | `<`, `<=`, `=`, `>=`, `>`, `in`, `custom`, `not recorded` | Comparison operator, custom rule or explicitly unrecorded operator. |
| `value` | Source methods; submitter; declared analysis parameters | number, string, array, null or null | Threshold or accepted set. A source value is required for a scientific claim; null records an unavailable value. |
| `unit` | Source methods; submitter; declared analysis parameters | Text or null | Threshold unit; null when inapplicable or unrecorded. |
| `scope` | Source methods; submitter; declared analysis parameters | Text | Objects and conditions to which the criterion applies. |
| `method` | Source methods; submitter; declared analysis parameters | Text or null | Rule definition, formula or statistical method; null if unrecorded. |
| `source` | Source methods; submitter; declared analysis parameters | `artifact_ref` object or `null` | Artifact/selector supporting the criterion, or null if no source is recorded. |

### Manual review

Shape: `$defs/manual_review`. Field names in this table are relative to that object.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `status` | Recorded curation or envelope-review history | `performed`, `not performed`, `not recorded` | Whether manual review is documented as performed, not performed or not recorded. |
| `method` | Recorded curation or envelope-review history | Text or null | Review criteria and procedure, not an inferred meaning of a CLEANED filename. |
| `reviewer` | Recorded curation or envelope-review history | Text or null | Recorded reviewer name or identifier; null when unavailable. |
| `reviewed_at` | Recorded curation or envelope-review history | Text or null | Recorded review date/time; string format is not enforced. |
| `record` | Recorded curation or envelope-review history | `artifact_ref` object or `null` | Source curation/review artifact and optional selector; null if absent. |

### Scientific table representation

These fields apply to every `$defs/*_table`: `peptide_table`, `envelope_table`, `uptake_table`, `control_table`, `calibrated_table`, `reproducibility_table`, `validity_table`, `differential_table`, `projection_table` and `mapping_table`. Supply either inline records or an external source plus complete column mapping, not both representations.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `source` | Registered artifact and source layout | artifact_ref object | External table and selected content; requires columns and excludes inline records. |
| `columns.<canonical_field>` | Parser mapping; submitter resolution | Nonempty source-field text for every field in the corresponding row shape | Maps a canonical field to a field in a normalized source table. It does not transform bytes or validate external rows. |
| `records[]` | Source file; declared computation | Array of the corresponding typed row objects | Inline scientific records. Excludes source and columns; empty arrays are schema-allowed and do not establish completeness. |

### Term identifiers (proposed)

All rows in this section are proposed and not in schema 0.3.0. A term ID is a CURIE (`prefix:local_id`) whose prefix is registered in Bioregistry. It sits beside the label it identifies. The label remains the display text and the source wording. A term ID is null when no term has been selected. Selecting a term from a label is a curation step: record it in the run or import that adds the term, and do not assign terms from label text alone. CCD codes in `ligands` and `hdx.samples[].ligand` are already registry identifiers and need no separate term ID. Fields with a fixed unit in their name, such as `time_s` or `temperature_kelvin`, need no unit term.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `method_term_id` | Curator; source methods | CURIE or null; OBI by convention | Proposed. Assay term for `method`. HDX entries use `OBI:0001976` (hydrogen/deuterium exchange footprinting assay) for peptide-level HDX-MS. No more specific ontology term for this method was found (OLS4 search, 2026-10-21: OBI, ECO, CHMO, PSI-MS, EDAM, MeSH). `ECO:0006195` and `ECO:0006175` describe evidence for annotation assertions, not dataset methods, and are not used here. `mesh:D000080307` suits keyword or DataCite subject fields, not this field. Structure entries keep the PDBx `_exptl.method` value in `method`; their term is not yet selected. |
| `method_qualifier_term_ids` | Curator; source methods | Array of CURIEs; PSI-MS or CHMO by convention; may be empty | Proposed. Readout terms that qualify the assay term. Peptide-level HDX-MS: `MS:1003355` (bottom-up proteomics). |
| `polymer_entities[].source_organisms[]` | PRIDE organism; NCBI Taxonomy | Object with `name` (text) and `term_id` (`NCBITaxon:` + integer, or null) | Proposed. Typed member shape replacing the untyped array members, such as `NCBITaxon:562` (*Escherichia coli*). Empty array for designed proteins. |
| `software.term_id`, `runs[].software_term_id`, `models[].metrics[].software_term_id` | Curator | CURIE or null; `biotools:` or `RRID:` | Proposed. Registry entry for the tool. It identifies the tool, not the executed version. |
| `unit_term_id` | Curator; importer | CURIE or null; UO | Proposed. Sibling of every `unit` field: metrics, envelope `scores[]`, calibrated, reproducibility, differential and projection rows, criteria and derivations. For example, `UO:0000010` (second). |
| `artifacts[].format_term_id` | Curator; importer | CURIE or null; EDAM format (`EDAM:format_NNNN`) | Proposed. Term for `format`. Null when EDAM has no term for the format. |
| `artifacts[].license_term_id` | Source terms | CURIE or null; `spdx:` + SPDX ID | Proposed. Term for `license`. Null for `unknown` and `unverified`. |
| `citation_doi` | Paper | CURIE or null; `doi:` + DOI | Proposed. DOI of the publication in `citation`, such as `doi:10.1093/bioinformatics/btag113`. |
| `digestion.proteases[].term_id`, `quench.additives[].term_id`, `quench.additives[].unit_term_id`, `ms.instrument.term_id` | Curator | See Sample-handling conditions | Proposed. Term IDs inside `hdx.samples[].conditions`. |

## L1a identification metadata

### Identification details

Shape: `$defs/identification_details`. Field names in this table are relative to that object.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `input_labeling` | Undeuterated identification files; PRIDE processing protocol; source methods; curation records | `undeuterated`, `labeled`, `not recorded` | Labeling state of the identification input. The peptide-map workflow normally uses undeuterated samples; source deviations remain explicit. |
| `software` | Undeuterated identification files; PRIDE processing protocol; source methods; curation records | Array of `software` object; at least 1 item(s) | Individual identification/deconvolution/sequence-matching tools and versions; at least one. |
| `strategy` | Undeuterated identification files; PRIDE processing protocol; source methods; curation records | Text or null | Identification strategy; null if not recorded. |
| `sequence_database` | Undeuterated identification files; PRIDE processing protocol; source methods; curation records | Object | Search-space name, version and source, using the nested fields below. |
| `search_parameters` | Undeuterated identification files; PRIDE processing protocol; source methods; curation records | Object | Source search settings, such as enzyme constraint and mass tolerances; arbitrary JSON keys, not inferred acceptance thresholds. |
| `acceptance_criteria` | Undeuterated identification files; PRIDE processing protocol; source methods; curation records | Array of `criterion` object | Criteria that accept or reject identifications; criterion objects. |
| `acceptance_criteria_status` | Undeuterated identification files; PRIDE processing protocol; source methods; curation records | `recorded`, `not recorded` | Recorded requires at least one criterion; not recorded requires an empty criteria array. |
| `curation` | Undeuterated identification files; PRIDE processing protocol; source methods; curation records | `manual_review` object | Manual-review metadata and source history. |
| `peptide_map` | Undeuterated identification files; PRIDE processing protocol; source methods; curation records | `peptide_table` object | Identification map with evidence and retained excluded candidates; not merely the subset observed in uptake files. |
| `notes` | Undeuterated identification files; PRIDE processing protocol; source methods; curation records | Text or null | Identification scope or limitations; null if none recorded. |

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `sequence_database.name` | Search configuration or source methods | Nonempty text or null | Sequence database or supplied-target sequence set searched. |
| `sequence_database.version` | Search configuration | Nonempty text or null | Database release or sequence-set version. |
| `sequence_database.source` | Archived search input | artifact_ref object or null | Exact searched sequence artifact, where recorded. |

### Peptide map rows

Shape: `$defs/peptide_row`. Field names in this table are relative to that object.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `id` | Identification output; construct sequence; curation history | Text | Stable peptide identifier within the mapped construct/table. |
| `polymer_entity` | Identification output; construct sequence; curation history | Text | Construct ID in the entry. |
| `start` | Identification output; construct sequence; curation history | Integer ≥ 1 | One-based inclusive construct start position. |
| `end` | Identification output; construct sequence; curation history | Integer ≥ 1 | One-based inclusive construct end position; ordering and sequence consistency require application checks. |
| `sequence` | Identification output; construct sequence; curation history | Text | Identified peptide sequence; amino-acid alphabet is not constrained by this row schema. |
| `evidence` | Identification output; construct sequence; curation history | Array of `artifact_ref` object | MS/MS spectra, identification rows, scores or related source selectors; empty means no links supplied. |
| `flags` | Identification output; construct sequence; curation history | Array of Text | Recorded quality or ambiguity flags. An empty list does not establish that every quality check was performed. |
| `decision` | Identification output; construct sequence; curation history | `accepted`, `excluded`, `unresolved`, `not recorded` | Identification acceptance/curation decision; retain excluded candidates. |
| `reason` | Identification output; construct sequence; curation history | Text or null | Reason for the decision or unresolved identification; null if not recorded. |

## L1b envelope processing and charge merging

### Envelope processing details

Shape: `$defs/envelope_processing_details`. Field names in this table are relative to that object.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `software` | Processing software exports; acquisition/analysis logs; source methods and review records | Array of `software` object; at least 1 item(s) | Individual deconvolution, extraction and conversion tools with roles and recorded versions. |
| `extraction_method` | Processing software exports; acquisition/analysis logs; source methods and review records | Text or null | Chromatographic/mass-window and envelope-selection method, or null when not recorded. |
| `uptake_method` | Processing software exports; acquisition/analysis logs; source methods and review records | Text or null | How envelope or centroid information produces uptake; null if not recorded. |
| `parameters` | Processing software exports; acquisition/analysis logs; source methods and review records | Object | Source extraction settings. Empty object means no structured parameters supplied, not default settings verified. |
| `quality_criteria` | Processing software exports; acquisition/analysis logs; source methods and review records | Array of `criterion` object | Envelope acceptance or exclusion rules. |
| `quality_criteria_status` | Processing software exports; acquisition/analysis logs; source methods and review records | `recorded`, `not recorded` | Recorded requires at least one criterion; not recorded requires an empty array. |
| `manual_validation` | Processing software exports; acquisition/analysis logs; source methods and review records | `manual_review` object | Manual envelope review status, method and history. |
| `envelopes` | Processing software exports; acquisition/analysis logs; source methods and review records | `envelope_table` object | Per-charge envelope evidence table, retaining excluded or unresolved records. |
| `notes` | Processing software exports; acquisition/analysis logs; source methods and review records | Text or null | Extraction limitations, including unavailable tool versions or quality-score definitions. |

### Envelope evidence rows

Shape: `$defs/envelope_row`. Field names in this table are relative to that object.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `id` | Per-charge HXMS/software output and envelope review history | Text | Per-charge envelope record ID. |
| `peptide` | Per-charge HXMS/software output and envelope review history | Text | Peptide-map ID. |
| `sample` | Per-charge HXMS/software output and envelope review history | Text | Sample ID in the entry. |
| `state` | Per-charge HXMS/software output and envelope review history | Text | Experimental state label; retain source-to-normalized mapping. |
| `replicate` | Per-charge HXMS/software output and envelope review history | Text | Replicate identifier, not charge-state identifier. |
| `time_s` | Per-charge HXMS/software output and envelope review history | Number ≥ 0 or null | Actual labeling time in seconds, or null for an explicitly typed control without a finite labeling time. |
| `control_type` | Per-charge HXMS/software output and envelope review history | `labeling`, `undeuterated`, `fully deuterated`, `internal reporter`, `other` | Distinguishes labeling observations, undeuterated/FD controls, reporters and other controls. |
| `charge` | Per-charge HXMS/software output and envelope review history | Integer ≥ 1 | Positive charge-state magnitude in the current schema. |
| `retention_time_s` | Per-charge HXMS/software output and envelope review history | Number ≥ 0 or null | Retention time in seconds; conversion from source units must be recorded. |
| `spectrum` | Per-charge HXMS/software output and envelope review history | `artifact_ref` object | Artifact/selector locating envelope peaks or spectral evidence. |
| `centroid_mz` | Per-charge HXMS/software output and envelope review history | Number > 0 or null | Proposed. Intensity-weighted centroid m/z of the isotopic envelope at this charge. Null when the source does not report it. |
| `centroid_mass_da` | Per-charge HXMS/software output and envelope review history | Number > 0 or null | Proposed. Neutral centroid mass, in Da. When computed here from `centroid_mz`, it is (centroid_mz − 1.007276) × charge, recorded as a computed-here transformation. |
| `reference_envelope` | Per-charge HXMS/software output and envelope review history | Text or null | Proposed. ID of the envelope row (control_type `undeuterated`) whose centroid defines zero uptake for this peptide and charge. Null for undeuterated rows and when `reference_kind` is not `undeuterated measurement`. |
| `reference_kind` | Per-charge HXMS/software output and envelope review history | `undeuterated measurement`, `theoretical`, `not recorded` | Proposed. Basis of zero uptake. `undeuterated measurement` requires `reference_envelope`; `theoretical` means a computed peptide mass. |
| `uptake_da` | Per-charge HXMS/software output and envelope review history | Number or null | Per-charge peptide mass uptake in Da, not an unconverted m/z shift. With the proposed fields, it can be recomputed as `centroid_mass_da` minus the reference envelope's `centroid_mass_da`. |
| `scores` | Per-charge HXMS/software output and envelope review history | Array of Object | Named quality scores; definitions and thresholds belong to the processing criteria. |
| `flags` | Per-charge HXMS/software output and envelope review history | Array of Text | Recorded interference, overlap or other source flags; no canonical flag vocabulary is imposed. |
| `decision` | Per-charge HXMS/software output and envelope review history | `accepted`, `excluded`, `unresolved`, `not recorded` | Envelope acceptance decision, distinct from later L2 validity or differential significance. |
| `reason` | Per-charge HXMS/software output and envelope review history | Text or null | Explanation of acceptance, exclusion or unresolved status. |

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `scores[].name` | Software output or source definition | Nonempty text | Name of the quality score; no meaning inferred solely from the label. |
| `scores[].value` | Software output | Number or null | Reported score value. |
| `scores[].unit` | Software documentation | Nonempty text or null | Score unit, where applicable and recorded. |

### Uptake details

Shape: `$defs/uptake_details`. Field names in this table are relative to that object.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `identification_runs` | Source processing records; repository merge execution | Array of Text; at least 1 item(s) | At least one identification run supplying peptide identities. |
| `envelope_processing_runs` | Source processing records; repository merge execution | Array of Text; at least 1 item(s) | At least one upstream envelope-processing run. |
| `charge_merge_method` | Source processing records; repository merge execution | Text or null | Declared charge aggregation and fallback method; null if unrecorded. |
| `time_grouping_method` | Source processing records; repository merge execution | Text or null | Declared display or analysis time grouping; actual times remain in observations. |
| `parameters` | Source processing records; repository merge execution | Object | Aggregation weights, time tolerance and other actual settings. |
| `measurements` | Source processing records; repository merge execution | `uptake_table` object | Charge-merged, uncorrected uptake table with all measurement dimensions. |

### Merged uptake rows

Shape: `$defs/uptake_row`. Field names in this table are relative to that object.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `id` | Source per-charge records; declared charge merging | Text | Charge-merged observation ID. |
| `peptide` | Source per-charge records; declared charge merging | Text | Peptide-map ID. |
| `sample` | Source per-charge records; declared charge merging | Text | Sample ID. |
| `state` | Source per-charge records; declared charge merging | Text | Experimental state label. |
| `replicate` | Source per-charge records; declared charge merging | Text | Replicate experimental-unit ID. |
| `time_s` | Source per-charge records; declared charge merging | Number ≥ 0 | Actual finite labeling time, in seconds; not only a bin midpoint. |
| `time_bin` | Source per-charge records; declared charge merging | Text or null | Optional grouping identifier; null if no bin recorded. |
| `charges` | Source per-charge records; declared charge merging | Array of Integer ≥ 1; at least 1 item(s) | At least one contributing charge state; charges are not independent replicates. |
| `envelope_ids` | Source per-charge records; declared charge merging | Array of Text; at least 1 item(s) | At least one contributing per-charge envelope ID. |
| `uptake_da` | Source per-charge records; declared charge merging | Number or null | Uncorrected uptake in Da. Number required for reported; null required for excluded/no-value statuses. |
| `value_status` | Source per-charge records; declared charge merging | `reported`, `no value reported`, `excluded` | Distinguishes a reported value, absent source value and excluded observation. |
| `reason` | Source per-charge records; declared charge merging | Text or null | Missing-value or exclusion explanation if recorded. |

## L1c controls and maximum-uptake estimates

### Controls details

Shape: `$defs/controls_details`. Field names in this table are relative to that object.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `method` | Control files; methods; reporter observations; declared estimation runs | `fully deuterated`, `estimated maximum`, `internal reporters`, `combined`, `other` | Recorded control/estimation strategy; not a statement that maximal labeling was established. |
| `preparation` | Control files; methods; reporter observations; declared estimation runs | Text or null | Control preparation, time, temperature and other conditions; null when unrecorded. |
| `d2o_fraction` | Control files; methods; reporter observations; declared estimation runs | Number ≥ 0 ≤ 1 or null | Deuterium fraction of the control solution; distinguish it from the labeling-sample fraction. |
| `saturation_evidence` | Control files; methods; reporter observations; declared estimation runs | Text or null | Evidence supporting maximal labeling; null when absent. |
| `baseline_method` | Control files; methods; reporter observations; declared estimation runs | Text or null | Undeuterated or other baseline used to define uptake. |
| `pooling_method` | Control files; methods; reporter observations; declared estimation runs | Text or null | Matching or averaging across replicates, states or days. |
| `alternative_estimation_method` | Control files; methods; reporter observations; declared estimation runs | Text or null | Estimator or exchange-reporter treatment when applicable; null if unrecorded/inapplicable. |
| `measurements` | Control files; methods; reporter observations; declared estimation runs | `control_table` object | Control or estimated-maximum observations; estimated values remain distinguished by kind. |
| `limitations` | Control files; methods; reporter observations; declared estimation runs | Text or null | Recorded assumptions and limitations of the control or estimator. |

### Control rows

Shape: `$defs/control_row`. Field names in this table are relative to that object.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `id` | Control measurements or explicitly recorded estimator output | Text | Control or estimate ID. |
| `peptide` | Control measurements or explicitly recorded estimator output | Text | Associated peptide ID. |
| `sample` | Control measurements or explicitly recorded estimator output | Text | Associated sample ID. |
| `state` | Control measurements or explicitly recorded estimator output | Text | Associated experimental state. |
| `replicates` | Control measurements or explicitly recorded estimator output | Array of Text | IDs entering this control value or pooled estimate; schema permits an empty list. |
| `kind` | Control measurements or explicitly recorded estimator output | `fully deuterated`, `estimated maximum`, `internal reporter`, `other` | Whether the record is an FD measurement, estimate, reporter or other control. |
| `uptake_da` | Control measurements or explicitly recorded estimator output | Number or null | Control uptake or estimated maximum in Da; null when absent. |
| `uncertainty_da` | Control measurements or explicitly recorded estimator output | Number ≥ 0 or null | Nonnegative uncertainty in Da; uncertainty type must be stated in the method. |
| `evidence` | Control measurements or explicitly recorded estimator output | Array of `artifact_ref` object | Source observations or estimator inputs. |
| `flags` | Control measurements or explicitly recorded estimator output | Array of Text | Recorded control-quality flags. |

## L1d calibration and correction branches

### Calibration details

Shape: `$defs/calibration_details`. Field names in this table are relative to that object.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `corrections` | Declared correction executions | Array of `correction` object; at least 1 item(s) | At least one separately executed correction with retained original measurements. |

### Correction metadata

Shape: `$defs/correction`. Field names in this table are relative to that object.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `id` | Correction execution log and retained input/control artifacts | Text | Correction-branch ID; supplemental validator checks uniqueness within the stage. |
| `run` | Correction execution log and retained input/control artifacts | Text | Separate entry run for this correction; do not reuse the same run for another correction branch. |
| `method` | Correction execution log and retained input/control artifacts | `FD normalization`, `internal exchange reporter`, `other` | Correction method category; a custom method also needs its formula and parameters. |
| `formula` | Correction execution log and retained input/control artifacts | Text | Actual correction formula and scale conventions. |
| `parameters` | Correction execution log and retained input/control artifacts | Object; nonempty | Nonempty execution parameters matching those of the linked run. |
| `input_measurements` | Correction execution log and retained input/control artifacts | `artifact_ref` object | Exact input selection for this correction, which can be an earlier calibrated branch. |
| `uncorrected_measurements` | Correction execution log and retained input/control artifacts | `artifact_ref` object | Retained original L1b measurements from which reanalysis can start. |
| `controls` | Correction execution log and retained input/control artifacts | Array of `artifact_ref` object | Control/reporter input selections; at least one for FD or internal-reporter correction. |
| `output_measurements` | Correction execution log and retained input/control artifacts | `artifact_ref` object | Separate calibrated output selection; must not overlap preserved inputs or controls. |
| `preserves_inputs` | Correction execution log and retained input/control artifacts | `true` only | Required declaration that inputs remain available. Actual byte retention requires separate checks. |
| `missing_control_policy` | Correction execution log and retained input/control artifacts | Text | What happens when the required control is missing or unusable. |
| `zero_time_policy` | Correction execution log and retained input/control artifacts | Text | Handling of zero-time observations; state explicitly if forced to zero. |
| `uncertainty_method` | Correction execution log and retained input/control artifacts | Text or null | Uncertainty propagation method, or null when not recorded. |
| `limitations` | Correction execution log and retained input/control artifacts | Text or null | Assumptions, saturation/recovery limitations and other recorded qualifications. |
| `measurements` | Correction execution log and retained input/control artifacts | `calibrated_table` object | Typed calibrated table corresponding to output_measurements. |

### Calibrated measurement rows

Shape: `$defs/calibrated_row`. Field names in this table are relative to that object.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `id` | Computed here or imported source correction output | Text | Calibrated observation ID, separate from its input. |
| `input_observation` | Computed here or imported source correction output | Text | Immediate input observation ID; parent resolution requires an application/table check. |
| `peptide` | Computed here or imported source correction output | Text | Peptide ID. |
| `sample` | Computed here or imported source correction output | Text | Sample ID. |
| `state` | Computed here or imported source correction output | Text | Experimental state label. |
| `replicate` | Computed here or imported source correction output | Text | Replicate ID. |
| `time_s` | Computed here or imported source correction output | Number ≥ 0 | Actual labeling time in seconds. |
| `value` | Computed here or imported source correction output | Number or null | Calibrated value on the declared scale; null when unavailable. |
| `unit` | Computed here or imported source correction output | Text | Explicit output unit or scale, such as Da or fractional uptake; no enum is imposed. |
| `correction_run` | Computed here or imported source correction output | Text | Run that produced this row; checked against its correction for inline records. |
| `control_ids` | Computed here or imported source correction output | Array of Text | Control observations used, where recorded. |
| `reason` | Computed here or imported source correction output | Text or null | Reason for a missing or qualified output. |

## L1 technical reproducibility

### Reproducibility details

Shape: `$defs/reproducibility_details`. Field names in this table are relative to that object.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `level` | Replicate metadata and reproducibility calculation | `L1` only | Technical reproducibility belongs to L1. |
| `replicate_type` | Replicate metadata and reproducibility calculation | `technical`, `biological`, `mixed`, `not recorded` | Reported nature of repetition; do not infer independence from matching IDs. |
| `experimental_unit` | Replicate metadata and reproducibility calculation | Text or null | What was independently repeated, or null if unrecorded. |
| `grouping` | Replicate metadata and reproducibility calculation | Text or null | How measurements with compatible conditions are grouped. |
| `method` | Replicate metadata and reproducibility calculation | Text or null | Summary and dispersion calculation, or null if unrecorded. |
| `input_measurements` | Replicate metadata and reproducibility calculation | `artifact_ref` object | Exact uptake version summarized; identify uncorrected or calibrated inputs. |
| `summary` | Replicate metadata and reproducibility calculation | `reproducibility_table` object | Per-cell counts, mean and SD in declared units. |

### Reproducibility rows

Shape: `$defs/reproducibility_row`. Field names in this table are relative to that object.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `peptide` | Replicate observations and declared summary computation | Text | Peptide ID. |
| `sample` | Replicate observations and declared summary computation | Text | Sample ID. |
| `state` | Replicate observations and declared summary computation | Text | Experimental state. |
| `time_s` | Replicate observations and declared summary computation | Number ≥ 0 | Labeling time of the cell in seconds; time-bin summarization must be explained by grouping. |
| `replicate_ids` | Replicate observations and declared summary computation | Array of Text; at least 2 item(s) | At least two replicate IDs; uniqueness/independence is not established by the row schema. |
| `n` | Replicate observations and declared summary computation | Integer ≥ 2 | Count contributing to the summary; consistency with IDs requires an application check. |
| `mean` | Replicate observations and declared summary computation | Number or null | Mean uptake on the input scale; null if unavailable. |
| `sd` | Replicate observations and declared summary computation | Number ≥ 0 or null | Nonnegative uptake SD; null if unavailable. |
| `unit` | Replicate observations and declared summary computation | Text | Unit shared by mean and SD. |
| `input_observations` | Replicate observations and declared summary computation | Array of Text; at least 2 item(s) | At least two contributing observation IDs. |

## L2 validity, differential interpretation and residue projection

### Validity details

Shape: `$defs/validity_details`. Field names in this table are relative to that object.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `criteria` | Declared validity rules and source QC decisions | Array of `criterion` object | Rules deciding whether L1 measurements enter interpretation. |
| `criteria_status` | Declared validity rules and source QC decisions | `recorded`, `not recorded` | Recorded requires criteria; not recorded requires an empty list. |
| `input_measurements` | Declared validity rules and source QC decisions | `artifact_ref` object | Selected L1 measurement version evaluated. |
| `decisions` | Declared validity rules and source QC decisions | `validity_table` object | Per-observation accepted/excluded/not-tested ledger. |
| `notes` | Declared validity rules and source QC decisions | Text or null | Validity scope and unavailable evidence; null if not recorded. |

### Validity rows

Shape: `$defs/validity_row`. Field names in this table are relative to that object.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `observation` | Source QC or declared validity filtering run | Text | L1 observation ID assessed. |
| `decision` | Source QC or declared validity filtering run | `accepted`, `excluded`, `not tested` | Validity outcome, not differential significance. |
| `criteria` | Source QC or declared validity filtering run | Array of Text | Names or recorded labels of the applicable criteria; no rule-ID pattern is imposed. |
| `reason` | Source QC or declared validity filtering run | Text or null | Explanation of the outcome, or null if unavailable. |
| `flags` | Source QC or declared validity filtering run | Array of Text | Recorded validity flags. |

### Differential details

Shape: `$defs/differential_details`. Field names in this table are relative to that object.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `analysis_status` | Source interpretation or declared repository differential run | `exploratory`, `source reported` | Exploratory repository analysis or source-reported analysis; neither label establishes validation. |
| `test` | Source interpretation or declared repository differential run | Text or null | Actual statistical test, or null when unrecorded. |
| `alpha` | Source interpretation or declared repository differential run | Number \> 0 \< 1 or null | Nominal significance threshold; not automatically an overall error rate. |
| `effect_threshold` | Source interpretation or declared repository differential run | Text or null | Magnitude threshold and formula, including pooling/count rules. |
| `replicate_selection` | Source interpretation or declared repository differential run | Text or null | Rules selecting included observations and experimental units. |
| `pairing` | Source interpretation or declared repository differential run | `paired`, `unpaired`, `not recorded` | Whether the statistical test is paired or unpaired; shared-day selection alone is not a paired test. |
| `multiple_testing` | Source interpretation or declared repository differential run | Text or null | Multiplicity treatment; explicitly state none when known, null when unrecorded. |
| `sign_convention` | Source interpretation or declared repository differential run | Text | Direction of delta, such as state_b minus state_a. |
| `classification_rule` | Source interpretation or declared repository differential run | Text | How time-specific tests produce peptide classes. |
| `validity_runs` | Source interpretation or declared repository differential run | Array of Text | Prior validity runs used, if recorded; an empty list does not establish that data passed filtering. |
| `input_measurements` | Source interpretation or declared repository differential run | `artifact_ref` object | Exact uncorrected or calibrated input selection. |
| `results` | Source interpretation or declared repository differential run | `differential_table` object | Typed differential values, p-values and classes. |
| `limitations` | Source interpretation or declared repository differential run | Text or null | Recorded statistical and methodological limitations. |

### Differential rows

Shape: `$defs/differential_row`. Field names in this table are relative to that object.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `peptide` | Declared differential testing and classification | Text | Peptide ID. |
| `state_a` | Declared differential testing and classification | Text | First state label. |
| `state_b` | Declared differential testing and classification | Text | Second state label. |
| `time_s` | Declared differential testing and classification | Number ≥ 0 or null | Actual analysis time in seconds, or null for explicitly scoped aggregate results. |
| `time_bin` | Declared differential testing and classification | Text or null | Time grouping ID when used. |
| `delta` | Declared differential testing and classification | Number or null | Signed difference under the declared sign convention. |
| `unit` | Declared differential testing and classification | Text | Unit of delta. |
| `n_a` | Declared differential testing and classification | Integer ≥ 0 or null | Actual number of included state_a observations, or null if unavailable. |
| `n_b` | Declared differential testing and classification | Integer ≥ 0 or null | Actual number of included state_b observations, or null if unavailable. |
| `p_value` | Declared differential testing and classification | Number ≥ 0 ≤ 1 or null | Test p-value, or null when unavailable/undefined; distinguish adjusted values in the test description. |
| `significant` | Declared differential testing and classification | Boolean or null | Outcome under the declared statistical and effect-size rules; null if undetermined. |
| `class` | Declared differential testing and classification | `more rigid`, `more flexible`, `mixed`, `no observable difference`, `not tested` | Parameter-dependent HDX class. No observable difference means tested without a qualifying difference; not tested remains distinct. |
| `input_observations` | Declared differential testing and classification | Array of Text | Observation IDs used in this result. |
| `reason` | Declared differential testing and classification | Text or null | Explanation of an unavailable, untested or qualified result. |

### Projection details

Shape: `$defs/projection_details`. Field names in this table are relative to that object.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `analysis_status` | Source projection or declared repository projection run | `exploratory`, `source reported` | Exploratory or source-reported projection; does not establish individual-amide resolution. |
| `method` | Source projection or declared repository projection run | Text | Projection method from overlapping peptides. |
| `exchangeable_span` | Source projection or declared repository projection run | Text | Included/excluded peptide positions and treatment of prolines. |
| `overlap_rule` | Source projection or declared repository projection run | Text | How covering peptide results are combined or marked conflicting. |
| `weighting` | Source projection or declared repository projection run | Text or null | Weights used for numeric summaries; null when unrecorded/inapplicable. |
| `time_aggregation` | Source projection or declared repository projection run | Text or null | Which times enter each projected summary; disclose maxima drawn from different times. |
| `differential_runs` | Source projection or declared repository projection run | Array of Text; at least 1 item(s) | At least one source differential run. |
| `results` | Source projection or declared repository projection run | `projection_table` object | Projection table in construct numbering. |
| `limitations` | Source projection or declared repository projection run | Text or null | Peptide-resolution and other methodological qualifications. |

### Projection rows

Shape: `$defs/projection_row`. Field names in this table are relative to that object.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `polymer_entity` | Overlapping peptide results and declared projection method | Text | Construct ID. |
| `construct_position` | Overlapping peptide results and declared projection method | Integer ≥ 1 | One-based residue position in that construct. |
| `class` | Overlapping peptide results and declared projection method | `more rigid`, `more flexible`, `mixed`, `no observable difference`, `not tested` | Class summarized from covering peptides; a proline mask or other restriction belongs in exchangeable_span. |
| `value` | Overlapping peptide results and declared projection method | Number or null | Projected numeric summary, not automatically an individual-amide measurement. |
| `unit` | Overlapping peptide results and declared projection method | Text or null | Summary unit, or null when no numeric scale is supplied. |
| `peptides` | Overlapping peptide results and declared projection method | Array of Text; at least 1 item(s) | At least one contributing peptide ID. |
| `time_scope` | Overlapping peptide results and declared projection method | Text or null | Time or aggregation scope of this summary; null if unrecorded. |

Projection rows have no explicit comparison-ID field. Scope each table/selector to the relevant state comparison and record that scope in its source metadata; the row schema alone cannot recover it.

## L3 mapping to structural models

### Structural mapping details

Shape: `$defs/structural_mapping_details`. Field names in this table are relative to that object.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `level` | Reference coordinates, sequences and declared mapping execution | `L3` only | Mapping to structural models belongs to L3. |
| `purpose` | Reference coordinates, sequences and declared mapping execution | `mapping to structural models` only | Fixed scientific wording; does not claim agreement, validation or a preferred structure. |
| `method` | Reference coordinates, sequences and declared mapping execution | Text | Alignment/mapping method and treatment of mismatches/unmapped regions. |
| `projection_runs` | Reference coordinates, sequences and declared mapping execution | Array of Text | Source projection runs when peptide projection is the mapped interpretation. |
| `mappings` | Reference coordinates, sequences and declared mapping execution | `mapping_table` object | Construct-to-reference residue mapping table. |
| `limitations` | Reference coordinates, sequences and declared mapping execution | Text or null | Construct, ligand, sequence and coverage differences affecting interpretation. |

### Residue mapping rows

Shape: `$defs/mapping_row`. Field names in this table are relative to that object.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `polymer_entity` | Reference mmCIF and construct-to-reference alignment | Text | Measured construct ID. |
| `construct_position` | Reference mmCIF and construct-to-reference alignment | Integer ≥ 1 | One-based position in the measured construct. |
| `reference_entry` | Reference mmCIF and construct-to-reference alignment | Text | Reference structure entry ID. |
| `reference_model` | Reference mmCIF and construct-to-reference alignment | Text | Specific reference model ID. |
| `label_asym_id` | Reference mmCIF and construct-to-reference alignment | Text | Target mmCIF internal chain ID; required by this draft even for an unmapped position. |
| `label_seq_id` | Reference mmCIF and construct-to-reference alignment | Integer ≥ 1 or null | Target internal residue number, or null if unmapped. |
| `auth_asym_id` | Reference mmCIF and construct-to-reference alignment | Text or null | Author chain ID where recorded. |
| `auth_seq_id` | Reference mmCIF and construct-to-reference alignment | Integer or null | Author residue number; may include nonpositive numbers. |
| `insertion_code` | Reference mmCIF and construct-to-reference alignment | Text or null | Author insertion code, or null when absent/unrecorded. |
| `status` | Reference mmCIF and construct-to-reference alignment | `matched`, `mismatch`, `unmapped` | Sequence mapping outcome; not structural agreement. |
| `reason` | Reference mmCIF and construct-to-reference alignment | Text or null | Mismatch or unmapped-region explanation where recorded. |

## Canonical model metrics and view provenance

### Model metric objects

Shape: `$defs/metric`. Field names in this table are relative to that object.

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `key` | Source analysis output or repository computation | Text | Metric identifier; free text in this schema. |
| `value` | Source analysis output or repository computation | Number | Reported or computed numeric metric; omit an unavailable metric rather than assigning zero. |
| `unit` | Source analysis output or repository computation | Text or null | Metric unit; null when absent/inapplicable. |
| `software_name` | Source analysis output or repository computation | Text | Software producing the metric. |
| `software_version` | Source analysis output or repository computation | Text or null | Recorded producing-software version. |
| `source_field` | Source analysis output or repository computation | Text | Original source field or declared computation label. |

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `view.schema_version` | Assigned here | `0.3.0` | Version of the proposed view record format; view is a document scope here, not an extra JSON wrapper. |
| `view.id` | Assigned here | `view_` + lowercase letters/digits | Cross-entry display ID. |
| `view.kind` | Assigned here | `peptide` | Display type. Peptide views require peptide_workflow. |
| `view.peptide_workflow` | Owning scientific entry | peptide_workflow object | Canonical scientific workflow using the same definitions as the entry. |
| `view.peptides`, `view.uptake`, `view.fd`, `view.reproducibility`, `view.comparisons`, `view.states`, `view.time_bins`, `view.structures` | Generated display build | Historical payloads; contents unconstrained in the view schema | Renderer compatibility fields. They do not substitute for the typed workflow or prove metadata completeness. |

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `derivations[].id` | Source selectors; run graph; repository code | Text | Displayed-value or plot derivation ID. |
| `derivations[].label` | Source selectors; run graph; repository code | Text | Human-readable object or operation name. |
| `derivations[].tier` | Source selectors; run graph; repository code | `copied`, `computed` | Copied source value or computed-here output; source numbers may be rounded for display. |
| `derivations[].value` | Source selectors; run graph; repository code | Number or null | Numeric summary when recorded; null when unavailable. |
| `derivations[].unit` | Source selectors; run graph; repository code | Text or null | Unit of the displayed value. |
| `derivations[].inputs` | Source selectors; run graph; repository code | Array of Object | Exact source nodes and fields/rows, using the input fields below. |
| `derivations[].runs` | Source selectors; run graph; repository code | Array of Text | Recorded upstream run chain, raw-data steps first; execution is not established by connectivity. |
| `derivations[].raw` | Source selectors; run graph; repository code | `pipelines`, `blocked`, `deposited` | Graph-derived status: blocked displays raw input not found; pipelines and deposited do not prove successful regeneration. |
| `derivations[].operation` | Source selectors; run graph; repository code | Text or null | Formula or transformation producing the displayed object. |
| `derivations[].code` | Source selectors; run graph; repository code | Text or null | Repository code location. |
| `derivations[].check` | Source selectors; run graph; repository code | Text or null | Command selecting/checking the value; not necessarily full upstream reanalysis. |
| `derivations[].entry` | Source selectors; run graph; repository code | Text or null | Owning entry ID; null for cross-entry comparisons. |

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `derivations[].inputs[].artifact` | View provenance graph | Text | Input node ID; may represent an artifact or interpretation node. |
| `derivations[].inputs[].fields` | Source layout | Array of text | Selected source fields. |
| `derivations[].inputs[].rows` | Source layout | Array of text/null | Selected source rows; null members are allowed by this legacy provenance shape. |

## Proposed PRIDE-linked submission and import record

All fields in this section are **proposed, not defined or enforced by schema 0.3.0**. `submission.` denotes a separate manifest, not a field in an entry. PRIDE source metadata would be copied from a dated project/file-inventory snapshot. Registry-specific identifiers, associations, parser records and review states would be assigned by the future service. These fields describe a design; they are not claims about an existing PRIDE API response.

One PRIDE project may support several experimental contexts and entries. Imports are distinct from upstream scientific runs and preserve the scientific levels of the imported content. The initial proposal targets processed HXMS and specified peptide/uptake tables. Raw files remain archive references; raw-to-uptake analysis is a separate execution capability.

### Submission identity and lifecycle

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `submission.schema_version` | Future schema registry | Version string, to be assigned | Proposed. Version of the submission manifest; do not label it entry schema 0.3.0. |
| `submission.id` | Submission service | Stable submission identifier; syntax to be defined | Proposed. Identity independent of entry IDs and processing levels. |
| `submission.parent_submission_id` | Submission service | Submission ID or null | Proposed. Prior submission/import context when reimporting or revising. |
| `submission.created_at` | Submission service | UTC timestamp | Proposed. When the submission was created. |
| `submission.submitter.id` | Authenticated submitter record | Submitter identifier | Proposed. Account or recorded submitting-agent identity. |
| `submission.submitter.name` | Submitter | Text or null | Proposed. Recorded submitter display name. |
| `submission.status` | Submission service | `draft`, `importing`, `needs resolution`, `ready for review`, `in review`, `published`, `failed`, `withdrawn` | Proposed. Operational state, distinct from entry revision status or L0–L3. |
| `submission.resulting_revisions[].entry` | Publication operation | Entry ID | Proposed. Entry created or revised; one submission can yield several entries. |
| `submission.resulting_revisions[].revision_number` | Publication operation | Integer ≥ 1 | Proposed. Exact resulting entry revision. |
| `submission.resulting_revisions[].import_id` | Publication operation | Submission import ID | Proposed. Import execution underlying that revision. |

### PRIDE project and source snapshots

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `submission.pride_projects[].accession` | Submitter URL/accession, resolved against PRIDE | `PXD` + six digits | Proposed. Project accession; project identity does not establish a specific file relationship. |
| `submission.pride_projects[].url` | Resolved PRIDE project metadata | Project URL | Proposed. Human-readable source deposit locator. |
| `submission.pride_projects[].retrieved_at` | PRIDE retrieval execution | UTC timestamp | Proposed. When project and inventory metadata were retrieved. |
| `submission.pride_projects[].project_snapshot_file` | Metadata retrieval execution | Submission file ID | Proposed. Preserved project-metadata response and its checksum. |
| `submission.pride_projects[].inventory_snapshot_file` | Metadata retrieval execution | Submission file ID | Proposed. Preserved file inventory used for discovery and matching. |

### Uploaded, referenced and normalized files

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `submission.files[].id` | Submission service | Submission-local file ID | Proposed. Identifier used by associations, imports and reports. |
| `submission.files[].source_kind` | Upload, PRIDE selection or importer | `upload`, `pride reference`, `metadata snapshot`, `normalized output`, `report` | Proposed. How the file entered the submission; distinct from scientific level. |
| `submission.files[].name` | Original file metadata | Text | Proposed. Original filename or generated-output name. |
| `submission.files[].format` | Parser detection and submitter declaration | Format/dialect label or null | Proposed. Detected or declared file encoding; no claim of support if unknown. |
| `submission.files[].format_status` | Parser detection | `supported`, `unsupported`, `not identified` | Proposed. Whether an available adapter can parse this exact dialect. |
| `submission.files[].size_bytes` | Received bytes or source inventory | Integer ≥ 0 or null | Proposed. File size; distinguish source-reported and locally measured values through the retained snapshot/import provenance. |
| `submission.files[].sha256` | Hash of received/retrieved bytes or source-reported SHA-256 | 64 lowercase hexadecimal characters or null | Proposed. Byte identity claim with checksum_status; never substitute another checksum algorithm or infer a hash from accession/filename. |
| `submission.files[].checksum_status` | Importer or source inventory | `computed here`, `source reported`, `verified against source`, `not available` | Proposed. Basis of the recorded checksum, with evidence retained. |
| `submission.files[].uri` | Storage service or source inventory | Exact file locator or null | Proposed. Stored-original or archive location, not only the project landing page. |
| `submission.files[].license` | Source terms or submitter declaration | License identifier/text, `unknown` or `unverified` | Proposed. Reuse terms of these file bytes; not inferred from the paper license. |
| `submission.files[].stored` | Storage service | Boolean | Proposed. Whether the submission service retains these exact bytes. |
| `submission.files[].pride_project` | PRIDE file inventory | Project accession or null | Proposed. Owning source project where applicable. |
| `submission.files[].pride_file_key` | PRIDE inventory snapshot | Source file identifier or null | Proposed. File accession where available, otherwise an explicitly scoped inventory key; do not invent an accession. |
| `submission.files[].entry_artifacts[].entry` | Import/publication mapping | Entry ID | Proposed. Entry that registers this file as an artifact. |
| `submission.files[].entry_artifacts[].artifact` | Import/publication mapping | Artifact ID within that entry | Proposed. Entry-qualified artifact link; an artifact ID alone is not globally unique. |

### Processed-file to PRIDE-file associations

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `submission.file_associations[].id` | Submission service | Association ID | Proposed. Identity of the source-link assertion. |
| `submission.file_associations[].processed_file` | Submitter or importer | Submission file ID | Proposed. Processed file being linked to its deposit/source. |
| `submission.file_associations[].pride_project` | PRIDE selection | Project accession | Proposed. Project supporting the assertion. |
| `submission.file_associations[].source_file_key` | PRIDE inventory snapshot | File key or null | Proposed. Specific source file, if known. Null leaves a project-level association only. |
| `submission.file_associations[].relation` | Submitter or importer | `same file`, `analysis input`, `project association` | Proposed. Distinguishes byte identity, analytical provenance and deposit membership. |
| `submission.file_associations[].basis` | Submitter or verification record | `supplied`, `inferred`, `verified` | Proposed. Evidence status, not an automatic consequence of matching a project accession. |
| `submission.file_associations[].evidence` | Metadata, filename mapping, checksums or execution record | Text plus submission-file references/selectors | Proposed. Evidence and its scope. A checksum verifies bytes, not an analytical derivation. |
| `submission.file_associations[].verified_by` | Verification operation or reviewer | Agent identifier or null | Proposed. Who or what verified the stated relationship. |
| `submission.file_associations[].verified_at` | Verification record | UTC timestamp or null | Proposed. When verification occurred; absent for unverified assertions. |

### Import executions and normalization

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `submission.imports[].id` | Import service | Import ID | Proposed. One parser execution; repeating an import creates a new execution record. |
| `submission.imports[].status` | Import service | `queued`, `running`, `completed`, `failed` | Proposed. Execution outcome; completed parsing does not establish valid science or publication readiness. |
| `submission.imports[].parser_name` | Executed adapter | Text | Proposed. Actual parser/adapter used. |
| `submission.imports[].parser_version` | Executed adapter | Version/commit text | Proposed. Exact executed parser version, distinct from upstream analysis software. |
| `submission.imports[].command` | Execution record | Text or null | Proposed. Verbatim invocation where available. |
| `submission.imports[].parameters` | Executed configuration | JSON object | Proposed. Format dialect, normalization and other actual import settings. |
| `submission.imports[].started_at` | Execution record | UTC timestamp | Proposed. Start of the import execution. |
| `submission.imports[].finished_at` | Execution record | UTC timestamp or null | Proposed. Completion/failure time; null while unfinished. |
| `submission.imports[].input_files` | Selected submission files | Array of submission file IDs | Proposed. Exact processed inputs consumed by this parser. |
| `submission.imports[].output_files` | Import execution | Array of submission file IDs | Proposed. Preserved normalized outputs, distinct from uploaded originals. |
| `submission.imports[].transformations` | Executed parser logic | Structured operation/parameter records | Proposed. Unit conversion, field/row selection, identifier normalization and treatment of missing values. |
| `submission.imports[].mapping_decisions` | Submitter/importer resolution | Array of mapping-decision IDs | Proposed. Decisions actually applied by this execution. |
| `submission.imports[].validation_report` | Validation execution | Report ID or null | Proposed. Report assessing this import and its proposed records. |
| `submission.imports[].entry_runs[].entry` | Entry draft assembly | Entry ID | Proposed. Entry containing the registered import run. |
| `submission.imports[].entry_runs[].run` | Entry draft assembly | Run ID within that entry | Proposed. Generic parsing run with exact inputs and outputs; not a fabricated identification/envelope run. |

### Mapping decisions, validation and review

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `submission.mapping_decisions[].id` | Submission service | Decision ID | Proposed. Identity of an explicit source-to-canonical mapping decision. |
| `submission.mapping_decisions[].kind` | Importer or submitter | `construct`, `peptide`, `sample`, `state`, `time`, `replicate`, `column`, `control`, `correction` | Proposed. Scientific object or source-field mapping being resolved. |
| `submission.mapping_decisions[].source` | Input file selection | Submission file ID and field/row selector | Proposed. Original source content to which the decision applies. |
| `submission.mapping_decisions[].target` | Normalized data model | Entry-qualified field, identifier or normalized value | Proposed. Proposed or accepted interpretation in the canonical record. |
| `submission.mapping_decisions[].status` | Submitter/importer review | `proposed`, `accepted`, `rejected`, `unresolved` | Proposed. Resolution status; ambiguous mappings remain explicit. |
| `submission.mapping_decisions[].reason` | Decision maker | Text or null | Proposed. Evidence or explanation for the mapping. |
| `submission.mapping_decisions[].decided_by` | Decision record | Agent ID or null | Proposed. Who made the decision; not an inferred manual-envelope reviewer. |
| `submission.mapping_decisions[].decided_at` | Decision record | UTC timestamp or null | Proposed. When the mapping decision was recorded. |
| `submission.validation_reports[].id` | Validation execution | Report ID | Proposed. Identity of the retained validation report. |
| `submission.validation_reports[].import_id` | Validation execution | Import ID | Proposed. Import and proposed records evaluated. |
| `submission.validation_reports[].validator_name` | Validation execution | Text | Proposed. Actual validator used. |
| `submission.validation_reports[].validator_version` | Validation execution | Version/commit text | Proposed. Executed validation code version. |
| `submission.validation_reports[].schema_ids` | Validation configuration | Array of schema IDs/versions | Proposed. Exact scientific and submission schemas applied. |
| `submission.validation_reports[].checked_at` | Validation execution | UTC timestamp | Proposed. When the checks ran. |
| `submission.validation_reports[].checks[].scope` | Validation configuration | `schema`, `references`, `table rows`, `scientific identifiers`, `other` | Proposed. Class of check; no implicit claim of scientific validity. |
| `submission.validation_reports[].checks[].result` | Validation execution | `passed`, `failed`, `not checked` | Proposed. Outcome for that specific check only. |
| `submission.validation_reports[].issues[].kind` | Validation execution | `validation error`, `missing metadata`, `unsupported content`, `mapping ambiguity` | Proposed. Issue type; missing history is not automatically failed science. |
| `submission.validation_reports[].issues[].location` | Validation execution | File/row/field or record path | Proposed. Precise affected content. |
| `submission.validation_reports[].issues[].message` | Validation execution | Text | Proposed. Specific finding and unresolved information. |
| `submission.reviews[].id` | Review service | Review ID | Proposed. One review event for the submission/import. |
| `submission.reviews[].import_id` | Review service | Import ID | Proposed. Exact import being reviewed. |
| `submission.reviews[].reviewer` | Review record | Agent identifier | Proposed. Recorded reviewer. |
| `submission.reviews[].decision` | Reviewer | `request changes`, `approve`, `reject` | Proposed. Submission-review decision; not evidence of upstream manual envelope validation. |
| `submission.reviews[].reviewed_at` | Review record | UTC timestamp | Proposed. When the decision was recorded. |
| `submission.reviews[].reason` | Reviewer | Text or null | Proposed. Reason and relevant retained evidence. |

## Validation scope and unresolved definitions

Scientific field types and enumerations above, except rows marked Proposed, were checked against the local 0.3.0 schemas. The [coverage document](2026-10-21%20hdx%20schema%20v0.3%20coverage.md) describes the draft validator's additional checks and limits. External table content, sequence/coordinate consistency, row-ID uniqueness, independent replicate units, graph cycles and complete view-to-entry equality require additional checks. An accepted JSON record is not evidence that the upstream method was scientifically validated.

The original dictionary's database spot-checks are historical observations, not validation performed for this document. Refer to that file for their date and evidence. Unknown source methods, the meaning of “20 partials” and confidence-score definitions remain unresolved as recorded in organization v3.

Submission ID syntax, manifest schema version, precise transformation/evidence object shapes, publication policy and supported parser dialects remain to be specified. Proposed submission vocabularies here are design choices for review, not claims of a community standard.