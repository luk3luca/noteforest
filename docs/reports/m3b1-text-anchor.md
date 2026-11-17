# M3b1 — Text anchor authoring, branch from selection, basic marker

**Date:** 5 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `a builder worktree`  
**Branch:** `t3/m3b1-text-anchor-branch`  
**Base:** `2a14cdf` (`main`: docs: merge M3a2 and start M3b1)  
**Scope:** text selection → anchored primary child → marker → one structural inverse → reload. No
callout lane, quote chip, outline anchored row, anchor health/repair, formula/code/image anchors,
reference edges, split/merge, page/PDF, schema bump, or dependency.

## Summary

M3b1 connects the editor text selection to the M3a command layer. Selecting text and pressing
`⌘⇧Return` or the floating toolbar **Branch** creates an anchored primary child with one typed
composite command, focuses the new child, and renders a durable dotted marker. One structural undo
removes the branch, block and newly created anchor exactly; redo restores the same IDs; an exact
existing anchor is reused instead of duplicated.

The binding is never applied optimistically in the editor. The adapter derives a platform-neutral
text binding from the ProseMirror selection, the runtime commits the pending editor buffer, the
canonical command applies the binding, and the editor is rebuilt from canonical content. This is
the reconciliation path in design §5.5.

## Files

| File | Change |
|---|---|
| `packages/core/src/commands.ts` | `branch.createFromSelection` composite command, shared existing-target branch helper, anchor reuse, one exact snapshot inverse. |
| `packages/core/src/anchors.ts` | `textAnchorSelectorForBinding`: derives quote/prefix/suffix/occurrence from a text binding and its projection. |
| `packages/core/test/selection-command.test.ts` | New 7-test composite suite: create, exact inverse/redo identity, undo after typing, reuse, existing target/chapter slot, inline-math projection, validation/no partial mutation. |
| `apps/desktop/src/renderer/src/editor/extensions.ts` | `anchor` TipTap mark: sorted `anchorIds`, one mark per text node, `inclusive: false`, parse/render, `data-anchor-mark`. |
| `apps/desktop/src/renderer/src/lib/adapter.ts` | Anchor-mark normalization (legacy `anchorId` folded; empty marks dropped), `stripAnchorBindings` for paste. |
| `apps/desktop/src/renderer/src/lib/anchor-selection.ts` | PM selection → core text binding; codepoint offsets; inline math allowed; block-atomic and table-cell barriers rejected. |
| `apps/desktop/src/renderer/src/editor/DocumentEditor.tsx` | Paste guard strips pasted anchor IDs; `branchFromSelection` binding. |
| `apps/desktop/src/renderer/src/editor/SelectionToolbar.tsx` | **Branch** button using the same action. |
| `apps/desktop/src/renderer/src/editor/keymap.ts` | `⌘⇧Return`; no text selection keeps the block-child path. |
| `apps/desktop/src/renderer/src/editor/bindings.ts` | `branchFromSelection` editor binding. |
| `apps/desktop/src/renderer/src/state/runtime.ts` | Queue/commit/composite/rebuild/focus action; `anchorId` in the outcome. |
| `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx` | Minimal broken-anchor warning on the parent card. |
| `apps/desktop/src/renderer/src/lib/tree.ts` | Edge overlay now includes anchored primary branches. |
| `apps/desktop/src/renderer/src/styles.css` | Dotted anchor marker/dot and warning chip. |
| `apps/desktop/test/anchor-selection.test.ts` | 10 adapter/selection tests (UTF-16→codepoint, inline math, barriers, table cell, mark schema, paste strip). |
| `tests/e2e/m2-editor.test.mjs` | One critical M3b1 e2e (test 21). |
| `docs/reports/m3b1-text-anchor.md` | This report. |

No spec, UX, ADR, plan, fixture, schema, or dependency changed.

## Composite command

`branch.createFromSelection`:

```ts
{
  type: 'branch.createFromSelection';
  blockId: string;                 // source block containing the selection
  kind: 'text';                    // M3b1 UI sends text
  binding: AnchorBinding;          // text node paths + codepoint ranges
  selector?: JsonObject;           // optional for text; derived from the binding
  target: { kind: 'new'; blockId?: string; content?: ContentNode }
        | { kind: 'existing'; blockId: string };
  role?: 'primary' | 'reference';  // default primary; new target must be primary
  atIndex?: number;
  label?: string;
  branchId?: string;
  anchorId?: string;               // only used when a new anchor is needed
}
```

Behavior:

- derives `quote`/`prefix`/`suffix`/`occurrenceHint` from the plain-text projection when
  `selector` is omitted (inline math contributes its LaTeX source);
- reuses an anchor whose bound selection is exactly equal; otherwise creates the anchor and its
  content binding;
- creates the child block and primary branch from the anchor port in the same command;
- returns `created.anchorIds` **only** for a newly created anchor; a reused anchor appears only in
  `affected.anchorIds` with a warning;
- returns one exact `structure.restore` inverse (new anchor removed; reused anchor kept) and
  preserves block/branch/anchor IDs and order keys on undo/redo;
- rejects invalid binding/selector/target before any record survives (the command applies to a
  clone and re-validates).

## Keymap and toolbar

| Input | Action |
|---|---|
| `⌘⇧Return` with text selection | Branch from the selection (`branch.createFromSelection`) |
| `⌘⇧Return` with no text selection | Existing block-child path (`addChild`) |
| `Control+Enter` | Block child (unchanged) |
| `Option+Enter` | Sibling (unchanged) |
| Selection toolbar **Branch** | Same action as `⌘⇧Return` |

After creation the runtime rebuilds from canonical and focuses the new block with the caret at its
start, ready for typing. `Control+Enter` and the rest of the M2 keymap are untouched.

## Marker and rendering

- The `anchor` mark renders as `span.nf-anchor-mark[data-anchor-mark="true"][data-anchor-ids="…"]`
  with a dotted underline and a small dot.
- The anchored child is emitted by `directChildIds` anchored-first and rendered inside the parent's
  `branchChildren` card group; it also appears nested in the sidebar tree.
- The SVG edge overlay now includes anchored primary branches (`primaryChildBranches`), so the
  child keeps a visible edge.
- If an outgoing anchor resolves `broken`/`ambiguous`/`block-missing`, the parent card shows a
  minimal `Lost anchor` chip (`data-anchor-warning`, `data-anchor-state`). Full health/repair UI
  remains M3e.
- Pasted inline/atomic content loses anchor IDs (`transformPasted`) so copy/paste cannot duplicate
  an anchor ID. Block-copy remapping remains M3f.

## Tests and evidence

| Check | Result |
|---|---|
| `npm run typecheck` | pass (desktop, core, layout, pdf) |
| `npm test` | 365/365 pass, 33 files, 2.20 s |
| Targeted core composite | 7/7 pass |
| Targeted adapter/selection | 10/10 pass |
| `npm run verify:fast` | pass; typecheck + 365 unit + e2e 21/21 |
| Critical e2e suite | 21 tests, 56.8 s (was 20/52.7 s); new test 3.5 s |
| Screenshot | `artifacts/m3b1/anchored-child-1440x900.png` |

E2E test name: **“creates a text-anchored child, undoes once, and reloads with the anchor intact”**
(`tests/e2e/m2-editor.test.mjs`). It selects “eigenvalue” with a real mouse drag, creates the child
with `⌘⇧Return`, asserts the marker/child focus/branch source, takes a screenshot, removes everything
with one `⌘Z`, redoes with the same IDs, types in the child, exercises anchor reuse + undo through the
floating toolbar, then quits and relaunches with the marker, anchor, child and text intact. It uses
condition-based waits only; no fixed sleeps and no native dialogs.

No full `npm run verify` was run, per the task; the Orchestrator runs it at integration.

## Risks and follow-ups

- Only text anchors are wired in the UI. The command accepts the other kinds when an explicit
  selector is supplied, but formula/code/image authoring is M3c.
- The broken-anchor chip is intentionally minimal and derived at card render time; it does not yet
  subscribe to a debounced resolution pass. M3e owns the health surface.
- Anchored children use the normal nested card layout in M3b1, not the callout lane/quote chip.
  M3b2 owns lane geometry, quote display, outline anchored rows and toolbar/marker polish.
- Copying blocks and remapping internal anchor/branch IDs to new IDs is M3f; paste currently strips
  anchor bindings for inline/atomic content as ratified.
- A structural undo after typing in the child can remove the typed child record; the normal user
  path still undoes the text edit first (`⌘Z` text history), matching UX F5. The structural inverse
  itself is exact.
- The anchor mark is non-inclusive at the end, but TipTap/PM cursor behavior at a marker boundary
  was verified in the e2e create/reload path, not exhaustively for every composition/IME case.

## Next step — M3b2

Add the callout lane below the parent card, quote chip, anchored-first outline row, marker/selection
polish, and anchor cycling/health affordances on top of this binding and composite command. Keep
`branch.createFromSelection`, the `anchor` mark and the adapter binding unchanged unless the lane
needs additional derived geometry.
