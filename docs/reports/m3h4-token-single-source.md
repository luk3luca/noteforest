# M3h4 — design-token single source and CSS guard

**Date:** 6 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `a builder worktree`  
**Branch:** `t3/token-single-source`  
**Base:** `e63644c` (docs: approve S3-8 and launch M3h4/M3h5; code base after `362d41d`)  
**Commit:** `954580b` — `refactor: make design tokens the single source for editor CSS`  
**Scope:** S3-3 only. No visual redesign, no type/radius/spacing scale, no new UI feature, no new
runtime dependency, no spec/UX/ADR/plan change. This report is a separate docs commit on the same
branch.

## Summary

`DESIGN_TOKENS` is now the only numeric source for the editor CSS geometry. Every CSS-bound value is
generated into `DESIGN_TOKEN_CSS_VARIABLES`, applied once to `document.documentElement` by
`applyDesignTokens()` before the React root mounts, and consumed by `styles.css` as `var(--nf-*)`.
There is no second hand-maintained copy of the numbers in CSS.

Canonical values are unchanged from the ratified render, not from the stale token fields:

- `editorPaddingBottom` **88 px** (token previously said 96; CSS already rendered 88).
- `chapterGap` **28 px** (token previously said 32; CSS already rendered 28).
- `siblingGap` / `--nf-child-gap` **24 px**.
- `callout.safeGap` **16 px minimum** (effective gap after the 24 px group gap is larger).
- Below-stack `rowIndent` 26, `trunkInset` 12, `trunkGap` 8, `stemMin` 12.

The rendered result is unchanged: layout snapshots are identical at 1440 and 960, and the 1440
screenshots are pixel-identical.

## Token / CSS mapping

### Root CSS variables (applied at boot)

| Token | CSS variable | Value |
|---|---|---:|
| `canvasMaxWidth` | `--nf-canvas-max` | 1600 px |
| `editorPaddingX` | `--nf-canvas-pad-x` | 40 px |
| `editorPaddingTop` | `--nf-canvas-pad-top` | 40 px |
| `editorPaddingBottom` | `--nf-canvas-pad-bottom` | 88 px |
| `editorPaddingXMedium` | `--nf-canvas-pad-x-medium` | 32 px |
| `editorPaddingTopMedium` | `--nf-canvas-pad-top-medium` | 32 px |
| `editorPaddingBottomMedium` | `--nf-canvas-pad-bottom-medium` | 72 px |
| `editorPaddingXCompact` | `--nf-canvas-pad-x-compact` | 28 px |
| `editorPaddingTopCompact` | `--nf-canvas-pad-top-compact` | 28 px |
| `editorPaddingBottomCompact` | `--nf-canvas-pad-bottom-compact` | 64 px |
| `chapterGap` | `--nf-chapter-gap` | 28 px |
| `siblingGap` | `--nf-child-gap` | 24 px |
| `childRowGap` | `--nf-child-row-gap` | 16 px |
| `cardPadding` | `--nf-card-padding` | 10 px |
| `cardRadius` | `--nf-card-radius` | 4 px |
| `childMinWidth` | `--nf-child-min-width` | 144 px |
| `childMaxWidth` | `--nf-child-max-width` | 420 px |
| `topLevelMinWidth` | `--nf-top-level-min-width` | 160 px |
| `topLevelMaxWidth` | `--nf-top-level-max-width` | 480 px |
| `rowIndent` | `--nf-row-indent` | 26 px |
| `edgeWidth` | `--nf-edge-width` | 1.25 |
| `edgeWidthActive` | `--nf-edge-width-active` | 1.75 |
| `edgeWidthMuted` | `--nf-edge-width-muted` | 1 |
| `zIndex.edge` | `--nf-z-edge` | 0 |
| `zIndex.rightGroup` | `--nf-z-right-group` | 0 |
| `zIndex.calloutLane` | `--nf-z-lane` | 1 |
| `zIndex.parentCard` | `--nf-z-card` | 2 |

CSS consumers include `.nf-canvas` (base + 1100/900 media steps), `.nf-chapter`, `.nf-chapter-blocks`,
`.nf-branch-children`, `.nf-branch-children-inner`, `.nf-block-body`, the top-level block variant,
the below row, primary/trunk/reference edges, the edge layer, the callout lane, and the right group.
`--radius-block` was removed; the block cards and block images use `--nf-card-radius` directly.

### Router-only tokens (TS, no CSS variable)

`trunkInset` 12, `trunkGap` 8, `stemMin` 12, `calloutGap` 16, `calloutMinWidth` 240,
`calloutMaxWidth` 480, `callout.safeGap` 16 minimum, `callout.maxAnchorOffset` 160, `edgeRadius` 2,
`edgeGap` 2, `edgeArrowLength` 6, `edgeArrowHalfWidth` 3, `edgeLaneMin` 2, `edgeLaneMax` 14,
`edgeMinGap` 4. These feed `geometry.ts` / `edge-routing.ts` placement and SVG coordinates and are
documented as router-only in `docs/design-tokens.md`.

`wrapIndent` 18 stays as a documented M4 reservation. `edgeBusOffset` and `edgePortSpacing` were
dead after the below-stack router and were removed; port distribution remains a router-only helper
(`distributePorts`) with no CSS consumer.

### Runtime-measured variables (not design tokens)

`--nf-lane-width`, `--nf-right-group-height`, `--nf-callout-offset`, `--nf-callout-dot-left`,
`--nf-callout-leader-left`, `--nf-callout-leader-width`, and `--nf-sidebar-width` stay per-element
values written from live measurements. `--nf-below-indent` was removed: the below row now reads
`--nf-row-indent`, so `BlockViews.tsx` no longer writes a duplicate value.

## Files changed

| File | Change |
|---|---|
| `apps/desktop/src/renderer/src/lib/design-tokens.ts` | Canonical 88/28; new `cardPadding`, `edgeWidthMuted`, `zIndex`, responsive canvas tokens; `DESIGN_TOKEN_CSS_VARIABLES`; removed dead bus/port tokens. |
| `apps/desktop/src/renderer/src/lib/apply-design-tokens.ts` | New boot helper; writes every mapped variable to the root. |
| `apps/desktop/src/renderer/src/main.tsx` | Applies tokens before `createRoot`. |
| `apps/desktop/src/renderer/src/lib/geometry.ts` | Re-exports the new tokens; drops `edgeBusOffset`/`edgePortSpacing`. |
| `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx` | Drops the duplicated `--nf-below-indent` write. |
| `apps/desktop/src/renderer/src/styles.css` | Consumes root variables for canvas/chapter/group/card/edge/z-index; removes geometry literals and `--radius-block`. |
| `apps/desktop/test/design-tokens-css.test.ts` | New guard test (10 tests) importing the TS tokens and parsing `styles.css`. |
| `apps/desktop/test/geometry.test.ts` | Asserts the new `GEOMETRY` values. |
| `tests/ui/m2-view.test.mjs` | New computed-style test at 1440 and 960 (root vars, canvas, chapter, child gap, card bounds, edge widths, selection transition, responsive steps). |
| `tests/ui/m3-anchor-callout.test.mjs` | Exact computed z-index assertions 2/1/0/0 for card/lane/group/edge. |
| `docs/design-tokens.md` | Documents the runtime mechanism, CSS-bound vs router-only values, responsive steps, stacking, and removed tokens. |
| `docs/reports/m3h4-token-single-source.md` | This report. |

## Guard test

`apps/desktop/test/design-tokens-css.test.ts` imports `DESIGN_TOKENS`, `DESIGN_TOKEN_CSS_VARIABLES`,
`GEOMETRY`, and the boot helper. It reads `styles.css` and `main.tsx` from disk. It fails if:

- a canonical value changes (88/28/24/16-minimum, card bounds, row indent, trunk/stem);
- a mapped CSS variable is declared statically in `:root` or used with a literal fallback;
- a mapped variable is missing from `styles.css` (dead token) or a CSS literal replaces it;
- `.nf-canvas`, chapter/group/card/edge/z-index rules stop consuming the expected variable;
- the responsive canvas steps stop consuming the medium/compact variables;
- `main.tsx` stops calling `applyDesignTokens()` before `createRoot(container)`;
- a router-only value appears as a CSS variable, or the removed bus/port tokens return.

The test is the drift gate, but the stronger guarantee is structural: the CSS never contains the
number, so changing a token changes the rendered value without editing CSS.

## Tests and timings

| Check | Result |
|---|---|
| `npm run typecheck` | pass, 4.1 s |
| targeted vitest (`design-tokens-css`, `geometry`) | 23/23 pass, 0.07 s |
| `npm test` | 48 files, 515/515 pass, 2.0 s |
| `npm run test:ui` | 12 files, 34/34 pass, 2:21.6 |
| `npm run e2e:critical` | 21/21 pass, 53.1 s |
| `npm run verify:fast` | exit 0, 60.1 s (typecheck + 515 unit + 21 e2e) |

`test:ui` includes the new computed-style test and the tightened callout stacking test.

## Visual evidence

Disposable screenshots (gitignored, generated from the built app with a fresh seeded demo):

- `artifacts/m3h4/before-clean/shell-1440x900.png` / `artifacts/m3h4/after-clean/shell-1440x900.png`
- `artifacts/m3h4/before-clean/shell-960x768.png` / `artifacts/m3h4/after-clean/shell-960x768.png`
- Layout snapshots: `artifacts/m3h4/before-layout/layout-{1440,960}.json` and
  `artifacts/m3h4/after-layout/layout-{1440,960}.json`

Comparison:

- 1440×900: **0 differing pixels**.
- 960×768: 636 differing pixels (0.086%), maximum channel delta **2**, confined to the canvas text
  area. A second after-run reproduces the same 636-pixel difference against the first after-run, so
  it is run-to-run text anti-aliasing, not a layout change.
- Layout snapshots (card x/y/width/height, depth buckets, scroll width, overflow, zoom) are
  **identical** before vs after at both 1440 and 960.

## Risks and notes

- The mechanism is runtime injection, not generated CSS. The app is React-rendered, so a failed
  boot would already be a blank window; the guard test checks that `main.tsx` applies the variables
  before render. If a future non-React surface (for example the M4 print renderer) imports
  `styles.css` alone, it must call `applyDesignTokens()` or receive the variables another way.
- CSS variables are used without numeric fallbacks on purpose; a fallback would be a second
  hand-maintained copy. The boot call is the only prerequisite.
- Breakpoint values (1100/900) are still CSS literals. This task tokenizes the canvas padding at
  those breakpoints, not the breakpoints themselves; the review lists breakpoints as a future item.
- `--radius-control`, `--radius-overlay`, colors, typography, and motion remain CSS variables; they
  are outside the geometry single-source scope.
- `wrapIndent` remains an unused M4 reservation by design.
- Historical reports that mention `--nf-below-indent` (for example M3g1) describe the state at that
  time; they were not rewritten.

## Not verified

- The full `npm run verify` is the Orchestrator's integration gate and was not run here.
- Product-owner subjective visual check, VoiceOver, and the M3 acceptance gate remain human.
- Performance (`test:perf`) and the full visual screenshot suite (`test:visual`) were not run; this
  change has no new runtime work beyond one boot loop over 27 CSS properties.
