# M4b1a — editor layouts and modes

**Role:** Implementer / Builder  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-f59b997c`  
**Branch:** `t3/editor-layouts-and-modes`  
**Base:** `75c75eb` (`docs: adopt editor layouts and modes (ADR-0007)`)  
**Implementation commit:** `98ef306823491900366565a4b09d8bfd8e8b1c64`  
**Report commit:** branch head after this file  
**Status:** implementation, tests, screenshots, and one `verify:fast` complete; not merged, not pushed

## Summary

Split the document view taxonomy into two independent axes, implemented Continuous Read, made Page
Read the current page surface with a disabled Page Edit seam, and persisted per-document view state
through the shell session.

```text
DocumentLayout      'continuous' | 'page'
InteractionMode     'edit' | 'read'
Default             continuous + edit
Page layout         always opens in read (Page Edit is a later slice)
```

The continuous ProseMirror surface stays mounted in Read. Editability is the only switch: selection,
caret, scroll, zoom, links, anchors, reference navigation, outline navigation and copy remain
available, while authoring chrome disappears and no undo/history entry is created. The page layout
keeps the M4b1 renderer, measurement, fragments, pagination, zoom/fit and geometry unchanged.

## Taxonomy and state

`apps/desktop/src/shared/view-state.ts` is the single source for the axes, defaults, and clamps.

| Type | Values |
|---|---|
| `DocumentLayout` | `continuous`, `page` |
| `InteractionMode` | `edit`, `read` |
| `PageFit` | `page`, `width`, `none` |

`DocumentViewState` now has `layout` and `interactionMode`; the old `mode` field is removed.

```ts
interface DocumentViewState {
  zoom: number;                 // continuous surface, 0.5..2
  focusBlockId: string | null;  // view-only focus anchor
  layout: DocumentLayout;       // default continuous
  interactionMode: InteractionMode; // default edit; page normalizes to read
  currentPage: number;          // >= 1
  pageZoom: number;             // 0.1..2.5
  pageFit: PageFit;             // default page
}
```

Rules enforced in the store:

- `setDocumentLayout('page')` forces `interactionMode = 'read'`.
- `setDocumentLayout('continuous')` returns to the default `edit`.
- `setDocumentInteractionMode('edit')` is rejected while `layout === 'page'`; Page always stays Read.
- Every numeric view value is clamped through the shared helpers; `openTab` seeds a default view
  entry so a document always has an explicit Continuous + Edit state.
- Invalid values in legacy/corrupt sessions normalize to safe defaults.

Actions/selectors:

- `activeDocumentLayout` / `setActiveDocumentLayout`
- `activeInteractionMode` / `setActiveInteractionMode` / `toggleActiveInteractionMode`
- `openBlockInContinuous` replaces `openBlockInReader`

## Session schema

`SessionTabState` gained optional fields:

```ts
layout?: DocumentLayout;
interactionMode?: InteractionMode;
currentPage?: number;
pageZoom?: number;
pageFit?: PageFit;
zoom?: number;
```

- `buildSession` writes the per-document view state plus the existing scroll, selected block, and
  collapse state.
- Bootstrap restores the normalized view state into `viewByDoc` before tabs/editor surfaces mount.
- `readSession` (main process) is backward compatible: missing fields become Continuous + Edit,
  Page always normalizes to Read, page numbers clamp to `>= 1`, page zoom to `0.1..2.5`, continuous
  zoom to `0.5..2`, and unknown fits become `page`.
- View state never enters `document.json`.
- `PageView` no longer clamps a restored current page against the loading model; the clamp runs after
  the first derived page model, so a Page-layout session can restore page N.

## Continuous Read behavior

- The ProseMirror surface stays mounted; `contentEditable` becomes `false` and the editor exposes
  `aria-readonly="true"` / `Document body, read mode`.
- `setEditable(..., false)` is called with the synthetic update suppressed, so a mode switch cannot
  create a text-history entry.
- Entering/leaving Read captures and restores the continuous scroll position around the
  `contenteditable` toggle (Chromium can scroll the caret into view when the attribute changes).
- Focus is restored on return only when the editor owned it when Read started, and only for a
  Continuous Read/Edit toggle (never across a Page layout return, where page selection owns the
  restore path).
- Hidden chrome: gutter drag/menu button, add-child/add-sibling controls, chapter add buttons,
  canvas add-chapter button, selection toolbar, image authoring controls, and block/chapter/
  reference edit context menus.
- Flow footers (chapter/canvas) use `visibility: hidden`, not `display: none`, so hiding them does
  not shrink the scroll height and clamp the preserved scroll position.
- Remaining navigation: click selection, caret/selection state, scroll, zoom, Fit, Focus, links,
  anchor markers, reference chips, outline/sidebar navigation, and keyboard copy.
- Read mode does not touch save/autosave; it only stops editor edits.

## Page Read / Page Edit seam

- `PageView` accepts `interactionMode` and exposes `data-interaction-mode`; only Read is implemented.
  There is no fake editable page and no second paginator.
- The status bar shows Edit as disabled in Page with the title
  “Page editing is not available yet. Switch to Continuous to edit.”
- `⌘E` in Page announces the same message with a toast and keeps `interactionMode = 'read'`.
- The page toolbar and empty/error placeholders say **Open in continuous editor** and switch to
  `continuous` + `edit`, then select/focus the block.
- Page Read geometry, fragments, continuation/ghost markers, placeholders, zoom/fit and keyboard
  navigation are unchanged except labels/attributes.

`⌘E` is Command-only. Control+E remains the editor's native end-of-line key because a UI test and
ProseMirror use it; an earlier `metaKey || ctrlKey` implementation broke that flow.

## Rename map

| Before | After |
|---|---|
| `DocumentMode = 'reader' \| 'page'` | `DocumentLayout` + `InteractionMode` |
| `DocumentViewState.mode` | `layout`, `interactionMode` |
| `activeDocumentMode` / `setActiveDocumentMode` | `activeDocumentLayout` / `setActiveDocumentLayout`; interaction selectors added |
| `openBlockInReader` | `openBlockInContinuous` |
| `reader-view` palette entry / “Reader view” | `continuous-layout` / “Continuous layout”; mode toggle entry in Continuous |
| “Page view” labels | “Page layout” / “Page” |
| `nf-reader-surface` | `nf-continuous-surface` |
| `data-reader-surface` | `data-continuous-surface` |
| `data-reader-empty` | `data-continuous-empty` |
| `nf-page-open-reader` | `nf-page-open-continuous` |
| `data-page-open-reader` | `data-page-open-continuous` |
| `data-view-mode="reader\|page"` | `data-view-layout="continuous\|page"` + `data-view-interaction="edit\|read"` |
| `data-mode` on `.nf-editor` | `data-layout` + `data-interaction-mode` |

No user-facing “Reader” view label remains. “Screen readers” and the image-dimension file reader keep
their established meanings.

## Files

Created:

- `apps/desktop/src/shared/view-state.ts` — axes, defaults, normalization/clamps shared by renderer
  and main process.
- `apps/desktop/test/editor-layouts-modes.test.ts` — state defaults/setters/clamps, session write,
  legacy/invalid read, round trip.
- `docs/reports/m4b1a-editor-layouts-modes.md` — this report.

Modified:

- `apps/desktop/src/shared/api.ts` — optional session view fields.
- `apps/desktop/src/main/library.ts` — session read normalization/clamps.
- `apps/desktop/src/renderer/src/state/shell.ts` — view-state schema, setters, default entry.
- `apps/desktop/src/renderer/src/state/session.ts` — write view state in `buildSession`.
- `apps/desktop/src/renderer/src/actions.ts` — layout/mode actions, toggle, continuous open, palette.
- `apps/desktop/src/renderer/src/App.tsx` — bootstrap restore, `⌘2`/`⌘3`/`⌘E`, page-routed zoom.
- `apps/desktop/src/renderer/src/shell/StatusBar.tsx` — Continuous/Page and Edit/Read groups.
- `apps/desktop/src/renderer/src/editor/DocumentEditor.tsx` — layout/mode render split, Read
  editability/focus/scroll behavior, chrome, data attributes.
- `apps/desktop/src/renderer/src/editor/editor-ui.ts` — interaction mode mirrored to node views.
- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx` — read-only chapter/block chrome and
  context menus; flow footer retained with hidden visibility.
- `apps/desktop/src/renderer/src/editor/views/ImageNodeView.tsx` — read-only image authoring/menu.
- `apps/desktop/src/renderer/src/page/PageView.tsx` — interaction-mode prop/data, continuous-editor
  wording, session-safe page clamp; geometry untouched.
- `apps/desktop/src/renderer/src/page/adapter.ts`, `segments.ts`, `usePageModel.ts` — terminology.
- `apps/desktop/src/renderer/src/styles.css` — surface rename, Read chrome, disabled status buttons.
- `tests/ui/m4b1-page-view.test.mjs` — renamed assertions; 3 new UI tests.
- `tests/visual/m4b1-page-view.test.mjs` — Continuous Edit/Read and Page Read captures.

## Tests and timings

| Check | Result |
|---|---|
| `npm run check:boundaries` | pass — 137 files, 648 imports, 16 rules |
| `npm run typecheck` | pass — desktop node/web, core, layout, pdf |
| `npx vitest run apps/desktop/test/editor-layouts-modes.test.ts` | 6/6 pass, ~125 ms |
| `npm test` | 74 files / 753 tests pass, 2.16 s (verify:fast run) |
| `npm run test:ui` | 20/20 files, 57/57 tests, no `not ok`; M4b1 file 9/9, 6.2 s |
| `npm run test:recovery:run` | 14/14 pass, 17.3 s |
| `npm run e2e:critical` | 16/16 pass, 35.8 s suite |
| `npm run test:visual:m4b1` | 1/1 pass, 2.28 s suite |
| `npm run verify:fast` | exit 0 — boundaries + typecheck + 753 unit + build + 16 e2e |

New UI coverage:

- default Continuous + Edit; status labels/pressed state; `contenteditable`;
- Continuous Read: no edits, caret/scroll/clamp-preserved state, hidden chrome, no undo entry,
  return to Edit with the same block/caret/scroll/focus;
- Page opens Read; Page Edit disabled with title; `⌘E` announces and does not switch; `⌘2` returns
  Continuous Edit; Page Read has no editable surface;
- click selection still works in Read;
- session round trip of layout, interaction mode, current page, page zoom, page fit, continuous zoom.

## Changed expectations

- Existing `m4b1-page-view` assertions now inspect `layout`/`interactionMode` instead of `mode`, use
  `nf-continuous-surface`, `data-view-layout`, `data-page-open-continuous`, and the new labels.
- Page “Open in reader” is now “Open in continuous editor”.
- `⌘2` from Page restores Continuous **Edit** by default; Page always opens Read.
- `⌘E` is Command-only; Control+E remains ProseMirror's end-of-line.
- A session restored into Page waits for the first derived model before clamping the page, so the
  saved current page survives relaunch.
- Read-mode flow footers keep their box (`visibility: hidden`) to preserve scroll height/position.
- Page layout zoom/fit labels, A4 attributes, pages, fragments, continuation markers and placeholders
  are unchanged.

## Screenshots

Generated by `npm run test:visual:m4b1` (artifacts are gitignored):

- `artifacts/m4b1/continuous-edit-1440x900.png`
- `artifacts/m4b1/continuous-read-1440x900.png`
- `artifacts/m4b1/page-read-landscape-1440x900.png`
- `artifacts/m4b1/page-landscape-1440x900.png`
- `artifacts/m4b1/page-landscape-960x720.png`
- `artifacts/m4b1/page-portrait-1440x900.png`
- `artifacts/m4b1/page-portrait-960x720.png`
- `artifacts/m4b1/page-portrait-continuation-1440x900.png`

The Continuous Read capture shows the same document and scroll position as Continuous Edit with the
gutter, add controls, chapter/canvas footers and selection toolbar hidden. The Page Read capture keeps
the M4b1 A4 sheet, fragments, controls and continuation marker, with Edit visibly disabled in the
status bar.

## Risks and open questions

- **Shell-level authoring is not globally locked in Read.** The editor surface and block/chapter/
  reference edit menus are read-only; sidebar add buttons and command-palette editing commands are
  shell commands and are not all disabled in this slice. If the product expects a hard global lock,
  that needs a separate command-gating pass.
- **Focus restoration is heuristic.** It restores editor focus only if the editor owned it and the
  user has not focused another control; a body/editor active element is treated as “focus lost by the
  editable toggle”.
- **Read scroll preservation is Chromium-timing-sensitive.** The toggle restores the scroll position
  synchronously and again on the next two frames; the UI test asserts the stable position rather than
  a single immediate frame.
- **Page Edit is only a seam.** The prop, store guard, status-bar disabled state and toast exist; there
  is no single-block editor overlay, commit/reflow, or cross-page block handling.
- **Session state does not persist `focusBlockId`**, only the selected block, scroll, collapse and the
  six requested view fields.
- **Historical names remain** in file names (`m4b1-page-view`, `.nf-page-view`) and in existing
  layout/measurement internals; only user-facing labels and the specified attributes moved.

## Not verified

- Product-owner visual judgement, VoiceOver/screen-reader pass, or screen recording.
- Clipboard copy through the OS clipboard in Read (ProseMirror copy stays mounted and selectable, but
  the clipboard path is not asserted in this slice).
- Link activation, anchor-marker activation and reference-chip navigation specifically while in Read
  (their DOM/actions are preserved; existing M3 coverage runs in Edit).
- 300/1,000-block Continuous Read performance and memory.
- Page Edit behavior (explicitly out of scope), continuous page-break markers, PDF/print compositor.
- Full command-palette/sidebar authoring lock in Read (see risks).
- Page layout geometry parity with the PDF (M4c gate; Page Read screenshots/attributes unchanged).

## Next suggested step

Sentinel review against the M4b1a brief and ADR-0007. After that, the next M4b slice can either add
Continuous page-break markers or begin the Page Edit single-block overlay; PDF remains M4c.
