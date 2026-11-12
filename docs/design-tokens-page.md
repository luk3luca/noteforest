# Page design tokens

**Status:** Active (M4e3 split, 9 November 2026; M4e1/M4e2 settings platform and density lens)
**Source of truth:** `packages/layout/src/page-settings.ts` (`PageSetup`, `PageTheme`, density
constants, `pageLayoutOptions`, `pageCssVariables`), `packages/layout/src/page-chrome.ts`
(chrome and cross-page label geometry), `packages/layout/src/page-routing.ts` (Page route search),
and `packages/layout/src/edge-style.ts` (shared edge primitives).
**Index:** [`design-tokens.md`](design-tokens.md). **Continuous:** [`design-tokens-continuous.md`](design-tokens-continuous.md).

Page is the sheet lens: Page Read/Edit, Page measurement, and PDF consume one resolved
`PageSettings`. Page values are personal settings, not canonical document content (ADR-0008).
Continuous never reads this namespace.

## PageSetup

| Field | Default | Values / clamp | Consumer |
|---|---|---:|---|
| `setup.size` | `A4` | `A4` / `A5` / `Letter` | `pageDimensionsMm`, `pageGeometry`, Page, print |
| `setup.orientation` | `landscape` | `portrait` / `landscape` | same; document-wide |
| `setup.margins.top/right/bottom/left` | 12 mm | 0–100 mm each; the content area must leave at least 20 mm on each axis | geometry, chrome, Page, print |

A4 is 210 × 297 mm, A5 148 × 210 mm, Letter 215.9 × 279.4 mm; portrait/landscape swaps the axes.
`PX_PER_MM` is 96 / 25.4 and is the one conversion used by `pageGeometry`. Page size/margins are
resolved personal settings; pages are derived layout output, never document containers.

## PageTheme

`PageTheme` is the complete Page typography/box/topology surface. `preset` selects a starting
theme; explicit overrides win; `custom` is a marker for explicit values with no preset object.

### Numeric fields

| Field | Compact | Comfortable | Clamp |
|---|---:|---:|---|
| `density` | 1 | 1 | 0.6–1.2, 5% step; applied once by `effectivePageTheme` |
| `fontScale` | 1 | 1 | 0.5–2; advanced, hidden until the floor interaction is fixed |
| `bodyPt` (pt) | 9 | 10.5 | 6–24; density floor 7 |
| `bodyLine` | 1.3 | 1.45 | 1–2.5 |
| `headingScale` | 1 | 1 | 0.5–2; advanced, hidden until heading order is fixed |
| `heading1Pt` (pt) | 14 | 16 | 8–40; density floor body + 3 |
| `heading2Pt` (pt) | 12 | 13.5 | 7–32; density floor body + 1.5 |
| `heading3Pt` (pt) | 10.5 | 12 | 6–28; density floor body + 1 |
| `codePt` (pt) | 8 | 8.75 | 5–20; density floor 7 |
| `codeLine` | 1.3 | 1.45 | 1–2.5 |
| `tablePt` (pt) | 8.5 | 9.5 | 5–20; density floor 7 |
| `tableLine` | 1.25 | 1.35 | 1–2.5 |
| `labelPt` (pt) | 9 | 11 | 5–20; density floor 7 |
| `chromePt` (pt) | 7.5 | 8 | 5–16; density floor 6 |
| `markerPt` (pt) | 7 | 7.5 | 5–16; density floor 6 |
| `cardPadding` (px) | 8 | 12 | 0–40; density scales proportionally |
| `cardBorder` (px) | 1 | 1 | 0–8; not density-scaled |
| `segmentGap` (px) | 4 | 8 | 0–32; density scales proportionally |
| `siblingGap` (px) | 16 | 24 | 0–96; density scales proportionally |
| `wrapIndent` (px) | 12 | 18 | 0–96; density scales proportionally |
| `maxWrapIndent` (px) | 36 | 54 | 0–192; forced to at least `wrapIndent`; density scales proportionally |
| `childIndent` (px) | 26 | 26 | 0–96; density floor is `childTrunkInset + stemMin + 2` |
| `childTrunkInset` (px) | 12 | 12 | 0–96; density scales proportionally |
| `calloutTrunkInset` (px) | 24 | 24 | 0–96; density scales proportionally |
| `calloutCardIndent` (px) | 38 | 38 | 0–160, at least `calloutTrunkInset`; density scales proportionally |
| `calloutRightGap` (px) | 24 | 24 | `stemMin`–96; density scales proportionally, floor 12 |
| `calloutModeMinWidth` (px) | 240 | 240 | 0–800; not density-scaled |
| `calloutGap` (px) | 12 | 20 | 0–96; density scales proportionally |
| `maxCardWidth` (px) | 420 | 420 | 120–2000; density clamps the preset band to 240–560 |
| `minContentWidth` (px) | 160 | 160 | 80–800; density floor 140 for preset-range values |

### Non-numeric fields

| Field | Values | Notes |
|---|---|---|
| `preset` | `compact` / `comfortable` / `custom` | Compact is the product default. `custom` has no preset object. |
| `pagePacking` | `beside` / `stacked` / `compaction` | Presets use `beside`. `stacked` is the historical R2a geometry; `compaction` is a legacy lab oracle, not a preset or a Settings control. |

### Typography/box values that are not PageTheme fields

| Value | Owner | Notes |
|---|---|---|
| Heading line height `1.25` | Page CSS constant | No `headingLine` field yet. |
| Label line height `1.2` | Page CSS constant | No `labelLine` field yet. |
| Inline code size `0.86em` | Page CSS constant | Relative to body. |
| Code line minimum height `1.35em` | Page CSS constant | Part of the fixed code skin. |
| Table cell vertical padding | Derived | `cardPadding × 0.75`. |
| Quote border `3px` | Page CSS constant | Uses `--nf-page-rule`. |
| List marker width `1.2em` | Page CSS constant | Uses `wrapIndent` for list indentation. |
| Card radius `4px` | **Shared shell primitive** | Page cards consume `--nf-card-radius` from `DESIGN_TOKENS.cardRadius`; it is intentionally shared with Continuous and is not a PageTheme field. |
| Chapter gap `32px` | **Page engine constant** | `pageLayoutOptions` uses `DEFAULT_LAYOUT_OPTIONS.chapterGap`; the Continuous shell chapter gap is a separate 28 px token. Not a PageTheme field. |

## Density lens

One user-facing slider, 60–120%, step 5, default 100. The stored theme keeps the unmodified preset
or override; `effectivePageTheme` applies the lens exactly once and returns `density: 1`, so
applying it twice is the identity.

| Constant | Value | Meaning |
|---|---:|---|
| `PAGE_DENSITY_MIN` | 0.6 | Slider minimum (60%) |
| `PAGE_DENSITY_MAX` | 1.2 | Slider maximum (120%) |
| `PAGE_DENSITY_STEP` | 0.05 | 5% canonical step |
| `PAGE_DENSITY_DEFAULT` | 1 | 100% default |
| `PAGE_BODY_PT_FLOOR` | 7 | Body/label floor reached at 60% |
| `PAGE_MIN_CONTENT_WIDTH_FLOOR` | 140 | Minimum content width under density |
| `PAGE_MAX_CARD_WIDTH_MIN` | 240 | Density-scaled card-cap floor |
| `PAGE_MAX_CARD_WIDTH_MAX` | 560 | Density-scaled card-cap ceiling |

Below 100% type follows a floor-anchored curve: each preset size interpolates from its floor at
60% to the preset value at 100%, so 70% is denser than 80% and 60% is the densest step. At 60% the
compact theme resolves to body 7 pt, card padding 4.8 px, max card 252 px, min content 140 px, and
child indent 21.2 px. At 120% body is 10.8 pt, card padding 9.6 px, and max card 504 px. Box values
scale proportionally; page setup/margins never change. Density may change wrapping/topology because
the placed width and lane gate are geometric inputs; that is the current model, not a token drift.

## Wrap and indent semantics

- `wrapIndent` is a **per-level left-origin indent** used when a direct-child group wraps below its
  parent. In Page content it is also the nested-list indent (`projection.ts`), so it has two Page
  roles; Continuous does not read it.
- `maxWrapIndent` is a **per-level cap added from the wrapped group's parent left edge**. It does
  not accumulate across ancestors: each nested group applies the same cap from its own parent, and
  `wrapOriginX` also clamps the origin to the available right limit.
- `childIndent` is the Page-only direct-child origin when the whole group wraps or when callout mode
  B2 moves children below. It must leave room for the child trunk inset plus a 12 px stem.
- `DEFAULT_LAYOUT_OPTIONS.childIndent = 26` is only the DOM-free **engine default** for tests, labs,
  and the estimator. Page production always supplies the resolved `PageTheme.childIndent` through
  `pageLayoutOptions`; the Continuous renderer does not call `layoutDocument`.
- `childTrunkInset` / `calloutTrunkInset` / `calloutCardIndent` own the mode B2 two-trunk geometry.
  `calloutRightGap` and `calloutModeMinWidth` own the mode A right lane.

## Page packing and callout topology

Presets use `beside`, the product-owner tree model:

- Direct children share one vertical level column at the parent's y when the whole primary subtree
  fits to the right. Otherwise the atomic direct-child group moves below the parent at
  `childIndent` (floored by `wrapIndent`, capped by `maxWrapIndent`).
- Callouts stay below the parent in the legacy `stacked` order. With `beside`, each parent resolves
  one deterministic callout mode from the placed card and resolved Page width:
  **A** places anchored callouts in the free right lane (`calloutRightGap`, needs at least
  `calloutModeMinWidth`) and moves children below at `childIndent`;
  **B2** uses two below trunks, callouts first on the inner/right trunk
  (`calloutTrunkInset` 24, card 38) and children lower on the outer/left trunk
  (`childTrunkInset` 12, card 26);
  **stacked** is the only fallback, callouts first and children below on one shared trunk.
- Explicit `stacked` packing keeps the historical geometry and does not run the A/B2 choice.
  `compaction` remains a legacy lab oracle only.
- Page trunks group by `(parentBlockId, placement)`, continue across pages, and keep the below trunk
  attached at the parent card bottom (`EDGE_STYLE.trunkGap` 0). Wrapped Page children keep at least
  a 26 px indent for the 12 px trunk inset and 12 px stem. Both `childIndent` and
  `maxWrapIndent` are documented as per-level values above.

## Page chrome and labels

`pageChromeLayout(geometry)` is the single geometry function for Page Read and print:

| Value | Formula |
|---|---:|
| `left` / `right` | left / right margin |
| `headerTop` | `0.30 × top margin` |
| `ghostTop` | `0.62 × top margin` |
| `footerBottom` | `0.30 × bottom margin` |
| `continuesBottom` | `0.60 × bottom margin` |

Cross-page labels use `left = -leftMargin + 2` (from-edge) or `right = -rightMargin + 2`
(to-edge), with `maxWidth = max(18, margin - 4)`. Chrome text is derived from the canonical
document (`pageChromeContent`); it is not renderer state. Manual-break semantics and chrome
toggles are not part of this token set.

## Page route and shared edge values

Page Read/Edit and PDF share the edge renderer and orthogonal paths from `edge-path.ts`, but read
their own style object: `PAGE_EDGE_STYLE` in `packages/layout/src/edge-style.ts`. Page layout, the
page router, the Page renderer, and the print model never read `CONTINUOUS_EDGE_STYLE` or the
shared/base `EDGE_STYLE`; guard: `packages/layout/test/edge-style-isolation.test.ts`.

Page-only route search values (on top of the shared contract) are:

| Token | Value | Used for |
|---|---:|---|
| `pageClearance` | 3 px | Page route/card clearance |
| `pageLaneStep` | 4 px | Parallel duplicate Page edges |
| `pageTurnPenalty` | 60 px | Page route search cost, not a visual value |

Primary tree edges enter the target from the left; reference edges keep the generic router and
alternate entry sides. The full shared edge table (stroke, arrowhead, corner, lane, stem, trunk) is
in [`design-tokens-continuous.md#shared-edge-primitives`](design-tokens-continuous.md#shared-edge-primitives).
Do not add a second copy in the Page renderer or the print model. The Page stroke width reaches CSS
as `--nf-page-edge-width`, emitted by `pageCssVariables` from `PAGE_EDGE_STYLE.edgeWidth`; the
Continuous `--nf-edge-width` is not a Page token.


## Page presentation CSS variables

`pageCssVariables(theme)` emits only what the Page stylesheet consumes. Page Read/Edit, the
measurement host, and the print root write this map inline; `styles.css` has no fallback copy of
PageTheme and no dead Page geometry variables.

| Variable | Content |
|---|---|
| `--nf-page-body-size`, `--nf-page-body-line` | Body/prose type |
| `--nf-page-label-size` | Block label |
| `--nf-page-heading-1/2/3` | Heading sizes |
| `--nf-page-code-size`, `--nf-page-code-line` | Code |
| `--nf-page-table-size`, `--nf-page-table-line` | Tables |
| `--nf-page-chrome-size`, `--nf-page-marker-size` | Chrome and continuation/edge markers |
| `--nf-page-card-padding`, `--nf-page-card-border`, `--nf-page-segment-gap` | Card box and segment spacing |
| `--nf-page-max-card-width` | Page measurement host width/cap; Page measurement never reads the Continuous `--nf-child-max-width` |
| `--nf-page-edge-width` | Page arrow stroke width from `PAGE_EDGE_STYLE`; never the Continuous `--nf-edge-width` |

`fontScale`/`headingScale` multiply the already-floored type sizes in this map. They are advanced
values and are hidden until the floor/heading-order interaction is resolved; density remains the
supported type lever.

## Layout engine defaults (`DEFAULT_LAYOUT_OPTIONS`)

These are DOM-free engine defaults, not a Page or Continuous user setting. Page production overrides
the Page fields through `pageLayoutOptions(theme)`.

| Option | Default | Owner |
|---|---:|---|
| `minContentWidth` | 160 | Page theme (engine fallback) |
| `maxContentWidth` | 420 | Page theme (engine fallback) |
| `siblingGap` | 24 | Page theme (engine fallback) |
| `wrapIndent` | 18 | Page theme (engine fallback) |
| `maxWrapIndent` | 54 | Page theme (engine fallback), per level |
| `childIndent` | 26 | Page theme (engine fallback) |
| `childTrunkInset` | 12 | Page theme (engine fallback) |
| `calloutTrunkInset` | 24 | Page theme (engine fallback) |
| `calloutCardIndent` | 38 | Page theme (engine fallback) |
| `calloutRightGap` | 24 | Page theme (engine fallback) |
| `calloutModeMinWidth` | 240 | Page theme (engine fallback) |
| `calloutGap` | 20 | Page theme (engine fallback) |
| `chapterGap` | 32 | Page engine constant |
| `cardPadding` | 12 | Page theme (engine fallback) |
| `cardBorder` | 1 | Page theme (engine fallback) |
| `segmentGap` | 8 | Page theme (engine fallback) |

`wrapPolicy` defaults to `group-left-origin`; `pagePacking` defaults to `stacked` for DOM-free
layouts, while Page presets use `beside`. `calloutModes` defaults to false and Page sets it from
`pagePacking === 'beside'`.

## Print and PDF constraints

PDF is the Page layout in Read mode. It does not have a separate design system:

- The print model carries the resolved `PageSetup`, `PageTheme`, `pageCssVariables` map, and the
  exact measured run; a mismatched fingerprint fails export instead of re-paginating.
- `printToPDF` uses numeric zero margins, scale 1, `printBackground: true`,
  `preferCSSPageSize: true`, and no Electron header/footer. Page margins are internal content
  geometry, not print-driver margins.
- Print uses a fixed light skin; colors only, no metric overrides. One derived page maps to one
  sheet; CSS never re-paginates.
- A5/Letter geometry, portrait/landscape, and density flow through the same resolved settings as
  Page Read. Print-specific timeouts, window size, and validation tolerances are implementation
  constants, not Page design tokens.

## Removed legacy Page values

M4e3 removed the last unnamed Page literals without changing behavior:

- `CALLOUT_ROW_INDENT = 26` is gone; the legacy `calloutModes: false` beside lane uses the resolved
  `LayoutOptions.childIndent`.
- The 144 px readability floor and 16 px warning-anchor inset are now named engine constants
  (`LEGACY_BESIDE_READABLE_WIDTH`, `LEGACY_BESIDE_ANCHOR_INSET`) used only by that regression
  oracle. They are not PageTheme values.
- Unused `pxToMm`/`MM_PER_PX` helpers are gone; `mmToPx`/`PX_PER_MM` remain the one conversion.
- The compact theme CSS fallback block is gone; every Page surface applies `pageCssVariables`.
- Page measurement/card styles no longer read the Continuous `--nf-child-max-width`.
