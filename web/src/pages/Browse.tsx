import { useMemo, useState } from "react";
import type Plotly from "plotly.js";

import { fmt, useJSON } from "../hdx/data";
import Plot from "../hdx/Plot";
import type { Index, IndexRow } from "../hdx/types";

// The database-wide view: every mHDX-MS measurement in the release, filterable by the
// same quality fields a researcher would threshold on. Thresholds start wide open; the
// page never decides for the reader what counts as good data.

const ORIGIN_COLORS: Record<string, string> = {
  "de novo design": "#663be4",
  "design variant": "#c2a5f5",
  "natural domain": "#1b7837",
  "PDB-derived domain": "#e08214",
};
const PAGE = 50;

type SortKey = keyof Pick<IndexRow, "name" | "topology" | "length" | "dg_max" | "dg_median" | "coop" | "rmse" | "idotp" | "backex">;

const COLUMNS: { key: SortKey; label: string; hint: string; digits?: number }[] = [
  { key: "name", label: "Protein", hint: "Design or UniProt domain name" },
  { key: "topology", label: "Family", hint: "Topology or Pfam-like family label from the release" },
  { key: "length", label: "Len", hint: "Residues in the measured construct", digits: 0 },
  { key: "dg_max", label: "ΔG max", hint: "Most stable site, kcal/mol", digits: 2 },
  { key: "dg_median", label: "ΔG med", hint: "Median site, kcal/mol", digits: 2 },
  { key: "coop", label: "Coop.", hint: "Normalized global cooperativity", digits: 2 },
  { key: "rmse", label: "Fit RMSE", hint: "Isotope-distribution fit error", digits: 3 },
  { key: "idotp", label: "idotp", hint: "Isotope-pattern match (1 = perfect)", digits: 3 },
  { key: "backex", label: "Back-ex.", hint: "Back-exchange at the final timepoint", digits: 2 },
];

export default function Browse() {
  const { data, error } = useJSON<Index>("index.json");
  const rows = data?.rows ?? [];
  const [q, setQ] = useState("");
  const [origin, setOrigin] = useState("all");
  const [family, setFamily] = useState("all");
  const [onlyNmr, setOnlyNmr] = useState(false);
  const [maxRmse, setMaxRmse] = useState(0.22);
  const [minIdotp, setMinIdotp] = useState(0.99);
  const [maxBackex, setMaxBackex] = useState(0.45);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "dg_max", dir: -1 });
  const [page, setPage] = useState(0);

  const families = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) if (r.topology) counts.set(r.topology, (counts.get(r.topology) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter(
      (r) =>
        (!needle || r.name.toLowerCase().includes(needle)) &&
        (origin === "all" || r.origin === origin) &&
        (family === "all" || r.topology === family) &&
        (!onlyNmr || r.nmr) &&
        (r.rmse == null || r.rmse <= maxRmse) &&
        (r.idotp == null || r.idotp >= minIdotp) &&
        (r.backex == null || r.backex <= maxBackex),
    );
    const { key, dir } = sort;
    out.sort((a, b) => {
      const x = a[key];
      const y = b[key];
      // absent values sort last in both directions
      if (x == null) return 1;
      if (y == null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
    return out;
  }, [rows, q, origin, family, onlyNmr, maxRmse, minIdotp, maxBackex, sort]);

  const scatter = useMemo<Partial<Plotly.Data>[]>(() => {
    const groups = new Map<string, IndexRow[]>();
    for (const r of filtered) groups.set(r.origin, [...(groups.get(r.origin) ?? []), r]);
    const traces: Partial<Plotly.Data>[] = [...groups.entries()].map(([o, rs]) => ({
      type: "scattergl", mode: "markers", name: o, x: rs.map((r) => r.dg_max), y: rs.map((r) => r.coop),
      text: rs.map((r) => r.name), customdata: rs.map((r) => (r.page ? r.id : "")),
      marker: { color: ORIGIN_COLORS[o], size: 5, opacity: 0.55 },
      hovertemplate: "%{text}<br>ΔG max %{x:.2f}<br>coop. %{y:.2f}<extra></extra>",
    }));
    const nmr = filtered.filter((r) => r.nmr);
    traces.push({
      type: "scatter", mode: "markers", name: "has HDX-NMR", x: nmr.map((r) => r.dg_max), y: nmr.map((r) => r.coop),
      text: nmr.map((r) => r.name + (r.page ? " (entry page)" : "")), customdata: nmr.map((r) => (r.page ? r.id : "")),
      marker: { color: "rgba(0,0,0,0)", size: 11, line: { color: "#1a1e2a", width: 1.5 } },
      hovertemplate: "%{text}<extra>HDX-NMR</extra>",
    });
    return traces;
  }, [filtered]);

  const counts = useMemo(() => ({
    designs: rows.filter((r) => r.origin !== "natural domain").length,
    natural: rows.filter((r) => r.origin === "natural domain" || r.origin === "PDB-derived domain").length,
    nmr: rows.filter((r) => r.nmr).length,
    pages: rows.filter((r) => r.page),
  }), [rows]);

  if (error) return <p className="text-danger">Could not load the index: {error}</p>;

  const shown = filtered.slice(page * PAGE, (page + 1) * PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h1 className="text-[26px] font-semibold tracking-tight text-ink">Protein energy landscapes by HDX</h1>
        <p className="max-w-3xl text-[14px] leading-relaxed text-ink-secondary">
          Every protein domain measured by multiplexed hydrogen-deuterium exchange mass spectrometry (mHDX-MS) in
          Ferrari et al. (Nature, 2026). Raw spectra stay in PRIDE{" "}
          <a className="text-accent underline" href="https://www.ebi.ac.uk/pride/archive/projects/PXD061702" target="_blank" rel="noreferrer">PXD061702</a>;
          this prototype adds a protein-rooted view of the analysis on top, with provenance back to the source files.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat n={rows.length} label="measured domains" />
          <Stat n={counts.designs} label="designs and variants" />
          <Stat n={counts.natural} label="natural and PDB-derived" />
          <Stat n={counts.nmr} label="with HDX-NMR too" />
          <Stat n={counts.pages.length} label="full entry pages" />
        </div>
        {counts.pages.map((r) => (
          <a key={r.id} href={`#/entry/${r.id}`} className="group flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent/30 bg-accent-soft px-4 py-3 hover:border-accent">
            <span className="text-[13px] text-ink">
              <span className="mr-2 rounded bg-accent px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-white">Entry</span>
              <b>{r.name}</b>: mHDX-MS, HDX-NMR in 4 conditions, and NMR structure {r.pdb}, linked residue by residue
            </span>
            <span className="text-[12px] font-medium text-accent group-hover:underline">Open the explorer →</span>
          </a>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-12">
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-white p-3 text-[12px] lg:col-span-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Filter</h2>
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search names, e.g. EEHEE_rd4 or A0A1M4" className="rounded border border-line-strong px-2 py-1.5 focus:border-accent focus:outline-none" />
          <div className="grid grid-cols-2 gap-2">
            <select value={origin} onChange={(e) => { setOrigin(e.target.value); setPage(0); }} className="rounded border border-line-strong bg-white px-2 py-1">
              <option value="all">All origins</option>
              {Object.keys(ORIGIN_COLORS).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <select value={family} onChange={(e) => { setFamily(e.target.value); setPage(0); }} className="rounded border border-line-strong bg-white px-2 py-1">
              <option value="all">All families</option>
              {families.map(([f, n]) => <option key={f} value={f}>{f} ({n})</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={onlyNmr} onChange={(e) => { setOnlyNmr(e.target.checked); setPage(0); }} /> Only proteins with HDX-NMR</label>
          <h2 className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Your quality thresholds</h2>
          <Slider label="Fit RMSE at most" value={maxRmse} min={0.03} max={0.22} step={0.005} digits={3} onChange={(v) => { setMaxRmse(v); setPage(0); }} />
          <Slider label="idotp at least" value={minIdotp} min={0.99} max={1} step={0.0005} digits={4} onChange={(v) => { setMinIdotp(v); setPage(0); }} />
          <Slider label="Back-exchange at most" value={maxBackex} min={0.1} max={0.45} step={0.01} digits={2} onChange={(v) => { setMaxBackex(v); setPage(0); }} />
          <p className="text-[11px] text-ink-muted">
            {filtered.length.toLocaleString()} of {rows.length.toLocaleString()} measurements pass. Thresholds start fully
            open: which data are good enough is the reader&apos;s call, and a shared link should record it (planned).
          </p>
        </div>
        <div className="rounded-lg border border-line bg-white p-3 lg:col-span-8">
          <div className="mb-1 flex items-baseline justify-between">
            <h2 className="text-[13px] font-semibold text-ink">Stability vs cooperativity</h2>
            <span className="font-mono text-[10px] text-ink-muted">a_d3_fit · index.json</span>
          </div>
          <Plot
            data={scatter}
            height={330}
            layout={{ xaxis: { title: { text: "ΔG max (kcal/mol)" } }, yaxis: { title: { text: "cooperativity (normalized)" } } }}
            onClick={(e) => {
              const id = e.points[0]?.customdata;
              if (typeof id === "string" && id) window.location.hash = `#/entry/${id}`;
            }}
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-line bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[12px]">
            <thead className="bg-surface-muted text-[10.5px] uppercase tracking-wide text-ink-muted">
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key} title={c.hint} className="cursor-pointer whitespace-nowrap px-3 py-2 font-semibold hover:text-accent"
                    onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : -1 }))}>
                    {c.label}{sort.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                  </th>
                ))}
                <th className="px-3 py-2 font-semibold">Data</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.row} className="border-t border-line hover:bg-surface-muted/60">
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11.5px]">
                    {r.page ? <a className="font-semibold text-accent underline" href={`#/entry/${r.id}`}>{r.name}</a> : r.name}
                    <div className="font-sans text-[10px] text-ink-muted">
                      {r.origin}
                      {r.uniprot && <> · UniProt <a className="underline hover:text-accent" href={`https://www.uniprot.org/uniprotkb/${r.uniprot}`} target="_blank" rel="noreferrer">{r.uniprot}</a></>}
                      {r.source_pdb && <> · from PDB <a className="underline hover:text-accent" href={`https://www.rcsb.org/structure/${r.source_pdb}`} target="_blank" rel="noreferrer">{r.source_pdb}</a></>}
                    </div>
                  </td>
                  <td className="px-3 py-1.5">{r.topology ?? "–"}</td>
                  {COLUMNS.slice(2).map((c) => (
                    <td key={c.key} className="px-3 py-1.5 text-right font-mono tabular-nums">{fmt(r[c.key] as number | null, c.digits)}</td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <Tag on>mHDX</Tag>
                    {r.nmr && <Tag on>NMR</Tag>}
                    {r.pdb && <Tag on>{r.pdb}</Tag>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[12px] text-ink-muted">
          <span>Page {page + 1} of {pages}</span>
          <span className="flex gap-1">
            <button className="rounded border border-line-strong px-2 py-0.5 disabled:opacity-40" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <button className="rounded border border-line-strong px-2 py-0.5 disabled:opacity-40" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
          </span>
        </div>
      </section>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2">
      <div className="text-[20px] font-semibold tabular-nums text-ink">{n.toLocaleString()}</div>
      <div className="text-[11px] text-ink-muted">{label}</div>
    </div>
  );
}

function Slider({ label, value, min, max, step, digits, onChange }: {
  label: string; value: number; min: number; max: number; step: number; digits: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between text-[11.5px] text-ink-secondary"><span>{label}</span><span className="font-mono">{value.toFixed(digits)}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="accent-[#663be4]" />
    </div>
  );
}

function Tag({ on, children }: { on?: boolean; children: React.ReactNode }) {
  return <span className={`mr-1 rounded px-1.5 py-0.5 font-mono text-[10px] ${on ? "bg-accent-soft text-accent" : "bg-surface-muted text-ink-muted"}`}>{children}</span>;
}
