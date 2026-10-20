import { rampColor } from "../vendor/hetstar/color";
import { residueKey } from "../vendor/hetstar/keys";
import type { LaneMetric } from "../vendor/hetstar/lanes/types";
import { makeTrack, trackFromJSON, type Track } from "../vendor/hetstar/tracks";
import { DEUTERATION_RAMP, FADED_COLOR, STABILITY_RAMP } from "./colors";
import type { Condition, View } from "./types";

export type ColorMode = "dg" | "logpf" | "deut" | "sse";

export const MODE_LABELS: Record<ColorMode, string> = {
  dg: "ΔG (HDX-NMR)",
  logpf: "log₁₀ protection factor",
  deut: "Predicted deuteration at t",
  sse: "Secondary structure",
};

export function shortLabel(c: Condition): string {
  if (c.method === "mHDX-MS") return `mHDX ${c.pH ?? ""}`.trim();
  const rep = c.replicate === "mean" ? "mean" : `#${c.replicate}`;
  return `${c.construct} ${rep}`;
}

export function nmrConditions(entry: View): Condition[] {
  return entry.conditions.filter((c) => c.method === "HDX-NMR");
}

/** one domain for every track of a kind, so switching condition never rescales colors */
function sharedDomain(entry: View, kind: string, step: number): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const [k, t] of Object.entries(entry.tracks)) {
    if (!k.startsWith(`${kind}:`)) continue;
    for (const v of t.values) {
      if (v == null) continue;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  if (!Number.isFinite(lo)) return [0, 1];
  return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];
}

export interface EntryMetrics {
  /** lane metrics by track key ("dg:nmr_6xhis_r1", ...) */
  byKey: Map<string, LaneMetric>;
  dgDomain: [number, number];
  logpfDomain: [number, number];
}

export function entryMetrics(entry: View): EntryMetrics {
  const dgDomain = sharedDomain(entry, "dg", 0.5);
  const logpfDomain = sharedDomain(entry, "logpf", 0.5);
  const byKey = new Map<string, LaneMetric>();
  const conds = new Map(entry.conditions.map((c) => [c.id, c]));
  for (const [key, json] of Object.entries(entry.tracks)) {
    const [kind, cid] = key.split(":");
    const cond = conds.get(cid);
    if (!cond || kind === "kobs") continue;
    const isDg = kind === "dg";
    byKey.set(key, {
      id: key,
      name: `${isDg ? "ΔG" : "log PF"} ${shortLabel(cond)}`,
      unit: isDg ? "kcal/mol" : null,
      colors: STABILITY_RAMP,
      domain: isDg ? dgDomain : logpfDomain,
      track: trackFromJSON(json),
    });
  }
  return { byKey, dgDomain, logpfDomain };
}

/** fraction deuterated per residue at time t: 1 - exp(-kobs t); NaN where kobs is absent */
export function deuterationTrack(kobs: Track, tSeconds: number): Track {
  const values = new Float32Array(kobs.values.length);
  for (let i = 0; i < values.length; i++) {
    const k = kobs.values[i];
    values[i] = Number.isNaN(k) ? NaN : 1 - Math.exp(-k * tSeconds);
  }
  return makeTrack("deut", "residue", kobs.keys, values, { unit: "fraction", domainHint: [0, 1] });
}

export function deuterationMetric(kobs: Track, tSeconds: number): LaneMetric {
  return {
    id: "deut",
    name: "D at t",
    unit: "fraction",
    colors: DEUTERATION_RAMP,
    domain: [0, 1],
    track: deuterationTrack(kobs, tSeconds),
  };
}

function toInt([r, g, b]: [number, number, number]): number {
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

/**
 * Residue colors for the 3D theme. Residues with no value are left out of the table (the
 * theme paints them grey). With a threshold, measured residues below it are faded rather
 * than dropped: they were measured, they just are not among the sites shown.
 */
export function colorTable(metric: LaneMetric, threshold: number | null = null): Map<string, number> {
  const out = new Map<string, number>();
  const [d0, d1] = metric.domain;
  const span = d1 - d0;
  metric.track.keys.forEach((k, i) => {
    const v = metric.track.values[i];
    if (Number.isNaN(v)) return;
    if (threshold !== null && v < threshold) {
      out.set(residueKey(k), FADED_COLOR);
      return;
    }
    out.set(residueKey(k), toInt(rampColor(metric.colors, span > 0 ? (v - d0) / span : 0.5)));
  });
  return out;
}

/** CSS linear-gradient of a ramp, for legends */
export function rampGradient(stops: number[]): string {
  const css = stops.map((c, i) => `#${c.toString(16).padStart(6, "0")} ${(100 * i) / (stops.length - 1)}%`);
  return `linear-gradient(to right, ${css.join(", ")})`;
}

/** values of a track keyed by auth seq, for plots */
export function bySeq(track: Track): Map<number, number> {
  const m = new Map<number, number>();
  track.keys.forEach((k, i) => {
    if (!Number.isNaN(track.values[i])) m.set(k.seq, track.values[i]);
  });
  return m;
}

// --- constructs and measurements ----------------------------------------------------------

const CONSTRUCT_SHADES: Record<string, string[]> = {
  "6xHis": ["#b35806", "#e08214", "#fdb863", "#fee0b6"],
  "No-His": ["#1b7837", "#5aae61", "#a6dba0", "#d9f0d3"],
};

/** fixed color per condition: the construct's darkest shade for its mean, lighter per measurement */
export function seriesColor(c: Condition): string {
  const shades = CONSTRUCT_SHADES[c.construct ?? ""] ?? ["#3d414f", "#5f616b", "#8a8d96", "#b4b7bf"];
  if (c.replicate === "mean") return shades[0];
  const r = typeof c.replicate === "number" ? c.replicate : 1;
  return shades[Math.min(shades.length - 1, r)];
}

/** the condition that stands for a construct: its mean if reported, else its first measurement */
export function representative(view: View, construct: string): Condition | null {
  const cs = nmrConditions(view).filter((c) => c.construct === construct && view.tracks[`dg:${c.id}`]);
  return cs.find((c) => c.replicate === "mean") ?? cs[0] ?? null;
}

/** individual measurements of a construct (the mean excluded); their conditions can differ */
export function measurements(view: View, construct: string): Condition[] {
  return nmrConditions(view).filter((c) => c.construct === construct && c.replicate !== "mean" && view.tracks[`dg:${c.id}`]);
}

export function constructsOf(view: View): string[] {
  return [...new Set(nmrConditions(view).map((c) => c.construct ?? ""))].filter(Boolean).sort();
}

/** "pH 6.3 · 293 K · MES", with "mixed" where a mean averages different conditions */
export function conditionText(c: Condition): string {
  const v = (x: unknown, unit = "") => (x == null ? (c.conditions_differ ? "mixed" : "not reported") : `${x}${unit}`);
  return `pH ${v(c.pH)} · ${v(c.temp_K, " K")} · ${v(c.buffer)}`;
}
