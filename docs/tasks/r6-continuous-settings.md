# R6 — Global Continuous settings + live preview

**Role:** Implementer / Builder
**Milestone:** Settings (R6)
**Base:** `main` head at delegation (`77a50cc` plus this brief)
**Worktree:** created by the delegate from that base; do not work in the main checkout
**Timebox:** 2 days

## Context

The design is approved in `docs/design/continuous-settings.md` (13 November 2026). The product owner
confirmed the recommended choices: **global only**, `settingsVersion: 5` with a `continuous`
namespace, spacing + arrow + width controls, one arrow size plus three widths, a live preview with
1 top-level + 2 children + 1 callout, no card-padding control, and the per-document zoom removed
from Settings (zoom remains view state in the toolbar/View menu).

Today the Settings → Continuous page only edits per-document zoom, while the canvas geometry is a
set of engine tokens. R6 replaces that page with global controls and applies them to the Continuous
canvas without touching Page/PDF.

## Goal

One worktree, **one commit** (no per-file/hunk split), one `npm run verify:fast`, targeted UI suites.

## In scope

### A. Settings model + schema v5

- Add `continuous` to `AppSettings` (`packages/layout/src/page-settings.ts`):
  - `spacing: { chapterGap, siblingGap, childRowGap }` (defaults 28, 24, 16);
  - `arrows: { width, activeWidth, mutedWidth, size }` (1.25, 1.75, 1, 6);
  - `widths: { canvasMax, topLevelMax, childMax }` (3200, 480, 420).
- Normalize/clamp on read/write using the ranges in the design doc:
  - spacing 16–48 / 12–40 / 8–32;
  - arrow widths 0.75–2.5 / 1.25–3 (≥ resting) / 0.5–2; size 4–10;
  - widths 2400–4800 (step 100) / 320–640 (20) / 280–560 (20); clamp max below min; canvas max
    must be ≥ top-level + child + sibling gap + minimum corridor, otherwise clamp and explain.
- Bump `SETTINGS_SCHEMA_VERSION` to **5**. Pure v4→v5 migration adds the defaults when the
  namespace is absent; v5 round-trips; unknown top-level/`continuous` keys survive; the version is
  never lowered; corrupt/unreadable recovery unchanged. No document schema, package, or per-document
  settings change.
- `settingsDocumentForWrite` writes normalized `continuous` and preserves unknown keys. The v1→v2
  old `continuous` removal stays first in the chain.

### B. Settings → Continuous page

- Replace the per-document zoom page with a global page, usable with no document open:
  - **Spacing**: Chapter gap, Sibling gap, Child row gap.
  - **Arrows**: Resting width, Active width, Muted width, Arrow size.
  - **Advanced**: Canvas max width, Top-level max width, Child max width.
  - **Reset Continuous settings** (restore defaults; explicit, no Apply draft).
  - **Preview**: a compact sample with 1 top-level, 2 direct children, 1 callout; updates live;
    uses the same edge style/geometry and note surface as the canvas; not the current document and
    not a Page preview.
- Instant save (R3/R4 model), debounced sliders; footer reflects the real write; no scope switch;
  no per-document override. Remove the old per-document zoom controls from Settings; do not add a
  global zoom setting.
- Accessibility: labelled sliders with numeric values/`aria-valuetext`, Reset as a real button,
  preview labelled as sample content; no color-only meaning.

### C. Apply to the canvas

- Resolve the settings into the Continuous CSS variables (`--nf-chapter-gap`, `--nf-child-gap`,
  `--nf-child-row-gap`, `--nf-top-level-max-width`, `--nf-child-max-width`, `--nf-canvas-max`,
  edge widths) and the Continuous edge style (arrow size/widths). The defaults equal today's tokens,
  so a v4 file migrates with no visual change.
- Keep `DESIGN_TOKENS` as the fallback/default source; do not duplicate literals in components.
- Page/PDF isolation: Page Read/Edit and print read only `PAGE_EDGE_STYLE`, `PAGE_EDGE_GEOMETRY`,
  `PageTheme`, `PageChrome`, `--paper-*`. Add/extend an isolation test that changes every Continuous
  field and asserts Page/PDF geometry, page count, and print-model records are unchanged.
- Remove the per-document zoom controls from Settings; verify the toolbar/View zoom still works.
- The preview and the real canvas use the same resolved values; no real document needed.

## Out of scope

- Page settings, density, theme, margins, chrome; Appearance/palette/fonts.
- Per-document Continuous overrides, scope switch, view-style setting, manual breaks.
- Card padding, routing internals (`laneMin/Max`, `trunkInset`, `stemMin`, `wrapIndent`, callout
  modes), reference-edge controls, global zoom.
- R4 export defaults, code-block syntax colors, PDF/tagged/metadata/page range.
- Changes to the document schema or package format.

## Files

Read:
- `docs/design/continuous-settings.md`.
- `packages/layout/src/page-settings.ts`, `packages/layout/src/edge-style.ts`.
- `apps/desktop/src/shared/settings-file.ts`, `renderer/src/state/settings.ts`.
- `apps/desktop/src/renderer/src/lib/design-tokens.ts`, `apply-design-tokens.ts`,
  `editor/edges/EdgeLayer.tsx`, `editor/edges/*`, `styles.css`.
- `apps/desktop/src/renderer/src/shell/SettingsDialog.tsx` (the inline Continuous page),
  `settings/*`, `shell/Workspace.tsx`.
- Tests: `packages/layout/test/*settings*`, `apps/desktop/test/settings*.test.ts`,
  `edge-style-isolation.test.ts`, `design-tokens-css.test.ts`, `tests/ui/ui-batch-b`,
  `ui-settings-advanced`, `v0-shell-frame`, `m4d1-page-density`, and a new/updated Continuous
  settings UI test. Add the suite to `tests/ui/suites.mjs` if new.
- `docs/agents/brief-template.md`.

Expected to touch: the files above, their tests, `docs/design-tokens-continuous.md`, and
`docs/reports/r6-continuous-settings.md`.

## Acceptance criteria

- [ ] Settings → Continuous is global-only, works with no document, has the spacing/arrow/width
      controls and ranges in the design, Advanced, Reset, and a live 1+2+1 callout preview.
- [ ] Defaults equal today's tokens; a v4 file migrates to v5 with no visual change; unknown fields
      survive; no document schema/per-document settings change.
- [ ] Every Continuous canvas applies the values immediately; Page Read/Edit and PDF are unchanged
      by any Continuous value (isolation test; page count/geometry/print model).
- [ ] The per-document zoom is no longer a Settings control; toolbar/View zoom still works; no
      global zoom setting is added.
- [ ] No fixed sleeps/native dialogs; existing assertions updated, none weakened; one commit.

## Tests and evidence

- Targeted while working: settings migration/normalize/clamp, store/page, preview update, apply to
  canvas, design-token guards, edge isolation, Page/PDF suites.
- End of task: one `npm run verify:fast`. The Orchestrator runs the single full `npm run verify`.
- Screenshots: Settings → Continuous default/changed, dark/light, no-document state, Advanced open,
  Reset, preview; a canvas before/after. Use `artifacts/r6-continuous/`.
- No native OS dialog may block a test; no fixed sleeps.

## Stop and ask

Stop if the schema v5 migration would need a document-schema change, if applying Continuous values
would change Page/PDF (isolation failure), if the preview needs a real document/layout pass, if the
per-document zoom removal breaks a view-state contract, or if a baseline test fails for an
unrelated reason.

## Report format

- Summary mapped to A–C.
- Files changed.
- Checks with real timings and suite counts.
- Acceptance criteria pass/fail with evidence.
- Open questions / risks.
- Next step (product-owner visual/VoiceOver, then Sentinel or release work).
- One commit in the worktree; do not merge or push.
