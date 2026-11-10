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

The current layout is the latest shell direction: thin titlebar for traffic lights, toolbar aligned
with the content column, persistent rounded sidebar (collapsed to a 48 px rail), floating panels,
rounded tabs, and a Settings button inside the sidebar footer.
