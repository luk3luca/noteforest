# M3d1 — Reference edges, see-also chips, shared child

**Role:** Builder  
**Date:** 5 November 2026  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-26b6f0ae`  
**Branch:** `t3/26b6f0ae`  
**Base:** `main` at `39b7a66` (M3c3a merged; M3c3b image anchors blocked)

## Summary

Reference edges are implemented end to end for M3d1:

- **Create:** block menu and anchor menu both offer **Link as reference…** with a searchable
  target picker for existing blocks. The command is the existing typed
  `branch.create` with `role: 'reference'`; there is no new command and no schema change.
- **Identity and dedupe:** duplicate exact source–target links reuse the existing edge regardless
  of role, focus the target, and never create a second row/card/edge. Reference cycles are allowed
  and render both directions with separate lane offsets.
- **Delete:** deleting a reference removes only the edge. The target block, its primary home,
  chapter slot, content, anchors, and subtree are untouched. Undo restores the same branch ID and
  order key through the existing exact structure snapshot.
- **See also / Referenced by:** source cards show **See also** chips with the target title and, for
  anchor sources, the quote; target cards show **Referenced by** chips with source context. Clicking
  focuses the other endpoint. The block menu also lists every outgoing/incoming reference and its
  remove action, and the sidebar target row shows `Shared · N`.
- **Shared child:** the outline is built from primary branches only, so a shared child appears once
  at its primary home. References add no outline rows.
- **Rendering:** reference edges are dashed 1.25 px curves with an open chevron arrowhead, routed
  after card placement in their own SVG group. They never pass through the primary V4 trunk, never
  contribute to layout, and collapse/hidden endpoints silently omit the edge while the chip remains.
- **Layout neutrality:** reference chips are an absolute overlay below the card, not an in-flow
  footer. Card rectangles are therefore byte-identical with and without references. The layout
  package differential now deep-equals blocks, chapters, anchors, defects, pages, continuations,
  and primary edges, and only the reference-edge list differs.
- **Validation cleanup:** the stale M2 `unsupported-m2-feature` warning for reference branches is
  removed. M3 now edits them, and reference edges are a supported part of the document. Anchor
  warnings remain unchanged.

Out of scope and untouched: make-home/move-here/demote, image anchors, repair/health, split/merge,
page/PDF, schema bump, new dependencies.

## Files

Core / model:

- `packages/core/src/validation.ts` — remove the obsolete M2 reference-branch warning.
- `packages/core/test/reference-edges.test.ts` — new reference-edge command matrix.
- `packages/core/test/serialize.test.ts` — reference branches no longer warn as unsupported.
- `packages/layout/test/layout.test.ts` — strengthened reference-neutrality differential (blocks,
  chapters, anchors, defects, pages, continuations, primary edges; block and anchored references).

Renderer:

- `apps/desktop/src/renderer/src/lib/tree.ts` — outgoing/incoming reference selectors and the
  reference-edge projection.
- `apps/desktop/src/renderer/src/lib/reference-routing.ts` — pure cubic router and open chevron
  arrowhead.
- `apps/desktop/src/renderer/src/editor/edges/EdgeLayer.tsx` — separate reference group, cycle lane
  separation, dashed active state, click-to-focus.
- `apps/desktop/src/renderer/src/editor/DocumentEditor.tsx` — feed reference edges to the overlay.
- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx` — See also / Referenced by chip overlay.
- `apps/desktop/src/renderer/src/state/runtime.ts` — `linkReference` and `deleteReference` flows.
- `apps/desktop/src/renderer/src/state/shell.ts` — link-reference dialog state.
- `apps/desktop/src/renderer/src/shell/Dialogs.tsx` — searchable target picker and dedupe feedback.
- `apps/desktop/src/renderer/src/shell/Sidebar.tsx` — `Shared · N` outline chip.
- `apps/desktop/src/renderer/src/actions.ts` — menu, anchor menu, palette entries.
- `apps/desktop/src/renderer/src/App.tsx` — `⌘⇧L` opens the reference picker for the selected block.
- `apps/desktop/src/renderer/src/styles.css` — dashed reference edge, open arrow, chips, shared chip.

Tests / evidence:

- `apps/desktop/test/reference-routing.test.ts` — router unit tests.
- `tests/ui/m3-reference.test.mjs` — block flow and anchor-menu flow.
- `artifacts/m3d1/reference-edges-1440x900.png` — evidence screenshot (not committed; artifacts are
  gitignored).
- `package.json` — add the new UI test to `test:ui` and `verify`.

## Reference creation and rendering

**Create from a block.** Right-click any card → **Link as reference…** (or `⌘⇧L`, or the command
palette). The dialog lists every other block with its chapter, filters by title or chapter, and
calls `runtime.linkReference`. The runtime issues `branch.create` with `role: 'reference'`; the core
validates the port, rejects self-links, and reuses an exact source–target edge regardless of role.
On success the target is focused; a duplicate shows a quiet notice and focuses the existing target.

**Create from an anchor.** The block menu's anchor group includes **Link “quote” as reference…**.
The picker carries `sourceAnchorId`, so the new edge starts at that anchor port. An anchored
reference never creates a callout; the primary anchored callout, if any, is unchanged.

**Chips.** The source card shows one **See also** chip per outgoing reference and the target card
shows one **Referenced by** chip per incoming reference. Each chip carries the other endpoint's
title, chapter, and, for anchored links, the quote in its accessible title. Chips are real buttons
with `data-see-also-branch` / `data-referenced-by-branch`; clicking focuses and selects the other
block. The block menu repeats the lists with remove actions for each edge. The sidebar target row
shows `Shared · N` and focuses the first referring source when clicked.

**Edge.** When both endpoint cards have measured rectangles, the router draws a dashed cubic curve
from the facing source edge to the facing target edge with an open chevron. A two-way pair gets
`lane ±7 px` offsets so both cycle edges remain visible. Reference edges are rendered after the
primary groups, in `.nf-reference-edge-layer`, and are not part of the primary trunk, active-path
muting, or primary arrow count. Clicking a reference edge focuses its target.

## Layout-neutral proof

Structural argument:

1. The outline/sidebar and editor projection use `primaryBranches` / `primaryChildBranches` only;
   reference helpers are separate selectors.
2. Reference creation and deletion mutate only the branch record and revision. Chapters,
   top-level lists, block records, primary branch records/orders, and anchors are unchanged.
3. Reference order lives in the `(port, 'reference')` namespace and cannot perturb primary order.
4. The reference SVG group is outside the flow; chips are absolutely positioned overlays. Adding an
   edge changes neither a card's box nor the primary edge routes.
5. Role-changing commands are M3d2 and are not part of this differential.

Tests:

- `packages/core/test/reference-edges.test.ts` — chapters, blocks, and primary branch records are
  unchanged; references add no outline order entries; cycles validate; delete keeps the target.
- `packages/layout/test/layout.test.ts` — `layout(D)` deep-equals `layout(D + references)` for
  chapters, blocks, anchors, defects, pages, and continuations; primary edges are identical; only
  the reference-edge list differs. Covers a reference cycle and an anchored reference (no callout).
- `tests/ui/m3-reference.test.mjs` — before/after card `x`, `y`, `width`, `height` are equal for
  every card; primary arrow count and outline row count are unchanged; the shared child stays one
  row; removing the edge leaves the target card and content intact; undo restores the same branch ID.

## Tests and timings

| Check | Result |
|---|---|
| `npm run typecheck` | pass (desktop, core, layout, pdf) |
| `npm test` | 37 files, 432 tests passed, 1.81 s |
| `node --test tests/ui/m3-reference.test.mjs` | 2 tests passed, 6.2 s |
| `npm run test:ui` | all 9 UI files passed (13 existing + 2 new cases) |
| `npm run e2e` / `verify:fast` critical | 21 tests passed, 45.3 s; critical count unchanged |
| `npm run verify:fast` | pass |

Screenshot: `artifacts/m3d1/reference-edges-1440x900.png` (1440×900, Fit width 87%). It shows a
dashed **See also** reference from Spectrum to Characteristic polynomial, the open arrowhead, both
chips, `Shared · N` in the outline, and the block-level cycle pair below.

## Risks and open questions

- **Anchored edge origin:** anchored reference edges currently leave the source card's facing edge,
  not the exact anchor dot. The chip carries the anchor quote and the edge is clearly dashed, but a
  strict UX reading of “dashed from the anchor dot” would need an anchor-rect measurement pass
  (M3d2/M3e follow-up).
- **Chip density:** chips are an overlay so they never move a card. With several incoming and
  outgoing references they wrap below the card and can overlap nearby content; the block menu always
  has the complete list. A later inspector/popover can replace the multi-chip strip.
- **Obstacle avoidance:** the reference router is a deterministic curve with cycle lane separation;
  it does not yet avoid crossing unrelated cards. Spec §7.7 says the router SHOULD avoid crossings,
  not MUST.
- **Navigation history:** chip and edge clicks focus the endpoint but do not yet push back/forward
  history; that belongs to the broader navigation slice.
- **Reference labels:** `branch.label` is preserved and exposed in the data/title path, but no M3d1
  UI edits a label; relabel is a later inspector/polish task.
- **Dedupe revision:** a duplicate link reuses the edge but the core still bumps the document
  revision and saves, consistent with existing duplicate-branch behaviour.

## Next step

M3d2: make home / move here / demote. Reuse the reference chips/menu surfaces, enforce promotion
cycle guards before mutation, handle chapter slots and the empty-chapter rule, and keep the M3d1
pure reference create/delete/reorder paths layout-neutral.
