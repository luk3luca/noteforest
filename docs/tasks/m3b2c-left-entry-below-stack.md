# M3b2c — Left-entry below-stack routing (callouts + wrapped direct children)

**Role:** Builder  
**Milestone:** M3b2c (routing fix before M3c2/M3c3)  
**Base:** current `main` (M3c1 merged)  
**Worktree:** fresh worktree from `main`  
**Timebox:** 1 day

## Context

M3b2a put callouts below the parent and moved the direct-children group after the lane. It routed
callout and wrapped-child edges **down into the card top**, producing a single vertical line through
the stack. The product owner confirmed a different model:

- direct children stay to the **right** while they fit; when they wrap, they join the below stack;
- anchored callouts always go below the parent;
- every edge enters the target from the **left**, never from the top;
- the below stack uses one shared left trunk with horizontal arms (`|->`), not a line through cards;
- multiple callouts and multiple direct children from the same parent coexist.

This supersedes the M3b2a "direct child group below the lane / top-entry" routing. It is also the
model M4 needs when the canvas is constrained to A4.

Read:
- `docs/design/m3-anchors-references.md` §6.2 (placement + product-owner revision), §6.3, §6.9.
- `docs/ux.md` v1.3 §8.5/§10.3; spec §7.4/§7.10 (callout lane; left-entry is the rendering rule).
- `apps/desktop/src/renderer/src/lib/adapter.ts`, `lib/tree.ts`, `lib/edge-routing.ts`,
  `editor/edges/EdgeLayer.tsx`, `editor/views/BlockViews.tsx`, `styles.css`, `tests/ui`,
  `apps/desktop/test/edge-routing.test.ts`.

## Goal

A parent with N direct children and M anchored callouts renders a right group for direct children
that fit, and a below stack (callouts first, wrapped direct children after) with a shared left trunk,
horizontal arms, and right-pointing arrowheads into the left side of every row. No top-entry arrows,
no trunk through a card, no overlap.

## In scope

1. **Projection and placement**
   - One ordered child list per parent with `kind: 'direct' | 'callout'` and anchor metadata.
   - Direct children are placed right when they fit the available width; otherwise below.
   - Callouts are always below, ordered by the shared anchor order (start, anchor ID, branch order).
   - Below stack order: callouts first, then wrapped direct children; deterministic.
2. **Below-stack layout**
   - One lane below the parent; rows stack vertically with a fixed gap; callout rows keep the quote
     chip/leader, direct rows are plain cards.
   - Lane width is bounded so it does not overlap the right group; no card overlaps another.
   - Multiple callouts from one anchor stack in branch order; callouts from different anchors follow
     the anchor order key.
3. **Routing**
   - One shared trunk in the left gutter, starting at the parent bottom-left; one horizontal arm per
     row at the row's center Y; arrowhead points right into the row's left edge.
   - Final horizontal stem >= 12 px; fixed 6x6 arrowhead; no `down` arrows; no vertical line through
     a card; no U-turn/backwards path.
   - Right group keeps the existing V4 trunk/bus and left-entry arrows.
   - The callout anchor leader remains decorative; it does not replace the left-entry arrow.
4. **Tests/evidence**
   - Router unit tests for: only direct; only callouts; both; multiple callouts; multiple direct;
     narrow width forcing direct children below; all arrows right; shared trunk/arms; no top entry;
     no overlap; deterministic order.
   - UI suite: parent with 2 callouts + 2 direct children at 1440 (right group), and a narrow width
     that wraps one direct child below after the callouts; assert arrows enter the left edge, no
     down arrows, no trunk crossing cards; screenshot.
   - No new critical e2e; critical stays 21 tests.

## Out of scope

- M3c2 formula terms, M3c3 code/image, M3d reference edges, M3e repair, M3f split/merge.
- Page/PDF layout; M4 paginator changes.
- New block types/schema; new dependencies.

## Files

Expected to touch:
- `apps/desktop/src/renderer/src/lib/adapter.ts`, `lib/tree.ts`
- `apps/desktop/src/renderer/src/lib/edge-routing.ts`
- `apps/desktop/src/renderer/src/editor/edges/EdgeLayer.tsx`
- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx`
- `apps/desktop/src/renderer/src/styles.css`
- `apps/desktop/test/edge-routing.test.ts`, `adapter.test.ts`, `tree.test.ts`
- `tests/ui/m3-anchor-callout.test.mjs` or a new `tests/ui/m3-below-stack.test.mjs`
- `package.json` only if a new UI file is added
- `docs/reports/m3b2c-left-entry-routing.md`

## Acceptance criteria

- [ ] Direct children render right when they fit; wrapped direct children join the below stack after
      the callouts; canonical structure/outline order unchanged.
- [ ] Every callout/wrapped direct edge enters from the left with a right arrowhead; no top-entry
      arrows and no vertical line through a card.
- [ ] One shared left trunk with horizontal arms; multiple rows/anchors do not overlap.
- [ ] Callout rows keep the quote chip/leader; direct rows are visually plain.
- [ ] Narrow-width wrap and multiple children of both kinds are covered by unit + UI tests and a
      screenshot.
- [ ] Critical e2e stays 21 tests and <60 s; no fixed sleeps/native dialogs.
- [ ] No term/code/image/reference/repair work.

## Tests and evidence

- `npm run typecheck`
- Targeted edge-routing/adapter/tree unit tests
- The new/extended UI test and `npm run test:ui`
- `npm run verify:fast` once at the end (critical e2e unchanged)
- Screenshot path and geometry numbers.
- Do not run the full `npm run verify`; the Orchestrator runs it at integration.

## Stop and ask

Stop if the model requires a second layout engine, a schema change, or if the right/below decision
cannot be made from the measured width without a new measurement pass.

## Report format

Summary, files, projection/placement rules, router geometry, UI test/screenshot, timings, risks,
next step M3c2.
