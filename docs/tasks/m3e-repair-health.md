# M3e — Broken/ambiguous anchors, health sheet, repair

**Role:** Builder  
**Milestone:** M3e  
**Base:** current `main` (M3d2 merged)  
**Worktree:** fresh worktree from `main`  
**Timebox:** 1.5–2 days

## Context

Anchors can now be text, whole formula, formula term, or code range. Broken/ambiguous states are
already derived by the resolver, but the user only gets small warning chips and cannot repair or
choose a candidate. This slice adds the M3 repair surface: a status/health sheet, a candidate chooser,
re-anchoring, attach-to-block, delete-branch, and keep-broken. No silent branch deletion.

Read:
- `docs/spec.md` v0.4.5 §4.4/§8.2/§8.5–§8.9/§13.2/§15.10; ADR-0005 §4–§8.
- `docs/design/m3-anchors-references.md` §8 (broken/ambiguous/repair), §6.8, §12 M3e.
- `packages/core` resolver/`anchor.repair`/`anchor.attachToBlock`/`anchor.delete`; renderer
  `state/runtime.ts`, `actions.ts`, `shell/Dialogs.tsx`, `Sidebar.tsx`, `BlockViews.tsx`, `StatusBar`.

## Goal

A user can see all broken/ambiguous anchors, navigate to one, repair it by choosing a candidate or
re-anchoring, attach it to the block, delete its branch, or keep it broken. The anchor ID, branch ID,
and target block are preserved whenever the action is a repair; nothing is silently deleted.

## In scope

1. **Health sheet**
   - Status chip with counts (broken/ambiguous), opening a sheet/dialog; filters (all/broken/ambiguous),
     block title/quote, state, branch count; click navigates/focuses/highlights.
   - No modal on load; closeable; keyboard accessible.
2. **Copy/state**
   - Block warning distinguishes **Lost anchor** vs **Ambiguous** (fix the current “Lost anchor” for
     ambiguous); callout badges remain consistent.
   - Broken anchors keep whole-block fallback; branch/target remain visible.
3. **Repair actions**
   - Ambiguous formula term/code quote: candidate list with context; choosing one calls
     `anchor.repair` (same anchor ID/branch IDs, new selector/occurrence), one undo entry.
   - Broken text: re-select text in the block (repair, not a new branch) or attach to block.
   - Broken formula/code: choose a candidate/re-anchor path or attach to block; keep broken option.
   - Attach to block: `anchor.attachToBlock`; delete branch: `anchor.delete` with explicit choice;
     both undoable and identity-preserving.
   - Explicit confirmation for destructive delete; never delete the target block.
4. **Tests/evidence**
   - Core: repair identity for text/formula-term/code, attach, delete branch, keep broken, inverse.
   - UI: health sheet list/filter/navigate; ambiguous candidate selection; attach; delete branch;
     broken fallback and copy. Screenshot.
   - No new critical e2e; critical stays 21 tests.

## Out of scope

- Image anchors (M3c3b blocked on the image pipeline).
- Split/merge, export manifest/fixtures (M3f), page/PDF, schema change, new dependencies.
- Full inspector/backlinks panel; health sheet only.
- Automatic repair or automatic anchor deletion.

## Files

Expected to touch:
- `packages/core/src/commands.ts` only if repair needs a small guard
- `packages/core/test/*` for repair/identity cases
- `apps/desktop/src/renderer/src/state/runtime.ts`, `actions.ts`
- `apps/desktop/src/renderer/src/shell/Dialogs.tsx`, `Sidebar.tsx`, `StatusBar.tsx`
- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx`, `styles.css`
- `tests/ui/m3-repair.test.mjs` or an existing UI file
- `docs/reports/m3e-repair-health.md`

## Acceptance criteria

- [ ] Health sheet lists broken/ambiguous anchors, filters, and navigates/focuses/highlights.
- [ ] Ambiguous formula/code anchor: candidate list; choosing one repairs with the same anchor/branch
      IDs, one undo; no auto-resolution.
- [ ] Broken text can be re-anchored by selection or attached to the block; broken formula/code can be
      repaired or attached; keep-broken leaves everything intact.
- [ ] Delete branch is explicit, undoable, and never deletes the target; attach is undoable.
- [ ] Block warning says Lost anchor vs Ambiguous correctly; broken fallback stays.
- [ ] UI test + screenshot; no new critical e2e; no image/split-merge work.
- [ ] No fixed sleeps/native dialogs; hidden windows.

## Tests and evidence

- `npm run typecheck`
- Targeted core/UI tests
- `npm run test:ui` and `npm run verify:fast` once at the end (critical unchanged)
- Screenshot path and test name.
- Orchestrator runs the full `verify` at integration.

## Stop and ask

Stop if repair needs a new schema/selector shape, if candidate selection would change anchor or
branch identity, or if the health sheet would require a full inspector.

## Report format

Summary, files, health/repair flows, identity/undo evidence, tests/screenshot/timings, risks, next
step M3f.
