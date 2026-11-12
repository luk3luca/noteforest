# Continuous & shell polish — implementation report

**Role:** Implementer / Builder
**Brief:** `docs/tasks/ui-continuous-shell-polish.md`
**Base:** `1a53f80` (`main` head + the brief)
**Branch:** `t3/ui-continuous-shell-polish`
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-08fa8615-ddf80bdb10bccfd5`
**Date:** 12 November 2026

## 1. Summary

Three ordered commits, one full verify (exit 0).

### Commit 1 — `refactor(edges): split Continuous and Page edge styles` (`bc6f591`)

- `packages/layout/src/edge-style.ts` keeps `EDGE_STYLE` as the shared/base default for one
  release and adds `CONTINUOUS_EDGE_STYLE` (shared values) and `PAGE_EDGE_STYLE` (shared + the
  three Page route values). Values are unchanged.
- New `packages/layout/src/edge-path.ts` holds the pure algorithms (`simplifyPath`, `roundedPath`,
  `arrowPoints`, `arrowPath`, `arrowDirectionVector`, `openArrowPath`, `openArrowForDirection`).
  Each arrow helper takes the style it must use and defaults to `EDGE_STYLE`, so existing callers
  keep their signature.
- Page layout/router/settings/renderer/print read `PAGE_EDGE_STYLE` only (`layout.ts`,
  `page-routing.ts`, `page-edges.ts`, `page-settings.ts`, `page-advanced.ts`, `PageEdges.tsx`).
  The Continuous renderer reads `CONTINUOUS_EDGE_STYLE` only (`design-tokens.ts`,
  `edge-routing.ts`, `reference-routing.ts`). `PrintDocument`/`printModel` carry no style and
  render through `PageEdges`.
- CSS edge width split: Page arrow rules consume `--nf-page-edge-width`, emitted by
  `pageCssVariables` from `PAGE_EDGE_STYLE.edgeWidth` (Page Read/Edit, measurement, and print all
  apply the same map). Continuous keeps `--nf-edge-width*`.
- Isolation tests: `packages/layout/test/edge-style-isolation.test.ts` (object ownership, a
  mutation of every Continuous value leaving `routePageEdge` and the whole Page edge model
  byte-identical, and a source-ownership scan) plus a print-model case in
  `packages/pdf/test/print-model.test.ts` (page count/fragments/edges/trunks identical under the
  same mutation, and the print CSS carries `--nf-page-edge-width` only).

### Commit 2 — `feat(continuous): note-card surface, top-level background, visible edges` (`ed18dbf`)

- `--note-surface` / `--note-surface-hover` added to both theme blocks and
  `docs/design/color-system.md`: dark `#1b1d20` / `#202329`, light `#f6f8fb` / `#eef3f7`.
- `.nf-block-body` uses `--note-surface`; hover uses `--note-surface-hover`. The top-level
  `background: transparent` rule and the separate top-level hover are gone, so top-level blocks are
  notes too. Callout cards use the same roles. Active ring, radius, and geometry are unchanged.
- Resting edges: dark `--edge #7b858f`, `--edge-muted #565f68`; light `--edge #6c7882`,
  `--edge-muted #9aa5ad`. Stroke widths 1.25 / 1.75 / 1, the 6 × 6 arrowhead, and the accent active
  edge are unchanged. Page/PDF edge colors and widths are their own skin and unchanged.
- Guards: `appearance-css-guard.test.ts` now covers the two surface roles (4.5:1 text contrast on
  every shell surface, card-vs-canvas distinctness ≥ 1.04 in both themes, every card state, resting
  edge visibility ≥ 3:1, muted edge dimmer than resting, and the unchanged Page/print colors).
  `ui-appearance-v3.test.mjs` adds computed-token, computed-stroke, arrow-bbox, hover, and Page
  edge-color checks with dark/light screenshots.

### Commit 3 — `feat(shell): General as the Settings default, titlebar optical center, 14 px bubble icons, 18 px branch port` (this is the branch head; see `git log`)

1. **Settings default:** `SettingsDialog` `initialPage` defaults to `general`. `⌘,` and the palette
   open General; Help → Keyboard shortcuts still opens Editor; the Page toolbar entry still targets
   Page. Suites that need the Page page navigate there explicitly; the shortcut suite asserts the
   new default and the gated-command behavior.
2. **Titlebar:** `.nf-app-name` uses `line-height: 1` plus `transform: translateY(0.5px)`. The 30 px
   row and the 84 px native traffic-light inset are untouched (`trafficLightPosition` 16/9). 2×
   titlebar screenshot + alignment JSON.
3. **Selection toolbar:** all six icons are 14 px / stroke 1.5; the 26 px targets and the bubble
   surface/border/hover/pressed styles are unchanged. A computed-size UI test asserts both.
4. **Collapse port:** `.nf-branch-port` is an 18 px circle in both states (border `--border-2`,
   background `--surface-2`, hover `--surface-3`), with the 12/1.5 chevron expanded and the child
   count inside the same circle when collapsed. `right/top: -9px` keeps its center on the add-child
   center line; the `⌘.` toggle, ARIA labels, and `data-collapsed` are unchanged. Screenshots cover
   both states.

## 2. Files changed

Commit 1 (edge style):

- `packages/layout/src/edge-style.ts`, `edge-path.ts` (new), `index.ts`, `layout.ts`,
  `page-routing.ts`, `page-edges.ts`, `page-settings.ts`, `types.ts`
- `apps/desktop/src/renderer/src/lib/design-tokens.ts`, `lib/edge-routing.ts`,
  `lib/reference-routing.ts`, `page/PageEdges.tsx`, `settings/page-advanced.ts`, `styles.css`
- `packages/layout/test/edge-style-isolation.test.ts` (new), `page-routing.test.ts`,
  `page-edges.test.ts`, `page-settings.test.ts`, `page-callout-modes.test.ts`
- `apps/desktop/test/page-token-guards.test.ts`
- `packages/pdf/test/print-model.test.ts`
- `docs/design-tokens.md`, `docs/design-tokens-continuous.md`, `docs/design-tokens-page.md`

Commit 2 (note surface + edges):

- `apps/desktop/src/renderer/src/styles.css`
- `apps/desktop/test/appearance-css-guard.test.ts`
- `docs/design-tokens-continuous.md`, `docs/design/color-system.md`
- `tests/ui/ui-appearance-v3.test.mjs`

Commit 3 (shell polish):

- `apps/desktop/src/renderer/src/shell/SettingsDialog.tsx`
- `apps/desktop/src/renderer/src/editor/SelectionToolbar.tsx`
- `apps/desktop/src/renderer/src/styles.css`
- `apps/desktop/test/ui-batch-v-css.test.ts`
- `docs/design/ui-settings-contents.md`
- `tests/ui/m2-shell.test.mjs`, `m4d1-page-density.test.mjs`, `m4e1-settings-platform.test.mjs`,
  `ui-batch-a.test.mjs`, `ui-batch-b.test.mjs`, `ui-editor-shortcuts.test.mjs`,
  `ui-overlay-command-gate.test.mjs`, `ui-settings-advanced.test.mjs`, `v0-shell-frame.test.mjs`
- `docs/reports/ui-continuous-shell-polish.md` (this report)

## 3. Checks and real timings

Targeted while working (each run once per affected area):

| Check | Result | Time |
|---|---|---|
| `npx vitest run packages/layout/test/page-*.test.ts` | 72 tests green (after the Page-style update) | 0.2 s |
| `npx vitest run packages/layout/test/edge-style-isolation.test.ts` | 3 tests green | 0.07 s |
| `npx vitest run packages/pdf/test/print-model.test.ts` | 19 tests green | 0.1 s |
| `npx vitest run apps/desktop/test/appearance-css-guard.test.ts` | 18 tests green | 0.08 s |
| `node --test tests/ui/ui-appearance-v3.test.mjs` | 6/6 green | 15.3 s |
| `node --test tests/ui/v0-shell-frame.test.mjs` | 5/5 green | 12.9 s |
| `node --test tests/ui/m2-shell.test.mjs` | 4/4 green | 11.6 s |
| `node --test tests/ui/ui-batch-a.test.mjs` | 6/6 green | 46 s |
| `node --test tests/ui/ui-editor-shortcuts.test.mjs` | 4/4 green | ~11 s |
| `node --test tests/ui/m4e1 + ui-overlay-command-gate + ui-settings-recovery` | 17 tests green | 40 s |
| `node --test tests/ui/ui-batch-b.test.mjs` | 10/10 green (3 consecutive runs) | 25 s each |
| `node --test tests/ui/ui-settings-advanced.test.mjs` | 8/8 green | 24 s |
| `node --test tests/ui/m4d1-page-density.test.mjs` | 3/3 green | 21 s |
| `npm run typecheck` | green, 4 workspaces | 5.2 s |
| `npm run check:boundaries` | 187 files, 907 imports, 16 rules | 0.38 s |

End-of-task gate:

| Check | Result | Time |
|---|---|---|
| `npm run verify` | **exit 0** | **2:52.40 wall** |
| Boundaries | 187 files, 907 imports, 16 rules | 0.38 s |
| Typecheck | 4 workspaces | 5.2 s |
| Unit (`vitest run`) | 114 files / **1183 tests** green | 8.4 s |
| Critical e2e (`tests/e2e/m2-editor.test.mjs`) | **16 tests** green | 44.2 s |
| Recovery (`tests/recovery`) | 3 suites / **14 tests** green | 18.2 s |
| UI (`tests/ui/run.mjs`) | **48/48 suites** green, 0 pageErrors | 99.9 s |

PDF/page gates inside the verify: `m4b1-page-view`, `m4b1a2`, `m4b1b1`, `r1b`, `r2a/r2b/r2d/r2e/r2f/r2g/r2i/r2j`,
`m4c1-print-compositor`, `m4c2-pdf-export`, `m4c3-pdf-gate`, `m4c3-packaged-export`, `m4d1`,
`m4d2` all PASS. No fixed sleeps were added; the new waits poll real DOM/document state.

## 4. Acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| Commit 0 is a visual no-op: Page/PDF page count, text, raster parity, existing Page output identical | **Pass** | Same numeric contract (all values copied); `m4c1` (print parity/raster), `m4c2`, `m4c3` (page count, text, raster ≤ 0.39 mm), `m4b1`/`r2*` page suites, and the untouched Page geometry unit tests all green in the full verify |
| Page code reads only `PAGE_EDGE_STYLE`; Continuous reads only `CONTINUOUS_EDGE_STYLE`; a test proves isolation | **Pass** | `edge-style-isolation.test.ts` mutates every Continuous value and asserts identical `routePageEdge` output and an identical serialized Page edge model; a source scan asserts the Page modules never name `CONTINUOUS_EDGE_STYLE`/`EDGE_STYLE` and the Continuous modules never name `PAGE_EDGE_STYLE`; `print-model.test.ts` proves the same for print |
| Light Continuous cards have a visible surface distinct from the canvas; dark card surface unchanged | **Pass** | `--note-surface #f6f8fb` vs canvas `#ffffff` (guard contrast 1.064); dark `#1b1d20` = previous `--surface-1`; UI computed check dark `rgb(27,29,32)` / light `rgb(246,248,251)`; `artifacts/ui-appearance-v3/continuous-note-surface-{dark,light}.png` |
| Top-level blocks have a background in both themes; child cards and top-level hover use the note-surface tokens | **Pass** | Top-level transparent rule and separate hover removed; guard asserts no `background` in the top-level rule and no top-level hover rule; UI asserts the computed top-level/child background and the hover color |
| Resting edges visibly stronger; active/muted behavior and arrowheads unchanged; Page/PDF edge colors unchanged | **Pass** | dark `#7b858f`/`#565f68`, light `#6c7882`/`#9aa5ad`; guard asserts ≥ 3:1 against the canvas, muted dimmer than resting, widths and `--edge-active`; UI asserts the computed stroke, 1.25 px width, 6 × 6 arrow bbox, and Page `rgb(63,111,143)`; print colors asserted unchanged |
| `⌘,` opens Settings on General; Help → Keyboard shortcuts still opens Editor | **Pass** | `SettingsDialog` default changed; `ui-editor-shortcuts` asserts General for `⌘,`, the gated command keeping the open page, and Editor from the native menu; `m4e1`/`ui-batch-a`/`ui-batch-b`/`ui-settings-advanced`/`m4d1`/`ui-overlay-command-gate` navigate to Page explicitly |
| Titlebar label optically centered; no height/inset change | **Pass** | `line-height: 11px`, `translateY(0.5px)`, label center 15.5 vs row center 15; 30 px height and 84 px inset asserted; `artifacts/v0-shell-visual/titlebar-alignment-2x.png` (2880 × 60, DPR 2) + `titlebar-alignment.json` |
| Selection toolbar icons 14 px / 1.5; 26 px targets and states remain | **Pass** | `ui-batch-a` computed test: six icons 14 × 14, stroke 1.5 px, targets 26 × 26, bubble `surface-3` + border; `artifacts/ui-batch-a/selection-toolbar-14px.png` |
| Collapse port is an 18 px circle in both states, count and keyboard/ARIA preserved, aligned with the add controls | **Pass** | `m2-shell` asserts 18 px in both states, border/surface/radius, chevron 12/1.5, count text, center line vs add-child within 0.5 px, and the count inside the circle; `branch-port-{expanded,collapsed}.png`; `ui-batch-v-css` static guard |
| No schema/dependency change; no assertion weakened; no fixed sleep/native dialog | **Pass** | No `settingsVersion`/schema/deps touched; changed assertions are spec changes (16 → 18 px, Page → General) or stricter waits (TipTap view ready, committed-document polling); no `waitForTimeout`; dialogs stay mocked |
| `npm run verify` exit 0 with real timings; m4c1/m4c2/m4c3 green | **Pass** | 2:52.40 wall; 48/48 UI; m4c1/m4c2/m4c3 PASS |

## 5. Open questions / risks

1. **`CONTINUOUS_EDGE_STYLE` is intentionally not frozen.** The isolation test mutates its values to
   prove Page/PDF cannot observe them. R6 must treat the object as read-only (or replace it with a
   resolved per-document style) rather than mutating it in production.
2. **The 2× titlebar evidence cannot include the native traffic lights.** macOS draws them outside
   the web contents, so the screenshot is a 2× render of the 30 px row and the JSON records the
   native `trafficLightPosition` and the 84 px inset the label is aligned to. The 2× capture relies
   on the device pixel ratio (2 on this machine); the JSON records `devicePixelRatio`/`screenshotScale`.
3. **Light card surface is deliberately subtle** (`#f6f8fb` on `#ffffff`, contrast 1.064). It is the
   brief's value; if the product owner wants more separation, a new value is a one-line token change.
4. **Page edge width is a single Page variable** (`--nf-page-edge-width`). Page arrows have no
   active/muted stroke variants; a future Page edge setting that needs them must add their own
   variables at that point.
5. **Page corridor 18 px and density-independent Page edges are untouched**, as required. The next
   batch must keep reading `PAGE_EDGE_STYLE` and must not introduce a Continuous read.
6. **Test-only race fixed in `ui-batch-b`:** the suite typed into a Page Edit overlay before TipTap's
   view had mounted, so the typed text could be inside the "unchanged" baseline. The suite now waits
   for `.ProseMirror[contenteditable="true"]` and focus inside the overlay before typing. No product
   code changed for this.
7. **`ui-batch-a`'s nav-arrow assertion now steps General → Appearance** (the nav steps from the
   active page), which is the same strength as the previous Page → Continuous assertion.

## 6. Evidence

- `artifacts/ui-appearance-v3/continuous-note-surface-dark.png`
- `artifacts/ui-appearance-v3/continuous-note-surface-light.png`
- `artifacts/v0-shell-visual/titlebar-alignment-2x.png`
- `artifacts/v0-shell-visual/titlebar-alignment.json`
- `artifacts/ui-batch-a/selection-toolbar-14px.png`
- `artifacts/m2-shell/branch-port-expanded.png`
- `artifacts/m2-shell/branch-port-collapsed.png`

## 7. Integration

- Merged into `main` at `b7b5459` with a merge commit (main already contained the palette research
  docs); the three feature commits are `bc6f591`, `ed18dbf`, and `ad7593d`.
- Full `npm run verify` on `main` at `b7b5459`: **exit 0, 173.59 s** — 114 unit files / 1183
  tests, 16/16 e2e, 14/14 recovery, **48/48 UI**, 0 pageErrors. Page/PDF parity and the 50+ page
  gate passed after the edge split.
- Next: palette tune from `research/color-palettes.md` (data-only; pending product-owner approval),
  then the Page edge corridor (18 px, density-independent), then R6 with the deferred live edge
  preview.

## 8. Next suggested step

1. **Page edge corridor batch:** standardize the 18 px Page edge corridor and make Page edges
   independent of density, still reading `PAGE_EDGE_STYLE`/`--nf-page-edge-width` only, with print
   parity and the 50+ page gate.
2. **R6 design (Continuous settings):** expose the Continuous edge values through
   `CONTINUOUS_EDGE_STYLE` (resolved per document), and design the deferred live edge preview
   (item 7: one top-level + two children sharing a trunk + one callout). The Page/print path must
   keep its isolation guard.
