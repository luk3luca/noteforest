# M4b1a2 — Read mode global gating

**Role:** Implementer / Builder
**Milestone:** M4b — editor layouts and modes
**Base:** current `main` after M4b1a
**Worktree:** isolated builder worktree prepared by orchestrator v2
**Scope:** make Read mode truly read-only across the shell: sidebar, command palette, native menu
commands, chapter/block/reference menus, and undo/redo. No Page Edit, markers, or PDF.

## Why

M4b1a gates the editor surface and block/chapter/reference menus, but shell-level commands can still
mutate the document in Read mode:

- sidebar **Add chapter** and **Add block**;
- palette **New chapter**, **Add top-level/child/sibling**, **Block type**, **Insert table/image/
  math/code**, **Link as reference**, **Undo/Redo**;
- native menu `runMenuCommand('new-chapter' | 'add-block' | 'undo' | 'redo')`;
- chapter context menu **Rename chapter** / **Add block**;
- global undo/redo paths.

Read must not create or remove content, structure, anchors, references, images, or page-break hints.
Navigation, selection, copy, links, anchors, reference following, zoom/fit/focus, save/export,
document rename, and settings remain available.

## Required behavior

1. **One editability helper.**
   - Add a single helper (for example `activeEditingEnabled()` / `canEditActiveDocument()`) that is
     true only when:
     - there is an active runtime;
     - `runtime.editable` is true;
     - `activeDocumentLayout() === 'continuous'`;
     - `activeInteractionMode() === 'edit'`.
   - Use it in every mutating shell/palette/menu path. Do not duplicate the condition ad hoc.
   - Page is always read-only for now; it must use the same false result.
2. **Sidebar.**
   - Disable **Add chapter** and **Add block** in Read/Page with a clear title/aria label
     (“Read mode — switch to Edit to add content”).
   - Do not remove navigation (tree click, collapse, search, open document).
3. **Command palette.**
   - Mutating entries are disabled (not silently no-op) in Read with a visible reason suffix, e.g.
     `Add top-level block — Read mode`.
   - At minimum: new chapter, add top-level/child/sibling, block type changes, link as reference,
     undo/redo, insert table/image/math/code.
   - Navigation/layout/mode/save/export/settings entries stay enabled.
4. **Native menu / runMenuCommand.**
   - `new-chapter`, `add-block`, `undo`, `redo` must not mutate in Read.
   - Prefer disabling/labeling the native menu item if the main-process menu is available; otherwise
     guard at `runMenuCommand` and show a short toast/status message. No silent no-op that looks
     broken.
   - `new-document`, open, save, close, sidebar, palette, settings, zoom/fit/focus stay enabled.
5. **Chapter/block/reference menus.**
   - Chapter menu: rename chapter and add block are disabled in Read.
   - Block/reference menus remain gated as in M4b1a; audit for any remaining mutating entry.
   - Image actions already gated; keep Replace/alt disabled in Read.
6. **Undo/redo.**
   - `undoActive`/`redoActive` must not mutate in Read, including when invoked from the native menu or
     keyboard. Returning to Edit restores normal behavior.
   - A mode switch must still create no undo entry.
7. **Tests.**
   - UI: in Continuous Read and Page Read:
     - sidebar add buttons disabled with reason;
     - palette mutating entries disabled; navigation entries enabled;
     - `⌘Z`/native undo does not change the revision or content;
     - chapter menu add/rename disabled;
     - insert image/table/math/code and add child/sibling do not mutate.
   - Return to Continuous Edit re-enables all of them.
   - Add/keep a unit test for the helper truth table (no runtime, read-only document, Page, Read,
     Edit).
8. **No scope creep.**
   - No Page Edit, continuous markers, PDF, collapse changes, new dependency, or spec/UX/ADR/plan
     edits.
   - Do not modify the product-owner showcase.

## Gates

- `npm run check:boundaries`
- `npm run typecheck`
- targeted vitest
- `npm test`
- `npm run test:ui`
- `npm run test:recovery:run`
- `npm run e2e:critical`
- one `npm run verify:fast` at the end

## Deliverable

Report `docs/reports/m4b1a2-read-mode-gating.md`: worktree/branch/base/commit, helper contract, every
gated surface, tests/timings, screenshots of Read with disabled sidebar/palette, risks, not verified.
Do not merge or push. Stop and ask if a command is intentionally read-only-available (document
rename, export, page setup) or if native menu disabling needs a main-process change.
