# Visual Review Resume Protocol

Status: paused until the user explicitly allows screenshot and Computer Use workflows again.

Current installed app target:

```text
/Applications/ERG Viewer.app
```

Current required preflight:

```text
npm run release:verify:mac
npm run smoke:delivery-readiness
npm run smoke:visual-review-preflight
npm run smoke:visual-review-execution-packet
npm run prepare:visual-review-workspace
```

## Purpose

The original delivery goal requires Computer Use, real-file import, screenshots at launch and data-analysis steps, and at least three strict visual review rounds. This protocol defines exactly what to run when screenshot capture is allowed again.

Do not run this protocol while the desktop may be locked.

## Required Review Roles

Each round must record findings from these perspectives:

- Graduate student: can import, group, review, correct, analyze, and export without hidden steps.
- Professor: ERG/FVEP scientific logic, endpoint grouping, report panels, and traceability are publication-ready.
- Product manager: workflow stages, gating, discoverability, and project save/reopen behavior are coherent.
- UI designer: labels, controls, spacing, typography, colors, hierarchy, and information density are consistent.

## Required Screenshot Rounds

### Round A - Installed App Baseline

Goal: prove the installed app starts cleanly and each primary page is visually stable before interaction edits.

Required actions:

- Launch `/Applications/ERG Viewer.app`.
- Import the four-file ERG/FVEP demo batch:
  - `docs/examples/demo-control-1_FERG.xlsx`
  - `docs/examples/demo-cko-1_FERG.xlsx`
  - `docs/examples/demo-control-1_FVEP.xlsx`
  - `docs/examples/demo-cko-1_FVEP.xlsx`
- Capture screenshots:
  - `01-startup.png`
  - `02-intake-imported.png`
  - `03-review-erg.png`
  - `04-review-fvep.png`
  - `05-analysis-erg.png`
  - `06-analysis-fvep.png`
  - `07-report-erg.png`
  - `08-report-fvep.png`

Required checks:

- No visible scrollbars unless inside an intentionally scrollable list.
- No overlapping text or controls.
- Plot x/y titles include semantic labels, not unit-only labels.
- Intake Samples height is capped and the adjacent Acquisition panel remains visible.
- Record filters show only meaningful ERG/FVEP choices.
- Report scopes clearly separate Current, ERG, FVEP, and Appendix.

### Round B - Control Interaction and Manual Correction

Goal: prove major controls respond through real GUI operation and that manual correction remains visually understandable.

Required actions:

- Switch Acquisition between ERG and FVEP.
- Toggle Included/Excluded for a selected record.
- Change Intake cohort and Pair ID fields.
- Use batch cohort assignment.
- Select Review Summary and Layer controls.
- Arm a manual pick target.
- Perform at least one Computer Use nudge on a picked point.
- Switch Analysis Source, Protocol, Condition, Metric, Layer, and Stats.
- Switch Report scopes.

Required screenshots:

- `01-intake-cohort-edited.png`
- `02-review-included-toggle.png`
- `03-review-manual-pick-armed.png`
- `04-review-manual-pick-nudged.png`
- `05-analysis-erg-dops-manual.png`
- `06-analysis-fvep-latency.png`
- `07-report-scope-erg.png`
- `08-report-scope-fvep.png`

Required checks:

- Expected state before click is written down.
- Actual state after click is written down.
- The same control is checked again after the fix if a defect is found.
- Manual pick labels do not cover the target selector or the waveform.
- Right-side metadata/endpoint panels do not consume more space than their information value warrants.

### Round C - Project Reopen and Release Artifact

Goal: prove saved projects and installed release artifacts are visually and functionally coherent.

Required actions:

- Save a project after import and correction.
- Reopen the saved `.ep` project.
- Verify the selected record, corrected layer, analysis source rows, and report scopes.
- Export PDF from the installed app; analysis workbooks remain available through report/export workflows when enabled.
- Quit the app from the visible Quit entry.

Required screenshots:

- `01-open-project-dialog.png`
- `02-reopened-review.png`
- `03-reopened-analysis.png`
- `04-reopened-report.png`
- `05-exported-workbook-ready.png`
- `06-exported-pdf-ready.png`
- `07-quit-entry.png`

Required checks:

- Project path and saved state are visible and not clipped.
- Analysis rows and report source rows are reproducible after reopen.
- Export buttons are enabled only when source rows exist.
- Quit entry is visible and does not conflict with export/project actions.
- Installed app version is `3.0.0`.

## Output Directory

Create a new directory for the resumed review:

```text
docs/qa/2026-06-28-final-visual-review-resumed/
```

Each round must contain:

- screenshots listed above
- `ROUND_A_NOTES.md`, `ROUND_B_NOTES.md`, or `ROUND_C_NOTES.md`
- a defect list with expected state, actual state, fix, and second verification
- role-review notes for graduate student, professor, product manager, and UI designer
- the filled checklist from `docs/VISUAL_REVIEW_EXECUTION_PACKET.md`

## Completion Rule

Final delivery can only be marked complete after:

- all three resumed visual rounds pass,
- no blocking visual defects remain,
- `npm run release:verify:mac` still passes after any visual fixes,
- `npm run audit:visual-review-completion:complete` passes,
- `npm run smoke:delivery-readiness` is updated from `visualReview=paused` to completed evidence.
