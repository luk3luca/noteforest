# M3d1 — Reference edges, see-also chips, shared child

**Role:** Builder  
**Milestone:** M3d1 (first half of reference edges; M3d2 adds make-home/move-here/demote)  
**Base:** current `main` (M3c3a merged; M3c3b image anchors blocked)  
**Worktree:** fresh worktree from `main`  
**Timebox:** 1–1.5 days

## Context

Primary/anchored branches already render. This slice adds **reference edges**: a non-structural link
from a block or anchor to an existing target. References never affect layout, pagination, outline
rows, or the primary home; they surface as dashed edges when both endpoints are visible and as
see-also/referenced-by chips otherwise. The target is a shared child: one instance, one primary home,
many reference contexts.

Read:
- `docs/spec.md` v0.4.5 §4.5/§5.3/§7.7/§15.11 (reference edges, shared child, AC-58); ADR-0005 §9.
- `docs/design/m3-anchors-references.md` §7 (reference edges), §6.5 (outline), §12 M3d.
- `packages/core` branch validation/commands; `actions.ts` (block menu/palette), `lib/tree.ts`,
  `lib/adapter.ts`, `editor/edges/EdgeLayer.tsx`, `shell/Sidebar.tsx`, `styles.css`.

## Goal

A user links an existing block or anchor to an existing target as a reference; the target keeps its
primary home, gains a "Referenced by" chip, the source gains "See also", and a dashed edge appears
when both cards are visible. No layout/pagination change, no duplicate row/card, no role change.

## In scope

1. **Create/delete reference**
   - UI action **Link as reference…** from the block menu (and anchor menu when applicable), with a
     target picker for existing blocks.
   - Use `branch.create` with `role:'reference'`; reference cycles allowed; role-independent dedupe
     reuses/focuses the existing edge; delete a reference edge only, never the target.
2. **See-also / referenced-by**
   - Source card chip/list "See also"; target card chip/list "Referenced by" with source context
     (block/anchor quote). Clicking navigates/focuses.
   - Reference edges do not add outline rows; shared child appears once at its primary home.
3. **Dashed edge**
   - When both endpoints are visible, draw a dashed reference edge (open arrowhead or no arrowhead per
     UX; never a solid primary edge); no effect on layout/pagination or the V4 trunk.
4. **Tests/evidence**
   - Core: reference create/reuse/delete, cycle allowed, identity, no target deletion.
   - UI: link reference → chips + dashed edge; shared child once in outline; delete edge leaves the
     target; layout-neutral differential (block positions/page count unchanged vs without the edge).
   - Screenshot. No new critical e2e; critical stays 21 tests.

## Out of scope

- Role transitions make-home/move-here/demote (M3d2).
- Image anchors (M3c3b, blocked on the image pipeline), repair/health (M3e), split/merge (M3f).
- New layout/pagination behavior; reference edges must not affect it.
- Page/PDF, schema change, new dependencies.

## Files

Expected to touch:
- `packages/core/src/commands.ts` only if reference creation/deletion needs a guard
- `apps/desktop/src/renderer/src/actions.ts` (menu/action, target picker)
- `apps/desktop/src/renderer/src/lib/tree.ts`, `lib/adapter.ts`
- `apps/desktop/src/renderer/src/editor/edges/EdgeLayer.tsx`
- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx`, `shell/Sidebar.tsx`, `styles.css`
- `packages/core/test/*`, `apps/desktop/test/*`
- `tests/ui/m3-reference.test.mjs` or an existing UI file
- `docs/reports/m3d1-reference-edges.md`

## Acceptance criteria

- [ ] A block/anchor can link to an existing target as a reference; duplicate exact links reuse the
      existing edge; reference cycles are allowed.
- [ ] Source shows See also; target shows Referenced by; shared child appears once in the outline.
- [ ] A dashed reference edge appears when both endpoints are visible; no primary-style solid edge.
- [ ] Deleting the reference leaves the target and its primary structure untouched.
- [ ] Layout/pagination is differential-equal with and without reference edges.
- [ ] UI test + screenshot; no new critical e2e; no role transitions/image/repair work.
- [ ] No fixed sleeps/native dialogs; hidden windows.

## Tests and evidence

- `npm run typecheck`
- Targeted core/UI tests
- `npm run test:ui` and `npm run verify:fast` once at the end (critical unchanged)
- Screenshot path and test name.
- Orchestrator runs the full `verify` at integration.

## Stop and ask

Stop if the target picker needs a new dialog framework, if reference edges leak into the layout tree,
or if shared-child identity conflicts with the primary-home rules.

## Report format

Summary, files, reference creation/rendering, layout-neutral proof, tests/screenshot/timings, risks,
next step M3d2.
