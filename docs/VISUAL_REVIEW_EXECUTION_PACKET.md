# Visual Review Execution Packet

Status: prepared; do not execute while screenshot and Computer Use workflows are paused.

This packet turns the paused visual review protocol into a fillable execution checklist. It is not evidence of visual completion by itself. Final delivery still requires actual Computer Use operation, screenshots, defect fixing, and second verification.

This packet does not capture screenshots and does not run Computer Use.

## Shared Setup

Installed app:

```text
/Applications/ERG Viewer.app
```

Required commands before starting visual capture:

```text
npm run release:verify:mac
npm run smoke:delivery-readiness
npm run smoke:visual-review-preflight
```

Input workbooks:

- `docs/examples/demo-control-1_FERG.xlsx`
- `docs/examples/demo-cko-1_FERG.xlsx`
- `docs/examples/demo-control-1_FVEP.xlsx`
- `docs/examples/demo-cko-1_FVEP.xlsx`

Output directory:

```text
docs/qa/2026-06-28-final-visual-review-resumed/
```

## Defect Log Schema

Each visual defect must be recorded with these fields:

| Field | Required content |
| --- | --- |
| Screenshot | Screenshot file name where the defect is visible |
| Page | Intake, Review, Analysis, Report, export dialog, project dialog, or quit entry |
| Control or region | Exact label, control, chart, panel, or file-dialog region |
| Expected | What should change or appear before clicking/after clicking |
| Actual | What actually appears after the action |
| Severity | Blocker, major, minor, or polish |
| Root cause | Layout, copy, data-state, scientific logic, interaction, export, or unknown |
| Fix | Code or design change applied |
| Second verification | Screenshot or command proving the fix was rechecked |
| Role impact | Graduate student, professor, product manager, UI designer, or multiple |

## Role Review Rubric

Each round must include all four role sections.

### Graduate Student

- Import path is obvious and works without hidden steps.
- Cohort setup, pair ID, include/exclude, manual correction, analysis, and export can be completed in order.
- Current selected record and acquisition family are visible.
- Failure states explain what to do next.

### Professor

- ERG and FVEP are scientifically separated where needed and comparable where appropriate.
- ERG metrics use protocol-appropriate labels and units.
- FVEP amplitude and latency are reported with interpretable units.
- Report panels and source rows are traceable to records and files.
- Corrected values remain distinguishable from raw values.

### Product Manager

- Workflow stages are discoverable and linked: Intake, Review, Analysis, Report.
- Stage gates match prerequisites.
- Project save/reopen/export/quit are visible without competing with scientific controls.
- The app supports single ERG, multiple ERG, single FVEP, multiple FVEP, and mixed batches.

### UI Designer

- No overlapping labels, controls, or chart annotations.
- No clipped text, half rows, or unintended visible scrollbars.
- X and Y axes have semantic titles and adequate tick spacing.
- Control height, radius, font size, color role, and button style are globally consistent.
- Space allocation matches information value: waveform and analysis charts dominate; metadata and secondary controls stay compact.

## Round A - Installed App Baseline

Goal: installed app starts cleanly, imports the representative batch, and each primary page is visually stable before interaction edits.

| Screenshot | Required visible state | Primary review focus |
| --- | --- | --- |
| `01-startup.png` | Installed app first screen with top navigation and visible Quit entry | Window chrome, global spacing, first-run hierarchy |
| `02-intake-imported.png` | Four imported source files, Project Summary, Samples, Acquisition | File list density, sample controls, no overflow |
| `03-review-erg.png` | ERG record selected with waveform and manual correction controls | ERG metric labels, manual-pick discoverability |
| `04-review-fvep.png` | FVEP record selected with waveform and FVEP endpoint context | FVEP labels, amplitude/latency semantics |
| `05-analysis-erg.png` | ERG analysis with source/protocol/condition/metric/layer/stats controls | ERG plotting logic and axis titles |
| `06-analysis-fvep.png` | FVEP analysis with latency or amplitude output | FVEP plotting logic and units |
| `07-report-erg.png` | ERG report scope selected with figures/source rows | Report scope clarity and export readiness |
| `08-report-fvep.png` | FVEP report scope selected with figures/source rows | FVEP report completeness |

Round A must end with: pass/fail decision, role-review notes, defect log, and decision whether fixes are required before Round B.

## Round B - Control Interaction and Manual Correction

Goal: major controls respond through real GUI operation and manual correction remains visually understandable.

| Screenshot | Required visible state | Primary review focus |
| --- | --- | --- |
| `01-intake-cohort-edited.png` | Cohort and Pair ID edited from the UI | Expected/actual state and field readability |
| `02-review-included-toggle.png` | Include/exclude state changed for selected record | State feedback and downstream gating |
| `03-review-manual-pick-armed.png` | Manual pick target armed | Target selector visibility and annotation placement |
| `04-review-manual-pick-nudged.png` | Pick point moved by Computer Use nudge | Corrected value visibility and no annotation collision |
| `05-analysis-erg-dops-manual.png` | ERG dOps manual-layer analysis | Manual metrics and source rows |
| `06-analysis-fvep-latency.png` | FVEP latency metric selected | Latency units and plot title correctness |
| `07-report-scope-erg.png` | Report scope switched to ERG | Sidebar/report linkage |
| `08-report-scope-fvep.png` | Report scope switched to FVEP | Sidebar/report linkage |

Round B must end with: expected state before click, actual state after click, defects fixed, second verification screenshot, and pass/fail decision.

## Round C - Project Reopen and Release Artifact

Goal: saved projects, release artifacts, export paths, and quit behavior are visually and functionally coherent.

| Screenshot | Required visible state | Primary review focus |
| --- | --- | --- |
| `01-open-project-dialog.png` | Project open dialog or selected project path | Dialog clarity and path readability |
| `02-reopened-review.png` | Reopened project on Review with corrected values preserved | State reproduction and manual correction persistence |
| `03-reopened-analysis.png` | Reopened project on Analysis with source rows present | Analysis reproducibility |
| `04-reopened-report.png` | Reopened project on Report with scopes available | Report reproducibility |
| `05-exported-workbook-ready.png` | XLSX export completed or export destination visible | Export readiness and feedback |
| `06-exported-pdf-ready.png` | PDF export completed or export destination visible | PDF readiness and feedback |
| `07-quit-entry.png` | Visible Quit entry before app exit | Quit discoverability and no conflict with export actions |

Round C must end with: exported artifact paths, project path, app version, role-review notes, defect log, second verification, and final pass/fail decision.

## Completion Gate

The visual review can only be considered complete after:

- Round A, Round B, and Round C all pass.
- Every defect has a second verification entry.
- No blocker or major defect remains open.
- `npm run release:verify:mac` passes after the final visual fix.
- `npm run audit:visual-review-completion:complete` passes.
- `npm run smoke:delivery-readiness` is updated from `visualReview=paused` to completed evidence.
