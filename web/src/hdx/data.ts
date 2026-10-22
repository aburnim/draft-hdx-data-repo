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

/** label and hint for a peptide-level metric key */
export function metricLabel(key: string): { label: string; hint: string } {
  let m = key.match(/^repro_median_sd_(.+)$/);
  if (m) return { label: `Replicate SD, ${m[1]} (median)`, hint: "Median standard deviation over replicates, per peptide and time (L1)" };
  m = key.match(/^(\w+)_vs_(\w+):(.+)$/);
  if (m) return { label: `${m[1]} vs ${m[2]}: ${m[3]}`, hint: "Peptides in this class under the hybrid significance test (L2, computed here)" };
  return { label: key, hint: "" };
}
