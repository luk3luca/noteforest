# Refactor — personal page settings (master checklist)

**Status:** R1a/R1b/R2a/R2b complete, R2c complete, R2d complete; **STOP after R2d for product-owner check** (8 November 2026)  
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

Status: **complete** — report `docs/reports/r1b-settings-theme-density.md`

- [x] `settings.json` global store + IPC/preload/shared API.
- [x] `SessionTabState` per-document overrides.
- [x] Resolve PageSettings for the active document.
- [x] Page measurement, Page Read, Page Edit, PageBlockEditor use resolved settings/theme.
- [x] `styles.css` page typography driven by theme variables; no hard-coded page metrics.
- [x] `page/segments.ts` list indent/gaps from theme.
- [x] PDF print model consumes the same resolved settings.
- [x] Density lab on showcase and scale-300: page count, blocks/page, line length, whitespace.
- [x] Choose/tune Compact values; report before/after page count.
- [x] No Continuous page settings; Continuous theme separate.

### R2a — Page arrows + remove Continuous page chrome

Status: **complete** — report `docs/reports/r2a-page-arrows-cleanup.md`

- [x] Remove `PageBreakMarkers`, `page-markers`, marker CSS/tests/visual tests.
- [x] Stop running the page model in Continuous; PageView owns it.
- [x] Add Page edges using the same edge mapper as `packages/pdf/src/printModel.ts` (no second router).
- [x] Primary solid, reference dashed/labeled; same-page route; cross-page `→ page N` / `← from page M`.
- [x] Arrows in Page Read and Page Edit, not in Continuous.
- [x] No DOM shift, no second paginator.

### R2b — Page packing/width density

Status: **complete** — `beside` implemented and merged; report `docs/reports/r2b-page-packing.md`. Density improved only 21→20 pages, so R2c is the real compaction engine.

- [ ] After compact, test the horizontal levers: wider max card, callout-right lane, two-column top-level packing.
- [ ] Product-owner decision if two-column changes the reading flow; report page count and whitespace.
- [ ] Implement the chosen lever only after the Page arrows/marker cleanup is stable.

### R2c — Page compaction placement

Status: **superseded by the product-owner tree model (8 November 2026)**. Row
fill put siblings and callouts in one row and lost the tree. The compact page
now uses `beside`: siblings share one level column, the next sibling starts
below the previous subtree, callouts stay below the parent, and a group that
does not fit wraps below its own parent. `compaction` remains a density-lab
oracle only. Page edges also use semantic ports (callout/below/beside), labels
move to the page margin, and images cap at maxCardWidth.

- [x] Fill rows with callouts + primary children; align/indent from parent; wrap when full.
- [x] Reference targets stay at their primary home; edges only.
- [x] Lab compaction vs beside vs stacked; compaction is now a lab oracle, not the product default.
- [x] R2d: unify Page/PDF edge style with the Continuous orthogonal router.

### R2f — Page edge topology

Status: **complete on WIP; verified**. `LayoutBlock.placement` and one
`PageEdgeTrunk` per `(parent, placement)`; right siblings share the right trunk,
callouts/wrapped children share the below trunk, every primary tree edge enters
left, and Page/PDF consume the same `PageEdge` records. Report:
`docs/reports/r2f-page-edge-topology.md`.

### R2g — Page trunk continuity

Status: **complete on WIP; verified**. One group trunk per `(parent, placement)`
across pages with a stable `x` and page segments: parent page to content bottom
when later children exist, pass-through pages top-to-bottom, last page to the
last arm. Nested trunks remain independent; below trunks use the 8 px
`trunkGap`; cross-page tree arms are `direction: 'trunk'` with no `p.N` chip.
References keep their target-only indicator. Report:
`docs/reports/r2g-page-trunk-continuity.md`.

### PRODUCT-OWNER CHECKPOINT — after R2d

Status: **ready for product-owner Page check after R2g** (8 November 2026)

- [x] Full `npm run verify` on the integrated main.
- [x] Continuous stress-test overlap/height fix (8 November 2026): the right-group reservation is
      per node (nested renderers reset `--nf-right-group-height`) and `BranchChildrenView` retries
      host attachment instead of giving up when a node view mounts in a temporary container.
      Evidence: stress note 150 blocks, 7 chapters; chapter 01 8,028 px, chapter 02 starts at
      8,839 px, 0 cards cross their chapter bottom. At 1440×900 the usable canvas content is
      1,078 px, so 480 + 24 + 420 fills the row and the next level wraps; at 70% zoom the canvas
      reaches its 1,600 px shell width (1,520 px content) and a third level fits. This is the D23
      finite-width rule, not an infinite canvas.
- [ ] Hand the build/screenshots to the product owner for a visual/density/arrow/trunk pass. (ready; full verify 855 unit / 29 UI suites / 90 tests / 16 e2e / 14 recovery, 0 pageErrors)
- [ ] Do **not** start R3 (Settings UI/manual breaks), R4 docs, or M4c PDF until the checkpoint is accepted or fixes are requested.
- [ ] If the checkpoint fails, fix Page placement/arrows/density before any PDF work.

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
