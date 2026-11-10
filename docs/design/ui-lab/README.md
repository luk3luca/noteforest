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
the expanded / collapsed sidebar. The **Variant** bar switches the four shell experiments:

- **B · Toolbar icons** — view controls and undo/redo in the toolbar, icon-only.
- **C · Canvas header** — fixed header inside the canvas: undo/redo left, icon-only layout/mode
  right, edge-to-edge content and a tight bottom inset. **Preferred.**
- **D · Floating pill** — view controls and undo/redo in a floating pill over the canvas.
  **Preferred alternative.**
- **E · Sidebar** — view controls above Settings; E2 stacks two toggles in the collapsed rail, E3
  uses one View popover.

Active Library/Topics rows use a 1px accent ring around the usual rounded corners, not a left
accent stripe. All variants share the tab changes (no global close, shrinking tabs, `+` after the
last tab, no horizontal scroll) and the zoom dropdown removal (minus / percentage / plus only;
click the percentage to reset). The mock is everything below the lab bars; annotate that.

**Export** has a LAB-only state strip: Configure, Overwrite, Progress, Done, Failed, Cancelled. It
follows `docs/design/ui-export-contents.md` (560 px sheet, no native save dialog, in-sheet
overwrite, progress/cancel, all warnings).

**Palette** is searchable and keyboard-selectable: commands, documents with chapter counts, blocks,
disabled rows with a reason, and an empty state. It follows `docs/design/ui-overlays-keyboard.md`;
the command labels are the registry source.

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

The **Variant** bar is an exploration surface only. It does not change Electron; the selected
direction will be ported later, after the product-owner review. The implementation plan and the
complete reference index are in `docs/tasks/ui-rework.md`; future functions are recorded there and
stay empty/hidden until their phase starts.

**After UI Batches A/B:** Electron is the source of truth for the shell, Settings, Export, Palette,
and Page settings. The lab's Settings/Export/Palette/Page mocks predate the implementation and are
kept as the design reference only; the lab remains the shell/visual reference for the future pages.
