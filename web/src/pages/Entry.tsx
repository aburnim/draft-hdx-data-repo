import "molstar/lib/mol-plugin-ui/skin/light.scss";

import { fmt, METRIC_LABELS, useJSON } from "../hdx/data";
import Explorer from "../hdx/Explorer";
import Provenance from "../hdx/Provenance";
import type { Entry as EntryT, Metric } from "../hdx/types";

const TABS = [
  { id: "explore", label: "Explore" },
  { id: "overview", label: "Overview" },
  { id: "interpretations", label: "Interpretations" },
  { id: "provenance", label: "Provenance" },
  { id: "downloads", label: "Downloads" },
] as const;

export default function Entry({ id, tab }: { id: string; tab: string }) {
  const { data: entry, error } = useJSON<EntryT>(`entries/${id}.json`);
  if (error) return <p className="text-danger">No full entry page for {id} yet. <a className="underline" href="#/">Back to all entries</a>.</p>;
  if (!entry) return <p className="text-ink-muted">Loading entry…</p>;
  const active = TABS.some((t) => t.id === tab) ? tab : "explore";
  const refs = entry.external_refs;

  return (
    <div className="flex flex-col gap-4">
      <nav className="text-[12px] text-ink-muted">
        <a className="hover:text-accent" href="#/">All entries</a> / <span className="text-ink-secondary">{entry.name}</span>
      </nav>
      <header className="flex flex-col gap-2 border-b border-line pb-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[26px] font-semibold tracking-tight text-ink">{entry.name}</h1>
          <span className="font-mono text-[13px] text-ink-muted">{entry.id}</span>
        </div>
        <p className="text-[14px] text-ink-secondary">{entry.title}</p>
        <div className="flex flex-wrap gap-1.5">
          {refs.pdb && <Badge k="PDB" v={refs.pdb} href={`https://www.rcsb.org/structure/${refs.pdb}`} />}
          {refs.pride && <Badge k="PRIDE" v={refs.pride} href={`https://www.ebi.ac.uk/pride/archive/projects/${refs.pride}`} />}
          {refs.zenodo && <Badge k="Zenodo" v={refs.zenodo.split(".").pop()!} href={`https://doi.org/${refs.zenodo}`} />}
          {refs.doi && <Badge k="DOI" v={refs.doi} href={`https://doi.org/${refs.doi}`} />}
          <Badge k="Schema" v={entry.schema_version} />
          <Badge k="License" v="CC-BY-4.0 · CC0" />
        </div>
      </header>

      <div className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <a key={t.id} href={`#/entry/${entry.id}/${t.id}`}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium ${active === t.id ? "border-accent text-accent" : "border-transparent text-ink-secondary hover:text-ink"}`}>
            {t.label}
          </a>
        ))}
      </div>

      {active === "explore" && <Explorer entry={entry} />}
      {active === "overview" && <Overview entry={entry} />}
      {active === "interpretations" && <Interpretations entry={entry} />}
      {active === "provenance" && <Provenance entry={entry} />}
      {active === "downloads" && <Downloads entry={entry} />}
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

function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="rounded-lg border border-line bg-white text-[12.5px]">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[140px_minmax(0,1fr)] gap-2 border-b border-line px-3 py-2 last:border-0">
          <dt className="text-ink-muted">{k}</dt>
          <dd className="min-w-0 break-words text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function MetricTile({ m }: { m: Metric }) {
  const meta = METRIC_LABELS[m.key];
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2" title={meta?.hint}>
      <div className="text-[11px] text-ink-muted">{meta?.label ?? m.key}</div>
      <div className="text-[18px] font-semibold tabular-nums text-ink">
        {fmt(m.value, Math.abs(m.value) >= 10 ? 0 : 2)} <span className="text-[11px] font-normal text-ink-muted">{m.unit ?? ""}</span>
      </div>
      <div className="font-mono text-[9.5px] text-ink-muted">{m.level} · {m.interpretation}{m.computed_here ? " · computed here" : ""}</div>
    </div>
  );
}

function Overview({ entry }: { entry: EntryT }) {
  const seq = entry.chain.positions.map((p) => p.letter).join("");
  const nmr = entry.conditions.filter((c) => c.method === "HDX-NMR");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <Facts rows={[
          ["Protein", entry.protein.name],
          ["Origin", entry.protein.origin],
          ["Topology", entry.protein.topology ?? "–"],
          ["Sequence", <span className="font-mono text-[11px] tracking-wide">{seq}</span>],
          ["Structure", `${entry.external_refs.pdb}, solution NMR ensemble (residue numbering = auth_seq_id)`],
          ["Methods", "mHDX-MS (whole protein), HDX-NMR (per residue)"],
          ["HDX-NMR conditions", nmr.map((c) => c.label).join("; ")],
          ["mHDX-MS", entry.mhdx.map((m) => `${m.library}, ${m.pH_label}, ${m.timepoints_s.length} timepoints`).join("; ")],
          ["Cite", entry.citation],
        ]} />
      </div>
      <div className="flex flex-col gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Metrics</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {entry.metrics.map((m) => <MetricTile key={m.key} m={m} />)}
        </div>
        <div className="rounded-lg border border-line bg-surface-muted p-3 text-[12px] leading-relaxed text-ink-secondary">
          <b className="text-ink">How to read this entry.</b> The measurement is fixed; the interpretations are peers.
          mHDX-MS sees the whole protein at once, so it reports a ranked landscape of site stabilities but cannot place
          them on residues. HDX-NMR places them, on a slightly different construct. A blank is a value nobody measured,
          never a zero. Every number links back to its source on the Provenance tab.
        </div>
      </div>
    </div>
  );
}

function Interpretations({ entry }: { entry: EntryT }) {
  const art = new Map(entry.artifacts.map((a) => [a.id, a]));
  const runs = new Map(entry.runs.map((r) => [r.id, r]));
  const conds = new Map(entry.conditions.map((c) => [c.id, c]));
  const l3 = entry.metrics.filter((m) => m.level === "L3");
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-[13px] leading-relaxed text-ink-secondary">
        Each interpretation explains the same protein&apos;s exchange behavior. None is the reference: the deposited
        structure is a model like the others, and disagreement between them is information.
      </p>
      <div className="grid gap-3 lg:grid-cols-3">
        {entry.interpretations.map((m) => {
          const a = art.get(m.artifact);
          const r = m.run ? runs.get(m.run) : null;
          const metrics = entry.metrics.filter((x) => x.interpretation === m.id);
          return (
            <article key={m.id} className="flex flex-col gap-2 rounded-lg border border-line bg-white p-3 text-[12px]">
              <div className="font-mono text-[10.5px] text-ink-muted">{m.id} · {a?.level}</div>
              <h3 className="text-[14px] font-semibold text-ink">{m.title}</h3>
              <Facts rows={[
                ["Method", m.method],
                ["Resolution", m.resolution],
                ["Data", a ? <a className="text-accent underline" href={a.uri ?? undefined} target="_blank" rel="noreferrer">{a.title}</a> : "–"],
                ["Software", r ? `${r.software}${r.version ? ` @ ${r.version.slice(0, 7)}` : ""}` : "deposited model"],
                ["Conditions", m.conditions.map((c) => conds.get(c)?.label ?? c).join("; ") || "–"],
              ]} />
              {metrics.length > 0 && <div className="grid grid-cols-2 gap-2">{metrics.slice(0, 4).map((x) => <MetricTile key={x.key} m={x} />)}</div>}
            </article>
          );
        })}
      </div>
      {l3.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">L3 · Do they agree?</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{l3.map((m) => <MetricTile key={m.key} m={m} />)}</div>
          <p className="max-w-3xl text-[11.5px] text-ink-muted">
            Sketch metrics computed by this repository, not by the authors: the sorted mHDX-MS landscape against the
            No-His HDX-NMR landscape (the closest construct), over the sites both measured. A placeholder for a
            community-agreed comparison.
          </p>
        </section>
      )}
    </div>
  );
}

function Downloads({ entry }: { entry: EntryT }) {
  const files = [
    { href: `entries/${entry.id}.json`, label: "Entry record (JSON)", note: `schema ${entry.schema_version}, every value on this page` },
    { href: `entries/${entry.id}.residues.csv`, label: "Per-residue HDX-NMR values (CSV)", note: "condition, residue, ΔG, kobs, kint" },
    { href: `structures/${entry.external_refs.pdb}.cif`, label: `Structure ${entry.external_refs.pdb} (mmCIF)`, note: "byte-identical copy of the RCSB file" },
    { href: "sources.lock.json", label: "Source lock (JSON)", note: "URL, SHA-256 and license of every input, plus pinned code commits" },
    { href: "schema/hdx_entry.v0.json", label: "Entry schema (JSON Schema)", note: "rough draft 0.0.1" },
  ];
  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-line rounded-lg border border-line bg-white">
        {files.map((f) => (
          <li key={f.href} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2.5 text-[13px]">
            <a className="font-medium text-accent underline" href={f.href} download>{f.label}</a>
            <span className="text-[11.5px] text-ink-muted">{f.note}</span>
          </li>
        ))}
      </ul>
      <p className="text-[12px] text-ink-muted">
        Raw spectra are not served here. Get them from PRIDE{" "}
        <a className="text-accent underline" href={`https://www.ebi.ac.uk/pride/archive/projects/${entry.external_refs.pride}`} target="_blank" rel="noreferrer">{entry.external_refs.pride}</a>.
        {" "}{entry.license}.
      </p>
    </div>
  );
}
