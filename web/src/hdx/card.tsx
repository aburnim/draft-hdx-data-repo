import type { ReactNode } from "react";

import { SourceLine } from "./provenance-card";

// A titled plot panel with the source line of the plotted values.

export function Card({
  title,
  prov,
  children,
  caption,
}: {
  title: string;
  /** derivation id: where the plotted values come from */
  prov: string;
  children: ReactNode;
  caption?: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-white p-3">
      <header className="flex flex-col gap-0.5">
        <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
        <SourceLine id={prov} />
      </header>
      {children}
      {caption && <p className="text-[11px] leading-snug text-ink-muted">{caption}</p>}
    </section>
  );
}
