# Release Checklist

## Versioning

Keep `package.json` and the Git tag aligned:

```bash
cnpm run check
git tag v2.1.0
```

## Build artifacts

Recommended release assets:

- macOS: `ERG Viewer-<version>-mac-arm64.dmg`
- macOS archive: `ERG Viewer-<version>-mac-arm64.zip`
- Windows: `ERG Viewer-<version>-win-x64.exe`
- Linux: `ERG Viewer-<version>-linux-x86_64.AppImage`
- Optional Linux deb: `ERG Viewer-<version>-linux-amd64.deb` after Linux verification

## Privacy boundary

Do not upload OPTOPROBE Excel exports unless they are fully anonymized. Raw `.xlsx/.xls` files may contain patient names, dates, hospital identifiers, or study IDs.

## GitHub layout

- Source repository: code, documentation, icon resources, build configuration.
- GitHub Release: installer binaries and their generated blockmaps.
- Local-only: `node_modules/`, `dist/`, raw input spreadsheets.
