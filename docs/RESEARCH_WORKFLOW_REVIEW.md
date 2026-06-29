# Research workflow review

Date: 2026-06-25

## Goal

Use the built-in demo data as a complete publishable-style ERG/FVEP analysis rehearsal, then identify the smallest changes required for real research use.

## Reference workflow requirements

The workflow follows standard visual electrophysiology reporting patterns:

- ERG endpoints must remain mode and stimulus aware, especially dark-adapted rod/max, oscillatory potentials, light-adapted cone, and flicker.
- FERG reporting needs a-wave and b-wave latency/amplitude plus b/a ratio where available.
- dOps needs summed OP amplitude.
- Flicker needs machine amplitude/phase and recomputed Fourier amplitude/phase from waveform data.
- FVEP needs N1/P1/N2/P2 latency/amplitude and paired peak-to-peak amplitudes.
- Group results need raw sample values, cohort summaries, statistical tests, and figure source data export.

Primary figure benchmark: `docs/LITERATURE_FIGURE_BENCHMARK.md`.

Reference anchors used for this review:

- ISCEV full-field ERG standard 2022.
- ISCEV clinical VEP standard 2025.
- Common mouse ERG practice: scotopic and photopic amplitudes/implicit times, OPs, and flicker endpoints.
- Nature Communications and Cell Reports retina papers using ERG/VEP traces, stimulus-response curves, source data sheets, and condition-aware statistics.

## Demo analysis rehearsal

Publication-style demo design:

- cohorts: `control` and `cko`
- sample size: `n = 8` per cohort
- assays: FERG and FVEP
- eye handling: left and right eyes retained as separate observations
- FERG modes: `dRod`, `dMax`, `dOps`, `lCone`, `Flicker`
- FVEP groups: two flash conditions per sample
- expected biological pattern: cko has lower ERG/FVEP amplitudes with realistic within-group variance

## Issues found

1. Demo sample size was too small.
   - Previous state: three animals per cohort.
   - Problem: useful for UI demonstration, but weak for a manuscript-style grouped analysis rehearsal.
   - Fix: built-in demo and generator now use eight animals per cohort.

2. Project export did not include a direct cohort summary sheet.
   - Previous state: raw/corrected metrics and stats were exported, but summary rows were not first-class.
   - Problem: manuscript figure preparation needs mean, SD, SEM, n, group, mode, condition, eye, metric, and unit in one table.
   - Fix: project export now includes `cohort_summary`.

3. Project export figure source was screen-state dependent.
   - Previous state: `figure_source` used only the currently selected metric rows.
   - Problem: a full project export should preserve all figure-ready source values.
   - Fix: project export now writes all metrics to `figure_source`; metric/summary exports can still use the active selection.

4. Analysis plot treated each stimulus condition as a separate metric.
   - Previous state: metric selection included the stimulus condition.
   - Problem: Nature/Cell-style ERG figures commonly plot amplitude versus stimulus intensity for a single endpoint.
   - Fix: analysis metric selection now uses endpoint families; when multiple stimulus conditions exist, the plot becomes a condition-response curve with group mean and SEM.

5. Statistics could pool across stimulus conditions.
   - Previous state: grouped statistics were run on whatever rows were selected.
   - Problem: pooling different stimulus intensities into one test is biologically and statistically invalid.
   - Fix: multi-condition selections are marked `condition-stratified`; the table reports group-by-condition descriptive summaries instead of a pooled inferential p value.

## Still intentionally not added

- Mixed-effects or repeated-measures models.
  - Reason: the current project metadata does not yet encode subject-level repeated-measure structure, age, treatment, time point, or litter.
  - Add when metadata columns and design matrix validation exist.

- Automatic manuscript figure panel composer.
  - Reason: the current plotting layer supports analysis plots, but paper-panel layout should not be hard-coded before export requirements are stable.
  - Add when SVG/PDF plot export per analysis panel is stable.

- Automatic outlier exclusion.
  - Reason: this is a scientific decision and must be explicit/auditable.
  - Add only with an exclusion log and visible per-sample QC flags.
