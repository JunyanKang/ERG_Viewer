# ERG Viewer Global Workflow Architecture

Date: 2026-06-27

## Goal

ERG Viewer should be rebuilt as a scientific analysis workstation, not as a file viewer with separate tabs. The product must guide a graduate student from raw OPTOPROBE ERG/FVEP Excel files to a reproducible project, validated manual corrections, condition-aware group analysis, and report-ready outputs that a PI can review.

This document supersedes page-local fixes when there is a conflict. The older implementation plan remains useful for execution order, but the workflow logic here is the product architecture.

## Repository Context

Facts inspected:

- Runtime entry is `src-v2/main/main.js`.
- The renderer shell is currently concentrated in `src-v2/renderer/app.js`.
- Testable domain modules exist in `src-v2/renderer/core/`: `project.js`, `metrics.js`, `manual-picks.js`, and `export.js`.
- Current navigation is `Intake / Review / Analysis / Export`; there is no true Report workspace yet.
- Current project model stores source files, acquisition samples, manual correction points, settings, and export workbook rows.
- Current analysis capability is still too close to a source table plus simple summaries. It is not yet a full scientific analysis engine.

Hard constraints:

- Input templates are Excel files under `docs/examples/`, but real usage may import a single file, multiple ERG files, multiple FVEP files, or a mixed ERG/FVEP batch.
- Project save/open is a first-class workflow for reproducibility, not a convenience feature.
- `corrected` means manual point-pick corrected values for a-wave, b-wave, OP peaks/valleys, and FVEP N/P peaks. It does not mean arbitrary amplitude scaling.
- The interface should feel like a compact macOS scientific workstation.
- Visible scrollbars should not be shown.
- The visual system must use no more than four text styles and unified control heights.

## Product Object Model

The app should make these objects explicit. UI components should render these objects, not infer domain meaning from visible rows.

| Object              | Meaning                                                       | Owner                  | Notes                                                                     |
| ------------------- | ------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------- |
| `Project`           | Complete reproducible analysis state                          | `core/project.js`      | Stores sources, records, settings, manual corrections, saved path         |
| `SourceFile`        | One imported workbook                                         | `core/project.js`      | Type is only `ERG` or `FVEP`; path/name is the stable removal key         |
| `AcquisitionRecord` | One reviewable measurement condition                          | `core/project.js`      | Mode can be `FERG`, `dOps`, `Flicker`, `FVEP`, future protocols           |
| `TracePair`         | OD/OS or right/left waveform arrays                           | `core/project.js`      | Raw signal, never edited by UI                                            |
| `MachineMarks`      | Vendor-derived mark text and parsed points                    | `core/metrics.js`      | Raw import evidence                                                       |
| `ManualPickSet`     | User-selected measurement points                              | `core/manual-picks.js` | Auditable correction layer                                                |
| `MetricObservation` | One metric value for one record/layer                         | `core/metrics.js`      | Raw, manual, and corrected layers                                         |
| `AnalysisPlan`      | User-selected scientific comparison                           | new `core/analysis.js` | Defines scope, protocol, condition, metric, layer, grouping, stats policy |
| `AnalysisResult`    | Cohort summaries, source rows, stats, warnings, figure series | new `core/analysis.js` | Single source for Analysis UI and Report/Export                           |
| `ReportPackage`     | Manifest of figures, tables, warnings, provenance, exports    | new `core/report.js`   | Owns readiness and reproducibility checklist                              |

## Screen Architecture

Top-level workflow should become:

```text
Intake -> Review -> Analyze -> Report
```

`Export` should be a command inside Report unless a later product decision keeps the tab label for user familiarity. The key change is conceptual: the final workspace must preview and validate the scientific package before writing files.

### Persistent Shell

The shell is stable across all screens:

- Top toolbar: project title/path state, workflow segmented control, global commands `Import`, `Open`, `Save`, `Report Export`.
- Left rail: project navigator, source files, record list, source-type filter.
- Center workspace: the active scientific task.
- Right inspector: context-specific metadata, QC, correction state, or analysis readiness.
- Bottom region only when scientifically useful: source data, manual correction strip, or report manifest details.

The left rail must not become a second Intake page. It is a navigator and status surface. Full file management lives in Intake.

## Workflow Contract

### 1. Intake

Primary question: did the files become a valid project dataset?

Inputs:

- Excel files selected by the user.
- Existing `.ergproject` files loaded by the user.

Main components:

- Source file ledger: one row per workbook, compact, removable, type badge `ERG/FVEP`, record count, mode summary.
- Acquisition ledger: one row per acquisition record, not one row per arbitrary parser event.
- Dataset composition: ERG file count, FVEP file count, record count, cohort count, included/excluded count.
- QC inbox: import/parser warnings, short trace warnings, missing marks, uncertain mode/cohort inference.
- Study design preview: inferred cohorts and conditions, with obvious unresolved fields.

Controls that must exist:

- Add/import files.
- Remove file.
- Open project.
- Save project.
- Edit cohort for selected records or batch selection.
- Include/exclude records.
- Filter acquisition navigation by `ERG / FVEP` only. Quality state is shown as `Record Quality`;
  it is not a source-type filter.

Controls that must not dominate:

- Large decorative file cards.
- Repeated warnings that are not actionable.
- Nested control containers inside other controls.

Exit criteria:

- Every source file has a type.
- Every acquisition record has subject, cohort, mode, condition, and QC state.
- A wrong file can be removed without restarting.
- The user can save a reproducible project immediately after Intake.

### 2. Review

Primary question: are the waveform and measurement points scientifically valid for this record?

Inputs:

- One selected acquisition record.
- Raw traces, machine marks, manual pick state.

Main components:

- Main waveform canvas: right/left traces, axis titles, tick spacing, no overlapping point labels.
- Measurement target selector: mode-aware targets only.
  - FERG: a-wave and b-wave.
  - dOps: OP1-OP5 peak and valley.
  - FVEP: N1, P1, N2, P2.
  - Flicker: machine amplitude/phase, waveform Fourier amplitude/phase, peak time, and manual trough/peak review.
- Manual correction strip: compact actions for side, target, clear, nudge, and done.
- Metric comparison: raw, manual, corrected values in a compact table.
- Record metadata/QC inspector: subject, cohort, source file, acquisition, include state.
- Correction provenance: count and list of manual points for the selected record.

Controls that must exist:

- Pick mode and side.
- Click-to-pick point on trace.
- Nudge selected point.
- Clear current point.
- Include/exclude record.
- Edit cohort.
- Move to previous/next record.

Controls that must not exist as redundant clutter:

- Duplicated manual point values on top of both the plot and the inspector if they collide with controls.
- Large raw metric panels that consume more area than waveform review.
- Separate values that disagree with exported correction provenance.

Exit criteria:

- Manual corrections are saved into project state.
- Corrected metrics are derived from manual points.
- Reopening the project reproduces all manual picks.

### 3. Analyze

Primary question: what differs between biological groups, under which protocol and condition, using which measurement layer?

Inputs:

- Included acquisition records.
- Metric observations from raw/manual/corrected layers.
- Analysis plan selected by the user.

Main components:

- Analysis design panel: source type, protocol mode, condition, metric, metric layer, cohort grouping, eye policy, stats policy.
- Primary figure: individual values plus cohort summaries, or condition-response curves when multiple stimulus conditions exist.
- Cohort summary table: n, mean, SD, SEM, min, max.
- Statistics panel: selected test, p value, effect size, assumptions, warnings, and invalid-analysis reasons.
- Source data table: every plotted value with sample, subject, cohort, mode, condition, metric, layer, included state.
- Warnings panel: condition pooling blocked, insufficient n, missing corrected points, QC records included, unbalanced groups.

Scientific rules:

- Condition pooling is forbidden by default.
- If multiple conditions are selected, the plot becomes condition-stratified or condition-response; pooled p values are not shown.
- `dOps` and `Flicker` are ERG protocols, not top-level source types.
- Corrected analysis must show whether each corrected metric came from manual points or machine fallback.
- Excluded records stay visible in provenance/export logs but do not enter cohort statistics.
- Inferential tests are optional; invalid tests must be explained rather than hidden.

Minimum first-release analysis engine:

- Descriptive cohort summary for all supported metrics.
- Condition-stratified summaries.
- Individual-value plot and group mean with SEM.
- Welch two-group test only when exactly two cohorts and adequate n are present.
- Descriptive-only fallback with explicit warning when assumptions are not met.

Exit criteria:

- A graduate student can answer: which metric, which protocol, which condition, which cohort difference, which records support it.
- A PI can audit whether the comparison is biologically valid.
- Export/Report uses the same `AnalysisResult`, not a separate recalculation.

### 4. Report

Primary question: can this project produce a defensible figure and source data package?

Inputs:

- Project state.
- Selected `AnalysisResult` objects.
- Correction/QC/exclusion provenance.

Main components:

- Report manifest: figures, source tables, summary tables, stats tables, correction log, QC/exclusion log, source file ledger.
- Readiness panel: scientific blockers and export blockers.
- Figure preview: the current analysis figure and selected representative traces.
- Table preview: source data, cohort summary, statistics.
- Reproducibility section: project schema, app version, source files, import time, settings, metric layer, analysis plan.
- Export commands: workbook, project file, figure image/PDF if implemented.

Readiness blockers:

- Project has never been saved.
- No included records.
- No valid cohort comparison.
- Multiple incompatible conditions selected without stratification.
- Corrected metric requested but required manual points are absent.
- QC-warning records are included without acknowledgement.
- Export sheets are empty or inconsistent with current analysis result.

Exit criteria:

- Workbook output contains enough data to reproduce the displayed analysis.
- A reopened project reproduces report state.
- The app does not let a polished report hide scientific invalidity.

## Module Boundary Plan

| Module                 | Owns                                                           | Public Surface                                                                        | Must Not Own                    |
| ---------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------- |
| `core/project.js`      | project schema, parser contracts, source ledger, normalization | `normalizeProject`, `parseWorkbookToSamples`, `deriveSources`, source removal helpers | Plotting, stats, visual filters |
| `core/manual-picks.js` | manual point storage operations                                | set/get/clear/nudge/count/marker helpers                                              | Metric formulas                 |
| `core/metrics.js`      | raw/manual/corrected metric formulas and metric metadata       | metric registry, derive metric rows, corrected metrics                                | UI selectors, report readiness  |
| `core/analysis.js`     | analysis plans and results                                     | `buildAnalysisPlan`, `runAnalysis`, `validateAnalysisPlan`                            | DOM, Plotly, dialogs            |
| `core/report.js`       | report manifest and readiness                                  | `buildReportPackage`, `validateReportReadiness`                                       | XLSX serialization details      |
| `core/export.js`       | workbook sheet serialization                                   | `buildProjectWorkbookSheets` from project/report models                               | User interaction, file dialogs  |
| `app.js`               | React composition and interaction orchestration                | screen components and state dispatch                                                  | Scientific algorithms           |
| `styles.css`           | visual system                                                  | tokens and reusable component classes                                                 | Data interpretation             |

Dependency direction:

```text
app.js -> project/manual-picks/metrics/analysis/report/export
report.js -> analysis.js -> metrics.js
export.js -> project.js + analysis.js + report.js + metrics.js
core modules -> no Electron, no DOM, no Plotly
main/preload -> native IO bridge only
```

## Component Relationship Map

## Linked State And Scientific Taxonomy Update

Updated: 2026-06-28

The UI must not expose ad hoc category names that do not correspond to a scientific object. A category is allowed
only when a graduate student can explain what experiment, protocol, endpoint, unit, or quality state it represents.

### Linked State Contract

- `Acquisition Records` is a navigator over source type, not an analysis design surface. Its visible filter is
  `ERG / FVEP`; `All` and `QC` are not user-facing filters.
- When `Analysis Design > Source` changes to `ERG` or `FVEP`, the left acquisition navigator must switch to the
  same source type and reset protocol family/condition selectors that no longer apply.
- When `Report Scope` changes to the ERG or FVEP preset, the left acquisition navigator and active analysis source
  must switch to the same source type.
- Metric selectors must be constrained by source type and protocol. ERG screens must not offer FVEP N/P endpoints,
  and FVEP screens must not offer a-wave/b-wave endpoints.
- A compatibility metric such as `amplitudeUv` may exist internally for legacy imports and generic exports, but the
  UI must prefer named endpoints such as `b-wave amplitude (uV)` or `P1-N1 amplitude (uV)`.

### Metric Display Contract

- Every visible metric label must include a unit unless it is a dimensionless ratio.
- Raw values should be labeled as machine-derived measurements.
- Corrected values should be labeled as manual-corrected measurements and must be derived from manual point picks or
  explicitly shown as machine fallback in analysis provenance.
- `Metric Check` is not an acceptable panel title because it does not name a scientific object. Use
  `Measurement Endpoints` for record-level raw/manual endpoint comparison.

### ERG Protocol Classification

- ERG source type contains protocol families such as dark-adapted rod response, dark-adapted combined/max response,
  oscillatory potentials/dOps, light-adapted cone response, and flicker ERG.
- FERG a-wave/b-wave endpoints belong to single-flash ERG traces. a-wave amplitude/implicit time and b-wave
  amplitude/implicit time are separate endpoints; b/a ratio is a derived endpoint.
- OP/dOps endpoints are peak-to-valley oscillatory potential measurements; summed OP amplitude is the current
  minimum supported endpoint, with OP1-OP4/OP5 peak-valley endpoints preserved for manual-pick expansion.
- Flicker ERG is an ERG protocol, not a source type. Its amplitude and timing/phase endpoints should be introduced
  under the ERG taxonomy, not mixed into FVEP.

### FVEP Protocol Classification

- FVEP source type contains flash VEP waveforms and N/P response components.
- FVEP amplitude endpoints should be named peak-to-trough pairs such as `P1-N1 amplitude (uV)`,
  `P1-N2 amplitude (uV)`, or `P2-N2 amplitude (uV)`.
- FVEP timing endpoints should be named `N1 implicit time (ms)`, `P1 implicit time (ms)`,
  `N2 implicit time (ms)`, or `P2 implicit time (ms)`.
- Pattern VEP labels such as N75/P100/N145 should be a separate future protocol variant, not silently mixed with
  flash VEP labels.

### Shared Components

- `ProjectToolbar`: global project state and workflow navigation.
- `ProjectNavigator`: source type filters, source files, record list.
- `SourceFileRow`: compact shared row for sidebar and Intake.
- `AcquisitionRecordRow`: compact record identity and QC state.
- `PanelHeaderAction`: unified right-top panel action/chip/button geometry.
- `DataTable`: shared dense table with hidden scrollbar and ellipsis.
- `StatusChip`: same dimensions for saved/unsaved, included/excluded, QC, xlsx, copy states.
- `MetricValueGrid`: compact numeric comparison, never a large decorative card.
- `ReadinessList`: structured blockers/warnings/ready states.

### Intake Workspace

```text
ProjectNavigator
  SourceFileRow list
  AcquisitionRecordRow list

IntakeCenter
  SourceFileLedger
  AcquisitionLedger
  StudyDesignPreview

IntakeInspector
  DatasetComposition
  QCInbox
  SaveProjectState
```

### Review Workspace

```text
ProjectNavigator
  selected AcquisitionRecordRow

ReviewCenter
  WaveformCanvas
  ManualCorrectionStrip

ReviewInspector
  RecordMetadata
  MetricValueGrid
  CorrectionProvenance
  QCList
```

### Analyze Workspace

```text
AnalysisDesignPanel
  SourceTypeSelector
  ProtocolSelector
  ConditionSelector
  MetricSelector
  LayerSelector
  StatsPolicySelector

AnalysisCenter
  PrimaryFigure
  SourceDataTable

AnalysisInspector
  CohortSummary
  StatisticsPanel
  AnalysisWarnings
```

### Report Workspace

```text
ReportCenter
  ReportManifest
  FigurePreview
  TablePreview

ReportInspector
  ReadinessList
  ReproducibilityMetadata
  ExportActions
```

## Layout Rules

Global rules:

- No page should require the user to understand more than one primary question at a time.
- Every panel needs a reason to exist: input, decision, output, or provenance.
- Controls with the same role must have the same height and visual geometry.
- State differences use color and text, not different control sizes.
- Left-top labels, right-top controls, and body text follow one shared typographic scale.
- Scroll is allowed internally but visible scrollbars are hidden.
- Rows must ellipsize; no text may escape into adjacent regions.

Four text styles:

| Token          | Use                                     | Size | Weight |
| -------------- | --------------------------------------- | ---- | ------ |
| `--text-title` | panel titles and section titles         | 12px | 600    |
| `--text-body`  | buttons, table cells, row names, inputs | 12px | 400    |
| `--text-meta`  | secondary text and status chips         | 11px | 400    |
| `--text-value` | numeric values only                     | 16px | 600    |

Control heights:

- Buttons, selects, inputs: 30px.
- Status chips: 24px.
- Row actions: 24px square.
- Tabs: 30px.
- Panel headers: 38px.

## Multi-Perspective Review Gates

### Graduate Student Gate

Reject the design if:

- They cannot tell whether all files imported.
- They cannot remove a wrong file.
- ERG and FVEP file types are mixed with dOps/Flicker protocol names.
- Manual correction does not clearly show what point is being picked.
- Analysis does not tell which records support the figure.

### Professor / PI Gate

Reject the design if:

- It allows condition pooling without warning.
- It hides n, SD/SEM, source values, exclusions, or QC warnings.
- Corrected metrics do not expose manual point provenance.
- Report output cannot be reproduced from a saved project.
- The UI suggests a scientific conclusion when the test is invalid.

### Product Manager Gate

Reject the design if:

- A screen has no primary job.
- A control exists without a user task.
- The import-review-analysis-report path cannot be tested as one flow.
- Success requires remembering hidden state from another page.
- Export is possible while report readiness has unresolved blockers.

### UI Designer Gate

Reject the design if:

- More than four text styles are used.
- Header controls have inconsistent heights or geometry.
- Cards are nested inside cards for simple rows.
- A list row overflows its container.
- A high-value waveform/analysis area is crowded by low-value controls.

## Implementation Milestones

### Milestone 0: Stabilize Current Tree

Goal: stop accumulating half-finished UI patches.

Acceptance:

- `cnpm run check`, `cnpm run lint`, and `cnpm run test` pass.
- No undefined renderer helpers.
- Current Intake/Review/Analysis/Export still open.
- Current partial source-file removal and typography edits are either completed or explicitly reverted by implementation decision.

### Milestone 1: Domain Model Cleanup

Goal: make file type, acquisition mode, manual correction, and analysis inputs explicit.

Tasks:

- Add stable `SourceFile` helpers.
- Separate source type `ERG/FVEP` from acquisition mode.
- Add tests for mixed file batches, all-ERG batches, all-FVEP batches, and source removal.
- Add metric registry metadata for mode, metric label, unit, and required manual picks.

Acceptance:

- Intake can represent one file, many ERG files, many FVEP files, and mixed batches.
- `dOps` remains analyzable but is not a top-level input category.

### Milestone 2: Intake And Review Rebuild

Goal: make data curation and waveform correction complete.

Tasks:

- Rebuild Intake around source and acquisition ledgers.
- Rebuild Review around waveform-first correction.
- Normalize source rows, status chips, panel actions, and list overflow.
- Add file removal and project save/open reproduction tests.

Acceptance:

- A bad file can be removed.
- A dOps OP point and FVEP N/P point can be manually picked and reproduced after project reopen.
- Source data and manual correction controls do not overlap.

### Milestone 3: Analysis Engine

Goal: replace the Analysis shell with scientific analysis.

Tasks:

- Add `core/analysis.js`.
- Implement `AnalysisPlan` and `AnalysisResult`.
- Implement condition-aware summaries.
- Implement first-release stats policy and warnings.
- Make Analysis UI consume `AnalysisResult`.

Acceptance:

- Analysis can answer cohort differences by source type, protocol, condition, metric, and correction layer.
- Invalid comparisons show explicit reasons.
- Tests cover FERG, dOps, Flicker, FVEP, raw, corrected, included/excluded, and multi-condition cases.

### Milestone 4: Report Workspace

Goal: make final outputs scientifically reviewable before export.

Tasks:

- Add `core/report.js`.
- Convert Export tab into Report workspace or rename tab after decision.
- Add report manifest, readiness, reproducibility metadata, and previews.
- Make workbook export consume report/analysis models.

Acceptance:

- Report page shows figures/tables/provenance/readiness before export.
- Workbook rows match the visible analysis result.
- Project reopen reproduces report state.

### Milestone 5: Visual System Governance

Goal: stop control-by-control drift.

Tasks:

- Enforce four text tokens.
- Enforce global control heights.
- Replace one-off pills/buttons with shared components.
- Audit every screen for overflow, hidden collisions, and panel control alignment.

Acceptance:

- CSS search finds no arbitrary one-off font sizes outside root tokens.
- Header controls and independent buttons use unified geometry.
- Packaged screenshots show no overlap on all workflow pages.

### Milestone 6: End-To-End QA

Goal: prove the product in the real packaged app.

Tasks:

- Build packaged macOS app.
- Use Computer Use to import real/demo Excel templates.
- Test single ERG, multiple ERG, multiple FVEP, and mixed batches.
- Test manual correction, save project, reopen project, analysis, report, workbook export.
- Capture screenshots and notes.

Acceptance:

- One complete xlsx-to-reopened-project-to-export flow is verified.
- Screenshots prove Intake, Review, Analyze, and Report.
- No app process remains running after QA.

## ADRs Required

1. Whether the final tab label is `Report` or remains `Export`.
2. Whether first-release inferential statistics include only Welch two-group tests or also non-parametric tests.
3. Whether eye handling is first release `mean-eye` only or exposes right/left/paired policies.
4. Whether project schema version increments before adding `AnalysisPlan` and `ReportPackage`.
5. Whether full component splitting is done immediately or after `core/analysis.js` and `core/report.js` stabilize.

## Immediate Execution Order

1. Stabilize current tree.
2. Implement domain model cleanup.
3. Rebuild Intake and Review around curation and correction.
4. Add real Analysis engine.
5. Add Report workspace.
6. Apply visual governance globally.
7. Run packaged end-to-end QA.

The implementation must not claim completion after visual cleanup alone. Completion requires scientific analysis, report readiness, reproducible project save/open, and end-to-end packaged verification.
