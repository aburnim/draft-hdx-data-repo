import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type Plotly from "plotly.js";

import MolstarViewer from "../vendor/hetstar/MolstarViewer";
import type { ResidueRef } from "../vendor/hetstar/keys";
import { makeMetricLane } from "../vendor/hetstar/lanes/PlotLanes";
import SequenceLanes, { type ResidueRange } from "../vendor/hetstar/lanes/SequenceLanes";
import type { LaneMetric, LaneModule, LaneProps } from "../vendor/hetstar/lanes/types";
import { residueLoci } from "../vendor/hetstar/molstar/queries";
import type { StructureView } from "../vendor/hetstar/molstar/style";
import type { MolstarViewer as Viewer } from "../vendor/hetstar/molstar/viewer";
import { sequenceModelFromJSON } from "../vendor/hetstar/sequence";
import { makeTrack } from "../vendor/hetstar/tracks";
import { rampColor } from "../vendor/hetstar/color";
import { DEUTERATION_RAMP, MISSING_COLOR, STABILITY_RAMP } from "./colors";
import { fmt, fmtTime, useText } from "./data";
import { rampGradient } from "./model";
import Plot from "./Plot";
import { Card } from "./plots";
import { SourceLine } from "./provenance-card";
import type { Comparison, DiffClass, Peptide, PeptideView } from "./types";
import { setResidueColors } from "./value-theme";

// Peptide-level HDX-MS explorer. Residue positions are kept in construct numbering in the
// data; the structure, lanes and plots show ecDHFR numbering through each structure's
// recorded alignment (construct position -> label_seq_id -> auth_seq_id).

export const CLASS_COLOR: Record<DiffClass, number> = {
  "more rigid": 0x2166ac,
  "more flexible": 0xb2182b,
  mixed: 0x762a83,
  "no observable difference": 0xf7f7f7,
  "not tested": MISSING_COLOR,
};
const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
const STATE_COLOR: Record<string, string> = { APO: "#3d414f", MTX: "#e08214", TMP: "#1b7837" };
type ColorMode = "class" | "value" | "coverage";

function toInt([r, g, b]: [number, number, number]) {
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

/** greedy row packing for the peptide map */
function packRows(peps: Peptide[]): Map<string, number> {
  const rows: number[] = [];
  const out = new Map<string, number>();
  for (const p of [...peps].sort((a, b) => a.start - b.start || b.end - a.end)) {
    let r = rows.findIndex((end) => end < p.start - 1);
    if (r < 0) {
      rows.push(p.end);
      r = rows.length - 1;
    } else rows[r] = p.end;
    out.set(p.id, r);
  }
  return out;
}

export default function PeptideExplorer({ view }: { view: PeptideView }) {
  const [compId, setCompId] = useState(view.comparisons[1]?.id ?? view.comparisons[0].id);
  const comp = view.comparisons.find((c) => c.id === compId)!;
  const ligandState = view.states.find((s) => s.id === comp.b)!;
  const [pdb, setPdb] = useState(ligandState.pdb);
  useEffect(() => setPdb(ligandState.pdb), [ligandState.pdb]);
  const structure = view.structures.find((s) => s.pdb === pdb)!;
  const [mode, setMode] = useState<ColorMode>("class");
  const [selected, setSelected] = useState<string | null>(null);
  const [binId, setBinId] = useState<string>("max");
  const [corrected, setCorrected] = useState(false);
  const [hover, setHover] = useState<{ ref: ResidueRef | null; from: "3d" | "ui" }>({ ref: null, from: "ui" });
  const [selection, setSelection] = useState<ResidueRange[]>([]);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [loaded, setLoaded] = useState(0);
  const cif = useText(`structures/${pdb}.cif`);
  const chainId = structure.chain.id;
  const offset = 15; // ecDHFR numbering = construct position - 15 (tag and TEV site precede it)
  const resNo = (pos: number) => pos - offset;
  const pepById = useMemo(() => new Map(view.peptides.map((p) => [p.id, p])), [view]);

  // --- residue values in construct numbering, then keyed to the chosen structure ---
  const coverage = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of view.peptides) {
      if (!p.states.includes(comp.a) && !p.states.includes(comp.b)) continue;
      for (let i = p.start; i <= p.end; i++) m.set(i, (m.get(i) ?? 0) + 1);
    }
    return m;
  }, [view, comp]);
  const maxCov = Math.max(1, ...coverage.values());
  const maxVal = useMemo(() => Math.max(0.05, ...Object.values(comp.residue).map((r) => Math.abs(r.value ?? 0))), [comp]);

  const keyOf = useCallback(
    (pos: number) => {
      const auth = structure.auth_of[String(pos)];
      return auth == null ? null : `${chainId}|${auth}|`;
    },
    [structure, chainId],
  );

  const colors = useMemo(() => {
    const t = new Map<string, number>();
    for (let pos = 1; pos <= view.construct.sequence.length; pos++) {
      const k = keyOf(pos);
      if (!k) continue;
      if (mode === "coverage") {
        const c = coverage.get(pos);
        if (c) t.set(k, toInt(rampColor(STABILITY_RAMP, c / maxCov)));
        continue;
      }
      const r = comp.residue[String(pos)];
      if (!r) continue;
      if (mode === "class") t.set(k, CLASS_COLOR[r.class]);
      else if (r.value != null) t.set(k, toInt(rampColor(DEUTERATION_RAMP, 0.5 + r.value / (2 * maxVal))));
    }
    return t;
  }, [view, comp, mode, coverage, maxCov, maxVal, keyOf]);

  const structView = useMemo<StructureView>(() => ({ representation: "cartoon", colorTheme: "hdx-value" }), []);
  useEffect(() => {
    setResidueColors(colors);
    if (viewer && loaded) viewer.recolor();
  }, [colors, viewer, loaded]);
  const onLoaded = useCallback(() => setLoaded((n) => n + 1), []);

  // hover and selection, both directions (hetstar pattern)
  useEffect(() => {
    if (!viewer) return;
    const offH = viewer.subscribeToHover((info) =>
      setHover({ ref: info ? { chain: info.chainId, seq: info.authSeqId, ins: info.insCode } : null, from: "3d" }),
    );
    const offC = viewer.subscribeToClick((info) => setSelection(info ? [{ chain: info.chainId, from: info.authSeqId, to: info.authSeqId }] : []));
    return () => {
      offH();
      offC();
    };
  }, [viewer]);
  useEffect(() => {
    if (!viewer || hover.from === "3d") return;
    const s = viewer.getCurrentStructure();
    if (s) viewer.highlightLoci(hover.ref ? residueLoci(s, hover.ref.chain, hover.ref.seq) : null);
  }, [viewer, hover, loaded]);
  useEffect(() => {
    if (!viewer) return;
    const s = viewer.getCurrentStructure();
    const last = selection[selection.length - 1];
    if (!s || !last) return void viewer.clearSelection();
    const loci = residueLoci(s, last.chain, last.from, last.to);
    if (loci) {
      viewer.setSelection(loci);
      viewer.focusLoci(loci);
    }
  }, [viewer, selection, loaded]);

  // selecting a peptide selects its residues in 3D and the lanes
  const selectPeptide = useCallback(
    (id: string | null) => {
      setSelected(id);
      const p = id ? pepById.get(id) : null;
      if (!p) return;
      const a = structure.auth_of[String(Math.max(p.start, offset + 1))];
      const b = structure.auth_of[String(p.end)];
      if (a != null && b != null) setSelection([{ chain: chainId, from: a, to: b }]);
    },
    [pepById, structure, chainId],
  );

  // --- lanes ---
  const seqModel = useMemo(() => sequenceModelFromJSON(structure.chain), [structure]);
  const laneMetrics = useMemo(() => {
    const keysCov: ResidueRef[] = [];
    const vCov: number[] = [];
    const vVal: number[] = [];
    for (let pos = 1; pos <= view.construct.sequence.length; pos++) {
      const auth = structure.auth_of[String(pos)];
      if (auth == null) continue;
      keysCov.push({ chain: chainId, seq: auth, ins: "" });
      vCov.push(coverage.get(pos) ?? NaN);
      vVal.push(comp.residue[String(pos)]?.value ?? NaN);
    }
    const m = new Map<string, LaneMetric | string>();
    m.set("coverage", { id: "coverage", name: "Coverage", unit: "peptides", colors: STABILITY_RAMP, domain: [0, maxCov], track: makeTrack("coverage", "residue", keysCov, Float32Array.from(vCov), { domainHint: [0, maxCov] }) });
    m.set("dd", { id: "dd", name: "ΔD/amide", unit: "Da", colors: DEUTERATION_RAMP, domain: [-maxVal, maxVal], track: makeTrack("dd", "residue", keysCov, Float32Array.from(vVal), { domainHint: [-maxVal, maxVal] }) });
    return m;
  }, [view, structure, chainId, coverage, comp, maxCov, maxVal]);
  const metricLanes = useMemo(
    () => [
      makeMetricLane("coverage", "Coverage", "number of peptides covering each residue", true),
      makeMetricLane("dd", "ΔD per amide", "signed max |ΔD| / N_ex of covering peptides (ligand minus apo)", true),
    ],
    [],
  );
  const extraLanes = useMemo(() => [classLane(comp, structure)], [comp, structure]);

  const onLaneHover = useCallback((ref: ResidueRef | null) => setHover({ ref, from: "ui" }), []);
  const onLaneSelect = useCallback((r: ResidueRange) => setSelection([r]), []);

  const legend = mode === "class" ? null : mode === "value"
    ? { gradient: rampGradient(DEUTERATION_RAMP), lo: `−${fmt(maxVal)} (lower with ligand)`, hi: `+${fmt(maxVal)} Da/amide` }
    : { gradient: rampGradient(STABILITY_RAMP), lo: "0", hi: `${maxCov} peptides` };

  const bins = view.time_bins.filter((b) => b.id !== "t0" && b.id !== "fd");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="relative h-[380px] overflow-hidden rounded-lg border border-line bg-white sm:h-[460px] lg:col-span-7">
          <MolstarViewer data={cif} binary={false} view={structView} onReady={setViewer} onLoaded={onLoaded} />
          <div className="pointer-events-none absolute left-2 top-2 rounded bg-white/85 px-2 py-1 font-mono text-[10.5px] text-ink-secondary">
            {pdb} · {structure.ligands.filter((l) => l !== "CL" && l !== "GOL").join(", ") || "no ligand"}
            {hover.ref && <> · {hover.ref.chain}/{hover.ref.seq}</>}
          </div>
        </div>
        <aside className="flex flex-col gap-3 rounded-lg border border-line bg-white p-3 text-[12px] lg:col-span-5">
          <Field label="Comparison (differential, L2)">
            <select value={compId} onChange={(e) => setCompId(e.target.value)} className="w-full rounded border border-line-strong bg-white px-2 py-1">
              {view.comparisons.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.a} vs {c.b} · same-day replicates {c.replicates.join(", ")} · limit {fmt(c.limit_da)} Da
                </option>
              ))}
            </select>
          </Field>
          <Field label="Color structure by">
            <div className="grid grid-cols-3 gap-1">
              {([["class", "Differential class"], ["value", "ΔD per amide"], ["coverage", "Coverage"]] as [ColorMode, string][]).map(([m, l]) => (
                <button key={m} type="button" onClick={() => setMode(m)}
                  className={`rounded border px-2 py-1 text-[11.5px] ${mode === m ? "border-accent bg-accent-soft text-accent" : "border-line-strong text-ink-secondary hover:bg-surface-muted"}`}>
                  {l}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Structure (L3 mapping)">
            <select value={pdb} onChange={(e) => setPdb(e.target.value)} className="w-full rounded border border-line-strong bg-white px-2 py-1">
              {view.structures.map((s) => (
                <option key={s.pdb} value={s.pdb}>
                  {s.pdb} · {s.state} · {s.method.toLowerCase()} {s.resolution ? `${s.resolution} Å` : ""}
                </option>
              ))}
            </select>
            {structure.notes.map((n) => <Hint key={n}>Note: {n}.</Hint>)}
          </Field>
          {mode === "class" ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-ink-muted">
              {(Object.keys(CLASS_COLOR) as DiffClass[]).map((c) => (
                <span key={c} className="inline-flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm border border-line-strong" style={{ background: hex(CLASS_COLOR[c]) }} />
                  {c} {c !== "not tested" ? `(${comp.counts[c]} peptides)` : ""}
                </span>
              ))}
            </div>
          ) : legend && (
            <div className="flex flex-col gap-1">
              <div className="h-2.5 rounded" style={{ background: legend.gradient }} />
              <div className="flex justify-between font-mono text-[10px] text-ink-muted"><span>{legend.lo}</span><span>{legend.hi}</span></div>
            </div>
          )}
          <div className="flex flex-col gap-1 border-t border-line pt-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-muted">Sources</span>
            <div className="grid grid-cols-[76px_minmax(0,1fr)] items-center gap-x-2 gap-y-1 text-[11px] text-ink-muted">
              <span>colors</span>
              <SourceLine id={`color:${mode}`} />
              <span>coordinates</span>
              <SourceLine id={`structure:coords:${pdb}`} />
            </div>
          </div>
          <Hint>
            Exploratory: classes come from a hybrid significance test with parameters chosen here (α = {comp.alpha}, global limit {fmt(comp.limit_da)} Da from
            {" "}{comp.n} paired replicates). {comp.n <= 2 ? "Two paired replicates give low power; most peptides are not tested or show no observable difference." : ""}
          </Hint>
        </aside>
      </div>

      <div className="rounded-lg border border-line bg-white p-3">
        <SequenceLanes
          model={seqModel}
          secondary={structure.chain.secondary ?? null}
          metrics={laneMetrics}
          metricLanes={metricLanes}
          extraLanes={extraLanes}
          colorBy={null}
          hoverRef={hover.ref}
          selection={selection}
          onHover={onLaneHover}
          onSelect={onLaneSelect}
          leading={<span className="text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">Sequence lanes ({pdb} numbering)</span>}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PeptideMap view={view} comp={comp} selected={selected} onSelect={selectPeptide} resNo={resNo} />
        <UptakePlot view={view} comp={comp} pep={selected ? pepById.get(selected)! : null} corrected={corrected} setCorrected={setCorrected} />
        <WoodsPlot view={view} comp={comp} binId={binId} setBinId={setBinId} bins={bins} onSelect={selectPeptide} resNo={resNo} />
        <VolcanoPlot view={view} comp={comp} onSelect={selectPeptide} />
        <DeltaChiclet view={view} comp={comp} bins={bins} onSelect={selectPeptide} />
        <ReproPlot view={view} />
      </div>
      <IdentificationPanel view={view} pep={selected ? pepById.get(selected)! : null} />
    </div>
  );
}

function classLane(comp: Comparison, structure: PeptideView["structures"][number]): LaneModule {
  const byAuth = new Map<number, DiffClass>();
  for (const [pos, r] of Object.entries(comp.residue)) {
    const a = structure.auth_of[pos];
    if (a != null) byAuth.set(a, r.class);
  }
  const View = memo(function ClassLane({ ctx }: LaneProps) {
    const n = Math.max(1, ctx.chain.length);
    return (
      <>
        {ctx.chain.positions.map((p) => {
          const c = p.ref ? byAuth.get(p.ref.seq) : undefined;
          if (!c) return null;
          return <span key={p.pos} className="absolute inset-y-0" style={{ left: `${((p.pos - 1) / n) * 100}%`, width: `${100 / n}%`, background: hex(CLASS_COLOR[c]) }} />;
        })}
      </>
    );
  });
  return {
    id: "class",
    label: "Class",
    description: "differential class per residue, projected from overlapping peptides",
    defaultOn: true,
    height: 10,
    unavailable: () => null,
    Component: View,
    readout: (ctx, pos) => {
      const p = ctx.chain.positions[pos - 1];
      return p?.ref ? byAuth.get(p.ref.seq) ?? "not covered" : null;
    },
  };
}

// --- plots ------------------------------------------------------------------------------

function PeptideMap({ view, comp, selected, onSelect, resNo }: {
  view: PeptideView; comp: Comparison; selected: string | null; onSelect: (id: string) => void; resNo: (p: number) => number;
}) {
  const peps = useMemo(() => view.peptides.filter((p) => p.states.includes(comp.a) || p.states.includes(comp.b)), [view, comp]);
  const rows = useMemo(() => packRows(peps), [peps]);
  const data = useMemo<Partial<Plotly.Data>[]>(() => {
    const byClass = new Map<DiffClass, Peptide[]>();
    for (const p of peps) {
      const c = comp.classes[p.id] ?? "not tested";
      byClass.set(c, [...(byClass.get(c) ?? []), p]);
    }
    return [...byClass.entries()].map(([c, ps]) => ({
      type: "scatter", mode: "lines", name: c,
      x: ps.flatMap((p) => [resNo(p.start) - 0.4, resNo(p.end) + 0.4, null]),
      y: ps.flatMap((p) => [rows.get(p.id)!, rows.get(p.id)!, null]),
      line: { color: c === "no observable difference" ? "#b8bdc7" : hex(CLASS_COLOR[c]), width: 5 },
      customdata: ps.flatMap((p) => [p.id, p.id, null]),
      text: ps.flatMap((p) => [`${p.seq} (${resNo(p.start)}–${resNo(p.end)})`, `${p.seq}`, ""]),
      hovertemplate: "%{text}<extra>" + c + "</extra>",
    }));
  }, [peps, comp, rows, resNo]);
  const sel = selected ? view.peptides.find((p) => p.id === selected) : null;
  const layout = useMemo<Partial<Plotly.Layout>>(() => ({
    xaxis: { title: { text: "ecDHFR residue (≤ 0: His-tag and TEV site)" } },
    yaxis: { visible: false, autorange: "reversed" },
    margin: { l: 12, r: 12, t: 8, b: 84 },
    shapes: sel ? [{ type: "rect", xref: "x", yref: "paper", x0: resNo(sel.start) - 0.5, x1: resNo(sel.end) + 0.5, y0: 0, y1: 1, fillcolor: "rgba(102,59,228,0.12)", line: { width: 0 } }] : [],
  }), [sel, resNo]);
  return (
    <Card title={`Peptide map, colored by ${comp.a} vs ${comp.b} class (L1a)`} prov="plot:peptide_map"
      caption={`${peps.length} peptides in ${comp.a} or ${comp.b}. Click a peptide to show its uptake curves and select it in 3D.`}>
      <Plot data={data} layout={layout} height={340} onClick={(e) => {
        const id = e.points[0]?.customdata;
        if (typeof id === "string") onSelect(id);
      }} />
    </Card>
  );
}

function UptakePlot({ view, comp, pep, corrected, setCorrected }: {
  view: PeptideView; comp: Comparison; pep: Peptide | null; corrected: boolean; setCorrected: (v: boolean) => void;
}) {
  const data = useMemo<Partial<Plotly.Data>[]>(() => {
    if (!pep) return [];
    const out: Partial<Plotly.Data>[] = [];
    for (const s of [comp.a, comp.b]) {
      const rows = (view.uptake[s]?.[pep.id] ?? []).filter((r) => r[0] !== "t0" && r[0] !== "fd");
      const y = (r: (typeof rows)[number]) => (corrected ? r[4] : r[3]);
      const pts = rows.filter((r) => y(r) != null && r[2]);
      out.push({ type: "scatter", mode: "markers", name: `${s} replicates`, x: pts.map((r) => r[2]), y: pts.map(y),
        marker: { color: STATE_COLOR[s], size: 6, opacity: 0.6 }, text: pts.map((r) => `rep ${r[1]}`),
        hovertemplate: "%{x:.0f} s<br>%{y:.2f}<extra>" + s + " %{text}</extra>" });
      const byBin = new Map<string, number[]>();
      const tOf = new Map<string, number[]>();
      for (const r of pts) {
        byBin.set(r[0], [...(byBin.get(r[0]) ?? []), y(r)!]);
        tOf.set(r[0], [...(tOf.get(r[0]) ?? []), r[2]!]);
      }
      const order = [...byBin.keys()].sort((a, b) => Math.min(...tOf.get(a)!) - Math.min(...tOf.get(b)!));
      out.push({ type: "scatter", mode: "lines", name: `${s} mean`, x: order.map((b) => Math.min(...tOf.get(b)!)), y: order.map((b) => byBin.get(b)!.reduce((x, v) => x + v, 0) / byBin.get(b)!.length),
        line: { color: STATE_COLOR[s], width: 2 }, hoverinfo: "skip" });
      if (!corrected && view.fd[s]?.[pep.id] != null) {
        out.push({ type: "scatter", mode: "lines", name: `${s} fully deuterated`, x: [10, 1e5], y: [view.fd[s][pep.id], view.fd[s][pep.id]],
          line: { color: STATE_COLOR[s], width: 1, dash: "dot" }, hoverinfo: "skip" });
      }
    }
    return out;
  }, [view, comp, pep, corrected]);
  const layout = useMemo<Partial<Plotly.Layout>>(() => ({
    xaxis: { type: "log", title: { text: "labeling time" }, tickvals: [10, 100, 1e3, 1e4, 1e5], ticktext: ["10 s", "100 s", "17 min", "2.8 h", "1.2 d"] },
    yaxis: { title: { text: corrected ? "deuterons (FD-normalized)" : "uptake (Da, uncorrected)" }, rangemode: "tozero",
      ...(corrected && pep ? { range: [0, pep.n_ex * 1.1] } : {}) },
    margin: { l: 52, r: 12, t: 8, b: 96 },
    legend: { orientation: "h", y: -0.32, x: 0, font: { size: 10.5 } },
  }), [corrected, pep]);
  return (
    <Card title={pep ? `Uptake: ${pep.seq} (L1b${corrected ? ", L1d corrected" : ""})` : "Uptake curves (L1b, L1d)"} prov="plot:uptake"
      caption={pep
        ? `${pep.n_ex} exchangeable amides. ${corrected ? "Corrected: D / D_FD × N_ex, from the same state's fully deuterated control; points without a control are omitted." : "Uncorrected centroid uptake, charge states merged; dotted lines are fully deuterated controls."} The corrected values never replace the uncorrected ones; both come from recorded runs.`
        : "Select a peptide in the peptide map, Woods plot, volcano plot or ΔD chiclet."}>
      <label className="flex items-center gap-2 text-[11.5px] text-ink-secondary">
        <input type="checkbox" checked={corrected} onChange={(e) => setCorrected(e.target.checked)} />
        Back-exchange corrected (L1d run r_correct; uncheck to undo)
      </label>
      {pep ? <Plot data={data} layout={layout} height={320} /> : <div className="grid h-[320px] place-items-center text-[12px] text-ink-muted">No peptide selected</div>}
    </Card>
  );
}

function WoodsPlot({ view, comp, binId, setBinId, bins, onSelect, resNo }: {
  view: PeptideView; comp: Comparison; binId: string; setBinId: (b: string) => void; bins: PeptideView["time_bins"]; onSelect: (id: string) => void; resNo: (p: number) => number;
}) {
  const data = useMemo<Partial<Plotly.Data>[]>(() => {
    const segs: { p: Peptide; d: number; sig: boolean }[] = [];
    for (const p of view.peptides) {
      const r = comp.results[p.id];
      if (!r) continue;
      const pick = binId === "max" ? r.reduce((a, b) => (Math.abs(b[1]) > Math.abs(a[1]) ? b : a)) : r.find((x) => x[0] === binId);
      if (pick) segs.push({ p, d: pick[1], sig: pick[3] });
    }
    return [true, false].map((sig) => {
      const ss = segs.filter((s) => s.sig === sig);
      return {
        type: "scatter", mode: "lines", name: sig ? "passes hybrid test" : "does not pass",
        x: ss.flatMap((s) => [resNo(s.p.start), resNo(s.p.end), null]), y: ss.flatMap((s) => [s.d, s.d, null]),
        line: { color: sig ? "#2166ac" : "#b8bdc7", width: sig ? 3 : 2 },
        customdata: ss.flatMap((s) => [s.p.id, s.p.id, null]), text: ss.flatMap((s) => [s.p.seq, s.p.seq, ""]),
        hovertemplate: "%{text}<br>ΔD %{y:.2f} Da<extra></extra>",
      } as Partial<Plotly.Data>;
    });
  }, [view, comp, binId, resNo]);
  const lim = comp.limit_da ?? 0;
  const layout = useMemo<Partial<Plotly.Layout>>(() => ({
    xaxis: { title: { text: "ecDHFR residue" } },
    yaxis: { title: { text: `ΔD, ${comp.b} − ${comp.a} (Da)` }, zeroline: true },
    shapes: [-lim, lim].map((y) => ({ type: "line", xref: "paper", x0: 0, x1: 1, y0: y, y1: y, line: { color: "#663be4", width: 1, dash: "dash" } })),
    margin: { l: 52, r: 12, t: 8, b: 84 },
  }), [comp, lim]);
  return (
    <Card title={`Woods plot, ${comp.a} vs ${comp.b} (L2)`} prov="plot:woods"
      caption={`Each segment is one peptide at ${binId === "max" ? "the time with the largest |ΔD|" : "the chosen time"}. Dashed lines: global limit ±${fmt(lim)} Da (α = ${comp.alpha}, ${comp.n} paired replicates). Significant points also need Welch p < α.`}>
      <select value={binId} onChange={(e) => setBinId(e.target.value)} className="w-56 rounded border border-line-strong bg-white px-2 py-0.5 text-[11.5px]">
        <option value="max">time with largest |ΔD|</option>
        {bins.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
      </select>
      <Plot data={data} layout={layout} height={300} onClick={(e) => {
        const id = e.points[0]?.customdata;
        if (typeof id === "string") onSelect(id);
      }} />
    </Card>
  );
}

function VolcanoPlot({ view, comp, onSelect }: { view: PeptideView; comp: Comparison; onSelect: (id: string) => void }) {
  const binLabel = useMemo(() => new Map(view.time_bins.map((b) => [b.id, b.label])), [view]);
  const pep = useMemo(() => new Map(view.peptides.map((p) => [p.id, p])), [view]);
  const data = useMemo<Partial<Plotly.Data>[]>(() => {
    const pts = Object.entries(comp.results).flatMap(([pid, rs]) => rs.filter((r) => r[2] != null && r[2] > 0).map((r) => ({ pid, r })));
    return [true, false].map((sig) => {
      const ps = pts.filter((x) => x.r[3] === sig);
      return {
        type: "scattergl", mode: "markers", name: sig ? "passes hybrid test" : "does not pass",
        x: ps.map((x) => x.r[1]), y: ps.map((x) => -Math.log10(x.r[2]!)),
        marker: { color: sig ? "#2166ac" : "#b8bdc7", size: 5, opacity: 0.75 },
        customdata: ps.map((x) => x.pid), text: ps.map((x) => `${pep.get(x.pid)?.seq} · ${binLabel.get(x.r[0])}`),
        hovertemplate: "%{text}<br>ΔD %{x:.2f} Da<br>−log10 p %{y:.1f}<extra></extra>",
      } as Partial<Plotly.Data>;
    });
  }, [comp, pep, binLabel]);
  const lim = comp.limit_da ?? 0;
  const layout = useMemo<Partial<Plotly.Layout>>(() => ({
    xaxis: { title: { text: `ΔD, ${comp.b} − ${comp.a} (Da)` } },
    yaxis: { title: { text: "−log10 p (Welch)" } },
    shapes: [
      ...[-lim, lim].map((x) => ({ type: "line" as const, xref: "x" as const, yref: "paper" as const, x0: x, x1: x, y0: 0, y1: 1, line: { color: "#663be4", width: 1, dash: "dash" as const } })),
      { type: "line", xref: "paper", yref: "y", x0: 0, x1: 1, y0: -Math.log10(comp.alpha), y1: -Math.log10(comp.alpha), line: { color: "#663be4", width: 1, dash: "dash" } },
    ],
    margin: { l: 52, r: 12, t: 8, b: 84 },
  }), [comp, lim]);
  return (
    <Card title={`Volcano plot, ${comp.a} vs ${comp.b} (L2)`} prov="plot:volcano"
      caption="One point per peptide and time. Points pass when they lie outside both dashed limits: |ΔD| above the global limit and p below α.">
      <Plot data={data} layout={layout} height={300} onClick={(e) => {
        const id = e.points[0]?.customdata;
        if (typeof id === "string") onSelect(id);
      }} />
    </Card>
  );
}

function DeltaChiclet({ view, comp, bins, onSelect }: { view: PeptideView; comp: Comparison; bins: PeptideView["time_bins"]; onSelect: (id: string) => void }) {
  const peps = useMemo(() => view.peptides.filter((p) => comp.results[p.id]).sort((a, b) => a.start - b.start || a.end - b.end), [view, comp]);
  const lim = Math.max(0.5, ...Object.values(comp.results).flat().map((r) => Math.abs(r[1])));
  const data = useMemo<Partial<Plotly.Data>[]>(() => [{
    type: "heatmap", x: bins.map((b) => b.label), y: peps.map((p) => p.id),
    z: peps.map((p) => bins.map((b) => comp.results[p.id].find((r) => r[0] === b.id)?.[1] ?? null)),
    customdata: peps.map((p) => bins.map(() => p.id)) as unknown as Plotly.Datum[][],
    text: peps.map((p) => bins.map((b) => {
      const r = comp.results[p.id].find((x) => x[0] === b.id);
      return `${p.seq}${r?.[3] ? " · passes" : ""}`;
    })) as unknown as string[],
    zmin: -lim, zmax: lim, colorscale: [[0, "#2166ac"], [0.5, "#f7f7f7"], [1, "#b2182b"]],
    colorbar: { title: "ΔD (Da)", titleside: "right", thickness: 10 }, xgap: 1, ygap: 0,
    hovertemplate: "%{text}<br>%{x}<br>ΔD %{z:.2f} Da<extra></extra>",
  }], [peps, bins, comp, lim]);
  const layout = useMemo<Partial<Plotly.Layout>>(() => ({
    xaxis: { title: { text: "labeling time" }, type: "category" }, yaxis: { visible: false, autorange: "reversed" },
    margin: { l: 12, r: 12, t: 8, b: 60 },
  }), []);
  return (
    <Card title={`ΔD per peptide and time, ${comp.a} vs ${comp.b} (L2)`} prov="plot:chiclet"
      caption={`${peps.length} tested peptides, ordered by start residue. Blank cells were not tested (fewer than 2 paired replicates).`}>
      <Plot data={data} layout={layout} height={340} onClick={(e) => {
        const id = e.points[0]?.customdata;
        if (typeof id === "string") onSelect(id);
      }} />
    </Card>
  );
}

function ReproPlot({ view }: { view: PeptideView }) {
  const data = useMemo<Partial<Plotly.Data>[]>(() => view.states.map((s) => {
    const sds: number[] = [];
    for (const rows of Object.values(view.uptake[s.id] ?? {})) {
      const byBin = new Map<string, number[]>();
      for (const r of rows) if (r[0] !== "t0" && r[0] !== "fd") byBin.set(r[0], [...(byBin.get(r[0]) ?? []), r[3]]);
      for (const v of byBin.values()) {
        if (v.length < 2) continue;
        const m = v.reduce((a, b) => a + b, 0) / v.length;
        sds.push(Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)));
      }
    }
    return { type: "histogram", name: `${s.id} (median ${fmt(view.reproducibility[s.id].median_sd_da)} Da)`, x: sds, opacity: 0.55,
      marker: { color: STATE_COLOR[s.id] }, xbins: { start: 0, end: 1, size: 0.02 } } as Partial<Plotly.Data>;
  }), [view]);
  const layout = useMemo<Partial<Plotly.Layout>>(() => ({
    barmode: "overlay", xaxis: { title: { text: "replicate SD per peptide and time (Da)" }, range: [0, 0.8] },
    yaxis: { title: { text: "count" } }, margin: { l: 52, r: 12, t: 8, b: 84 },
  }), []);
  return (
    <Card title="Technical reproducibility (L1)" prov="plot:repro"
      caption={`Replicates per state: ${view.states.map((s) => `${s.id} ${s.replicates.join(",")}`).join("; ")}. Computed from uncorrected uptake with charge states merged.`}>
      <Plot data={data} layout={layout} height={300} />
    </Card>
  );
}

function IdentificationPanel({ view, pep }: { view: PeptideView; pep: Peptide | null }) {
  return (
    <section className="grid gap-3 rounded-lg border border-line bg-white p-3 text-[12px] lg:grid-cols-2">
      <div className="flex flex-col gap-1">
        <h3 className="text-[13px] font-semibold text-ink">Peptide identification (L1a)</h3>
        <p className="leading-relaxed text-ink-secondary">{view.identification_protocol}</p>
        <SourceLine id="plot:peptide_map" />
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-[13px] font-semibold text-ink">{pep ? `Selected peptide ${pep.seq}` : "Selected peptide"}</h3>
        {pep ? (
          <dl className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-2 gap-y-1">
            <dt className="text-ink-muted">Residues (ecDHFR)</dt><dd>{pep.start - 15}–{pep.end - 15} (construct {pep.start}–{pep.end})</dd>
            <dt className="text-ink-muted">Exchangeable amides</dt><dd>{pep.n_ex}</dd>
            <dt className="text-ink-muted">Charge states merged</dt><dd>{pep.charges.join(", ")}</dd>
            <dt className="text-ink-muted">Match confidence (max)</dt><dd>{pep.conf}</dd>
            <dt className="text-ink-muted">Retention time</dt><dd>{pep.rt_min} min</dd>
            <dt className="text-ink-muted">Seen in states</dt><dd>{pep.states.join(", ")}</dd>
            <dt className="text-ink-muted">FD control</dt><dd>{view.states.map((s) => `${s.id}: ${view.fd[s.id]?.[pep.id] != null ? fmt(view.fd[s.id][pep.id]) + " Da" : "none"}`).join(" · ")}</dd>
          </dl>
        ) : <p className="text-ink-muted">Select a peptide in any plot.</p>}
        <p className="mt-1 text-[11px] text-ink-muted">Timepoints were grouped within {String((view.parameters.time_bins as { relative_tolerance: number }).relative_tolerance * 100)}% because actual times came from instrument logs ({view.time_bins.length - 2} groups, e.g. {fmtTime(view.time_bins[1].t_s ?? 0)}).</p>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-muted">{label}</span>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] leading-snug text-ink-muted">{children}</p>;
}
