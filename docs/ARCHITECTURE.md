# ERG Viewer Architecture

## Product intent

ERG Viewer is a focused desktop workstation for reviewing OPTOPROBE visual electrophysiology exports. The product goal is to reduce repetitive manual work around ERG/FVEP wave inspection: load a vendor Excel export, present right/left eye traces consistently, compare machine-recognized measurements with manual annotations, then export publication- or report-ready figures and data tables.

## Runtime shape

- `src/main/main.js`: Electron main process. Owns native dialogs, file read/write, clipboard image bridge, PDF printing, window sizing, and the About window.
- `src/preload/preload.js`: Narrow bridge exposed as `window.electronAPI`, plus renderer libraries exposed as `window.libs` to reduce file URL loading issues in packaged builds.
- `src/renderer/index.html`: Static renderer shell, CSS tokens, React/Plotly/XLSX script loading, and CSP.
- `src/renderer/renderer.js`: React UI, OPTOPROBE parsing, Plotly drawing, annotation state, export composition, and theme handling.
- `scripts/smoke_parse.js`: Headless parser smoke test for checking an Excel export without launching Electron.

## Data flow

1. The renderer asks the main process to show an Excel open dialog.
2. The main process records the selected path as an allowed read path.
3. The renderer asks for the file buffer and parses the first worksheet with `xlsx`.
4. Rows are normalized into `{ Item, Param, Value }`, basic metadata is extracted, and group keys like `R_01_详细数据(uv)` are collected.
5. Plotly renders each valid eye trace from parsed y values and computed x values.
6. Manual annotations live only in renderer memory for the current session.
7. Exports are written only after a save dialog records the destination as an allowed write path.

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

The checked-in `dist/` directory from local builds should not be part of the source repository.
