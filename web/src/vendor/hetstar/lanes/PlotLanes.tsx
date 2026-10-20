// Copied from rtviii/hetstar @ fc08cdb, packages/hetstar/src/components/lanes/PlotLanes.tsx.
// Trimmed to the metric lanes: the conformer-count lane is dropped. Changed:
// makeMetricLane takes defaultOn, and missing values draw a faint stub so a gap reads as
// "not measured" rather than as zero.

import { memo, useEffect, useMemo, useRef } from "react";

import type { Track } from "../tracks";
import { residueKey } from "../keys";
import type { ChainSequence } from "../sequence";
import { rampCss } from "../color";
import type { LaneMetric, LaneModule, LaneProps } from "./types";

const COLOR_TICK_LABEL = "#5f616b";
const COLOR_ZERO = "#d4d4d4";
const COLOR_MISSING = "#e3e6ec";

const METRIC_H = 30;

function fmt(v: number): string {
  const a = Math.abs(v);
  return v.toFixed(a >= 10 ? 0 : a >= 1 ? 1 : 2);
}

// Size the canvas to the lane at device resolution and hand back a scaled context.
function prepare(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.scale(dpr, dpr);
  g.clearRect(0, 0, width, height);
  return g;
}

// key -> track row index, built once per track (tracks are immutable once computed)
const trackIndexCache = new WeakMap<Track, Map<string, number>>();
function trackIndex(track: Track): Map<string, number> {
  let idx = trackIndexCache.get(track);
  if (!idx) {
    const built = new Map<string, number>();
    track.keys.forEach((k, i) => built.set(residueKey(k), i));
    trackIndexCache.set(track, built);
    idx = built;
  }
  return idx;
}

/** the metric's values laid over the chain's positions (NaN = no value there) */
export function metricValues(chain: ChainSequence, m: LaneMetric): Float32Array {
  const idx = trackIndex(m.track);
  const out = new Float32Array(chain.length);
  chain.positions.forEach((p, i) => {
    const j = p.ref ? idx.get(residueKey(p.ref)) : undefined;
    out[i] = j === undefined ? NaN : m.track.values[j];
  });
  return out;
}

function metricLaneView(id: string) {
  return memo(function MetricLaneView({ ctx, view }: LaneProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const entry = ctx.metrics.get(id);
    const metric = entry && typeof entry !== "string" ? entry : null;
    const values = useMemo(() => (metric ? metricValues(ctx.chain, metric) : null), [ctx.chain, metric]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || !values || !metric || view.width < 2) return;
      const g = prepare(canvas, view.width, METRIC_H);
      if (!g) return;
      const n = values.length;
      const barW = view.width / n;
      const [d0, d1] = metric.domain;
      const span = d1 - d0;
      const yOf = (v: number) => {
        const t = span > 0 ? (v - d0) / span : 0.5;
        return METRIC_H - Math.min(1, Math.max(0, t)) * METRIC_H;
      };
      // diverging domains draw from the zero line, sequential from the lane floor
      const diverging = d0 < 0 && d1 > 0;
      const baseY = diverging ? yOf(0) : METRIC_H;
      if (diverging) {
        g.strokeStyle = COLOR_ZERO;
        g.beginPath();
        g.moveTo(0, Math.round(baseY) + 0.5);
        g.lineTo(view.width, Math.round(baseY) + 0.5);
        g.stroke();
      }
      const w = Math.max(0.75, barW - (barW > 2.5 ? 0.75 : 0));
      for (let i = 0; i < n; i++) {
        const v = values[i];
        if (Number.isNaN(v)) {
          g.fillStyle = COLOR_MISSING;
          g.fillRect(i * barW, METRIC_H - 2, w, 2);
          continue;
        }
        const t = span > 0 ? (v - d0) / span : 0.5;
        const y = yOf(v);
        g.fillStyle = rampCss(metric.colors, t);
        g.fillRect(i * barW, Math.min(y, baseY), w, Math.max(1, Math.abs(baseY - y)));
      }
      g.fillStyle = COLOR_TICK_LABEL;
      g.font = "9px monospace";
      g.textBaseline = "middle";
      g.textAlign = "right";
      g.fillText(fmt(d1), view.width - 3, 6);
      g.fillText(fmt(d0), view.width - 3, METRIC_H - 6);
    }, [values, metric, view.width]);

    return <canvas ref={canvasRef} className="absolute inset-0" style={{ width: view.width, height: METRIC_H }} />;
  });
}

/** one lane per metric; the host builds these from its metric list, once */
export function makeMetricLane(id: string, label: string, description: string, defaultOn = false): LaneModule {
  return {
    id: `metric:${id}`,
    label,
    description,
    defaultOn,
    height: METRIC_H,
    unavailable: (ctx) => {
      const m = ctx.metrics.get(id);
      return m === undefined ? "no data" : typeof m === "string" ? m : null;
    },
    Component: metricLaneView(id),
    readout: (ctx, pos) => {
      const entry = ctx.metrics.get(id);
      if (!entry || typeof entry === "string") return null;
      const p = ctx.chain.positions[pos - 1];
      if (!p?.ref) return null;
      const i = trackIndex(entry.track).get(residueKey(p.ref));
      if (i === undefined || Number.isNaN(entry.track.values[i])) return `${label} n/a`;
      return `${label} ${entry.track.values[i].toFixed(2)}${entry.unit ? ` ${entry.unit}` : ""}`;
    },
  };
}
