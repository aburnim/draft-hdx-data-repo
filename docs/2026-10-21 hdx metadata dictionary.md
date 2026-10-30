# HDX metadata dictionary

|  |  |
|------------------------------------|------------------------------------|
| Document version | 1.0 |
| Date | 2026-10-21 |
| Describes | Entry schema `schema/hdx_entry.v0.2.json` (0.2.0) and the `derivations` field of the view schema `schema/hdx_view.v0.2.json` (0.2.0) |
| Repository state | branch `feature/eehee-prototype`, commit `0612dc7` |
| Status | Draft |
| Contact | Andy Burnim, Astera Institute (Prism) |

## Scope

This dictionary lists every field of an HDX entry record, where its value comes from, which values it may take, and what it means. Field names follow the Dynamic PDB schema v0.2.0 (2026-10-16) where an equivalent exists; fields that v0.2.0 does not define are marked as extensions in the schema and listed per record in `extensions`.

## Conventions

- **Source.** "Assigned here" means the value is set by this repository's rules. "Computed here" means it is derived by this repository's code from archived files. Other sources name the archive or file: PRIDE, PDB (mmCIF), Zenodo Dataset_3 or Dataset_4 (Ferrari et al. 2026), HXMS files (supplement of Weber et al. 2026), UniProt, RCSB Chemical Component Dictionary, or the paper.
- **Allowed values.** "Free text" means no controlled vocabulary applies. An enumeration lists every permitted value. A named library (for example CCD or NCBI Taxonomy) means values must come from that resource.
- **Absent values** are `null` or omitted, never 0.

## Identity and versioning

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `schema_version` | Assigned here | `0.2.0` only | Version of the record format. |
| `id` | Assigned here | `hdx_` + 8 characters (0-9, a-z) | Stable entry ID. |
| `kind` | Assigned here | `hdx`, `structure` | HDX measurement or reference structure. |
| `state` | Assigned here | `new`, `active`, `deleted` | Lifecycle of the entry. |
| `revision.revision_number` | Assigned here | Integer ≥ 1 | Version number of the content. |
| `revision.parent_revision_id` | Assigned here | Revision ID or null | Previous version. |
| `revision.state` | Assigned here | `pending`, `in_review`, `active`, `rejected`, `archived` | Review status of this version. |
| `revision.published_at` | Assigned here | Date string or null; format not enforced | Publication date of the version. |
| `revision.change_summary` | Assigned here | Free text or null | What changed. |
| `title` | PDB, or assigned here | Free text | Short description. |
| `citation` | Paper | Free text; no citation format | Publication to cite. |

## Experiment

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `method` | Assigned here; PDB `_exptl.method` | Free text for HDX (no library; Dynamic PDB plans OBI/EFO terms). Structures use the PDBx/mmCIF `_exptl.method` list, e.g. `X-RAY DIFFRACTION`, `SOLUTION NMR` | Experimental technique. |
| `method_source` | Assigned here | Free text | Where the method was read from. |
| `resolution` | PDB `_refine.ls_d_res_high` | Positive number (Å), or absent | Highest resolution of an X-ray structure. |
| `ligands` | PDB `_pdbx_nonpoly_scheme` | wwPDB Chemical Component Dictionary (CCD) codes | Small molecules in the deposited structure, water excluded. |

## Protein and constructs

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `polymer_entities[].id` | Assigned here | Label, e.g. `pe_1` | One distinct sequence or construct. |
| `polymer_entities[].description` | Dataset name; PDB `_entity.pdbx_description` | Free text | Name of the protein. |
| `polymer_entities[].construct` | Zenodo Dataset_4 `construct`; assigned here | Free text or null | Version of the protein measured (e.g. 6xHis). |
| `polymer_entities[].sequence` | Dataset_3, Dataset_4, HXMS, PDB | One-letter amino-acid codes | Sequence of the measured construct. |
| `polymer_entities[].source_organisms` | PRIDE organism; empty for designs | NCBI Taxonomy (name + taxonomy ID) | Source organism. |
| `polymer_entities[].mutations` | Assigned here | Substitution strings, e.g. `K31L`; numbering rule still open in Dynamic PDB | Amino-acid changes from the parent sequence. |
| `polymer_entities[].uniprot_mappings` | UniProt; checked by alignment (ecDHFR) | UniProt accession; `source` ∈ `sifts`, `struct_ref`, `alignment`; `unp_release` required for `sifts` and `alignment` | Link to the UniProt protein. |

## HDX samples (extension)

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `hdx.samples[].id` | Assigned here | Label | One sample (construct, state or measurement). |
| `hdx.samples[].polymer_entity` | Assigned here | A polymer-entity ID in the entry | Construct used. |
| `hdx.samples[].measurement` | Computed here | Integer ≥ 1, or `mean` | Which measurement of the construct. |
| `hdx.samples[].mean_of_rows` | Computed here | Dataset_4 row numbers | Rows a mean averages. |
| `hdx.samples[].mean_check_max_abs_error` | Computed here | Number ≥ 0 | Agreement of the recomputed mean with the published one. |
| `hdx.samples[].conditions_differ` | Computed here | true, false | Whether averaged measurements had different conditions. |
| `hdx.samples[].state` | HXMS `PROTEIN_STATE` | Free text | Ligand state (apo, methotrexate, trimethoprim). |
| `hdx.samples[].ligand` | Assigned here; verified against the RCSB CCD | CCD code or null | Bound ligand. |
| `hdx.samples[].replicates` | HXMS `REP` | Integers | Replicate run IDs. |
| `hdx.samples[].library` | Zenodo Dataset_3 `library` | Free text | mHDX-MS protein library. |
| `hdx.samples[].pH` | Dataset_4; HXMS `pH(READ)` | Number or null | Labeling pH. |
| `hdx.samples[].pH_kind` | HXMS | Free text, e.g. `pH(read)` | How the pH was measured. |
| `hdx.samples[].pH_labels` | Dataset_3 `pH`, `pH_index` | Free text, e.g. `pH6`, `pH9` | pH labels of mHDX-MS series. |
| `hdx.samples[].merged_pH_series` | Dataset_3 `merge_exp` | true, false | Whether pH 6 and pH 9 series were combined. |
| `hdx.samples[].temperature_kelvin` | Dataset_4; HXMS | Number (K) or null | Labeling temperature. |
| `hdx.samples[].buffer` | Dataset_4 | Free text or null | Labeling buffer. |
| `hdx.samples[].d2o_saturation` | HXMS | Number, 0 to 1 | Deuterium fraction in the labeling buffer. |
| `hdx.samples[].labeling_times_s` | Dataset_3 `true_time`; HXMS `TIME(Sec)` | Numbers (seconds) | D₂O exposure times. |
| `hdx.samples[].source` | Assigned here | Artifact ID + row IDs | Where the sample was read. |
| `hdx.peptide_map` | Computed here (HXMS) | Object; fields not fixed in the schema | Peptide count, coverage, identification run. |

## Files

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `artifacts[].id` | Assigned here | Label | One file. |
| `artifacts[].name` | PRIDE, Zenodo, RCSB, journal | File name | File name. |
| `artifacts[].level` | Assigned here | `L0`, `L1`, `L2`, `L3` | Raw, processed, interpreted, mapped to structure. |
| `artifacts[].type` | Assigned here | `model`, `structure_factors`, `fasta`, `other` | Role of the file. |
| `artifacts[].format` | Assigned here | Open list, lowercase (e.g. `mmcif`, `json`, `hxms`, `mzml.gz`, `mgf`, `csv`) | File encoding. |
| `artifacts[].uri` | PRIDE FTP, Zenodo, RCSB, journal | URL | Download location of the exact file. |
| `artifacts[].size_bytes` | PRIDE listing; measured here | Integer ≥ 0 | File size. |
| `artifacts[].sha256` | Computed here (`fetch.py`) | 64 lowercase hex characters, or null | Checksum of the bytes. |
| `artifacts[].license` | PRIDE, Zenodo, RCSB | Free text; SPDX IDs where known (`CC0-1.0`, `CC-BY-4.0`), else `unknown` or `unverified` | Reuse terms. |
| `artifacts[].stored` | Assigned here | true, false | Hosted here, or linked only. |
| `undeclared_inputs` | Assigned here | Free text | Needed sources with no known location. |

## Processing steps (runs)

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `runs[].id` | Assigned here | Label | One processing step. |
| `runs[].software_name` | PRIDE protocol, paper, this repository | Free text (no canonical software list) | Program used. |
| `runs[].software_version` | PRIDE protocol; GitHub commit; this repository | Version string, 40-character git commit, or null | Exact version. |
| `runs[].command` | This repository | Free text or null | Command run. |
| `runs[].parameters` | PRIDE protocol; this repository `PARAMS` | JSON object or null | Settings and thresholds. |
| `runs[].inputs[].artifact` | Assigned here | Artifact ID | File read. |
| `runs[].outputs[].artifact` / `.model` | Assigned here | Artifact or model ID | File or model produced. |
| `runs[].*.selector` | Assigned here | Lists of field names and row IDs | Part of a shared file used. |

## Interpretations (models)

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `models[].id` | Assigned here | `<entry id>_m_NNN` | One interpretation. |
| `models[].revision_number` | Assigned here | Integer | Model version. |
| `models[].title` | Assigned here | Free text | Short description. |
| `models[].model_type` | Assigned here | `Single Conformer`, `Multiconformer`, `Ensemble`, `Deposited`, `HDX ΔG set`, `HDX differential set` (the last two are extensions) | Kind of model. |
| `models[].purpose` | Assigned here | `Model Building`, `Refinement`, `Reference` | Why the model exists. |
| `models[].model_source` | Assigned here | `pdb`, `ext` | Origin of the model. |
| `models[].authors` | Paper; this repository | Free text | Who produced it. |
| `models[].run` | Assigned here | Run ID | Step that produced it. |
| `models[].primary_artifact` | Assigned here | Artifact ID | Coordinate file. |
| `models[].source` | Assigned here | Artifact ID + selector | Where its values are stored. |
| `models[].residue_frame` | Assigned here | Entry ID, model ID, mapping text | Structure whose numbering the values use. |
| `models[].site_data` | Dataset_3 | Object; fields not fixed in the schema | Site values not assigned to residues. |
| `models[].ensemble_members` | Computed here (PDB) | Integer | Conformers in the structure. |
| `models[].atom_count` | Computed here (PDB) | Integer | Non-hydrogen atoms (first conformer). |
| `models[].modeled_residues` | Computed here (PDB) | Integer | Residues with coordinates. |
| `models[].unique_protein_chains` | Assigned here | Integer | Distinct protein chains. |
| `models[].metrics[]` | Dataset_3; computed here | Key: free text (Dynamic PDB's 10 keys plus HDX extensions); value: number; unit: free text | Summary values, each with producing software. |

## Per-residue values

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `residue_data[].sample` | Assigned here | Sample ID | Sample the value belongs to. |
| `residue_data[].label_asym_id` | PDB `_pdbx_poly_seq_scheme` | mmCIF chain ID | Chain, internal numbering. |
| `residue_data[].label_seq_id` | PDB | Integer | Residue position, internal numbering. |
| `residue_data[].label_comp_id` | PDB | CCD code | Amino-acid type. |
| `residue_data[].auth_asym_id` | PDB | Chain ID | Chain as labeled by the authors. |
| `residue_data[].auth_seq_id` | PDB | Integer | Residue number used in papers. |
| `residue_data[].pdbx_pdb_ins_code` | PDB | Text or null | Insertion code. |
| `residue_data[].dg` | Dataset_4 `free_energy_nc_corrected` | Number (kcal/mol) or null | Free energy at that residue. Whether this is an unfolding or a local opening free energy is unresolved. |
| `residue_data[].kobs` | Dataset_4 `obs_rates` | Number (1/s) or null | Measured exchange rate. |
| `residue_data[].kint` | Dataset_4 `intrinsic_rates` | Number (1/s) or null | Predicted rate if unfolded. |
| `residue_data[].logpf` | Computed here | Number or null | log₁₀(kint / kobs). |
| `residue_data[].too_slow` | Dataset_4 `too_slow_array` | true, false, null | Exchange too slow to measure. |

## Links between entries

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `external_refs` | PRIDE, Zenodo, PDB, paper | Keys `pdb` (4-character ID), `pride` (`PXD` + 6 digits), `zenodo`, `doi`, `hxms_doi` (DOIs) | Archive accessions. |
| `view` | Computed here | `view_` + lowercase letters and digits | Cross-entry view of the entry. |
| `linked_entries[].entry` | Computed here | Entry ID | Linked entry. |
| `linked_entries[].method` | Assigned here | Free text | Its method. |
| `linked_entries[].basis` | Assigned here | Free text | Why linked. |
| `extensions` | Assigned here | Free text | Fields not in Dynamic PDB v0.2.0. |

## Per-value provenance (view schema)

| Field | Source | Allowed values | Definition |
|------------------|------------------|------------------|------------------|
| `derivations[].tier` | Assigned here | `copied`, `computed` | Verbatim from a file, or computed here. |
| `derivations[].inputs` | Assigned here | Node ID + field and row lists | Where the value came from. |
| `derivations[].runs` | Computed here | Run IDs | Steps back to raw data. |
| `derivations[].raw` | Computed here | `pipelines`, `blocked` (shown as "raw input not found"), `deposited` | Whether raw data can regenerate the value. |
| `derivations[].operation` / `.code` / `.check` | This repository | Free text | Formula, code location, check command. |

## Verified values (2026-10-21)

Two values were entered by hand rather than read from a file. Both were checked against their source databases.

| Value | Checked against | Result |
|------------------------|------------------------|------------------------|
| UniProt `P0ABQ4` for ecDHFR | UniProt REST, release 2026_03; PDBe SIFTS for 1RG7 and 6XG5 | Accession correct: dihydrofolate reductase, gene *folA*, *E. coli* K-12, 159 residues; SIFTS maps 1RG7 and 6XG5 to P0ABQ4. The HDX construct aligns to it over 158 residues with one difference at residue 37: D (construct) vs N (UniProt). 5DFR and 1RG7 also have D37; 6XG5 has N37. Residue 1 is replaced by the TEV-site serine. |
| CCD `MTX` and `TOP` | RCSB Chemical Component Dictionary; 1RG7 and 6XG5 ligand lists | Correct: MTX is methotrexate (C20 H22 N8 O5), present in 1RG7; TOP is trimethoprim (C14 H18 N4 O3), present in 6XG5 together with NADPH (NDP). |

Not yet reflected in the records: the UniProt release (2026_03) and the residue 37 difference on the mapping; the CCD source of the ligand codes; and the organism ID, which is 562 (*E. coli*) in PRIDE and 83333 (*E. coli* K-12) in UniProt.

## Version history

| Version | Date       | Changes                          |
|---------|------------|----------------------------------|
| 1.0     | 2026-10-21 | First version, for schema 0.2.0. |