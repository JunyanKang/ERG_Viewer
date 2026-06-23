# Experiment analysis design notes

## Scope

ERG Viewer now includes a first-pass Lab page for batch electrophysiology analysis. The goal is to turn OPTOPROBE exports into experiment-level metrics while keeping the original single-file waveform workflow intact.

The initial implementation supports:

- multi-file Excel import
- automatic cohort inference from file/patient names such as `ctrl`, `control`, `cko`, `ko`, `mutant`
- FERG a-wave and b-wave latency/amplitude extraction
- b/a amplitude ratio
- dOps summed OP amplitude extraction
- Flicker machine amplitude/phase plus recomputed Fourier amplitude/phase
- FVEP N1/P1/N2/P2 latency and amplitude extraction when present
- FVEP P1-N1, P1-N2 and P2-N2 peak-to-peak amplitudes when the relevant labeled peaks are present
- cohort summary as mean, SD and SEM
- raw metric and summary Excel export
- in-app synthetic demo loading
- reproducible synthetic OPTOPROBE-style Excel generation with `cnpm run gen:demo`

## Literature-derived display patterns

The current design is based on a survey of common ERG/FVEP presentation patterns in standards, retina disease papers, and visual electrophysiology reviews.

| Source | Display pattern to support | Software mapping |
| --- | --- | --- |
| ISCEV full-field ERG standard 2022, Doc Ophthalmol, DOI `10.1007/s10633-022-09872-0` | Standardized stimulus conditions, trace labels, amplitude and implicit time reporting | Keep waveform view; export metric table with latency/amplitude/unit/source |
| ISCEV clinical VEP standard 2025, Doc Ophthalmol, DOI `10.1007/s10633-025-10042-1` | VEP component labeling, amplitude/latency reporting, pattern/flash distinctions | FVEP labeled N/P peak extraction and cohort summary |
| ISCEV standards index | Standards are versioned; reporting should preserve protocol metadata | Keep file, patient, date, item, group, signal, side in exports |
| rd10 mouse retinal degeneration time-course study, PMC3682084 | ERG traces plus quantified b-wave/a-wave changes over degeneration stage | Raw metrics + grouped summary ready for longitudinal/time-course grouping |
| Combined mouse optoretinography/electroretinography study, PMC12831139 | Overlay trace view plus extracted a-wave/b-wave peak response | Preserve single-file trace viewer and add a/b peak extraction |
| Clinical electrophysiology of optic nerve/RGCs, PMC8377055 | VEP amplitude/latency interpret optic nerve/RGC dysfunction | FVEP latency/amplitude summary and cohort comparison |
| ERG statistical graphics paper, PMC10542250 | Group-level plots and individual response-shape metrics rather than only representative traces | Lab overview, per-metric raw table, cohort summary |
| Frontiers review on b-wave origins, DOI `10.3389/fnmol.2023.1153934` | a-wave and b-wave reflect different retinal sources | Separate a-wave/b-wave latency and amplitude columns |
| ACNS VEP/ERG guideline 9B | ERG can distinguish retinal from central visual pathway causes of VEP abnormalities | Keep ERG/FVEP modes in one experiment table rather than separate silos |
| Webvision ERG clinical applications | Scatter/regression of amplitude and latency against covariates such as age | Future: covariate columns and regression plot panel |
| IOVS work on VEP latency and demyelination | VEP latency and amplitude can reflect different mechanisms | FVEP latency and peak-to-peak amplitude shown separately |
| Mouse pattern ERG pathway paper, PMID `19250935` | Component origins matter; mode-specific extraction is needed | Mode-aware metric extraction rather than one generic parser |
| Mouse VEP optimization paper, DOI `10.1016/j.exer.2022.109011` | N1/P1 amplitude and latency are key mouse VEP endpoints | FVEP N1/P1 metrics and P1-N1 amplitude |
| Flicker blue-light retinal exposure study | Flicker ERG endpoint uses amplitude/phase and condition grouping | Flicker machine and recomputed Fourier metrics |
| Oscillatory potential development literature | OP subcomponents and summed OPs are useful inner-retina metrics | dOps summed OP amplitude and future OP1-OP5 summary |

## Page architecture

Entry point: top toolbar `Lab` button.

Rationale:

- It is short enough for all supported UI languages.
- It is adjacent to data loading but separate from single-file viewing.
- It avoids burying experiment analysis under export controls.

Page modules:

- Overview counters: files, subjects, cohorts, signals, metrics.
- File chips: compact review of loaded samples and inferred cohorts.
- Metric overview: bar-style ranked metrics to quickly spot dominant signals.
- Cohort summary: mean, SEM, SD-ready table for group-level reporting.
- Raw metrics: fully auditable row-level data.
- Export: separate summary and raw metric workbooks.

## Current demo data behavior

Available local data:

- `Copy of 20250728#1.xlsx`: FERG, 19 groups.
- `Abhd11-ckoFVEP_2025-08-12.xls`: FVEP, 2 groups, cohort inferred as `cko`.
- `Abhd11-ctrlFVEP_2025-08-12.xls`: FVEP, 2 groups, cohort inferred as `control`.
- `docs/examples/demo-*_FERG.xlsx`: synthetic FERG demo files generated by `scripts/gen-demo-data.js`.
- `docs/examples/demo-*_FVEP.xls`: synthetic FVEP demo files generated by `scripts/gen-demo-data.js`.

The FVEP files contain labeled machine marks for N1/P1/N2. P2 is not present in the provided marks, so the software records N1/P1/N2 and computes P1-N1 and P1-N2 amplitudes, while leaving P2-derived metrics absent rather than fabricating them.

The synthetic demo set contains three control and three cko animals, each with FERG and FVEP files. The cko cohort has deliberately reduced ERG/FVEP amplitudes so the Lab page can demonstrate group-level differences without using any real subject data.

## Review gate

The Lab workflow is reviewed in `docs/REVIEW_GATE.md` from three perspectives:

- product manager: entry point, user flow, export provenance, language-safe controls
- biologist: mode-specific ERG/FVEP metrics, units, biological interpretability
- neurobiologist: FVEP component handling, retinal versus visual pathway interpretation, missing-component safety

The recorded gate status is pass after a second review round.

## Next experimental upgrades

Recommended next steps:

1. Add explicit group metadata editing for cohort, genotype, age, treatment, eye, date, and stimulus condition.
2. Add dot plot + mean/SEM overlay for selected metrics.
3. Add paired-eye plots and left-right asymmetry indices.
4. Add repeated-measures/time-course mode if multiple dates per subject are loaded.
5. Add statistical tests only after metadata is explicit: Welch t-test, paired t-test, Mann-Whitney, one-way/two-way ANOVA, repeated-measures model.
6. Add publication figure export for selected metric panels as SVG/PDF plus the exact source data workbook.
