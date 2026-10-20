// Copied from rtviii/hetstar @ fc08cdb, packages/hetstar/src/components/lanes/types.ts.
// Trimmed: LaneContext drops the atom table, conformer plan, PDBe annotations and
// expandable lanes; it keeps the chain, secondary structure, metrics and color-by.

import type { ComponentType } from "react";

import type { Track } from "../tracks";
import type { ChainSequence, SecondarySpan } from "../sequence";

// The lane framework. One chain's polymer sequence is the x-axis: positions 1..length,
// bridged to author-keyed residues by the SequenceModel (the same ResidueRefs Mol*
// picks and the HDX tracks use). Each LaneModule draws ONE row against that axis.
// The host (SequenceLanes.tsx) owns the ruler, zoom, scrolling, hit-testing, hover and
// selection; lanes only draw, and may offer clickable spans.

export interface PositionSpan {
  /** 1-based, inclusive */
  start: number;
  end: number;
}

export interface LaneMetric {
  id: string;
  name: string;
  unit: string | null;
  colors: number[];
  /** the display domain of the color ramp and bar axis */
  domain: [number, number];
  track: Track;
}

export interface LaneContext {
  chain: ChainSequence;
  /** helix and strand spans of this chain in positions; null when the source file has none */
  secondary: SecondarySpan[] | null;
  /** tracks by metric id; a string is why that metric is not available */
  metrics: Map<string, LaneMetric | string>;
  /** ramp coloring of the sequence lane, resolved by the host */
  colorBy: LaneMetric | null;
}

export interface LaneView {
  length: number;
  /** the lane's width in CSS px; 0 before layout */
  width: number;
  /** px per position (width / length) */
  cell: number;
}

export interface LaneProps {
  ctx: LaneContext;
  view: LaneView;
  /** lanes with clickable features call this to select a span (the host maps it to residues) */
  onSelectSpan: (span: PositionSpan, opts?: { additive?: boolean }) => void;
}

export interface LaneModule {
  /** stable id; also the persistence key of the on/off state */
  id: string;
  label: string;
  description: string;
  defaultOn: boolean;
  /** px height of the lane's track area */
  height: number;
  /** null when the lane can draw for this context; otherwise why not */
  unavailable: (ctx: LaneContext) => string | null;
  Component: ComponentType<LaneProps>;
  /** one short phrase about the hovered position, appended to the host's readout line */
  readout?: (ctx: LaneContext, pos: number) => string | null;
}

/** CSS placement of a span as a share of the lane: holds fitted and zoomed alike. */
export function spanStyle(span: PositionSpan, length: number): { left: string; width: string } {
  const n = Math.max(1, length);
  return {
    left: `${((span.start - 1) / n) * 100}%`,
    width: `${((span.end - span.start + 1) / n) * 100}%`,
  };
}
