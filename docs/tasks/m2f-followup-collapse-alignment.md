# M2f follow-up — collapsed branch-port alignment

**Role:** Builder  
**Milestone:** M2f follow-up  
**Base:** `main` after the M2f acceptance docs commit  
**Worktree:** fresh worktree from `main`  
**Timebox:** under 1 hour

## Context

The product owner's visual pass found one minor offset: when a block with children is collapsed, the
count bubble at the top-right is slightly left of the add-child control below it. Measurement on the
current build:

- `.nf-branch-port` is 20 px wide (`min-width: 16px; padding: 0 2px`), right edge 800, center 790.
- `.nf-add-child` is 16 px wide, right edge 800, center 792.
- The collapsed `.nf-port-dot` is 16 px, centered at 790 inside the 20 px port.

The 2 px difference is the horizontal port padding, not the icon.

## Goal

The branch port's count bubble and chevron share the same horizontal center as the add-child control
below, in both expanded and collapsed states, without moving the card edge.

## In scope

- Remove the horizontal padding that makes the port 20 px; keep a minimum 16 px box and let a
  multi-digit count grow to the left from the fixed right edge.
- Add a UI assertion in the existing `tests/ui/m2-shell.test.mjs` layout test: for a block with
  children, the branch-port center and the add-child center differ by at most 0.5 px, expanded and
  collapsed.
- Capture one visible-window screenshot of a collapsed node as evidence
  (`artifacts/m2f-collapse-alignment.png` or an existing visual artifact path).

## Out of scope

- Any other visual change, spacing, icon, hover, or animation.
- The sidebar tree count/chevron.
- M3, page view, PDF.
- New e2e tests or changes to the critical suite.
- Re-baselining visual screenshots beyond the new evidence file.

## Files

Read:
- `apps/desktop/src/renderer/src/styles.css` — `.nf-branch-port`, `.nf-port-dot`, `.nf-add-child`.
- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx` — port/add-child DOM.
- `tests/ui/m2-shell.test.mjs` — parent-relative layout test.

Expected to touch:
- `apps/desktop/src/renderer/src/styles.css`
- `tests/ui/m2-shell.test.mjs`
- `docs/reports/m2f-collapse-alignment.md`

## Acceptance criteria

- [ ] Collapsed state: branch-port center X equals add-child center X within 0.5 px.
- [ ] Expanded state: branch-port center X equals add-child center X within 0.5 px.
- [ ] A single-digit count bubble is 16 px wide and does not overlap the card edge.
- [ ] A two-digit count still grows to the left and keeps the right edge fixed.
- [ ] The new UI assertion fails on the old CSS and passes on the fix.
- [ ] Screenshot evidence shows the aligned bubble and control.
- [ ] No other geometry/visual assertion changes.

## Tests and evidence

- `npm run typecheck`
- `npm run build`
- `node --test tests/ui/m2-shell.test.mjs`
- Screenshot path and the measured centers before/after.
- Do **not** run the full `npm run verify`; the Orchestrator runs it at integration.

## Stop and ask

Stop and report if the fix requires moving the card edge, changing the add-child control, or
touching more than the branch-port box; those would be a design change, not a minor fix.

## Report format

Summary, files, before/after centers, commands and timings, screenshot path, risks, next step.
