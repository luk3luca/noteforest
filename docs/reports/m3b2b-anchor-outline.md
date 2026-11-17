# M3b2b — Anchored outline rows and marker navigation

**Date:** 5 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `a builder worktree`  
**Branch:** `t3/m3b2b-anchor-outline-markers`  
**Base:** `7b060c4` (`main`: docs: merge M3b2a and start M3b2b)  
**Scope:** outline anchored rows, source-row anchor chips, marker/quote selection and cycling,
collapse hidden count, and reveal-on-navigation. No schema/canonical change, no callout geometry or
edge routing change (M3b2a), no health/repair (M3e), no formula/code/image anchors (M3c), no reference
edges (M3d), no split/merge (M3f), no page/PDF, no new critical e2e.

## Summary

Anchored primary children are now first-class outline rows: `↳ “quote”` prefixed, at the same
indentation as direct children, grouped by anchor with a thin left rule, and ordered by the shared
core `anchoredChildBranches` selector. The source row shows an anchor-count chip and a warning chip
when any of its anchors is broken or ambiguous. Selecting an anchored row focuses the callout target
and highlights the source span and the selected branch quote.

The anchor marker is now a real button on the selected block when the prose does not own the caret
(block selection or blurred editor). It exposes `aria-label="Anchor: “quote”, N branches"`; clicking
selects the anchor's first branch, clicking again cycles its branches. The callout quote chip is a
real button that selects the parent anchor and branch. The block actions menu gained the equivalent
keyboard/menu entries (`Select anchor…`, `Next branch from…`); no new global keybinding was added.

Collapse already hid the callout lane with the direct-child group; the branch port's hidden count now
is explicitly the full primary child count, so it includes anchored callouts. Navigation through the
command palette (and any `focusBlock` path) expands collapsed ancestors before focusing, and restores
the outline rows and lane.

## Files

| File | Change |
|---|---|
| `apps/desktop/src/renderer/src/lib/tree.ts` | `BlockNode` carries `branchId`/`anchorId`; shared `anchorQuote`, `anchorState`, `anchorIsWarning` helpers; outline tree keeps the core D3 order. |
| `apps/desktop/src/renderer/src/lib/adapter.ts` | Callout projection carries `parentId`; body/block attrs expose `calloutParentId`; hidden-count comment clarifies anchored callouts are counted. |
| `apps/desktop/src/renderer/src/shell/Sidebar.tsx` | Anchored outline rows (`↳ “quote”`), anchor grouping/left rule, branch-count/status chips, source anchor-count and warning chips, and anchored-row selection that highlights the quote. |
| `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx` | Marker button overlay positioned on the live anchor marks; selected-span highlighting; quote chip is a button; branch-selected styling. |
| `apps/desktop/src/renderer/src/editor/editor-ui.ts` | UI-only `editing` and `selectedAnchor` state; marker visibility and anchor highlight are view state. |
| `apps/desktop/src/renderer/src/editor/DocumentEditor.tsx` | Syncs the selected block's editing state on selection/focus/blur. |
| `apps/desktop/src/renderer/src/editor/extensions.ts` | Declares `calloutParentId` on block/body wrapper nodes. |
| `apps/desktop/src/renderer/src/state/runtime.ts` | `selectedAnchor`, `selectAnchor`/`cycleAnchor`/`activateAnchor`, stale-selection validation, `expandAncestors`, reveal-on-`focusBlock`. |
| `apps/desktop/src/renderer/src/actions.ts` | Block menu anchor entries: select and next-branch, with unresolved-anchor wording. |
| `apps/desktop/src/renderer/src/App.tsx` | Test state exposes `selectedAnchor`. |
| `apps/desktop/src/renderer/src/styles.css` | Outline anchored rows/rule/chips, marker button/dot, selected mark, quote-chip button and selected branch. |
| `apps/desktop/test/adapter.test.ts` | Projection expects `parentId`; body/block callout parent attrs asserted. |
| `apps/desktop/test/tree.test.ts` | Outline nodes expose branch/anchor metadata; quote/state helpers asserted. |
| `tests/ui/m3-anchor-outline.test.mjs` | New UI test: row order/prefix/counts/grouping/indentation, source chips, row selection + highlight, collapse hidden count, reveal via palette, marker click/cycle/aria-label, quote-chip selection, menu path, broken warning chips; screenshot. |
| `package.json` | `test:ui` and `verify` include the new UI file. |
| `docs/reports/m3b2b-anchor-outline.md` | This report. |

No spec, UX, ADR, plan, fixture, canonical schema, or dependency changed.

## Outline behavior

- The sidebar reuses `buildChapterTrees` over `directChildIds`, which is
  `anchoredChildBranches` followed by `directChildBranches`; no second order key exists in the renderer.
- Anchored rows share the direct-child indentation. Each row is a normal `TreeItem` (same selection,
  keyboard, rename, context-menu and collapse behavior) with `data-anchor-id`, `data-anchor-group`,
  `data-anchor-first`/`last`, `data-anchor-state`, and `data-branch-id`.
- Rows that share an anchor are contiguous and carry a 2 px left rule with rounded group ends. The row
  prefix is `↳ “quote”`; the label/first line follows. When an anchor has more than one branch the row
  shows the group branch count; a broken/ambiguous/block-missing anchor shows an amber warning icon.
- The source row shows an anchor-count chip (distinct anchors with primary branches) and, when needed,
  a warning chip with the number of unresolved anchors.
- Selecting an anchored row focuses the callout target, keeps the branch selected, and highlights the
  source anchor marks and the matching quote chip. Broken anchors still select and focus; repair stays
  M3e.

## Marker and quote behavior

- Markers render only for the selected block and only when it is not being text-edited. A text caret
  (`editing=true`) keeps the plain dotted underline/dot; a block `NodeSelection` or a blurred editor
  shows real `<button>` markers over the resolved mark positions.
- Every marker has an `aria-label` of the form `Anchor: “symmetric”, 2 branches` and a state attribute.
  A marker with no visible mark (broken anchor) falls back to the block warning point instead of
  guessing a span.
- Click selects the anchor's first branch; a subsequent click advances through the anchor's branches
  in core branch order and wraps. The selected branch is highlighted on its callout, and all text nodes
  of the anchor range are highlighted in the parent.
- The quote chip on a callout is a button. It selects the parent block as a block selection (not a text
  caret) and selects that callout's anchor/branch.
- The block menu provides `Select anchor “quote”` and, for multi-branch anchors,
  `Next branch from “quote”`. The menu is keyboard reachable; no global shortcut was added.

## Collapse and reveal behavior

- Collapsing a block hides the callout lane and every direct/anchored descendant through the existing
  `data-collapsed` CSS path. The branch-port count is the full primary child count, so the hidden count
  includes anchored callouts (verified: three callouts + one direct child → `4`).
- Expanding restores the lane. `runtime.focusBlock` now expands collapsed ancestors first, so palette
  navigation, search/focus paths, and anchored-row navigation reveal a hidden callout. This changes only
  view state, never the canonical document.
- If the selected anchor's branch/block disappears, the stale anchor selection is dropped on the next
  structural accept/reload.

## Tests and evidence

| Check | Result |
|---|---|
| `npm run typecheck` | pass (desktop node/web, core, layout, pdf) |
| `npm test` | 371/371 pass, 33 files, 1.7 s |
| `node --test tests/ui/m3-anchor-outline.test.mjs` | 1/1 pass; file 9.2 s including Electron launch/quit; test body 1.1 s |
| `npm run test:ui` | pass: M2 view 1/1, M2 shell 4/4, M3 callout 2/2, M3b2b outline 1/1 |
| `npm run verify:fast` | pass; typecheck + 371 unit + critical e2e 21/21 |
| Critical e2e suite | 21 tests, 44.5 s (unchanged count; under 60 s) |
| Screenshot | `artifacts/m3b2b/anchor-outline-1440x900.png` (1440 × 900) |

The UI test uses condition-based waits only (no fixed sleeps, no native dialogs). It drives the real
runtime command/rebuild path, then asserts DOM and runtime view state:

- anchored row order `[symmetric #1, symmetric #2, eigenvalues]`, quote prefixes, branch counts,
  group IDs, left-rule width, and equal indentation to the direct child;
- source anchor count `2`, no warning while resolved, warning count `2` after the span is rewritten;
- row selection updates `selectedBlockId`/`selectedAnchor` and marks the source span and selected quote;
- collapse hides the lane/rows and the port reports all four primary children; palette navigation
  expands the parent, restores rows/lane, and focuses the callout;
- marker button `aria-label`, first click selects the first branch, second click cycles to the second;
- quote chip selects the parent block and anchor; block menu exposes select/next-branch entries.

No full `npm run verify` was run, per the brief; the Orchestrator runs it at integration.

## Risks and follow-ups

- The marker appears only in the selected, non-editing state by design. Users who select a block through
  the outline land in a text caret and must leave editing (`Esc`) before the marker becomes clickable;
  the block menu remains the always-available path.
- Marker positions are an editor CSS/measurement approximation over the live mark rectangles, best
  effort like the M3b2a callout alignment. M4 pixel parity remains the layout gate.
- Broken anchors still group/order by the core fallback (resolved start, else `lastKnown`, else
  end-of-block, then anchor ID), so their relative row order can change after the span is lost. This is
  the ratified DD-3 behavior, not a regression.
- Outline rows deliberately follow the existing outline collapse behavior: collapsed subtrees are not
  listed. Reveal-on-navigation therefore goes through `focusBlock` (palette, search, direct focus), not
  through an invisible row.
- The sidebar row prefix gives the quote 46% max width; very long quotes ellipsize. The label remains in
  the row title tooltip and `TreeItem` text value.
- No ambiguous-chooser/health sheet, reference chips, formula/code/image marker geometry, split/merge,
  or PDF work was added.

## Next step — M3c

Add formula, code, and image anchor authoring and best-effort marker geometry on top of the same outline
projection, marker button, and `selectedAnchor` view state. Keep the core order key and quote/state
helpers as the single source; do not add a second resolver or outline order.
