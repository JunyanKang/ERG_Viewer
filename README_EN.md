# ERG Viewer

[中文](README.md)

ERG Viewer is a desktop visual electrophysiology analysis tool for OPTOPROBE Excel exports. It brings ERG/FVEP data loading, right/left eye waveform review, machine-result comparison, manual annotation, figure export, and data export into a single Electron application for ophthalmic electrophysiology experiments, clinical research quality control, and manuscript figure preparation.

## Features

- Data import: load OPTOPROBE `.xlsx` / `.xls` exports and automatically parse exam metadata, eye-side groups, and acquisition parameters.
- Waveform review: view right/left eye traces side by side or as a single-eye layout, with axis adjustment, reset, and theme switching.
- a/b-wave review: manually annotate a-wave and b-wave for dRod, dMax, and lCone, and compare manual measurements against machine-recognized results.
- Ops analysis: annotate Op1-Op5 peaks/troughs for dOps and calculate sum O.
- Flicker analysis: read machine-reported amplitude/phase and recompute Fourier-based components from the waveform.
- FVEP analysis: display machine-recognized N1/P1/N2/P2 results and support manual review annotations.
- Export and sharing: export PNG, SVG, and PDF figures, export plotting data as Excel, and copy images/data to the clipboard.

## Project Structure

```text
ERG_Viewer/
├── assets/                  # Source images and non-runtime assets
├── build/                   # electron-builder resources: icons and Windows extra files
├── docs/                    # Architecture, release, and maintenance notes
├── scripts/                 # CLI tools: icon generation and Excel parser smoke test
├── src/
│   ├── main/                # Electron main process
│   ├── preload/             # contextBridge / IPC API
│   └── renderer/            # React + Plotly renderer
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

## Checks and Smoke Test

```bash
cnpm run check
cnpm run smoke -- /path/to/OPTOPROBE-export.xlsx
```

`check` runs JavaScript syntax checks. `smoke` parses an Excel file and prints metadata plus group summaries without launching Electron.

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

OPTOPROBE exports may include patient names, exam identifiers, hospital information, and exam dates. The repository ignores `.xlsx/.xls` files by default. Do not commit raw exam files. If example data is needed, place only fully anonymized files under `docs/examples/`.

## Technical Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Release Checklist](docs/RELEASE.md)
