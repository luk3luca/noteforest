# M3c2a — Formula term anchors

**Date:** 5 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-22820da1`  
**Branch:** `t3/formula-term-anchors`  
**Base:** `f8d8ff4` (`main`: docs: merge M3b2c and start M3c2a)  
**Scope:** formula-term anchors created from a selected LaTeX substring only. No precise KaTeX
term geometry, code/image anchors, reference edges, repair, split/merge, page/PDF, schema bump,
or new dependencies.

## Summary

An existing formula (double-click) opens the unchanged math dialog. When the dialog has a node
position and the LaTeX textarea has a non-empty selection, the dialog exposes **Branch from term**.
The action captures the exact LaTeX substring, its Unicode code-point start and end, up to 32 code
points of prefix/suffix context, and the 1-based occurrence in the full formula source. It closes
the dialog and runs the existing `branch.createFromSelection` composite with
`kind: 'formula'`, a formula-term atomic binding, and an explicit
`{ kind: 'formula', form: 'term', … }` selector.

The anchor record uses the term as `quote` and mirrors prefix/suffix/occurrence from the selector.
The formula node receives the atomic `anchorIds` entry, so the M3c1 marker, selected state, callout
lane and quote chip are reused without new rendering code. A unique term resolves; a repeated term
is created but stays `ambiguous` with two ranked candidates and no auto-resolution. Undo removes the
new child, branch and anchor exactly; redo/reload keep the IDs.

The core command path now guards the term selection before mutation: the selector and binding must
name the same term, the term must occur in the bound formula source at the declared occurrence, and
`latexStart` (when present) must be that occurrence's code-point start. Multiple occurrences remain
valid and ambiguous by design.

## Files

| File | Change |
|---|---|
| `apps/desktop/src/renderer/src/lib/anchor-selection.ts` | Formula-term selection mapping (`formulaTermSelection`), selector/binding builders, and `formulaNodeAt` to locate the formula from the dialog's node position. Widened the formula selection union to term bindings. |
| `apps/desktop/src/renderer/src/shell/Dialogs.tsx` | Math dialog tracks the textarea selection, exposes **Branch from term** only for an existing formula with a non-empty term, closes and submits the composite. Applies a changed dialog source first so the selected term exists canonically. Insert/apply behaviour is preserved; the existing editor still opens on double click. |
| `packages/core/src/commands.ts` | Term-selection guard used by `branch.createFromSelection` and `anchor.create`: binding/selector consistency, occurrence bounds, `latexStart` consistency. Multiple occurrences allowed. |
| `packages/core/test/selection-command.test.ts` | Unique-term create/binding/inverse/redo; exact reuse and a second occurrence as a new anchor; repeated terms ambiguous with and without the hint; invalid term/selector/start/hint rejection. |
| `apps/desktop/test/anchor-selection.test.ts` | Term selection mapping: exact term, context, occurrence 2, UTF-16 → code-point offsets, 32-code-point context bound, collapsed selection. |
| `tests/ui/m3-formula-term.test.mjs` | New UI flow: edit formula → select term → Branch from term → child/callout/quote, one-step undo, redo identity, repeated-term ambiguity warning, new-formula action absence, reload, marker buttons, screenshot. |
| `package.json` | `test:ui` and `verify` include the new UI file. |
| `docs/reports/m3c2a-formula-term.md` | This report. |

No spec, UX, ADR, plan, fixture, canonical schema, or dependency changed. `BlockViews.tsx`,
`styles.css`, `runtime.ts`, and `actions.ts` needed no change: the M3c1 formula marker/quote chip/
callout lane and the existing runtime composite already accept the widened formula selection.

## Selection and selector path

1. A double click on a formula emits the existing `nf:edit-math` event with `kind`, `latex`, and the
   ProseMirror node position. `MathDialog` keeps the existing **Apply** path for insert/edit.
2. The textarea selection is read on `select`, keyboard, mouse and input events. A non-empty
   selection at a code-point offset is converted with `Array.from` because textarea offsets are
   UTF-16 while selectors are code points. Context is bounded to 32 code points per side.
3. The occurrence is the number of exact term matches starting at or before the selected code-point
   start. It counts overlapping matches the same way `findQuoteOccurrences` does in core.
4. `formulaNodeAt(editor, pos)` resolves the enclosing `blockBody`/`branchBlock` and maps the position
   to the canonical formula node path (inline and block formulas both work) without using the
   current editor selection, so dialog focus is irrelevant.
5. The dialog submits `branch.createFromSelection` with:
   - binding `{ kind: 'formula', form: 'term', nodePath, latex: term, occurrence }`;
   - selector `{ kind: 'formula', form: 'term', latex, latexStart, latexPrefix?, latexSuffix?,
     occurrenceHint }`;
   - target `{ kind: 'new' }`, role `primary`.
6. Core validates the term/selection, applies `attrs.anchorIds` to the formula node, writes
   `anchor.quote = term` plus prefix/suffix/occurrence mirrors, and creates the child block and
   branch as one composite. `created.anchorIds` is non-empty only for a new anchor; an exact
   same-occurrence selection reuses the anchor and adds only a branch.
7. The inverse is the normal structural snapshot: one `⌘Z` restores the pre-branch document and
   removes child/branch/new anchor. Redo restores the same IDs; reload preserves them.

If the dialog source was changed before branching, the exact textarea value is written through the
existing math update command first, then the branch runs against the updated source. The normal
unchanged-source path is exactly one undo entry; the changed-source path leaves the formula edit as
its own earlier command (the branch remains a single exact inverse).

## Marker and callout

- The formula node already exposes `data-anchor-ids` and `data-anchor-kind="formula"` from M3c1, so a
  term anchor gets the same durable dot and, on a selected parent block, the real marker button.
- The callout lane reuses M3b2a/M3c1: anchored child below the parent, quote chip with the `Σ` glyph
  and the term (`data-anchor-quote="\lambda"`, `data-anchor-kind="formula"`), and
  `data-anchor-state="resolved"`.
- A repeated term produces two candidates. The anchor is created and the callout/quote chip shows
  `data-anchor-state="ambiguous"` with the **Ambiguous** badge; the parent block shows the existing
  `data-anchor-warning` with state `ambiguous`. No candidate is chosen automatically.
- Term-rectangle geometry is intentionally untouched. The callout aligns to the formula rectangle
  (M3c2b will add best-effort term geometry and the fallback contract).
- A new formula without a node position never shows **Branch from term**; this is covered by the UI
  test through the command palette's **Insert math…** path.

## Tests and evidence

| Check | Result |
|---|---|
| `npm run typecheck` | pass (desktop node/web, core, layout, pdf) |
| `npm test` | 400/400 pass, 33 files, 1.79 s |
| Targeted core/UI unit tests | 33/33 pass, 212 ms |
| `node --test tests/ui/m3-formula-term.test.mjs` | 1/1 pass; suite 9.6 s including two Electron launches, test body 1.48 s |
| `npm run test:ui` | 11/11 pass across six files (M2 view, M2 shell 4, M3 callout 3, M3b2b outline, M3c1 formula, M3c2a term) |
| `npm run verify:fast` | pass; typecheck + 400 unit + critical e2e 21/21 |
| Critical e2e | 21 tests, 45.3 s test body / 53.4 s file (unchanged count) |
| Screenshot | `artifacts/m3c2a/formula-term-1440x900.png` (1440 × 900) |

The UI test uses condition-based waits only (no fixed sleeps), the hidden window, and no native
dialogs. It asserts the exact selector/binding, quote/prefix/suffix/occurrence, one-step undo and
redirect identity, repeated-term ambiguity (callout, warning, no auto-resolution), the absent action
for a new formula, persisted reload, and both marker buttons in the ambiguous/resolved states.

## Risks / open questions

- **Term geometry:** a term anchor currently points at the formula rectangle. This is the approved
  M3c2b fallback, not a defect; precise KaTeX term rectangles and candidate highlighting follow.
- **Changed source and undo granularity:** branching after editing the LaTeX first writes the changed
  formula (its own undoable edit), then creates the term branch. One `⌘Z` still removes the child,
  branch and new anchor, but it does not also revert the earlier formula edit. The unchanged-source
  path is exactly one entry.
- **Ambiguous warning copy:** the block-level M3b1 banner still says “Lost anchor” for an ambiguous
  term; the callout badge correctly says **Ambiguous**. Candidate chooser/relabel belongs to M3e.
- **Term matching:** occurrence counting includes overlapping exact matches, matching the core
  resolver's `findQuoteOccurrences`; this keeps selector hints and candidate ranking consistent.
- **No automatic selector refresh:** editing the formula source after creation can make a term
  ambiguous or broken, as specified; resolution never mutates the selector.

## Next step

**M3c2b — formula term geometry and ambiguity.** Map resolved term ranges to best-effort KaTeX
rectangles, draw the term marker/highlight, fall back to the formula rectangle with the term chip,
and add the candidate chooser/highlight for ambiguous terms. Reuse this selector and
`resolveAnchor` path; no command or schema change is expected.
