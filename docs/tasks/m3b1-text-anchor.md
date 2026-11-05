# M3b1 — Text anchor authoring, branch from selection, basic marker

**Role:** Builder  
**Milestone:** M3b1 (first half of M3b; M3b2 adds the callout lane/outline/polish)  
**Base:** current `main` (M3a2 merged)  
**Worktree:** fresh worktree from `main`  
**Timebox:** 1–1.5 days

## Context

M3a1/M3a2 made anchors and anchored branches real in the core. This slice connects the text
selection to that command layer: select text, press `⌘⇧Return`, get an anchored child, one undo
entry, and a durable marker. It is the first user-visible M3 slice; keep the visual scope minimal
until M3b2.

Read:
- `docs/spec.md` v0.4.5 §4.4/§4.6/§5.4/§8.2; `docs/adr/0005-anchor-binding-and-identity.md`.
- `docs/ux.md` v1.3 F5, T2, §8.5; `docs/ux-shell.md` keymap (Control+Enter = block child).
- `docs/design/m3-anchors-references.md` §4.1 `branch.createFromSelection`, §4.2, §6.1, §12 M3b.
- `packages/core` M3a1/M3a2 APIs; `apps/desktop/src/renderer/src/editor`, `lib/adapter.ts`,
  `actions.ts`, `state/runtime.ts`, `SelectionToolbar.tsx`, `styles.css`.

## Goal

A user selects text in the editor, presses `⌘⇧Return` (or uses the selection toolbar "Branch"),
gets a child block anchored to that text, can type immediately, undo the whole action once, and
reload with the anchor and branch intact.

## In scope

1. **Composite core command**
   - `branch.createFromSelection` (or an equivalent single command) for the primary/new-child flow:
     reuse an exact anchor or create one, create the child block, create the primary branch from the
     anchor, return `created.anchorIds` only when the anchor was created.
   - One exact inverse: undo removes the branch, the new block, and the new anchor; if the anchor was
     reused, keep it. Preserve branch/block/anchor IDs across undo/redo.
   - Core unit tests for create/reuse, one-inverse, identity, validation failure, no partial mutation.
2. **Editor mark and adapter**
   - Add the TipTap `anchor` mark with a sorted `anchorIds` array (one mark per text node; non-inclusive
     end per ADR-0005), plus schema parse/render and adapter to/from the core binding.
   - Round-trip content with anchors; no duplicate IDs on copy/paste; select text with inline math.
3. **Selection action and keymap**
   - Selection toolbar "Branch" action and `⌘⇧Return` create from the selection.
   - With no selection, `⌘⇧Return` keeps the existing block-child behavior (Control+Enter remains the
     block child); do not break the M2 keymap.
   - Focus the new child and place the caret for immediate typing.
4. **Basic rendering**
   - Visible anchor marker (dotted underline/dot) on the selected text; data attributes for testing.
   - Child block renders in the editor under the parent in anchored-first order (structure.ts already
     provides the order); keep the existing card layout, no new lane yet.
   - Minimal broken state: if the anchor text disappears, show the existing warning/fallback path; full
     repair UI is M3e.
5. **Tests and evidence**
   - Unit: composite command, adapter parse/serialize, mark array, reuse, undo/redo identity.
   - One compact critical e2e: create text anchor child, type, undo once, reload preserves;
     no fixed sleeps/native dialogs.
   - Screenshot of the anchored child + marker for the product owner.

## Out of scope

- Callout lane geometry, quote chip, outline anchored row (M3b2).
- Anchor cycling/selection toolbar polish, collapse/health sheet (M3b2/M3e).
- Formula/code/image anchors (M3c); reference edges (M3d); repair (M3e); split/merge (M3f).
- Page/PDF, M5 API, schema bump, new dependencies.

## Files

Expected to touch:
- `packages/core/src/commands.ts` (composite command), `packages/core/src/types.ts` (command type)
- `packages/core/test/anchor-commands.test.ts` or a new `selection-command` test
- `apps/desktop/src/renderer/src/editor/extensions.ts` (anchor mark)
- `apps/desktop/src/renderer/src/lib/adapter.ts`
- `apps/desktop/src/renderer/src/editor/SelectionToolbar.tsx`, `DocumentEditor.tsx`, keymap
- `apps/desktop/src/renderer/src/actions.ts`, `state/runtime.ts`
- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx`, `styles.css`
- `tests/e2e/m2-editor.test.mjs` (one test) or a focused M3 e2e file
- `docs/reports/m3b1-text-anchor.md`

## Acceptance criteria

- [ ] Selecting text and pressing `⌘⇧Return` creates one anchored primary child; the selection marker
      is visible and the new block is focused.
- [ ] One `⌘Z` removes the child, branch, and new anchor exactly; redo restores the same IDs.
- [ ] Reusing an exact existing anchor does not create a duplicate binding or remove it on undo.
- [ ] Reload preserves the anchor, marker, branch, and anchored-first order.
- [ ] No selection keeps the block-child path; Control+Enter and the rest of the M2 keymap are
      unchanged.
- [ ] Inline math/image in the selection is supported via the projection; no partial multi-block
      anchor.
- [ ] One critical e2e and one screenshot; no fixed sleeps, no native dialogs.
- [ ] Unit/typecheck/verify:fast pass; no page/PDF or reference-edge work.

## Tests and evidence

- `npm run typecheck`
- Targeted core/unit tests for the composite command and adapter.
- `npm run verify:fast` at the end (typecheck + unit + critical e2e).
- Screenshot path and the e2e test name.
- Do not run the full `npm run verify`; the Orchestrator runs it at integration.

## Stop and ask

Stop if the TipTap mark cannot round-trip anchorIds without a schema/version change, if the
composite command needs a product decision (reference target, no-selection behavior), or if the
critical e2e budget would exceed 60 s.

## Report format

Summary, files, command/adapter API, keymap, marker/rendering, e2e/screenshot, tests/timings, risks,
next step M3b2.
