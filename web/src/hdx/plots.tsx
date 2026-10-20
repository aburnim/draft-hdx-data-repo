import { type ReactNode, useMemo } from "react";
import type Plotly from "plotly.js";

import { trackFromJSON } from "../vendor/hetstar/tracks";
import { SERIES, STABILITY_RAMP, DEUTERATION_RAMP } from "./colors";
import { fmtTime } from "./data";
import { bySeq, nmrConditions, shortLabel, type EntryMetrics } from "./model";
import Plot from "./Plot";
import type { Entry, MhdxMeasurement } from "./types";

// The entry's plots. Residue-axis plots (x = auth seq) share hover with the structure and
// the lanes; time-axis plots share the time cursor with the deuteration coloring.

export interface PlotLinks {
  hoverSeq: number | null;
  setHoverSeq: (seq: number | null) => void;
  threshold: number | null;
  timeS: number;
  setTimeS: (t: number) => void;
}

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
const colorscale = (stops: number[]): [number, string][] => stops.map((c, i) => [i / (stops.length - 1), hex(c)]);

export function Card({
  title,
  source,
  children,
  caption,
}: {
  title: string;
  source: string;
  children: ReactNode;
  caption?: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-white p-3">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
        <span className="font-mono text-[10px] text-ink-muted" title="where these values come from">
          {source}
        </span>
      </header>
      {children}
      {caption && <p className="text-[11px] leading-snug text-ink-muted">{caption}</p>}
    </section>
  );
}

/** every residue plot spans the whole chain, so the plots line up with each other and the lanes */
function residueAxis(entry: Entry): Partial<Plotly.LayoutAxis> {
  const ps = entry.chain.positions;
  return { title: { text: "residue (auth_seq_id)" }, range: [ps[0].seq - 0.5, ps[ps.length - 1].seq + 0.5], showgrid: false };
}

function hoverColumn(seq: number | null): Partial<Plotly.Shape>[] {
  if (seq == null) return [];
  return [{
    type: "rect", xref: "x", yref: "paper", x0: seq - 0.5, x1: seq + 0.5, y0: 0, y1: 1,
    fillcolor: "rgba(102, 59, 228, 0.14)", line: { width: 0 }, layer: "below",
  }];
}

function seqHandlers(links: PlotLinks) {
  return {
    onHover: (e: Plotly.PlotMouseEvent) => {
      const x = e.points[0]?.x;
      if (typeof x === "number") links.setHoverSeq(x);
    },
    onUnhover: () => links.setHoverSeq(null),
  };
}

// --- 1. sorted landscapes: the comparison mHDX can make ---------------------------------

export function LandscapePlot({ entry, links }: { entry: Entry; links: PlotLinks }) {
  const data = useMemo(() => {
    const traces: Partial<Plotly.Data>[] = [];
    for (const m of entry.mhdx) {
      const y = m.dg_sorted.filter((v): v is number => v != null).sort((a, b) => b - a);
      traces.push({
        type: "scatter", mode: "lines+markers", name: `mHDX-MS (${m.library}, ${m.pH_label})`,
        x: y.map((_, i) => i + 1), y, line: { color: SERIES.mhdx, width: 2.5 }, marker: { size: 5 },
        hovertemplate: "site %{x}<br>ΔG %{y:.2f} kcal/mol<extra>mHDX-MS</extra>",
      });
    }
    for (const c of nmrConditions(entry)) {
      const t = entry.tracks[`dg:${c.id}`];
      if (!t) continue;
      const y = t.values.filter((v): v is number => v != null).sort((a, b) => b - a);
      traces.push({
        type: "scatter", mode: "lines", name: `HDX-NMR ${shortLabel(c)}`,
        x: y.map((_, i) => i + 1), y, line: { color: SERIES[c.id] ?? "#999", width: 1.5, dash: c.replicate === "mean" ? "solid" : "dot" },
        hovertemplate: `site %{x}<br>ΔG %{y:.2f} kcal/mol<extra>${shortLabel(c)}</extra>`,
      });
    }
    return traces;
  }, [entry]);
  const layout = useMemo<Partial<Plotly.Layout>>(() => ({
    xaxis: { title: { text: "site rank (highest ΔG first)" } },
    yaxis: { title: { text: "ΔG (kcal/mol)" } },
    margin: { l: 52, r: 12, t: 8, b: 96 },
    legend: { orientation: "h", y: -0.3, x: 0, font: { size: 10.5 } },
    shapes: links.threshold == null ? [] : [{
      type: "line", xref: "paper", x0: 0, x1: 1, y0: links.threshold, y1: links.threshold,
      line: { color: "#663be4", width: 1, dash: "dash" },
    }],
  }), [links.threshold]);
  return (
    <Card title="Sorted ΔG: mHDX-MS and HDX-NMR" source="m_001 · m_002">
      <Plot data={data} layout={layout} height={340} />
    </Card>
  );
}

// --- 2. isotope distributions over time (Ferrari-style) ---------------------------------

function pickTimepoints(times: (number | null)[], n: number): number[] {
  const idx = times.map((t, i) => [t, i] as const).filter(([t]) => t != null && t > 0).map(([, i]) => i);
  if (idx.length <= n) return [0, ...idx];
  const out = new Set<number>([0]);
  for (let k = 0; k < n; k++) out.add(idx[Math.round((k * (idx.length - 1)) / (n - 1))]);
  return [...out];
}

export function IsotopePlot({ m, links }: { m: MhdxMeasurement; links: PlotLinks }) {
  const picks = useMemo(() => pickTimepoints(m.timepoints_s, 9), [m]);
  const nearest = useMemo(() => {
    let best = picks[0];
    for (const i of picks) {
      const t = m.timepoints_s[i] ?? 0;
      if (Math.abs(Math.log10(t + 1) - Math.log10(links.timeS + 1)) < Math.abs(Math.log10((m.timepoints_s[best] ?? 0) + 1) - Math.log10(links.timeS + 1))) best = i;
    }
    return best;
  }, [picks, m, links.timeS]);
  const data = useMemo(() => {
    const traces: Partial<Plotly.Data>[] = [];
    picks.forEach((ti, row) => {
      const exp = m.exp_distribution[ti].map((v) => v ?? 0);
      const pred = m.pred_distribution[ti].map((v) => v ?? 0);
      const peak = Math.max(...exp, ...pred, 1e-9);
      const off = row * 1.15;
      const xs = exp.map((_, i) => i);
      const active = ti === nearest;
      const time = m.timepoints_s[ti] ?? 0;
      traces.push({
        type: "scatter", mode: "lines", x: [...xs, xs.length - 1, 0], y: [...exp.map((v) => off + v / peak), off, off],
        fill: "toself", fillcolor: active ? "rgba(102,59,228,0.35)" : "rgba(95,97,107,0.18)", line: { width: 0 },
        hoverinfo: "skip", showlegend: row === 0, name: "measured", legendgroup: "exp",
        customdata: xs.map(() => time),
      });
      traces.push({
        type: "scatter", mode: "lines", x: xs, y: pred.map((v) => off + v / peak),
        line: { color: active ? "#663be4" : "#3d414f", width: 1.2 }, showlegend: row === 0, name: "predicted (fit)", legendgroup: "fit",
        customdata: xs.map(() => time),
        hovertemplate: `${time === 0 ? "undeuterated" : fmtTime(time)}<br>+%{x} Da<extra></extra>`,
      });
    });
    return traces;
  }, [picks, m, nearest]);
  const layout = useMemo<Partial<Plotly.Layout>>(() => ({
    xaxis: { title: { text: "mass shift (Da)" }, range: [0, 48] },
    yaxis: {
      tickvals: picks.map((_, r) => r * 1.15 + 0.3),
      ticktext: picks.map((ti) => (m.timepoints_s[ti] ? fmtTime(m.timepoints_s[ti] as number) : "0 s")),
      showgrid: false, zeroline: false,
    },
    margin: { l: 62, r: 12, t: 8, b: 40 },
  }), [picks, m]);
  return (
    <Card
      title="Isotope distributions over time"
      source={`m_001 · a_d3_iso row ${m.source_row}`}
      caption={<>Measured intact-protein isotope distributions (filled) and the distributions predicted by the rate fit (line), at 9 of {m.timepoints_s.length} labeling times. Each row is scaled to its maximum. Selecting a row sets the time cursor.</>}
    >
      <Plot
        data={data}
        layout={layout}
        height={360}
        onClick={(e) => {
          const t = (e.points[0]?.customdata as unknown as number) ?? null;
          if (typeof t === "number") links.setTimeS(Math.max(t, 10));
        }}
      />
    </Card>
  );
}

// --- 3. uptake curve ------------------------------------------------------------------------

export function UptakePlot({ m, links }: { m: MhdxMeasurement; links: PlotLinks }) {
  const data = useMemo<Partial<Plotly.Data>[]>(() => {
    const pts = m.timepoints_s.map((t, i) => [t, m.exp_centroid[i], m.pred_centroid[i]] as const).filter(([t]) => t != null && t > 0);
    return [
      {
        type: "scatter", mode: "markers", name: "measured centroid", x: pts.map((p) => p[0]), y: pts.map((p) => p[1]),
        marker: { color: "#3d414f", size: 6 }, hovertemplate: "%{x:.0f} s<br>%{y:.2f} Da<extra>measured</extra>",
      },
      {
        type: "scatter", mode: "lines", name: "fit centroid", x: pts.map((p) => p[0]), y: pts.map((p) => p[2]),
        line: { color: SERIES.mhdx, width: 2 }, hovertemplate: "%{x:.0f} s<br>%{y:.2f} Da<extra>fit</extra>",
      },
    ];
  }, [m]);
  const layout = useMemo<Partial<Plotly.Layout>>(() => ({
    xaxis: {
      type: "log", title: { text: "labeling time" },
      tickvals: [10, 100, 1e3, 1e4, 1e5], ticktext: ["10 s", "100 s", "17 min", "2.8 h", "1.2 d"],
    },
    margin: { l: 52, r: 12, t: 8, b: 84 },
    yaxis: { title: { text: "centroid mass shift (Da)" } },
    shapes: [{ type: "line", xref: "x", yref: "paper", x0: links.timeS, x1: links.timeS, y0: 0, y1: 1, line: { color: "#663be4", width: 1.5, dash: "dot" } }],
  }), [links.timeS]);
  return (
    <Card
      title="Deuterium uptake, intact protein"
      source={`m_001 · a_d3_iso row ${m.source_row}`}
      caption="Centroids computed by this repository from the measured and predicted distributions, without back-exchange correction. The dotted line marks the time used for the structure coloring; selecting a point moves it."
    >
      <Plot data={data} layout={layout} height={340} onClick={(e) => {
        const x = e.points[0]?.x;
        if (typeof x === "number") links.setTimeS(x);
      }} />
    </Card>
  );
}

// --- 4. chiclet: residues x conditions ------------------------------------------------------

export function ChicletPlot({ entry, em, links }: { entry: Entry; em: EntryMetrics; links: PlotLinks }) {
  const seqs = entry.chain.positions.map((p) => p.seq);
  const conds = nmrConditions(entry).filter((c) => entry.tracks[`dg:${c.id}`]);
  const data = useMemo<Partial<Plotly.Data>[]>(() => {
    const z = conds.map((c) => {
      const m = bySeq(trackFromJSON(entry.tracks[`dg:${c.id}`]));
      return seqs.map((s) => m.get(s) ?? null);
    });
    return [{
      type: "heatmap", x: seqs, y: conds.map(shortLabel), z, zmin: em.dgDomain[0], zmax: em.dgDomain[1],
      colorscale: colorscale(STABILITY_RAMP), xgap: 1, ygap: 2,
      colorbar: { title: "kcal/mol", titleside: "right", thickness: 10, len: 0.9 },
      hovertemplate: "residue %{x}<br>ΔG %{z:.2f} kcal/mol<extra>%{y}</extra>",
    }];
  }, [entry, em, conds, seqs]);
  const layout = useMemo<Partial<Plotly.Layout>>(() => ({
    xaxis: residueAxis(entry),
    yaxis: { showgrid: false, automargin: true },
    margin: { l: 90, r: 12, t: 8, b: 40 },
    shapes: hoverColumn(links.hoverSeq),
  }), [links.hoverSeq, entry]);
  return (
    <Card
      title="ΔG per residue by HDX-NMR condition"
      source="m_002 · a_d4"
      caption="Blank cells have no reported value. Prolines lack a backbone amide hydrogen; Dataset_4 does not state the reason for other gaps."
    >
      <Plot data={data} layout={layout} height={220} {...seqHandlers(links)} />
    </Card>
  );
}

// --- 5. butterfly: one construct against the other ----------------------------------------

function trackMap(entry: Entry, key: string) {
  return entry.tracks[key] ? bySeq(trackFromJSON(entry.tracks[key])) : null;
}

export function ButterflyPlot({ entry, links }: { entry: Entry; links: PlotLinks }) {
  const top = trackMap(entry, "dg:nmr_6xhis_mean");
  const bottom = trackMap(entry, "dg:nmr_nohis_r1");
  const data = useMemo<Partial<Plotly.Data>[]>(() => {
    if (!top || !bottom) return [];
    const ts = [...top.keys()];
    const bs = [...bottom.keys()];
    return [
      { type: "bar", name: "6xHis (mean)", x: ts, y: ts.map((s) => top.get(s)!), marker: { color: SERIES.nmr_6xhis_mean },
        hovertemplate: "residue %{x}<br>ΔG %{y:.2f}<extra>6xHis</extra>" },
      { type: "bar", name: "No-His", x: bs, y: bs.map((s) => -bottom.get(s)!), marker: { color: SERIES.nmr_nohis_r1 },
        customdata: bs.map((s) => bottom.get(s)!), hovertemplate: "residue %{x}<br>ΔG %{customdata:.2f}<extra>No-His</extra>" },
    ];
  }, [top, bottom]);
  const layout = useMemo<Partial<Plotly.Layout>>(() => ({
    barmode: "overlay",
    xaxis: residueAxis(entry),
    yaxis: { title: { text: "ΔG (kcal/mol); No-His plotted negative" }, tickformat: "~f" },
    shapes: hoverColumn(links.hoverSeq),
    margin: { l: 52, r: 12, t: 8, b: 84 },
  }), [links.hoverSeq, entry]);
  if (!top || !bottom) return null;
  return (
    <Card title="ΔG per residue: 6xHis (mean) and No-His" source="m_002 · a_d4 rows 37, 5">
      <Plot data={data} layout={layout} height={280} {...seqHandlers(links)} />
    </Card>
  );
}

// --- 6. Woods-style difference with replicate noise -----------------------------------------

export function TagEffectPlot({ entry, links }: { entry: Entry; links: PlotLinks }) {
  const mean = trackMap(entry, "dg:nmr_6xhis_mean");
  const r1 = trackMap(entry, "dg:nmr_6xhis_r1");
  const r2 = trackMap(entry, "dg:nmr_6xhis_r2");
  const nohis = trackMap(entry, "dg:nmr_nohis_r1");
  const rows = useMemo(() => {
    if (!mean || !nohis || !r1 || !r2) return [];
    return [...mean.keys()]
      .filter((s) => nohis.has(s))
      .map((s) => {
        const d = mean.get(s)! - nohis.get(s)!;
        const noise = r1.has(s) && r2.has(s) ? Math.abs(r1.get(s)! - r2.get(s)!) / 2 : null;
        return { s, d, noise, beyond: noise != null && Math.abs(d) > 2 * noise };
      });
  }, [mean, nohis, r1, r2]);
  const data = useMemo<Partial<Plotly.Data>[]>(() => [{
    type: "bar", x: rows.map((r) => r.s), y: rows.map((r) => r.d),
    marker: { color: rows.map((r) => (r.beyond ? hex(DEUTERATION_RAMP[r.d > 0 ? 0 : 2]) : "#c8cdd4")) },
    error_y: { type: "data", array: rows.map((r) => (r.noise ?? 0) * 2), visible: true, color: "#5f616b", thickness: 1, width: 2 },
    hovertemplate: "residue %{x}<br>ΔΔG %{y:.2f} kcal/mol<extra></extra>",
  }], [rows]);
  const layout = useMemo<Partial<Plotly.Layout>>(() => ({
    xaxis: residueAxis(entry),
    yaxis: { title: { text: "ΔΔG, 6xHis − No-His" }, zeroline: true },
    shapes: hoverColumn(links.hoverSeq),
    showlegend: false,
  }), [links.hoverSeq, entry]);
  if (!rows.length) return null;
  const n = rows.filter((r) => r.beyond).length;
  return (
    <Card
      title="ΔΔG per residue, 6xHis minus No-His"
      source="m_002 · computed here"
      caption={<>Bars: ΔΔG = ΔG(6xHis mean) − ΔG(No-His). Whiskers: ±|r1 − r2| from the two 6xHis replicates. {n} of {rows.length} residues have |ΔΔG| outside this range (blue: higher ΔG in 6xHis; red: lower). No-His has one replicate, so its variability is not included. This is not a statistical test.</>}
    >
      <Plot data={data} layout={layout} height={260} {...seqHandlers(links)} />
    </Card>
  );
}
