// Shapes of the JSON the pipeline writes (schema/hdx_entry.v0.json, web/public/index.json).

import type { TrackJSON } from "../vendor/hetstar/tracks";
import type { ChainJSON } from "../vendor/hetstar/sequence";

export type Level = "L0" | "L1" | "L2" | "L3";

export interface Condition {
  id: string;
  label: string;
  method: "HDX-NMR" | "mHDX-MS";
  construct: string | null;
  replicate: number | string | null;
  pH: number | string | null;
  temp_K: number | null;
  buffer: string | null;
  source_row: number;
}

export interface Artifact {
  id: string;
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

export interface Interpretation {
  id: string;
  title: string;
  method: string;
  resolution: "residue" | "whole protein (unassigned)" | "atomic model";
  artifact: string;
  run: string | null;
  conditions: string[];
}

export interface Metric {
  key: string;
  value: number;
  unit: string | null;
  level: "L2" | "L3";
  interpretation: string;
  source_field: string;
  computed_here: boolean;
}

/** where one displayed value or plot comes from (schema "derivations") */
export interface Derivation {
  id: string;
  label: string;
  /** copied: verbatim from an archived file; computed: derived by this repository */
  tier: "copied" | "computed";
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

export interface Entry {
  schema_version: string;
  id: string;
  name: string;
  title: string;
  protein: { name: string; origin: string; topology: string | null; uniprot: string | null };
  chain: ChainJSON;
  conditions: Condition[];
  external_refs: { pdb: string | null; pride: string | null; zenodo: string | null; doi: string | null; github: string[] };
  artifacts: Artifact[];
  runs: Run[];
  interpretations: Interpretation[];
  tracks: Record<string, TrackJSON>;
  mhdx: MhdxMeasurement[];
  metrics: Metric[];
  derivations: Derivation[];
  license: string;
  citation: string;
}

/** one row of web/public/index.json: the front page list */
export interface EntryListRow {
  id: string;
  name: string;
  title: string;
  origin: string;
  topology: string | null;
  length: number;
  methods: string[];
  n_conditions: number;
  pdb: string | null;
  pride: string | null;
  dg_max: number | null;
}

export interface EntryList {
  schema_version: string;
  entries: EntryListRow[];
}
