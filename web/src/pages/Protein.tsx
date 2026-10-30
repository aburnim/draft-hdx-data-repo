import { useJSON } from "../hdx/data";
import type { ProteinIndex } from "../hdx/types";

// One protein (UniProt accession): its identity from the pinned UniProt record, and its
// HDX-MS entries, each linking to its entry page.

export default function Protein({ accession }: { accession: string }) {
  const { data, error } = useJSON<ProteinIndex>("index.json");
  if (error) return <p className="text-danger">Could not load the protein list: {error}</p>;
  if (!data) return <p className="text-ink-muted">Loading protein…</p>;
  const p = data.proteins.find((x) => x.uniprot === accession);
  if (!p) return <p className="text-danger">No protein {accession}. <a className="underline" href="#/">Back to all proteins</a>.</p>;

  return (
    <div className="flex flex-col gap-4">
      <nav className="text-[12px] text-ink-muted">
        <a className="hover:text-accent" href="#/">All proteins</a> / <span className="text-ink-secondary">{p.uniprot}</span>
      </nav>
      <header className="flex flex-col gap-2 border-b border-line pb-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[26px] font-semibold tracking-tight text-ink">{p.name}</h1>
          <span className="font-mono text-[13px] text-ink-muted">{p.uniprot}</span>
        </div>
        <p className="text-[14px] text-ink-secondary">
          {p.gene && <><i>{p.gene}</i> · </>}<i>{p.organism}</i> (taxon {p.taxon_id}) · {p.length} residues
        </p>
        <p className="text-[11.5px] text-ink-muted">
          From UniProtKB{" "}
          <a className="text-accent underline" href={`https://www.uniprot.org/uniprotkb/${p.uniprot}/entry`} target="_blank" rel="noreferrer">
            {p.uniprot} ({p.uniprot_id})
          </a>
          , {p.reviewed ? "reviewed (Swiss-Prot)" : "unreviewed (TrEMBL)"}, entry version {p.entry_version}, {p.source.license}. SHA-256{" "}
          <span className="font-mono">{p.source.sha256.slice(0, 12)}…</span> in the source lock.
        </p>
      </header>

      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">HDX-MS entries</h2>
      <div className="overflow-hidden rounded-lg border border-line bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="bg-surface-muted text-[10.5px] uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">Entry</th>
                <th className="px-4 py-2 font-semibold">Title</th>
                <th className="px-4 py-2 font-semibold">Method</th>
                <th className="px-4 py-2 font-semibold">States</th>
                <th className="px-4 py-2 font-semibold">Reference structures</th>
                <th className="px-4 py-2 font-semibold">Raw data</th>
              </tr>
            </thead>
            <tbody>
              {p.entries.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => (window.location.hash = `#/entry/${e.id}`)}
                  className="cursor-pointer border-t border-line hover:bg-accent-soft/50"
                >
                  <td className="px-4 py-3 font-mono text-[12px]">
                    <a className="font-semibold text-accent underline" href={`#/entry/${e.id}`} onClick={(ev) => ev.stopPropagation()}>
                      {e.id}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-ink">{e.title}</td>
                  <td className="px-4 py-3 text-ink-secondary">{e.method}</td>
                  <td className="px-4 py-3 text-ink-secondary">{e.constructs.join(", ")}</td>
                  <td className="px-4 py-3 font-mono text-[12px]">
                    {e.structures.length
                      ? e.structures.map((s, i) => (
                          <span key={s.entry}>
                            {i > 0 && ", "}
                            <a className="text-accent underline" href={`#/entry/${s.entry}`} onClick={(ev) => ev.stopPropagation()} title={`reference for ${s.state}`}>
                              {s.pdb}
                            </a>
                          </span>
                        ))
                      : "–"}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px]" style={{ color: e.raw ? undefined : "#b4231d" }}>
                    {e.raw ?? "raw input not found"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
