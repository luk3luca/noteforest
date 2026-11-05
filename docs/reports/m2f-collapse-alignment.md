# M2f follow-up — collapsed branch-port alignment

**Date:** 5 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-7e5fbd4a`  
**Branch:** `t3/m2f-collapse-port-alignment`  
**Base:** `76e0bd1` (`main`: docs: accept M2f and start M3 design)  
**Scope:** CSS-only branch-port box fix plus one UI alignment assertion. No M3, page view, PDF,
sidebar tree, or new e2e.

## Verdict

The 2 px offset is closed. The collapsed count bubble and the add-child control now share the same
horizontal center in both expanded and collapsed states, and a two-digit count still grows left from
the fixed right edge. The new UI assertion fails on the old CSS (measured
`branch-port center 790 vs add-child center 792`) and passes on the fix. No other assertion changed;
the full `tests/ui/m2-shell.test.mjs` file passes 4/4.

## Root cause

`.nf-branch-port` carried `padding: 0 2px` on top of its `min-width: 16px` box.

- Expanded: the 12 px chevron plus 4 px horizontal padding measured exactly 16 px, so the chevron
  was already centered over the add-child control.
- Collapsed: the 16 px `.nf-port-dot` plus 4 px horizontal padding made the port 20 px wide. With
  `right: -8px` fixed, the box grew to the left, moving its center 2 px left of the 16 px
  add-child control.

The icon was never the problem; the horizontal padding was.

## Fix

`apps/desktop/src/renderer/src/styles.css` — `.nf-branch-port` now uses `padding: 0` and keeps
`min-width: 16px; height: 16px`. The absolutely positioned box still has a fixed right edge
(`right: -8px`), so a two-digit count grows to the left without moving the card edge, the chevron,
or the add-child control. Nothing else in the file changed.

## Measured centers (before/after)

Measured at 1440×900 from the running app (`artifacts/` evidence script, empty parent → child →
grandchild chain; the collapsed card is depth 1). The layout test measures the same property on its
own four-level chain at 1440×900.

| State | Before (`padding: 0 2px`) | After (`padding: 0`) |
| --- | --- | --- |
| Port width, expanded | 16.00 px (chevron) | 16.00 px (chevron) |
| Port width, collapsed | 20.00 px | 16.00 px |
| Port center X, expanded | 632.00 px | 632.00 px |
| Add-child center X, expanded | 632.00 px | 632.00 px |
| Port center X, collapsed | 630.00 px | 632.00 px |
| Add-child center X, collapsed | 632.00 px | 632.00 px |
| Offset, collapsed | **2.00 px left** | **0.00 px** |
| Single-digit dot box, collapsed | 622–638 px (16 px) | 624–640 px (16 px) |
| Add-child right edge | 640 px | 640 px |
| Two-digit count (10 children) | — | 20.84 px wide, left edge 459.16, right edge **480 px unchanged** |

In the layout test's four-level chain, the failing old-CSS measurement was
`collapsed: branch-port center 790 vs add-child center 792`; after the fix both are `792`.
The expanded state passed before and after (the 12 px chevron never made the box 20 px).

## UI assertion

`tests/ui/m2-shell.test.mjs`, inside the existing `places children parent-relative and scrolls
horizontally for deep branches` layout test — no new test, no fixed sleeps:

- `portGeometry()` measures the port box, the add-child control, the count bubble, and the card's
  right edge from the live DOM.
- Expanded: each of the three parents in the four-level chain has a 16 px port and
  `|portCenter − addCenter| <= 0.5`.
- Collapsed (deepest parent): the 16 px count bubble keeps the add-child right edge, does not
  overlap the card content edge, and `|portCenter − addCenter| <= 0.5`.
- Two-digit count (ten children on the chain root): the bubble is wider than 16 px, its right edge
  stays on the fixed right edge, and it grows to the left.

Proving the assertion catches the bug: with the committed CSS restored to `padding: 0 2px`, the
layout test failed at the collapsed check with the message above. With the fix, it passes.

## Evidence

- Full visible window, 1440×900 CSS px (2880×1800 PNG):
  `artifacts/m2f-collapse-alignment.png`
- Tight crop of the collapsed node and both controls: `artifacts/m2f-collapse-alignment-detail.png`

The E2E window was launched with `NOTEFOREST_E2E_HIDDEN: '0'` for this capture; no screen
recording, no native dialogs.

## Commands and timings

| Command | Result | Time |
| --- | --- | --- |
| `npm ci` (fresh worktree had no `node_modules`) | 0 | 3.9 s |
| `npm run typecheck` | 0 | 6.5 s |
| `npm run build` | 0 | 1.0–2.4 s |
| `node --test tests/ui/m2-shell.test.mjs` | 0, 4/4 pass | 13.9 s |
| `node --test --test-name-pattern="places children parent-relative" tests/ui/m2-shell.test.mjs` | old CSS: 1 fail; fixed CSS: 1 pass | 20.0 s first run / 10.4 s |

`npm run verify` was **not** run; integration is the Orchestrator's step. No full e2e, perf, or
visual suite was run.

## Risks and notes

- The port's hover background is now 16 px wide instead of 20 px in the collapsed state; that is a
  consequence of the box fix, not a separate visual change.
- A multi-digit count intentionally shifts the port box center left while its right edge stays
  fixed; the center assertion is therefore scoped to single-digit counts, and the two-digit case
  asserts the right-edge invariant instead.
- `artifacts/m2e/collapse-dot-1440x900.png` from the visual suite will change by 2 px on its next
  run; visual artifacts are not committed baselines.
- No product, spec, UX, plan, page-view, or PDF behavior changed.

## Next step

Orchestrator: integrate `t3/m2f-collapse-port-alignment`, run the single full `npm run verify` at
integration, and record the follow-up as closed for M2f.

## Orchestrator integration

- Merged on `main` as `21501f1` (`merge: align collapsed branch-port with add-child control`).
- `npm run verify` exit 0: unit 252, critical e2e 20/20 at **54.1 s** suite time, recovery 14/14,
  UI 5/5 (view 1 + shell 4). E2E windows hidden; no native dialogs.
- Follow-up closed for M2f. M3 design package is in progress.
