import { useMemo, useState } from "react";

import type { Artifact, View, Level, Run } from "./types";

// Lineage as W3C PROV draws it: artifacts (entities) and runs (activities), with an edge
// for every input a run used and every output it generated. Artifacts sit in columns by
// data level; each run sits in the gap after its latest input.

const LEVELS: Level[] = ["L0", "L1", "L2", "L3"];
const LEVEL_NAMES: Record<Level, string> = { L0: "Source", L1: "Processed", L2: "Interpreted", L3: "Evaluated" };
const A_W = 196;
const A_H = 62;
const R_W = 136;
const R_H = 34;
const COL = [0, 236, 412, 648, 824, 1060, 1236];
const ROW = 92;
const TOP = 44;

type Node =
  | { kind: "artifact"; id: string; x: number; y: number; a: Artifact }
  | { kind: "run"; id: string; x: number; y: number; r: Run };

export default function Provenance({ entry, highlight }: { entry: View; highlight?: string }) {
  const [picked, setPicked] = useState<string>("m_mhdx");

  const { nodes, edges, height } = useMemo(() => {
    const levelOf = new Map(entry.artifacts.map((a) => [a.id, LEVELS.indexOf(a.level)]));
    const byCol = new Map<number, Artifact[]>();
    for (const a of entry.artifacts) {
      const col = 2 * LEVELS.indexOf(a.level);
      byCol.set(col, [...(byCol.get(col) ?? []), a]);
    }
    const maxRows = Math.max(...[...byCol.values()].map((v) => v.length));
    const nodes: Node[] = [];
    const pos = new Map<string, { x: number; y: number; w: number; h: number }>();
    // Top-aligned, so artifacts listed in the same order share a row (mHDX first, then
    // NMR, then structure) and each method's chain runs straight across.
    for (const [col, as] of byCol) {
      as.forEach((a, i) => {
        const p = { x: COL[col], y: TOP + i * ROW, w: A_W, h: A_H };
        pos.set(a.id, p);
        nodes.push({ kind: "artifact", id: a.id, x: p.x, y: p.y, a });
      });
    }
    for (const r of entry.runs) {
      const col = 2 * Math.max(0, ...r.inputs.map((i) => levelOf.get(i) ?? 0)) + 1;
      const ys = [...r.inputs, ...r.outputs].map((id) => pos.get(id)).filter(Boolean).map((p) => p!.y + A_H / 2);
      const y = ys.reduce((s, v) => s + v, 0) / Math.max(1, ys.length) - R_H / 2;
      const p = { x: COL[col], y, w: R_W, h: R_H };
      pos.set(r.id, p);
      nodes.push({ kind: "run", id: r.id, x: p.x, y: p.y, r });
    }
    const edges: { from: string; to: string; d: string }[] = [];
    const link = (from: string, to: string) => {
      const a = pos.get(from);
      const b = pos.get(to);
      if (!a || !b) return;
      const x1 = a.x + a.w;
      const y1 = a.y + a.h / 2;
      const x2 = b.x;
      const y2 = b.y + b.h / 2;
      const mx = (x1 + x2) / 2;
      edges.push({ from, to, d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}` });
    };
    for (const r of entry.runs) {
      r.inputs.forEach((i) => link(i, r.id));
      r.outputs.forEach((o) => link(r.id, o));
    }
    return { nodes, edges, height: TOP + maxRows * ROW + 8 };
  }, [entry]);

  const detail = nodes.find((n) => n.id === picked);
  const width = COL[6] + A_W + 4;

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-[13px] leading-relaxed text-ink-secondary">
        Graph of the linked entries. Boxes are files; boxes with a double border are models, whose values are stored
        in the file named in the box; rounded boxes are processing steps. Columns are Dynamic PDB data levels, from raw
        instrument data (L0) to evaluation (L3). Dashed borders mark files referenced by URI and not hosted here; solid
        borders mark files hosted here. Tinted boxes belong to this entry. Selecting a box shows its URI, SHA-256,
        license, and owning entry.
      </p>
      <div className="overflow-x-auto rounded-lg border border-line bg-white p-3">
        <svg viewBox={`0 0 ${width} ${height}`} style={{ minWidth: 980, width: "100%" }} role="img" aria-label="Provenance graph">
          <defs>
            <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="#9aa0b4" />
            </marker>
          </defs>
          {LEVELS.map((l, i) => (
            <text key={l} x={COL[2 * i]} y={18} className="fill-ink-muted" style={{ font: "600 11px 'IBM Plex Mono', monospace", letterSpacing: 1 }}>
              {l} · {LEVEL_NAMES[l].toUpperCase()}
            </text>
          ))}
          {edges.map((e) => (
            <path key={`${e.from}-${e.to}`} d={e.d} fill="none" stroke="#c4c8d8" strokeWidth={1.4} markerEnd="url(#arrow)" />
          ))}
          {nodes.map((n) => {
            const active = n.id === picked;
            if (n.kind === "run") {
              return (
                <g key={n.id} onClick={() => setPicked(n.id)} className="cursor-pointer">
                  <rect x={n.x} y={n.y} width={R_W} height={R_H} rx={R_H / 2} fill={active ? "#f1edfd" : "#f2f3f8"} stroke={active ? "#663be4" : "#d5d7e4"} />
                  <text x={n.x + R_W / 2} y={n.y + R_H / 2 + 4} textAnchor="middle" style={{ font: "500 10.5px 'IBM Plex Mono', monospace" }} fill="#3d414f">
                    {n.r.software.length > 18 ? `${n.r.software.slice(0, 17)}…` : n.r.software}
                  </text>
                </g>
              );
            }
            const missing = n.a.uri == null;
            const own = highlight != null && n.a.entry === highlight;
            return (
              <g key={n.id} onClick={() => setPicked(n.id)} className="cursor-pointer">
                {n.a.kind === "model" && (
                  <rect x={n.x - 3} y={n.y - 3} width={A_W + 6} height={A_H + 6} rx={8} fill="none" stroke={active ? "#663be4" : "#d5d7e4"} strokeWidth={1} />
                )}
                <rect
                  x={n.x} y={n.y} width={A_W} height={A_H} rx={6}
                  fill={active ? "#f1edfd" : own ? "#f7f4fe" : "#ffffff"}
                  stroke={active ? "#663be4" : missing ? "#b4231d" : "#d5d7e4"}
                  strokeDasharray={n.a.held ? undefined : "4 3"} strokeWidth={active ? 2 : 1.2}
                />
                <foreignObject x={n.x + 8} y={n.y + 6} width={A_W - 16} height={A_H - 10}>
                  <div style={{ font: "500 11px 'IBM Plex Sans', sans-serif", color: "#1a1e2a", lineHeight: 1.25 }}>
                    <div style={{ font: "600 9.5px 'IBM Plex Mono', monospace", color: missing ? "#b4231d" : "#5f616b" }}>
                      {n.a.kind === "model" ? "model" : n.id} · {n.a.kind === "model" ? `in ${n.a.short}` : n.a.format}{missing ? " · location unknown" : ""}
                    </div>
                    {n.a.title}
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </svg>
      </div>
      {detail && (
        <div className="rounded-lg border border-line bg-white p-4 text-[12.5px]">
          {detail.kind === "artifact" ? <ArtifactDetail a={detail.a} entry={entry} /> : <RunDetail r={detail.r} />}
        </div>
      )}
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2 border-b border-line py-1.5 last:border-0">
      <dt className="text-ink-muted">{k}</dt>
      <dd className="min-w-0 break-words font-mono text-[11.5px] text-ink">{children}</dd>
    </div>
  );
}

function ArtifactDetail({ a, entry }: { a: Artifact; entry: View }) {
  const producedBy = entry.runs.filter((r) => r.outputs.includes(a.id)).map((r) => r.id);
  const usedBy = entry.runs.filter((r) => r.inputs.includes(a.id)).map((r) => r.id);
  return (
    <dl>
      <h3 className="mb-2 text-[14px] font-semibold text-ink">{a.title}</h3>
      <Row k="id · level">{a.id} · {a.level}{a.kind === "model" ? ` · model stored in ${a.stored_in}` : ""}</Row>
      <Row k="entry">{a.entry ? <a className="text-accent underline" href={`#/entry/${a.entry}/provenance`}>{a.entry}</a> : "cross-entry view"}</Row>
      <Row k="uri">{a.uri ? <a className="text-accent underline" href={a.uri} target="_blank" rel="noreferrer">{a.uri}</a> : "not stated in the cited sources"}</Row>
      <Row k="sha256">{a.sha256 ?? "–"}</Row>
      <Row k="stored here">{a.held ? "yes" : "no, referenced"}</Row>
      <Row k="license">{a.license}</Row>
      {a.fields && <Row k="fields">{a.fields.join(", ")}</Row>}
      <Row k="produced by">{producedBy.join(", ") || "–"}</Row>
      <Row k="used by">{usedBy.join(", ") || "–"}</Row>
    </dl>
  );
}

function RunDetail({ r }: { r: Run }) {
  const repo = r.version && /^[0-9a-f]{40}$/.test(r.version) ? `https://github.com/Rocklin-Lab/${r.software}/tree/${r.version}` : null;
  return (
    <dl>
      <h3 className="mb-2 text-[14px] font-semibold text-ink">{r.software}</h3>
      <Row k="id">{r.id}</Row>
      <Row k="what it did">{r.description}</Row>
      <Row k="version">{repo ? <a className="text-accent underline" href={repo} target="_blank" rel="noreferrer">{r.version}</a> : (r.version ?? "not recorded")}</Row>
      <Row k="inputs">{r.inputs.join(", ") || "–"}</Row>
      <Row k="outputs">{r.outputs.join(", ")}</Row>
      <Row k="recorded from">{r.parsed_from}</Row>
    </dl>
  );
}
