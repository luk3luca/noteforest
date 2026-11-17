# R2g — Page trunk continuity across pages

**Role:** Builder / Implementer  
**Milestone:** M4b Page / edge stabilization  
**Base:** `6c44512` — WIP + R2f; full `npm run verify` green at this base  
**Worktree:** assigned by the Orchestrator with `delegate_task` worktree isolation  
**Timebox:** 4 hours

## Context

R2f made every same-page primary tree edge use one semantic trunk per
`(parent, placement)` group. Cross-page primary edges still use the old
`to-edge` / `from-edge` indicators (`→ p.N` / `← p.N`), so the trunk stops at the
page edge and does not continue as a vertical line.

The product-owner model is explicit:

- **Each parent has its own trunk for its own group of children.** It is not one
  global trunk, and it is not merged across levels.
- A child that itself has children opens **its own** trunk, independent of the
  parent's trunk. Nested trunks can run in parallel at different `x`.
- One trunk stays vertically aligned at the same `x` across page boundaries.
- The trunk runs from the parent port to the last child's arm. On pages with no
  child of that group it passes through top-to-bottom.
- The trunk ends at the last child's arm; it does not continue past the last
  child of that group.
- Every child enters from the left with its own arm.
- No horizontal `→ p.N` / `← p.N` indicator for these tree edges; the vertical
  trunk is the continuity.
- Children are indented to the right of the trunk, so parallel/nested trunks do
  not overlap cards.
- The nested below trunk must start with the same small `trunkGap` (8 px) as the
  top-level trunk; today nested below groups start exactly at the card border.

Reference screenshots (local, do not commit):

- `/Users/example/.t3/userdata/attachments/7b9d51bf-80d3-4fbe-add5-2af15c69904a-5c1c98bb-0145-4f96-a772-3bea01de5943.png`
- `/Users/example/.t3/userdata/attachments/7b9d51bf-80d3-4fbe-add5-2af15c69904a-671fbfa3-889b-4c2f-9f2b-24fb2fbc6402.png`

Relevant docs:

- `AGENTS.md` — working agreement 12, Page/edge rules.
- `docs/tasks/r2f-page-edge-topology.md` — R2f same-page topology.
- `docs/reports/r2f-page-edge-topology.md` — current trunk/PageEdge model.
- `docs/design-tokens.md` — edge/trunk vocabulary.

## Goal

Page Read/Edit and the PDF print model show each parent's child-group trunk as
one vertically aligned line that continues across page boundaries to the last
child's arm, with independent nested trunks and no horizontal page labels for
those tree edges.

## In scope

- Replace the page-local `PageEdgeTrunk` with a group trunk keyed by
  `(parentBlockId, placement)` across pages, while keeping page-local segments
  for rendering/PDF.
- For every primary group:
  - one stable `trunk x` and parent port;
  - page segments:
    - parent page: from the parent port down to the page content bottom if a
      child is on a later page; otherwise to the last child arm on this page;
    - intermediate pages: top to bottom at the same `x`;
    - last child page: top to the last child arm;
    - pages with no child of the group still get the pass-through segment;
  - each child on each page gets its left arm from that trunk.
- Nested groups are independent: do not merge trunk records by placement across
  different parents. A right group and a below group of the same parent have
  separate trunks. A nested parent's trunk has its own id/x/segments.
- Remove `to-edge` / `from-edge` indicators for primary tree edges that belong
  to a trunk group. Keep those indicators for references and non-tree page
  edges. Do not show `p.N` labels for trunk-continued tree edges.
- Apply the shared `trunkGap` (8 px) at the start of every below-group trunk at
  every depth. The visible trunk starts with the same small offset as the
  top-level trunk, not on the card border.
- Keep all primary entries `left`, R2d orthogonal style, reference dashes,
  obstacle avoidance, Page Read/Edit parity, and print-model consumption.
- Tests:
  - New multi-page UI fixture/suite
    `tests/ui/r2g-page-trunk-continuity.test.mjs` covering a parent and its
    children across at least two pages, with a nested child group and a
    pass-through page if practical.
  - Unit tests for group keys, page segments, last-arm termination, gap, and
    independent nested trunks.
  - Page Read/Edit and PDF print-model assertions.
  - Add the new suite to `test:ui` and `verify`.
- Report at `docs/reports/r2g-page-trunk-continuity.md`.

## Out of scope

- No layout block placement/geometry changes, no PageTheme/default, no canvas,
  labels, image cards, PageEdit overlay, pagination, or block content changes.
- No spec/UX/ADR changes; do not edit `AGENTS.md`, `docs/plan.md`, or the R2f
  report.
- No M4c PDF renderer/compositor work. Only the shared edge data consumed by the
  existing print model.
- No merge, rebase, push, PR, or parent-checkout edits.
- Do not re-enable legacy `compaction` row fill or change the compact `beside`
  default.

## Files

Read:

- `packages/layout/src/page-edges.ts` — R2f group/trunk mapper.
- `packages/layout/src/page-routing.ts` — left-entry router and trunk fallback.
- `packages/layout/src/types.ts` — `PageEdge`, `PageEdgeTrunk`, fragments/pages.
- `packages/layout/src/layout.ts` — `LayoutBlock.placement`.
- `packages/layout/src/edge-style.ts` — `trunkGap`, `trunkInset`, `stemMin`.
- `packages/pdf/src/printModel.ts` and `packages/pdf/test/print-model.test.ts`.
- `apps/desktop/src/renderer/src/page/PageEdges.tsx` — renderer/data attrs.
- `tests/ui/r2f-page-edge-topology.test.mjs` — R2f coverage to extend/replace.
- `tests/support/page-fixtures.mjs`.

Expected to touch:

- `packages/layout/src/page-edges.ts`
- `packages/layout/src/types.ts`
- `packages/layout/src/page-routing.ts` only if the segment API requires it
- `packages/layout/src/edge-style.ts` only to expose/reuse `trunkGap`
- `packages/layout/test/page-edges.test.ts`
- `packages/layout/test/page-routing.test.ts` only if needed
- `packages/pdf/src/printModel.ts` and `packages/pdf/test/print-model.test.ts` if the trunk shape changes
- `apps/desktop/src/renderer/src/page/PageEdges.tsx`
- `tests/support/page-fixtures.mjs`
- `tests/ui/r2g-page-trunk-continuity.test.mjs`
- `tests/ui/r2f-page-edge-topology.test.mjs` only to keep existing behavior
- `package.json`
- `docs/reports/r2g-page-trunk-continuity.md`

## Acceptance criteria

- [ ] Each parent group has one trunk id with a stable `x`; nested parent
      groups have distinct ids and may have different `x`.
- [ ] A group's trunk continues across every page between the parent and its
      last child, including pass-through pages.
- [ ] On the parent page it reaches the bottom when later children exist; on the
      last child page it ends at the last child arm.
- [ ] Every child arm enters left; no primary tree edge has `to-edge`/`from-edge`
      or a `p.N` label solely because it crosses a page.
- [ ] Right-group siblings on different pages share the same right trunk; callout
      and wrapped-child groups share their own below trunk per parent.
- [ ] Nested trunks do not merge with the parent trunk or with each other.
- [ ] Every below trunk starts with the same 8 px `trunkGap` at all levels.
- [ ] Page Read/Edit and the PDF print model consume the same group trunk/page
      segments.
- [ ] References retain their page-edge indicators and dashes; R2d/R2f/R2e/R2b
      behavior remains.
- [ ] Gate: targeted tests + `npm run verify:fast` pass with real timings.
- [ ] Report maps every acceptance criterion to pass/fail.

## Tests and evidence

- Targeted: `npx vitest run packages/layout/test/page-edges.test.ts packages/layout/test/page-routing.test.ts`
- New UI: `node --test tests/ui/r2g-page-trunk-continuity.test.mjs`
- Existing: `node --test tests/ui/r2f-page-edge-topology.test.mjs tests/ui/r2d-page-edge-style.test.mjs tests/ui/r2e-page-tree.test.mjs`
- PDF: `npx vitest run packages/pdf/test/print-model.test.ts`
- End of task: `npm run verify:fast`
- Evidence: screenshots under `artifacts/r2g/`; no native dialogs; no fixed sleeps.
- Orchestrator runs one full `npm run verify` after integration.

## Stop and ask

Stop and report instead of inventing a decision when:

- grouping by parent across pages conflicts with the page/fragment model;
- a trunk segment would need to cross a card and no group-level obstacle route
  can be defined without a product/architecture decision;
- the PDF print model requires a schema/consumer change outside the shared edge
  data;
- the WIP baseline has unrelated failures;
- a change would require layout placement/geometry, spec/UX/ADR, or M4c work.

## Report format

- Summary: what changed and why.
- Files changed.
- Checks run, with real timings.
- Acceptance criteria: pass/fail per item.
- Open questions / risks.
- Next suggested step.
- Worktree path, branch head SHA.

The Orchestrator rejects a report that does not map back to the acceptance criteria.
