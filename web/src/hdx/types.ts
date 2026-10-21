// Shapes of the JSON the pipeline writes (schema/hdx_entry.v0.json, web/public/index.json).

import type { TrackJSON } from "../vendor/hetstar/tracks";
import type { ChainJSON } from "../vendor/hetstar/sequence";

export type Level = "L0" | "L1" | "L2" | "L3";

export interface Condition {
  id: string;
  label: string;
  method: "HDX-NMR" | "mHDX-MS";
  construct: string | null;
  /** index of the measurement within its construct, or "mean" (not assumed to be a replicate) */
  replicate: number | string | null;
  /** for a mean: the source rows it averages, and whether their conditions differ */
  mean_of_rows?: number[];
  conditions_differ?: boolean;
  pH: number | string | null;
  temp_K: number | null;
  buffer: string | null;
  source_row: number;
}

/** a provenance node of a view: a file, or a model whose values are stored in a file */
export interface Artifact {
  id: string;
  kind: "artifact" | "model";
  /** owning entry; null for view-level records */
  entry: string | null;
  stored_in?: string;
  short: string;
  level: Level;
  title: string;
  format: string;
  uri: string | null;
  sha256: string | null;
  license: string;
  held: boolean;
  fields?: string[];
}

export interface Run {
  id: string;
  software: string;
  version: string | null;
  description: string;
  inputs: string[];
  outputs: string[];
  parsed_from: string;
}

export interface Metric {
  key: string;
  value: number;
  unit: string | null;
  level: "L2" | "L3";
  interpretation: string;
  source_field: string;
  computed_here: boolean;
  entry: string | null;
}

/** where one displayed value or plot comes from (schema "derivations") */
export interface Derivation {
  id: string;
  label: string;
  /** copied: verbatim from an archived file; computed: derived by this repository */
  tier: "copied" | "computed";
  /** owning entry; null for cross-entry values */
  entry: string | null;
  value: number | null;
  unit: string | null;
  inputs: { artifact: string; fields: string[]; rows: (string | null)[] }[];
  /** upstream run chain, raw data first */
  runs: string[];
  /** regeneration from raw data */
  raw: "pipelines" | "blocked" | "deposited";
  operation: string | null;
  code: string | null;
  check: string | null;
}

export interface MhdxMeasurement {
  id: string;
  source_row: number;
  library: string;
  pH_label: string;
  pH_labels: string[];
  merged: boolean;
  /** pH label of each timepoint (merged series have two) */
  pH_index: string[];
  retention_time_min: number | null;
  sequence: string;
  first_auth_seq: number | null;
  timepoints_s: (number | null)[];
  exp_distribution: (number | null)[][];
  pred_distribution: (number | null)[][];
  exp_centroid: (number | null)[];
  pred_centroid: (number | null)[];
  backexchange: (number | null)[];
  dg_sorted: (number | null)[];
  ln_k_sorted: (number | null)[];
  ln_k_ci5: (number | null)[];
  ln_k_ci95: (number | null)[];
  group: string;
}

export interface ViewMember {
  id: string;
  kind: "hdx" | "structure";
  method: string;
  title: string;
}

/** a derived cross-entry view: everything the Explore tab draws (views/<id>.json) */
export interface View {
  schema_version: string;
  id: string;
  kind?: "intact";
  name: string;
  title: string;
  grouping: string;
  members: ViewMember[];
  protein: { name: string; origin: string; topology: string | null; uniprot: string | null };
  chain: ChainJSON;
  conditions: Condition[];
  external_refs: { pdb: string | null; pride: string | null; zenodo: string | null; doi: string | null; github: string[] };
  artifacts: Artifact[];
  runs: Run[];
  tracks: Record<string, TrackJSON>;
  mhdx: MhdxMeasurement[];
  metrics: Metric[];
  derivations: Derivation[];
  license: string;
  citation: string;
}

/** one row of web/public/index.json: the front page list of HDX entries */
export interface EntryListRow {
  id: string;
  name: string;
  method: string;
  samples: number;
  constructs: string[];
  dg_max: number | null;
  pdb: string | null;
  structure_entry: string;
  raw: string | null;
}

export interface EntryList {
  schema_version: string;
  entries: EntryListRow[];
}

// --- entry records (entries/<id>.json, schema/hdx_entry.v0.1.json) ---------------------

export interface Selector {
  fields?: string[];
  rows?: string[];
}

export interface RecordArtifact {
  id: string;
  name: string;
  level: Level;
  type: "model" | "structure_factors" | "fasta" | "other";
  format: string;
  uri: string;
  size_bytes?: number;
  sha256: string | null;
  license: string;
  stored: boolean;
}

export interface RecordRun {
  id: string;
  software_name: string;
  software_version: string | null;
  command: string | null;
  parameters: Record<string, unknown> | null;
  inputs: { artifact?: string; selector?: Selector }[];
  outputs: { artifact?: string; model?: string; selector?: Selector }[];
}

export interface RecordMetric {
  key: string;
  value: number;
  unit: string | null;
  software_name: string;
  software_version: string | null;
  source_field?: string;
}

export interface RecordModel {
  id: string;
  revision_number: number;
  title: string;
  model_type: string;
  purpose: string;
  model_source: "pdb" | "ext";
  authors?: string[];
  run?: string;
  primary_artifact?: string;
  source?: { artifact: string; selector?: Selector };
  residue_frame?: { entry: string; model: string; mapping: string };
  residue_data?: Record<string, unknown>[] | null;
  site_data?: Record<string, unknown>;
  ensemble_members?: number;
  atom_count?: number;
  modeled_residues?: number;
  metrics: RecordMetric[];
}

export interface Sample {
  id: string;
  polymer_entity: string;
  ligand?: string | null;
  replicates?: number[];
  d2o_saturation?: number;
  pH_kind?: string;
  measurement?: number | string | null;
  mean_of_rows?: string[];
  conditions_differ?: boolean;
  library?: string;
  pH?: number | null;
  pH_labels?: string[];
  merged_pH_series?: boolean;
  temperature_kelvin?: number | null;
  buffer?: string | null;
  labeling_times_s?: (number | null)[];
  source: { artifact: string; rows: string[] };
}

export interface PolymerEntity {
  id: string;
  description: string;
  construct: string | null;
  sequence: string;
  source_organisms: unknown[];
  mutations: string[];
  uniprot_mappings: unknown[];
}

export interface EntryRecord {
  schema_version: string;
  id: string;
  kind: "hdx" | "structure";
  state: string;
  revision: { revision_number: number; parent_revision_id: string | null; state: string; published_at: string | null; change_summary: string | null };
  title: string;
  method: string;
  method_source?: string;
  polymer_entities: PolymerEntity[];
  hdx?: { samples: Sample[] };
  artifacts: RecordArtifact[];
  runs: RecordRun[];
  undeclared_inputs?: string[];
  models: RecordModel[];
  external_refs: Record<string, string>;
  view: string;
  linked_entries: { entry: string; method: string; basis: string }[];
  extensions: string[];
  citation: string;
}

// --- peptide-level views (views/view_ecdhfr.json, kind "peptide") ----------------------

export type DiffClass = "more rigid" | "more flexible" | "mixed" | "no observable difference" | "not tested";

export interface Peptide {
  id: string;
  start: number;
  end: number;
  seq: string;
  n_ex: number;
  conf: number;
  rt_min: number;
  charges: number[];
  states: string[];
}

/** [time_bin, replicate, time_s, uptake_da_uncorrected, uptake_corrected] */
export type UptakeRow = [string, number, number | null, number, number | null];

export interface Comparison {
  id: string;
  a: string;
  b: string;
  replicates: number[];
  n: number;
  s_pooled_da: number | null;
  df: number;
  limit_da: number | null;
  alpha: number;
  /** per peptide: [time_bin, dD (b - a, Da), p, significant] */
  results: Record<string, [string, number, number | null, boolean][]>;
  classes: Record<string, DiffClass>;
  counts: Record<DiffClass, number>;
  /** keyed by construct position */
  residue: Record<string, { class: DiffClass; value: number | null; n_peptides: number }>;
}

export interface PeptideStructure {
  pdb: string;
  entry: string;
  state: string;
  title: string;
  method: string;
  resolution: number | null;
  ligands: string[];
  chain: import("../vendor/hetstar/sequence").ChainJSON;
  /** construct position -> label_seq_id / auth_seq_id */
  label_of: Record<string, number>;
  auth_of: Record<string, number>;
  mismatches: { construct_pos: number; label_seq_id: number; construct: string; structure: string }[];
  notes: string[];
}

export interface PeptideView {
  schema_version: string;
  id: string;
  kind: "peptide";
  name: string;
  title: string;
  grouping: string;
  members: ViewMember[];
  protein: { name: string; origin: string; topology: string | null; uniprot: string | null };
  construct: { sequence: string; note: string };
  labeling_conditions: { temperature_K: number; pH_read: number; d2o_saturation: number };
  states: { id: string; label: string; ligand: string | null; replicates: number[]; n_peptides: number; pdb: string }[];
  structures: PeptideStructure[];
  time_bins: { id: string; label: string; t_s: number | null; n_times: number }[];
  peptides: Peptide[];
  uptake: Record<string, Record<string, UptakeRow[]>>;
  fd: Record<string, Record<string, number>>;
  reproducibility: Record<string, { n_points: number; median_sd_da: number; p95_sd_da: number; pooled_sd_da: number; replicates: number[] }>;
  comparisons: Comparison[];
  parameters: Record<string, Record<string, unknown>>;
  identification_protocol: string | null;
  external_refs: Record<string, string>;
  artifacts: Artifact[];
  runs: Run[];
  metrics: Metric[];
  derivations: Derivation[];
  license: string;
  citation: string;
}

export type AnyView = View | PeptideView;
