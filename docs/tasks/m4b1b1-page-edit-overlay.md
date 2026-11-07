# M4b1b1 — Page Edit content overlay

**Role:** Implementer / Builder
**Milestone:** M4b — editor layouts and modes
**Base:** current `main` after M4b1c1
**Worktree:** isolated builder worktree prepared by orchestrator v2
**Scope:** enable Page Edit with a single-block rich-text editor overlay. No PDF, image/anchor
authoring, free canvas, or paginator changes.

## Goal

Make **Page + Edit** a real, optional writing surface: click/double-click a block in the paginated A4
layout, edit its formatted content in one active overlay, commit, and let the page re-paginate. Page
Read stays the exact PDF proof; Page Edit uses the same geometry and never becomes a free canvas.

Read:

- `docs/adr/0007-editor-layouts-and-modes.md`
- `docs/spec.md` §6.3/§6.10, AC-29/AC-31/AC-32/AC-33
- `docs/ux.md` Page Edit and Continuous/Page sections
- `docs/reports/m4b1-page-view-core.md`, `docs/reports/m4b1a-editor-layouts-modes.md`
- `page/PageView.tsx`, `page/segments.ts`, `page/usePageModel.ts`, `editor/extensions.ts`,
  `lib/adapter.ts`, `state/runtime.ts`, `shared/view-state.ts`, `lib/editability.ts`

## Required behavior

1. **State / mode.**
   - `interactionMode: 'edit'` is allowed in Page now. Page still **opens in Read** when switching
     from Continuous (no accidental editing), but the user can toggle Edit with `⌘E` or the status
     bar.
   - Persist Page Edit in the session; legacy Page+Edit/unknown values fall back safely (default
     Page Read on a new switch, explicit stored Page Edit allowed).
   - `editingEnabledFor` / shell gating remains Continuous-only for shell/palette commands; add a
     separate Page-block-editing predicate for the overlay. Page Edit does not enable add-block,
     add-child, sidebar add, global undo, or block actions in this slice.
2. **Page Edit overlay.**
   - In Page Edit, clicking a page fragment selects/focuses the block; double-click or Enter opens a
     **single-block editor overlay** for that block. One active editor only.
   - The overlay is anchored to the block's page position, is not clipped by the page edge, and can
     grow/scroll for a block that spans pages. The page behind stays the exact A4 layout; the overlay
     is editor chrome, not a second page layout.
   - Use the same content schema/extensions as the continuous editor for paragraphs, headings,
     lists, blockquotes, code, math, images, tables, marks, and anchor marks. Do not strip anchor
     marks. Images render read-only in this slice; image actions/replace remain Continuous.
   - Support formatted writing via Markdown input rules and the existing keyboard shortcuts
     (bold/italic/code/heading/list/code block/math). A selection toolbar is optional; do not build
     a new formatting system.
3. **Commit / cancel.**
   - Commit on click outside, Esc, `⌘Enter`, page navigation, layout/mode switch, or selecting
     another block. Esc commits (does not discard) unless the editor is empty/invalid; document the
     rule.
   - Commit one block with the existing `block.editContent` command or a runtime method over it.
     One user edit session = one structural undo entry; local ProseMirror history handles text undo
     while the overlay is open.
   - A rejected commit keeps the overlay open with an error; never lose the typed text. A successful
     commit closes the overlay and the page re-paginates from the same page model.
   - Switching to Page Read / Continuous commits first; no keystroke loss, no duplicate editor.
4. **Page Read unchanged.**
   - Page Read remains read-only, exact, and unchanged: no overlay, no contenteditable, no editor
     chrome. Its geometry/fragments/continuation markers/placeholders stay identical.
   - Page Edit and Page Read share geometry; Page Edit must not change block positions until commit.
5. **Accessibility / focus.**
   - Overlay has a label naming the block; focus enters the editor; Esc returns focus to the block.
   - Page navigation remains keyboard-reachable; no focus trap that makes the page unusable.
   - Read mode and Page Read still expose selection/copy/links/anchors.
6. **No scope creep.**
   - No PDF, continuous marker changes, image/anchor authoring in Page Edit, block menus, drag/reorder,
     collapse-in-Page, resize, or new dependency.
   - No spec/UX/ADR/plan edits; report proposals only.

## Tests and evidence

- UI: Page Edit toggle; double-click/Enter opens overlay; type bold/list/code/math; commit by click
  outside/Esc/⌘Enter; page re-paginates; reload preserves content; Page Read has no editor; one
  active overlay; block spanning pages; commit failure path if reproducible; no page errors.
- Unit: view-state normalization (Page Edit allowed, Page Read default on switch); content adapter
  round trip for a block.
- Screenshots: Page Edit with overlay at 1440×900 and 960×720, portrait/landscape; Page Read before/
  after to show unchanged geometry.
- 300-block: report page-model time while editing/committing; typing responsive.
- Gates: check:boundaries, typecheck, targeted vitest, npm test, test:ui, test:recovery:run,
  e2e:critical, one verify:fast.

## Guardrails

- Do not modify the product-owner showcase.
- Do not add a second paginator or CSS re-pagination.
- Do not enable shell-level mutating commands in Page; only the block overlay edits.
- Do not merge or push.

## Deliverable

Report `docs/reports/m4b1b1-page-edit-overlay.md`: worktree/branch/base/commit, overlay architecture,
commit/undo semantics, what is editable vs deferred, tests/timings, screenshots, risks, not verified.
Stop and ask if the single-block editor cannot reuse the content schema without a second editor
implementation, if a block spanning pages needs a product decision, or if Page Edit cannot commit
without losing text on failure.
