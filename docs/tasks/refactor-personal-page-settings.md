# Refactor — personal page settings (master checklist)

**Status:** R1a complete, R1b next (8 November 2026)  
**Decision:** `docs/adr/0008-personal-page-settings.md`  
**Related:** ADR-0002, ADR-0007, `docs/plan.md`  
**Gate:** do not start M4c PDF until Page View is usable (arrows + density).

## Fixed decisions

- The canonical document is the **continuous canvas**: identity, chapters, blocks, content,
  branches, anchors, assets, schema version, revision.
- Page is a **personal lens**, not document identity.
- Page size, orientation, margins, PageTheme, manual page breaks, and view state are **outside
  `document.json`**.
- Settings resolution:
  - global defaults in `settings.json`;
  - per-document overrides in `shell-session.json`;
  - `PageSettings(doc) = merge(AppSettings.page, session.pageOverride)`;
  - `ContinuousSettings(doc) = merge(AppSettings.continuous, session.continuousOverride)`.
- `PageSetup`: A4 / A5 / Letter, portrait/landscape, margins. Default **A4 landscape**.
- `PageTheme`: preset `compact` (default), `comfortable`, `custom`; font/heading/code/table sizes;
  card padding/border; segment/sibling/wrap/callout gaps; max card width.
- **Compact is the default**; density is tuned by a lab, not guessed in CSS.
- Manual break hints are personal, not canonical.
- Continuous has **no pages**: no page model, markers, page numbers, continuation chips, or
  page-width guides.
- Page Read, Page Edit, Page measurement, and PDF consume the **same resolved PageSettings**.
- PDF uses the settings at export time. Settings are personal and do not travel with the file; the
  same file may export differently on another machine. Accepted.
- No legacy seeding: there are no real user documents. Schema v2 strips the old known fields; test
  notes/fixtures are adapted.

## Architecture target

```text
Document (canonical, continuous)
  chapters / blocks / content
  branches / anchors / assets

AppSettings (settings.json, personal)
  page: PageSettings
  continuous: ContinuousSettings

SessionTabState (shell-session.json, personal per document)
  pageOverride?: DeepPartial<PageSettings>
  continuousOverride?: DeepPartial<ContinuousSettings>
  layout / interactionMode / page / zoom / fit / scroll / focus

PageSettings = merge(global page, document override)
PageSettings
  setup: size / orientation / margins
  theme: preset / typography / card / gaps / max width
  manualBreakBeforeBlockIds

ContinuousSettings
  zoom (and future font/width/spacing)
```

Renderers:

```text
Continuous -> screen layout, no pages, own theme
Page Read/Edit -> resolved PageSettings, A4/A5/Letter, arrows, pages
PDF -> same resolved PageSettings and Page pages
```

## Phase checklist

### R1a — schema v2 and page-settings foundation

Brief: `docs/tasks/r1a-canonical-schema-v2.md`  
Status: **complete** — report `docs/reports/r1a-canonical-schema-v2.md`

- [x] ADR-0008 accepted.
- [x] Audit of current page/settings code and dead code.
- [x] `packages/layout/src/page-settings.ts`: types, defaults, normalize/merge, page dimensions,
      `pageLayoutOptions`, `pageCssVariables`.
- [x] Schema v2: `CURRENT_SCHEMA_VERSION = 2`.
- [x] Remove `pageSetup`, `manualBreakBeforeBlockIds`, `viewState` from `Document`.
- [x] Remove page fields from create commands, store, validation, serialize, restore, block cleanup.
- [x] Migration v1→v2 strips the three known legacy fields; preserves other unknown fields.
- [x] Layout/paginator stops reading manual breaks/page setup from the document (or marked
      transient debt explicitly reported for R1b).
- [x] Desktop page adapter/model uses default settings temporarily; app still runs.
- [x] Fixtures/scripts/tests updated; v1→v2 migration test.
- [x] Full verify: boundaries, typecheck, unit, UI, recovery, e2e.

### R1b — settings store + PageTheme wiring + compact density

- [ ] `settings.json` global store + IPC/preload/shared API.
- [ ] `SessionTabState` per-document overrides.
- [ ] Resolve PageSettings for the active document.
- [ ] Page measurement, Page Read, Page Edit, PageBlockEditor use resolved settings/theme.
- [ ] `styles.css` page typography driven by theme variables; no hard-coded page metrics.
- [ ] `page/segments.ts` list indent/gaps from theme.
- [ ] PDF print model consumes the same resolved settings.
- [ ] Density lab on showcase and scale-300: page count, blocks/page, line length, whitespace.
- [ ] Choose/tune Compact values; report before/after page count.
- [ ] No Continuous page settings; Continuous theme separate.

### R2 — Page arrows + remove Continuous page chrome

- [ ] Remove `PageBreakMarkers`, `page-markers`, marker CSS/tests/visual tests.
- [ ] Stop running the page model in Continuous; PageView owns it.
- [ ] Add Page edges using the same edge mapper as `packages/pdf/src/printModel.ts` (no second router).
- [ ] Primary solid, reference dashed/labeled; same-page route; cross-page `→ page N` / `← from page M`.
- [ ] Arrows in Page Read and Page Edit, not in Continuous.
- [ ] No DOM shift, no second paginator.

### R3 — Settings UI + personal manual breaks

- [ ] Settings dialog: page presets Compact/Comfortable/Custom; page size/orientation/margins.
- [ ] Global default vs per-document override.
- [ ] Continuous settings section (zoom; future font/width).
- [ ] Manual break hints stored in PageSettings, not document.
- [ ] Cleanup rules: delete removes; split keeps on original; merge keeps if either had one.
- [ ] Stale hint filtering against current blocks.
- [ ] Page break hint UI/action in Page/outline (if implemented; otherwise document the gap).

### R4 — Docs, spec/UX, fixtures, visual pass

- [ ] Spec v0.6/UX v1.6: document is continuous; page settings personal; page sizes; no continuous pages.
- [ ] ADR-0002/ADR-0007/ADR-0008 cross-references.
- [ ] `docs/design-tokens.md`: page theme tokens are settings, not global CSS.
- [ ] Update plan/AGENTS metrics and status.
- [ ] Rewrite/adapt the showcase: remove legacy page fields; page settings live outside.
- [ ] Product-owner visual/VoiceOver pass; screenshots.
- [ ] Full `verify`.

## Dead code / ambiguity list

- `PageBreakMarkers.tsx`, `page-markers.ts`, `.nf-page-marker*`, marker tests/visual.
- Continuous page model hook usage in `DocumentEditor`.
- `Document.viewState` type/validation.
- Core `PageSetup`, `PageOrientation`, `MarginsMm`, `DEFAULT_MARGINS_MM`,
  `DEFAULT_PAGE_ORIENTATION`, `defaultPageSetup`.
- `NoteDocument.pageSetup` / `manualBreakBeforeBlockIds` (target removal).
- `paginate` fallback to `document.manualBreakBeforeBlockIds`.
- `restore` command manual-break diff.
- `block`/`shared` manual-break cleanup.
- Static `PAGE_LAYOUT_OPTIONS` and partial `PAGE_CSS_VARIABLES`.
- Duplicate PageView edge routing vs `buildPrintModel`.
- `SettingsDialog` placeholder.
- Fixtures with `pageSetup` / `manualBreakBeforeBlockIds`.
- `App.tsx` test bridge orientation/manual breaks from document.

## Acceptance checklist (final)

- [ ] `document.json` has no page/print/view fields.
- [ ] Old v1 docs migrate to v2 safely; unknown fields preserved.
- [ ] Page settings are personal and resolved from global + per-document override.
- [ ] Page size A4/A5/Letter and orientation/margins work; default A4 landscape.
- [ ] Compact default produces a dense, readable Page View.
- [ ] Page Read/Edit/PDF/measurement share one geometry/theme.
- [ ] Continuous has no pages, markers, page numbers, or page model.
- [ ] Page arrows visible (primary/reference/cross-page).
- [ ] Page Edit works with the same geometry and commits safely.
- [ ] Manual breaks are personal and cleaned on delete/split/merge.
- [ ] Settings UI exposes presets and page setup; override is explicit.
- [ ] Tests/fixtures/docs/screenshots updated; full verify green.

## Open risks

- PDF is not reproducible across machines because the theme is personal (accepted).
- A5/Letter need pagination/print verification in M4c.
- Compact density may still need a wider layout/two-column decision after the lab.
- Per-document override UI vs global defaults must be clear, or users will fight the settings.
- Manual-break split/merge semantics need tests.
