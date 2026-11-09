# R2i — Page subtree-aware wrap

**Role:** Builder / Implementer  
**Milestone:** Page tree layout (Page/PDF only)  
**Base:** current `main` after the Page checkpoint and plans; exact SHA in the handoff  
**Worktree:** assigned by the Orchestrator with `delegate_task` worktree isolation  
**Timebox:** 6 hours

## Context

Page currently decides the right/below placement of direct children from the
child's **own card** width. A first child can stay to the right while its whole
subtree does not fit, so grandchildren wrap under the child and the Page burns
the lower-left area instead of using the right side.

The product-owner rule is:

1. try to keep the whole first-child subtree to the right;
2. if the full subtree does not fit, move the whole direct-child group below the
   parent at the Page child indent;
3. from the new position, keep the first child's children to the right if they
   fit;
4. only if they do not fit, indent them below that child;
5. recurse for every level; siblings remain one atomic level column.

Continuous already uses its own DOM placement and is out of scope.

## Goal

Page Read/Edit and the paginator place a direct-child group below the parent
based on the whole subtree width, not only the child card, while keeping
sibling atomicity and the existing callout placement behavior.

## In scope

- Add a pure preferred-column/subtree width helper in
  `packages/layout/src/layout.ts`:
  - card width at the available width;
  - if the child group fits to the right, add the widest child column
    recursively (max, not row packing);
  - otherwise the group wraps and contributes only its own column;
  - cache by `(blockId, availableWidth)`, deterministically.
- Use the subtree fit in the non-compaction direct-child placement decision.
  If any direct child subtree does not fit at the parent's right column, move
  **all** direct children below the parent at the Page child indent.
- From the wrapped position, repeat the rule for each child:
  - its children try right first;
  - if they do not fit, they wrap below that child;
  - keep sibling order and group atomicity.
- Keep the current callout behavior exactly: anchored callouts below the
  parent, direct children right/below according to the new fit. Do **not**
  implement A/B2 callout modes in this task.
- Add `childIndent` to `PageTheme` (compact/comfortable/custom; default 26 px)
  and use it instead of the current hardcoded 26 where the Page wrap origin
  needs the trunk stem. This is a Page-only token; do not touch Continuous
  tokens or split all design docs yet.
- Update or add fixtures/tests:
  - P → C1 → G1: full subtree too wide, C1 moves below P, G1 stays right of C1
    when it fits.
  - Same but C1+G1 does not fit at the new origin: G1 wraps below C1.
  - Multi-sibling case: if one child subtree fails, the whole direct-child group
    moves below; siblings stay one column.
  - Callout lane width is included in the child's available width; current
    callout placement remains.
  - Page Read/Edit and print model consume the resulting fragments; no overlap,
    no overflow, page count recorded.
  - Add a UI/layout fixture or lab evidence with before/after page count and
    whitespace; no fixed sleeps/native dialogs.
- Report at `docs/reports/r2i-page-subtree-wrap.md`.

## Out of scope

- Callout modes A/B2, stacked fallback, callout right lane.
- Settings UI, manual breaks, M4c PDF compositor, spec/UX/ADR.
- Continuous layout, Continuous tokens, the 3200 px canvas.
- Full design-token/doc split (P0); only the `childIndent` Page token is added.
- Compaction row-fill changes; keep it as legacy lab oracle.
- Merge, push, PR, or parent-checkout edits.

## Files

Read:

- `packages/layout/src/layout.ts` — placement/fit recursion.
- `packages/layout/src/page-settings.ts` — PageTheme/presets/custom parsing.
- `packages/layout/src/types.ts` — LayoutOptions/LayoutBlock.
- `packages/layout/test/group-wrap.test.ts`, `page-packing.test.ts`,
  `layout.test.ts` — existing wrap expectations.
- `tests/support/page-fixtures.mjs`, `tests/ui/r2e-page-tree.test.mjs`.
- `docs/tasks/page-wrap-callouts-plan.md` — Feature 1 design.
- `docs/tasks/post-page-roadmap.md`.

Expected to touch:

- `packages/layout/src/layout.ts`
- `packages/layout/src/page-settings.ts`
- `packages/layout/src/types.ts` only if needed
- `packages/layout/test/group-wrap.test.ts`, `layout.test.ts`,
  `page-packing.test.ts`, and a new R2i fixture/test as needed
- `tests/support/page-fixtures.mjs`
- `tests/ui/r2i-page-subtree-wrap.test.mjs` (new) or an existing Page suite
- `package.json` if a new suite is added
- `docs/reports/r2i-page-subtree-wrap.md`

## Acceptance criteria

- [ ] P→C1→G1: when the full subtree does not fit right, C1 is below P at
      `childIndent`, and G1 remains right of C1 if it fits.
- [ ] If C1+G1 still does not fit at the new origin, G1 wraps below C1.
- [ ] Sibling group is atomic: one failing subtree moves all direct children
      below; no split row.
- [ ] Recursion works at every level; no overlap, no horizontal overflow.
- [ ] Callout lane width is respected and current callout placement unchanged.
- [ ] Page Read/Edit/PDF fragments reflect the new placement; page count and
      whitespace measured.
- [ ] `childIndent` is a PageTheme token used by the wrap origin; Continuous
      untouched.
- [ ] Targeted layout/UI tests and `npm run verify:fast` pass with real timings.
- [ ] Report maps every criterion to pass/fail.

## Tests and evidence

- Targeted: `npx vitest run packages/layout/test/group-wrap.test.ts packages/layout/test/layout.test.ts packages/layout/test/page-packing.test.ts`
- New UI/layout fixture: `node --test tests/ui/r2i-page-subtree-wrap.test.mjs`
- Existing R2e/R2g/R2b/R2d/Page suites as needed.
- End of task: `npm run verify:fast`.
- Evidence: screenshots and page-count/whitespace report under `artifacts/r2i/`.
- Orchestrator runs one full `npm run verify` after integration.

## Stop and ask

Stop and report if:

- the subtree width recursion conflicts with the A4/page constraints;
- the callout lane makes the fit ambiguous without the A/B2 decision;
- the change requires Continuous layout/token changes;
- the page count or readability regresses in a way that needs a product decision;
- the baseline has unrelated failures;
- the change requires spec/UX/ADR or M4c work.

## Report format

- Summary: what changed and why.
- Files changed.
- Checks run, with real timings.
- Acceptance criteria: pass/fail per item.
- Page count/whitespace evidence before/after.
- Open questions / risks.
- Next suggested step.
- Worktree path, branch head SHA.
