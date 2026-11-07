# M4b1a — editor layouts and modes (taxonomy, continuous read, session)

**Role:** Implementer / Builder
**Milestone:** M4b — editor layouts
**Base:** current `main` after M4b1 and M3c3b6
**Worktree:** isolated builder worktree prepared by orchestrator v2
**Scope:** rename and split the view taxonomy, implement Continuous Read, add the Page Read/Page Edit
seam, persist view state. No Page Edit implementation, no continuous markers, no PDF.

Read:

- `docs/adr/0007-editor-layouts-and-modes.md`
- `docs/reports/m4-editor-layout-audit.md`
- `docs/reports/m4b1-page-view-core.md`
- current `state/shell.ts`, `state/session.ts`, `actions.ts`, `App.tsx`, `DocumentEditor.tsx`,
  `StatusBar.tsx`, `page/PageView.tsx`, `PageView` UI tests
- `apps/desktop/src/shared/api.ts` (`SessionTabState`)

## Required behavior

1. **Two axes in state.**
   - `DocumentLayout = 'continuous' | 'page'`.
   - `InteractionMode = 'edit' | 'read'`.
   - `DocumentViewState` gets `layout` and `interactionMode`; remove the old `mode`.
   - Defaults: `continuous` + `edit`. Page opens in `read` until Page Edit exists.
   - Page Edit is a seam: `PageView` accepts `interactionMode`, but only `read` is implemented. Do
     not ship a fake editable page or a broken Edit toggle.
2. **Layout switching.**
   - `⌘2` = Continuous layout; `⌘3` = Page layout (keep the current shortcuts).
   - Switching to Page forces `interactionMode = 'read'` for now; switching back to Continuous
     restores `edit` by default. `⌘E` toggles Edit/Read in Continuous; in Page it is disabled with a
     clear title/announcement that Page editing is not available yet.
   - Status bar has two groups: **Continuous | Page** and **Edit | Read**. Page + Edit is disabled,
     not silently ignored.
   - Keep `⌘1`/`⌘4–9` tab shortcuts and `Control+Tab`/`⌘⇧]` tab cycling.
3. **Continuous Read.**
   - The continuous ProseMirror surface stays mounted but is not editable.
   - Disable/hide editing chrome: caret, selection toolbar, gutter add/menu controls that mutate,
     drag handles, image authoring controls, block edit menus. Keep click selection, links, anchors,
     reference navigation, copy, scroll, zoom, focus and outline navigation.
   - Do not create an undo/history entry when switching to Read or back. Preserve selection and
     scroll. `⌘E` returns to Edit with the same focused block/selection where possible.
   - Read mode must not block saving or autosave; it simply prevents edits.
4. **Page Read.**
   - PageView remains read-only and exact; rename "Open in reader" to **"Open in continuous
     editor"** and switch to `layout: 'continuous'`, `interactionMode: 'edit'`, focus the block.
   - PageRead behavior, geometry, zoom/fit, fragments, continuation markers, placeholders and
     screenshots are unchanged except labels/attributes.
5. **View-state persistence.**
   - Extend `SessionTabState` with optional `layout`, `interactionMode`, `currentPage`, `pageZoom`,
     `pageFit`, `zoom` (continuous zoom). Keep old sessions backward compatible with defaults.
   - `buildSession` writes the per-document view state; bootstrap restores it into `viewByDoc`.
   - Clamp invalid page/zoom/fit values. View state never writes into `document.json`.
   - Switching layout/mode preserves focus, selection, collapse, continuous scroll, current page,
     zoom/fit.
6. **Rename and remove old references.**
   - Remove `DocumentMode`, `mode`, `activeDocumentMode`, `setActiveDocumentMode`,
     `openBlockInReader`, `reader-view` palette entry, "Reader view" labels.
   - New actions/selectors: `activeDocumentLayout`, `setActiveDocumentLayout`,
     `activeInteractionMode`, `setActiveInteractionMode`, `toggleActiveInteractionMode`,
     `openBlockInContinuous`.
   - User-facing strings: **Continuous**, **Page**, **Edit**, **Read**, **Open in continuous
     editor**. "Reader" remains only in historical docs or "concurrent readers" (file locks); no
     user-facing "Reader".
   - Rename CSS/data attributes: `nf-reader-surface` → `nf-continuous-surface`,
     `data-reader-surface` → `data-continuous-surface`, `data-reader-empty` →
     `data-continuous-empty`, `nf-page-open-reader` → `nf-page-open-continuous`,
     `data-page-open-reader` → `data-page-open-continuous`.
   - Update code comments that call the continuous layout "reader"; use "continuous editor" or "Read
     mode".
   - Update tests/assertions/strings. File names may stay historical (`m4b1-page-view`) but test
     descriptions and state assertions must use the new model. No test deletion.
7. **Do not implement** Page Edit (single-block overlay), continuous page-break markers, PDF, or
   collapse changes. Do not change the page layout/PDF geometry.

## Tests

- Unit: state defaults and legacy-session fallback; layout/mode setters; session serialization/restore;
  invalid page/zoom/fit clamp.
- UI:
  - default Continuous + Edit;
  - `⌘2`/`⌘3` switch layouts; status labels; Page forces Read; Page Edit disabled;
  - `⌘E` toggles Continuous Read/Edit; no contenteditable in Read; selection/scroll preserved;
  - no undo entry from a mode switch;
  - Page "Open in continuous editor" focuses the block and returns to Edit;
  - Page Read geometry/labels/screenshots unchanged;
  - session reload restores layout/mode/page/zoom/fit.
- Update existing `m4b1-page-view` and shell/e2e/visual assertions. Run `check:boundaries`,
  `typecheck`, targeted vitest, `npm test`, `test:ui`, `test:recovery:run`, `e2e:critical`, one
  `verify:fast`.

## Guardrails

- No Page Edit, no markers, no PDF, no new dependency.
- Do not change spec/UX/ADR/plan; docs are handled separately.
- Do not modify the product-owner showcase.
- Do not merge or push.

## Deliverable

Report `docs/reports/m4b1a-editor-layouts-modes.md`: worktree/branch/base/commit, taxonomy, state/
session schema, Continuous Read behavior, Page Edit seam, files, tests/timings, changed expectations,
screenshots of Continuous Edit/Read and Page Read, risks, not verified. Stop and ask if Continuous
Read cannot be implemented without breaking selection/scroll, or if Page Edit needs a product decision
before the seam is usable.
