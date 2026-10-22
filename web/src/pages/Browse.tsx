import { useJSON } from "../hdx/data";
import type { EntryList } from "../hdx/types";

// The front page: every HDX entry, one row each, linking to its entry page.

export default function Browse() {
  const { data, error } = useJSON<EntryList>("index.json");
  if (error) return <p className="text-danger">Could not load the entry list: {error}</p>;
  const entries = [...(data?.entries ?? [])].sort((a, b) => a.name.localeCompare(b.name) || b.method.localeCompare(a.method));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[26px] font-semibold tracking-tight text-ink">HDX-MS entries</h1>

      <div className="overflow-hidden rounded-lg border border-line bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="bg-surface-muted text-[10.5px] uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">Entry</th>
                <th className="px-4 py-2 font-semibold">Protein</th>
                <th className="px-4 py-2 font-semibold">Method</th>
                <th className="px-4 py-2 font-semibold">Samples</th>
                <th className="px-4 py-2 font-semibold">Reference structure</th>
                <th className="px-4 py-2 font-semibold">Raw data</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
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
                  <td className="px-4 py-3 font-medium text-ink">{e.name}</td>
                  <td className="px-4 py-3 text-ink-secondary">{e.method}</td>
                  <td className="px-4 py-3 text-ink-secondary">
                    {e.samples} · {e.constructs.join(", ")}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px]">
                    {e.pdb ? (
                      <a className="text-accent underline" href={`#/entry/${e.structure_entry}`} onClick={(ev) => ev.stopPropagation()}>
                        {e.pdb}
                      </a>
                    ) : (
                      "–"
                    )}
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
