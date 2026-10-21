import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { metricLabel } from "./data";
import type { AnyView as View, Artifact, Derivation, Run } from "./types";

// Per-value provenance. Every displayed value or plot names a derivation (pipeline
// build_derivations); SourceLine shows its origin in one line, and clicking it opens a
// card answering "where did this come from?" and "what would it take to reproduce it?".

interface Ctx {
  entry: View;
  open: (id: string) => void;
}

const ProvenanceCtx = createContext<Ctx | null>(null);

export const TIER_STYLE: Record<Derivation["tier"], { label: string; color: string; hint: string }> = {
  copied: { label: "copied", color: "#1b7837", hint: "Value read verbatim from an archived file; verify by checksum and field." },
  computed: { label: "computed here", color: "#663be4", hint: "Derived by this repository from archived files; rerun the build to reproduce." },
};

export const RAW_STYLE: Record<Derivation["raw"], { label: string; color: string }> = {
  pipelines: { label: "from raw: rerun pipelines", color: "#5f616b" },
  blocked: { label: "raw input not found", color: "#b4231d" },
  deposited: { label: "deposited file", color: "#5f616b" },
};

export function ProvenanceProvider({ entry, children }: { entry: View; children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = useCallback((id: string) => setOpenId(id), []);
  const value = useMemo(() => ({ entry, open }), [entry, open]);
  const d = openId ? entry.derivations.find((x) => x.id === openId) ?? null : null;
  return (
    <ProvenanceCtx.Provider value={value}>
      {children}
      <ProvenanceDialog entry={entry} d={d} onClose={() => setOpenId(null)} />
    </ProvenanceCtx.Provider>
  );
}

function useProvenance(): Ctx {
  const c = useContext(ProvenanceCtx);
  if (!c) throw new Error("SourceLine outside ProvenanceProvider");
  return c;
}

/** display name: metric labels for metrics, the stored label otherwise */
export function derivationLabel(d: Derivation): string {
  return d.id.startsWith("metric:") ? metricLabel(d.label).label : d.label;
}

/** "Dataset_3 · dg_max · row 214" for the first input, "+1 more" for the rest;
 * compact drops rows and further inputs */
export function inputSummary(entry: View, d: Derivation, compact = false): string {
  const arts = new Map(entry.artifacts.map((a) => [a.id, a]));
  const first = d.inputs[0];
  if (!first) return "–";
  const a = arts.get(first.artifact);
  const rows = first.rows.filter(Boolean);
  if (compact) return `${a?.short ?? first.artifact} · ${first.fields[0]}`;
  const parts = [
    a?.short ?? first.artifact,
    first.fields.slice(0, 2).join(", ") + (first.fields.length > 2 ? ", …" : ""),
    rows.length ? `row${rows.length > 1 ? "s" : ""} ${rows.join(", ")}` : null,
  ].filter(Boolean);
  const more = d.inputs.length - 1;
  return parts.join(" · ") + (more > 0 ? ` +${more} more` : "");
}

function Dot({ color }: { color: string }) {
  return <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />;
}

/** One line under a value or plot: its source, tier and raw-data status. Click for the card. */
export function SourceLine({ id, compact = false }: { id: string; compact?: boolean }) {
  const { entry, open } = useProvenance();
  const d = entry.derivations.find((x) => x.id === id);
  if (!d) return null;
  const tier = TIER_STYLE[d.tier];
  return (
    <button
      type="button"
      onClick={() => open(id)}
      title="Where this comes from and how to reproduce it"
      className="group flex min-w-0 max-w-full items-center gap-1.5 rounded text-left font-mono text-[10px] text-ink-muted hover:text-accent"
    >
      <span className="truncate underline decoration-dotted underline-offset-2">{inputSummary(entry, d, compact)}</span>
      <span className="flex shrink-0 items-center gap-1">
        <Dot color={tier.color} />
        {!compact && <span style={{ color: tier.color }}>{tier.label}</span>}
      </span>
    </button>
  );
}

function short(sha: string | null): string {
  return sha ? `${sha.slice(0, 12)}…` : "–";
}

function runLink(r: Run): ReactNode {
  const commit = r.version && /^[0-9a-f]{40}$/.test(r.version) ? r.version : null;
  const label = `${r.software}${r.version ? ` @ ${r.version.slice(0, 7)}` : ""}`;
  return commit ? (
    <a className="text-accent underline" href={`https://github.com/Rocklin-Lab/${r.software}/tree/${commit}`} target="_blank" rel="noreferrer">
      {label}
    </a>
  ) : (
    label
  );
}

function CopyBlock({ lines }: { lines: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = lines.join("\n");
  return (
    <div className="relative rounded border border-line bg-surface-muted">
      <pre className="overflow-x-auto whitespace-pre p-2 pr-14 font-mono text-[11px] leading-relaxed text-ink">{text}</pre>
      <button
        type="button"
        className="absolute right-1.5 top-1.5 rounded border border-line-strong bg-white px-1.5 py-0.5 text-[10px] text-ink-secondary hover:bg-accent-soft"
        onClick={() => {
          navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          });
        }}
      >
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}

function Section({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-t border-line py-2.5 sm:grid-cols-[92px_minmax(0,1fr)] sm:gap-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{k}</div>
      <div className="min-w-0 text-[12.5px] text-ink">{children}</div>
    </div>
  );
}

function ProvenanceDialog({ entry, d, onClose }: { entry: View; d: Derivation | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (d && !el.open) el.showModal();
    if (!d && el.open) el.close();
  }, [d]);

  const arts = useMemo(() => new Map<string, Artifact>(entry.artifacts.map((a) => [a.id, a])), [entry]);
  const runs = useMemo(() => new Map<string, Run>(entry.runs.map((r) => [r.id, r])), [entry]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="w-[min(640px,calc(100vw-32px))] rounded-lg border border-line-strong p-0 shadow-xl backdrop:bg-ink/30"
    >
      {d && (
        <div className="flex flex-col p-4">
          <header className="flex items-start justify-between gap-3 pb-2">
            <div>
              <div className="text-[15px] font-semibold text-ink">
                {derivationLabel(d)}
                {d.value != null && (
                  <span className="ml-2 font-mono text-[14px]">
                    = {d.value}
                    {d.unit ? ` ${d.unit}` : ""}
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1" title={TIER_STYLE[d.tier].hint}>
                  <Dot color={TIER_STYLE[d.tier].color} />
                  <span style={{ color: TIER_STYLE[d.tier].color }}>{TIER_STYLE[d.tier].label}</span>
                </span>
                <span style={{ color: RAW_STYLE[d.raw].color }}>{RAW_STYLE[d.raw].label}</span>
              </div>
            </div>
            <button type="button" onClick={onClose} className="rounded border border-line-strong px-2 py-0.5 text-[12px] text-ink-secondary hover:bg-surface-muted" aria-label="close">
              ✕
            </button>
          </header>

          <Section k="From">
            <ul className="flex flex-col gap-2">
              {d.inputs.map((i, n) => {
                const a = arts.get(i.artifact);
                const rows = i.rows.filter(Boolean);
                return (
                  <li key={n} className="flex flex-col gap-0.5">
                    <span>
                      {a?.uri ? <a className="text-accent underline" href={a.uri} target="_blank" rel="noreferrer">{a.title}</a> : a?.title}
                    </span>
                    <span className="font-mono text-[11px] text-ink-muted">
                      {i.fields.join(", ")}
                      {rows.length ? ` · row${rows.length > 1 ? "s" : ""} ${rows.join(", ")}` : ""} · sha256 {short(a?.sha256 ?? null)} · {a?.license}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section k="Made by">
            <ol className="flex flex-col gap-0.5">
              {d.runs.map((rid) => {
                const r = runs.get(rid);
                return r ? (
                  <li key={rid}>
                    {runLink(r)} <span className="text-ink-muted">: {r.description}</span>
                  </li>
                ) : null;
              })}
              {d.raw === "deposited" && <li className="text-ink-muted">Deposited by the authors; not regenerated here.</li>}
              {d.tier === "computed" && (
                <li>
                  this repository: <span className="font-mono text-[11px]">{d.code}</span>
                </li>
              )}
            </ol>
          </Section>

          {d.operation && (
            <Section k="Operation">
              <span className="text-ink-secondary">{d.operation}</span>
            </Section>
          )}

          <Section k="Reproduce">
            <div className="flex flex-col gap-2">
              <CopyBlock
                lines={[
                  "conda env create -f environment.yml && conda activate hdx-data-repo",
                  "python pipeline/fetch.py",
                  ...(d.tier === "computed" ? ["python pipeline/build_entries.py"] : []),
                  ...(d.check ? [d.check] : []),
                ]}
              />
              <p className="text-[11.5px] text-ink-muted">
                {d.raw === "pipelines" && <>From raw data: run the pipelines above on the PRIDE files, at the listed commits.</>}
                {d.raw === "blocked" && (
                  <>
                    From raw data: raw input not found:{" "}
                    {d.runs
                      .flatMap((rid) => runs.get(rid)?.inputs ?? [])
                      .filter((aid) => arts.get(aid)?.uri == null)
                      .map((aid) => arts.get(aid)?.title)
                      .join("; ")}
                    .
                  </>
                )}
                {d.raw === "deposited" && <>The file is the deposited archive copy; regeneration is outside this repository.</>}
              </p>
            </div>
          </Section>
        </div>
      )}
    </dialog>
  );
}
