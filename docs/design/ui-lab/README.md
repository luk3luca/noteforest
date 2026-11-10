# NoteForest UI lab (browser)

Dev-only React/Vite lab for the shell design pass. It is **not** product code and is not part of
the app build. The real Electron shell remains the source of truth for behavior and Page/PDF.

## Run

From the repo root:

```bash
npx vite docs/design/ui-lab --port 5180
```

Open `http://127.0.0.1:5180/`.

The **LAB** bar at the top switches Workspace / Settings / Export / Palette, Continuous / Page, and
the expanded / collapsed sidebar. The mock is everything below the LAB bar; annotate that.

## Scope

- Full-shell visual mock: titlebar, toolbar, sidebar, Continuous canvas, Page, status strip,
  Settings, Export, palette.
- Uses the real palette/fonts and the target line from `docs/design/ui-references.md`.
- Does not load the app, the bridge, the layout engine, or the PDF pipeline.
- No product imports or dependencies; React and lucide come from the repo root.

## Status

The lab mirrors the Electron shell merged at `779c7fb` on `design/ui-map`, with the shell values
lifted from `apps/desktop/src/renderer/src/styles.css`: 30 px titlebar (traffic lights + app name),
44 px toolbar in the main column, 264 px sidebar / 48 px rail, 8 px floating panels, 3 px controls,
34 px / 7 px tab chips, 28 px view groups with 24 px segments, 26 px toolbar buttons, 24 px filter,
26 px library and tree rows, 24 px / 6 px floating status strip, 9 px Continuous note cards. The
mock document/library content is illustrative but follows the Electron V0 screenshot; the native
traffic lights are replaced by the lab's fake dots. The Page sheet is still a placeholder for the
Page design pass, and the Settings/Export/palette surfaces are design drafts, not Electron parity.
