# Review gate for ERG Viewer Lab

This document records the product, biology, and neurobiology review gate requested for the Lab analysis workflow. The gate must pass before delivery.

## Review scope

Reviewed artifacts:

- Single-file ERG/FVEP waveform viewer
- Lab experiment analysis page
- Synthetic demo dataset generator
- Raw metric and summary Excel exports
- Literature-backed experiment analysis notes

Representative data:

- Existing FERG demo: `Copy of 20250728#1.xlsx`
- Supplied FVEP files: `Abhd11-ckoFVEP_2025-08-12.xls`, `Abhd11-ctrlFVEP_2025-08-12.xls`
- Generated synthetic demos: `docs/examples/demo-*_FERG.xlsx`, `docs/examples/demo-*_FVEP.xls`

## Round 1 review

### Product manager

Decision: changes required.

Findings:

- Lab analysis needs a non-destructive entry point separate from single-file viewing.
- A first-time evaluator needs an immediate way to see a populated analysis page without hunting for files.
- Exported workbooks must keep row-level provenance.
- Controls must remain compact and stable across languages.

Required actions:

- Add `Lab` entry in the top toolbar.
- Add an in-app `Demo` action on the Lab page.
- Include file, patient, cohort, item, group, signal, side, metric, value, unit, and source in raw metric export.
- Keep labels short and stable.

### Biologist

Decision: changes required.

Findings:

- ERG metrics should not collapse a-wave, b-wave, Ops, Flicker, and FVEP into one generic amplitude.
- Biological interpretation needs mode-specific units and retained stimulus/signal labels.
- Synthetic data must encode a plausible control versus impaired phenotype.

Required actions:

- Extract mode-aware FERG metrics: a-wave latency/amplitude, b-wave latency/amplitude, b/a ratio.
- Extract dOps summed OP amplitude.
- Extract Flicker amplitude/phase and recomputed waveform-derived amplitude/phase.
- Generate demo control and cko cohorts with lower cko ERG/FVEP amplitudes.

### Neurobiologist

Decision: changes required.

Findings:

- FVEP should emphasize latency and component-specific amplitudes, not only raw traces.
- P2-derived metrics must not be fabricated if P2 is absent.
- ERG and FVEP should be in one experiment table to support retina versus visual pathway interpretation.

Required actions:

- Parse labeled N1/P1/N2/P2 marks.
- Compute P1-N1, P1-N2, and P2-N2 only when the corresponding components exist.
- Preserve mode and source columns for multimodal interpretation.

## Implemented changes after Round 1

- Added Lab page entry and page-level actions.
- Added in-app synthetic demo loading.
- Added `scripts/gen-demo-data.js` for reproducible Excel demo generation.
- Added 12 anonymous demo Excel files under `docs/examples/`.
- Added mode-specific metric extraction for FERG, dOps, Flicker, and FVEP.
- Added raw metrics and summary workbook exports.
- Added literature-backed design notes in `docs/EXPERIMENT_ANALYSIS.md`.

## Round 2 review

### Product manager

Decision: pass.

Evidence:

- Lab entry is visible and separate from Load/About/Theme/Exit.
- Demo workflow exists without touching real files.
- Export schema is auditable and supports downstream analysis.
- Existing single-file viewer remains intact.

### Biologist

Decision: pass.

Evidence:

- FERG a-wave/b-wave, dOps, Flicker, and FVEP metrics are mode-specific.
- Units are exported per metric.
- Synthetic data includes control and cko cohorts with interpretable amplitude differences.
- Raw records retain patient, item, date, signal, side, group, and source.

### Neurobiologist

Decision: pass.

Evidence:

- FVEP N/P component labels are parsed by label rather than numeric order.
- Missing components are omitted rather than inferred.
- ERG and FVEP outputs share a common metrics table, supporting combined retinal and visual pathway assessment.

## Final gate decision

Status: pass.

Remaining recommendations for future versions:

- Add explicit metadata editor for cohort, genotype, age, treatment, and time point.
- Add dot plots with mean/SEM and individual subject overlays.
- Add statistical tests only after metadata is explicit enough to choose paired/unpaired and repeated-measures designs safely.
- Add publication figure export for selected Lab panels.
