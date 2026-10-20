// Replaces hetkit's model/sequence.ts (rtviii/hetstar @ fc08cdb) with the same types and
// lookups, built from the chain the pipeline already wrote into the entry JSON instead of
// from a parsed mmCIF. Kept API: ChainSequence, SequenceModel, SecondarySpan, positionOf,
// refAt, unobservedSpans.

import type { ResidueRef } from "./keys";
import { residueKey } from "./keys";

export interface SequencePosition {
  /** 1-based entity sequence index (label_seq_id) */
  pos: number;
  compId: string;
  letter: string;
  ref: ResidueRef | null;
  /** the structure has atoms for this residue */
  observed: boolean;
}

export interface ChainSequence {
  chain: string;
  entityDescription: string | null;
  length: number;
  positions: SequencePosition[];
  posByKey: Map<string, number>;
}

export interface SequenceModel {
  chains: ChainSequence[];
  byChain: Map<string, ChainSequence>;
}

export interface Span {
  start: number;
  end: number;
}

export interface SecondarySpan extends Span {
  kind: "helix" | "strand";
}

export interface ChainJSON {
  id: string;
  entity_description: string | null;
  positions: { pos: number; compId: string; letter: string; seq: number }[];
  secondary?: SecondarySpan[];
}

export function sequenceModelFromJSON(chain: ChainJSON): SequenceModel {
  const positions: SequencePosition[] = chain.positions.map((p) => ({
    pos: p.pos,
    compId: p.compId,
    letter: p.letter,
    ref: { chain: chain.id, seq: p.seq, ins: "" },
    observed: true,
  }));
  const posByKey = new Map<string, number>();
  for (const p of positions) if (p.ref) posByKey.set(residueKey(p.ref), p.pos);
  const seq: ChainSequence = {
    chain: chain.id,
    entityDescription: chain.entity_description,
    length: positions.length,
    positions,
    posByKey,
  };
  return { chains: [seq], byChain: new Map([[chain.id, seq]]) };
}

export function positionOf(model: SequenceModel, ref: ResidueRef): number | null {
  return model.byChain.get(ref.chain)?.posByKey.get(residueKey(ref)) ?? null;
}

export function refAt(chain: ChainSequence, pos: number): ResidueRef | null {
  return chain.positions[pos - 1]?.ref ?? null;
}

export function unobservedSpans(chain: ChainSequence): Span[] {
  const out: Span[] = [];
  let start: number | null = null;
  for (const p of chain.positions) {
    if (!p.observed && start === null) start = p.pos;
    if (p.observed && start !== null) {
      out.push({ start, end: p.pos - 1 });
      start = null;
    }
  }
  if (start !== null) out.push({ start, end: chain.length });
  return out;
}
