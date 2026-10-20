import { type ReactNode, useMemo } from "react";
import type Plotly from "plotly.js";

import { trackFromJSON } from "../vendor/hetstar/tracks";
import { SERIES, STABILITY_RAMP, DEUTERATION_RAMP } from "./colors";
import { fmtTime } from "./data";
import { SourceLine } from "./provenance-card";
import { bySeq, conditionText, measurements, nmrConditions, representative, seriesColor, shortLabel, type EntryMetrics } from "./model";
import Plot from "./Plot";
import type { View, MhdxMeasurement } from "./types";

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
  prov,
  children,
  caption,
}: {
  title: string;
  /** derivation id: where the plotted values come from */
  prov: string;
  children: ReactNode;
  caption?: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-white p-3">
      <header className="flex flex-col gap-0.5">
        <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
        <SourceLine id={prov} />
      </header>
      {children}
      {caption && <p className="text-[11px] leading-snug text-ink-muted">{caption}</p>}
    </section>
  );
}

/** every residue plot spans the whole chain, so the plots line up with each other and the lanes */
function residueAxis(entry: View): Partial<Plotly.LayoutAxis> {
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

export function LandscapePlot({ entry, links }: { entry: View; links: PlotLinks }) {
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
        x: y.map((_, i) => i + 1), y, line: { color: seriesColor(c), width: 1.5, dash: c.replicate === "mean" ? "solid" : "dot" },
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
    <Card title="Sorted ΔG: mHDX-MS and HDX-NMR" prov="plot:landscape">
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
  // a merged measurement has a pH 6 and a pH 9 series; the ridgeline shows the first
  const shownPH = m.pH_labels[0];
  const picks = useMemo(
    () => pickTimepoints(m.timepoints_s.map((t, i) => (m.pH_index[i] === shownPH ? t : null)), 9),
    [m, shownPH],
  );
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
      prov="plot:isotope"
      caption={<>Measured intact-protein isotope distributions (filled) and the distributions predicted by the rate fit (line), at {picks.length} of {m.timepoints_s.length} labeling times{m.merged ? `; ${shownPH} series shown (this measurement merges ${m.pH_labels.join(" and ")})` : ""}. Each row is scaled to its maximum. Selecting a row sets the time cursor.</>}
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
    const colors = [["#3d414f", SERIES.mhdx], ["#8a8d96", "#c2a5f5"]];
    return m.pH_labels.flatMap((ph, k) => {
      const pts = m.timepoints_s
        .map((t, i) => [t, m.exp_centroid[i], m.pred_centroid[i], m.pH_index[i]] as const)
        .filter(([t, , , p]) => t != null && t > 0 && p === ph)
        .sort((a, b) => (a[0] as number) - (b[0] as number));
      const tag = m.pH_labels.length > 1 ? ` ${ph}` : "";
      const [cm, cf] = colors[Math.min(k, colors.length - 1)];
      return [
        {
          type: "scatter", mode: "markers", name: `measured${tag}`, x: pts.map((p) => p[0]), y: pts.map((p) => p[1]),
          marker: { color: cm, size: 6 }, hovertemplate: `%{x:.0f} s<br>%{y:.2f} Da<extra>measured${tag}</extra>`,
        },
        {
          type: "scatter", mode: "lines", name: `fit${tag}`, x: pts.map((p) => p[0]), y: pts.map((p) => p[2]),
          line: { color: cf, width: 2 }, hovertemplate: `%{x:.0f} s<br>%{y:.2f} Da<extra>fit${tag}</extra>`,
        },
      ] as Partial<Plotly.Data>[];
    });
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
      prov="plot:uptake"
      caption={`Centroids computed by this repository from the measured and predicted distributions, without back-exchange correction.${m.merged ? " One series per pH label; times are as recorded (true_time) and are not converted between pH values." : ""} The dotted line marks the time used for the structure coloring; selecting a point moves it.`}
    >
      <Plot data={data} layout={layout} height={340} onClick={(e) => {
        const x = e.points[0]?.x;
        if (typeof x === "number") links.setTimeS(x);
      }} />
    </Card>
  );
}

// --- 4. chiclet: residues x conditions ------------------------------------------------------

export function ChicletPlot({ entry, em, links }: { entry: View; em: EntryMetrics; links: PlotLinks }) {
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
      prov="plot:chiclet"
      caption="Blank cells have no reported value. Prolines lack a backbone amide hydrogen; Dataset_4 does not state the reason for other gaps."
    >
      <Plot data={data} layout={layout} height={220} {...seqHandlers(links)} />
    </Card>
  );
}

// --- 5. butterfly: one construct against the other ----------------------------------------

function trackMap(entry: View, key: string) {
  return entry.tracks[key] ? bySeq(trackFromJSON(entry.tracks[key])) : null;
}

export function ButterflyPlot({ entry, links }: { entry: View; links: PlotLinks }) {
  const a = representative(entry, "6xHis");
  const b = representative(entry, "No-His");
  const top = a ? trackMap(entry, `dg:${a.id}`) : null;
  const bottom = b ? trackMap(entry, `dg:${b.id}`) : null;
  const data = useMemo<Partial<Plotly.Data>[]>(() => {
    if (!top || !bottom || !a || !b) return [];
    const ts = [...top.keys()];
    const bs = [...bottom.keys()];
    return [
      { type: "bar", name: a.label, x: ts, y: ts.map((s) => top.get(s)!), marker: { color: seriesColor(a) },
        hovertemplate: `residue %{x}<br>ΔG %{y:.2f}<extra>${shortLabel(a)}</extra>` },
      { type: "bar", name: b.label, x: bs, y: bs.map((s) => -bottom.get(s)!), marker: { color: seriesColor(b) },
        customdata: bs.map((s) => bottom.get(s)!), hovertemplate: `residue %{x}<br>ΔG %{customdata:.2f}<extra>${shortLabel(b)}</extra>` },
    ];
  }, [top, bottom, a, b]);
  const layout = useMemo<Partial<Plotly.Layout>>(() => ({
    barmode: "overlay",
    xaxis: residueAxis(entry),
    yaxis: { title: { text: "ΔG (kcal/mol)" }, tickformat: "~f" },
    shapes: hoverColumn(links.hoverSeq),
    margin: { l: 52, r: 12, t: 8, b: 84 },
  }), [links.hoverSeq, entry]);
  if (!top || !bottom || !a || !b) return null;
  return (
    <Card title={`ΔG per residue: ${a.label} and ${b.label}`} prov="plot:butterfly" caption="No-His values are plotted as negative.">
      <Plot data={data} layout={layout} height={280} {...seqHandlers(links)} />
    </Card>
  );
}

// --- 6. Woods-style difference with measurement spread -----------------------------------------

export function TagEffectPlot({ entry, links }: { entry: View; links: PlotLinks }) {
  const a = representative(entry, "6xHis");
  const b = representative(entry, "No-His");
  const noisy = useMemo(
    () => ["6xHis", "No-His"].map((c) => measurements(entry, c)).filter((rs) => rs.length >= 2),
    [entry],
  );
  const rows = useMemo(() => {
    if (!a || !b) return [];
    const ma = trackMap(entry, `dg:${a.id}`)!;
    const mb = trackMap(entry, `dg:${b.id}`)!;
    const reps = noisy.map((rs) => rs.map((c) => trackMap(entry, `dg:${c.id}`)!));
    return [...ma.keys()]
      .filter((s) => mb.has(s))
      .map((s) => {
        const d = ma.get(s)! - mb.get(s)!;
        // largest range (max - min) at this residue among constructs with >= 2 measurements
        const ranges = reps
          .map((ms) => ms.map((m) => m.get(s)).filter((v): v is number => v != null))
          .filter((vs) => vs.length >= 2)
          .map((vs) => Math.max(...vs) - Math.min(...vs));
        const range = ranges.length ? Math.max(...ranges) : null;
        return { s, d, range, beyond: range != null && Math.abs(d) > range };
      });
  }, [entry, a, b, noisy]);
  const data = useMemo<Partial<Plotly.Data>[]>(() => [{
    type: "bar", x: rows.map((r) => r.s), y: rows.map((r) => r.d),
    marker: { color: rows.map((r) => (r.beyond ? hex(DEUTERATION_RAMP[r.d > 0 ? 0 : 2]) : "#c8cdd4")) },
    error_y: { type: "data", array: rows.map((r) => r.range ?? 0), visible: true, color: "#5f616b", thickness: 1, width: 2 },
    hovertemplate: "residue %{x}<br>ΔΔG %{y:.2f} kcal/mol<extra></extra>",
  }], [rows]);
  const layout = useMemo<Partial<Plotly.Layout>>(() => ({
    xaxis: residueAxis(entry),
    yaxis: { title: { text: "ΔΔG, 6xHis − No-His" }, zeroline: true },
    shapes: hoverColumn(links.hoverSeq),
    showlegend: false,
  }), [links.hoverSeq, entry]);
  if (!rows.length || !a || !b) return null;
  const n = rows.filter((r) => r.beyond).length;
  const differ = noisy.filter((rs) => new Set(rs.map(conditionText)).size > 1).map((rs) => rs[0].construct);
  const noiseText = noisy.length
    ? `Whiskers: largest range (max − min) at each residue across the measurements of ${noisy.map((rs) => `${rs[0].construct} (${rs.length})`).join(" and ")}. ${n} of ${rows.length} residues have |ΔΔG| outside this range (blue: higher ΔG in 6xHis; red: lower).${differ.length ? ` The ${differ.join(" and ")} measurements differ in labeling conditions, so the range includes condition effects as well as measurement variation.` : ""}`
    : "No construct has two or more measurements, so no range is shown.";
  return (
    <Card
      title="ΔΔG per residue, 6xHis minus No-His"
      prov="plot:woods"
      caption={<>Bars: ΔΔG = ΔG({a.label}) − ΔG({b.label}). {noiseText} This is not a statistical test.</>}
    >
      <Plot data={data} layout={layout} height={260} {...seqHandlers(links)} />
    </Card>
  );
}
