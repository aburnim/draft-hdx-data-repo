import { useEffect, useState } from "react";

// Fetch a JSON file from the static site, relative to the page so the build works from
// any sub-path. One cache per URL, so tab switches never refetch.
const cache = new Map<string, Promise<unknown>>();

export function fetchJSON<T>(path: string): Promise<T> {
  let p = cache.get(path);
  if (!p) {
    p = fetch(path).then((r) => {
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
      return r.json();
    });
    cache.set(path, p);
  }
  return p as Promise<T>;
}

export function useJSON<T>(path: string | null): { data: T | null; error: string | null } {
  const [state, setState] = useState<{ data: T | null; error: string | null }>({ data: null, error: null });
  useEffect(() => {
    if (!path) return;
    let live = true;
    setState({ data: null, error: null });
    fetchJSON<T>(path).then(
      (data) => live && setState({ data, error: null }),
      (e: Error) => live && setState({ data: null, error: e.message }),
    );
    return () => {
      live = false;
    };
  }, [path]);
  return state;
}

export function useText(path: string | null): string | null {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let live = true;
    fetch(path)
      .then((r) => (r.ok ? r.text() : null))
      .then((t) => live && setText(t));
    return () => {
      live = false;
    };
  }, [path]);
  return text;
}

/** fixed decimals, or an en dash for an absent value (never 0) */
export function fmt(v: number | null | undefined, digits = 2): string {
  return v == null || Number.isNaN(v) ? "–" : v.toFixed(digits);
}

/** 25 s, 1.4 min, 3.2 h, 1.0 d */
export function fmtTime(s: number): string {
  if (s < 90) return `${Math.round(s)} s`;
  if (s < 5400) return `${(s / 60).toFixed(1)} min`;
  if (s < 172800) return `${(s / 3600).toFixed(1)} h`;
  return `${(s / 86400).toFixed(1)} d`;
}

export const METRIC_LABELS: Record<string, { label: string; hint: string }> = {
  dg_max: { label: "ΔG max", hint: "Most stable site in the sorted mHDX landscape" },
  dg_median: { label: "ΔG median", hint: "Median of the sorted mHDX landscape" },
  cooperativity: { label: "Cooperativity", hint: "Global cooperativity score from the mHDX fit (Ferrari et al.)" },
  cooperativity_normalized: { label: "Cooperativity (norm.)", hint: "Cooperativity normalized against designs of similar size" },
  fit_rmse: { label: "Fit RMSE", hint: "Isotope-distribution fit error, all timepoints" },
  fit_rmse_max: { label: "Fit RMSE max", hint: "Worst single-timepoint fit error" },
  idotp_max: { label: "idotp", hint: "Isotope-pattern match to the expected peptide (1 = perfect)" },
  backexchange_final: { label: "Back-exchange", hint: "Fraction of label lost at the final timepoint" },
  n_exchangeable: { label: "Exchangeable sites", hint: "Backbone amides that can exchange" },
  n_protected: { label: "Protected sites", hint: "Sites with measurable protection" },
  landscape_rmsd_top_k: { label: "Landscape RMSD", hint: "mHDX vs HDX-NMR, top-k sorted ΔG (computed here)" },
  dg_max_difference: { label: "ΔG max difference", hint: "mHDX minus HDX-NMR most stable site (computed here)" },
};
