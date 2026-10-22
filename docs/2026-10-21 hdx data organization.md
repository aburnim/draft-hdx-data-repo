# HDX data organization

|  |  |
|------------------------------------|------------------------------------|
| Document version | 1.0 |
| Date | 2026-10-21 |
| Describes | `schema/hdx_entry.v0.2.json` and `schema/hdx_view.v0.2.json` (0.2.0) |
| Repository state | branch `feature/eehee-prototype`, commit `743422c` |
| Status | Draft |
| Contact | Andy Burnim, Astera Institute (Prism) |
| Companion | `2026-10-21 hdx metadata dictionary.md` (field definitions) |

## 1. Scope

This document describes how the Prism HDX prototype organizes hydrogen-deuterium exchange (HDX) data. It covers three measurement types, what each produces at each processing level, and which metrics compare the resulting interpretations. Section 2 gives the measurement principle for readers outside the field. Sections 3 to 5 describe the data. Section 6 lists assumptions and limitations.

## 3. Record structure

Field names follow Dynamic PDB schema v0.2.0. HDX additions are listed per record in `extensions`.

| Object | Meaning here | Example |
|------------------------|------------------------|------------------------|
| Entry | One experimental context with one method. ID `hdx_` plus 8 base-36 characters. | `hdx_j0nfaf94`: ecDHFR, peptide-level HDX-MS |
| Polymer entity | One construct: sequence, organism, mutations | His-tag + TEV site + ecDHFR, 174 residues |
| Sample | One state and its labeling conditions, with replicate IDs (`hdx.samples`) | APO, MTX, TMP |
| Artifact | One file, with level, format, URI, SHA-256 and license | `ecDHFR_2026-02-17_APO.hxms` |
| Run | One processing step, with inputs, outputs, software and parameters | FD normalization |
| Model | One interpretation, at L2. An atomic model is one case; a ΔG profile or a set of differential classes is another. | `hdx_j0nfaf94_m_001` |
| View | A derived record that groups entries sharing a sequence (the Explore tab) | `view_8ske`, `view_ecdhfr` |
| Derivation | Provenance of one displayed value: inputs, run chain, operation, code, tier (`copied` or `computed here`) | in each view |

### Processing levels

| Level | Content |
|------------------------------------|------------------------------------|
| L0 | Raw instrument files. Cited in PRIDE, not copied. |
| L1a | Peptide identification, with evidence and curation (peptide data only) |
| L1b | Uptake per state, time, replicate and peptide, with charge states merged |
| L1c | Fully deuterated (FD) controls, or the method used instead |
| L1d | Corrected uptake. Each correction is a separate run, and uncorrected values are kept. |
| L2 | Interpretations: ΔG profiles, per-residue ΔG, differential classes, residue projection |
| L3 | Mapping to structural models, and comparisons between interpretations |

Missing values are stored as `null`, never 0. Examples are prolines, unassigned residues, and peptides with no data at a time point.

## 4. Measurement types

The prototype holds 19 entries: - 5 de novo miniproteins, each with an mHDX-MS entry, an HDX-NMR entry and a reference structure; - 1 peptide-level HDX-MS entry for ecDHFR; - 3 ecDHFR structures.

### 4.1 Intact-protein mHDX-MS (Ferrari et al. 2026)

1.  **Labeling.** Pooled libraries of miniproteins (Dataset_3 `library`, e.g. `mutants04`) are labeled in D₂O. The series run at pH 6 and pH 9. For EEHEE_rd4_0642 at pH 6, there are 32 time points from 0 to 87,538 s.
2.  **Quench and measurement.** Each time point is analyzed by LC-MS of intact proteins. The entry does not record instrument details; see the source publication.
3.  **Analysis.** Isotope distributions are extracted per protein and time point. They are fit to obtain a set of exchange rates that is not assigned to residues. The result is reported as ΔG values sorted by magnitude (the sorted site ΔG).

| Level | Artifact | Location |
|------------------------|------------------------|------------------------|
| L0 | `.mzML.gz`, one per time point and pH | PRIDE PXD061702. No checksums are listed. |
| L1 | `Dataset_3_MeasurablyStable.json` (isotope distributions, fits, QC fields) | Zenodo 10.5281/zenodo.14983481 |
| L2 | Sorted ΔG profile and summary metrics | copied from Dataset_3 |

Two Dataset_3 rows merge pH 6 and pH 9 series. The site plots these as separate series.

### 4.2 HDX-NMR (Ferrari et al. 2026)

1.  **Labeling and measurement.** The protein is transferred into D₂O. Amide signals are recorded over time. The entry does not record the spectrum type; see the source publication.
2.  **Analysis.** Decay of the amide signal gives k_obs per assigned residue. ΔG is computed from k_obs and k_int.

| Level | Artifact | Location |
|------------------------|------------------------|------------------------|
| L0 | Spectra | Not located ("raw input not found") |
| L1 / L2 | `Dataset_4_HDXNMR.json`: per residue `obs_rates`, `intrinsic_rates`, `free_energy_nc_corrected`, `too_slow_array` | Zenodo 10.5281/zenodo.14983481 |

- **Measurements, not replicates.** Each Dataset_4 row is one measurement under stated conditions (e.g. pH 6.3, 293 K, MES). Some per-construct mean rows average measurements at different temperature or pH. These are labeled "mean of N measurements", with `mean_of_rows`, and conditions that differ are shown as "mixed".
- **Residue numbering.** Residues are mapped to the PDB numbering by exact containment of the construct sequence.
- **Computed here:** log₁₀ PF = log₁₀(k_int / k_obs).

### 4.3 Peptide-level HDX-MS (ecDHFR; Lu et al. 2026, Weber et al. 2026)

1.  **Labeling.** Three states: apo, methotrexate (MTX) and trimethoprim (TMP, CCD `TOP`).

    - Conditions: pH(read) 7.0, 293.15 K, 90% D₂O. The buffer is not recorded in the entry.
    - Labeling times run from 0 to 54,073 s.
    - Replicates are acquired on several days.
    - FD controls are recorded as TIME = inf.

2.  **Quench, digestion and measurement.** The samples are quenched and digested with pepsin, then analyzed by LC-MS. The raw format is Bruker `.d`.

3.  **Identification (L1a).** Peptides are identified from MS/MS (`.mgf`) and curated into peptide lists. The map has 314 peptides covering 165 of 174 construct residues.

4.  **Uptake (L1b, L1c).** HXMS files hold per-charge envelopes and uptake. Charge states are merged by an intensity-weighted mean. Labeling times are grouped within 15%.

5.  **Correction (L1d, computed here).** Uptake is normalized to the FD control:

    - D_corr = D / D_FD × N_ex.
    - N_ex = peptide length − 2 − prolines after position 2.

6.  **Differential analysis (L2, computed here).** For APO vs MTX and APO vs TMP, a difference is significant when both conditions hold:

    - a Welch t-test gives p \< 0.01, and
    - \|ΔD\| exceeds the global limit t(1 − α/2, df) × s_pooled × √(2/n) (Hageman & Weis 2019).

    The test uses uncorrected uptake and only replicates present in both states. Peptides are classed as more rigid, more flexible, mixed, no observable difference, or not tested.

7.  **Residue projection (L2, computed here).** A residue takes the classes of the peptides whose exchangeable span covers it. A residue is mixed when significant covering peptides disagree.

| Level | Artifact | Location |
|------------------------|------------------------|------------------------|
| L0 | Bruker `.d` archives per replicate day (FD controls included); `.mgf` MS/MS | PRIDE PXD057539. No checksums are listed. |
| L1a | `new_peps_*.csv`, `*_CLEANED.csv` | PRIDE PXD057539 |
| L1b, L1c | `ecDHFR_2026-02-17_{APO,MTX,TMP}.hxms` | Weber et al. 2026 supplement. License unverified, so not redistributed. |
| L1d, L2 | Corrected uptake; differential classes; residue projection | computed here |

All parameters are in `PARAMS` in `pipeline/build_peptide.py`, and the records store them.

### 4.4 Structures (L3 references)

| Structures | Use |
|------------------------------------|------------------------------------|
| 8SKE, 8SKD, 8SKX, 5UYO, 8SHM | Residue numbering and coloring for the miniproteins |
| 5DFR, 1RG7, 6XG5 | Projection targets for ecDHFR |

- Each construct residue is mapped to `label_seq_id` by sequence alignment, and mismatches are recorded.
- 6XG5 differs from the HDX construct at residue 37 (N vs D).
- 6XG5 contains NADPH. The HDX sample records list no NADPH.
- Structures are references for comparison and numbering, not ground truth.

## 5. Metrics

| Metric | Level | Type | Tier | Definition |
|---------------|---------------|---------------|---------------|---------------|
| `repro_median_sd_{APO,MTX,TMP}` | L1 | Peptide | computed here | Median replicate SD of uptake per state |
| `dg_max`, `dg_median` | L2 | mHDX-MS | copied | Highest and median sorted site ΔG (kcal/mol) |
| `n_protected`, `n_exchangeable` | L2 | mHDX-MS | copied | Sites classed as protected; exchangeable sites |
| `cooperativity`, `cooperativity_normalized` | L2 | mHDX-MS | copied | Cooperativity measure from Dataset_3. The definition is not restated here. |
| `fit_rmse`, `fit_rmse_max` | L2 | mHDX-MS | copied | Residual of the isotope distribution fit |
| `idotp_max` | L2 | mHDX-MS | copied | Isotope dot product, a match to the theoretical isotope pattern |
| `backexchange_final` | L2 | mHDX-MS | copied | Back-exchange estimate used in the fit |
| `APO_vs_{MTX,TMP}:{more rigid,more flexible,mixed}` | L2 | Peptide | computed here | Peptide count per differential class |
| `landscape_rmsd_top_k` | L3 | mHDX-MS vs HDX-NMR | computed here | RMSD between the top k sorted ΔG values of each method, matched by rank, not by residue |
| `dg_max_difference` | L3 | mHDX-MS vs HDX-NMR | computed here | Highest mHDX-MS ΔG minus highest HDX-NMR ΔG |

The structure colorings are also computed here, each with a derivation record: - **Miniproteins:** ΔG, log PF, predicted deuteration at time t, and secondary structure. - **ecDHFR:** differential class, ΔD per amide, and coverage depth.

## 6. Assumptions and limitations

- **EX2 is assumed.** ΔG values assume EX2 kinetics, as reported by the source. The Dataset_3 EX1 flags are not yet shown.
- **The cross-method comparison is exploratory.** mHDX-MS ΔG has no residue assignment, and HDX-NMR covers only assigned residues. The L3 metrics compare distributions by rank. They do not test residue-level correspondence.
- **Residue projection has peptide resolution.** Projected classes and values have the resolution of overlapping peptides, not of single amides.
- **FD normalization.** It assumes the FD control is fully deuterated and back-exchanges like the labeled samples. The differential test uses uncorrected uptake, which is valid if back-exchange does not depend on state.
- **pH(read)** is the glass-electrode reading in D₂O. It is not corrected to pD.
- **Raw files carry no checksums,** because PRIDE lists none. Their identity rests on the PRIDE accession and file name.
- **No structure is scored against HDX data.** No metric predicts protection from a structure, and none compares structures with each other.
- **Fit quality is mHDX-MS only.** No equivalent metric is recorded for the HDX-NMR or peptide entries.

## 7. Unresolved points

- How were Dataset_4 measurements at different temperature or pH combined into one mean ΔG?
- What does the net-charge correction in `free_energy_nc_corrected` do? The uncorrected field (`free_energy_no_nc_correction`) is not yet shown.
- Does `too_slow` mark a ΔG that is a lower bound? The source field does not state this.
- Where are the HDX-NMR spectra deposited?
- The Dataset_3 library `mutants04` is assumed to match the PRIDE files named `mut04`. This is flagged as inferred.

## Version history

| Version | Date       | Changes       |
|---------|------------|---------------|
| 1.0     | 2026-10-21 | First version |