# ERG Viewer Architecture

## Product intent

ERG Viewer is a focused desktop workstation for reviewing and analyzing OPTOPROBE visual electrophysiology exports. The product goal is to reduce repetitive manual work around ERG/FVEP wave inspection and experiment-level analysis: load vendor Excel exports, present right/left eye traces consistently, compare machine-recognized measurements with manual annotations, derive raw and corrected metrics, group samples, run appropriate statistics, then export report-ready figures and source data tables.

## Runtime shape

- `src-v2/main/main.js`: Electron main process. Owns native dialogs, file read/write, clipboard image bridge, PDF printing, window sizing, and OS integration.
- `src-v2/preload/preload.js`: Narrow bridge exposed as `window.ergAPI`, plus renderer libraries exposed as `window.ergLibs` to reduce file URL loading issues in packaged builds.
- `src-v2/renderer/index.html`: Static renderer shell, CSS tokens, React/Plotly/XLSX script loading, and CSP.
- `src-v2/renderer/app.js`: React UI, workflow state, OPTOPROBE import orchestration, Plotly drawing, manual point-pick correction state, cohort assignment, analysis controls, report composition, and theme handling.
- `src-v2/renderer/core/*`: Testable parser, project, protocol, metric, manual-pick, analysis, report, and export modules.
- `scripts/smoke_parse.js`: Headless parser smoke test for checking an Excel export without launching Electron.

## Data flow

1. The renderer asks the main process to show an Excel open dialog.
2. The main process records the selected path as an allowed read path.
3. The renderer asks for the file buffer and parses the first worksheet with `xlsx`.
4. Rows are normalized into `{ Item, Param, Value }`, basic metadata is extracted, and group keys like `R_01_详细数据(uv)` are collected.
5. Plotly renders each valid eye trace from parsed y values and computed x values.
6. Lab metrics are materialized as raw and corrected versions. Raw metrics are immutable; corrected metrics are derived from a correction layer.
7. Manual annotations, correction settings, group assignments, and statistics live in renderer memory for the current session.
8. Exports are written only after a save dialog records the destination as an allowed write path.

## Lab workflow model

- Intake: file import, source summaries, acquisition mix, cohort setup, Include/Exclude state, and statistical design.
- Review: one selected acquisition record, waveform overlay, machine/manual/corrected point-pick state, correction parameters, and derived metrics.
- Analysis: metric, stimulus condition, version, eye and statistical-test selectors feeding grouped plots, source tables, and publication panel previews.
- Report: reproducible workbook/PDF package with `samples`, `groups`, `metrics_raw`, `metrics_corrected`, `stats`, `figure_source`, `corrections_log`, and source-file sheets.

## Project file format

`.ep` files are local JSON documents with schema `erg-viewer-v2-project`. They store parsed acquisition records, raw group data, custom group assignments, Include/Exclude state, correction settings, selected record and analysis selectors. Importing a project reconstructs metrics from stored raw group data and explicit correction state rather than trusting stale metric rows. Legacy `.ergproject` files remain readable for compatibility.

Supported mode-aware metrics:

- FERG: a-wave/b-wave latency, amplitude and b/a ratio.
- FVEP: N1/P1/N2/P2 latency/amplitude and paired peak-to-peak amplitudes.
- dOps: summed OP amplitude.
- Flicker: machine amplitude/phase, waveform-recomputed Fourier amplitude/phase, peak time, and manual trough/peak correction.

## Security boundaries

- `nodeIntegration` is disabled and `contextIsolation` is enabled.
- The renderer cannot read arbitrary local files. `read-file-buffer` only accepts Excel paths selected through the open dialog.
- The renderer cannot write arbitrary local files. `write-file` and PDF export only accept paths returned by the save dialog.
- Excel-derived strings are escaped before entering generated SVG/PDF HTML export content.
- Raw OPTOPROBE Excel files are ignored by git because they can contain patient or study identifiers.

## Release model

Source belongs in git. Installer artifacts belong in GitHub Releases:

- macOS: `.dmg` and `.zip`
- Windows: NSIS `.exe`
- Linux: `.AppImage` and `.deb` after Linux verification

The checked-in source runtime is `src-v2/` only. Legacy `src/` has been removed; do not reintroduce it as a parallel implementation.
