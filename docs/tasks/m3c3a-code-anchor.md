# M3c3a — Code range anchors

**Role:** Builder  
**Milestone:** M3c3a (first half of code/image; M3c3b adds image point/region)  
**Base:** current `main` (M3c2b merged)  
**Worktree:** fresh worktree from `main`  
**Timebox:** 1–1.5 days

## Context

Text and formula anchors work. This slice adds a **code range/token anchor** inside a code block:
select a range in the code, branch, and get a callout with a durable selector and a gutter marker.
The code block remains one atomic node; the selector stores quote/context/offsets and the binding
adds the anchor to the code block's `attrs.anchorIds`.

Read:
- `docs/spec.md` v0.4.5 §4.4 (code selector), §5.4, §8.2/§8.10; ADR-0005 §2–§3.
- `docs/design/m3-anchors-references.md` §2.4 (code selector), §6.1 (code), §6.3 (geometry), §12 M3c.
- `packages/core` M3a1/M3a2 APIs; `lib/anchor-selection.ts`, `commands.ts`,
  `editor/extensions.ts` (CodeBlockLowlight), `BlockViews.tsx`, `state/runtime.ts`, `styles.css`.

## Goal

A user selects a token/range inside a code block, presses `⌘⇧Return` or the toolbar **Branch**,
gets one anchored primary child with a code selector and gutter marker, can type immediately, undo
once, and reload with the same anchor/branch IDs.

## In scope

1. **Selection path**
   - Detect a text range inside `codeBlock` (not a regular paragraph) and build a code binding
     `{kind:'code', nodePath, startOffset, endOffset}`.
   - Selector `{kind:'code', quote, form:'range'|'whole', prefix?, suffix?, occurrenceHint?,
     startOffset?, endOffset?, lineStart?, lineEnd?}`; offsets and line numbers in Unicode code
     points where applicable.
   - Whole-code selection may use `form:'whole'`; a partial selection uses `form:'range'`.
2. **Command/identity**
   - Reuse `branch.createFromSelection` with `kind:'code'` and the explicit selector; one exact
     inverse; exact reuse only for the same selector; `created.anchorIds` only for new.
   - Repeated quotes remain ambiguous; no auto-resolve.
3. **UI**
   - Gutter/line marker at the first selected line and a subtle range highlight; quote chip shows
     the code quote (truncated); callout lane/focus/selected state reuse M3b2a/M3c1.
   - The code block stays editable; the marker must not interfere with text selection.
4. **Tests/evidence**
   - Core: selector round-trip, inverse, reuse, ambiguous repeated quote.
   - UI: select code range → Branch → callout/marker → undo once → reload; repeated quote warning.
   - Screenshot. No new critical e2e; critical stays 21 tests.

## Out of scope

- Image point/region anchors (M3c3b).
- Candidate chooser/repair/health sheet (M3e); only the existing ambiguous warning.
- Reference edges (M3d), split/merge (M3f), page/PDF.
- Code block chrome/language picker/copy (backlog task), Markdown fences.
- Schema change, new dependencies.

## Files

Expected to touch:
- `packages/core/src/commands.ts` only if the code selector needs a guard
- `apps/desktop/src/renderer/src/lib/anchor-selection.ts`
- `apps/desktop/src/renderer/src/editor/extensions.ts` and/or `BlockViews.tsx` (code marker)
- `apps/desktop/src/renderer/src/state/runtime.ts`, `actions.ts` if plumbing is needed
- `apps/desktop/src/renderer/src/styles.css`
- `packages/core/test/selection-command.test.ts`, `apps/desktop/test/anchor-selection.test.ts`
- `tests/ui/m3-code-anchor.test.mjs` or an existing UI file
- `docs/reports/m3c3a-code-anchor.md`

## Acceptance criteria

- [ ] Selecting a token/range in a code block and pressing `⌘⇧Return`/Branch creates one anchored
      primary child with a code selector and code binding.
- [ ] The marker/gutter and range highlight are visible; the quote chip shows the code quote.
- [ ] One `⌘Z` removes child/branch/new anchor exactly; redo/reload keep the same IDs.
- [ ] Repeated quotes are ambiguous, never auto-resolved; no silent branch loss.
- [ ] Code editing and normal text-anchor/block-child paths stay unchanged.
- [ ] UI test + screenshot; no new critical e2e; no image/reference/repair work.
- [ ] No fixed sleeps/native dialogs; hidden windows.

## Tests and evidence

- `npm run typecheck`
- Targeted core/UI tests
- `npm run test:ui` and `npm run verify:fast` once at the end (critical unchanged)
- Screenshot path and test name.
- Orchestrator runs the full `verify` at integration.

## Stop and ask

Stop if code selection cannot be mapped to a stable node path/offset without a new editor, or if the
gutter marker conflicts with the code editor's hit-testing/selection.

## Report format

Summary, files, selection/selector path, marker/callout, tests/screenshot/timings, risks, next step
M3c3b.
