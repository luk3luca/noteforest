# Page + Continuous settings UI — design plan

**Status:** planning only; no implementation started.  
**Scope:** settings/menu for Page and Continuous. Page layout changes (R2i/R2j)
must land first so the controls target stable values. M4c PDF consumes the
resolved settings but does not require this UI.  
**Related:** `docs/adr/0008-personal-page-settings.md`,
`docs/tasks/refactor-personal-page-settings.md`,
`docs/tasks/page-wrap-callouts-plan.md`.

## 1. Product principle

Page and Continuous are **two independent design systems**:

- **Page** is the sheet lens. It needs many adjustable values: page format,
  margins, density, typography, card widths, callout modes, indents, trunks,
  manual breaks.
- **Continuous** is the working canvas. It needs few: zoom, maybe canvas width,
  font/width/spacing later.
- They must not share a settings namespace, token file, preset, or docs page.
  They may share low-level renderer primitives (stroke, arrowheads, path
  helpers), but those are engine code, not user-facing design choices.

Consequence: the Settings UI is a **single dialog with two separate sections**,
not one merged form. Page gets the rich editor; Continuous gets a small panel.

## 2. Settings model

```text
AppSettings (settings.json, personal global)
  page: PageSettings
    setup: size / orientation / margins
    theme: PageTheme
    manualBreakBeforeBlockIds
  continuous: ContinuousSettings
    zoom, future canvasWidth/font/spacing

SessionTabState (shell-session.json, personal per document)
  pageOverride?: DeepPartial<PageSettings>
  continuousOverride?: DeepPartial<ContinuousSettings>
  view state: layout/mode/page/zoom/fit/scroll/focus

Resolved(doc) = merge(global, per-document override)
```

Rules:

- never write page settings into `document.json`;
- PDF/Page Read/Edit/measurement use the same resolved PageSettings;
- a document override is explicit and resettable to global;
- settings schema is versioned separately from document schema;
- invalid/out-of-range values are normalized, not silently clamped to something
  surprising;
- no network, no telemetry.

## 3. Page section

### 3.1 Page setup

- Size: A4 / A5 / Letter.
- Orientation: portrait / landscape.
- Margins: top/right/bottom/left in mm, with a live sheet preview.
- Reset to global default; “override for this document”.
- Validation: minimum content area; invalid margins fall back with a clear note.

### 3.2 Theme and typography

- Preset: Compact / Comfortable / Custom.
- Font scale and body/heading/code/table/label/chrome sizes.
- Line heights for body/code/table.
- Card padding, card border, card radius if exposed.
- `maxCardWidth`, `minContentWidth`.
- Segment gap, sibling gap, callout gap, wrap indent, max wrap indent.
- Live preview and reset per group.
- Custom mode becomes available when any value differs from the preset.

### 3.3 Layout behavior (R2i/R2j)

These are Page-only layout controls; some may be “advanced” rather than
first-class UI:

- `childIndent` / minimum wrapped-child indent;
- child trunk inset, callout trunk inset, callout card indent;
- callout right-lane gap and `calloutModeMinWidth`;
- mode preference: Auto (A/B2), force A, force B2, fallback B1/stacked;
- subtree-fit behavior (probably not user-editable; a design constant);
- single-trunk vs two-trunk callout mode visibility.

The exact exposed set is an open decision. Recommended: expose geometry groups
and an “Advanced” disclosure, not 30 raw fields.

### 3.4 Manual page breaks

- Add/remove a break before a block.
- List of active hints with block title and page.
- Stale hints filtered; missing blocks never crash.
- Cleanup on delete/split/merge:
  - delete removes;
  - split keeps on the original;
  - merge keeps if either side had one.
- Manual breaks are personal, never canonical.
- Page break hint action in Page/outline or a documented gap.

## 4. Continuous section

- Zoom (current).
- Future: canvas width, font/width/spacing.
- No page format, margins, PageTheme, callouts, or manual breaks.
- Reset to global; per-document override only where meaningful.
- Keep this panel deliberately small.

## 5. UI structure

Recommended:

```text
Settings
  Page
    Setup
    Theme
    Layout / Callouts (Advanced)
    Manual breaks
  Continuous
    Canvas / Zoom
    (future type & spacing)
  About / Data
```

- Left navigation or tabs; Page selected when opened from Page.
- Scope control at the top of each section: “Global default” vs “This document”.
- Live preview: a page thumbnail for Page; no preview needed for Continuous.
- Per-group Reset; “Reset all Page settings”; “Use global defaults”.
- Apply/Cancel only if edits are local; otherwise instant-save with an undo
  toast. Pick one and test it; no mixed behavior.
- Keyboard and VoiceOver: focus order, labels, value units, reset buttons.
- No native dialogs unless unavoidable; use in-app controls.
- Settings screen must work in Page Read? Settings is a shell action; it should
  not mutate document content.

## 6. Persistence and migrations

- Global settings: `settings.json` with an explicit settings schema version.
- Per-document overrides: `shell-session.json`, keyed by package path.
- Atomic writes; corrupt settings fall back to defaults and report a warning.
- Old settings fields migrate in a pure function; unknown fields preserved.
- Deleting a document removes its per-document override (or leaves it inert;
  decide and test).
- Settings changes re-run the Page model and update PDF defaults; no document
  revision/undo entry.

## 7. Tests and evidence

- Pure settings store: merge/normalize/preset/custom/reset/migration.
- UI: open/close, change Page size/orientation/margins, preset switch, custom
  value, scope global/document, reset, reload persistence.
- Page/PDF consume the same resolved values.
- Manual break add/remove/cleanup/stale; split/merge cases.
- Accessibility: keyboard, labels, focus, VoiceOver smoke.
- Screenshots: Page settings, Continuous settings, portrait/landscape preview.
- Full `verify` at integration.

## 8. Sequence and dependencies

1. R2i/R2j Page layout values frozen in `PageTheme`.
2. P0 token/doc split: Continuous tokens, Page tokens, shared edge primitives.
3. Settings UI skeleton + Page setup/theme.
4. Callout/layout advanced controls (after R2j).
5. Manual breaks.
6. Continuous panel.
7. R4 docs/spec/UX sweep and product-owner VoiceOver/visual pass.

M4c PDF can ship before the full Settings UI using defaults/resolved settings;
the UI is R3 after the Page/PDF checkpoint.

## 9. Open decisions

1. Instant-save vs explicit Apply/Cancel.
2. Which R2i/R2j geometry values are user-facing vs advanced/constant.
3. Page preview inside Settings: miniature or live Page?
4. Per-document override default: off (use global) or on after first edit?
5. Continuous panel scope: only zoom now, or canvas width in the same release?
6. Manual-break entry point: Page toolbar, outline context menu, or both.
7. What happens to a per-document override when the document is renamed/moved.
8. Reset semantics when the global default changes after a document override.

## 10. Acceptance for the future implementation

- [ ] Page and Continuous settings are separate sections/namespaces.
- [ ] Global vs per-document override is explicit and resettable.
- [ ] Page Read/Edit, measurement, and PDF use one resolved PageSettings.
- [ ] Manual breaks are personal and cleaned safely.
- [ ] No page/print fields in `document.json`.
- [ ] Settings survive restart and corrupt files fall back safely.
- [ ] Keyboard/VoiceOver pass; screenshots supplied.
- [ ] Full verify green.
