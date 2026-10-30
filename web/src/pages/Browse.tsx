import { useJSON } from "../hdx/data";
import type { ProteinIndex } from "../hdx/types";

// The front page: every protein with HDX-MS data, one row per UniProt accession, linking to
// its protein page.

export default function Browse() {
  const { data, error } = useJSON<ProteinIndex>("index.json");
  if (error) return <p className="text-danger">Could not load the protein list: {error}</p>;
  const proteins = [...(data?.proteins ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[26px] font-semibold tracking-tight text-ink">Proteins with HDX-MS data</h1>

      <div className="overflow-hidden rounded-lg border border-line bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="bg-surface-muted text-[10.5px] uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">UniProt</th>
                <th className="px-4 py-2 font-semibold">Protein</th>
                <th className="px-4 py-2 font-semibold">Gene</th>
                <th className="px-4 py-2 font-semibold">Organism</th>
                <th className="px-4 py-2 text-right font-semibold">HDX-MS entries</th>
                <th className="px-4 py-2 font-semibold">States</th>
                <th className="px-4 py-2 font-semibold">Reference structures</th>
              </tr>
            </thead>
            <tbody>
              {proteins.map((p) => (
                <tr
                  key={p.uniprot}
                  onClick={() => (window.location.hash = `#/protein/${p.uniprot}`)}
                  className="cursor-pointer border-t border-line hover:bg-accent-soft/50"
                >
                  <td className="px-4 py-3 font-mono text-[12px]">
                    <a className="font-semibold text-accent underline" href={`#/protein/${p.uniprot}`} onClick={(ev) => ev.stopPropagation()}>
                      {p.uniprot}
                    </a>
                  </td>
                  <td className="px-4 py-3 font-medium text-ink">{p.name}</td>
                  <td className="px-4 py-3 italic text-ink-secondary">{p.gene ?? "–"}</td>
                  <td className="px-4 py-3 italic text-ink-secondary">{p.organism}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{p.entries.length}</td>
                  <td className="px-4 py-3 text-ink-secondary">{[...new Set(p.entries.flatMap((e) => e.constructs))].join(", ")}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-ink-secondary">
                    {[...new Set(p.entries.flatMap((e) => e.structures.map((s) => s.pdb)))].join(", ") || "–"}
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
