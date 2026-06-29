# ERG Viewer Delivery Readiness Audit

Current app version: `3.0.0`

Installed app: `/Applications/ERG Viewer.app`

Last full non-screenshot release command:

```text
npm run release:verify:mac
```

Last recorded result:

```text
macos-release-verify: ok | steps=21 | seconds=125.5 | installed=/Applications/ERG Viewer.app
```

## Requirement Matrix

| Requirement | Evidence | Status |
| --- | --- | --- |
| Import real ERG/FVEP Excel files | `npm run smoke:v2`, `npm run smoke:electron-state`, `npm run smoke:installed-app-roundtrip` | Passed |
| Single-file and multi-file workflows | `smoke:v2` covers single FERG, single FVEP, and 32-file mixed batch | Passed |
| Installed input mode matrix | `npm run smoke:installed-input-mode-matrix`, Round 66 report | Passed |
| Project save and reopen | `npm run smoke:electron-project-roundtrip`, `npm run smoke:installed-app-roundtrip` | Passed |
| Manual correction persists into corrected metrics | `npm run smoke:project-repro` | Passed |
| ERG publication outputs | `npm run smoke:scientific-output`, Round 51 notes | Passed |
| FVEP publication outputs | `npm run smoke:scientific-output`, Round 52 notes | Passed |
| Stage logic across Intake/Review/Analysis/Report | `npm run smoke:electron-state`, `npm run smoke:electron-role-review` | Passed |
| All visible controls have expected/actual coverage or explicit reservation | `npm run smoke:electron-interactions`, `npm run smoke:installed-app-ui`, `npm run smoke:installed-control-response-matrix` | Passed |
| Control interaction ledger | `npm run smoke:control-interaction-ledger`, Round 65 report | Passed |
| Layout has no overflow/overlap/clipped single-line controls | `npm run smoke:electron-layout`, `npm run smoke:installed-app-ui` | Passed |
| UI text/control scale stays globally constrained | `npm run smoke:electron-design-audit`, `npm run smoke:installed-app-ui` | Passed |
| Non-screenshot visual design matrix | `npm run smoke:visual-design-matrix`, Round 62 report | Passed |
| Installed app visual design matrix | `npm run smoke:installed-visual-design-matrix`, Round 63 report | Passed |
| Installed control response matrix | `npm run smoke:installed-control-response-matrix`, Round 74 report | Passed |
| Installed UI specification matrix | `npm run smoke:installed-ui-spec-matrix`, Round 75 report | Passed |
| Graduate student/professor/product/UI review criteria | `npm run smoke:electron-role-review` | Passed |
| Installed app import/export/project reopen | `npm run smoke:installed-app-roundtrip` | Passed |
| Installed app UI release gate | `npm run smoke:installed-app-ui` | Passed |
| Installed app full quit paths | `npm run smoke:electron-quit`; installed `ERG_VIEWER_QA_QUIT=1`; installed `ERG_VIEWER_QA_QUIT_TARGET=window-red`; Round 67 discoverability note | Passed |
| macOS release artifacts match package version | `npm run smoke:mac-release-artifacts` | Passed |
| One-command non-screenshot release verification | `npm run release:verify:mac` | Passed |
| Final delivery requirement audit | `npm run smoke:final-delivery-requirements`, Round 64 report | Passed |
| Screenshot/Computer Use resume protocol | `npm run smoke:visual-review-protocol`, `docs/VISUAL_REVIEW_RESUME_PROTOCOL.md` | Prepared |
| Screenshot/Computer Use resume preflight | `npm run smoke:visual-review-preflight`, Round 68 report | Prepared |
| Screenshot/Computer Use execution packet | `npm run smoke:visual-review-execution-packet`, `docs/VISUAL_REVIEW_EXECUTION_PACKET.md` | Prepared |
| Screenshot/Computer Use workspace templates | `npm run prepare:visual-review-workspace -- --check`, `docs/qa/2026-06-28-final-visual-review-resumed/` | Prepared |
| Screenshot/Computer Use completion gate | `npm run audit:visual-review-completion`; future completion requires `npm run audit:visual-review-completion:complete` | Prepared |
| Three rounds of screenshot/Computer Use visual review | User previously paused screenshot workflows while desktop may be locked | Paused |
| Apple Developer ID signing/notarization | No valid Developer ID Application certificate on this machine; release artifact gate records `adhoc` signing | Not available |

## Current Release Commands

Fast local readiness:

```text
npm run check
npm run smoke:visual-review-protocol
npm run smoke:visual-review-preflight
npm run smoke:visual-review-execution-packet
npm run prepare:visual-review-workspace -- --check
npm run audit:visual-review-completion
npm run smoke:visual-design-matrix
npm run smoke:installed-input-mode-matrix
npm run smoke:installed-control-response-matrix
npm run smoke:installed-ui-spec-matrix
npm run smoke:final-delivery-requirements
npm run smoke:delivery-readiness
```

Full non-screenshot macOS delivery verification:

```text
npm run release:verify:mac
```

Post-screenshot completion gate:

```text
npm run audit:visual-review-completion:complete
```

Installed app verification only:

```text
npm run smoke:installed-app-ui
npm run smoke:installed-input-mode-matrix
npm run smoke:installed-control-response-matrix
npm run smoke:installed-ui-spec-matrix
npm run smoke:installed-app-roundtrip
npm run smoke:mac-release-artifacts
ERG_VIEWER_QA_QUIT=1 "/Applications/ERG Viewer.app/Contents/MacOS/ERG Viewer"
ERG_VIEWER_QA_QUIT=1 ERG_VIEWER_QA_QUIT_TARGET=window-red "/Applications/ERG Viewer.app/Contents/MacOS/ERG Viewer"
```

## Remaining Final-delivery Gap

The original full goal explicitly asks for Computer Use plus screenshots at every launch/data-analysis step and at least three visual review rounds. That part remains intentionally incomplete because screenshot/Computer Use workflows were paused after the user warned the desktop may be locked.

Do not mark final delivery complete until screenshot/Computer Use visual review is explicitly resumed and completed, or the user explicitly replaces that requirement with the current deterministic non-screenshot evidence chain.
