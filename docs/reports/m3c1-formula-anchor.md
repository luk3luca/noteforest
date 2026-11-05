# M3c1 — Whole-formula anchors

**Date:** 5 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-bc6e9957`  
**Branch:** `t3/m3c1-whole-formula-anchors`  
**Base:** `90fd30d` (`main`: docs: merge M3b2b and start M3c1)  
**Scope:** whole-formula anchors only; atomic `attrs.anchorIds` binding, formula marker,
selected state, LaTeX quote chip, callout lane reuse, one exact inverse, exact-anchor reuse,
targeted tests and screenshot. No term/code/image anchors, no reference edges, no repair/health,
no split/merge, no page/PDF, no schema bump, no new dependencies.

## Summary

A `NodeSelection` on `inlineMath`/`blockMath` now takes the formula branch path instead of the
text path. `branchSelectionAnchor` returns a whole-formula binding (`kind: 'formula'`, `form: 'whole'`,
canonical node path) plus the `{ kind: 'formula', form: 'whole', latex }` selector. A text caret or
range still returns the existing text binding unchanged.

`⌘⇧Return`, the floating **Branch** button, and the existing `branch.createFromSelection` composite
command all use the same route. The composite creates the anchor, child block and primary branch as
one undoable command, reuses an exact whole-formula anchor, and reports `created.anchorIds` only for
a new anchor.

The math node view keeps its KaTeX rendering and now carries the canonical `attrs.anchorIds`
attribute. A formula with anchored children shows a durable dot, a selected state when its anchor is
selected, and a real marker button on the selected parent block. The callout lane from M3b2a is
reused; its quote chip shows the truncated LaTeX with a `Σ` glyph and `data-anchor-kind="formula"`.

One behavioural detail is explicit: a plain click selects the whole formula (the selection the
feature needs), and a double click still opens the existing formula editor.

## Files

| File | Change |
|---|---|
| `apps/desktop/src/renderer/src/lib/adapter.ts` | Canonical `mathBlock` ↔ editor `blockMath` mapping; normalized atomic `anchorIds` (legacy `anchorId` folded, empty array omitted); callout projection carries `anchorKind`. |
| `apps/desktop/src/renderer/src/lib/anchor-selection.ts` | New whole-formula selection mapping (`formulaBindingInBody`, `formulaSelectionAnchor`, `branchSelectionAnchor`); `blockMath` treated as a block barrier/leaf; text path keeps its binding shape with `kind: 'text'`. |
| `apps/desktop/src/renderer/src/editor/extensions.ts` | `BlockMath`/`InlineMath` extended with the `anchorIds` attribute and wrapped KaTeX node view: click selects the formula, double click opens the existing math dialog; formula node view exposes `data-anchor-ids`/`data-anchor-kind`. |
| `apps/desktop/src/renderer/src/editor/DocumentEditor.tsx` | Routes the toolbar/keymap branch action through `branchSelectionAnchor`; formula node selections count as selected-but-not-editing so marker buttons remain reachable. |
| `apps/desktop/src/renderer/src/editor/keymap.ts` | `⌘⇧Return` on a formula `NodeSelection` branches from the formula; text and block-child behaviour unchanged. |
| `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx` | Marker/lane/highlight queries accept any `[data-anchor-ids]` host (text marks and formula nodes); callout chip exposes `data-anchor-kind` and the `Σ` glyph. |
| `apps/desktop/src/renderer/src/state/runtime.ts` | `branchFromSelection` accepts the text/formula selection union and emits the matching typed composite command. |
| `apps/desktop/src/renderer/src/styles.css` | Durable formula dot, selected state, selected-node outline, and marker-button suppression for the formula host. |
| `packages/core/test/selection-command.test.ts` | Formula whole-node create/inverse/redo, inline formula binding, and exact-anchor reuse/undo identity. |
| `apps/desktop/test/anchor-selection.test.ts` | Formula selection path (block + inline), adapter `mathBlock`/`blockMath` mapping, atomic `anchorIds` normalization. |
| `apps/desktop/test/adapter.test.ts` | Callout descriptor and node attrs include `anchorKind`. |
| `tests/ui/m3-formula-anchor.test.mjs` | New UI flow: click block formula, branch, marker/callout/selected state, one-step undo, redo identity, toolbar reuse, undo keeps anchor, type in focused child, reload, screenshot. |
| `package.json` | `test:ui` and `verify` include the new UI file. |
| `docs/reports/m3c1-formula-anchor.md` | This report. |

No spec, UX, ADR, plan, fixture, canonical schema, or dependency changed.

## Selection and binding path

1. The math node view handles a plain left click by dispatching a `NodeSelection` at the formula
   node position. A double click emits the existing `nf:edit-math` event, so the formula editor is
   unchanged.
2. `branchSelectionAnchor(editor)` checks for a formula `NodeSelection`; otherwise it delegates to
   `textSelectionAnchor` with no change to the text path.
3. `formulaSelectionAnchor` resolves the enclosing `blockBody`/`branchBlock`, computes the PM
   position relative to the body, and `formulaBindingInBody` returns the canonical nested node path
   and LaTeX source. This works for a top-level block formula and an inline formula nested in a
   paragraph.
4. The runtime submits `branch.createFromSelection` with `kind: 'formula'`, the atomic binding
   `{ kind: 'formula', form: 'whole', nodePath }`, and the selector
   `{ kind: 'formula', form: 'whole', latex }`.
5. The core command applies `attrs.anchorIds` to the formula node, writes the anchor record and
   selector mirror (`quote = latex`), and creates the target block/branch. Exact reuse compares the
   node binding; `created.anchorIds` is empty when an existing anchor is reused.
6. Undo is the normal structural snapshot: the new anchor, block and branch are removed together.
   Redo restores the same IDs. Reusing an existing anchor leaves that anchor in place on undo.

The adapter maps the canonical `mathBlock` node type to TipTap's `blockMath` on read and back on
commit, so the stored content follows spec §4.4 while the editor keeps the Mathematics extension's
node names. Atomic `anchorIds` arrays are sorted and empty arrays are omitted; the M2 legacy
`anchorId` string is folded into the array.

## Marker and callout

- The formula node view renders `data-anchor-ids` and `data-anchor-kind="formula"`; CSS adds a
  durable accent dot at the formula edge while the anchor has at least one branch.
- When the parent block is selected, the existing marker-button layer places a real
  `[data-anchor-marker-id]` button over the formula node's right edge. Its label is still
  `Anchor: “latex”, N branches`, so the M3b2b click/cycle path is reused.
- Selecting the anchor (for example from the callout quote chip) marks the formula host with
  `data-anchor-selected="true"`; the formula gets the accent background/shadow.
- The callout lane, ordering, alignment/leader, and direct-child placement are unchanged from
  M3b2a. The callout chip shows `Σ “E = mc^2”` (LaTeX truncated by the existing 64-character rule)
  and exposes `data-anchor-kind="formula"`.
- The child is focused after creation. Typing immediately is verified through the toolbar branch
  path; the callout is a normal editable block.

## Tests and evidence

| Check | Result |
|---|---|
| `npm run typecheck` | pass (desktop node/web, core, layout, pdf) |
| `npm test` | 379/379 pass, 33 files, 1.8 s |
| `node --test tests/ui/m3-formula-anchor.test.mjs` | 1/1 pass; file ~10.1 s including two Electron launches; test body ~2.0 s |
| `npm run test:ui` | pass: M2 view, M2 shell (4/4), M3 callout (2/2), M3b2b outline, M3c1 formula |
| `npm run verify:fast` | pass; typecheck + 379 unit + critical e2e 21/21 |
| Critical e2e suite | 21 tests, 44.4 s (unchanged count; under 60 s) |
| Screenshot | `artifacts/m3c1/formula-anchor-1440x900.png` (1440 × 900) |

The UI test uses condition-based waits only, no fixed sleeps and no native dialogs. It asserts:

- formula `NodeSelection` on click and branch via `⌘⇧Return`;
- canonical anchor `kind: 'formula'`, `quote = latex`, selector `form: 'whole'`, atomic binding
  `mathBlock` with `anchorIds`, resolved state, and the primary branch source;
- formula host `data-anchor-ids`, callout chip LaTeX/kind/state, and lane offset;
- one-step undo restores the exact pre-branch document and removes the formula binding; redo keeps
  the same IDs;
- toolbar reuse adds a second branch without a second anchor; undo keeps the anchor and the original
  child;
- another toolbar branch focuses its child, typing lands in the canonical content, and the saved
  document reloads with anchor, two branches, text and callout placement intact;
- selected anchor highlights the formula and exposes the marker button with the LaTeX label.

## Risks / open questions

- **Click behaviour change:** a single click on a formula now selects the whole formula; double click
  opens the formula editor. This is the user path needed for whole-formula selection. If the product
  owner prefers click-to-edit as the primary gesture, the alternative is a modifier-click selection
  path; the binding/command layer does not change.
- **Callout prose click:** clicking an empty callout's prose does not move the caret into the callout
  in the current M3b2a lane (a pre-existing lane hit-testing/`display: contents` issue). New formula
  children are focused on creation and are reachable from the outline; the M3c1 test types through
  the focused-new-child/toolbar path. This is not a formula-anchor regression.
- **Core selector requirement:** the composite formula path requires the caller to pass the formula
  selector; the editor always does. A future API caller should not omit it (the text fallback only
  derives text selectors).
- Formula-term geometry is intentionally untouched; it remains M3c2.

## Next step

**M3c2 — formula term anchors.** Add a LaTeX substring selection inside the formula editor, a term
selector (`form: 'term'`, exact substring/occurrence, prefix/suffix), best-effort rendered term
geometry with the formula rectangle fallback, and reuse the same marker/callout/lane and composite
command path.
