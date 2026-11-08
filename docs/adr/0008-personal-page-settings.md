# ADR-0008 — Personal page settings and a continuous canonical document

- **Status:** Accepted by the product owner (8 November 2026)
- **Decision owner:** Product owner
- **Supersedes:** document-level `pageSetup`, `manualBreakBeforeBlockIds`, and legacy `viewState`; the
  page/print parts of ADR-0007
- **Related:** ADR-0002 (PDF), ADR-0007 (layouts/modes), `docs/plan.md`

## Context

The product owner has fixed the model:

> The important thing when sharing a canvas is the continuous layout. The page is a personal lens:
> the reader decides A4, Letter, margins, density, and typography. The canonical document is the
> continuous canvas, not a page.

Today the canonical document still stores `pageSetup`, `manualBreakBeforeBlockIds`, and an optional
`viewState`. The page renderer, measurement, and PDF read those values from the document. This makes
page layout look canonical and keeps page concerns in the core.

There are no real user documents yet: only a few test notes and the showcase. They can be rewritten.

## Decision

### Canonical document

The canonical document contains:

- identity, title, chapters, blocks, content;
- branches, anchors, assets;
- schema version and revision.

It does **not** contain:

- page size, orientation, or margins;
- page theme/density/typography;
- manual page-break hints;
- view state.

### Personal settings

```text
AppSettings (global, personal, app-support settings.json)
  page: PageSettings            // default for every document
  continuous: ContinuousSettings

SessionTabState (personal, per document, shell-session.json)
  pageOverride?: DeepPartial<PageSettings>
  continuousOverride?: DeepPartial<ContinuousSettings>
  layout, interactionMode, page, zoom/fit, scroll, focus...
```

Resolution:

```text
PageSettings(doc)       = merge(AppSettings.page, session.pageOverride)
ContinuousSettings(doc) = merge(AppSettings.continuous, session.continuousOverride)
```

`PageSettings` contains:

```text
setup
  size: A4 | A5 | Letter
  orientation: portrait | landscape
  margins: top/right/bottom/left (mm)

theme
  preset: compact | comfortable | custom
  fontScale
  body size / line height
  heading scale
  code size / line height
  table size / line height
  card padding / border
  segment gap
  sibling gap / wrap indent / callout gap
  max card width

manualBreakBeforeBlockIds
```

`ContinuousSettings` is separate: zoom and future font/width/spacing. Continuous never reads page
settings.

### Page and PDF

- Page Read, Page Edit, Page measurement, and PDF use the same resolved `PageSettings`.
- Page size/orientation/margins and PageTheme are personal; they are not stored in `document.json`.
- PDF uses the settings at export time. The same file exported on another machine may produce a
  different PDF. This is accepted.
- Page size is no longer fixed to A4 in the data model; A4 is the default. A5/Letter are supported
  by the geometry function.

### Manual breaks

- `manualBreakBeforeBlockIds` is a personal Page setting, not canonical content.
- The renderer/settings layer owns cleanup when blocks are deleted, split, or merged:
  - delete: drop hints for removed blocks;
  - split: keep the hint on the original block; do not create a new hint;
  - merge: keep a hint if either the target or the removed block had one on the merged block;
    otherwise drop it.
- The core command layer no longer knows about manual breaks.

### Continuous

- Continuous has no pages, page numbers, page markers, continuation chips, page-width guides, or
  page model.
- Continuous is a pure continuous canvas with its own theme/zoom.
- Page chrome belongs only to Page Read/Edit and PDF.

### Schema v2

- `CURRENT_SCHEMA_VERSION` becomes 2.
- Migration v1→v2 removes `pageSetup`, `manualBreakBeforeBlockIds`, and `viewState` from the
  canonical document. It does not seed personal settings: there are no real user documents, and the
  test notes will be adapted.
- Unknown fields remain preserved; only these known legacy fields are removed.

### Settings UI

- Page settings are edited in Settings: global defaults plus a per-document override.
- Presets: Compact (default), Comfortable, Custom (granular values).
- Continuous settings are a separate section.
- The settings UI may land after the model foundation; the model and IPC must exist first.

## Consequences

Positive:

- Sharing a document shares the canvas, not a print setup.
- Page is a personal lens; a recipient can choose A4/Letter/A5 and density.
- Core/layout no longer carry page concerns.
- Page Read, Page Edit, PDF and measurement share one theme object.
- Continuous is genuinely page-free.

Negative / work:

- Schema v2 and fixture rewrite.
- New settings persistence/IPC and per-document overrides.
- PDF is not reproducible across machines unless a future export snapshot is added.
- Manual-break cleanup moves from core to the settings/view layer.
- Existing test notes and fixtures need adaptation.

## Revisit triggers

- The product owner wants PDF reproducibility or page settings embedded in a document.
- A shared document must preserve a specific page setup.
- Page Edit or Page Read needs a different page geometry from PDF.
- Settings become team/cloud-synced rather than personal-local.
