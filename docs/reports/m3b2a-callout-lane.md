# M3b2a — Anchored callout lane in the editor

**Date:** 5 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-512bb953`  
**Branch:** `t3/512bb953`  
**Base:** `ab15c52` (`main`: docs: merge M3b1 and start M3b2a)  
**Scope:** the editor callout lane only. No schema/canonical change, no outline anchored rows or marker
navigation (M3b2b), no health/repair (M3e), no formula/code/image anchors (M3c), no reference edges
(M3d), no split/merge (M3f), no page/PDF, no new critical e2e.

## Summary

Anchored primary children no longer render inside the normal child group. For rendering, the editor
splits each block's primary children into an **anchored callout lane** and a **direct-child group**.
The lane sits below the parent card and before the direct children; callouts align to their live anchor
mark, stack in outline order, show a truncated quote chip, and keep their normal editable/
collapsible/branchable block card. The canonical document still has one ordered primary child list.

Edges are routed separately for the lane: parent → callout edges run down the parent's left gutter and
enter each callout from the top with a fixed down arrow, without crossing another callout or looping
over the parent. Direct-child edges keep the existing V4 router; when a lane exists the direct group is
below the lane and shares the same left gutter.

## Files

| File | Change |
|---|---|
| `apps/desktop/src/renderer/src/lib/adapter.ts` | `projectPrimaryChildren` split (anchored vs direct), quote/state projection, `calloutLane` wrapper node with callout attrs. Canonical extraction unchanged. |
| `apps/desktop/src/renderer/src/lib/tree.ts` | `edgePairs` emits anchored callout edges first (D3), then direct edges; adds `kind`/`anchorId` to the descriptor. |
| `apps/desktop/src/renderer/src/lib/edge-routing.ts` | `routeCalloutEdge`: left-gutter trunk, per-callout bus, top entry, down arrow, forward-only path. |
| `apps/desktop/src/renderer/src/lib/geometry.ts` | `calloutGap`, `calloutEdgeGutter`, `calloutBusOffset`. |
| `apps/desktop/src/renderer/src/editor/extensions.ts` | `calloutLane` editor node (projection only) and callout attrs on block/body wrappers. |
| `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx` | Callout row wrapper, quote chip/state, decorative dot + dotted leader, render-time anchor measurement and clamping. |
| `apps/desktop/src/renderer/src/editor/edges/EdgeLayer.tsx` | Splits callout vs direct routing per parent; adds `data-edge-kind`/`data-anchor-id`. |
| `apps/desktop/src/renderer/src/state/runtime.ts` | Fast DOM paths that assumed `child(1)` is `branchChildren` now detect a callout lane and rebuild from canonical instead. |
| `apps/desktop/src/renderer/src/styles.css` | Lane column layout, clamped callout rows, quote chip, quiet dot/leader, collapsed-lane hiding. |
| `apps/desktop/test/adapter.test.ts` | Projection/lane order, branch order inside one anchor, quote truncation, direct split. |
| `apps/desktop/test/tree.test.ts` | Callout-first edge descriptors and anchor ID. |
| `apps/desktop/test/edge-routing.test.ts` | Callout edge forward path, clamped callout, shared gutter above a stack. |
| `tests/ui/m3-anchor-callout.test.mjs` | New geometry/UI suite: two callouts + one direct child, stacking, quote, editable/branchable, forward edges; far-right clamp; screenshots. |
| `package.json` | `test:ui` and `verify` run the new UI file. |
| `docs/reports/m3b2a-callout-lane.md` | This report. |

No spec, UX, ADR, plan, fixture, canonical schema, or dependency changed.

## Projection rules

- `anchoredChildBranches(document, id)` feeds the lane; `directChildBranches(document, id)` feeds the
  normal `branchChildren` group. Both come from the shared core selectors, so the anchor order key and
  branch order cannot drift from the outline.
- Callout order: anchor order (resolved start position, then anchor ID), then branch order inside one
  anchor. Broken/ambiguous anchors keep the core ordering fallback and still render.
- Quote chip: stored anchor quote, else selector `quote`/`latex`/`label`, truncated to 64 chars. The
  state comes from `resolveAnchor`; broken/ambiguous/block-missing gets a quiet header chip. Full
  health/repair remains M3e.
- The lane is a TipTap wrapper node (`calloutLane`) between `blockBody` and `branchChildren`. It is an
  editor-projection wrapper, never stored: `extractBlockContents` already ignores wrappers and only
  keeps `blockBody` content.
- Callout blocks recurse through the normal builder, so a callout's own anchored children create a
  nested lane and its direct children remain a normal nested group.
- Collapse hides the lane with the direct-child group; the canonical child count is unchanged.

## Geometry rules

- Callout card left = live anchor union left + 16 px (`calloutGap`) when the minimum callout width
  (144 px) fits inside the parent card.
- If it does not fit, the card falls back to the parent card's content left (10 px padding), sets
  `data-callout-clamped="true"`, and keeps the connector dot/leader.
- The lane starts below the parent card with a 16 px gap. Rows stack with an 8 px row gap and a 10 px
  top padding for the dot/leader. A second callout always starts below the previous card.
- With a lane present the parent content row becomes a column: card → lane → direct-child group. Buttons
  and cards stay in normal flow; there is no free positioning and no stored coordinate.
- The row dot and dotted leader use measured anchor-relative CSS variables. Both are `aria-hidden`;
  the quote chip carries the readable text. The M3b1 dotted underline and marker dot in the parent text
  are unchanged.
- Measurement is in layout pixels (correct at CSS zoom/Fit width) and re-runs on card/lane resize, text
  mutations, window resize, and font load. The callout card itself is measured by the existing
  `useBlockRects`, so Fit width and edge routing include it.
- Direct children keep their normal group/card behavior; they simply start after the lane. No block
  type was added to the canonical document.

## Edge evidence

- `routeCalloutEdge` starts at `parent.bottom` in the left gutter (`parent.x + 4`), runs down to a bus
  above each callout, then right and down into the callout top. The final stem is 12 px, the arrowhead
  is the fixed 6 × 6 down polygon, and the path only moves right and down.
- Because the trunk stays in the left gutter, a later callout's route cannot cross an earlier callout
  card. The UI test checks the horizontal bus of the second callout sits below the first card.
- Direct-child edges still use `routeChildGroup` (V4). With a lane present the direct group is below,
  so the existing below route is used with the trunk in the same gutter; it cannot cross a callout.
- The new UI test parses the rendered SVG paths and asserts: callout edges are `below`, arrows point
  down, the end is below the start, every path point stays at/right of the parent's left edge, and no
  point moves backwards in x or y. Direct-child edges are also `below` with a down arrow and a forward
  path. Unit tests cover the pure router separately.
- Measured UI evidence (1440 × 900, demo parent "Take the symmetric matrix below…"): parent card
  ≈ 460 × 94 px; callouts ≈ 144 px wide; aligned callouts sit 16 px right of their anchor; the first
  callout top is 16 px below the parent plus row padding; the second starts 18 px below the first
  card; the direct child follows after the lane; the direct bus is 8 px clear of the last callout.
  Clamp case: the `omega` anchor falls back to the card content left (10 px) with a dotted leader and
  no overflow.

## Tests and evidence

| Check | Result |
|---|---|
| `npm run typecheck` | pass (desktop, core, layout, pdf) |
| `npm test` | 371/371 pass, 33 files, 2.0 s |
| `node --test tests/ui/m3-anchor-callout.test.mjs` | 2/2 pass; suite 1.3 s, 9.4 s process including Electron launches |
| `npm run test:ui` | pass: M2 view 1/1, M2 shell 4/4, M3 callout 2/2 |
| `npm run verify:fast` | pass; typecheck + 371 unit + critical e2e 21/21 |
| Critical e2e suite | 21 tests, 44.8 s (unchanged test count; under 60 s) |
| Screenshot: lane | `artifacts/m3b2a/callout-lane-1440x900.png` |
| Screenshot: clamp | `artifacts/m3b2a/callout-clamp-1440x900.png` |

The new UI test uses condition-based waits only (no fixed sleeps, no native dialogs). It exercises the
real runtime command/rebuild path: `branch.createFromSelection` for each anchor, then a normal
`block.create` direct child under the parent.

No full `npm run verify` was run, per the brief; the Orchestrator runs it at integration.

## Risks and follow-ups

- The lane is an editor CSS/measurement approximation. M4's layout/paginator must place anchored
  callouts from the same core order key; pixel parity (AC-52) remains an M4 gate.
- Adding/moving/deleting under a parent that has a callout lane deliberately rebuilds the editor from
  canonical. It is correct but slower than the M2 fast DOM path; the fast path is retained for blocks
  without a lane.
- Drag-reordering across the callout/direct boundary also rebuilds; within a group it stays fast.
- The callout header shows only quote + existing resolution state. Anchor count, click-cycling,
  outline anchored rows, and keyboard anchor navigation are M3b2b; repair is M3e.
- Formula/code/image anchors still use the same lane but their marker geometry is best-effort until
  M3c.
- During repeated full-suite runs under load, two pre-existing timing flakes were observed once each
  (chapter-title focus after the second "Add chapter", and the raw mouse-drag word selection in the
  M3b1 test). Both pass in isolation; the callout test is unaffected, and the final full suite passed
  21/21 at 44.8 s. No critical test was added or extended.

## Next step — M3b2b

Add the outline anchored row (`↳ “quote”`), anchor-count chip, marker click/cycling, and keyboard
selection on top of this projection. Keep the adapter split, lane geometry, and edge descriptors; the
outline and lane must read the same `anchoredChildBranches` order.
