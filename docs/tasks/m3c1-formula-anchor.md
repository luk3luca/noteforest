# M3c1 — Whole-formula anchors

**Role:** Builder  
**Milestone:** M3c1 (first formula slice; M3c2 adds term anchors, M3c3 code/image)  
**Base:** current `main` (M3b2b merged)  
**Worktree:** fresh worktree from `main`  
**Timebox:** 1 day

## Context

The text-anchor path is complete: composite command, marker, callout lane, outline, undo/reload.
This slice adds the simplest atomic anchor: the whole formula node. It validates the atomic binding
and marker path before term selection (M3c2) and code/image geometry (M3c3).

Read:
- `docs/spec.md` v0.4.5 §4.4 (formula anchor), §5.4, §8.2/§8.10; ADR-0005 §1–§3.
- `docs/ux.md` v1.3 F5/§8.5; design §4.1 `branch.createFromSelection`, §6.1 formula, §6.3 geometry.
- `packages/core` M3a1/M3a2 APIs; `editor/extensions.ts` Mathematics, `DocumentEditor.tsx`,
  `SelectionToolbar.tsx`, `BlockViews.tsx`, `lib/adapter.ts`, `actions.ts`, `state/runtime.ts`.

## Goal

A user selects a whole inline or block formula, presses `⌘⇧Return` (or toolbar **Branch**), gets an
anchored child in the formula callout lane, can type immediately, undo once, and reload with the
formula marker and branch intact.

## In scope

1. **Selection and command**
   - Detect a `NodeSelection` on `inlineMath`/`blockMath` and route it to the composite
     `branch.createFromSelection` with `kind: 'formula'`, an atomic binding (node path /
     `attrs.anchorIds`), and the whole-formula selector (`form: 'whole'`, latex).
   - If the current selection is a text caret/range, keep the text path unchanged.
   - One exact inverse; reuse an exact existing formula anchor; `created.anchorIds` only for new.
2. **UI**
   - Formula marker: a visible dot/badge on the formula node when anchored; selected state; quote chip
     with the LaTeX (truncated) in the callout header.
   - Callout lane reuses M3b2a placement/routing; child focused for typing.
   - No term selection yet; no code/image.
3. **Tests/evidence**
   - Core: formula whole anchor create/reuse/undo identity.
   - UI/e2e: select a block formula, branch, type, undo once, reload; inline formula if cheap.
   - At most one compact critical e2e (budget 46 s; keep <60 s) or UI suite if the flow is hard to
     stabilize; prefer one critical test.
   - Screenshot of the formula marker + callout.
4. **Debugging efficiency**
   - Batch related edits; during iteration run only the failing test with
     `--test-name-pattern`/one UI file; run `test:ui` and `verify:fast` once at the end.
   - No fixed sleeps; hidden windows; no native dialogs.

## Out of scope

- Formula **term** anchors (M3c2): no KaTeX term geometry yet.
- Code and image anchors (M3c3).
- Reference edges (M3d), repair/health (M3e), split/merge (M3f).
- Formula editor changes beyond whole-node selection; invalid-LaTeX handling stays as is.
- Page/PDF, M5 API, schema bump, new dependencies.

## Files

Expected to touch:
- `packages/core/src/commands.ts` only if the composite formula path needs a new guard/test
- `apps/desktop/src/renderer/src/editor/DocumentEditor.tsx`, `SelectionToolbar.tsx`, `keymap.ts`
- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx`
- `apps/desktop/src/renderer/src/lib/adapter.ts`, `actions.ts`, `state/runtime.ts`
- `apps/desktop/src/renderer/src/styles.css`
- `tests/e2e/m2-editor.test.mjs` (one compact test) or `tests/ui/m3-formula-anchor.test.mjs`
- `docs/reports/m3c1-formula-anchor.md`

## Acceptance criteria

- [ ] A selected whole formula (block or inline) can create one anchored primary child via
      `⌘⇧Return` or the toolbar.
- [ ] The formula shows a durable marker; the callout shows the LaTeX quote chip; the child is focused.
- [ ] One `⌘Z` removes child/branch/new anchor exactly; redo and reload keep the same IDs.
- [ ] Reusing an exact formula anchor does not duplicate or remove it on undo.
- [ ] Text-anchor, block-child, sibling, and keymap behavior stay unchanged.
- [ ] Tests/screenshot; critical e2e stays <60 s; no term/code/image work.
- [ ] No fixed sleeps/native dialogs; hidden windows.

## Tests and evidence

- `npm run typecheck`
- Targeted core/UI/e2e test
- `npm run test:ui` and `npm run verify:fast` once at the end
- Screenshot path and e2e/UI test name.
- Do not run the full `npm run verify`; the Orchestrator runs it at integration.

## Stop and ask

Stop if whole-formula selection needs a new formula editor or a schema change, if the marker cannot
be positioned without term geometry, or if the critical e2e budget would be exceeded.

## Report format

Summary, files, selection/binding path, marker/callout, tests/screenshot/timings, risks, next step
M3c2 term anchors.
