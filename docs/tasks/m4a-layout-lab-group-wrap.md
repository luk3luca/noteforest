# M4a — layout lab and group-level left-origin wrap

**Role:** Implementer / Builder
**Milestone:** M4 — reader/page + PDF
**Base:** current `main` after M3c3b4 integration (see the worktree HEAD)
**Worktree:** isolated builder worktree prepared by orchestrator v2
**Scope:** `packages/layout`, layout tests/fixtures, lab evidence, token docs. No page view, no
print renderer, no PDF, no editor CSS changes.

## Goal

Replace the current right-first child placement in `packages/layout` with the ratified
**group-level left-origin wrap** from `docs/adr/0006-page-group-wrap.md`, and produce the lab
evidence for the exact `wrapIndent` / cap values.

Read before starting:

- `docs/adr/0006-page-group-wrap.md`
- `docs/tasks/m4-reader-page-pdf.md` (M4a)
- `docs/design-tokens.md` (`wrapIndent`)
- `packages/layout/src/layout.ts`, `types.ts`, `estimate.ts`
- `packages/layout/test/layout.test.ts`, `test/helpers.ts`
- `fixtures/scale-300.json`, `fixtures/deep-chain.json`, `fixtures/wide-fan.json`

## Required behavior

1. **Group rule (default, production).**
   - For a block, compute every direct child's own fit in the right band using the same
     max-content/min-content/minContentWidth comparison used today.
   - If **every** direct child fits, place all direct children to the right exactly as today
     (vertical stack at `parent.x + parent.width + siblingGap`).
   - If **any** direct child does not fit, place **all** direct children below the parent, in
     order, at `wrapOriginX = min(parent.x + wrapIndent, pageContentLeft + maxWrapIndent)`.
   - Anchored callouts keep their current order/placement and stay above the wrapped direct-child
     group.
   - The fit test is over direct children's own cards, not the full descendant extent; descendants
     apply the same rule at their own level.
   - Deterministic: same document/options => same geometry.
2. **Fit must include the child's own subtree start, not just width.** A child placed at the right
   band must still be able to lay out without a horizontal overflow defect. If the child's own card
   fits but the resulting placement would create `layout-overflow`, the group wraps. This is a
   safety check, not a reason to pre-wrap deep descendants.
3. **Cap.**
   - Add `maxWrapIndent` to `LayoutOptions` and `DEFAULT_LAYOUT_OPTIONS`.
   - Default candidate: `3 * wrapIndent` (54 px). Validate 2/3/4 steps in the lab.
   - `wrapOriginX` as above; never beyond `pageContentLeft + maxWrapIndent`.
   - No global per-depth indent: a branch that never overflows is never indented.
4. **Policy option for the lab only.**
   - Add a `wrapPolicy` option: `'group-left-origin' | 'right-first-per-child' | 'subtree-aware'`.
   - Default `'group-left-origin'` (production rule).
   - `'right-first-per-child'` reproduces the current behavior exactly (regression oracle).
   - `'subtree-aware'` is the per-child variant from the lab: a child that does not fit goes below
     at the left origin while siblings that fit stay right. It is lab-only and must not be the
     default.
   - Keep the option serializable/simple; no DOM.
5. **Preserve invariants.**
   - no block overlap at the same level; `siblingGap` / `calloutGap` respected;
   - callout order and anchor alignment unchanged;
   - `subtreeBottom`, `childIds`, `depth`, `parentBlockId`, edges, break candidates unchanged in
     shape;
   - safe-break candidates and pagination untouched;
   - no change to `MeasurementPort` or the DOM measurement adapter in this slice.
6. **Seams for future resize (no UI).**
   - Add optional `preferredWidth?: number` to `LayoutOptions` per block? No: do **not** invent a
     document field. Instead, add an optional internal measurement input hook only if it is
     trivial and tested; otherwise leave a comment in `types.ts` that the width preference will be
     a `LayoutOptions`/measurement input in the resize slice. The plan is in
     `docs/tasks/future-manual-resize.md`; M4a must not add `widthHint` or `displayWidth` now.

## Layout lab

Add a deterministic lab (test or small script) comparing the three policies on:

- `fixtures/scale-300.json`
- `fixtures/deep-chain.json`
- `fixtures/wide-fan.json`
- the product-owner showcase document at `/Users/luca/Documents/NoteForest/note-forest-showcase`
  if readable; otherwise copy it into a fixture only if the product owner approves. Do not modify
  the showcase.

Metrics per fixture/policy:

- page count after `paginate`;
- max right edge used / max content width used;
- total layout height and whitespace ratio rough estimate;
- number of wrap decisions and max wrap depth;
- number of `content-too-wide` / `layout-overflow` defects;
- page-count delta vs the right-first oracle;
- a compact ASCII or table sample of one deep branch so the difference is visible.

Record the results in `docs/reports/m4a-layout-lab.md` with a recommendation for `maxWrapIndent`
(2/3/4 steps), `wrapIndent`, and any fixture where the rule is a net loss. Do not use page count
alone as the decision criterion; width/readability comes first, but call out pathology.

## Tests

- Unit tests for the group rule: all-fit => right; one non-fit => whole group below; recursive
  nested wrap; cap; callouts before the group; deterministic output; three policies.
- Regression: the old right-first policy still produces the previous geometry on a fixture
  (snapshot or explicit coordinates).
- Pagination: `scale-300` still paginates with zero blocking defects, no overlaps, safe breaks.
- No test deletion. Update only tests whose expected geometry legitimately changes; call out every
  changed expectation in the report.
- Lab numbers must be reproducible from the committed test/script.

## Gates

- `npm run check:boundaries`
- `npm run typecheck`
- targeted layout vitest while working
- `npm test` (all)
- `npm run test:ui` (should be unchanged; report if any UI assertion depends on old geometry)
- `npm run test:recovery:run` (should be unchanged)
- `npm run e2e:critical`
- `npm run verify:fast` once at the end

## Guardrails

- No new runtime dependency.
- No page view, reader DOM, CSS, print/PDF, image, or anchor changes.
- Do not change spec/UX/ADR/plan or `docs/plan.md`; propose token values in the report and the
  orchestrator records them.
- Do not touch `/Users/luca/Documents/NoteForest/note-forest-showcase`.
- Do not merge or push.

## Deliverable

Report in `docs/reports/m4a-layout-lab.md`: worktree, branch, base, commit, behavior summary,
policy option, lab table, chosen tokens, files, tests/timings, changed expectations, risks, not
verified. Stop and ask if the lab shows a pathological page count or if the direct-children fit
interpretation conflicts with a fixture.
