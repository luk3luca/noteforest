# M4e2 — Page density 60–120 + adaptive topology

**Status:** Implemented, targeted suites and `verify:fast` green; awaiting Sentinel.
**Role:** Builder / Implementer
**Date:** 9 November 2026
**Base:** `main` at `70b6a19` (M4e1/M4e2 briefs)
**Worktree:** `a builder worktree`
**Branch:** `t3/m4e2-page-density-topology`
**Code commit:** `a9f44cf` (this report is the follow-up commit)

## Summary

Page density now spans **60–120%**, step 5, default 100, normalized to one
canonical 5% step. The effective-theme floors are **body 7 pt**,
**`maxCardWidth` 240**, **`minContentWidth` 140**. The low-density type path is
a **floor-anchored curve**: below 100% each type size interpolates linearly from
its readability floor at 60% to its preset value at 100% (so compact body is
7 pt at 60%, 8 pt at 80%, 9 pt at 100%), and above 100% it scales
proportionally. Cards, gaps, and indents scale proportionally all the way down.

Read/Edit/measurement/PDF still consume one `effectivePageTheme`; the settings
fingerprint now also includes the resolved effective theme so the floors are
part of the export/model identity. Topology was **not** frozen: the existing
geometric A/B2/stacked choice remains, and a new probe records that density can
flip one parent (A at 60–100%, B2 at 110–120% on the synthetic probe).

Real-DOM evidence shows the S2-3 defect is gone: 60% is the page-count optimum
on scale-300, showcase, and stress, and every effective type/box value is
strictly smaller than at 70/80/90/100%.

## What changed

### Density model (`packages/layout/src/page-settings.ts`)

- `PAGE_DENSITY_MIN` 0.8 → **0.6**; max 1.2, step 0.05, default 1 unchanged.
  `normalizePageDensity` now **snaps to the 5% step** after clamping, so the
  slider, `settings.json`, and per-document overrides share one range and one
  rounding rule (0.62 → 0.60, 0.63 → 0.65, 1.19 → 1.20). Existing 80–120 values
  are on-step and remain valid; no stored-data migration.
- Floors: `PAGE_BODY_PT_FLOOR` 8 → **7**, `PAGE_MIN_CONTENT_WIDTH_FLOOR`
  150 → **140**, `PAGE_MAX_CARD_WIDTH_MIN` 280 → **240**
  (`PAGE_MAX_CARD_WIDTH_MAX` stays 560).
- `effectivePageTheme` type path below 100%:

  ```text
  lowBand = (density - 0.6) / (1 - 0.6)          # 0 at 60%, 1 at 100%
  type(base, floor) = floor + (base - floor) * lowBand   # when base >= floor
  type(base, floor) = base * density                     # custom value below floor
  ```

  Compact at 70/80/90/100%: body 7.5/8/8.5/9, H1 11/12/13/14, card padding
  5.6/6.4/7.2/8, card cap 294/336/378/420. Code/table keep their 7 pt floor
  (7/7.5/7.75/8 at 70/80/90/100); chrome/marker keep 6 pt. Headings keep their
  `body + 3 / + 1.5 / + 1` floors, so the heading order holds at every step.
  Above 100% every type size scales proportionally (unchanged M4d1 behavior).
  A custom type size already below its floor keeps proportional scaling instead
  of being enlarged (same policy as `minContentWidth`).
- `pageSettingsFingerprint` now serializes `[setup, theme, breaks, effectiveTheme]`,
  so a model measured under different density floors cannot be accepted as
  current even when the stored settings are byte-identical. Consumers treat the
  string as opaque; no persisted fingerprint format exists.
- Custom card caps outside the 240–560 band keep their own scaling (M4d1 policy);
  a preset-range cap that would fall below 240 is guarded at 240.

### Consumers

No consumer changes were needed: Page Read/Edit, the measurement host, the page
model, `pageCssVariables`, and the print/preflight path already go through
`pageLayoutOptions` / `pageCssVariables` / `effectivePageTheme`. The dialog
slider reads `PAGE_DENSITY_MIN/MAX/STEP`, so it moves to 60–120 automatically.

- `apps/desktop/src/renderer/src/shell/Dialogs.tsx`: one localized help sentence
  added to the existing density note (60–70% is the densest range at the
  7–7.5 pt floor; 80%+ keeps larger type). No IA/shell change.
- `apps/desktop/src/renderer/src/state/settings.ts`: two stale comments
  (80–120 → 60–120) in the density percent/value helpers. No behavior change.

### Tests

- `packages/layout/test/page-settings.test.ts`: 60–120 normalization/step,
  80–120 validity, 60/70/80/90/100/120 effective values, strict monotonicity of
  body/H1/padding/gap/card width, floors, heading order, custom-cap policy,
  fingerprint incl. the effective theme, setup/margin identity, CSS variables.
- `packages/layout/test/density-lab.ts` + `density-lab.test.ts`: seven steps
  (60/70/80/90/100/110/120), body-floor at 60 = 7 pt, 80 = 8 pt, 60% card 252,
  min content 140, strict monotone type/boxes, determinism, setup identity.
- `packages/layout/test/density-topology.test.ts` (new): density flips a parent
  A → B2; deterministic per density; low end keeps mode A; high end keeps the
  R2j two below trunks (`callout` 24/38, `child` 12/26) and no blocking defect.
- `apps/desktop/test/page-model.test.ts`: the page model consumes the 60% lens
  (padding 4.8, min content 140, max card 252) and distinct fingerprints.
- `apps/desktop/test/print-parity.test.ts`: 90% print/Page CSS identity now
  8.5 pt (curve).
- `apps/desktop/test/settings-store.test.ts`: 60% low end in the store helpers.
- `tests/ui/m4d1-page-density.test.mjs`: slider range 60/120/5; Page Read/Edit
  at 60% (7 pt, 4.8 px padding, overlay) and 120% (10.8 pt); global/document/
  use-global/cancel/reset flow at 85%/80%; real-DOM lab at seven steps;
  screenshots `artifacts/m4e2/page-read-60.png` and `page-read-120.png`.
- `tests/ui/m4c2-pdf-export.test.mjs`: real-PDF parity at **60/120** (was
  80/120), preflight effective-type check, no settings mismatch.

## Files changed

- `packages/layout/src/page-settings.ts` (range, floors, curve, fingerprint)
- `packages/layout/test/page-settings.test.ts`
- `packages/layout/test/density-lab.ts`, `packages/layout/test/density-lab.test.ts`
- `packages/layout/test/density-topology.test.ts` (new)
- `apps/desktop/test/page-model.test.ts`
- `apps/desktop/test/print-parity.test.ts`
- `apps/desktop/test/settings-store.test.ts`
- `apps/desktop/src/renderer/src/shell/Dialogs.tsx` (help sentence only)
- `apps/desktop/src/renderer/src/state/settings.ts` (comments only)
- `tests/ui/m4d1-page-density.test.mjs`
- `tests/ui/m4c2-pdf-export.test.mjs`
- `docs/reports/m4e2-page-density-topology.md` (this report)

Not touched: settings persistence/store/session/no-document Settings/Continuous
zoom (M4e1), final Settings IA, export UI polish, `layout.ts` (no mode-gate
change needed), spec/UX/ADR/plan.

## Checks and timings

| Command | Result |
| --- | --- |
| `npm run check:boundaries` | Pass — 162 files, 798 imports, 16 rules |
| `npm run typecheck` | Pass — desktop node+web, core, layout, pdf |
| `npm test` | Pass — **100 files / 987 tests**, 2.5–3.0 s warm |
| `npm run verify:fast` | **Exit 0**, 52.5 s wall (46.5 s user); unit 2.5 s, **16 e2e / 43.9 s** |
| `node --test tests/ui/m4d1-page-density.test.mjs` | Pass — 3 tests, 18.3 s (incl. 7-step real-DOM lab) |
| `node --test tests/ui/m4c2-pdf-export.test.mjs` | Pass — 8 tests, 15.5 s (60/120 real PDF) |
| `node --test tests/ui/m4c1-print-compositor.test.mjs` | Pass — 6 tests, 11.9 s |
| `node --test tests/ui/m4b1b1-page-edit-overlay.test.mjs tests/ui/r1b-page-settings.test.mjs` | Pass — 12 tests, 15.3 s |

Baseline was 99 files / 982 tests; the delta is the new topology file plus five
new density tests (net +1 file / +5 tests).

## S2-3 evidence (60–120 representable, 60% actually compact)

Before: `PAGE_DENSITY_MIN` clamped 0.6 to 0.8, the 8 pt floor made 60% and 80%
identical in type, the 280 px card floor made 60% only 16% narrower than 80%,
and the projected 60% page count was equal to or worse than 90/100.

After:

- 60% is accepted, normalized, persisted, and rendered by Read/Edit/PDF.
- Effective values at 60% (compact): body 7, H1 10, code/table 7, padding 4.8,
  card 252, min content 140, child indent 21.2.
- At 80% (compact): body 8, padding 6.4, card 336 — the M4d1 80% body/padding/card
  evidence is unchanged (headings/code/table/chrome interpolate from their own
  floors and are slightly larger than the old hard-clamped values). The real-DOM
  80% page counts on scale-300/showcase/stress still match M4d1 (27/18/30).
- Strict monotonicity from 60 to 100 is tested for body, H1, padding, segment
  gap, and card cap (unit + lab).
- Real DOM (table below): 60% needs **fewer** pages than 80% and 100% on all
  three fixtures; 24/16/27 vs 27/18/30 vs 27/21/35.
- 60% reaches the floor only at the slider minimum; 65–95% interpolate, so no
  plateau where 60% and 80% share a type size.

## S2-4 evidence (adaptive topology, no frozen modes)

The R2j per-parent selection is unchanged: mode A when the free right lane fits
`calloutModeMinWidth` (240, deliberately **not** density-scaled) and the
callouts, otherwise B2 when both fixed below offsets keep a readable card and
stem, otherwise stacked. Because density scales the placed parent card and the
box metrics, the lane shrinks as density grows.

New probe (`density-topology.test.ts`, synthetic A4-portrait anchored parent):

| density | body | root card | free lane | callout mode |
| ---: | ---: | ---: | ---: | --- |
| 60% | 7 pt | 263.6 | 425.0 | A (right lane) |
| 70% | 7.5 pt | 307.2 | 379.0 | A |
| 80% | 8 pt | 350.8 | 333.0 | A |
| 90% | 8.5 pt | 394.4 | 287.0 | A |
| 100% | 9 pt | 438.0 | 241.0 | A |
| 110% | 9.9 pt | 481.6 | 195.0 | **B2 (below)** |
| 120% | 10.8 pt | 525.2 | 149.0 | B2 |

The same density always resolves the same mode; the B2 state keeps the R2j
geometry (callout card at `calloutCardIndent`, child at `childIndent`, trunk
insets 24/12, no blocking defect). No `layout.ts` change and no frozen mode.

**Rule change for the Orchestrator to document:** the product decision of
9 November 2026 makes Page density topology **adaptive**. These stale rules must
be updated outside this brief:

- `docs/review-checklist.md:477-479` says a Page density preset "never changes
  callout topology (A/B2/stacked). A topology change is a separate product
  decision". Replace with: Page density may change a parent's A/B2/stacked mode
  through the same geometric rule; Page Read/Edit/PDF must agree and the
  behavior must be tested. (`:844` already carries the "unless the product
  decision says it may" clause; it is now ratified.)
- `docs/review-checklist.md:846` says body/label ≥ 8 pt. The floor is now **7 pt**
  (density 60%), with the floor-anchored curve; update the number and the
  description.
- `docs/reviews/settings-inventory.md` §3/§5 rows still describe 80–120 and
  8/150/280 as current; they are historical review findings and may be left,
  but AGENTS.md "Current phase" should record M4e2 after integration.

## Acceptance

- [x] Density 60–120, default 100, step 5, normalized.
- [x] Body floor 7 pt, card floor 240, min content 140; 60% is more compact
      than 80% and 100% in type, padding, gaps, and card width.
- [x] Page Read/Edit/PDF share the effective theme; the fingerprint includes the
      resolved lens/floors and stays stable for identical settings.
- [x] Topology adapts and is tested/documented; modes are not frozen.
- [x] Real-DOM lab 60/70/80/90/100/110/120 records page count, whitespace, body
      size, card padding, and readability.
- [x] Targeted tests + one `npm run verify:fast` with timings.
- [x] Report maps criteria, evidence, lab table, and risks.

## Real-DOM density lab

Actual Page Read measurement on the built app; `p1 whitespace` is the empty area
of page 1's content box (card footprint, a sample), not a page-fill metric.
scale-300 is committed; showcase/stress are the local packages present on this
machine. Body size / card padding are identical across fixtures at a given step.

| fixture | density | body | card pad | pages | p1 whitespace | p1 cards |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| scale-300 | 60% | 7 pt | 4.8 px | **24** | 73.6% | 15 |
| scale-300 | 70% | 7.5 pt | 5.6 px | 25 | 72.8% | 12 |
| scale-300 | 80% | 8 pt | 6.4 px | 27 | 69.4% | 12 |
| scale-300 | 90% | 8.5 pt | 7.2 px | 27 | 66.0% | 12 |
| scale-300 | 100% | 9 pt | 8 px | 27 | 61.5% | 12 |
| scale-300 | 110% | 9.9 pt | 8.8 px | 30 | 54.1% | 12 |
| scale-300 | 120% | 10.8 pt | 9.6 px | 37 | 59.9% | 9 |
| showcase | 60% | 7 pt | 4.8 px | **16** | 88.4% | 1 |
| showcase | 70% | 7.5 pt | 5.6 px | 18 | 86.0% | 1 |
| showcase | 80% | 8 pt | 6.4 px | 18 | 83.4% | 1 |
| showcase | 90% | 8.5 pt | 7.2 px | 19 | 80.8% | 1 |
| showcase | 100% | 9 pt | 8 px | 21 | 79.1% | 1 |
| showcase | 110% | 9.9 pt | 8.8 px | 21 | 74.8% | 1 |
| showcase | 120% | 10.8 pt | 9.6 px | 22 | 70.0% | 1 |
| stress | 60% | 7 pt | 4.8 px | **27** | 88.9% | 1 |
| stress | 70% | 7.5 pt | 5.6 px | 27 | 86.6% | 1 |
| stress | 80% | 8 pt | 6.4 px | 30 | 84.2% | 1 |
| stress | 90% | 8.5 pt | 7.2 px | 32 | 81.0% | 1 |
| stress | 100% | 9 pt | 8 px | 35 | 78.4% | 1 |
| stress | 110% | 9.9 pt | 8.8 px | 38 | 73.9% | 1 |
| stress | 120% | 10.8 pt | 9.6 px | 48 | 69.0% | 1 |

Estimator cross-check (DOM-free lab, whole document):

| fixture | 60% | 70% | 80% | 90% | 100% | 110% | 120% |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| scale-300 | 34 | 33 | 33 | 36 | 36 | 36 | 53 |
| showcase | 23 | 23 | 23 | 24 | 23 | 25 | 26 |
| stress | 43 | 44 | 45 | 48 | 46 | 51 | 60 |

PDF parity at the ends (`m4c2` export, 36-block document): **60% = 5 pages,
120% = 6 pages**, 3149/3212 text characters, preflight accepted the effective
type metrics at both ends, no settings mismatch.

### Readability note

- 60% is **7 pt body / 7 pt code / 10 pt H1 / 4.8 px padding**. That is
  fine-print size: legible in the Page Read screenshot and in the exported PDF,
  but noticeably small on screen at Fit page; it is a specialist dense-print
  mode, not a reading default.
- 70% is 7.5 pt with essentially the same page counts on stress/showcase
  (27/18 vs 27/16) and two pages more on scale-300 (25 vs 24). It is the
  gentler dense step.
- 80% keeps the M4d1 8 pt / 6.4 px / 336 px body, padding, and card cap and the
  same real-DOM page counts; its headings/code/table interpolate from their own
  floors and are slightly larger than the old clamped values. 90% is 8.5 pt
  (slightly larger than the old 8.1 pt floor-clamped value); 120% is 10.8 pt.
- The old "90% is the safest dense step" note is **not** confirmed: 60–70% is
  now the dense optimum, 90% lost its floor-free compression advantage. The
  later UI should not advertise 90% as the dense step; recommend 70% as the
  gentle dense step and label 60% as the 7 pt floor.

## Risks / open questions

1. **7 pt at 60% is very small.** The product owner ratified 7 pt; the
   screenshot and PDF are legible but this is a dense-print tool. If the UI
   review wants a softer low end (e.g. 7.5 pt / 65% minimum), that is a product
   call, not a code defect. UI copy now states the 60–70% floor range.
2. **85–95% rendering changed.** To keep the low band monotone, 90% body is
   8.5 pt (was 8.1) and its real-DOM page counts moved 25→27 / 19→19 / 30→32.
   80% is unchanged. No stored settings are lost; values remain valid.
3. **No page-count monotonicity above 100%.** 110/120% can add pages
   (30/37, 21/22, 38/48). This is a lens, not a promise; the lab records it.
4. **S3-3 remains open.** `fontScale`/`headingScale` still multiply after the
   effective floor in `pageCssVariables`; an advanced custom 0.5 scale can
   render below 7 pt. The default density path cannot. The UI does not expose
   those fields; fix/hide them before the Settings typography UI.
5. **Custom type sizes below the floor** scale proportionally (never enlarged);
   the 7 pt floor protects preset-range values, matching the existing
   `minContentWidth` custom-value policy.
6. **Topology is product-adaptive.** A user changing density can see a callout
   move from the right lane to below. The checklist/spec must stop claiming
   otherwise (see the rule-change list above), and the later UI may want a note
   if this surprises users.
7. **Lab locality.** showcase/stress rows depend on `~/Documents/
   NoteForest/...`; scale-300 is committed. The UI suite skips missing packages,
   so CI still runs the committed row and the seven-step invariants.
8. **M4e1 coordination.** No persistence/session/no-doc/Continuous changes were
   made. Only comment text in `state/settings.ts` and the density helpers' tests
   were touched; the density section in `Dialogs.tsx` got one sentence. If M4e1
   restructures that dialog, keep the slider constants and the note.
9. **Fingerprint format.** The fingerprint string is longer (stored theme +
   effective theme). It is computed on both sides of the export in the same app
   version and never persisted; no consumer parses it.
10. **60% page-1 whitespace reads high** because cards are narrow; page count,
    not that sample, is the packing evidence (same caveat as M4d1).

## Handback

- No merge, no push, no PR, no parent-checkout edits.
- Worktree: `a builder worktree`
- Branch: `t3/m4e2-page-density-topology`
- Head SHA: the commit containing this report (reported in the handback message).
- Screenshots: `artifacts/m4e2/page-read-60.png`, `artifacts/m4e2/page-read-120.png`
  (not committed).
- Next: Sentinel review of M4e2 against the brief; then the Settings/UI rework
  (M4e1 landed separately) and the checklist/AGENTS docs update.

## Integration

- Merged to `main` as `e1817f9` (base `70b6a19`; M4e1 already merged).
- One full `npm run verify` after both fixes: **exit 0** — **101 test files /
  1010 tests**, **38 UI suites / 133 tests**, **16 critical e2e**,
  **14 recovery**, **0 pageErrors**.
- SettingsDialog conflict resolved by keeping M4e1's no-document/durable scope
  UI and appending the M4e2 density help sentence.
- The checklist now records the 7 pt body/label floor and adaptive density
  topology. The 85–95% type curve change (90% 8.5 pt, page counts 27/19/32 on
  scale-300/showcase/stress) is accepted as the monotone-curve trade-off.
