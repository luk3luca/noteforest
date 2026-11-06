# M3g1 — Below-stack indentation and idle anchors

**Date:** 6 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-bac8778b`  
**Branch:** `t3/m3g1-below-stack-idle-anchor`  
**Base:** `9d92f99` (`main`: docs: start M3g1 product-owner review fixes)  
**Scope:** the two product-owner review bugs only. No image anchors, paste/duplicate UI,
chip-overlay polish, page/PDF, schema bump, dependency, or new critical e2e.

## Summary

The below stack now reads as one trunk leaving the parent's **bottom edge** and stepping every row
inward:

- the shared trunk starts at `parent.x + 12` on `parent.bottom`, never left of or behind the card;
- callout and wrapped-direct rows start at least `26 px` right of the parent card's left edge
  (`12 px` trunk inset + `2 px` arrow gap + `12 px` stem), more when the anchor is farther right;
- every row is bounded by the lane's remaining width, so no card overflows the parent/lane right
  edge, including a narrow parent where the row must shrink below the usual 144 px minimum;
- single rows use the same in-card trunk elbow as multi-row stacks; all arrows are horizontal and
  enter from the left.

An anchor with no outgoing branch is now visually idle: the canonical anchor record and text
binding survive (OD-2), but the underline, dot, formula/code marker and callout are hidden. Undo
restores the previous branch and marker exactly because no canonical data was removed.

## Files

| File | Change |
|---|---|
| `apps/desktop/src/renderer/src/lib/geometry.ts` | Replaced `belowTrunkGutter` with `belowTrunkInset` (12) and `belowRowInset` (26); removed the now-unused `cardPadding`. |
| `apps/desktop/src/renderer/src/lib/edge-routing.ts` | `routeBelowStackGroup` anchors the trunk at `parent.x + belowTrunkInset`; it no longer moves left with a far-left row. A row inside the stem minimum is a defect. |
| `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx` | Callout rows align at `cardLeft + belowRowInset` at minimum; lane width and far-right anchor clamp use the lane/card right edge; `--nf-below-indent` is set from geometry. |
| `apps/desktop/src/renderer/src/lib/tree.ts` | `linkedAnchorIds(document)`: anchors with at least one live outgoing branch of any role. |
| `apps/desktop/src/renderer/src/editor/DocumentEditor.tsx` | Layout-effect view pass marks branchless anchor DOM (`data-anchor-idle`) across text marks, formula/code overlays and marker buttons. No document mutation. |
| `apps/desktop/src/renderer/src/styles.css` | Idle marker rules (underline/dot/formula/code/marker hidden); below-row indent 26; below cards may shrink on a narrow lane; callout/direct row max-width bounded by the lane. |
| `apps/desktop/test/edge-routing.test.ts` | Updated below-stack matrix for the in-card trunk, minimum indent, full stem, far-left defect and direct-only stacks. |
| `apps/desktop/test/tree.test.ts` | `linkedAnchorIds` covers primary/reference branches and a branch whose target is gone. |
| `tests/ui/m3-anchor-callout.test.mjs` | 1440/960 geometry assertions for trunk-inside-parent, >=24 px indent, bounded right edge and left-entry arms; two idle-anchor tests (target delete and last-branch delete with undo); screenshots. |
| `docs/reports/m3g1-review-fixes.md` | This report. |

No spec, UX, ADR, schema, fixture, dependency or critical e2e change. The view-only idle marker is
not persisted; the canonical anchor/binding is untouched.

## Before / after geometry

Router contract for a parent with below rows:

```text
before
  trunkX = min(parent.x - 8, minRowLeft - 2 - 12)   // 8 px left of the card
  callout min left = card content left = parent.x + 10
  wrapped direct min left = parent.x + 10

after
  trunkX = parent.x + 12                            // on the bottom edge, inside the card
  row min left = parent.x + 26                     // 12 + 2 + 12, >= the 24 px product floor
  row right  <= min(lane.right, parent.right)
```

The trunk is fixed: a row that comes back closer than the stem minimum is flagged as a layout
defect instead of dragging the trunk outside the parent card. Single-row stacks use one continuous
elbow from `(parent.x + 12, parent.bottom)`; multi-row stacks share one vertical trunk and one arm
per row. Arms are sharp/orthogonal and always point right.

### Measured after (1440 × 900)

Parent “Take the symmetric matrix…”, 2 callouts + 2 direct children:

- parent `460 × 94.32` at content `x 0`, bottom `371.01`; lane `460 × 188.69` directly below;
- below trunk `x = 12` (was `-8`), from `y 371.01` to the last row center;
- callout cards at `x 90` and `x 291` (anchor alignment is farther right than the floor), widths
  `92.34` and `99.40`, right edges inside the lane's `460`;
- both arms start at `x 12`, keep a horizontal final stem of at least 12 px, and point right;
- both direct children still enter at `parent.right + 16`.

### Measured after (960 × 900)

Same fixture at the minimum supported window:

- parent `460 × 94.32`, lane `460 × 272.73`;
- two callouts at `x 90` and `x 291`;
- the wrapped long direct row now starts at `x 26` (was `x 10`) and spans `434 px` to the lane right
  edge (`460`), with no overflow;
- one shared trunk at `x 12` across all three rows, then one right-entry arm per row.

Screenshots:

- `artifacts/m3g1/below-stack-1440x900.png`
- `artifacts/m3g1/below-stack-960x900.png`
- `artifacts/m3g1/idle-anchor-1440x900.png` (target deleted: no underline/dot/callout)

## Idle anchors

`linkedAnchorIds` is the single renderer idle test: an anchor is linked when it has at least one
outgoing branch whose target block still exists (primary or reference). `DocumentEditor` applies
`data-anchor-idle` in a layout effect to text marks, whole-formula/code nodes, formula-term/code
overlays and marker buttons. CSS then removes the dotted underline, dot, formula/code marker and
selected-anchor background; the adapter already omits callouts with no live branch.

Because the binding and anchor record are not deleted, the following are exact:

- deleting the target block removes the branch and leaves the source mark idle; undo restores the
  anchor record, text binding and branch (asserted by deep equality on anchors/branches and on the
  source block content);
- deleting the last branch with `targetHandling: "promote"` keeps the target block and leaves the
  source mark idle; undo restores the same branch and marker;
- an anchor may be idle indefinitely (OD-2); removal remains an explicit health-sheet action.

Formula-term and code overlays are already projected only while branches exist; the same idle pass
also hides any overlay left mounted between a branch deletion and the next editor rebuild. The UI
test uses a text anchor (the required minimum); the formula/code paths share the same
`[data-anchor-ids]` / overlay attribute pass.

## Tests and evidence

| Check | Result |
|---|---|
| `npm run typecheck` | pass (desktop node/web, core, layout, pdf) |
| `npm test` | 474/474 pass, 43 files, 1.75–2.06 s |
| `node --test tests/ui/m3-anchor-callout.test.mjs` | 5/5 pass; suite 3.8 s, process 11.9 s |
| `npm run test:ui` | 23/23 pass (was 21; +2 idle-anchor UI tests), 120.8 s including build |
| `npm run verify:fast` | pass; critical e2e 21/21, 45.4 s suite (60.5 s including typecheck/unit/build) |

UI tests use condition-based waits only (`waitLayout`, `waitForFunction`, callout-offset waits); no
fixed sleeps, no native dialogs, hidden window. The critical e2e count is unchanged at 21. No full
`npm run verify` was run, per the brief; the Orchestrator runs it at integration.

## Risks and follow-ups

- **View-only idle state.** The idle marker is a DOM attribute recomputed from canonical branches on
  each `runtime.version`; it is not stored. M4's page/PDF renderer must apply the same
  `linkedAnchorIds` rule rather than relying on the editor DOM pass.
- **Narrow lane cards.** A 160 px parent cannot give a 144 px row after a 26 px indent. Below cards
  are therefore allowed to shrink (`min-width: 0`) instead of overflowing; at very narrow widths
  the callout text wraps more aggressively. No horizontal overflow was measured at 960; the 160 px
  floor remains untested as a visual case.
- **Far-right anchors** still clamp back to the indented row origin when the anchor leaves less than
  a 144 px card; this is the approved §6.2 fallback and the connector dot/leader stays.
- **Single-row visual trunk** is the vertical segment of the edge, not a separate trunk element.
  Geometry tests cover it, but there is no standalone trunk DOM node to click in that case.
- Formula/code idle markers are covered by the shared mechanism but not separately UI-tested; the
  text-anchor target-delete and last-branch-delete flows are the required regression tests.
- Image anchors remain blocked on the missing image insertion/asset pipeline.

## Next step

Sentinel M3 review of the accumulated M3 work, including these two review fixes. M4/PDF remain
blocked until M3 is accepted.
