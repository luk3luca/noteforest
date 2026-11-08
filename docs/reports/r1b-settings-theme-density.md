# R1b — settings store and PageTheme/density wiring

- **Role:** Implementer / Builder
- **Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-815ddc7f`
- **Branch:** `t3/r1b-settings-page-theme-density`
- **Base:** `bf4d0cd` — `docs: launch R1b settings store and page theme density`
- **Implementation commit:** `10c4067` — `feat: personal page settings store and compact page theme`
- **Report commit:** the follow-up docs commit that adds this file; the branch head SHA is reported in the handback message.
- **Status:** complete; no merge, no push.

## Summary

R1b resolves Page Read/Edit, DOM measurement, the shared page model, and the
future PDF/print model through one personal page lens:

```text
settings.json (AppSettings.page)
  + session.pageSettingsOverride[document]
  -> mergePageSettings(...)
  -> computePageModel / measurement / PageView / PageBlockEditor
```

The compact theme now drives actual pagination and on-screen metrics instead of
existing only in the model. The temporary `PAGE_LAYOUT_OPTIONS` and partial
`PAGE_CSS_VARIABLES` defaults are gone.

No Settings UI, Page arrows, Continuous marker removal, manual-break UI, or PDF
print compositor was added. The showcase and `/Users/luca/Documents` were not
modified.

## Settings and session schema

- Global store: `settings.json` in the app-support directory, beside
  `shell-session.json`. Missing, unreadable, or corrupt JSON falls back to
  `DEFAULT_APP_SETTINGS`.
- Main process: `readSettings()` normalizes on read; `writeSettings(input)`
  normalizes and writes atomically through `writeFileAtomic`.
- IPC/shared/preload: `bootstrap()` returns `settings: AppSettings`;
  `saveSettings(settings: AppSettings)` is the one write path. The IPC handler
  normalizes the payload again, so a malformed renderer value cannot write an
  unsafe page geometry.
- `SessionTabState` gains optional `pageSettingsOverride?: PageSettingsOverride`
  and `continuousSettingsOverride?: ContinuousSettingsOverride`.
  `readSession` normalizes them through `normalizePageSettingsOverride` /
  `normalizeContinuousSettingsOverride`; old tabs keep no override.
  `buildSession` writes only the overrides that exist.
- The override normalizers preserve partial overrides instead of expanding them
  into a full `PageSettings`. A document that only overrode orientation still
  follows a later global preset change.
- Renderer: `state/settings.ts` owns the global settings, per-document
  overrides, and the resolved getters/hooks. It loads at bootstrap, persists
  global changes through `saveSettings`, and schedules the normal session write
  for override changes. No second default-resolution path remains.
- Test bridge: `window.__noteforestTest.settings()`, `setSettings(...)`,
  `setPageSettingsOverride(packagePath, override)`, and
  `resolvedPageSettings(packagePath)`. `structure()` and each runtime
  `orientation` report the resolved personal values.

## Resolution path

```text
AppSettings (global settings.json)
  page: PageSettings { setup, theme, manualBreakBeforeBlockIds }
  continuous: ContinuousSettings { zoom }

PageSettings(doc) = mergePageSettings(appSettings.page, pageOverride)
ContinuousSettings(doc) = mergeContinuousSettings(appSettings.continuous, continuousOverride)
```

`PageView`, `PageBlockEditor`, `createDomPageMeasurement`, `computePageModel`,
and therefore the shared `ContinuousLayout` + `PaginatedDocument` consumed by
`packages/pdf/src/printModel.ts` all receive the same resolved object.

## PageTheme wiring

- `packages/layout/src/page-settings.ts`: added
  `normalizePageSettingsOverride`, `normalizeContinuousSettingsOverride`, and
  `mergeContinuousSettings`; existing `pageLayoutOptions` and
  `pageCssVariables` remain the single theme maps.
- `page/adapter.ts`: `pageSetupOf(settings)` and `corePageGeometry(settings)`
  now take explicit settings; `applyPageCssVariables(target, theme)` writes the
  full theme map.
- `page/model.ts`: `computePageModel(document, port, settings)` passes
  `pageLayoutOptions(settings.theme)`, `pageSetupOf(settings)`, and the resolved
  manual breaks to `layoutDocument` / `paginate`. A settings fingerprint is
  exported for the hook.
- `page/usePageModel.ts`: accepts resolved settings; a page setup, theme, or
  manual-break change re-runs measurement and pagination with the same
  cancellation/debounce contract.
- `page/measurement.ts`: applies the theme CSS variables to the measurement
  host and takes card chrome, segment gap, and list indent from
  `pageLayoutOptions(theme)`.
- `page/PageView.tsx`: takes resolved `PageSettings`; sheet dimensions, content
  box, margins, header/footer, chrome, and the Page Edit overlay use
  `corePageGeometry(settings)`; segments use the theme list indent; the theme
  map is written to the page scope.
- `page/PageBlockEditor.tsx`: overlay position, width, and max height come from
  the resolved geometry; the overlay also applies the theme map so its prose
  matches the page.
- `editor/DocumentEditor.tsx`: resolves settings once per open document and
  passes them to the page model and `PageView`.
- `App.tsx`: loads bootstrap settings/overrides before the shell becomes ready;
  the autosave subscription now also covers settings overrides.
- `styles.css`: `:root` holds compact fallbacks only. Page/measurement consume
  the inline theme map. Hard-coded page gaps (list, table cell, quote) now
  derive from page CSS variables; hard-coded page badge/missing-asset type
  sizes use the theme sizes.
- PDF/print: `computePageModel` is the only app caller of `layoutDocument` /
  `paginate`, so the print model receives the resolved setup and manual breaks.
  No print compositor work was done.

## Density lab

Command: `npm run test:visual:r1b` (build + `tests/visual/r1b-page-density.test.mjs`).

Corpus: the product-owner showcase is copied read-only into the isolated test
library (it is never modified); `fixtures/scale-300.json` plus its assets is the
committed second corpus. Measurements use the real DOM page surface at 1440×900,
not the DOM-free estimator. All variants use A4 landscape, 12 mm margins.

| Corpus | Variant | Pages | Blocks/page | Avg used content | Whitespace | Max prose line (capped card) | Max prose line (image block) | Table line | Overflow | Defects |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| showcase (82 blocks, 9 chapters) | Comfortable (pre-R1) | 27 | 3.04 | 515.2 px | 26.7% | 57.3 ch | 134.8 ch | 46.2 ch | 0 | 0 |
| showcase | Intermediate 9.5 pt / 400 px | 23 | 3.57 | 480.3 px | 31.7% | 61.3 ch | 153.0 ch | 51.2 ch | 0 | 0 |
| showcase | Compact (default) | 21 | 3.90 | 458.8 px | 34.7% | 67.4 ch | 153.1 ch | 52.8 ch | 0 | 0 |
| scale-300 (300 blocks, 3 chapters) | Comfortable (pre-R1) | 39 | 7.69 | 687.0 px | 2.3% | 58.0 ch | 59.0 ch | n/a | 0 | 0 |
| scale-300 | Intermediate 9.5 pt / 400 px | 33 | 9.09 | 647.9 px | 7.8% | 61.3 ch | 61.3 ch | n/a | 0 | 0 |
| scale-300 | Compact (default) | 28 | 10.71 | 656.6 px | 6.6% | 67.4 ch | 67.4 ch | n/a | 0 | 0 |

Notes:

- “Avg used content” is the mean fragment-covered height per page out of the
  703 px A4 landscape content box; whitespace is the remaining fragment area.
  It includes chapter-start slack and inter-card layout space, so it is not pure
  typographic leading.
- “Capped card” excludes blocks whose unbreakable content (here an image-bearing
  showcase block) forces a card wider than the 420 px text measure.
- Detailed JSON evidence: `artifacts/r1b/density.json`.

### Chosen values

Compact stays the default, unchanged from R1a:

```text
preset compact
body 9 pt / 1.3; headings 14 / 12 / 10.5 pt
code 8 pt / 1.3; table 8.5 pt / 1.25
card padding 8; card border 1
segment gap 4; sibling gap 16
wrap indent 12; max wrap indent 36; callout gap 12
max card width 420; min content width 160
```

Compact is both denser and still readable: 22% fewer pages on the showcase and
28% fewer on scale-300 than comfortable, 67 ch maximum capped prose measure
(below the 70–75 ch guideline), no overflow, no blocking defects. No product
density decision is needed now.

The remaining long line (153 ch) appears only in an unbreakable image-bearing
block, where the layout width policy lets min-content exceed the 420 px text
measure. That is a block-width/packing lever for a later slice, not a reason to
shrink the font.

## Screenshots

Compact Page Read, page 1 of the showcase:

- `artifacts/r1b/page-compact-1440x900-landscape.png`
- `artifacts/r1b/page-compact-1440x900-portrait.png`
- `artifacts/r1b/page-compact-960x720-landscape.png`
- `artifacts/r1b/page-compact-960x720-portrait.png`

The 960×720 portrait shot is fit-to-page at roughly 46%, so it is evidence of
geometry, not a full-size readability proof.

## Tests and timings

| Gate | Result |
|---|---|
| `npm run check:boundaries` | pass — 145 files, 696 imports, 16 rules |
| `npm run typecheck` | pass — desktop node/web, core, layout, pdf |
| Targeted vitest (settings/resolution/session) | 6 files, 41 tests in 0.29 s |
| `npm test` | 81 files, 808 tests in 2.24 s |
| `npm run test:ui` | 24 suites, 78 tests; exit 0; 312 s including build |
| `npm run test:recovery:run` | 14 tests pass in 17.9 s |
| `npm run e2e:critical` | 16 tests pass in 44.1 s |
| `npm run test:visual:r1b` | 1 suite / 1 lab test, 6 measurements + 4 screenshots; exit 0; 14.9 s including build |
| `npm run verify:fast` | exit 0; 52.9 s (boundaries + typecheck + 808 unit + 16 e2e) |

New coverage:

- Unit: settings read/write/default/corrupt/atomic round trip; override
  normalization, merge, app/continuous clamping; A4/A5/Letter geometry through
  the adapter; theme map application; page model setup + manual breaks; session
  override write/read round trip and corrupt legacy tabs.
- UI `tests/ui/r1b-page-settings.test.mjs`: compact Page Read typography and
  global re-pagination; per-document A5 override with geometry, page count,
  persistence and Page Edit overlay geometry; Letter geometry + bridge
  orientation; personal manual break adds a derived page while `document.json`
  stays free of page fields.
- Existing page UI suites (`m4b1-page-view`, `m4b1b1-page-edit-overlay`,
  `m4b1c-continuous-markers`) are green on the compact default.

E2E adaptation: the test bridge now exposes resolved
`manualBreakBeforeBlockIds` in `structure()`; the reload parity assertion
compares the canonical part only.

## Risks

- `styles.css` keeps compact `:root` fallbacks for detached page markup. The
  inline `pageCssVariables` map is canonical; the fallbacks must be updated with
  the preset or they will drift.
- The comfortable reference preset is no longer pixel-identical to pre-R1 for
  list/table gaps that used to be hard-coded (list gap 12 px vs 6 px; table cell
  vertical padding 9 px vs 6 px, both derived from card padding now). This only
  affects the on-demand reference preset, not the compact default.
- Image-bearing unbreakable blocks can exceed the 420 px text measure on a full
  page width, producing long prose lines. This is a layout width-policy lever,
  not a theme-size problem.
- Settings UI and manual-break UI/cleanup remain R3 work. Overrides are exercised
  through the test bridge only.
- `ContinuousSettings` is persisted and resolved but not yet consumed by the
  continuous surface; continuous zoom still lives in view state until R3.
- Prior page visual suites were not regenerated. They capture artifacts rather
  than compare baselines, so this is on-demand evidence, not a gate.

## Not verified

- Full `npm run verify` (the task requested one `verify:fast`); unit, UI,
  recovery, and critical e2e were run individually.
- On-demand visual suites `test:visual:m4b1`, `test:visual:m4b1b1`,
  `test:visual:m4b1c`, and `test:visual` (generic).
- Spike PDF gates and a real `printToPDF` export: the current app has no PDF
  export entry point; only the shared print model input was wired.
- Human visual/VoiceOver judgement of the compact theme. The four screenshots
  above are the evidence for the product-owner pass.
