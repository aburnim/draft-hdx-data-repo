// Copied from rtviii/hetstar @ fc08cdb, packages/hetstar/src/components/lanes/SequenceLanes.tsx.
// Trimmed: the chain header statistics, conformer plan, PDBe annotations, expandable
// lanes, right-click menu and PinPopover drawer are dropped (the drawer is a <details>
// list here). Changed: color-by is chosen by the host and passed in, and the host can add
// its own lane modules (`extraLanes`).

import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ResidueRef } from "../keys";
import { positionOf, refAt, type ChainSequence, type SecondarySpan, type SequenceModel } from "../sequence";
import { sequenceLane } from "./SequenceLane";
import { secondaryLane } from "./SpanLanes";
import type { LaneContext, LaneMetric, LaneModule, LaneView, PositionSpan } from "./types";

// The sequence lanes host: one chain at a time, a ruler in author numbering, and one
// row per enabled lane module, all sharing the chain's positions as x. Fitted to its
// column until zoomed (buttons or trackpad pinch), then it scrolls sideways with the
// row labels staying put. Hover and selection are painted as columns over the whole
// board, so a column read down the rows is one residue.

export interface ResidueRange {
  chain: string;
  from: number;
  to: number;
}

const BASE_LANES: readonly LaneModule[] = [sequenceLane, secondaryLane];

const GUTTER_L = 124;
const GUTTER_R = 12;
const RULER_H = 20;
const ZOOMS = [5, 8, 11, 14, 18, 24];
const MAX_ZOOM = ZOOMS[ZOOMS.length - 1];
const PINCH = 100;
const STORAGE_KEY = "hdx.lanes.enabled";
const COLOR_SELECTION = "rgba(34, 167, 71, 0.2)"; // Mol*'s select green, washed
const COLOR_HOVER = "rgba(102, 59, 228, 0.14)"; // the accent

function loadEnabled(fallback: Set<string>): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr: unknown = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr.filter((x): x is string => typeof x === "string"));
    }
  } catch {
    /* no storage: defaults */
  }
  return fallback;
}

function saveEnabled(set: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

interface Tick {
  pos: number;
  label: string | null;
}

// Ticks in author numbering (what the 3D viewer and metrics speak), positions when the
// chain carries none: labels at a step that keeps ~44 px between them, unlabeled minor
// ticks every 10 once those would not smear together. Insertion-code duplicates skipped.
function rulerTicks(chain: ChainSequence, cell: number): Tick[] {
  const NICE = [10, 20, 50, 100, 200, 500, 1000];
  const step = NICE.find((s) => s * cell >= 44) ?? 1000;
  const minor = 10 * cell >= 7;
  const numbered = chain.posByKey.size > 0;
  const out: Tick[] = [];
  let prev: number | null = null;
  for (const p of chain.positions) {
    const n = numbered ? (p.ref?.seq ?? null) : p.pos;
    if (n === null || n === prev) continue;
    prev = n;
    if (n % 10 !== 0) continue;
    const labeled = n % step === 0;
    if (!labeled && !minor) continue;
    out.push({ pos: p.pos, label: labeled ? String(n) : null });
  }
  return out;
}

function spanOfRange(chain: ChainSequence, range: ResidueRange | null): PositionSpan | null {
  if (!range || range.chain !== chain.chain) return null;
  let start = Infinity;
  let end = -Infinity;
  for (const p of chain.positions) {
    if (!p.ref || p.ref.seq < range.from || p.ref.seq > range.to) continue;
    if (p.pos < start) start = p.pos;
    if (p.pos > end) end = p.pos;
  }
  return Number.isFinite(start) ? { start, end } : null;
}

function rangeOfSpan(chain: ChainSequence, span: PositionSpan): ResidueRange | null {
  let from = Infinity;
  let to = -Infinity;
  for (let pos = span.start; pos <= span.end; pos++) {
    const ref = refAt(chain, pos);
    if (!ref) continue;
    if (ref.seq < from) from = ref.seq;
    if (ref.seq > to) to = ref.seq;
  }
  return Number.isFinite(from) ? { chain: chain.chain, from, to } : null;
}

function Row({
  label,
  height,
  children,
  trackRef,
  plain,
  className,
}: {
  label: string;
  height: number;
  children: ReactNode;
  trackRef?: (el: HTMLDivElement | null) => void;
  /** no lane ground (the ruler) */
  plain?: boolean;
  className?: string;
}) {
  return (
    <div className={`grid items-center ${className ?? ""}`} style={{ gridTemplateColumns: "var(--gl) var(--lane) var(--gr)" }}>
      <span className="sticky left-0 z-10 flex h-full items-center justify-end gap-1 whitespace-nowrap bg-white pr-2.5 font-mono text-[8.5px] font-semibold uppercase tracking-wider text-ink-secondary">
        {label}
      </span>
      <div ref={trackRef} className={`relative ${plain ? "" : "bg-surface-muted"}`} style={{ height }}>
        {children}
      </div>
      <span />
    </div>
  );
}

// Hover/selection columns move with transforms (translateX/scaleX on a composited
// layer), not left/width: a layout-affecting style write here at pointer rate would
// dirty the whole board. minFrac keeps the old 2px minimum width.
function Column({ span, length, color, minFrac }: { span: PositionSpan; length: number; color: string; minFrac: number }) {
  const n = Math.max(1, length);
  const frac = Math.max(minFrac, (span.end - span.start + 1) / n);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute bottom-0 top-0 z-[5]"
      style={{ left: "var(--gl)", right: "var(--gr)", contain: "layout paint" }}
    >
      <div
        className="absolute inset-y-0 left-0 w-full origin-left will-change-transform"
        style={{ transform: `translateX(${((span.start - 1) / n) * 100}%) scaleX(${frac})`, background: color }}
      />
    </div>
  );
}

export default function SequenceLanes({
  model,
  secondary,
  metrics,
  metricLanes,
  extraLanes = [],
  colorBy,
  hoverRef,
  selection,
  onHover,
  onSelect,
  leading,
}: {
  model: SequenceModel | null;
  secondary: SecondarySpan[] | null;
  /** tracks by metric id; a string is why that metric is not available */
  metrics: Map<string, LaneMetric | string>;
  /** one lane module per metric (makeMetricLane), built once by the host */
  metricLanes: readonly LaneModule[];
  /** host-specific lanes, listed after the structural ones */
  extraLanes?: readonly LaneModule[];
  colorBy: LaneMetric | null;
  /** residue hovered in 3D, mirrored as a column */
  hoverRef: ResidueRef | null;
  /** the committed selection (a single residue is from === to) */
  selection: ResidueRange[];
  onHover: (ref: ResidueRef | null) => void;
  onSelect: (range: ResidueRange, opts?: { additive?: boolean; toggle?: boolean }) => void;
  leading?: ReactNode;
}) {
  const allModules = useMemo(() => [...BASE_LANES, ...extraLanes, ...metricLanes], [extraLanes, metricLanes]);
  const defaults = useMemo(() => new Set(allModules.filter((m) => m.defaultOn).map((m) => m.id)), [allModules]);
  const [zoom, setZoom] = useState<number | null>(null);
  const [fitWidth, setFitWidth] = useState(0);
  const [enabled, setEnabled] = useState<Set<string>>(defaults);
  const [localHover, setLocalHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<[number, number] | null>(null);
  const [viewerNode, setViewerNode] = useState<HTMLDivElement | null>(null);
  const [laneNode, setLaneNode] = useState<HTMLDivElement | null>(null);
  const dragStartRef = useRef<number | null>(null);
  const dragEndRef = useRef<number | null>(null);
  const lastHoverRef = useRef<number | null>(null);
  const anchorRef = useRef<{ fraction: number; clientX: number } | null>(null);
  const laneRectRef = useRef<{ left: number; width: number } | null>(null);

  useEffect(() => setEnabled(loadEnabled(defaults)), [defaults]);

  const chain = model?.chains[0] ?? null;

  const ctx = useMemo<LaneContext | null>(
    () => (chain ? { chain, secondary, metrics, colorBy } : null),
    [chain, secondary, metrics, colorBy],
  );

  // fitted lane width: the scrollport less the two gutters
  useEffect(() => {
    if (!viewerNode) return;
    const measure = () => setFitWidth(Math.max(0, viewerNode.clientWidth - GUTTER_L - GUTTER_R));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(viewerNode);
    return () => ro.disconnect();
  }, [viewerNode]);

  const length = chain?.length ?? 0;
  const fitCell = length > 0 && fitWidth > 0 ? fitWidth / length : null;
  const laneWidth = zoom !== null ? length * zoom : fitWidth;
  const view = useMemo<LaneView>(
    () => ({ length, width: laneWidth, cell: length > 0 ? laneWidth / length : 0 }),
    [length, laneWidth],
  );

  // trackpad pinch (a wheel event with ctrlKey) zooms about the residue under the pointer
  useEffect(() => {
    if (!viewerNode || !laneNode || fitCell === null) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const box = laneNode.getBoundingClientRect();
      anchorRef.current = { fraction: (e.clientX - box.left) / box.width, clientX: e.clientX };
      const factor = Math.exp(-e.deltaY / PINCH);
      setZoom((prev) => {
        const next = (prev ?? fitCell) * factor;
        return next <= fitCell ? null : Math.min(next, MAX_ZOOM);
      });
    };
    viewerNode.addEventListener("wheel", onWheel, { passive: false });
    return () => viewerNode.removeEventListener("wheel", onWheel);
  }, [viewerNode, laneNode, fitCell]);
  useEffect(() => {
    const held = anchorRef.current;
    anchorRef.current = null;
    if (!viewerNode || !laneNode || !held) return;
    const box = laneNode.getBoundingClientRect();
    viewerNode.scrollLeft += box.left + held.fraction * box.width - held.clientX;
  }, [zoom, laneNode, viewerNode]);

  const zoomIn = () => setZoom((prev) => ZOOMS.find((r) => (prev ?? fitCell ?? 0) < r) ?? MAX_ZOOM);
  const zoomOut = () =>
    setZoom((prev) => {
      if (prev === null) return null;
      const rungs = ZOOMS.filter((r) => r < prev && (fitCell === null || r > fitCell));
      return rungs.length ? rungs[rungs.length - 1] : null;
    });

  // --- hit-testing: pointer x to position ---

  useEffect(() => {
    laneRectRef.current = null;
  }, [laneNode, laneWidth, chain]);
  useEffect(() => {
    if (!viewerNode) return;
    const invalidate = () => {
      laneRectRef.current = null;
    };
    viewerNode.addEventListener("scroll", invalidate, { passive: true });
    window.addEventListener("resize", invalidate);
    window.addEventListener("scroll", invalidate, { passive: true });
    const ro = new ResizeObserver(invalidate);
    ro.observe(viewerNode);
    return () => {
      viewerNode.removeEventListener("scroll", invalidate);
      window.removeEventListener("resize", invalidate);
      window.removeEventListener("scroll", invalidate);
      ro.disconnect();
    };
  }, [viewerNode]);

  const posAt = useCallback(
    (clientX: number, clamp: boolean): number | null => {
      if (!laneNode || length === 0) return null;
      let rect = laneRectRef.current;
      if (!rect) {
        const box = laneNode.getBoundingClientRect();
        rect = { left: box.left, width: box.width };
        laneRectRef.current = rect;
      }
      const raw = Math.floor(((clientX - rect.left) / rect.width) * length) + 1;
      if (clamp) return Math.min(length, Math.max(1, raw));
      return raw >= 1 && raw <= length ? raw : null;
    },
    [laneNode, length],
  );

  const emitHover = useCallback(
    (pos: number | null) => {
      if (pos === lastHoverRef.current) return;
      lastHoverRef.current = pos;
      setLocalHover(pos);
      const p = pos && chain ? chain.positions[pos - 1] : null;
      onHover(p && p.observed ? p.ref : null);
    },
    [chain, onHover],
  );

  const selectSpan = useCallback(
    (span: PositionSpan, opts?: { additive?: boolean }) => {
      if (!chain) return;
      const range = rangeOfSpan(chain, span);
      if (range) onSelect(range, opts);
    },
    [chain, onSelect],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !e.isPrimary) return;
    const pos = posAt(e.clientX, false);
    if (pos === null) return;
    dragStartRef.current = pos;
    dragEndRef.current = pos;
    // capture: the drag survives leaving the strip; up/cancel still reach us
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag([pos, pos]);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const start = dragStartRef.current;
    if (start !== null) {
      const end = posAt(e.clientX, true) ?? start;
      if (end !== dragEndRef.current) {
        dragEndRef.current = end;
        setDrag([start, end]);
      }
      return;
    }
    emitHover(posAt(e.clientX, false));
  };
  const endDrag = () => {
    dragStartRef.current = null;
    dragEndRef.current = null;
    setDrag(null);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const start = dragStartRef.current;
    endDrag();
    if (start === null || !chain) return;
    const additive = e.shiftKey;
    const end = posAt(e.clientX, true) ?? start;
    if (end === start) {
      const p = chain.positions[start - 1];
      if (p?.ref && p.observed) onSelect({ chain: chain.chain, from: p.ref.seq, to: p.ref.seq }, { toggle: additive });
      return;
    }
    selectSpan(start <= end ? { start, end } : { start: end, end: start }, { additive });
  };
  const onPointerCancel = () => endDrag();
  const onPointerLeave = () => {
    // pointer capture keeps a drag alive past the edge; only plain hover clears here
    if (dragStartRef.current === null) emitHover(null);
  };

  // --- what is painted ---

  const selectionSpans = useMemo(
    () => (chain ? selection.map((r) => spanOfRange(chain, r)).filter((s): s is PositionSpan => s !== null) : []),
    [chain, selection],
  );
  const hoverPos =
    localHover ?? (hoverRef && chain && hoverRef.chain === chain.chain && model ? positionOf(model, hoverRef) : null);
  const dragSpan: PositionSpan | null = drag ? { start: Math.min(drag[0], drag[1]), end: Math.max(drag[0], drag[1]) } : null;

  const lanes = useMemo(
    () => (ctx ? allModules.filter((m) => enabled.has(m.id) && m.unavailable(ctx) === null) : []),
    [ctx, allModules, enabled],
  );

  const toggleLane = useCallback(
    (id: string) =>
      setEnabled((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        saveEnabled(next);
        return next;
      }),
    [],
  );

  const readout = useMemo(() => {
    if (!ctx) return null;
    const pos = hoverPos;
    if (pos === null) return null;
    const parts: string[] = [];
    for (const m of lanes) {
      const r = m.readout?.(ctx, pos);
      if (r) parts.push(r);
    }
    return parts.join(" · ");
  }, [ctx, hoverPos, lanes]);

  const ticks = useMemo(() => (chain ? rulerTicks(chain, view.cell) : []), [chain, view.cell]);

  const boardStyle = {
    "--gl": `${GUTTER_L}px`,
    "--gr": `${GUTTER_R}px`,
    "--lane": zoom !== null ? `${laneWidth}px` : "minmax(0, 1fr)",
    width: zoom !== null ? `${laneWidth + GUTTER_L + GUTTER_R}px` : "100%",
  } as CSSProperties;

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex shrink-0 flex-wrap items-center gap-2 text-[11px]">
        {leading}
        {chain && (
          <>
            <span className="inline-flex overflow-hidden rounded border border-line-strong bg-white" role="group" aria-label="zoom">
              <button type="button" className="px-1.5 py-0.5 text-ink-secondary hover:bg-accent-soft disabled:opacity-40" onClick={zoomOut} disabled={zoom === null} aria-label="zoom out">
                &minus;
              </button>
              <button
                type="button"
                className={`border-l border-line-strong px-1.5 py-0.5 hover:bg-accent-soft ${zoom === null ? "bg-accent-soft text-accent" : "text-ink-secondary"}`}
                onClick={() => setZoom(null)}
              >
                fit
              </button>
              <button
                type="button"
                className="border-l border-line-strong px-1.5 py-0.5 text-ink-secondary hover:bg-accent-soft disabled:opacity-40"
                onClick={zoomIn}
                disabled={zoom !== null && zoom >= MAX_ZOOM}
                aria-label="zoom in"
              >
                +
              </button>
            </span>
            <details className="relative">
              <summary className="cursor-pointer list-none rounded border border-line-strong bg-white px-1.5 py-0.5 text-ink-secondary hover:bg-accent-soft">
                Lanes ({lanes.length})
              </summary>
              <div className="absolute left-0 z-30 mt-1 flex w-64 flex-col gap-1 rounded border border-line-strong bg-white p-2 text-[10.5px] shadow-lg">
                {allModules.map((m) => {
                  const why = ctx ? m.unavailable(ctx) : "no data";
                  return (
                    <label key={m.id} title={m.description} className={`flex items-baseline gap-1.5 ${why ? "opacity-50" : ""}`}>
                      <input type="checkbox" checked={enabled.has(m.id)} disabled={!!why} onChange={() => toggleLane(m.id)} />
                      <span className="text-ink-secondary">{m.label}</span>
                      {why && <span className="truncate text-[9.5px] text-ink-muted/75">{why}</span>}
                    </label>
                  );
                })}
              </div>
            </details>
          </>
        )}
      </div>

      {!model || !chain || !ctx ? (
        <div className="text-[11px] text-ink-muted/75">sequence lanes: no chain</div>
      ) : (
        <div
          ref={setViewerNode}
          className="min-h-0 select-none overflow-x-auto overscroll-contain"
          style={{ touchAction: "pan-x pan-y" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onPointerLeave={onPointerLeave}
        >
          <div className="relative flex flex-col gap-[2px]" style={boardStyle}>
            <Row label="" height={RULER_H} trackRef={setLaneNode} plain className="sticky top-0 z-20 bg-white">
              <div className="absolute inset-x-0 bottom-0 border-b border-line-strong" />
              {ticks.map((t) => (
                <span
                  key={t.pos}
                  className="absolute bottom-0 -translate-x-1/2 font-mono text-[9px] tabular-nums text-ink-muted"
                  style={{ left: `${((t.pos - 0.5) / length) * 100}%` }}
                >
                  {t.label && <span className="absolute bottom-[5px] -translate-x-1/2">{t.label}</span>}
                  <span className="block bg-line-strong" style={{ width: 1, height: t.label ? 4 : 2.5 }} />
                </span>
              ))}
            </Row>
            {lanes.map((m) => (
              <Row key={m.id} label={m.label} height={m.height}>
                <m.Component ctx={ctx} view={view} onSelectSpan={selectSpan} />
              </Row>
            ))}
            {dragSpan ? (
              <Column span={dragSpan} length={length} color={COLOR_SELECTION} minFrac={laneWidth > 0 ? 2 / laneWidth : 0} />
            ) : (
              selectionSpans.map((s, i) => (
                <Column key={i} span={s} length={length} color={COLOR_SELECTION} minFrac={laneWidth > 0 ? 2 / laneWidth : 0} />
              ))
            )}
            {hoverPos !== null && (
              <Column span={{ start: hoverPos, end: hoverPos }} length={length} color={COLOR_HOVER} minFrac={laneWidth > 0 ? 2 / laneWidth : 0} />
            )}
          </div>
        </div>
      )}

      <div className="min-h-[1rem] shrink-0 text-[10.5px] tabular-nums text-ink-muted">
        {readout ??
          (chain ? `chain ${chain.chain}: ${chain.length} residues. Click a residue to select, drag for a range; pinch or +/- to zoom` : "")}
      </div>
    </div>
  );
}
