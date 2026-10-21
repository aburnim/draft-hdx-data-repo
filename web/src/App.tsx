import { lazy, Suspense, useEffect, useState } from "react";

import ErrorBoundary from "./ErrorBoundary";
import Browse from "./pages/Browse";

// Mol* is most of the bundle; only entry pages need it.
const Entry = lazy(() => import("./pages/Entry"));

// Hash routes, so the built site runs from any static host with no server rewrites:
//   #/                      all entries
//   #/entry/<id>[/<tab>]    one entry
function useRoute(): string[] {
  const read = () => window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => {
      setParts(read());
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return parts;
}

export default function App() {
  const [page, id, tab] = useRoute();
  // Braces matter: newer Chromium returns a Promise from scrollTo, and an effect that
  // returns a non-function crashes React ("destroy is not a function").
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page, id]);
  return (
    <div className="min-h-screen bg-surface-muted/60">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <a href="#/" className="flex items-baseline gap-2">
            <span className="text-[16px] font-semibold tracking-tight text-ink">Prism</span>
            <span className="text-[13px] text-ink-muted">HDX entries</span>
            <span className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase text-accent">prototype</span>
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <ErrorBoundary key={`${page}/${id}`}>
          {page === "entry" && id ? (
            <Suspense fallback={<p className="text-ink-muted">Loading viewer…</p>}>
              <Entry id={id} tab={tab ?? "explore"} />
            </Suspense>
          ) : (
            <Browse />
          )}
        </ErrorBoundary>
      </main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 text-[11px] text-ink-muted">
        Data: Ferrari et al. 2026 (Zenodo 10.5281/zenodo.14983481, CC-BY-4.0; PRIDE PXD061702); Lu et al. 2026 (PRIDE PXD057539, CC0) and
        Weber et al. 2026 (HXMS supplement); structures from the PDB (CC0). Each entry lists its sources on its Overview tab.
        Viewer components adapted from hetstar (rtviii). A Prism prototype, Astera Institute.
      </footer>
    </div>
  );
}
