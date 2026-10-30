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

/** label and hint for a metric key, including the generated peptide-level keys */
export function metricLabel(key: string): { label: string; hint: string } {
  const known = METRIC_LABELS[key];
  if (known) return known;
  let m = key.match(/^repro_median_sd_(.+)$/);
  if (m) return { label: `Replicate SD, ${m[1]} (median)`, hint: "Median standard deviation over replicates, per peptide and time (L1)" };
  m = key.match(/^(\w+)_vs_(\w+):(.+)$/);
  if (m) return { label: `${m[1]} vs ${m[2]}: ${m[3]}`, hint: "Peptides in this class under the hybrid significance test (L2, computed here)" };
  return { label: key, hint: "" };
}

/** intact-protein mHDX-MS metrics, copied from Dataset_3 */
export const METRIC_LABELS: Record<string, { label: string; hint: string }> = {
  dg_max: { label: "ΔG max", hint: "Dataset_3 dg_max; definition not stated. It can differ from the highest value of the sorted site ΔG (free_energy)" },
  dg_median: { label: "ΔG median", hint: "Dataset_3 dg_median; definition not stated. It is not the median of all sorted site ΔG values (free_energy)" },
  cooperativity: { label: "Cooperativity", hint: "Dataset_3 cooperativity_model_global; defined in Ferrari et al." },
  cooperativity_normalized: { label: "Cooperativity (norm.)", hint: "Dataset_3 normalized_cooperativity_model_global; normalization defined in Ferrari et al." },
  fit_rmse: { label: "Fit RMSE", hint: "RMSE of the rate fit to the isotope distributions (rate_fitting_rmse_total)" },
  fit_rmse_max: { label: "Fit RMSE max", hint: "Dataset_3 rate_fitting_rmse_max" },
  idotp_max: { label: "idotp", hint: "Dot product of observed and theoretical isotope patterns (max_idotp; 1 = identical)" },
  backexchange_final: { label: "Back-exchange", hint: "Back-exchange estimate at the final labeling time (backexchange_final_tp)" },
  n_exchangeable: { label: "Exchangeable sites", hint: "Number of exchangeable backbone amides (n_exch_res)" },
  n_protected: { label: "Protected sites", hint: "Dataset_3 n_protected_res; defined in Ferrari et al." },
};
