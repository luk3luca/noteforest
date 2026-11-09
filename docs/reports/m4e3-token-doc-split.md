# M4e3 — Page/Continuous token + docs split report

**Role:** Implementer / Builder  
**Task:** `docs/tasks/m4e3-token-doc-split.md`  
**Base:** `main` at `cc073b2` (M4e1/M4e2 merged)  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-7962f0f0-9c3c938ff07c157a`  
**Branch:** `t3/m4e3-page-continuous-token-docs-split`  
**Head at report time:** see the commit containing this report (`git rev-parse HEAD`).

## Summary

M4e3 is a behavior-preserving ownership cleanup, not a feature. Page and Continuous now have
separate token documents, the last unnamed Page literals and the duplicated compact CSS fallback are
gone, Page measurement reads the Page cap instead of the Continuous `--nf-child-max-width`, and the
dead Page CSS/JS surface is removed. Layout, Page geometry, density values, page counts, and PDF
output are unchanged.

No product decision was needed. No density value/floor/curve, PageTheme behavior, layout/packing,
callout geometry, settings persistence, or UI changed. Nothing was merged or pushed.

## Files changed

### Code

- `packages/layout/src/types.ts` — `maxWrapIndent` is documented as per-level, not cumulative;
  `DEFAULT_LAYOUT_OPTIONS.childIndent` uses the named `ENGINE_DEFAULT_CHILD_INDENT` fallback and the
  field comment states that Page production supplies `PageTheme.childIndent`; stale
  “compaction for compact” comment fixed.
- `packages/layout/src/layout.ts` — removed `CALLOUT_ROW_INDENT` (the legacy beside lane now uses
  `LayoutOptions.childIndent`); named the 144 px readability floor and 16 px warning inset as
  documented legacy engine constants for the `calloutModes: false` regression oracle.
- `packages/layout/src/page-settings.ts` — removed unused `pxToMm`/`MM_PER_PX`; pruned
  `pageCssVariables` to the 16 variables the Page stylesheet actually consumes, keeping
  `--nf-page-max-card-width` as the Page measurement width/cap; documented Page chapter-gap
  ownership (engine constant 32 px, not PageTheme).
- `apps/desktop/src/renderer/src/styles.css` — deleted the hand-maintained compact PageTheme fallback
  block (Page colors remain); `.nf-measure-card` and `.nf-measure-settle` now use
  `--nf-page-max-card-width`; Page card radius keeps the documented shared `--nf-card-radius`
  primitive.
- `packages/layout/test/page-settings.test.ts` — updated the CSS-map contract and added an exact
  Page variable-key guard.

### Tests

- `apps/desktop/test/page-token-guards.test.ts` (new) — guards the Page/Continuous docs and values,
  Page CSS ownership, no compact CSS fallback, runtime application of the Page map, removed legacy
  literals/dead conversions, and the engine-default contract.

### Docs

- `docs/design-tokens.md` — now a short index; links the two surface docs and records ownership/guards.
- `docs/design-tokens-page.md` (new) — PageSetup, PageTheme/density, wrap/indent semantics, packing and
  callout topology, chrome/labels, Page route values, Page CSS map, engine defaults, print/PDF
  constraints, removed legacy values.
- `docs/design-tokens-continuous.md` (new) — Continuous zoom/view state, shell tokens/CSS variables,
  router-only tokens, runtime variables, callout lane/safe zone, shared edge primitives, stacking,
  future resize tokens.
- `AGENTS.md` — docs-map link points at the index plus the Page/Continuous docs.
- `docs/adr/0006-page-group-wrap.md` — link points at the Page token doc.

## Acceptance criteria map

| Criterion | Evidence |
|---|---|
| Index + Page + Continuous token docs, links updated; no mixed ownership | `docs/design-tokens.md` is an index; Page/Continuous docs are separate; `AGENTS.md` and ADR-0006 links updated; source-of-truth lines and ownership tables make namespaces explicit. |
| Legacy Page literals/fallback removed or generated/documented; behavior unchanged | `CALLOUT_ROW_INDENT` gone; 144/16 are named legacy engine constants; compact CSS fallback gone; r2i/r2j artifacts byte-identical before/after. |
| Page measurement no longer reads a Continuous-only token | `.nf-measure-card`/`.nf-measure-settle` use `--nf-page-max-card-width`; guard asserts the Page scope has no Continuous-only token and measurement applies the Page map. |
| Unused Page CSS vars/literals removed or wired; guard tests | 12 dead geometry vars removed from `pageCssVariables`; `--nf-page-max-card-width` wired; exact 16-key guard plus no-declaration/no-dead-var guards. |
| `maxWrapIndent`/`childIndent`/compaction comments corrected or contract documented | Per-level wording in `types.ts` and both docs; `ENGINE_DEFAULT_CHILD_INDENT` documents the 26 px engine fallback; stale compaction comment replaced. |
| Page counts/geometry/density/PDF results unchanged | r2i/r2j JSON byte-identical; real-DOM density table unchanged at 100% (27/21/35 pages); Page/PDF unit and UI suites pass. |
| One `npm run verify:fast` green with timings | Exit 0; 102 files / 1022 tests; e2e 16/16 in 43.9 s; full run 52.6 s. |
| Report maps criteria and lists risks | This report. |

## S3-1 evidence (token/docs split)

- **One mixed doc → index + two surface docs.** `docs/design-tokens.md` now contains only ownership,
  links, and guard references. Page values live in `docs/design-tokens-page.md`; Continuous values
  live in `docs/design-tokens-continuous.md`; shared `EDGE_STYLE` and the 4 px card radius are
  explicitly marked shared.
- **PageTheme is documented as a whole.** The Page doc has a row for every `PageTheme` field with
  compact/comfortable values and clamps, plus the density constants, PageSetup, packing/callout
  topology, chrome formulas, and print constraints.
- **Legacy literals.** `CALLOUT_ROW_INDENT = 26` is deleted (the legacy beside lane uses
  `LayoutOptions.childIndent`). The 144 px readability floor and 16 px warning-anchor inset are now
  `LEGACY_BESIDE_READABLE_WIDTH` / `LEGACY_BESIDE_ANCHOR_INSET`, documented as engine constants used
  only by the `calloutModes: false` regression oracle. No unnamed Page literal remains.
- **Duplicate CSS fallback.** The compact PageTheme fallback block is deleted from `styles.css`.
  Page Read/Edit, PageBlockEditor, measurement, and the print root all apply
  `pageCssVariables(theme)`; a guard checks every emitted key is consumed and no key is declared in
  CSS.
- **Measurement leak.** `.nf-measure-card` and `.nf-measure-settle` read
  `--nf-page-max-card-width`, not `--nf-child-max-width`. The guard also asserts the Page content
  scope reads no Canvas/Continuous child/chapter/row/lane/sidebar token; the shared card radius is
  the only shell primitive allowed.
- **Dead Page CSS/JS surface.** `pageCssVariables` no longer emits 12 unused geometry variables. The
  remaining 16 are the Page typography/box variables plus the measurement cap. `pxToMm`/`MM_PER_PX`
  are gone; `mmToPx`/`PX_PER_MM` remain the one conversion.
- **Engine default contract.** `DEFAULT_LAYOUT_OPTIONS.childIndent = 26` is named
  `ENGINE_DEFAULT_CHILD_INDENT` and documented as the DOM-free engine fallback. Page production
  always passes `PageTheme.childIndent`; the Continuous renderer does not call `layoutDocument`.
- **Wording.** `maxWrapIndent` is documented as per-level and not accumulated across ancestors in
  `types.ts`, the Page doc, and the index. The stale “compaction for compact” comment is replaced
  with “presets use beside; compaction is only a lab oracle.”
- **Radius/chapter gap ownership.** Card radius 4 px is documented as a shared shell primitive used
  by both surfaces. Page chapter gap 32 px is documented as a Page engine constant; the Continuous
  shell chapter gap remains 28 px.
- **Guards.** `apps/desktop/test/page-token-guards.test.ts` checks docs links/rows against imported
  constants, PageTheme/LayoutOptions coverage, Continuous `DESIGN_TOKENS`/CSS/EDGE_STYLE coverage,
  stale wording, Page CSS ownership, runtime map application, and removed legacy values.

## Behavior-unchanged evidence

### Layout/page metrics (DOM-free labs)

Captured before and after with the same fixtures and estimator:

```text
R2I_OUT=/tmp/nf-m4e3/r2i-before.json R2J_OUT=/tmp/nf-m4e3/r2j-before.json \
  npx vitest run packages/layout/test/r2i-lab.test.ts packages/layout/test/r2j-lab.test.ts
# after code changes, same command with *-after.json
diff -u r2i-before.json r2i-after.json   # identical
diff -u r2j-before.json r2j-after.json   # identical
```

Page counts preserved: scale-300 39, wide-fan 2, deep-chain 3, showcase 25, plus all synthetic R2i
rows; R2j before/after rows (A/B2/stacked) preserve every page count, defect count, width, and
placement value.

### Real-DOM density and Page

`node --test tests/ui/m4d1-page-density.test.mjs` — 3/3 passed, 25.2 s. The 100% row remains
scale-300 27 pages, showcase 21, stress 35, with the same body/card-padding values. The full
60/70/80/90/100/110/120 table is identical to the M4e2 baseline.

### PDF/print

- `packages/pdf/test` + print/export units: 5 files / 70 tests passed.
- `tests/ui/m4c1-print-compositor.test.mjs`: 6/6 passed, 12.1 s.
- `tests/ui/m4c2-pdf-export.test.mjs`: 8/8 passed, 15.4 s.
- `tests/ui/m4c3-pdf-gate.test.mjs`: 3/3 passed, 19.6 s (50+ page A4 gate, placeholder asset,
  300-block performance).

### Full gate

```text
npm run verify:fast
EXIT: 0
Test Files  102 passed (102)
Tests       1022 passed (1022)
e2e          16/16 passed in 43.9 s
wall         52.6 s
```

The baseline was 101 files / 1010 tests; this task adds one guard file with 12 tests.

## Open questions / risks

- **No product decision was required.** Page card radius and chapter gap are documented as shared
  shell primitive / Page engine constant; making either a PageTheme field would be a later product
  and visual change, not part of M4e3.
- **`pageCssVariables` key set changed.** Twelve never-consumed variables are no longer emitted.
  Current in-repo consumers use the map wholesale or only the retained keys; an out-of-tree consumer
  would need to stop reading removed keys. No visual or measurement path consumed them.
- **Page measurement width is now theme-derived.** `.nf-measure-card` uses the Page cap. Actual
  measured widths/segments are unchanged because fixed measurements set an inline width and
  intrinsic measurements use `max-content`/`min-content`; the Page/density/PDF suites passing is the
  evidence. This is the intended correction for the Continuous-token leak.
- **Named legacy constants remain.** `LEGACY_BESIDE_READABLE_WIDTH` (144) and
  `LEGACY_BESIDE_ANCHOR_INSET` (16) are intentionally retained for the `calloutModes: false`
  regression oracle. They are not Page tokens. Removing the oracle would be a separate test/lab
  cleanup.
- **Out-of-scope findings remain.** `ContinuousSettings.zoom`/`DESIGN_TOKENS.wrapIndent` dead
  surface, Page zoom clamp duplication, `fontScale`/`headingScale` floor interaction (S3-3), and
  settings-menu IA are untouched by this task.
- **No visual evidence captured.** This is a behavior-preserving refactor/docs task; Page/density/
  PDF suites and byte-identical lab artifacts are the evidence. No UI was changed.

## Worktree and head

- Worktree: `/Users/luca/.t3/worktrees/noteforest/t3-7962f0f0-9c3c938ff07c157a`
- Branch: `t3/m4e3-page-continuous-token-docs-split`
- Head: commit containing this report; run `git rev-parse HEAD` in the worktree for the exact SHA.
