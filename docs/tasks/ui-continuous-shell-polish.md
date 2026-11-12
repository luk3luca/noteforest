# Continuous & shell polish — edge-style extraction, note surfaces, edge visibility, shell fixes

**Role:** Implementer / Builder
**Milestone:** UI settings — post-R3 polish (Continuous + shell)
**Base:** `main` at the commit that adds this brief (`a6447a1` plus the brief commit)
**Worktree:** created by the delegate from that base; do not work in the main checkout
**Timebox:** 5 hours

## Context

R3 is merged and green. The product owner reviewed the result and reported eight visual issues. Seven are in
this batch; item 7 (a live Continuous edge preview with 1 top-level + 2 children sharing a trunk + 1
callout) is deliberately **deferred to the R6 design** and must not be implemented here.

The batch starts with a **no-behavior-change extraction** of the edge style into Continuous and Page
styles, so R6 can expose Continuous edge settings without touching Page/PDF. The Page corridor standard
(18 px, density not scaling the edge) is a **separate next batch**, not this one.

## Goal

One worktree, three ordered commits:

1. extract `CONTINUOUS_EDGE_STYLE` / `PAGE_EDGE_STYLE` from the shared `EDGE_STYLE` with no visual or
   PDF change;
2. give Continuous cards a real note surface in light/dark, restore the top-level background, and make
   resting edges more visible;
3. fix the shell polish: Settings opens General, titlebar alignment, selection-toolbar icon weight,
   and the collapse-port circle.

## In scope

### Commit 0 — edge-style extraction (no-op)

- Keep `EDGE_STYLE` as the shared/base default for one release.
- Add `CONTINUOUS_EDGE_STYLE` and `PAGE_EDGE_STYLE`, each a separate object with the current values:
  - shared edge values: `gap`, `stemMin`, `laneMin`, `laneMax`, `trunkInset`, `trunkGap`,
    `arrowLength`, `arrowHalfWidth`, `edgeWidth`, `edgeWidthActive`, `edgeWidthMuted`,
    `referenceArrowLength`, `referenceArrowSpread`, `radius`, `minGap`;
  - Page-only values: `pageClearance`, `pageLaneStep`, `pageTurnPenalty`.
- Move the pure path/arrow algorithms to a shared `edge-path` module (`roundedPath`, `simplifyPath`,
  `arrowPoints`, `arrowPath`, `arrowDirectionVector`, `openArrowPath`, `openArrowForDirection`) and
  parameterize the arrow size/radius so each style can use its own values; keep the current defaults
  so existing callers do not change.
- Page layout/router/renderer/print (`layout.ts`, `page-routing.ts`, `page-edges.ts`,
  `page-settings.ts`, `PageEdges.tsx`, `PrintDocument`/print model) read **`PAGE_EDGE_STYLE` only**.
  The Continuous renderer reads **`CONTINUOUS_EDGE_STYLE` only**. No Page/print path may read the
  Continuous style or future Continuous settings.
- Split CSS edge-width usage where needed (`--nf-edge-width*` for Continuous, Page-scoped inline or
  `--nf-page-edge-width*` for Page) and update `design-tokens`/guard tests. Print uses the Page style.
- This commit is **visual no-op**: Page/PDF page count, text, raster parity and the Current Page/Read
  output must be identical. Update existing tests to import the appropriate style; add an isolation
  test that changing the Continuous style object/values does not change Page routing/print output.
- Do not change the Page corridor, density scaling of Page edges, or the 18 px standard here.

### Commit 1 — Continuous note surface, top-level background, edge visibility

- Add theme roles `--note-surface` and `--note-surface-hover` (dark and light) to the shell contract
  and `docs/design/color-system.md`:
  - dark: `--note-surface: #1b1d20`, hover `#202329`;
  - light: `--note-surface: #f6f8fb`, hover `#eef3f7`.
  Do not reuse `--surface-1` for cards: in light `surface-1` is white and equals the canvas.
- `.nf-block-body` uses `--note-surface`; hover uses `--note-surface-hover`; the top-level rule
  `background: transparent` is removed so top-level blocks have the same surface. Keep the existing
  active ring, radius and geometry.
- Increase Continuous resting edge visibility:
  - dark `--edge: #7b858f`, `--edge-muted: #565f68`;
  - light `--edge: #6c7882`, `--edge-muted: #9aa5ad`.
  Keep stroke widths 1.25/1.75/1 and arrowhead 6×6. Active edges remain the accent. Page/PDF edge
  colors are separate and must not change.
- Update the appearance CSS guard/contrast tests for the new surface roles and verify the card
  surface is distinct from the canvas in both themes; screenshots dark/light with top-level + child
  cards.

### Commit 2 — shell polish

- **Settings default page:** change `SettingsDialog` `initialPage` default from `page` to `general`.
  `⌘,` opens General; Help → Keyboard shortcuts still opens Editor; update tests that assert the
  default.
- **Titlebar alignment:** the “NoteForest” label sits slightly high relative to the native traffic
  lights. Fix with `line-height: 1` plus a small optical offset (`transform: translateY(0.5px)` or
  equivalent); do not change the 30 px height or the native traffic-light inset. Provide a 2×
  screenshot.
- **Selection toolbar icons:** the bubble uses 15 px icons while the app chrome uses 14 px. Change all
  SelectionToolbar icons to 14 px / stroke 1.5; keep the 26 px button target and the existing
  bubble surface/border/hover/pressed styles. Add a computed-size test.
- **Collapse port circle:** the expanded branch port is a bare chevron; the add-child/add-sibling
  controls are 18 px circles with border/background. Give `.nf-branch-port` the same circle in both
  expanded and collapsed states (18 px, border `--border-2`, background `--surface-2`, hover
  `--surface-3`), keep the chevron 12/1.5 and the child count when collapsed, and align its center
  with the add controls. Keep the `⌘.` toggle and accessibility labels; screenshot both states.

## Out of scope

- R6 Continuous settings, the live edge preview (item 7), Page edge corridor 18 px, density-independent
  Page edges.
- Page/PDF color/geometry changes; the Page skin and print output.
- Schema/migration/`settingsVersion`, new dependencies.
- Save-failure/repair banners, corrupt/missing RecoverySurface, status panel behavior.
- Any other visual restyle beyond the items above.

## Files

Read:
- `packages/layout/src/edge-style.ts`, `layout.ts`, `page-routing.ts`, `page-edges.ts`,
  `page-settings.ts`, `types.ts`, `packages/pdf/src/printModel.ts`.
- `apps/desktop/src/renderer/src/styles.css` (theme blocks, `.nf-block-body`, edge classes, bubble,
  branch port), `lib/design-tokens.ts`, `page/PageEdges.tsx`, `print/PrintDocument.tsx`,
  `editor/SelectionToolbar.tsx`, `editor/views/BlockViews.tsx`, `shell/TitleBar.tsx`,
  `shell/SettingsDialog.tsx`, `settings/settings-pages.ts`.
- `docs/design/color-system.md`, `docs/design-tokens-continuous.md`, `docs/design-tokens-page.md`,
  `docs/design-tokens.md`.
- Tests: `packages/layout/test/page-*.test.ts`, `packages/pdf/test/print-model.test.ts`,
  `apps/desktop/test/appearance-css-guard.test.ts`, `ui-batch-v-css.test.ts`,
  `tests/ui/ui-batch-a.test.mjs`, `ui-batch-v.test.mjs`, `m4b1-page-view.test.mjs`,
  `m4c1`/`m4c2`/`m4c3`, `tests/recovery/m2f-recovery.test.mjs`.

Expected to touch:
- The edge/layout/page/print files above, the shell/editor files above, theme blocks, tests, the
  color/token docs, and `docs/reports/ui-continuous-shell-polish.md`.

## Acceptance criteria

- [ ] Commit 0 is a visual no-op: Page/PDF page count, text, raster parity and the existing Page
      output are identical; Page code reads only `PAGE_EDGE_STYLE`; Continuous reads only
      `CONTINUOUS_EDGE_STYLE`; a test proves the styles are isolated.
- [ ] In light mode, Continuous cards have a visible surface distinct from the canvas; in dark mode
      the card surface is unchanged. Top-level blocks have a background in both themes; child cards
      and top-level hover use the note-surface tokens.
- [ ] Resting Continuous edges are visibly stronger in dark and light; active/ muted behavior and
      arrowheads are unchanged; Page/PDF edge colors are unchanged.
- [ ] `⌘,` opens Settings on General; Help → Keyboard shortcuts still opens Editor.
- [ ] The titlebar label is optically centered with the traffic lights; no height/inset change.
- [ ] Selection toolbar icons are 14 px / 1.5 and the 26 px targets/hover/pressed states remain.
- [ ] The collapse port is an 18 px circle in both expanded and collapsed states, with the count and
      keyboard/ARIA behavior preserved, aligned with the add controls.
- [ ] No schema/dependency change; no existing assertion weakened; no fixed sleep/native dialog.
- [ ] `npm run verify` exit 0 with real timings; `m4c1`/`m4c2`/`m4c3` green.

## Tests and evidence

- Targeted while working: edge/layout/print unit tests, `appearance-css-guard`, `ui-batch-a`,
  `ui-batch-v`, `m4b1-page-view`, the PDF suites, typecheck/boundaries.
- End of task: one full `npm run verify` (~3–4 min).
- Screenshots: dark/light Continuous cards (top-level + child), edge visibility, titlebar 2×,
  selection toolbar, collapse port expanded/collapsed. Put evidence in each suite's own
  `artifacts/<suite>` directory.

## Stop and ask

Stop and report when:

- the edge extraction changes any Page/PDF pixel, page count or text output;
- the split requires a paginator/print-compositor change beyond style wiring;
- the titlebar alignment cannot be fixed without changing the native traffic-light inset or height;
- the port circle changes the add-control alignment or card geometry in a way that needs a layout
  change;
- a baseline test fails for an unrelated reason.

## Report format

- Summary mapped to the three commits and the seven items.
- Files changed.
- Checks with real timings and suite counts.
- Acceptance criteria pass/fail with test/evidence.
- Open questions / risks.
- Next suggested step (Page edge corridor batch; R6 design with item 7 preview).

Commit in the worktree; do not merge or push.
