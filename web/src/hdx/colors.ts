// Scientific color scales. Ramps are hetstar's (components/compare/metrics.ts), so a
// reader moving between the two viewers reads colors the same way.

/** hetstar SEQUENTIAL_RAMP: light (low) to deep red (high). Used for ΔG and protection. */
export const STABILITY_RAMP = [0xf0f0f0, 0xfdae61, 0xd7191c];
/** hetstar DIVERGING_BWR: blue (protected, 0) to red (exchanged, 1). HDX convention. */
export const DEUTERATION_RAMP = [0x2166ac, 0xf7f7f7, 0xb2182b];
/** hetstar's missing-value grey (density.ts METRIC_MISSING_COLOR). */
export const MISSING_COLOR = 0xcfd8dc;
/** residues measured but below the ΔG threshold: present, but faded back */
export const FADED_COLOR = 0xf3f4f6;

/** fixed series colors for methods and constructs, shared by plots and lanes */
export const SERIES = {
  mhdx: "#663be4",
  nmr_6xhis_r1: "#e08214",
  nmr_6xhis_r2: "#fdb863",
  nmr_6xhis_mean: "#b35806",
  nmr_nohis_r1: "#1b7837",
} as Record<string, string>;
