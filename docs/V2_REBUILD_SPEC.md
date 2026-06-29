# ERG Viewer v2 Rebuild Spec

## Decision

ERG Viewer v2 is a ground-up rewrite. Legacy `src/` has been removed; `src-v2/` is the only checked-in runtime path and all new product development belongs there.

## Product Goal

Create a focused electrophysiology workstation for retinal ERG/FVEP experiments:

- import OPTOPROBE Excel exports,
- save and reopen `.ep` files for fast reproducible re-analysis,
- review representative right/left eye traces,
- preserve raw measurements,
- apply explicit manual point-pick correction state,
- summarize cohort-level metrics,
- export traceable project and source-data artifacts.

## Non-Goals For The v2 Baseline

- No broad migration of the removed legacy `renderer.js` UI.
- No patient-identifying example data.
- No arbitrary renderer filesystem access.
- No packaging/signing changes beyond pointing the app at the v2 runtime.

## Architecture

- `src-v2/main/`: Electron shell, file dialogs, allowlisted file IO, PDF/export IPC.
- `src-v2/preload/`: narrow contextBridge API and dependency bridge.
- `src-v2/renderer/`: UI, design system, local state, parser orchestration, charts, metrics, and export composition.
- `src-v2/renderer/core/`: testable domain modules with browser and Node exports.

## Input Model

Demo `FERG` and `FVEP` workbooks under `docs/examples/` are input templates. Real usage may import:

- one ERG or FVEP file,
- multiple ERG files,
- multiple FVEP files,
- mixed ERG and FVEP batches.

The v2 import unit is an acquisition record, not a whole project. Each OPTOPROBE file can contain multiple R/L numbered conditions. The parser creates one reviewable record per matched condition number while preserving file name, subject ID, cohort, modality, condition, and side-specific traces.

FERG files may contain subtype acquisitions. `dOps` and `Flicker` conditions must remain separate reviewable records, source summaries, filters, metrics, and export rows; they must not be collapsed into generic FERG.

## Data Model

Project:

- `schema`: `erg-viewer-v2-project`
- `samples`: parsed or demo samples
- `sources`: imported source workbook summary
- `correctionLog`: derived manual point-pick provenance
- `groups`: cohort/group definitions
- `settings`: selected metric, mode, eye, condition, and correction policy

Sample:

- `id`, `label`, `cohort`, `mode`, `condition`, `sourceName`
- `subjectId`, `acquisitionId`
- `included`
- `metadata`
- `traces.right` and `traces.left` as `{ x: number[], y: number[] }`
- `machineMarks.right` and `machineMarks.left` from OPTOPROBE `标记`
- `metrics.raw`
- `corrections.manualPoints` for a-wave, b-wave, FVEP N/P peaks, and OP peak/valley picks
- `qc`

Metrics:

- raw values are immutable import-derived values,
- corrected/manual values are derived from raw values plus manual point-pick state,
- `correct` semantics mean manually selected measurement points for a-wave, b-wave, OP peak/valley, and FVEP N/P peaks, not global amplitude scaling or latency shifting,
- group summaries are derived from included samples only.

## v2 Baseline Acceptance Criteria

- `cnpm start` opens the v2 shell.
- The default screen is the usable ERG Viewer workstation, not a landing page.
- Demo data loads without external files.
- Import flow can parse one or more ERG/FVEP Excel files into reviewable acquisition records.
- Project save/open preserves analysis settings, record inclusion, correction state, source summaries, and correction log.
- Left sidebar, waveform review, metric inspector, QC, group summary, and source table are visible.
- Export flow writes a reproducible `.xlsx` workbook with samples, groups, raw/manual/corrected metrics, cohort summary, figure source, correction log, and source file sheets.
- Manual correction supports explicit point picking, existing marker selection, keyboard/button nudging, and clear/done state for ERG, FVEP, and OP measurements.
- `cnpm run check` and `cnpm run test` pass.
- Computer Use verification can import a real template workbook, manually pick dOps OP peak/valley points, export an XLSX workbook with point-level correction provenance, save an `.ep` project, and reopen it with the manual points reproduced.

## UX Workflow

A graduate student workflow is the design target:

1. Create or open a project.
2. Import one file, many ERG files, many FVEP files, or a mixed ERG/FVEP batch.
3. Confirm detected subjects, cohorts, modality, acquisition records, and QC warnings in the project library.
4. Review OD/OS traces and raw/corrected metrics.
5. Edit cohort and include/exclude state, then manually pick a-wave, b-wave, FVEP peaks, or OP peak/valley points when machine marks need correction.
6. Save the `.ep` project to freeze a reproducible analysis state.
7. Reopen the project later and export source tables or a full analysis workbook from the same state.

The UI should feel like a macOS scientific workstation: translucent toolbar, segmented workflow control, sidebar source list, compact inspector, restrained white/graphite surfaces, blue action accent, and green QC/include status.

The top workflow control is page-level navigation:

- `Intake`: imported files, acquisition mix, and QC.
- `Review`: trace review, manual point picking, source rows, and group preview.
- `Analysis`: source data and group summary as the main workspace.
- `Export`: project package state, workbook sheet list, save/export actions.

## Deferred Work

- Formal legacy `.ergproject` to `.ep` migration.
- Full OPTOPROBE format matrix and real-file parser coverage.
- Continued publication PDF/XLSX export hardening against literature-derived figure requirements.
- End-to-end Electron UI automation.
