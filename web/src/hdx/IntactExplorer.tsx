import { useMemo, useState } from "react";
import type Plotly from "plotly.js";

import { Card } from "./card";
import { fmt, fmtTime } from "./data";
import Plot from "./Plot";
import type { IntactView, MhdxMeasurement } from "./types";

// The Explore tab of an intact-protein mHDX-MS entry. Intact data give sorted site ΔG and
// whole-protein isotope distributions, not residue-resolved values, so there is no structure
// coloring and no sequence lanes. Plots ported from web/src/hdx/plots.tsx at commit 0612dc7.

const ACCENT = "#663be4";

export default function IntactExplorer({ view }: { view: IntactView }) {
  const [rowId, setRowId] = useState(view.mhdx[0].id);
  const m = view.mhdx.find((x) => x.id === rowId) ?? view.mhdx[0];
  const [timeS, setTimeS] = useState(1000);
  const nSites = m.dg_sorted.filter((v) => v != null).length;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2 rounded-lg border border-line bg-white p-3 text-[12px] text-ink-secondary">
        {view.mhdx.length > 1 && (
          <select value={rowId} onChange={(e) => setRowId(e.target.value)} className="w-full max-w-md rounded border border-line-strong bg-white px-2 py-1">
            {view.mhdx.map((x) => <option key={x.id} value={x.id}>{x.library} · {x.pH_label} · Dataset_3 row {x.source_row}</option>)}
          </select>
        )}
        <p>
          <b className="text-ink">Measurement.</b> Dataset_3 row {m.source_row}, library {m.library}, {m.pH_label}; {m.timepoints_s.length} labeling
          times; retention time {fmt(m.retention_time_min)} min; {nSites} exchanging sites fitted.
        </p>
        <p className="break-all font-mono text-[11px] text-ink">{m.sequence}</p>
        <p className="text-[11px] text-ink-muted">
          Intact-protein mHDX-MS measures the whole domain at once. The fitted ΔG values are sorted by size and are not assigned to
          residues, so this entry has no structure coloring or residue lanes.
        </p>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <LandscapePlot m={m} />
        <UptakePlot m={m} timeS={timeS} setTimeS={setTimeS} />
        <IsotopePlot m={m} timeS={timeS} setTimeS={setTimeS} />
      </div>
    </div>
  );
}

// --- sorted site ΔG ------------------------------------------------------------------------

function LandscapePlot({ m }: { m: MhdxMeasurement }) {
  const data = useMemo<Partial<Plotly.Data>[]>(() => {
    const y = m.dg_sorted.filter((v): v is number => v != null).sort((a, b) => b - a);
    return [{
      type: "scatter", mode: "lines+markers", name: `mHDX-MS (${m.library}, ${m.pH_label})`,
      x: y.map((_, i) => i + 1), y, line: { color: ACCENT, width: 2.5 }, marker: { size: 5 },
      hovertemplate: "site %{x}<br>ΔG %{y:.2f} kcal/mol<extra>mHDX-MS</extra>",
    }];
  }, [m]);
  const layout = useMemo<Partial<Plotly.Layout>>(() => ({
    xaxis: { title: { text: "site rank (highest ΔG first)" } },
    yaxis: { title: { text: "ΔG (kcal/mol)" } },
    showlegend: false,
  }), []);
  return (
    <Card title="Sorted site ΔG" prov="plot:landscape"
      caption="ΔG per exchanging site from the authors' rate fit (Dataset_3 free_energy), sorted in descending order. Sites are ranks, not residues.">
      <Plot data={data} layout={layout} height={320} />
    </Card>
  );
}

// --- uptake curve --------------------------------------------------------------------------

function UptakePlot({ m, timeS, setTimeS }: { m: MhdxMeasurement; timeS: number; setTimeS: (t: number) => void }) {
  const data = useMemo<Partial<Plotly.Data>[]>(() => {
    const colors = [["#3d414f", ACCENT], ["#8a8d96", "#c2a5f5"]];
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
    yaxis: { title: { text: "centroid mass shift (Da)" } },
    margin: { l: 52, r: 12, t: 8, b: 84 },
    shapes: [{ type: "line", xref: "x", yref: "paper", x0: timeS, x1: timeS, y0: 0, y1: 1, line: { color: ACCENT, width: 1.5, dash: "dot" } }],
  }), [timeS]);
  return (
    <Card title="Deuterium uptake, intact protein" prov="plot:uptake"
      caption={`Centroids computed by this repository from the measured and predicted distributions, without back-exchange correction.${m.merged ? " One series per pH label; times are as recorded (true_time) and are not converted between pH values." : ""} The dotted line marks the time highlighted in the isotope distributions; selecting a point moves it.`}>
      <Plot data={data} layout={layout} height={320} onClick={(e) => {
        const x = e.points[0]?.x;
        if (typeof x === "number") setTimeS(x);
      }} />
    </Card>
  );
}

// --- isotope distributions over time -------------------------------------------------------

function pickTimepoints(times: (number | null)[], n: number): number[] {
  const idx = times.map((t, i) => [t, i] as const).filter(([t]) => t != null && t > 0).map(([, i]) => i);
  if (idx.length <= n) return [0, ...idx];
  const out = new Set<number>([0]);
  for (let k = 0; k < n; k++) out.add(idx[Math.round((k * (idx.length - 1)) / (n - 1))]);
  return [...out];
}

function IsotopePlot({ m, timeS, setTimeS }: { m: MhdxMeasurement; timeS: number; setTimeS: (t: number) => void }) {
  // a merged measurement has a pH 6 and a pH 9 series; the ridgeline shows the first
  const shownPH = m.pH_labels[0];
  const picks = useMemo(
    () => pickTimepoints(m.timepoints_s.map((t, i) => (m.pH_index[i] === shownPH ? t : null)), 9),
    [m, shownPH],
  );
  const nearest = useMemo(() => {
    const d = (i: number) => Math.abs(Math.log10((m.timepoints_s[i] ?? 0) + 1) - Math.log10(timeS + 1));
    return picks.reduce((best, i) => (d(i) < d(best) ? i : best), picks[0]);
  }, [picks, m, timeS]);
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
        line: { color: active ? ACCENT : "#3d414f", width: 1.2 }, showlegend: row === 0, name: "predicted (fit)", legendgroup: "fit",
        customdata: xs.map(() => time),
        hovertemplate: `${time === 0 ? "undeuterated" : fmtTime(time)}<br>+%{x} Da<extra></extra>`,
      });
    });
    return traces;
  }, [picks, m, nearest]);
  const maxShift = Math.max(...m.exp_distribution.map((d) => d.length));
  const layout = useMemo<Partial<Plotly.Layout>>(() => ({
    xaxis: { title: { text: "mass shift (Da)" }, range: [0, maxShift] },
    yaxis: {
      tickvals: picks.map((_, r) => r * 1.15 + 0.3),
      ticktext: picks.map((ti) => (m.timepoints_s[ti] ? fmtTime(m.timepoints_s[ti] as number) : "0 s")),
      showgrid: false, zeroline: false,
    },
    margin: { l: 62, r: 12, t: 8, b: 40 },
  }), [picks, m, maxShift]);
  return (
    <Card title="Isotope distributions over time" prov="plot:isotope"
      caption={<>Measured intact-protein isotope distributions (filled) and the distributions predicted by the rate fit (line), at {picks.length} of {m.timepoints_s.length} labeling times{m.merged ? `; ${shownPH} series shown (this measurement merges ${m.pH_labels.join(" and ")})` : ""}. Each row is scaled to its maximum. Selecting a row sets the time cursor.</>}>
      <Plot data={data} layout={layout} height={360} onClick={(e) => {
        const t = (e.points[0]?.customdata as unknown as number) ?? null;
        if (typeof t === "number") setTimeS(Math.max(t, 10));
      }} />
    </Card>
  );
}
