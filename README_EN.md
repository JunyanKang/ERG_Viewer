# OptoERGViewer

[中文](README.md)

OptoERGViewer is a desktop visual electrophysiology workstation for OPTOPROBE Excel exports. It brings ERG/FVEP loading, single-sample waveform review, machine-result comparison, manual correction, batch grouping, statistical analysis, figure export, and source-data export into one Electron application for ophthalmic electrophysiology experiments, clinical research quality control, and manuscript figure preparation.

## Features

- Data import: load OPTOPROBE `.xlsx` / `.xls` exports and automatically parse exam metadata, eye-side groups, and acquisition parameters.
- Waveform review: view right/left eye traces side by side or as a single-eye layout, with axis adjustment, reset, and theme switching.
- a/b-wave review: manually annotate a-wave and b-wave for dRod, dMax, and lCone, and compare manual measurements against machine-recognized results.
- Ops analysis: annotate Op1-Op5 peaks/troughs for dOps and calculate sum O.
- Flicker analysis: read machine-reported amplitude/phase and recompute Fourier-based components from the waveform.
- FVEP analysis: display machine-recognized N1/P1/N2/P2 results and support manual review annotations.
- v2 experiment workflow: use Intake / Review / Analysis / Report workspaces for project creation, project save/import, batch import, cohort grouping, raw/manual/corrected record review, grouped plots, statistical tests, and full project export.
- Metric system: FERG a-wave/b-wave latency, amplitude, and b/a ratio; FVEP N1/P1/N2/P2 latency/amplitude plus P1-N1, P1-N2, and P2-N2 peak-to-peak amplitudes; dOps summed OP amplitude; Flicker machine amplitude/phase plus waveform-based Fourier amplitude/phase.
- Statistics: Welch t-test by default for two groups, one-way ANOVA by default for multiple groups, with Mann-Whitney, Kruskal-Wallis, effect sizes, and Benjamini-Hochberg FDR.
- Product localization: Chinese, English, Russian, Latin, French, and German UI switching, persisted language state, and a localized product-grade About window with version information.
- Demo mode: load anonymized synthetic demo data in-app and generate OPTOPROBE-style Excel examples from a script.
- Export and sharing: export PNG, SVG, and PDF figures, export plotting data as Excel, and copy images/data to the clipboard.

## Project Structure

```text
ERG_Viewer/
├── assets/                  # Source images and non-runtime assets
├── build/                   # electron-builder resources: icons and Windows extra files
├── docs/                    # Architecture, release, and experiment analysis documentation
├── scripts/                 # CLI tools: icon generation, smoke test, and demo data generation
├── src-v2/
│   ├── main/                # Electron main process
│   ├── preload/             # contextBridge / IPC API
│   └── renderer/            # React + Plotly renderer and core analysis modules
├── package.json             # Dependencies, scripts, and electron-builder config
└── README.md
```

The repository intentionally excludes `node_modules/`, `dist/`, and raw Excel exam exports.

## Development

`cnpm` is recommended when npm registry access is unreliable:

```bash
cnpm install
cnpm run start
```

If the system default `node` is broken, first check whether `cnpm -v` reports a usable Node path.

The repo-root `.npmrc` already pins `registry` to `https://registry.npmmirror.com`, so plain `npm install` / `pnpm install` also routes through the mirror. `cnpm` behavior is unchanged.

> **Lockfile consistency**: `cnpm` and `npm` produce incompatible `package-lock.json` formats; mixing them causes conflicts. Use one install path consistently for local development; GitHub Actions uses `npm ci` with the committed lockfile to avoid lockfile thrash in PRs.

## Checks and Smoke Test

```bash
cnpm run check
cnpm run smoke -- /path/to/OPTOPROBE-export.xlsx
cnpm run gen:demo
```

`check` runs JavaScript syntax checks. `smoke` parses an Excel file and prints metadata plus group summaries without launching Electron. `gen:demo` writes anonymized synthetic Excel examples to `test-fixtures/opto/`.

## Experiment Analysis and Demo

The v2 top workflow opens experiment-level analysis. In the workstation you can:

- use `Intake` to import multiple OPTOPROBE Excel files and assign cohort groups, inclusion state, and statistical design,
- use `Review` to inspect raw/manual/corrected waveforms and corrected metrics for one acquisition record,
- use `Analysis` to select metric, stimulus condition, eye, raw/corrected version, and statistical method; ERG/FVEP statistics do not mix different stimulus strengths or signal conditions,
- use `Report` to write samples, groups, metrics_raw, metrics_corrected, stats, figure_source, and corrections_log sheets.
- use top-level `Save Project / Open Project` actions to manage `.ep` project files that restore samples, groups, inclusion state, corrections, and analysis settings; legacy `.ergproject` files remain readable.

Example files can be regenerated with:

```bash
cnpm run gen:demo
```

Generated files are placed under `test-fixtures/opto/`; they are synthetic and contain no real patient information.

## Packaging

```bash
cnpm run build:mac       # macOS dmg + zip
cnpm run build:win       # Windows NSIS exe
cnpm run build:linux     # Linux AppImage
cnpm run build:linux:deb # Optional Debian package
```

Notes:

- Production macOS distribution requires Apple Developer ID signing and notarization.
- Production Windows distribution should use a code-signing certificate.
- Linux AppImage is the default Linux artifact; the deb package is optional and should be released after validation in a Linux environment.

## Release Policy

- GitHub repository: source code, configuration, documentation, and required build resources.
- GitHub Releases: binary installers such as `.dmg`, `.zip`, `.exe`, and `.AppImage`; `.deb` can be added after Linux validation.
- Version tags use `vX.Y.Z` and should match the `version` field in `package.json`.

## Data and Privacy

OPTOPROBE exports may include patient names, exam identifiers, hospital information, and exam dates. The repository ignores `.xlsx/.xls` files by default. Do not commit raw exam files. If example data is needed, place only fully anonymized files under `test-fixtures/opto/`.

## Technical Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Release Checklist](docs/RELEASE.md)
- [Experiment Analysis Design](docs/EXPERIMENT_ANALYSIS.md)
