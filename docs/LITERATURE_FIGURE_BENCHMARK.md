# Literature figure benchmark for ERG/FVEP analysis

Date: 2026-06-25

Purpose: ground ERG Viewer analysis features in real high-quality journal figures and source data, not in speculative UI design.

## Primary benchmark papers

### Nature Communications: RPE65 base editing, cone ERG and VEP

Paper: `In vivo base editing rescues cone photoreceptors in a mouse model of early-onset inherited retinal degeneration`, Nature Communications, 2022.

Observed figure pattern:

- Fig. 3D/E shows representative photopic ERG waveforms and quantified b-wave amplitudes across multiple green or UV light intensities.
- Data are grouped by treatment, with `n = 8` per group for ERG.
- Fig. 4 shows representative VEP traces, population average VEP traces with SEM shading, VEP amplitude, and VEP latency.
- VEP source data are organized as columns by group, with N count and raw values underneath.

Software implications:

- ERG analysis must support stimulus-intensity response curves, not only one condition at a time.
- FVEP/VEP analysis must support waveform overlays, population average traces, amplitude, latency, and group-level source values.
- Export must include raw values and not only summary statistics.

### Nature Communications: rd10 AAV base editing, scotopic ERG dose-response

Paper: `AAV-mediated base-editing therapy ameliorates the disease phenotypes in a mouse model of retinitis pigmentosa`, Nature Communications, 2023.

Observed figure pattern:

- Fig. 5 shows representative scotopic ERG traces and quantified a-wave and b-wave amplitudes across light intensities from `-2` to `1.0 log cd s m-2`.
- Groups are WT, disease control, non-targeting control, and treated.
- Statistical reporting uses two-way ANOVA with multiple comparisons by intensity.
- Source data preserve individual eyes for each intensity and group.

Software implications:

- The metric selector must be able to select `mode + eye + endpoint` while leaving stimulus intensity as the x-axis.
- Statistical output must be condition-aware; pooling across stimulus intensities is not acceptable.
- Export should preserve `group`, `condition`, `sample/eye`, `metric`, and `value` in long format.

### Nature Communications: PRPF31 CRISPR model, scotopic/photopic/c-wave ERG

Paper: `Gene augmentation prevents retinal degeneration in a CRISPR/Cas9-based mouse model of PRPF31 retinitis pigmentosa`, Nature Communications, 2022.

Observed figure pattern:

- Fig. 4 reports scotopic and photopic a-wave/b-wave amplitudes across a wide range of stimulus intensities.
- Representative scotopic and photopic traces are shown at a fixed flash intensity.
- c-wave amplitude and implicit time are analyzed separately with a much longer time base.
- Source data sheets use one block per endpoint, where rows are stimulus intensities and columns are biological samples nested under group labels.

Software implications:

- The software needs long-format export and an internal way to reshape source data into intensity-response plots.
- c-wave support is separate from FERG a/b wave support because time scale and endpoint logic differ.
- Representative trace selection and cohort summary are both needed.

### Nature Communications: rhodopsin mutant models, response curves and fitted parameters

Paper: `Aggregation of rhodopsin mutants in mouse models of autosomal dominant retinitis pigmentosa`, Nature Communications, 2024.

Observed figure pattern:

- Fig. 4G-I plots scotopic a-wave, scotopic b-wave, and photopic b-wave amplitudes across increasing light intensity.
- Mean ± SEM is plotted, with model fitting to dose-response functions.
- The paper interprets fitted parameters such as maximum response amplitude and intensity generating half-maximal response.

Software implications:

- A later version should support fitted intensity-response parameters such as `Rmax` and half-max intensity.
- The current minimum requirement is curve plotting grouped by genotype/treatment.

### Nature Communications: proteasome activity in inherited retinal degeneration

Paper: `Increased proteasomal activity supports photoreceptor survival in inherited retinal degeneration`, Nature Communications, 2018.

Observed figure pattern:

- Fig. 5 plots ERG a-wave and b-wave response amplitudes over light intensity at different ages.
- Representative ERG traces are shown beside response curves.
- Curves are fit with hyperbolic functions; error bars are SEM.

Software implications:

- Publication-grade output should combine trace panels with response-curve panels.
- Time point or age must be explicit metadata before repeated-measure/time-course statistics are added.

### Cell Reports: mature retina compensation after partial rod loss

Paper: `Mature Retina Compensates Functionally for Partial Loss of Rod Photoreceptors`, Cell Reports, 2020.

Observed figure pattern:

- Uses dark-adapted ERG a-wave and b-wave amplitudes.
- Interprets b/a relationship as functional compensation across retinal circuitry.

Software implications:

- b/a ratio is biologically meaningful and should remain first-class.
- a-wave and b-wave should be analyzed separately and also jointly when needed.

### Cell Reports: partial cone loss and circuit remodeling

Paper: `Partial Cone Loss Triggers Synapse-Specific Remodeling and Spatial Receptive Field Rearrangements in a Mature Retinal Circuit`, Cell Reports, 2019.

Observed figure pattern:

- ERG is used as a functional control while circuit-level readouts are analyzed separately.
- Dark-adapted and photopic contexts are distinguished.

Software implications:

- ERG Viewer should not collapse all conditions into one generic metric table; adaptation state and stimulus condition are part of interpretation.

### Cell Reports: aerobic glycolysis and rod function

Paper: `Aerobic Glycolysis Is Essential for Normal Rod Function and Controls Secondary Cone Death in Retinitis Pigmentosa`, Cell Reports, 2018.

Observed figure pattern:

- Scotopic ERG representative traces and a-/b-wave quantification are used to link metabolism to rod function.

Software implications:

- Export and plot panels need to preserve raw per-eye/per-sample amplitudes, not only cohort means.

### Science Translational Medicine: diabetic retina RBP3 study

Paper: `Retinol binding protein 3 is increased in the retina of patients with diabetes resistant to diabetic retinopathy`, Science Translational Medicine, 2019.

Observed figure pattern:

- ERG endpoints include A-wave, B-wave, and OP3 wave amplitudes alongside OCT/structure.

Software implications:

- OP subcomponent support is scientifically relevant; current summed OP amplitude is a minimum, not the final endpoint set.

## Immediate software requirements derived from the benchmark

1. Add condition-aware response-curve plotting for ERG and FVEP metrics.
2. Keep representative waveform preview for single samples.
3. Export long-format source data with `sample`, `group`, `mode`, `condition`, `eye`, `metric`, `value`, `unit`, and `version`.
4. Avoid statistical tests that pool across stimulus intensity.
5. Keep b/a ratio, OP summed amplitude, Flicker amplitude/phase, and FVEP N/P peak metrics as first-class endpoints.
6. Future: add dose-response fitting such as `Rmax` and half-max intensity once curve mode is stable.

## Publication report presets

These presets define what the software should try to assemble for a paper-style report. A panel may be marked
`blocked` when the imported files do not contain the needed endpoint; blocked panels are useful because they tell
the user which measurement is missing instead of silently omitting a biologically important readout.

## Expected manuscript figure contracts

Updated: 2026-06-28

These contracts define the minimum panel logic the application should support for a graduate student preparing
ERG/FVEP data for a retina or visual neuroscience manuscript. They are grounded in ISCEV standards and high-impact
retina papers that combine raw waveforms, cohort summaries, condition-aware statistics, and source-data tables.

### FVEP/VEP manuscript figure

Primary scientific question: is the post-retinal visual pathway response present, stronger or weaker, and delayed
or normalized relative to controls?

Recommended default: 4 main panels plus source-data appendix.

1. `Representative FVEP traces`
   - Show one biologically representative trace per cohort under one selected flash or pattern condition.
   - Overlay manual N/P picks, usually N1/P1/N2 for rodent flash VEP or N75/P100/N145 for clinical pattern VEP.
   - X axis: time after stimulus onset in ms. Y axis: potential in uV.
2. `Cohort average waveform`
   - Show mean trace with SEM shading for each cohort, only within the same stimulus condition.
   - Include n for animals/eyes/recording sites, depending on project design.
   - Do not average across different flash strengths, pattern sizes, or stimulation paradigms.
3. `Amplitude quantification`
   - Rodent flash FVEP: P1-N1, P1-N2, peak-to-baseline, or project-defined peak-to-peak amplitude.
   - Pattern VEP: typically P100 amplitude from the preceding negative peak when relevant.
   - Display raw points plus mean/SEM for a single condition, or a condition-response curve when multiple
     compatible stimulus levels are present.
4. `Latency quantification`
   - Rodent flash FVEP: N1, P1, N2/P2 peak time or maximum-response latency.
   - Pattern VEP: P100 is the central timing endpoint; N75/N145 provide context.
   - Use raw points plus mean/SEM and report exact statistical comparison.
5. `Source data and QC appendix`
   - Long-format rows: subject, cohort, eye/channel/site, stimulus condition, included state, metric layer,
     amplitude endpoint, latency endpoint, value, unit, manual-pick provenance, rejection/QC state.

Optional FVEP panels when the data support them:

- stimulus-response curve for flash luminance or spatial frequency
- odd/even or replicate-average reproducibility display
- raster/spike histogram only for invasive V1 recordings, not routine FVEP

### ERG manuscript figure

Primary scientific question: which retinal circuit component is affected, under which adaptation/protocol family,
and over what stimulus range?

Recommended default: 5 to 7 main panels plus source-data appendix.

1. `Representative ERG traces`
   - Show per-cohort traces for the selected protocol family and stimulus condition.
   - Overlay manual picks for a-wave trough, b-wave peak, OP peaks/valleys, flicker peak/phase when available.
   - Never mix DA rod, DA max, OP, LA cone, and flicker traces in one continuous response curve.
2. `a-wave response curve`
   - Plot a-wave amplitude versus stimulus strength for compatible dark- or light-adapted conditions.
   - Biological role: photoreceptor-dominant readout.
   - Use mean with SEM and raw points when space allows.
3. `b-wave response curve`
   - Plot b-wave amplitude versus stimulus strength within one protocol family.
   - Biological role: bipolar/Muller-cell downstream readout.
   - Do not pool stimulus intensities for a single p value.
4. `b/a ratio or implicit-time panel`
   - b/a ratio is useful for separating photoreceptor and post-receptoral defects.
   - If ratio is unavailable, show a- and b-wave implicit times/peak times.
5. `OP panel`
   - At minimum show summed OP amplitude for dOps/OP recordings.
   - Preferred future state: OP1-OP4 peak and trough metrics, each with manual-pick provenance.
6. `Flicker panel`
   - Show 30-Hz or project-specific flicker amplitude and implicit time/phase.
   - If multiple temporal frequencies exist, use a frequency-response curve.
7. `Source data and QC appendix`
   - Long-format rows: subject, cohort, eye, adaptation state, protocol family, stimulus value/unit,
     condition label, metric endpoint, value, unit, included state, manual-pick provenance, QC/rejection state.

Optional ERG panels when the data support them:

- fitted response parameters such as Rmax and half-maximal stimulus strength
- c-wave/RPE response with a separate long time axis
- photopic color-specific cone curves, S-cone/M-cone split, or PhNR when recorded

### FVEP/VEP preset

High-level question: does visual cortex response recover, and is the response amplitude and timing normal?

Default panel set:

1. `Representative FVEP traces`
   - One or more per-cohort traces from the selected condition.
   - Axes: time in ms, amplitude in uV.
   - Expected annotations: N1, P1, N2 or the chosen N/P amplitude definition.
2. `FVEP average waveform`
   - Cohort mean trace with SEM shading for one selected stimulus condition.
   - This panel is blocked when multiple stimulus conditions are selected because averaging across stimulus
     conditions is scientifically ambiguous.
3. `FVEP amplitude quantification`
   - P1-N1, P1-N2, or the project-selected amplitude endpoint.
   - Single condition: raw points plus mean and SEM by cohort.
   - Multiple conditions: condition-response curve by cohort.
4. `FVEP latency quantification`
   - N1, P1, or N2 implicit time.
   - Raw points plus mean and SEM by cohort.
5. `Source data and inclusion appendix`
   - Long-format source rows with inclusion state and manual/corrected provenance.

Minimum data fields:

- `subject_id`, `cohort`, `condition`, `included`
- trace arrays for right/left or recording site
- N/P manual points when available
- amplitude endpoint and latency endpoint
- metric layer: raw, manual, or corrected

### ERG preset

High-level question: which retinal circuit layer is affected, across what stimulus range, and is the effect present
in rod, cone, OP, or flicker pathways?

Default panel set:

1. `Representative ERG traces`
   - Per-cohort traces for selected protocol and condition.
   - Expected annotations: a-wave trough, b-wave peak, OP peaks/valleys where applicable.
2. `a-wave response curve`
   - a-wave amplitude across stimulus intensity.
   - Used as a photoreceptor-dominant readout.
3. `b-wave response curve`
   - b-wave amplitude across stimulus intensity.
   - Used as a bipolar/Muller-cell downstream readout.
4. `b/a ratio or implicit-time summary`
   - b/a ratio when available, otherwise a- and b-wave latency/implicit time.
   - Helps separate photoreceptor and post-receptoral effects.
5. `OP/dOps amplitude summary`
   - summed OP amplitude at minimum; later versions should expose OP1-OP4 peaks/valleys.
6. `Flicker ERG summary`
   - fixed-frequency flicker amplitude/phase or a frequency-response curve when multiple frequencies are present.
7. `Source data and inclusion appendix`
   - Long-format source rows with inclusion state and manual/corrected provenance.

Optional future panels:

- photopic cone-specific response curve split by stimulus color
- c-wave/RPE panel with a separate long time base
- dose-response fitted parameters such as `Rmax` and half-max intensity

Minimum data fields:

- `subject_id`, `cohort`, `mode`, `condition`, `included`
- trace arrays for right/left eye
- a-wave, b-wave, OP, flicker, and latency endpoints where applicable
- stimulus intensity parsed from condition or preserved as the raw condition label
- metric layer: raw, manual, or corrected
