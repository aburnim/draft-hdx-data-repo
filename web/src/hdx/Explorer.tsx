import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import MolstarViewer from "../vendor/hetstar/MolstarViewer";
import type { ResidueRef } from "../vendor/hetstar/keys";
import { makeMetricLane } from "../vendor/hetstar/lanes/PlotLanes";
import SequenceLanes, { type ResidueRange } from "../vendor/hetstar/lanes/SequenceLanes";
import type { LaneMetric } from "../vendor/hetstar/lanes/types";
import { residueLoci } from "../vendor/hetstar/molstar/queries";
import type { ExampleRepresentation, StructureView } from "../vendor/hetstar/molstar/style";
import type { MolstarViewer as Viewer } from "../vendor/hetstar/molstar/viewer";
import { sequenceModelFromJSON } from "../vendor/hetstar/sequence";
import { trackFromJSON } from "../vendor/hetstar/tracks";
import { DEUTERATION_RAMP, FADED_COLOR, MISSING_COLOR, SERIES, STABILITY_RAMP } from "./colors";
import { fmt, fmtTime, useText } from "./data";
import { constructLane, type ConstructSpan } from "./lanes";
import {
  colorTable, deuterationMetric, entryMetrics, MODE_LABELS, nmrConditions, rampGradient, shortLabel, type ColorMode,
} from "./model";
import { ButterflyPlot, ChicletPlot, IsotopePlot, LandscapePlot, TagEffectPlot, UptakePlot, type PlotLinks } from "./plots";
import type { Entry } from "./types";
import { setResidueColors } from "./value-theme";

// The linked explorer: one hover, one selection, one time cursor and one ΔG threshold,
// shared by the 3D structure, the sequence lanes and the plots.

const REPRESENTATIONS: ExampleRepresentation[] = ["cartoon", "putty", "ball-and-stick", "spacefill"];
const T_MIN = 1; // log10 seconds
const T_MAX = 6.5;

export default function Explorer({ entry }: { entry: Entry }) {
  const em = useMemo(() => entryMetrics(entry), [entry]);
  const nmr = useMemo(() => nmrConditions(entry), [entry]);
  const seqModel = useMemo(() => sequenceModelFromJSON(entry.chain), [entry]);
  const chainId = entry.chain.id;

  const [mode, setMode] = useState<ColorMode>("dg");
  const [cid, setCid] = useState(() => (nmr.find((c) => c.replicate === "mean") ?? nmr[0])?.id ?? "");
  const [threshold, setThreshold] = useState<number | null>(null);
  const [logT, setLogT] = useState(3);
  const timeS = 10 ** logT;
  const [rep, setRep] = useState<ExampleRepresentation>("cartoon");
  const [modelIndex, setModelIndex] = useState(0);
  const [modelCount, setModelCount] = useState(1);
  const [hover, setHover] = useState<{ ref: ResidueRef | null; from: "3d" | "ui" }>({ ref: null, from: "ui" });
  const [selection, setSelection] = useState<ResidueRange[]>([]);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [loaded, setLoaded] = useState(0);

  const cif = useText(entry.external_refs.pdb ? `structures/${entry.external_refs.pdb}.cif` : null);

  // kobs is per replicate; a mean condition borrows its construct's first replicate
  const kobsKey = useMemo(() => {
    if (entry.tracks[`kobs:${cid}`]) return `kobs:${cid}`;
    const c = nmr.find((x) => x.id === cid);
    const sib = nmr.find((x) => x.construct === c?.construct && entry.tracks[`kobs:${x.id}`]);
    return sib ? `kobs:${sib.id}` : null;
  }, [entry, nmr, cid]);
  const kobsTrack = useMemo(() => (kobsKey ? trackFromJSON(entry.tracks[kobsKey]) : null), [entry, kobsKey]);
  const deut = useMemo(() => (kobsTrack ? deuterationMetric(kobsTrack, timeS) : null), [kobsTrack, timeS]);

  const current: LaneMetric | null = useMemo(() => {
    if (mode === "dg") return em.byKey.get(`dg:${cid}`) ?? null;
    if (mode === "logpf") return em.byKey.get(`logpf:${cid}`) ?? (kobsKey ? em.byKey.get(kobsKey.replace("kobs:", "logpf:")) ?? null : null);
    if (mode === "deut") return deut;
    return null;
  }, [mode, cid, em, deut, kobsKey]);

  // --- lanes ---
  const metrics = useMemo(() => {
    const m = new Map<string, LaneMetric | string>(em.byKey);
    m.set("deut", deut ?? "no exchange rates for this condition");
    return m;
  }, [em, deut]);
  const metricLanes = useMemo(() => {
    const defaults = new Set(["dg:nmr_6xhis_mean", "dg:nmr_nohis_r1"]);
    return [
      makeMetricLane("deut", "D at time t", "fraction deuterated at the time cursor, from per-residue NMR exchange rates", true),
      ...[...em.byKey.values()].map((m) => makeMetricLane(m.id, m.name, `${m.name} (${m.unit ?? "unitless"})`, defaults.has(m.id))),
    ];
  }, [em]);
  const extraLanes = useMemo(() => {
    const last = entry.chain.positions[entry.chain.positions.length - 1].seq;
    const spans: ConstructSpan[] = [];
    const seen = new Set<string>();
    for (const c of nmr) {
      const t = entry.tracks[`dg:${c.id}`];
      if (!t || !c.construct || seen.has(c.construct)) continue;
      seen.add(c.construct);
      spans.push({ id: c.construct, label: `NMR ${c.construct}`, color: SERIES[c.id] ?? "#999", from: t.keys[0].seq, to: t.keys[t.keys.length - 1].seq });
    }
    for (const m of entry.mhdx) {
      if (m.first_auth_seq != null) spans.push({ id: m.id, label: "mHDX-MS", color: SERIES.mhdx, from: m.first_auth_seq, to: last });
    }
    return [constructLane(spans)];
  }, [entry, nmr]);

  // --- 3D: colors ---
  const view = useMemo<StructureView>(() => ({ representation: rep, colorTheme: mode === "sse" ? "secondary-structure" : "hdx-value" }), [rep, mode]);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (mode === "sse") return;
    setResidueColors(current ? colorTable(current, mode === "dg" ? threshold : null) : new Map());
    if (!viewer || !loaded) return;
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      raf.current = null;
      viewer.recolor();
    });
  }, [current, threshold, mode, viewer, loaded]);

  const onLoaded = useCallback(({ modelCount }: { modelCount: number }) => {
    setModelCount(modelCount);
    setModelIndex(0);
    setLoaded((n) => n + 1);
  }, []);

  useEffect(() => {
    if (viewer && loaded) viewer.setModelIndex(modelIndex);
  }, [viewer, loaded, modelIndex]);

  // --- 3D: hover and click in, highlight and selection out ---
  useEffect(() => {
    if (!viewer) return;
    let frame: number | null = null;
    const offHover = viewer.subscribeToHover((info) => {
      if (frame != null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        setHover({ ref: info ? { chain: info.chainId, seq: info.authSeqId, ins: info.insCode } : null, from: "3d" });
      });
    });
    const offClick = viewer.subscribeToClick((info) => {
      setSelection(info ? [{ chain: info.chainId, from: info.authSeqId, to: info.authSeqId }] : []);
    });
    return () => {
      offHover();
      offClick();
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, [viewer]);

  useEffect(() => {
    if (!viewer || hover.from === "3d") return;
    const structure = viewer.getCurrentStructure();
    if (!structure) return;
    viewer.highlightLoci(hover.ref ? residueLoci(structure, hover.ref.chain, hover.ref.seq) : null);
  }, [viewer, hover, loaded]);

  useEffect(() => {
    if (!viewer) return;
    const structure = viewer.getCurrentStructure();
    const last = selection[selection.length - 1];
    if (!structure || !last) {
      viewer.clearSelection();
      return;
    }
    const loci = residueLoci(structure, last.chain, last.from, last.to);
    if (!loci) return;
    viewer.setSelection(loci);
    viewer.focusLoci(loci);
  }, [viewer, selection, loaded]);

  const onLaneHover = useCallback((ref: ResidueRef | null) => setHover({ ref, from: "ui" }), []);
  const onLaneSelect = useCallback((range: ResidueRange, opts?: { additive?: boolean; toggle?: boolean }) => {
    setSelection((prev) => {
      const last = prev[prev.length - 1];
      if (opts?.toggle && last && last.from === range.from && last.to === range.to) return [];
      return opts?.additive ? [...prev, range] : [range];
    });
  }, []);

  const links: PlotLinks = {
    hoverSeq: hover.ref?.seq ?? null,
    setHoverSeq: (seq) => setHover({ ref: seq == null ? null : { chain: chainId, seq, ins: "" }, from: "ui" }),
    threshold: mode === "dg" ? threshold : null,
    timeS,
    setTimeS: (t) => {
      setLogT(Math.min(T_MAX, Math.max(T_MIN, Math.log10(t))));
      setMode("deut");
    },
  };

  // --- threshold summary: residues above X, and how many mHDX sites are ---
  const dgMetric = em.byKey.get(`dg:${cid}`);
  const above = useMemo(() => {
    if (threshold == null || !dgMetric) return null;
    const vals = Array.from(dgMetric.track.values).filter((v) => !Number.isNaN(v));
    const mh = entry.mhdx[0]?.dg_sorted.filter((v): v is number => v != null) ?? [];
    return { n: vals.filter((v) => v >= threshold).length, of: vals.length, mn: mh.filter((v) => v >= threshold).length, mof: mh.length };
  }, [threshold, dgMetric, entry]);

  const legend = mode === "sse" ? null : mode === "deut" ? (
    { gradient: rampGradient(DEUTERATION_RAMP), lo: "0 (protected)", hi: "1 (exchanged)" }
  ) : current ? (
    { gradient: rampGradient(STABILITY_RAMP), lo: fmt(current.domain[0], 1), hi: `${fmt(current.domain[1], 1)} ${current.unit ?? ""}` }
  ) : null;

  const conditionChoices = mode === "deut" || mode === "logpf" ? nmr.filter((c) => c.replicate !== "mean") : nmr;
  useEffect(() => {
    if (!conditionChoices.some((c) => c.id === cid) && conditionChoices[0]) setCid(conditionChoices[0].id);
  }, [conditionChoices, cid]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="relative h-[380px] overflow-hidden rounded-lg border border-line bg-white sm:h-[460px] lg:col-span-7">
          <MolstarViewer data={cif} binary={false} view={view} onReady={setViewer} onLoaded={onLoaded} />
          {!cif && <div className="absolute inset-0 grid place-items-center text-xs text-ink-muted">Loading {entry.external_refs.pdb}…</div>}
          <div className="pointer-events-none absolute left-2 top-2 rounded bg-white/85 px-2 py-1 font-mono text-[10.5px] text-ink-secondary">
            {entry.external_refs.pdb} · model {modelIndex + 1}/{modelCount}
            {hover.ref && <> · {hover.ref.chain}/{hover.ref.seq}</>}
          </div>
        </div>

        <aside className="flex flex-col gap-3 rounded-lg border border-line bg-white p-3 text-[12px] lg:col-span-5">
          <Field label="Color structure by">
            <div className="grid grid-cols-2 gap-1">
              {(Object.keys(MODE_LABELS) as ColorMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded border px-2 py-1 text-left text-[11.5px] ${mode === m ? "border-accent bg-accent-soft text-accent" : "border-line-strong text-ink-secondary hover:bg-surface-muted"}`}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
          </Field>

          {mode !== "sse" && (
            <Field label="HDX-NMR condition">
              <select value={cid} onChange={(e) => setCid(e.target.value)} className="w-full rounded border border-line-strong bg-white px-2 py-1 focus:border-accent focus:outline-none">
                {conditionChoices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} · pH {c.pH} · {c.temp_K} K · {c.buffer}
                  </option>
                ))}
              </select>
              {mode === "deut" && kobsKey && kobsKey !== `kobs:${cid}` && <Hint>Rates from {kobsKey.split(":")[1]}: the mean has no rates of its own.</Hint>}
            </Field>
          )}

          {mode === "dg" && (
            <Field label={threshold == null ? "Highlight the most stable sites" : `Show sites with ΔG ≥ ${threshold.toFixed(1)} kcal/mol`}>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={threshold != null} onChange={(e) => setThreshold(e.target.checked ? (em.dgDomain[0] + em.dgDomain[1]) / 2 : null)} />
                <input
                  type="range" min={em.dgDomain[0]} max={em.dgDomain[1]} step={0.1} value={threshold ?? em.dgDomain[0]} disabled={threshold == null}
                  onChange={(e) => setThreshold(Number(e.target.value))} className="w-full accent-[#663be4]"
                />
              </div>
              {above && (
                <Hint>
                  {above.n} of {above.of} measured residues stay colored. In the mHDX-MS landscape, {above.mn} of {above.mof} sites are this stable, with no residue assignment.
                </Hint>
              )}
            </Field>
          )}

          {mode === "deut" && (
            <Field label={`Labeling time t = ${fmtTime(timeS)}`}>
              <input type="range" min={T_MIN} max={T_MAX} step={0.05} value={logT} onChange={(e) => setLogT(Number(e.target.value))} className="w-full accent-[#663be4]" />
              <Hint>Predicted from each residue&apos;s NMR exchange rate: D = 1 − e^(−k·t). The same cursor is drawn on the uptake plot.</Hint>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Representation">
              <select value={rep} onChange={(e) => setRep(e.target.value as ExampleRepresentation)} className="w-full rounded border border-line-strong bg-white px-2 py-1">
                {REPRESENTATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label={`NMR model ${modelIndex + 1} of ${modelCount}`}>
              <input type="range" min={0} max={Math.max(0, modelCount - 1)} value={modelIndex} disabled={modelCount < 2}
                onChange={(e) => setModelIndex(Number(e.target.value))} className="w-full accent-[#663be4]" />
            </Field>
          </div>

          {legend && (
            <div className="flex flex-col gap-1">
              <div className="h-2.5 rounded" style={{ background: legend.gradient }} />
              <div className="flex justify-between font-mono text-[10px] text-ink-muted"><span>{legend.lo}</span><span>{legend.hi}</span></div>
              <div className="flex flex-wrap gap-3 text-[10.5px] text-ink-muted">
                <Swatch color={MISSING_COLOR} label="no value (not measured)" />
                {mode === "dg" && threshold != null && <Swatch color={FADED_COLOR} label="measured, below threshold" />}
              </div>
            </div>
          )}
          <Hint>Hover or click residues in 3D, the lanes, or any residue plot: all of them follow.</Hint>
        </aside>
      </div>

      <div className="rounded-lg border border-line bg-white p-3">
        <SequenceLanes
          model={seqModel}
          secondary={entry.chain.secondary ?? null}
          metrics={metrics}
          metricLanes={metricLanes}
          extraLanes={extraLanes}
          colorBy={current}
          hoverRef={hover.ref}
          selection={selection}
          onHover={onLaneHover}
          onSelect={onLaneSelect}
          leading={<span className="text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">Sequence lanes</span>}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <LandscapePlot entry={entry} links={links} />
        {entry.mhdx[0] && <UptakePlot m={entry.mhdx[0]} links={links} />}
        <ChicletPlot entry={entry} em={em} links={links} />
        {entry.mhdx[0] && <IsotopePlot m={entry.mhdx[0]} links={links} />}
        <ButterflyPlot entry={entry} links={links} />
        <TagEffectPlot entry={entry} links={links} />
      </div>
      <p className="text-[11px] text-ink-muted">
        Conditions shown: {entry.conditions.map(shortLabel).join(", ")}.
      </p>
    </div>
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

function Swatch({ color, label }: { color: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-2.5 w-2.5 rounded-sm border border-line-strong" style={{ background: `#${color.toString(16).padStart(6, "0")}` }} />
      {label}
    </span>
  );
}
