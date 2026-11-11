# UI settings — Batch C implementation report

**Status:** Complete on `design/ui-map` lineage; ready for Orchestrator review and merge.
**Role:** Implementer / Builder
**Task:** `docs/tasks/ui-settings-advanced.md`
**Branch:** `t3/ui-settings-advanced-batch-c`
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-f444556c-4f564fa17b6ab846`
**Base:** `7eb9f40` (`design/ui-map` head containing the Batch C brief)
**Date:** 11 November 2026

## Summary

Batch C exposes the frozen Page advanced typography and layout fields on the Batch B Page
settings, plus the first-class `maxCardWidth`, without a schema, migration, dependency, Page
sheet, paginator, print compositor, or PDF change.

The Page settings now has:

- a first-class **Max card width** row in a new Layout section;
- a collapsed **Advanced typography** disclosure with body size/line height, H1/H2/H3, code,
  table, and block label fields;
- a collapsed **Advanced layout** disclosure with minimum content width, card padding/border,
  segment/sibling/callout gaps, **List indent** (`wrapIndent`), max list indent, and child indent;
- frozen ranges/units, strict raw-text parsing, inline `role="alert"` errors with
  `aria-describedby`, and no silent clamp/reset;
- cross-field validation against the model: H1/H2/H3 above body by +3/+1.5/+1 pt,
  `maxWrapIndent ≥ wrapIndent`, child indent above the hidden trunk inset + stem + 2,
  `maxCardWidth ≥ minContentWidth`;
- the frozen Custom marker: editing an advanced value freezes the current resolved layer (hidden
  values included) and marks it Custom; a preset switch to Compact/Comfortable warns inline
  (Q-11) and can be cancelled, so advanced values are never silently discarded;
- full document scope: per-field override dots, per-field Use global, group Use global,
  equal-to-global auto-remove, no write on a bare scope switch, no-document reason, and read-only
  personal overrides;
- the same live Page preview/Page Read/measurement/print effective theme (one density lens);
- the existing Page Edit commit-before-write ordering for every theme write.

Hidden/engine values remain hidden: `fontScale`, `headingScale`, `pagePacking`, `calloutModes`,
`wrapPolicy`, subtree-fit internals, trunk insets, callout card/lane values, and chrome/marker
point sizes. Page font, page chrome, manual breaks, Appearance, Export defaults, Data recovery,
and External API/agent access are untouched.

## Checkpoint commits

- `712fdc8` — `feat(settings): expose Page advanced typography, layout, and max card width`
- the commit containing this report — `test(settings): advanced validation, scope, preset, Page Edit, and Page/PDF parity`

The first commit carries the implementation and the pure advanced-field unit suite; the second
carries the UI/PDF integration coverage, the Batch B test update, the suite registration, and this
report. Splitting the UI suite itself was not useful: the advanced surface and its validation,
scope, preset, Page Edit, and parity cases are one test file.

## Files changed

**Implementation**

- `apps/desktop/src/renderer/src/settings/page-advanced.ts` (new): frozen editable field catalog
  and ranges, strict parsing/formatting, cross-field validation, partial override helpers,
  equal-to-global removal, custom-baseline freeze, and the preset-replacement predicate.
- `apps/desktop/src/renderer/src/settings/PageAdvancedSettings.tsx` (new): first-class max card
  row, the two collapsed disclosures, per-field override dots/Use global, units, errors, group
  Use global, and keyboard increment/decrement.
- `apps/desktop/src/renderer/src/settings/usePageSettingsController.ts`: raw theme drafts,
  validation, debounced theme writes, Custom freezing, preset warning, per-field/group overrides,
  theme-only resync (prevents an old draft from being frozen back after an immediate action), and
  setup-only resync (does not clobber theme drafts).
- `apps/desktop/src/renderer/src/shell/SettingsDialog.tsx`: preset warning UI, advanced typography
  disclosure, Layout section, generalized invalid/preview copy.
- `apps/desktop/src/renderer/src/settings/PageSettingsPreview.tsx`: preview invalid copy now
  names values, not just margins (behavior unchanged).
- `apps/desktop/src/renderer/src/styles.css`: advanced disclosure styling.

**Tests**

- `apps/desktop/test/page-advanced.test.ts` (new): 17 unit tests for field catalog/ranges,
  parsing, cross-field rules, no-clamp behavior, override math, Custom freeze, density lens once,
  and preset warning.
- `apps/desktop/test/print-parity.test.ts`: +3 real-layout print-model cases for all advanced
  typography/layout fields at 100%, the 80% lens, and the density card band/custom cap.
- `tests/ui/ui-settings-advanced.test.mjs` (new): 8 tests for the first-class cap, collapsed
  disclosures/units/ranges/hidden values, density lens and Page Read/preview parity, advanced
  layout writes, cross-field inline errors/no write, preset warning, scope/overrides/Use global,
  read-only advanced overrides, and Page Edit commit-before-write.
- `tests/ui/ui-batch-b.test.mjs`: Custom→Compact now confirms the Batch C preset warning, and the
  collapsed advanced typography disclosure is asserted (the old “not exposed” assertion is
  replaced, not weakened).
- `tests/ui/m4c2-pdf-export.test.mjs`: one Continuous export with all advanced typography/layout
  values at 80% density; page count/size/text and no settings mismatch.
- `package.json`: new UI suite registered in `test:ui` and `verify`.

**Docs**

- `docs/reports/ui-batch-c.md`: this report.

**Evidence (ignored by git)**

- `artifacts/ui-settings-advanced/advanced-typography.png`
- `artifacts/ui-settings-advanced/advanced-layout.png`
- `artifacts/ui-settings-advanced/advanced-layout-values.png`
- `artifacts/ui-settings-advanced/max-card-width.png`
- `artifacts/ui-settings-advanced/invalid-cross-field.png`
- `artifacts/ui-settings-advanced/preview-advanced.png`

## Checks and timings

| Check | Result | Real time |
|---|---|---:|
| `npm run check:boundaries` | 176 files, 870 imports, 16 rules | 0.54 s |
| `npm run typecheck` | all workspaces clean | 5.17 s |
| `npx vitest run` | 106 files / 1071 tests passed | 3.42 s |
| `npm run e2e:critical` | 16/16 passed | 43.72 s (suite 43.63 s) |
| **`npm run verify:fast`** | **exit 0** | **53.04 s** |
| Targeted `ui-settings-advanced` | 8/8 | 19.28 s (suite) |
| Targeted `ui-batch-b` | 9/9 | 18.27 s (suite) |
| Targeted `r1b-page-settings` | 4/4 | 11.01 s |
| Targeted `m4d1-page-density` | 3/3 | 18.00 s |
| Targeted `m4e1-settings-platform` | 4/4 | 11.46 s |
| Targeted `m4b1-page-view` | 9/9 | 14.42 s |
| Targeted `m4b1b1-page-edit-overlay` | 8/8 | 15.21 s |
| Targeted `m4c1-print-compositor` | 6/6 | 12.07 s |
| Targeted `m4c2-pdf-export` | 9/9 | 16.33 s |
| Targeted `m4c3-pdf-gate` | 3/3 | 20.65 s |
| Targeted `m4d2-export-ui` | 8/8 | 19.25 s |
| Targeted `v0-shell-frame` | 5/5 | 13.11 s |

No assertion was weakened, no fixed sleep was added, and no native dialog was opened. The test
dialog guard remains in force. The Batch B Page Edit typing test flaked once under the full suite
load and passed on the immediate rerun (it also passed isolated); no Batch B assertion was
changed for that test. The Batch B Custom→Compact path now exercises the new warning by design.

## Acceptance criteria

| Criterion | Status |
|---|---|
| `maxCardWidth` is first-class; advanced typography/layout fields are under the correct collapsed groups; hidden/engine values remain hidden | **Pass** |
| Fields use frozen ranges/units, validate cross-field constraints inline, and never silently clamp/reset | **Pass** |
| Preset/Custom behavior is explicit; advanced values are not silently discarded | **Pass** |
| Advanced fields participate in scope/override/Use global/equal-to-global and no-document/read-only rules | **Pass** |
| Live preview and Page Read/Edit/PDF parity hold; no PDF change for the same settings | **Pass** |
| Page Edit commit-before-write works; failed commit blocks | **Pass** |
| Tests, screenshots, and one `verify:fast` pass; report maps criteria | **Pass** |

## Notes, choices, and residual risks

- **Custom freeze preserves rendering.** The first advanced edit writes `preset: 'custom'` and
  stores every value that differs from the global layer, including hidden engine values such as
  chrome/marker sizes. This keeps the current page identical while removing the preset marker.
  Hidden values are never exposed as controls.
- **Cross-field blocking is group-wide.** One invalid advanced draft blocks the advanced theme
  write, including other valid edits in the same pending patch. For example, raising body size
  above H3 + 1 shows the H3 error until H3 is raised too. This is deliberate (no silent clamp),
  but it is a UX nuance the product owner may want to try hands-on.
- **`maxCardWidth` is not typography.** It is first-class and does not force Custom. A document
  with only a max-card override keeps following the global preset; a preset switch still warns
  because the existing preset write replaces the whole theme (including the cap).
- **Preset warning is per layer.** Global Custom and document Custom/advanced values warn before
  Compact/Comfortable. Custom itself never warns because it preserves the current values. The
  warning is inline (`role="alert"`), not a native dialog.
- **Equal-to-global.** Fields equal to the global layer are not stored as document overrides. A
  Custom baseline that only existed for removed advanced fields drops the `custom` marker; a
  remaining first-class max card keeps its own override without a typography marker.
- **Density is still a lens.** Stored advanced values are raw; `effectivePageTheme` applies the
  60–120% lens once. The UI test asserts 11 pt stored / 9 pt effective at 80%, and print parity
  asserts card padding/gaps/caps at 80%.
- **Child-indent rule uses the hidden inset.** The effective minimum is
  `childTrunkInset + EDGE_STYLE.stemMin + 2` (26 px for the default 12 px inset). A legacy/custom
  baseline with a larger inset raises the inline floor instead of being ignored.
- **Theme-only vs setup-only resync.** Immediate theme actions resync only theme drafts; immediate
  setup actions resync only margins. This prevents an old draft from being misinterpreted as a
  fresh edit and frozen back into the Custom baseline (a race found and fixed while testing
  group Use global followed by another edit).
- **No schema/PDF change.** `settings.json` stays v2, `document-settings.json` stays v1, and the
  print compositor/PDF path are untouched. The new m4c2 case proves the same settings flow through
  the existing one effective theme.
- **Not run:** full `npm run verify` (Orchestrator integration per brief). `m4c3-packaged-export`
  and visual/performance suites were not re-run; they do not consume the new UI controls.

## Worktree, branch, head

- Worktree: `/Users/luca/.t3/worktrees/noteforest/t3-f444556c-4f564fa17b6ab846`
- Branch: `t3/ui-settings-advanced-batch-c`
- Base: `7eb9f40`
- Head at handback: this report commit on top of `712fdc8`

## Next step

Orchestrator review, full `npm run verify`, and merge into `design/ui-map` (not `main`). The
product-owner visual/VoiceOver pass should include the Custom preset warning and the cross-field
body/heading interaction. The visual refinement batch follows Batch C, then `design/ui-map` merges
to `main`.
