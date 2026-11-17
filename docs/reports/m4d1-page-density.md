# M4d1 — Page density control (thin slice)

**Status:** Implemented, targeted tests and `verify:fast` green; awaiting Sentinel.  
**Role:** Builder / Implementer  
**Date:** 9 November 2026  
**Base:** `main` at `bceeeed` (after M4c3 `1a3eb62`)  
**Worktree:** `a builder worktree`  
**Branch:** `t3/m4d1-page-density`  
**Code commit:** `e698dd3835ba7f09f3bae4433e79ba8080d51b9d`

## Summary

Page-only density slider (80–120%, step 5, default 100) persisted globally with an
optional per-document override. The stored `PageTheme` keeps its raw values plus
`density`; one pure `effectivePageTheme(theme)` applies the lens and is consumed
by layout options, CSS variables, DOM measurement, Page Read/Edit, and the
print/export snapshot. No CSS zoom, no page-setup change, no Continuous change.

A minimal SettingsDialog Page section provides the slider, percent label, Reset,
"Global default" / "This document" scope, explicit Apply/Cancel, and a "Use
global density" clear control. It is intentionally unpolished; final Settings
structure is a later task.

## What changed

### Density model (`packages/layout/src/page-settings.ts`)

- `PageTheme.density` (0.8–1.2, default 1), added to both presets and to the
  numeric override keys; `normalizePageDensity` clamps and rounds to 0.01.
- `effectivePageTheme(theme)` is the single lens:
  - typography scales, body/label floor 8 pt, code/table floor 7 pt, chrome/
    marker floor 6 pt, headings stay above the effective body;
  - card padding, segment/sibling/callout gaps, wrap/child/trunk/callout indents
    scale; R2j1 stem clearance (`childIndent ≥ childTrunkInset + stemMin + 2`)
    is preserved;
  - `minContentWidth` floors at 150 px for the preset range;
  - `maxCardWidth` scales with a 280–560 readable band for caps inside that
    band; explicit custom narrow/wide caps keep their own scaling;
  - page setup/margins are outside the theme and never change;
  - output carries `density: 1`, so the lens is idempotent; 100% is identity.
- `pageLayoutOptions` and `pageCssVariables` now resolve through the lens.
- `pageSettingsFingerprint` includes density through the theme object; existing
  settings/session files without density load as 100% (no migration needed).
- Preset switches carry the current density unless the override names one.

### Consumers

- `apps/desktop/src/renderer/src/page/projection.ts`: list indent comes from
  `pageLayoutOptions(theme).wrapIndent` (effective), not the raw theme.
- `apps/desktop/src/renderer/src/print/entry.tsx`: the print preflight type probe
  expected raw `bodyPt`/`bodyLine`; it now compares against the effective theme.
  Without this fix any export at density ≠ 100% would be refused as a settings
  mismatch (no contract change; a consumer fix).
- `PageView` exposes `data-page-density` for evidence.
- Everything else (measurement host, Page Read/Edit CSS, `PrintModel.cssVariables`,
  layout identity checks) already goes through `pageLayoutOptions` /
  `pageCssVariables`, so it inherits the lens.

### Settings UI (`shell/Dialogs.tsx`, `state/settings.ts`, `styles.css`)

- `pageDensityPercent` / `pageDensityValue`, `withPageDensityOverride`,
  `withoutPageDensityOverride` helpers.
- Minimal Page section in the existing dialog: scope radios, range slider
  (80–120 step 5), percent, Reset, Apply/Cancel, a resolved-value note, and
  "Use global density" when the document has a density override.
- Apply writes global settings or the per-document session override; Cancel
  reverts the draft; the existing "Done" still closes the dialog.

## Files changed

- `packages/layout/src/page-settings.ts` (density field, constants, normalization, lens)
- `packages/layout/src/estimate.ts` (optional layout options for box metrics in labs)
- `packages/layout/test/page-settings.test.ts` (density tests)
- `packages/layout/test/density-lab.ts`, `density-lab.test.ts` (new lab)
- `apps/desktop/src/renderer/src/state/settings.ts` (density helpers)
- `apps/desktop/src/renderer/src/shell/Dialogs.tsx` (Page section)
- `apps/desktop/src/renderer/src/page/projection.ts` (effective list indent)
- `apps/desktop/src/renderer/src/page/PageView.tsx` (`data-page-density`)
- `apps/desktop/src/renderer/src/print/entry.tsx` (effective type probe)
- `apps/desktop/src/renderer/src/styles.css` (minimal section/slider styles)
- `apps/desktop/test/settings-store.test.ts` (global/override/scoping helpers)
- `apps/desktop/test/page-model.test.ts` (layout options + fingerprint)
- `apps/desktop/test/print-parity.test.ts` (density print/Page identity)
- `tests/ui/m4d1-page-density.test.mjs` (new: Page Read/Edit, Settings, real-DOM lab)
- `tests/ui/m4c2-pdf-export.test.mjs` (80/120% real PDF export identity)
- `package.json` (`test:ui`/`verify` include the new UI suite)
- `artifacts/m4d1/settings-page-density.png` (UI evidence, not committed)

## Checks and timings

| Command | Result |
| --- | --- |
| `npm run check:boundaries` | 160 files, 785 imports, 16 rules |
| `npm run typecheck` | desktop node+web, core, layout, pdf all pass |
| `npm test` | 98 files / 979 tests pass, 2.5 s warm |
| `npm run verify:fast` | exit 0; 16 e2e tests / 44.2 s |
| `node --test tests/ui/m4d1-page-density.test.mjs` | 3 tests pass, 16.9 s |
| `node --test tests/ui/m4c2-pdf-export.test.mjs` | 8 tests pass, 6.7 s (new 80/120% case) |
| `node --test tests/ui/m4c1-print-compositor.test.mjs` | 6 tests pass, 4.2 s |

The new suite covers: Page Read body 9 → 10.8 → 8 pt, card height changes,
60-ish-page/24-page re-pagination, Page Edit overlay at 120% (10.8 pt) and 80%
(8 pt) with matching width, global/per-document persistence and session file,
Settings Apply/Cancel/Reset/Use-global, and the real-DOM lab table.
The M4c2 case exports the same document at 80% and 120%, checks the preflight
type metrics, PDF page size/count, real text, and missing glyphs.

## Acceptance criteria

- [x] Density 80–120 default 100, normalized, persisted global + per-doc.
- [x] Effective theme re-measures/re-paginates; Page Read/Edit/PDF share it.
- [x] Body ≥ 8 pt, `minContentWidth` ≥ 150 px (preset range), `maxCardWidth`
      readable clamp (280–560 for preset caps).
- [x] Page setup/margins unchanged; Continuous untouched.
- [x] Settings control works with Apply/Cancel and reset, with explicit scope.
- [x] Lab records page count/whitespace/readability at 80/90/100/110/120.
- [x] Targeted tests + one `npm run verify:fast` green with timings.
- [x] Report maps criteria and lists risks.

## Density lab

### Node lab (DOM-free estimator, whole document)

`packages/layout/test/density-lab.test.ts` logs six steps (80/85/90/100/110/120).
Page counts are estimates; the estimator's typography is scaled to the effective
body ratio but remains approximate. Whitespace is `1 − card area / chapter band
area` over the whole document; it rises at low density because cards are
narrower, not because pages are emptier.

| fixture | density | body | h1 | card pad | max card | pages | whitespace |
| --- | --- | --- | --- | --- | --- | --- | --- |
| scale-300 | 80% | 8 pt | 11.2 pt | 6.4 | 336 | 33 | 66.1% |
| scale-300 | 85% | 8 pt | 11.9 pt | 6.8 | 357 | 33 | 64.2% |
| scale-300 | 90% | 8.1 pt | 12.6 pt | 7.2 | 378 | 36 | 61.8% |
| scale-300 | 100% | 9 pt | 14 pt | 8 | 420 | 36 | 52.3% |
| scale-300 | 110% | 9.9 pt | 15.4 pt | 8.8 | 462 | 36 | 43.7% |
| scale-300 | 120% | 10.8 pt | 16.8 pt | 9.6 | 504 | 53 | 50.8% |
| stress | 80% | 8 pt | 11.2 pt | 6.4 | 336 | 45 | 58.3% |
| stress | 90% | 8.1 pt | 12.6 pt | 7.2 | 378 | 44 | 57.9% |
| stress | 100% | 9 pt | 14 pt | 8 | 420 | 46 | 49.1% |
| stress | 110% | 9.9 pt | 15.4 pt | 8.8 | 462 | 51 | 48.7% |
| stress | 120% | 10.8 pt | 16.8 pt | 9.6 | 504 | 60 | 44.8% |
| showcase | 80% | 8 pt | 11.2 pt | 6.4 | 336 | 23 | 68.2% |
| showcase | 90% | 8.1 pt | 12.6 pt | 7.2 | 378 | 23 | 65.1% |
| showcase | 100% | 9 pt | 14 pt | 8 | 420 | 23 | 57.0% |
| showcase | 110% | 9.9 pt | 15.4 pt | 8.8 | 462 | 25 | 49.8% |
| showcase | 120% | 10.8 pt | 16.8 pt | 9.6 | 504 | 26 | 44.1% |

### Real DOM lab (`tests/ui/m4d1-page-density.test.mjs`)

Actual Page Read measurement and pagination; `p1 whitespace` is the empty area of
page 1's content box (card footprint, a sample), `p1 cards` is the number of
fragments on page 1.

| fixture | density | body | card pad | pages | p1 whitespace | p1 cards |
| --- | --- | --- | --- | --- | --- | --- |
| scale-300 | 80% | 8 pt | 6.4 px | 27 | 69.4% | 12 |
| scale-300 | 90% | 8.1 pt | 7.2 px | 25 | 63.3% | 14 |
| scale-300 | 100% | 9 pt | 8 px | 27 | 61.5% | 12 |
| scale-300 | 110% | 9.9 pt | 8.8 px | 30 | 54.1% | 12 |
| scale-300 | 120% | 10.8 pt | 9.6 px | 37 | 59.9% | 9 |
| showcase | 80% | 8 pt | 6.4 px | 18 | 83.5% | 1 |
| showcase | 90% | 8.1 pt | 7.2 px | 19 | 83.1% | 1 |
| showcase | 100% | 9 pt | 8 px | 21 | 79.1% | 1 |
| showcase | 110% | 9.9 pt | 8.8 px | 21 | 74.8% | 1 |
| showcase | 120% | 10.8 pt | 9.6 px | 22 | 70.0% | 1 |
| stress | 80% | 8 pt | 6.4 px | 30 | 84.3% | 1 |
| stress | 90% | 8.1 pt | 7.2 px | 30 | 82.5% | 1 |
| stress | 100% | 9 pt | 8 px | 35 | 78.4% | 1 |
| stress | 110% | 9.9 pt | 8.8 px | 38 | 73.9% | 1 |
| stress | 120% | 10.8 pt | 9.6 px | 48 | 69.0% | 1 |

Readability note: 80–85% clamps the compact body at 8 pt (8.1 pt at 90%);
120% reaches 10.8 pt. Code/table are 7–10.2 pt; headings 11.2–16.8 pt. 80% is
dense but legible in the screenshot; 90% is the comfortable "dezoom" step.
The showcase/stress page-1 whitespace reads high because page 1 holds one wide
card; the page-count columns are the meaningful packing evidence.

## Risks and open questions

1. **80% is content-dependent, not uniformly best.** On scale-300, 90% gives 25
   pages while 80% ties 100% at 27; a synthetic stack of 48 single-line cards at
   the width cap needs 7 pages at both 80% and 120% (6 at 100%) because the 8 pt
   body floor shrinks type by 11% while the card cap shrinks 20%, adding a line.
   Real documents (showcase 21→18, stress 35→30) do improve at 80–90%. No
   blocker; if the product wants a guaranteed low-end win, the body floor or the
   card-cap/type-floor relationship needs a product decision in the UI rework.
2. **Print preflight was raw-theme.** Fixed here. It was the only consumer that
   bypassed the lens; the real 80/120% export test now covers it.
3. **Density change while a Page Edit overlay is open.** The overlay keeps the
   pre-change fragment box until it commits (the page model re-runs underneath).
   Transient; a follow-up can commit/close the overlay on a settings fingerprint
   change if the product wants it.
4. **Temporary UI.** The Settings Page section is a thin slice, not the final
   page-settings editor; no presets/typography controls yet.
5. **Lab locality.** The Node lab and the UI suite include the showcase/stress
   packages only when they exist on the machine; scale-300 is committed and
   always runs. The estimator lab is conservative and not a gate.
6. **Custom values.** The readable 150/280–560 clamps apply to values already in
   the preset range; explicit custom caps below/above the band keep scaling.

## Next step

Sentinel review of M4d1 against the brief. If accepted, proceed with M4d2
(export PDF UI) or the full-codebase Sentinel/settings inventory per the
post-Page roadmap.

## Integration

- Merged to `main` as `a4d142d` (base `bceeeed`; M4d2 was already merged).
- The only conflict was `package.json`; `test:ui`/`verify` now include both
  M4d1 and M4d2 suites.
- One full `npm run verify` on the integrated tree: **exit 0** — **99 test
  files / 982 tests**, **37 UI suites / 129 tests**, **16 critical e2e**,
  **14 recovery**, **0 pageErrors**.
- The M4d2 Page toolbar one-rail fix is retained; density and export UI work
  together in the integrated build.
- Evidence: `artifacts/m4d1/settings-page-density.png`; lab table above.
