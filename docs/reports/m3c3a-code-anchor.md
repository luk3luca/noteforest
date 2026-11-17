# M3c3a — Code range anchors

**Date:** 5 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `a builder worktree`  
**Branch:** `t3/m3c3a-code-range-anchors`  
**Base:** `096a15e` (`main`: docs: merge M3c2b and start M3c3a)  
**Scope:** code range/token anchors only. No image anchors, candidate chooser/repair/health,
reference edges, split/merge, code-block chrome/language/copy/fences, page/PDF, schema bump, or
new dependency.

## Summary

A text selection inside an editable `codeBlock` now becomes one anchored primary child with a
code binding and a durable range selector. The code block keeps its native ProseMirror
`<pre><code>` editing surface; the anchor binds through `attrs.anchorIds` on the `codeBlock` node
(ADR-0005 §1) and `branch.createFromSelection` remains the single mutation path.

- Selection path: `branchSelectionAnchor` detects a range inside a `codeBlock`, maps the
  ProseMirror UTF-16 offsets to Unicode code-point offsets relative to the block body, and builds
  `{kind:'code', nodePath, startOffset, endOffset}`.
- Selector: `{kind:'code', quote, form:'range'|'whole', prefix?, suffix?, occurrenceHint?,
  startOffset?, endOffset?, lineStart?, lineEnd?}`. Context is bounded to 32 code points per side;
  `form:'whole'` is used exactly when the selection covers the whole code text.
- One exact inverse: creating the anchor + child + primary branch stays one structural command and
  one undo entry. Exact reuse happens only for the same selector; `created.anchorIds` stays empty
  when an existing anchor is reused.
- Repeated quotes: creation succeeds but resolution is immediately `ambiguous`; offsets,
  occurrence hint, and context rank candidates only and never auto-resolve. This also aligns the
  existing code resolver with spec §8.2 / design §6.1 (see Risks).
- UI: a subtle per-visual-line range highlight and a gutter dot on the first selected line, a code
  quote chip with the `{}` glyph, the existing callout lane/focus/selected state, and an
  “Ambiguous anchor” warning for repeated quotes.
- The marker layer is a sibling overlay with `pointer-events: none`; selection, caret placement,
  typing, and ordinary text-anchor paths are unchanged. The UI test re-selects code after reload
  to prove the surface is still editable.

## Files

| File | Change |
|---|---|
| `packages/core/src/anchors.ts` | New `codeAnchorSelectorForBinding` (quote/context/occurrence/offsets/lines, code-point based), exported `codeLineRange`, and code resolution now keeps multiple quote matches ambiguous instead of resolving by context. |
| `packages/core/src/commands.ts` | `assertCodeSelection`: rejects a code selector whose quote, offsets, form, occurrence hint, or line hints disagree with the code binding before any mutation. Default code selector derivation when a selection command omits `selector`. |
| `apps/desktop/src/renderer/src/lib/anchor-selection.ts` | Code branch-source type, `codeSelectionInBody` pure mapper, `codeSelectionAnchor` editor bridge for text and whole-code `NodeSelection`, `no-code` failure, and code routing in `branchSelectionAnchor`. |
| `apps/desktop/src/renderer/src/editor/extensions.ts` | CodeBlockLowlight gains the atomic `anchorIds` attribute and `data-anchor-kind="code"` on its native `<pre>`; no custom code node view. |
| `apps/desktop/src/renderer/src/editor/keymap.ts` | `⌘⇧Return` also branches from a `codeBlock` NodeSelection (whole code). |
| `apps/desktop/src/renderer/src/state/runtime.ts` | `branchFromSelection` sends `kind:'code'` plus the explicit selector. |
| `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx` | Resolves code anchors per block, renders the code overlay layer, gutter/line dot, selected state, and code quote chip truncation/badge. |
| `apps/desktop/src/renderer/src/lib/code-anchor-geometry.ts` | New DOM mapper: code-point→UTF-16 offsets, code text-node collection, per-line `Range` rects, first-line marker geometry. |
| `apps/desktop/src/renderer/src/styles.css` | Code range highlight, gutter dot, selected state, and selected code block outline. |
| `packages/core/test/selection-command.test.ts` | 6 new code tests: unique range + exact inverse/redo, whole form + astral code points, exact reuse + repeated ambiguity, selector mismatch rejection, omitted-selector derivation. |
| `packages/core/test/anchors.test.ts` | Updated the repeated-quote resolution expectation to `ambiguous` (context/offset hints only rank). |
| `apps/desktop/test/anchor-selection.test.ts` | 4 code mapping tests: path/binding/selector, astral UTF-16→code-point, whole form, wrong path/empty. |
| `apps/desktop/test/code-anchor-geometry.test.ts` | 3 unit tests: code-point→UTF-16 mapping/clamping and gutter-dot geometry. |
| `tests/ui/m3-code-anchor.test.mjs` | New UI test: keyboard code selection → Branch → marker/highlight/callout → one undo → redo → repeated-quote ambiguous → screenshot → save/reload → editable selection. |
| `package.json` | `test:ui` and `verify` include the new UI file. |
| `docs/reports/m3c3a-code-anchor.md` | This report. |

## Selection and selector path

1. `SelectionToolbar` (or `⌘⇧Return` via `BranchKeymap`) calls `branchFromSelection`.
2. `branchSelectionAnchor` first keeps the whole-formula `NodeSelection` path; then:
   - a `codeBlock` `NodeSelection` becomes a whole-code selection (`form:'whole'`);
   - a non-empty text selection inside a `codeBlock` is mapped to `codeSelectionInBody`.
3. `codeSelectionInBody` resolves the code node by block-body path, converts the two UTF-16
   selection offsets to code points with `Array.from`, and calls the core selector builder on the
   current block content. No local mark or selector is invented in the renderer.
4. `runtime.branchFromSelection` sends `branch.createFromSelection` with `kind:'code'`, the
   binding, and the explicit selector.
5. `ensureSelectionAnchor` validates the selector and binding through `anchorMirrorFields` then
   `assertCodeSelection`, applies the `anchorIds` binding to the `codeBlock`, and creates the
   anchor + target block + primary branch. The command layer returns one structural inverse.
6. Reuse compares node path plus selection fields (`form`, `quote`, `startOffset`, `endOffset`,
   `occurrenceHint`). Prefix/suffix are display/repair context and do not make a different
   selection; a different occurrence or subrange is a new anchor.
7. Resolution binds the code node first and searches that node's code text. A unique quote
   resolves; zero matches are broken; two or more matches are ambiguous even when an offset or the
   context points at one. Offsets and lines are hints, never the sole match.

## Marker and callout

- `BlockBodyView` resolves `kind:'code'` anchors attached by an outgoing primary branch. Only a
  `resolved` range gets geometry; broken/ambiguous anchors keep their callout, chip state, and
  warning without a guessed range.
- `codeRangeRects` walks the live `<pre>` text nodes, maps the resolved code-point range to a DOM
  `Range`, and returns one rect per visual line. A logical code line may wrap visually; the
  highlight still covers every visual fragment.
- The gutter dot is placed at the first selected visual line; `data-code-anchor-line` carries the
  logical 1-based `lineStart` hint. The overlay never takes pointer events.
- The durable marker source is `pre[data-anchor-kind="code"][data-anchor-ids]`, so the existing
  `anchorVisualTargets`/marker-button/callout-lane alignment works unchanged. The callout lane
  therefore aligns to the code block rectangle, as approved for code anchors.
- The quote chip uses the `{}` glyph and truncates the code excerpt (47 code points + ellipsis);
  the selector keeps the full exact code quote. The callout selected state and focus reuse
  M3b2a/M3c1.
- Repeated quotes show the existing `Ambiguous` chip state and an “Ambiguous anchor” block warning.
  The warning text is now state-specific instead of always saying “Lost anchor”.

## Tests, screenshot, and timings

| Check | Result |
|---|---|
| `npm run typecheck` | pass (desktop node/web, core, layout, pdf) |
| Targeted core/UI unit | 103/103 pass, 239 ms |
| `npm test` | 419/419 pass, 35 files, 2.03 s |
| `npm run test:ui` | pass (8 UI files, incl. `m3-code-anchor.test.mjs` 1/1, 2.28 s test / 10.4 s file) |
| `npm run verify:fast` | pass; 21/21 critical e2e (45.0 s suite, 53.1 s file total) |

- UI test: `tests/ui/m3-code-anchor.test.mjs` — “branches from a code range, undoes once, warns on
  repeated quotes, and reloads”.
- It asserts the canonical selector (`quote`, `form`, context, occurrence, code-point offsets,
  line hints), the `anchorIds` binding on the `codeBlock`, one-undo exactness, redo identity,
  visible marker/highlight rectangles, quote-chip kind/data/truncation, repeated-quote `ambiguous`
  state plus warning, save/reload identity, and that a fresh code selection still works after
  reload.
- Screenshot: `artifacts/m3c3a/code-anchor-1440x900.png` (1440 × 900, hidden window,
  condition-based waits, no fixed sleeps, no native dialogs).
- Critical e2e stays 21 tests; no new critical test was added.

## Risks and notes

- **Behavior change in the code resolver.** Multiple quote occurrences now stay ambiguous even
  when a unique stored prefix/suffix would single one out. This follows spec §8.2’s exact-unique
  rule and design §6.1’s creation-time ambiguity rule, and the existing M3a unit test was updated
  accordingly. The Orchestrator/Reviewer should confirm this is the intended reading before
  integration.
- **Display vs canonical quote.** The callout chip uses the existing display projection:
  whitespace is collapsed and the chip is capped (64 in `anchorQuote`, then 48 in the code chip).
  The canonical selector keeps the exact multi-line code quote, code-point offsets, and line hints.
- **Live geometry refresh.** The overlay recomputes on runtime version, card resize, canvas zoom,
  window resize, and font load, matching the M3c2b formula-term layer. It does not re-measure on
  every keystroke before the runtime version changes; a code edit can leave the highlight stale
  until the next runtime update. This is display-only and never mutates content.
- **Wrapped logical lines.** The code block can soft-wrap a long logical line in the current card
  width. Line hints stay logical (`lineStart`/`lineEnd`); the marker uses the first visual line and
  the highlight covers all visual fragments.
- **No code-block chrome.** Language picker, copy button, fences, and syntax UI remain in the
  backlog. The only extension change is the atomic `anchorIds` attribute and the code DOM marker
  source.
- **No image anchors.** Image point/region anchors remain M3c3b.

## Next step

M3c3b — image point/region anchors, reusing the same `branch.createFromSelection` path with
`kind:'image'`, normalized rect selectors, and the existing atomic `anchorIds` binding/overlay
patterns.
