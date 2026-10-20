import "molstar/lib/mol-plugin-ui/skin/light.scss";

import type { ReactNode } from "react";

import { fmt, METRIC_LABELS, useJSON } from "../hdx/data";
import Explorer from "../hdx/Explorer";
import Provenance from "../hdx/Provenance";
import { derivationLabel, ProvenanceProvider, RAW_STYLE, SourceLine, TIER_STYLE } from "../hdx/provenance-card";
import type { Derivation, EntryRecord, Metric, View } from "../hdx/types";

// One entry (an HDX measurement or a reference structure). Overview, Models, Provenance and
// Downloads describe this entry's record; Explore is the cross-entry view it belongs to.

const TABS = [
  { id: "explore", label: "Explore" },
  { id: "overview", label: "Overview" },
  { id: "models", label: "Models" },
  { id: "provenance", label: "Provenance" },
  { id: "downloads", label: "Downloads" },
] as const;

const KIND_LABEL: Record<string, string> = { "mHDX-MS": "mHDX-MS", "HDX-NMR": "HDX-NMR" };

export default function Entry({ id, tab }: { id: string; tab: string }) {
  const { data: rec, error } = useJSON<EntryRecord>(`entries/${id}.json`);
  const { data: view, error: viewError } = useJSON<View>(rec ? `views/${rec.view}.json` : null);
  if (error) return <p className="text-danger">No entry {id}. <a className="underline" href="#/">Back to all entries</a>.</p>;
  if (viewError) return <p className="text-danger">Could not load the cross-entry view: {viewError}</p>;
  if (!rec || !view) return <p className="text-ink-muted">Loading entry…</p>;
  const active = TABS.some((t) => t.id === tab) ? tab : "explore";
  const refs = { ...view.external_refs, ...rec.external_refs };

  return (
    <div className="flex flex-col gap-4">
      <nav className="text-[12px] text-ink-muted">
        <a className="hover:text-accent" href="#/">All entries</a> / <span className="text-ink-secondary">{rec.id}</span>
      </nav>
      <header className="flex flex-col gap-2 border-b border-line pb-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[26px] font-semibold tracking-tight text-ink">{view.name}</h1>
          <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[12px] font-semibold text-accent">{KIND_LABEL[rec.method] ?? rec.method}</span>
          <span className="font-mono text-[13px] text-ink-muted">{rec.id}</span>
        </div>
        <p className="text-[14px] text-ink-secondary">{rec.title}</p>
        <div className="flex flex-wrap gap-1.5">
          {rec.kind === "structure" && refs.pdb && <Badge k="PDB" v={refs.pdb} href={`https://www.rcsb.org/structure/${refs.pdb}`} />}
          {rec.external_refs.pride && <Badge k="PRIDE" v={rec.external_refs.pride} href={`https://www.ebi.ac.uk/pride/archive/projects/${rec.external_refs.pride}`} />}
          {rec.external_refs.zenodo && <Badge k="Zenodo" v={rec.external_refs.zenodo.split(".").pop()!} href={`https://doi.org/${rec.external_refs.zenodo}`} />}
          {rec.external_refs.doi && <Badge k="DOI" v={rec.external_refs.doi} href={`https://doi.org/${rec.external_refs.doi}`} />}
          <Badge k="Schema" v={rec.schema_version} />
          <Badge k="Revision" v={`${rec.revision.revision_number} · ${rec.revision.state}`} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
          <span className="text-ink-muted">Linked entries (shared sequence):</span>
          {view.members.map((m) => (
            <a
              key={m.id}
              href={`#/entry/${m.id}/${active}`}
              className={`rounded border px-2 py-0.5 ${m.id === rec.id ? "border-accent bg-accent-soft text-accent" : "border-line-strong text-ink-secondary hover:bg-surface-muted"}`}
            >
              {m.kind === "structure" ? `Structure ${view.external_refs.pdb}` : m.method} <span className="font-mono text-[10.5px] opacity-70">{m.id}</span>
            </a>
          ))}
        </div>
      </header>

      <div className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <a key={t.id} href={`#/entry/${rec.id}/${t.id}`}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium ${active === t.id ? "border-accent text-accent" : "border-transparent text-ink-secondary hover:text-ink"}`}>
            {t.label}
          </a>
        ))}
      </div>

      <ProvenanceProvider entry={view}>
        {active === "explore" && (
          <>
            <p className="text-[12px] text-ink-muted">
              Cross-entry view <span className="font-mono">{view.id}</span>: {view.grouping}
            </p>
            <Explorer entry={view} />
          </>
        )}
        {active === "overview" && <Overview rec={rec} view={view} />}
        {active === "models" && <Models rec={rec} view={view} />}
        {active === "provenance" && <ProvenanceTab rec={rec} view={view} />}
        {active === "downloads" && <Downloads rec={rec} view={view} />}
      </ProvenanceProvider>
    </div>
  );
}

function Badge({ k, v, href }: { k: string; v: string; href?: string }) {
  const body = (
    <span className="inline-flex overflow-hidden rounded border border-line-strong text-[11px]">
      <span className="bg-surface-muted px-1.5 py-0.5 font-semibold text-ink-muted">{k}</span>
      <span className="px-1.5 py-0.5 font-mono text-ink">{v}</span>
    </span>
  );
  return href ? <a href={href} target="_blank" rel="noreferrer" className="hover:opacity-80">{body}</a> : body;
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="rounded-lg border border-line bg-white text-[12.5px]">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[150px_minmax(0,1fr)] gap-2 border-b border-line px-3 py-2 last:border-0">
          <dt className="text-ink-muted">{k}</dt>
          <dd className="min-w-0 break-words text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function H2({ children }: { children: ReactNode }) {
  return <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{children}</h2>;
}

function MetricTile({ m }: { m: Metric }) {
  const meta = METRIC_LABELS[m.key];
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2" title={meta?.hint}>
      <div className="text-[11px] text-ink-muted">{meta?.label ?? m.key}</div>
      <div className="text-[18px] font-semibold tabular-nums text-ink">
        {fmt(m.value, Math.abs(m.value) >= 10 ? 0 : 2)} <span className="text-[11px] font-normal text-ink-muted">{m.unit ?? ""}</span>
      </div>
      <div className="mt-0.5">
        <SourceLine id={`metric:${m.key}`} compact />
      </div>
    </div>
  );
}

function Table({ head, rows, minWidth = 560 }: { head: string[]; rows: ReactNode[][]; minWidth?: number }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-white">
      <table className="w-full text-left text-[12px]" style={{ minWidth }}>
        <thead className="bg-surface-muted text-[10.5px] uppercase tracking-wide text-ink-muted">
          <tr>{head.map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line align-top">
              {r.map((c, j) => <td key={j} className="px-3 py-2">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Overview({ rec, view }: { rec: EntryRecord; view: View }) {
  const structure = view.members.find((m) => m.kind === "structure");
  const frame = rec.models.find((m) => m.residue_frame)?.residue_frame;
  const metrics = view.metrics.filter((m) => m.entry === rec.id);
  const samples = rec.hdx?.samples ?? [];
  const pe = new Map(rec.polymer_entities.map((p) => [p.id, p]));
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Facts rows={[
          ["Method", <>{rec.method}{rec.method_source ? <span className="text-ink-muted"> (from {rec.method_source})</span> : null}</>],
          ["Protein", `${view.name} · ${view.protein.origin}${view.protein.topology ? ` · ${view.protein.topology}` : ""}`],
          ["Reference structure", structure ? <a className="text-accent underline" href={`#/entry/${structure.id}`}>{view.external_refs.pdb} ({structure.id})</a> : "–"],
          ...(frame ? [["Residue numbering", `label_* numbering of ${frame.model}; ${frame.mapping}`] as [string, ReactNode]] : []),
          ["Revision", `${rec.revision.revision_number}, ${rec.revision.state}. ${rec.revision.change_summary ?? ""}`],
          ["Cite", rec.citation],
        ]} />
        <div className="flex flex-col gap-3">
          {metrics.length > 0 && (
            <>
              <H2>Metrics</H2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {metrics.map((m) => <MetricTile key={m.key} m={m} />)}
              </div>
            </>
          )}
          <div className="rounded-lg border border-line bg-surface-muted p-3 text-[12px] leading-relaxed text-ink-secondary">
            <b className="text-ink">Schema alignment.</b> Field names follow the Dynamic PDB schema v0.2.0 (2026-10-16).
            This record also uses fields or values that v0.2.0 does not define:
            <ul className="mt-1 list-disc pl-4">
              {rec.extensions.map((x) => <li key={x}>{x}</li>)}
            </ul>
            {rec.undeclared_inputs?.length ? <p className="mt-1">Undeclared inputs: {rec.undeclared_inputs.join("; ")}.</p> : null}
          </div>
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <H2>Polymer entities</H2>
        <Table
          head={["Entity", "Construct", "Length", "Sequence"]}
          rows={rec.polymer_entities.map((p) => [
            <span className="font-mono">{p.id}</span>, p.construct ?? "–", p.sequence.length,
            <span className="break-all font-mono text-[11px]">{p.sequence}</span>,
          ])}
        />
      </section>

      {samples.length > 0 && (
        <section className="flex flex-col gap-2">
          <H2>Samples</H2>
          <Table
            head={["Sample", "Construct", "Measurement", "pH", "Temperature", "Buffer", "Labeling times", "Source"]}
            rows={samples.map((s) => [
              <span className="font-mono">{s.id}</span>,
              pe.get(s.polymer_entity)?.construct ?? s.polymer_entity,
              s.measurement ?? "–",
              s.pH ?? (s.pH_labels ? s.pH_labels.join(" + ") + (s.merged_pH_series ? " (merged)" : "") : s.conditions_differ ? "mixed" : "not reported"),
              s.temperature_kelvin != null ? `${s.temperature_kelvin} K` : s.conditions_differ ? "mixed" : "not reported",
              s.buffer ?? (s.conditions_differ ? "mixed" : "not reported"),
              s.labeling_times_s ? `${s.labeling_times_s.length}` : "–",
              <span className="font-mono text-[11px]">
                {s.source.artifact} · row {s.source.rows.join(", ")}
                {s.mean_of_rows ? <span className="block font-sans text-ink-muted">mean of rows {s.mean_of_rows.join(", ")}{s.conditions_differ ? "; conditions differ" : ""}</span> : null}
              </span>,
            ])}
            minWidth={760}
          />
        </section>
      )}

      <SourcesTable view={view} rec={rec} />
    </div>
  );
}

/** Every displayed value of this entry, and the cross-entry values it contributes to. */
function SourcesTable({ view, rec }: { view: View; rec: EntryRecord }) {
  const runs = new Map(view.runs.map((r) => [r.id, r]));
  const own = view.derivations.filter((d) => d.entry === rec.id);
  const cross = view.derivations.filter((d) => d.entry === null);
  const row = (d: Derivation): ReactNode[] => [
    <>
      {derivationLabel(d)}
      {d.value != null && <span className="ml-1.5 font-mono text-ink-secondary">{fmt(d.value, Math.abs(d.value) >= 10 ? 0 : 2)}{d.unit ? ` ${d.unit}` : ""}</span>}
    </>,
    <div className="max-w-[320px]"><SourceLine id={d.id} /></div>,
    <span className="text-ink-secondary">{[...d.runs.map((r) => runs.get(r)?.software ?? r), ...(d.tier === "computed" ? ["this repository"] : [])].join(" → ") || "deposited"}</span>,
    <span style={{ color: RAW_STYLE[d.raw].color }}>{RAW_STYLE[d.raw].label.replace("from raw: ", "")}</span>,
  ];
  const head = ["Value or plot", "Source and tier", "Produced by", "From raw data"];
  return (
    <section className="flex flex-col gap-2">
      <H2>Where each value comes from</H2>
      {own.length > 0 ? <Table head={head} rows={own.map(row)} minWidth={760} /> : <p className="text-[12px] text-ink-muted">No values displayed for this entry alone.</p>}
      {rec.kind === "hdx" && cross.length > 0 && (
        <>
          <H2>Cross-entry values (this entry and its linked entries)</H2>
          <Table head={head} rows={cross.map(row)} minWidth={760} />
        </>
      )}
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-muted">
        {Object.values(TIER_STYLE).map((t) => (
          <span key={t.label} className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: t.color }} />
            <b style={{ color: t.color }}>{t.label}</b>: {t.hint}
          </span>
        ))}
      </p>
    </section>
  );
}

function Models({ rec, view }: { rec: EntryRecord; view: View }) {
  const runs = new Map(rec.runs.map((r) => [r.id, r]));
  const arts = new Map(rec.artifacts.map((a) => [a.id, a]));
  const l3 = view.metrics.filter((m) => m.level === "L3");
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-[13px] leading-relaxed text-ink-secondary">
        Models are interpretations of this entry&apos;s data and are peers of each other. Values from linked entries are
        compared on the Explore tab and in the L3 metrics below; they are not models of this entry.
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        {rec.models.map((m) => {
          const run = m.run ? runs.get(m.run) : undefined;
          const src = m.source ? arts.get(m.source.artifact) : m.primary_artifact ? arts.get(m.primary_artifact) : undefined;
          return (
            <article key={m.id} className="flex flex-col gap-2 rounded-lg border border-line bg-white p-3 text-[12px]">
              <div className="font-mono text-[10.5px] text-ink-muted">{m.id} · revision {m.revision_number}</div>
              <h3 className="text-[14px] font-semibold text-ink">{m.title}</h3>
              <Facts rows={[
                ["Model type", <>{m.model_type}{m.model_type === "HDX ΔG set" && <span className="text-ink-muted"> (extension)</span>}</>],
                ["Purpose · source", `${m.purpose} · ${m.model_source}`],
                ["Data", src ? <a className="text-accent underline" href={src.uri} target="_blank" rel="noreferrer">{src.name}</a> : "–"],
                ...(m.source?.selector ? [["Fields · rows", <span className="font-mono text-[11px]">{m.source.selector.fields?.join(", ")} · {m.source.selector.rows?.join(", ")}</span>] as [string, ReactNode]] : []),
                ["Software", run ? `${run.software_name}${run.software_version ? ` @ ${run.software_version.slice(0, 7)}` : " (version not recorded)"}` : "deposited model"],
                ...(m.residue_frame ? [["Residue frame", <a className="text-accent underline" href={`#/entry/${m.residue_frame.entry}`}>{m.residue_frame.model}</a>] as [string, ReactNode]] : []),
                ...(m.residue_data ? [["Residue records", `${m.residue_data.length} (label_* keys, auth_* kept)`] as [string, ReactNode]] : []),
                ...(m.ensemble_members ? [["Ensemble", `${m.ensemble_members} conformers; ${m.atom_count} non-hydrogen atoms and ${m.modeled_residues} residues in the first`] as [string, ReactNode]] : []),
                ...(m.metrics.length ? [["Metrics", `${m.metrics.length}, each with producing software`] as [string, ReactNode]] : []),
              ]} />
            </article>
          );
        })}
      </div>
      {rec.kind === "hdx" && l3.length > 0 && (
        <section className="flex flex-col gap-2">
          <H2>L3 · Agreement between linked entries</H2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{l3.map((m) => <MetricTile key={m.key} m={m} />)}</div>
          <p className="max-w-3xl text-[11.5px] text-ink-muted">
            Computed by this repository; not reported by the authors. Compares sorted mHDX-MS ΔG with sorted HDX-NMR ΔG of
            the construct closest to the mHDX-MS construct, over the k highest-ΔG sites, where k is the smaller site count.
            Sites are matched by rank, not by residue. The metric is exploratory and unvalidated.
          </p>
        </section>
      )}
    </div>
  );
}

function ProvenanceTab({ rec, view }: { rec: EntryRecord; view: View }) {
  const size = (n?: number) => (n == null ? "–" : n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${(n / 1e3).toFixed(0)} kB`);
  const raw = rec.artifacts.filter((a) => a.level === "L0");
  const other = rec.artifacts.filter((a) => a.level !== "L0");
  const artRow = (a: EntryRecord["artifacts"][number]): ReactNode[] => [
    <span className="font-mono">{a.id}</span>, a.level, a.type, a.format,
    <a className="break-all text-accent underline" href={a.uri} target="_blank" rel="noreferrer">{a.name}</a>,
    size(a.size_bytes), <span className="font-mono text-[11px]">{a.sha256 ? `${a.sha256.slice(0, 12)}…` : "not computed"}</span>,
  ];
  return (
    <div className="flex flex-col gap-6">
      <Provenance entry={view} highlight={rec.id} />
      <section className="flex flex-col gap-2">
        <H2>This entry&apos;s artifacts</H2>
        <Table head={["Id", "Level", "Type", "Format", "File", "Size", "SHA-256"]} rows={other.map(artRow)} minWidth={760} />
        {raw.length > 0 && (
          <details className="rounded-lg border border-line bg-white">
            <summary className="cursor-pointer px-3 py-2 text-[12.5px] text-ink-secondary">
              {raw.length} raw files (L0), PRIDE {rec.external_refs.pride}. SHA-256 not computed: PRIDE lists no checksum and the files were not downloaded.
            </summary>
            <div className="border-t border-line p-2">
              <Table head={["Id", "Level", "Type", "Format", "File", "Size", "SHA-256"]} rows={raw.map(artRow)} minWidth={760} />
            </div>
          </details>
        )}
        {rec.undeclared_inputs?.length ? <p className="text-[12px] text-danger">Raw input not found: {rec.undeclared_inputs.join("; ")}.</p> : null}
      </section>
    </div>
  );
}

function Downloads({ rec, view }: { rec: EntryRecord; view: View }) {
  const files = [
    { href: `entries/${rec.id}.json`, label: "Entry record (JSON)", note: `schema ${rec.schema_version}; Dynamic PDB v0.2.0 field names plus listed extensions` },
    { href: `views/${view.id}.json`, label: "Cross-entry view (JSON)", note: "derived; every value drawn on the Explore tab, with derivations" },
    ...(rec.method === "HDX-NMR" ? [{ href: `entries/${rec.id}.residues.csv`, label: "Per-residue HDX-NMR values (CSV)", note: "sample, label_seq_id, auth_seq_id, ΔG, kobs, kint" }] : []),
    ...(rec.kind === "structure" ? [{ href: `structures/${view.external_refs.pdb}.cif`, label: `Structure ${view.external_refs.pdb} (mmCIF)`, note: "copy of the RCSB file; SHA-256 in the source lock" }] : []),
    { href: "sources.lock.json", label: "Source lock (JSON)", note: "URL, SHA-256 and license of every input, plus pinned code commits" },
    { href: "schema/hdx_entry.v0.1.json", label: "Entry schema (JSON Schema)", note: "draft 0.1.0" },
    { href: "schema/hdx_view.v0.1.json", label: "View schema (JSON Schema)", note: "draft 0.1.0" },
  ];
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-white">
      {files.map((f) => (
        <li key={f.href} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2.5 text-[13px]">
          <a className="font-medium text-accent underline" href={f.href} download>{f.label}</a>
          <span className="text-[11.5px] text-ink-muted">{f.note}</span>
        </li>
      ))}
    </ul>
  );
}
