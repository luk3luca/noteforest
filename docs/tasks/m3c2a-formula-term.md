# M3c2a — Formula term anchors (creation and binding)

**Role:** Builder  
**Milestone:** M3c2a (first half of formula terms; M3c2b adds precise term geometry/ambiguity UI)  
**Base:** current `main` (M3b2c merged)  
**Worktree:** fresh worktree from `main`  
**Timebox:** 1 day

## Context

Whole-formula anchors work (M3c1). This slice adds a **term** anchor: the user edits an existing
formula, selects a substring of its LaTeX source, and branches from that term. The atomic binding
stays on the formula node; the selector stores the term substring and its context so resolution can
find it again.

Read:
- `docs/spec.md` v0.4.5 §4.4 (formula term selector), §5.4, §8.2/§8.10; ADR-0005 §2–§3.
- `docs/design/m3-anchors-references.md` §2.4 (formula selector), §6.1 (formula creation), §6.3
  (geometry fallback), §12 M3b/M3c.
- `packages/core` M3a1/M3a2/M3c1 APIs; `apps/desktop/src/renderer/src/shell/Dialogs.tsx`
  (MathDialog), `state/runtime.ts`, `lib/anchor-selection.ts`, `BlockViews.tsx`.

## Goal

With an existing inline/block formula open in the math dialog, selecting a LaTeX substring and
choosing **Branch from term** creates one anchored primary child whose selector is
`{kind:'formula', form:'term', latex, latexStart, latexPrefix, latexSuffix, occurrenceHint?}`.
The child is focused, the callout shows the term, undo is one entry, and reload keeps the IDs.

## In scope

1. **Math dialog action**
   - When `pos !== null` and the textarea has a non-empty selection, show **Branch from term**.
   - Capture the selected LaTeX substring, its code-point start, prefix/suffix context (bounded),
     and occurrence hint; close the dialog and run the command.
   - Do not offer the action for a new formula without a node position.
2. **Command path**
   - Reuse `branch.createFromSelection` with `kind:'formula'`, the formula node binding, and an
     explicit term selector; `anchor.quote` is the term.
   - One exact inverse; reuse only an exact same term selector; `created.anchorIds` only when new.
   - If the term occurs multiple times, create it but leave resolution ambiguous; never auto-pick.
3. **Rendering**
   - Formula node marker (same durable dot as M3c1); quote chip shows the term; callout lane and
     focus reuse M3b2a/M3c1.
   - Best-effort term rectangle is **not** required here; fall back to the formula rectangle in
     M3c2b.
   - The existing formula editor still opens on double click.
4. **Tests/evidence**
   - Core: term selector round-trip, duplicate/reuse, one inverse, ambiguous resolution.
   - UI: edit formula → select term → Branch from term → child/callout/quote, undo once, reload;
     multi-occurrence term shows the warning/fallback without auto-resolving.
   - Screenshot. No new critical e2e; critical stays 21 tests.

## Out of scope

- Precise KaTeX term geometry/selection highlight and candidate chooser (M3c2b).
- Code/image anchors (M3c3), reference edges (M3d), repair panel (M3e), split/merge (M3f).
- Formula editor redesign; invalid LaTeX behavior stays as is.
- Page/PDF, schema change, new dependencies.

## Files

Expected to touch:
- `packages/core/src/commands.ts` only if the term selector needs a guard
- `apps/desktop/src/renderer/src/shell/Dialogs.tsx` (MathDialog)
- `apps/desktop/src/renderer/src/lib/anchor-selection.ts`
- `apps/desktop/src/renderer/src/state/runtime.ts`
- `apps/desktop/src/renderer/src/actions.ts` (dialog action plumbing if needed)
- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx` / `styles.css` for the term chip/marker
- `packages/core/test/selection-command.test.ts`, `apps/desktop/test/anchor-selection.test.ts`
- `tests/ui/m3-formula-anchor.test.mjs` or a new `tests/ui/m3-formula-term.test.mjs`
- `docs/reports/m3c2a-formula-term.md`

## Acceptance criteria

- [ ] Editing an existing formula with a selected LaTeX substring exposes Branch from term.
- [ ] The created anchor has `kind:'formula'`, a `form:'term'` selector with latex/start/context,
      and the term as quote; the formula node carries the binding.
- [ ] One `⌘Z` removes child/branch/new anchor; redo/reload keep IDs; exact reuse does not duplicate.
- [ ] Multi-occurrence terms are created but ambiguous; no silent auto-resolution.
- [ ] Callout/quote chip/focus work; no term-rectangle work required yet.
- [ ] UI test + screenshot; no new critical e2e; no code/image/reference work.
- [ ] No fixed sleeps/native dialogs; hidden windows.

## Tests and evidence

- `npm run typecheck`
- Targeted core/UI tests
- `npm run test:ui` and `npm run verify:fast` once at the end (critical unchanged)
- Screenshot path and test name.
- Orchestrator runs the full `verify` at integration.

## Stop and ask

Stop if the term selector needs a schema change, if the math dialog cannot expose a selection
without a new editor, or if a multi-occurrence term cannot be represented as ambiguous.

## Report format

Summary, files, selection/selector path, marker/callout, tests/screenshot/timings, risks, next step
M3c2b.
