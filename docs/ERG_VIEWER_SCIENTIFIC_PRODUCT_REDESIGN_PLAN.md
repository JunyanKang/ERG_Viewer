# ERG Viewer Scientific Product Redesign Plan

Date: 2026-06-27

## Context

This plan resets ERG Viewer v2 work around the actual product goal: a macOS-style scientific workstation for ERG/FVEP project analysis, not a collection of loosely patched panels.

Repository facts inspected:

- Runtime entry is `src-v2/main/main.js`, with renderer state and UI in `src-v2/renderer/app.js`.
- Testable domain modules exist under `src-v2/renderer/core/`: `project.js`, `metrics.js`, `manual-picks.js`, and `export.js`.
- `docs/V2_REBUILD_SPEC.md` defines the v2 goal: multi-file ERG/FVEP import, project save/open, manual correction, cohort analysis, and traceable workbook export.
- `docs/EXPERIMENT_ANALYSIS.md` and `docs/RESEARCH_WORKFLOW_REVIEW.md` describe richer scientific analysis features than the current `src-v2` UI actually exposes.
- Current UI evidence from Round 8 and Round 9 shows usable import/review/export shells, but also repeated control inconsistency and layout overflow issues.
- Current worktree is dirty. Some source files and QA artifacts are untracked. Implementation must treat current tree as in-progress, not release-ready.

Unknowns requiring human input:

- Whether the final top-level navigation should name the final step `Export` or `Report`.
- Whether group comparison should initially support only two cohorts or arbitrary cohorts.
- Whether real projects need paired-eye/repeated-measures models in the first deliverable or a later release.

## Product Reframe

The app should be organized around the researcher's real workflow:

1. **Intake**: import ERG/FVEP workbooks, inspect detected files/subjects/cohorts/protocols, remove bad files, inspect QC.
2. **Review**: review single acquisition traces, inspect raw machine picks, manually correct a-wave/b-wave/OP/FVEP points, include/exclude records.
3. **Analysis**: perform real scientific analysis across cohorts, modalities, stimulus conditions, metrics, and correction layers.
4. **Report**: assemble validated outputs: figures, source tables, stats tables, correction provenance, and reproducible project package.

The current `Analysis` page is not sufficient because it mainly shows a source table, simple group bars, and a metric snapshot. The current `Export` page is not sufficient as a report surface because it mainly lists package state and workbook sheets. These are scaffolds, not the scientific analysis/reporting experience described in the project docs.

## Boundary Map

| Module | Owns | Must Not Own | Allowed Dependencies |
| --- | --- | --- | --- |
| `src-v2/renderer/core/project.js` | Project shape, source file summaries, sample normalization, parser output contracts | UI layout, Plotly, clipboard, dialogs | Plain JS, `metrics` for raw metric derivation |
| `src-v2/renderer/core/metrics.js` | Raw/manual/corrected metrics, group summaries, descriptive statistics primitives | UI state, workbook sheet names, renderer controls | Plain JS only |
| `src-v2/renderer/core/analysis.js` **new** | Analysis plans, condition-stratified cohorts, test selection rules, effect sizes, report-ready result objects | DOM, Plotly rendering, file IO | `metrics.js` |
| `src-v2/renderer/core/report.js` **new** | Report package model, figure/table manifest, warnings, export readiness contract | Native save dialogs, visual layout | `analysis.js`, `export.js` |
| `src-v2/renderer/core/export.js` | XLSX sheet generation from project/analysis/report models | UI button state, active screen state | `metrics.js`, `analysis.js` after introduction |
| `src-v2/renderer/app.js` | Screen composition, local UI state, IPC orchestration, user interactions | Scientific calculations beyond selecting parameters | core modules, preload API |
| `src-v2/renderer/styles.css` | UI tokens and component styling | Scientific logic or data interpretation | none |
| `src-v2/main` and `src-v2/preload` | Native dialogs, allowlisted local IO, clipboard bridge | Parsing, analysis, report semantics | Electron only |

Dependency direction:

```text
main/preload -> renderer shell API
app.js -> core/project, core/metrics, core/analysis, core/report, core/export
core/export -> core/analysis -> core/metrics
styles.css -> no JS
core modules -> no DOM, no Electron, no Plotly
```

Forbidden dependency patterns:

- Core modules must not call Electron IPC, DOM APIs, or Plotly.
- `app.js` must not contain statistical algorithms.
- Export generation must not depend on currently visible table rows unless the export is explicitly a "copy current view" action.
- CSS must not introduce one-off font sizes or button heights outside the global token system.

## Data Model Decisions

### File Type Versus Record Mode

The UI must separate:

- **Source file type**: `ERG` or `FVEP`.
- **Acquisition/record mode**: `FERG`, `dOps`, `Flicker`, `FVEP`, and future subprotocols.

Current problem:

- `Acquisition Records` exposes `dOps` as a top-level filter next to `ERG` and `FVEP`, which confuses input type with ERG subprotocol.

Required behavior:

- Top-level sidebar filter: `All`, `ERG`, `FVEP`, `QC`.
- ERG subprotocol filtering belongs inside Analysis as a protocol selector, not the primary source-type filter.
- Source files should display one file-level type badge: `ERG` or `FVEP`.
- Analysis can still group by `mode` and `condition`.

### Source File Removal

Intake must support removing a bad file from the imported project.

Removal contract:

- Input: stable source key, preferably `metadata.sourcePath`, fallback `sourceName`.
- Side effects: remove all samples from that source, recompute `sources`, recompute `correctionLog`, update selected sample, mark project unsaved.
- Failure path: if removing the last file, the project becomes an empty imported project with Intake as the sensible active screen.
- Export impact: removed source records must not appear in samples, metrics, cohort summary, source rows, or correction log.

### Analysis Model

Analysis should produce a first-class object, not ad hoc rows:

```text
AnalysisPlan
- sourceType: All | ERG | FVEP
- protocolMode: FERG | dOps | Flicker | FVEP | All
- condition: All | condition id
- metricKey
- metricVersion: raw | corrected
- grouping: cohort
- eyePolicy: mean-eye | right | left | paired
- testPolicy: auto | descriptive-only | t-test | mann-whitney | anova | kruskal

AnalysisResult
- sourceRows
- cohortSummary rows with n, mean, sd, sem, min, max
- conditionSummary rows
- stats rows with test, p, adjusted p, effect size, assumptions, warnings
- figureSeries for Plotly
- warnings and invalid-analysis reasons
```

Condition pooling must be forbidden by default. If multiple stimulus conditions are selected, the result should either stratify by condition or switch to a condition-response plot.

### Report Model

Report is not just export buttons. It should assemble:

- representative trace panels selected from Review,
- cohort/condition summary plots from Analysis,
- source data table,
- statistics table,
- correction provenance,
- QC/exclusion log,
- reproducibility metadata: app version, schema, source files, settings.

Report readiness must show scientific blockers, not only project file blockers:

- missing project save,
- empty cohort,
- excluded all records,
- pooled incompatible stimulus conditions,
- missing correction points for selected corrected metrics,
- insufficient n for requested statistical test,
- QC warnings still included.

## UI System Rules

### Text System

The app must use no more than four text styles:

| Token | Use | Size | Weight |
| --- | --- | --- | --- |
| `--text-title` | panel title, sidebar section title, major label | 12px | 600 |
| `--text-body` | table cells, row labels, button text, input text | 12px | 400 |
| `--text-meta` | secondary row text, helper text, badges | 11px | 400 |
| `--text-value` | numeric stat values only | 16px | 600 |

Rules:

- No arbitrary `10px`, `10.5px`, `14px`, `15px`, `18px`, or `24px` one-off text sizes.
- Avoid unnecessary bold. Use `600` only for titles, selected row names, and numeric stat values.
- Uppercase labels are allowed only for compact field labels and panel titles, not every micro-control.

### Control System

Global control heights:

- Buttons, selects, inputs: 30px.
- Compact chips/tags: 24px.
- Row actions, including delete: 24px square.
- Tabs: 30px.
- Panel headers: 38px.

Rules:

- Top-right controls inside panel headers must use a shared `.panel-action` or `.chip` class.
- State is shown by color only; size and geometry do not change between states.
- `Copy CSV`, `Included`, `Excluded`, `xlsx`, `saved`, `unsaved`, `clear`, source file count, and record count must be visually coherent.
- Do not use nested card-like controls where a compact row is sufficient.

### List/Overflow Rules

Every list container must have:

- `min-height: 0`,
- explicit grid/flex containment,
- `overflow: hidden` at panel boundary,
- internal `overflow: auto` only where content can exceed available space,
- no visible scrollbar.

Rows must not escape their panel. Every row needs:

- stable min/max height,
- text ellipsis,
- non-wrapping badges,
- fixed-width actions.

Critical list surfaces to audit:

- left sidebar `Import Batch`,
- Intake center `Import Batch`,
- `Acquisition Records`,
- manual pick button grids,
- Source Data table,
- workbook sheet chips,
- readiness list,
- compact metric table,
- QC list.

## Persona Audit

### Graduate Student

Needs:

- fast import of many ERG and FVEP files,
- clear confidence that all files imported correctly,
- simple removal of a wrong file,
- visible distinction between input type and acquisition mode,
- analysis that answers "what is different between control and CKO?".

Current pain:

- middle Import Batch is too bulky and has overflow history,
- no remove file option,
- `dOps` as top-level category is confusing,
- Analysis does not yet guide protocol/metric/statistical choices.

### Professor / PI

Needs:

- scientifically defensible group comparison,
- condition-aware analysis,
- explicit correction provenance,
- clear n, mean, SD/SEM, effect size, and p-value behavior,
- report outputs that can be reviewed without trusting hidden UI state.

Current pain:

- Analysis is not strong enough to evaluate scientific claims,
- Report/Export does not read like a scientific result package,
- condition pooling risk is not visible enough,
- no analysis warnings for invalid comparisons.

### Product Manager

Needs:

- workflow completeness,
- predictable controls,
- clear primary action per screen,
- QA gates tied to user tasks.

Current pain:

- repeated one-off style fixes indicate missing design system governance,
- core workflow has shells where users expect deliverables,
- task success cannot be claimed until import-review-analysis-report is tested as one path.

### UI Designer

Needs:

- limited text styles,
- uniform control sizes,
- consistent panel header right controls,
- compact tables/lists,
- no overflow or hidden collisions.

Current pain:

- more than four font styles exist,
- several buttons/chips/pills share meaning but not geometry,
- Import Batch row designs differ between sidebar and Intake,
- information density is inconsistent with scientific workstation expectations.

## Architecture Options

| Option | Benefits | Costs | Risks | Decision |
| --- | --- | --- | --- | --- |
| Continue patching `app.js` and `styles.css` only | Fast local fixes | Keeps science logic and UI coupled | More regressions, hard to test Analysis/Report | Rejected |
| Add `core/analysis.js` and `core/report.js`, keep React single-file UI for now | Creates testable scientific contracts without large UI framework migration | Requires clear interfaces and tests | Some UI complexity remains in `app.js` | Selected |
| Full component split plus new state manager | Cleaner long-term | Too much surface before scientific model stabilizes | May delay functional Analysis/Report | Deferred |

Selected path:

- First stabilize domain contracts in core modules.
- Then restructure UI around those contracts.
- Then do visual system cleanup globally.
- Finally run packaged Computer Use QA across the full workflow.

## Implementation Roadmap

### Epic 1: Stabilize Current Worktree

Goal: return the current in-progress tree to a validated baseline before larger redesign.

Inputs:

- `src-v2/renderer/app.js`
- `src-v2/renderer/styles.css`
- `cnpm run format:check`
- `cnpm run lint`
- `cnpm run check`
- `cnpm run test -- --run`

Steps:

1. Complete or revert in-progress UI edits from the interrupted source-file removal pass.
2. Ensure `sourceFileKey`, source type summaries, and filter semantics are coherent if keeping that direction.
3. Run validation commands.

Acceptance criteria:

- All validation commands pass.
- No runtime reference to an undefined helper.
- Existing Round 9 flow still imports eight files and opens all four pages.

Risk:

- Current `src-v2` is untracked in git status, so `git diff` is not sufficient evidence. Use explicit file inspection and tests.

### Epic 2: Input Model And File Management

Goal: make Intake scientifically and operationally credible.

Expected files:

- `src-v2/renderer/core/project.js`
- `src-v2/renderer/app.js`
- `src-v2/renderer/styles.css`
- `src-v2/renderer/core/__tests__/project.test.js`

Steps:

1. Add stable source file summary fields: key, name, path, type `ERG/FVEP`, record count, mode set.
2. Add source-file remove behavior.
3. Change Acquisition Records top-level filters to `All / ERG / FVEP / QC`.
4. Move `dOps`, `Flicker`, and other internal modes to Analysis protocol selectors.
5. Make sidebar and Intake Import Batch use the same compact source row component.

Acceptance criteria:

- Removing a source file removes all related samples and export rows.
- ERG filter includes FERG/dOps/Flicker records.
- FVEP filter includes only FVEP records.
- Intake and sidebar file lists match density and information order.
- No list content overlaps neighboring panels at 8, 16, and 32 source-file scenarios.

### Epic 3: Global UI Token Cleanup

Goal: enforce one coherent macOS workstation UI system.

Expected files:

- `src-v2/renderer/styles.css`
- `src-v2/renderer/app.js`

Steps:

1. Replace existing font tokens with four text styles.
2. Replace one-off button and chip heights with global control tokens.
3. Normalize all panel header right controls.
4. Add component classes for `chip`, `status-chip`, `panel-action`, `row-action`, `source-row`, `metric-row`, and `data-table`.
5. Audit every list/table/panel for overflow containment.

Acceptance criteria:

- CSS search shows no arbitrary `font-size` values except the four root tokens.
- CSS search shows no arbitrary button heights except tokenized control classes.
- All panel header controls align vertically and share geometry.
- No visible scrollbars.
- Computer Use screenshots show no text/control overlap.

### Epic 4: Real Analysis Engine

Goal: replace Analysis shell with scientific analysis behavior.

Expected files:

- `src-v2/renderer/core/analysis.js`
- `src-v2/renderer/core/__tests__/analysis.test.js`
- `src-v2/renderer/core/metrics.js`
- `src-v2/renderer/app.js`

Steps:

1. Define `AnalysisPlan` and `AnalysisResult`.
2. Generate source rows, cohort summary, condition summary, warnings, and figure series from one plan.
3. Add descriptive statistics: n, mean, SD, SEM, min, max.
4. Add two-group tests only when assumptions are valid enough for the first release: Welch t-test and Mann-Whitney if implemented without new dependencies or with explicit dependency approval.
5. Add condition-stratified behavior when multiple stimulus conditions are present.
6. Add visible warnings for invalid tests and pooled conditions.

Acceptance criteria:

- Analysis page can answer: selected metric, selected protocol, selected condition, raw/corrected layer, cohort summary, individual values, and statistical result or reason no test is valid.
- Tests cover FERG, dOps, Flicker, FVEP, raw/corrected, included/excluded, and multi-condition selections.
- Export uses the same `AnalysisResult`, not independent recalculation with different rules.

### Epic 5: Report Workspace

Goal: make final output reviewable before export.

Expected files:

- `src-v2/renderer/core/report.js`
- `src-v2/renderer/core/export.js`
- `src-v2/renderer/app.js`
- `src-v2/renderer/core/__tests__/report.test.js`
- `src-v2/renderer/core/__tests__/export.test.js`

Steps:

1. Decide whether to rename top-level `Export` to `Report`.
2. Add report readiness based on project save state, analysis warnings, correction state, QC, and export completeness.
3. Show selected figure/table manifest.
4. Export workbook sheets from report model.
5. Preserve correction and exclusion provenance.

Acceptance criteria:

- Report page is not just action buttons; it previews the package contents and scientific readiness.
- Workbook contains samples, groups, metrics raw/manual/corrected, cohort summary, stats, figure source, correction log, source files, exclusions/QC.
- Reopening a project reproduces report state.

### Epic 6: Full Packaged QA

Goal: prove the final deliverable in the actual app.

Steps:

1. Build packaged app with `electron-builder --mac dir --arm64`.
2. Start packaged app with demo ERG/FVEP batches.
3. Use Computer Use to capture:
   - startup import,
   - Intake with multi-file list and file removal,
   - Review with manual correction,
   - Analysis with ERG and FVEP scopes,
   - Report with readiness,
   - export/copy actions,
   - project save/reopen.
4. Save screenshots and notes in a new QA round folder.
5. Verify no running app process remains.

Acceptance criteria:

- At least one full flow starts from xlsx and ends with reopened project plus exported workbook.
- Screenshots prove every page and key state.
- Validation commands pass after QA.

## Design Guardian Report

### Boundary

Core scientific logic belongs in `src-v2/renderer/core`, not in UI event handlers.

Observation:

- `metrics.js` and `export.js` already contain reusable domain functions.
- `app.js` currently owns too much analysis orchestration and presentation state.

Drift:

- Analysis behavior risks becoming duplicated between screen table rows and workbook export rows.

Severity:

- High for scientific validity.

Correction:

- Add `core/analysis.js` and make UI/export consume the same result object.

Validation:

- Unit tests for `analysis.js`; export tests verify sheet rows match analysis output.

### Boundary

UI system rules belong in CSS tokens/components, not repeated per-control overrides.

Observation:

- `styles.css` currently contains many font sizes and button heights: `10px`, `10.5px`, `11px`, `12px`, `14px`, `15px`, `18px`, `21px`, `22px`, `24px`, `28px`, `30px`, `32px`.

Drift:

- One-off visual fixes are accumulating and producing inconsistent controls.

Severity:

- High for product quality, medium for maintainability.

Correction:

- Four text tokens; fixed control-height tokens; component classes for every repeated control pattern.

Validation:

- CSS token search plus packaged screenshots.

### Boundary

Input source model must not be conflated with acquisition protocol mode.

Observation:

- Current filter model exposes `dOps` alongside `ERG` and `FVEP`.

Drift:

- Scientific domain vocabulary leaks into the wrong UI level.

Severity:

- Medium for correctness, high for user comprehension.

Correction:

- Source filter: `All/ERG/FVEP/QC`; protocol filters move to Analysis.

Validation:

- Parser tests and Computer Use filter tests.

## Stop Conditions

Stop implementation and ask for human decision if:

- renaming `Export` to `Report` is not acceptable,
- statistical testing requires a dependency not already installed,
- real data requires metadata columns not present in current templates,
- project file schema changes need backwards compatibility guarantees.

## Immediate Next Step

Run Epic 1 first. Do not continue UI patching until the current in-progress tree is stabilized and validated. Then implement Epic 2 and Epic 3 together enough to eliminate the visible control/list inconsistencies before building the real Analysis and Report layers.
