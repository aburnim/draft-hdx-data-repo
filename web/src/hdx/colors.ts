// Scientific color scales. Ramps are hetstar's (components/compare/metrics.ts), so a
// reader moving between the two viewers reads colors the same way.

/** hetstar SEQUENTIAL_RAMP: light (low) to deep red (high). Used for ΔG and protection. */
export const STABILITY_RAMP = [0xf0f0f0, 0xfdae61, 0xd7191c];
/** hetstar DIVERGING_BWR: blue (protected, 0) to red (exchanged, 1). HDX convention. */
export const DEUTERATION_RAMP = [0x2166ac, 0xf7f7f7, 0xb2182b];
/** hetstar's missing-value grey (density.ts METRIC_MISSING_COLOR). */
export const MISSING_COLOR = 0xcfd8dc;

/** CSS gradient of a ramp, for legends */
export function rampGradient(stops: number[]): string {
  const css = stops.map((c, i) => `#${c.toString(16).padStart(6, "0")} ${(100 * i) / (stops.length - 1)}%`);
  return `linear-gradient(to right, ${css.join(", ")})`;
}
