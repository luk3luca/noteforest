# Chrome and fixes — card row, squared chips, canvas inset, health, Page

**Role:** Builder
**Milestone:** S2.2 chrome pass (post health polish)
**Base:** HEAD of `main` (the docs commit that adds this brief)
**Worktree:** provided by the orchestrator harness; work only there
**Timebox:** 6 hours

## Context

Health is done. The product owner approved four remaining items in one batch:

- the health all-clear must keep showing the four sections with `0`;
- `runtime.keepAnchorBroken` is dead and goes;
- the Page fit-sync race must be fixed (it was exposed by the 48 px narrower canvas);
- the anchor/reference chips leave their three different positions and become one in-card chrome
  row with the app's rounded-rectangle shape, and the continuous canvas gets enough left padding for
  the drag handle.

Specs: `docs/design/card-chrome.md` (authoritative for C) and
`docs/design/document-health-sidebar.md` §2 (A1).

## Goal

No chip floats over a card or straddles its edge; all text chips are rounded rectangles; the canvas
gutter is fully visible; the health all-clear keeps the four zero groups; a `⇧2 → ⌘0` sequence ends
on an actual fit; `keepAnchorBroken` is gone.

## Part A — Health

1. **All-clear shows the four sections.** In the all-clear state render the four groups with `0`
   (with the “No issues found” line and the information counts above them, as today). An open empty
   group shows “No issues in this group”. The report state is unchanged.
2. **Remove `runtime.keepAnchorBroken`** and any dead session state/imports it owns. No behavior
   change: closing the modal is already the no-op path. Update the runtime type and tests.

## Part B — Page fit-sync race

3. Fix `apps/desktop/src/renderer/src/page/PageView.tsx:480`: the effect that writes the effective fit
   zoom back must not overwrite a newer fit. Read the live fit from the store inside the effect (or
   skip when the closure’s fit no longer matches) and add a regression: a `⇧2 → ⌘0` sequence ends
   with `pageFit: 'actual'` and a 100 % zoom, in the Page UI suite.

## Part C — Card chrome

Follow `docs/design/card-chrome.md` exactly.

4. **One in-card chrome row at the bottom** for every block, present only when there is something:
   the block’s anchor warnings and the `See also`/`Referenced by` chips. Order: state first, then
   references; wrap when needed. The card grows by about 26 px only when the row exists.
5. **Anchor callout**: keep the top head (quote chip + its state) unchanged; its references move to
   the bottom row.
6. **Top-level block**: the warning moves from `bottom: -10px` (half outside) into the bottom row;
   the references move from `top: calc(100% + 2px)` (outside, over the next card) into the same row.
   Nothing is absolutely positioned over the card edge or another card.
7. **Shapes**: `nf-anchor-warning`, `nf-ref-chip`, `nf-callout-state`, `nf-image-action`,
   `nf-image-draw-hint`, `nf-page-badge`, `nf-recovery-pill`, `nf-tree-shared` use
   `border-radius: var(--radius-control)`, height 20 for the chips, 1 px border. No capsule. Keep
   the See-also dashed / Referenced-by solid distinction. `.nf-branch-port` stays a circular icon
   port; add ports are icon buttons.
8. **Canvas inset**: `editorPaddingX` 8 → **24**, medium 8 → **20**, compact 6 → **16**, so the
   16 px gutter plus the drag handle sit fully inside the visible canvas. Check the chapter title and
   the canvas max-width/scroll.
9. **CSS guard**: a test scans `styles.css` and fails on `border-radius: 999px` except
   `.nf-branch-port` (text chips must never be capsules again).

## Part D — Tests and evidence

10. UI: the bottom row exists only when needed; its box is inside the card (no negative offsets) and
    does not intersect the next card; the callout keeps quote + state on top and its references at
    the bottom; a plain card has no row.
11. UI: chip radius/height; canvas gutter bounding boxes (grab handle fully visible at 1440 and at
    the compact width); health all-clear with four `0` groups; the Page regression from B3.
12. Update the existing reference/callout/image/health suites that assumed the absolute positions.
13. Screenshots under `artifacts/chrome/`: the parent block with a warning + references at the
    bottom; the callout with its top quote/state and bottom references; the same card without
    chrome; the canvas left edge with the grab handle; the all-clear sidebar; the Page fit.

## Out of scope

- Health modal content (already approved and merged).
- The app-wide dialog sweep and the `docs/design/dialogs.md` work.
- Page/PDF chip styling beyond the `nf-page-badge` radius.
- The circular ports and add buttons (they are icon controls, not chips).
- Audit, commands, session, schema, spec/UX/ADR/plan changes.

## Files

Read:
- `docs/design/card-chrome.md`
- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx`
- `apps/desktop/src/renderer/src/styles.css` (callout, ref chips, warning, canvas)
- `apps/desktop/src/renderer/src/lib/design-tokens.ts`
- `apps/desktop/src/renderer/src/shell/HealthSection.tsx`
- `apps/desktop/src/renderer/src/state/runtime.ts`
- `apps/desktop/src/renderer/src/page/PageView.tsx`
- `tests/ui/m3-reference.test.mjs`, `m3-anchor-callout-*.test.mjs`, `m3h3-live-health.test.mjs`,
  `document-health.test.mjs`, the Page suite, the design-token tests

Expected to touch: `BlockViews.tsx`, `styles.css`, `design-tokens.ts`, `HealthSection.tsx`,
`state/runtime.ts`, `PageView.tsx`, the tests above, `docs/reports/chrome-and-fixes.md`.

## Acceptance criteria

- [ ] All-clear shows the four sections with `0` and the empty-group line; the report state is
      unchanged.
- [ ] `keepAnchorBroken` no longer exists and nothing references it.
- [ ] `⇧2 → ⌘0` ends with fit actual / 100 %; the regression test proves it.
- [ ] A block with a warning/reference has one bottom row inside the card; a plain block has none; no
      chip is absolutely positioned over the card edge or the next card; the callout keeps its top
      quote + state and gets references at the bottom.
- [ ] The eight text chips use the control radius and 20 px height; the CSS guard passes and allows
      only the branch port; the branch port and add ports are unchanged.
- [ ] Canvas padding is 24/20/16; the grab handle is fully visible at 1440 and at the compact width;
      no horizontal regression.
- [ ] `npm run verify:fast` green; `npm run test:ui:shell` green; updated UI suites; screenshots.
- [ ] No pageerror; no regression in the editor, library, settings or Page.

## Tests and evidence

- Targeted: `npm test`, `npm run build && npm run test:ui:shell`, plus the Page and reference groups.
- End of task: `npm run verify:fast`.
- Screenshots as in D13.
- No native dialogs in tests; no fixed sleeps; do not weaken assertions.

## Stop and ask

- if the chrome row changes the measured card height in a way that reaches the Page composer (it
  should not: the row is editor-only);
- if the Page fix needs a store or renderer contract change;
- if a chip class is also used by the Page/PDF renderer beyond the badge;
- if the padding change breaks the canvas max-width or the horizontal scroll;
- on any spec/UX/ADR change.

## Report format

Summary, files changed, checks with timings, acceptance criteria pass/fail, open questions/risks,
next step. Write `docs/reports/chrome-and-fixes.md`, commit once in the worktree, do not merge, and
report the worktree path and the commit hash.
