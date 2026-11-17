# R1a — canonical schema v2 and page-settings foundation

- **Role:** Implementer / Builder
- **Worktree:** `a builder worktree`
- **Branch:** `t3/r1a-canonical-schema-v2`
- **Base:** `e0c2968` — `docs: adopt personal page settings and schema v2`
- **Implementation commit:** `b5c3101` — `feat: canonical schema v2 and page-settings foundation`
- **Report commit:** the follow-up docs commit that adds this file; the branch head SHA is reported in the handback message.
- **Status:** complete; no merge, no push.

## Summary

ADR-0008 is implemented in three layers:

1. A pure page-settings module in `packages/layout` owns page size, orientation,
   margins, page typography/box theme, app/continuous defaults, normalization,
   merge, geometry, layout-option mapping, and CSS-variable mapping.
2. The canonical core document is schema v2 and no longer contains `pageSetup`,
   `manualBreakBeforeBlockIds`, or `viewState`. A single v1→v2 migration removes
   exactly those three known legacy fields and preserves every other unknown
   field.
3. Layout, paginator, and desktop no longer read page setup or manual breaks
   from the canonical document. Layout takes an explicit `PageSetup`; pagination
   takes manual breaks only as an option. The desktop page surfaces use
   `DEFAULT_PAGE_SETTINGS.setup` and an empty manual-break list until R1b wires
   the settings store.

No settings persistence, settings UI, Page arrows, density UI, or continuous
marker removal was added.

## Page-settings API (`packages/layout/src/page-settings.ts`)

Exported types:

- `PageSize = 'A4' | 'A5' | 'Letter'`
- `MarginsMm`, `PageSetup`, `PageGeometry`
- `PageThemePreset = 'compact' | 'comfortable' | 'custom'`
- `PageTheme` (preset, fontScale, body/heading/code/table/label/chrome/marker
  sizes and line heights, card padding/border, segment/sibling/wrap/callout
  gaps, max card width, min content width)
- `PageSettings { setup; theme; manualBreakBeforeBlockIds }`
- `ContinuousSettings { zoom }`
- `AppSettings { page; continuous }`
- `PageSetupOverride`, `PageSettingsOverride`, `ContinuousSettingsOverride`

Exported values/functions:

- `PAGE_THEME_PRESETS` — `compact` and `comfortable`.
  `comfortable` preserves the pre-R1 M4 page density; `compact` is the new
  dense product default.
- `DEFAULT_PAGE_SETTINGS` — A4 landscape, 12 mm margins, compact theme
  (body 9 pt/1.3, headings 14/12/10.5 pt, code 8 pt/1.3, table 8.5 pt/1.25,
  card padding 8, segment gap 4, sibling gap 16, wrap indent 12, max wrap
  indent 36, callout gap 12, max card width 420), empty manual breaks.
- `DEFAULT_CONTINUOUS_SETTINGS` (`zoom: 1`) and `DEFAULT_APP_SETTINGS`.
- `pageDimensionsMm(size, orientation)` and `pageGeometry(setup)` for
  A4/A5/Letter portrait and landscape.
- `pxToMm`, `mmToPx`, `PX_PER_MM`, `MM_PER_PX` (moved here from layout types).
- `pageLayoutOptions(theme)` → `LayoutOptions` (one tuning path).
- `pageCssVariables(theme)` → typography and box CSS custom properties,
  including `--nf-page-body-size`, heading/code/table/label/chrome/marker
  sizes, card padding/border, segment/sibling/wrap/callout gaps, max card
  width, and min content width.
- `normalizePageSettings`, `mergePageSettings`, `normalizeContinuousSettings`,
  `normalizeAppSettings` with safe enums, finite-number clamps, deduplicated
  manual breaks, and a fallback to default margins when margins would leave
  less than 20 mm of content.

The theme is deliberately **not** wired into `PageView` or DOM measurement in
this slice; R1b maps the compact theme.

## Core schema v2

- `CURRENT_SCHEMA_VERSION = 2`.
- Removed from `Document` and every canonical factory/input:
  `pageSetup`, `manualBreakBeforeBlockIds`, `viewState`.
- Removed core page vocabulary that became unused: `PageSetup`,
  `PageOrientation`, `MarginsMm`, `DEFAULT_MARGINS_MM`,
  `DEFAULT_PAGE_ORIENTATION`, `defaultPageSetup`, `ViewState`, `ViewMode`, and
  the `invalid-page-setup` / `invalid-break-hint` validation codes.
- `createDocument`, `document.create`, `CreateDocumentPackageInput`,
  `DocumentStore.create`, and `createDocumentPackage` no longer accept or emit
  page setup.
- Validation no longer requires/validates page setup, manual breaks, or view
  state.
- `serialize.ts` no longer seeds a missing manual-break list.
- `block.delete`, `block.merge`, `removeBlocks`, and `structure.restore` no
  longer clean up or restore manual breaks.
- `structure.restore` and `StructureRestoreCommand` keep their exact record
  restore behavior; the manual-break field was removed.
- Migration `v1 → v2` deletes only `pageSetup`,
  `manualBreakBeforeBlockIds`, and `viewState`, sets `schemaVersion: 2`, does
  not seed personal settings, and preserves all other unknown fields.
- Schema fixtures: `v1.json` (legacy with all three fields, `viewState`, and an
  unknown root field), `v2.json` (current), `v3-newer.json` (unknown newer);
  `v2-newer.json` was replaced. `invalid.json` is current v2.
- Added a migration test proving v1 fields are stripped, unknown fields survive,
  and the input object is not mutated.

## Layout status

- `NoteDocument` no longer declares `pageSetup` or
  `manualBreakBeforeBlockIds`; the transient document field was removed rather
  than carried as debt.
- `layoutDocument(document, port, options?, pageSetup?)` now takes an explicit
  `PageSetup`, defaulting to `DEFAULT_PAGE_SETTINGS.setup`. The returned
  `ContinuousLayout.pageSetup` is the explicit input, not document data.
- `paginate(layout, document, options)` no longer falls back to
  `document.manualBreakBeforeBlockIds`; hints come only from
  `options.manualBreakBeforeBlockIds`.
- Existing fixture tests preserve their historical geometry by injecting
  `FIXTURE_PAGE_SETUP` (A4 portrait, 20 mm) and passing the old manual breaks
  as pagination options. A new test covers the default landscape 12 mm
  geometry.

## Desktop compatibility

- `page/adapter.ts`: `pageSetupOf()`/`corePageGeometry()` use
  `DEFAULT_PAGE_SETTINGS.setup`; `toLayoutDocument` copies no page or manual
  fields. `PAGE_LAYOUT_OPTIONS` and `PAGE_CSS_VARIABLES` are unchanged for R1b.
- `page/model.ts`: layout uses `DEFAULT_PAGE_SETTINGS.setup` and pagination uses
  `DEFAULT_PAGE_SETTINGS.manualBreakBeforeBlockIds` (empty).
- `PageView` uses the default geometry for its loading/empty state.
- `App.tsx` test bridge: `orientation` comes from the default page settings;
  `structure()` no longer exposes manual breaks.
- Page Read and Page Edit still work on the defaults (UI suites pass).

## Fixtures, scripts, and tests

- Regenerated all `fixtures/*.json` at schema v2 without `pageSetup` or
  `manualBreakBeforeBlockIds`; `scripts/generate-fixtures.mjs` no longer writes
  them. `landscape-golden.json` remains a separate id/title copy; tests supply
  explicit setups.
- `scripts/lib/verify.mjs` checks PDF page size against the default page
  settings, not `document.pageSetup`; `run-gates.mjs` and `verify-pdf.mjs`
  updated.
- Core, layout, desktop, support, UI, e2e, recovery, and visual tests were
  updated. Continuous-marker UI/visual fixtures no longer need canonical manual
  breaks: many short blocks derive page boundaries between cards.
- New `packages/layout/test/page-settings.test.ts` (12 tests) covers defaults,
  presets, dimensions, geometry, normalization/clamps, merge, layout options,
  CSS variables, and scales.

## Checks and timings

| Gate | Result |
|---|---|
| `npm run check:boundaries` | pass — 144 files, 683 imports, 16 rules |
| `npm run typecheck` | pass — desktop (node + web), core, layout, pdf |
| `npx vitest run packages/core/test` | 364 tests pass (during development) |
| `npx vitest run packages/layout/test` | 41 tests pass in ~0.24 s |
| `npx vitest run apps/desktop/test` | 386 tests pass in ~1.0 s |
| `npm test` | 79 files, 791 tests pass in 2.19 s |
| `npm run e2e:critical` | 16 tests pass in 44.4 s (final `verify:fast` run) |
| `npm run test:ui` | 23 suites, 68 tests pass; ~4 min including build |
| `npm run test:recovery:run` | 14 tests pass in 17.8 s |
| `npm run test:visual:m4b1c` | 1 suite passes in 2.17 s; screenshots in `artifacts/m4b1c/` |
| `npm run verify:fast` | exit 0 (boundaries + typecheck + 791 unit + 16 e2e) |

During the UI run the 300-block continuous page model reported 30 pages and
18 markers; the Page Edit run reported 30 pages. Both are evidence that the
default landscape/12 mm geometry still paginates the full fixtures.

## Transient debt for R1b

- `PAGE_LAYOUT_OPTIONS` / `PAGE_CSS_VARIABLES` still carry the comfortable
  pre-R1 density while `DEFAULT_PAGE_SETTINGS` is compact. R1b must replace
  this with `pageLayoutOptions(settings.theme)` and `pageCssVariables(...)` and
  write them to the measurement host and page sheet.
- No settings store/IPC/UI yet. Desktop uses `DEFAULT_PAGE_SETTINGS`; manual
  breaks cannot be set from the UI and always resolve empty.
- The page adapter's `pageSetupOf()` is the one temporary default path until
  the resolved global + per-document settings are passed in.
- Continuous page markers still render page chrome; R1b removes them.
- PDF export still consumes `layout.pageSetup` from the default adapter; it has
  not been run in this slice.

## Risks

- A v2 document that still contains the three legacy fields is treated as
  unknown data and preserved; only v1→v2 strips them. This matches the open
  JSON model and ADR wording, but a canonical writer must not reintroduce them.
- Default page geometry changed for tests/UI that previously relied on
  portrait 20 mm documents. Functional suite timings and marker counts moved
  accordingly; the visual baselines are on demand and were regenerated for
  M4b1c only.
- `landscape-golden.json` is now content-identical to the portrait golden apart
  from id/title; orientation is supplied by tests until the settings store
  exists.
- The legacy Spike gate script is signature-updated but not part of the
  required gate and was not run.

## Not verified

- Full `npm run verify` (the task requested one `verify:fast`).
- Visual suites `test:visual:m4b1`, `test:visual:m4b1b1`, and the generic
  `test:visual`; only the M4b1c marker visual was run.
- Spike PDF gates (`spike:gates`, `spike:pdf:verify`).
- Human visual judgement of the new compact theme, since the theme is not
  wired yet.
- Manual Page Read/Edit on a machine other than the test harness.
