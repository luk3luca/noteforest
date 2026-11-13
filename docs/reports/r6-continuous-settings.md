# R6 — Global Continuous settings + live preview

**Role:** Implementer / Builder  
**Date:** 13 November 2026  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-4c9107b7-c4b8c62a28124e8d`  
**Branch:** `t3/r6-continuous-settings`  
**Base:** `5d72b97` (`main` head at delegation; brief commit on top of `77a50cc`)  
**Brief:** `docs/tasks/r6-continuous-settings.md`  
**Design:** `docs/design/continuous-settings.md`  
**Commit:** one worktree commit below (not merged, not pushed).

## Summary

### A. Settings model + schema v5 — done

- `packages/layout/src/continuous-settings.ts` owns the global `ContinuousSettings` model:
  - `spacing`: `chapterGap` 28 (16–48), `siblingGap` 24 (12–40), `childRowGap` 16 (8–32);
  - `arrows`: `width` 1.25 (0.75–2.5), `activeWidth` 1.75 (1.25–3, raised to ≥ resting),
    `mutedWidth` 1 (0.5–2), `size` 6 (4–10);
  - `widths`: `canvasMax` 3200 (2400–4800, step 100), `topLevelMax` 480 (320–640, step 20),
    `childMax` 420 (280–560, step 20).
- `normalizeContinuousSettings` clamps, snaps to the slider steps, raises `activeWidth` to the
  resting width, and raises `canvasMax` to `continuousCanvasFloor` (top-level + sibling gap + child
  + the derived 16 px edge corridor). Unknown keys are ignored in memory.
- `SETTINGS_SCHEMA_VERSION` is **5**. The v4 → v5 migration is pure and adds the defaults when the
  namespace is absent; the v1 → v2 legacy `continuous` removal stays first, so a v1 file with a
  dead `zoom` block drops it and then receives the R6 defaults. v5 values round-trip.
- `settingsDocumentForWrite` writes the normalized namespace and preserves unknown keys at every
  level (`continuous`, `spacing`, `arrows`, `widths`); the version is never lowered. Corrupt /
  unreadable recovery is unchanged. There is no document-schema or per-document settings change.
- `AppSettings.continuous` is part of `DEFAULT_APP_SETTINGS`; `normalizeAppSettings` resolves it.

### B. Settings → Continuous page — done

- The old per-document zoom controls are removed. The page is global-only and works with no
  document open: Spacing (3 sliders), Arrows (3 widths + size), **Advanced** disclosure (canvas /
  top-level / child max), **Reset Continuous settings** with an explicit confirmation only when a
  value changed, and a live **Preview**.
- Instant save with a 240 ms slider debounce; the Settings footer includes the controller's real
  saving/error state, Retry targets the continuous write, and close/quit flushes the pending value
  through the shared pending-flush registry (now a set, so Page and Continuous controllers coexist).
- The preview is a deterministic sample (1 top-level + 2 children + 1 callout) built by
  `continuous-preview.ts`; it uses the resolved spacing, the real `EdgeLayer`/router, the resolved
  edge style, the same note surface tokens, and scopes the same Continuous CSS variables. Card
  widths use the documented 0.35 preview factor of the configured caps; spacing, corridor, arrows,
  and stroke widths are exact.
- Accessibility: every range has a label, numeric value, `aria-valuetext` (`"28 px"`), and a
  visible value; Reset is a real button; the preview is labelled `Continuous preview` and described
  as sample content; the Advanced disclosure is native `<details>/<summary>`.
- Zoom is not a Settings control and no global zoom setting was added. The page points to the
  toolbar / View menu / palette, and the per-document `DocumentViewState.zoom` is untouched.

### C. Apply to the canvas — done

- `continuousCssVariables(settings)` publishes `--nf-chapter-gap`, `--nf-child-gap`,
  `--nf-child-row-gap`, `--nf-canvas-max`, `--nf-top-level-max-width`, `--nf-child-max-width`, and
  the three `--nf-edge-width*` values on `.nf-continuous-surface`; the Settings preview scopes the
  same map to its stage.
- `continuousEdgeStyle(settings)` resolves the fixed arrowhead (`size`, `halfWidth = size / 2`) and
  the three stroke widths for the Continuous router. `EdgeLayer`/`edge-routing` accept that style;
  reference chevrons keep their fixed open shape.
- The real canvas also consumes the resolved values in placement math: the logical canvas width
  (`useCanvasWidth`), the direct-child wrap decision and callout safe zone (`siblingGap`), and the
  callout clamping. Card/row widths and chapter spacing are CSS-driven from the scoped variables.
- `DESIGN_TOKENS` remains the default/fallback source: its chapter/sibling/row gaps and width caps
  now alias `DEFAULT_CONTINUOUS_SETTINGS`; no second literal source exists in components.
- Page/PDF isolation: Page Read/Edit, measurement, and print read only `PAGE_EDGE_STYLE`,
  `PAGE_EDGE_GEOMETRY`, `PageTheme`, `PageChrome`, and `--paper-*`. Two residual Page-view shell
  reads of Continuous variables were removed (`--nf-child-gap` on the Page placeholder now uses the
  Page card padding; the Page banner padding is a shell literal). The Continuous overrides are
  scoped to the Continuous surface, so the root fallbacks (and Page/PDF) stay at the defaults.
- New `apps/desktop/test/continuous-settings-isolation.test.ts` changes **every** Continuous field,
  applies the resolved style to `CONTINUOUS_EDGE_STYLE`, and asserts the serialized Page layout,
  page count, Page edge model, print model, geometry, CSS variables, and fingerprint are identical.

## Files changed

Model and settings:
- `packages/layout/src/continuous-settings.ts` (new)
- `packages/layout/src/page-settings.ts`
- `packages/layout/src/edge-style.ts` (comment/default ownership)
- `packages/layout/src/index.ts`
- `apps/desktop/src/shared/settings-file.ts`
- `apps/desktop/src/renderer/src/state/settings.ts`

Continuous UI:
- `apps/desktop/src/renderer/src/settings/ContinuousSettings.tsx` (new)
- `apps/desktop/src/renderer/src/settings/ContinuousSettingsPreview.tsx` (new)
- `apps/desktop/src/renderer/src/settings/continuous-preview.ts` (new)
- `apps/desktop/src/renderer/src/settings/useContinuousSettingsController.ts` (new)
- `apps/desktop/src/renderer/src/shell/SettingsDialog.tsx`
- `apps/desktop/src/renderer/src/settings/ExportSettings.tsx` (schema comment)
- `apps/desktop/src/renderer/src/settings/usePageSettingsController.ts` (flush registry)
- `apps/desktop/src/renderer/src/styles.css`

Canvas:
- `apps/desktop/src/renderer/src/lib/design-tokens.ts`
- `apps/desktop/src/renderer/src/lib/geometry.ts`
- `apps/desktop/src/renderer/src/lib/edge-routing.ts`
- `apps/desktop/src/renderer/src/editor/DocumentEditor.tsx`
- `apps/desktop/src/renderer/src/editor/edges/EdgeLayer.tsx`
- `apps/desktop/src/renderer/src/editor/useBelowStackPlacement.ts`
- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx`

Tests:
- `packages/layout/test/continuous-settings.test.ts` (new)
- `packages/layout/test/page-settings.test.ts`
- `packages/layout/test/edge-style-isolation.test.ts`
- `apps/desktop/test/continuous-settings-isolation.test.ts` (new)
- `apps/desktop/test/continuous-settings-preview.test.ts` (new)
- `apps/desktop/test/settings.test.ts`
- `apps/desktop/test/settings-store.test.ts`
- `apps/desktop/test/design-tokens-css.test.ts`
- `apps/desktop/test/editor-layouts-modes.test.ts`
- `tests/ui/r6-continuous-settings.test.mjs` (new)
- `tests/ui/suites.mjs`
- `tests/ui/ui-batch-a.test.mjs`
- `tests/ui/m4e1-settings-platform.test.mjs`
- `tests/ui/ui-settings-recovery.test.mjs`
- `tests/ui/ui-appearance-v3.test.mjs`

Docs:
- `docs/design-tokens-continuous.md`
- `docs/design/continuous-settings.md` (status)
- `docs/reports/r6-continuous-settings.md` (this report)

## Checks run

| Check | Result | Timing |
|---|---|---|
| `npm run verify:fast` | **pass**: boundaries + typecheck + unit + critical e2e | **54.13 s** wall |
| `npm run check:boundaries` | pass, 200 files / 964 imports / 16 rules | in verify |
| `npm run typecheck` | pass (desktop node + web, core, layout, pdf) | in verify |
| `npx vitest run` | pass, **126 files / 1267 tests** | 4.35 s (verify run) |
| `npm run e2e` (critical) | pass, 16 tests | 43.35 s suite / in verify |
| `node --test tests/ui/r6-continuous-settings.test.mjs` | pass, 2 tests | 10.1 s wall (tests 1.11 s + 0.87 s) |
| affected UI suites (`ui-batch-a`, `m4e1-settings-platform`, `ui-batch-b`, `ui-settings-advanced`, `ui-batch-v`, `ui-appearance-v3`, `ui-settings-recovery`, `m4d1-page-density`) | pass, **48 tests** | 24.95 s combined |
| `node --test tests/ui/v0-shell-frame.test.mjs` | pass, 8 tests (toolbar/View zoom) | 17.35 s |

Evidence: `artifacts/r6-continuous/` contains `settings-default-no-document.png`,
`settings-default-light.png`, `settings-advanced-changed.png`, `settings-preview-changed.png`, and
`canvas-changed.png`.

No native dialogs and no fixed sleeps were added. Existing assertions were updated to v5/global
Continuous behavior, none were weakened.

## Acceptance criteria

- [x] **Settings → Continuous is global-only, works with no document, has spacing/arrow/width
  controls and ranges, Advanced, Reset, and a live 1+2+1 callout preview.** Evidence: the new UI
  suite opens Settings with zero documents, asserts all fields enabled, the preview region, live
  preview movement, Advanced, and Reset-to-defaults; `ContinuousSettings.tsx` imports every range
  from `@noteforest/layout`.
- [x] **Defaults equal today's tokens; a v4 file migrates to v5 with no visual change; unknown
  fields survive; no document schema/per-document change.** Evidence:
  `continuous-settings.test.ts` (defaults = `CONTINUOUS_EDGE_STYLE`), `settings.test.ts` v4→v5
  migration + v5 round-trip + unknown nested keys + v1-legacy removal order, and the design-token
  test proving the resolved default CSS map equals `DESIGN_TOKEN_CSS_VARIABLES`.
- [x] **Every Continuous canvas applies the values immediately; Page Read/Edit and PDF are
  unchanged.** Evidence: UI canvas test asserts computed chapter gap, child gap, canvas cap,
  top-level cap, arrow path, and resolved edge width after edits; the isolation test changes every
  field and compares the full Page/print records byte-for-byte.
- [x] **The per-document zoom is no longer a Settings control; toolbar/View zoom still works; no
  global zoom setting is added.** Evidence: UI suite asserts `[data-continuous-zoom-slider]` count
  0 and no zoom/view-state field in the namespace; `m4e1` and `v0-shell-frame` still change and
  restore per-document zoom from the toolbar/View path.
- [x] **No fixed sleeps/native dialogs; existing assertions updated, none weakened; one commit.**
  Evidence: UI suite uses `waitForFunction`/`waitUntil` only; no dialog calls; one commit below.

## Open questions / risks

- The canvas floor is encoded and tested, but with the approved ranges the largest possible row
  (640 + 40 + 560 + 16 = 1256) is below the 2400 px minimum canvas cap, so the floor never changes a
  valid slider value. It still protects corrupt/future files and documents the requirement in
  Advanced.
- The preview scales card widths by a documented 0.35 factor to fit the 536 px Settings pane; it is
  a sample, not the real adaptive width. Spacing, corridor, arrows, and stroke widths are exact;
  the help copy states the scale.
- The Canvas cap / width controls can make a deep tree wider or taller; horizontal scroll remains
  the bound. No performance regression was measured by the critical gate.
- R6 settings stay under the existing **Document** nav group because the page is document
  presentation, although it is global; the copy is explicit. Moving it to an App group is a
  product/IA decision, not required by the brief.
- The Orchestrator still owns the single full `npm run verify` and the product-owner
  visual/VoiceOver pass; this worktree did not run the full verify.

## Next step

Product-owner visual/VoiceOver pass over Settings → Continuous (dark/light, no document, Advanced,
preview, Reset) and the canvas before/after, then the targeted Sentinel review. After R6, the next
settings/design block is the planned remaining work in `docs/plan.md`; the frozen settings inventory
should record the new `continuous` namespace in a docs sweep.
