import { memo } from "react";

import type { LaneModule, LaneProps, PositionSpan } from "../vendor/hetstar/lanes/types";
import { spanStyle } from "../vendor/hetstar/lanes/types";
import type { ChainSequence } from "../vendor/hetstar/sequence";

// Which residues each measurement covers, one thin row per construct. HDX values from
// different constructs only compare where these rows overlap; mHDX covers its whole row
// but cannot say where along it a value belongs.

export interface ConstructSpan {
  id: string;
  label: string;
  color: string;
  /** auth seq range */
  from: number;
  to: number;
}

function toSpan(chain: ChainSequence, from: number, to: number): PositionSpan | null {
  const ps = chain.positions.filter((p) => p.ref && p.ref.seq >= from && p.ref.seq <= to).map((p) => p.pos);
  return ps.length ? { start: Math.min(...ps), end: Math.max(...ps) } : null;
}

const ROW_H = 7;

export function constructLane(constructs: ConstructSpan[]): LaneModule {
  const View = memo(function ConstructLaneView({ ctx, onSelectSpan }: LaneProps) {
    return (
      <>
        {constructs.map((c, i) => {
          const span = toSpan(ctx.chain, c.from, c.to);
          if (!span) return null;
          return (
            <span
              key={c.id}
              className="absolute cursor-pointer rounded-sm opacity-70 hover:opacity-100"
              style={{ ...spanStyle(span, ctx.chain.length), top: 2 + i * (ROW_H + 2), height: ROW_H, background: c.color }}
              title={`${c.label}: residues ${c.from}-${c.to}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onSelectSpan(span, { additive: e.shiftKey });
              }}
            />
          );
        })}
      </>
    );
  });
  return {
    id: "constructs",
    label: "Constructs",
    description: constructs.map((c) => `${c.label} ${c.from}-${c.to}`).join("; "),
    defaultOn: true,
    height: 4 + constructs.length * (ROW_H + 2),
    unavailable: () => (constructs.length ? null : "no constructs"),
    Component: View,
    readout: (ctx, pos) => {
      const seq = ctx.chain.positions[pos - 1]?.ref?.seq;
      if (seq == null) return null;
      const inside = constructs.filter((c) => seq >= c.from && seq <= c.to).map((c) => c.label);
      return inside.length ? `in ${inside.join(", ")}` : "in no construct";
    },
  };
}
