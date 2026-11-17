# M4b1b1 — Page Edit content overlay

**Role:** Implementer / Builder  
**Worktree:** `a builder worktree`  
**Branch:** `t3/m4b1b1-page-edit-overlay`  
**Base:** `ceb20d2` (`docs: launch Page Edit content overlay`)  
**Implementation commit:** `fff181ee8286dfdbeb9aea8ab2902654aea43664`  
**Report commit:** branch head after this file (report + final overlay test hardening; product code is
`fff181e`)  
**Status:** implementation, tests, screenshots, and gates complete; not merged, not pushed

## Summary

Page Edit is now a real opt-in writing surface. Page still opens in **Read** on a layout switch;
`⌘E` or the status bar can enter **Page Edit**. Double-click or `Enter` on a page fragment opens one
active rich-text overlay for that block. The overlay reuses the continuous editor's content
schema/extensions and commit command, so paragraphs, headings, lists, blockquotes, code, math,
tables, marks, anchor marks, and existing images round-trip through the same canonical content.

The page behind the overlay is unchanged A4 geometry from the shared page model. Typing never
touches the canonical document or re-paginates; one commit produces one `block.editContent`
structural entry and the shared model re-paginates. Page Read remains the exact read-only proof and
never mounts an editor.

```text
PageView (same fragments, same page model)
  -> fragment click selects; double-click/Enter opens
  -> PageBlockEditor (one active TipTap editor)
       content: same blockBodyContent projection
       schema: createEditorExtensions() (same nodes/marks/extensions)
       typing: local ProseMirror history only, no runtime writes
  -> commit (outside/Esc/⌘Enter/page nav/mode/layout/block/save/close/quit)
       blockContentFromEditorJson() -> withBody() -> runtime.editBlockContent()
       -> block.editContent command (one structural inverse)
       -> revision bump -> usePageModel() re-paginates
```

## Architecture

### State and mode

- `apps/desktop/src/shared/view-state.ts`: explicit `page + edit` is preserved. Unknown/missing
  interaction modes normalize to Page Read and Continuous Edit. A new Page layout switch still sets
  Read; re-selecting Page never resets an explicit Page Edit.
- `state/shell.ts`: `setDocumentInteractionMode` accepts Page Edit; `setDocumentLayout` keeps the
  “Page opens Read” rule.
- `lib/editability.ts`: `editingEnabledFor` remains Continuous-only for shell/palette/sidebar/menu/
  undo gating; new `pageBlockEditingEnabledFor` is the separate overlay predicate.
- `shell/StatusBar.tsx` and `actions.ts`: the status toggle and `⌘E` work in Page; the palette now
  always exposes Edit/Read.
- Actions commit the active overlay before layout/mode switches, `Open in continuous editor`, save,
  tab close, and app flush.

### The one active overlay

- `page/page-edit-state.ts`: per-document registry of the single active overlay handle. Shell
  actions and `PageView` call `commitPageEdit(packagePath)` before a view transition. No document
  content lives in the registry.
- `page/PageView.tsx`: keeps one `editSession` (block ID + the clicked fragment's page box). Fragment
  double-click/Enter opens it in Page Edit; Page Read keeps the existing Continuous bridge. The
  overlay is rendered as a sibling of the sheet inside the zoomed `nf-page-sheet-wrap`, positioned
  from `margins + fragment.page` so it uses page-layout pixels and is not clipped by the sheet.
  Page-level single-key shortcuts are skipped while the caret is in the overlay, so `⇧1`/`⇧2`,
  `⌥↑/↓` and PageUp/PageDown cannot swallow punctuation or word navigation.
- `page/PageBlockEditor.tsx`: one TipTap `useEditor` with `createEditorExtensions()` (same schema;
  only the placeholder copy differs). Content comes from `blockBodyContent` with the same known-asset
  projection. The editor focuses without scrolling the body to the end of a spanning block.
- Images use the existing read-only node view. With no runtime bindings the overlay exposes no image
  actions, replace, region, or point authoring.
- Formula double-click editing is suppressed while the overlay is open; formula content still
  renders and round-trips. LaTeX authoring remains a Continuous action in this slice.
- Anchor marks are kept as semantic marks and survive commit; they are not stripped by the adapter.
- `page/segments.ts` now also renders the editor's `bold`/`italic` mark names in the page/print
  segment renderer (the spec's `strong`/`em` spellings remain supported). This makes committed bold
  visible in Page Read, and fixes an adjacent projection mismatch.

### Spanning blocks

When a block spans pages, the overlay opens from the clicked fragment but edits the **whole block
body**, not the fragment slice. It is capped to one page-content height and scrolls internally;
the sheet keeps `overflow: visible`, so the overlay is not clipped by the page edge. The page
behind does not reflow while typing. Opening on page 2 shows the whole block and starts at the
beginning rather than forcing the scroll container to the end. No product decision was required:
pages remain non-structural and one commit re-paginates from the same model.

### Commit rule and undo semantics

- Commit on click outside, `Esc`, `⌘Enter`/`Ctrl+Enter`, Done, page navigation, Edit/Read switch,
  layout switch, selecting another block, `⌘S`, tab close, and quit/flush.
- `Esc` commits; it is not a discard. It closes without a command only when the editor is unchanged
  or was empty when opened and is still empty. If the user deletes all text in a non-empty block,
  that is a real change and is committed. The rule is documented in `PageBlockEditor`.
- One user edit session = one `block.editContent` command = one structural undo entry. An unchanged
  session creates no entry.
- While the overlay is open, ProseMirror's local history owns `⌘Z`/`⇧⌘Z`; the shell does not
  intercept those keys inside the overlay and the canonical document/revision do not change.
- A rejected commit keeps the overlay, its live ProseMirror buffer, and the typed text; an inline
  error names the failure. Canonical content is untouched.
- Page Edit does not enable global undo, shell add/delete/move, block menus, drag/reorder, collapse,
  or palette mutations. The structural entry is available after switching to Continuous Edit, as
  the task requires.

## Editable vs deferred

**Editable in Page Edit (one block at a time):**

- paragraph, heading, bullet/ordered list, blockquote, code block, display/inline math, table, image
  rendering, bold/italic/strike/underline/inline code/link marks, anchor marks;
- Markdown input rules and the existing formatting shortcuts (`⌘B`, `⌘I`, list/heading/code/math
  markdown rules);
- save/reload/undo of the committed block through the existing command layer.

**Deferred (unchanged by this slice):**

- image insert/replace, image alt editing, image region/point anchors;
- anchor creation/repair/removal from Page, formula LaTeX term/whole-formula editing;
- block menus, add/delete/split/merge, drag/reorder, collapse, chapter rename, block label editing;
- shell-level authoring, palette/sidebar mutations, and global undo inside Page;
- multiple simultaneous overlays, PDF, continuous marker changes, resize, new dependencies;
- spec/UX/ADR/plan edits.

## Tests and timings

All commands were run in the worktree after the implementation commit.

| Gate | Result |
|---|---|
| `npm run check:boundaries` | pass: 143 files, 677 imports, 16 rules |
| `npm run typecheck` (desktop) | pass |
| Targeted vitest (`page-edit`, `page-segments`, `editor-layouts-modes`, `read-mode-gating`) | 27/27 |
| `npm test` | 78 files, 779/779 tests, 2.12 s |
| `npm run test:ui` | all 23 suites pass; new M4b1b1 suite 8/8 tests, ~7.5 s |
| `npm run test:recovery:run` | 14/14 |
| `npm run e2e:critical` | 16/16 on rerun; see flake note |
| one `npm run verify:fast` | pass (boundaries, typecheck, 779 unit tests, e2e 16/16) |
| `npm run test:visual:m4b1b1` | pass; screenshots checked |

### New/updated tests

- `apps/desktop/test/page-edit.test.ts`: view-state-independent content round trip through the
  shared projection, unknown root fields preserved, image/asset attrs, marks, anchor marks, empty
  editor detection.
- `apps/desktop/test/page-segments.test.ts`: `bold`/`italic` and `strong`/`em` page rendering.
- `apps/desktop/test/editor-layouts-modes.test.ts`: explicit Page Edit normalization, Page Read
  fallback for unknown/missing modes, new-switch default, session round trip.
- `apps/desktop/test/read-mode-gating.test.ts`: separate Page overlay predicate; shell predicate
  remains Continuous-only.
- `tests/ui/m4b1b1-page-edit-overlay.test.mjs` (8 tests): toggle and status/⌘E; double-click/Enter;
  geometry/model unchanged while typing; click-outside commit + re-pagination; bold/list/math/code;
  read-only images and anchor-mark preservation; page-navigation/mode/layout/block-selection
  commits; `⌘S` save + reload; spanning block scroll; rejected commit keeps text and retries after the
  block is restored; 300-block timing; no page errors.
- `tests/ui/m4b1-page-view.test.mjs` and `m4b1a2-read-mode-gating.test.mjs`: updated Page Edit
  expectations and verified Page Edit still does not enable shell authoring or global undo.
- `tests/visual/m4b1b1-page-edit-overlay.test.mjs`: portrait/landscape Page Read before/after and
  Page Edit overlays at 1440×900 and 960×720.

### 300-block page model

Measured in the UI suite on the seeded `performance` document (300 blocks):

```text
seed 1901 ms; Page Read ready 112 ms
initial page-model run 461 ms (compute 25 ms), 600 measurement calls, 32 pages
overlay typing 42 ms with 0 model runs (no re-pagination)
commit model run 42 ms (compute 25 ms)
```

Typing in the overlay does not trigger a page-model run; one commit triggers exactly one.

## Screenshots

Saved under `artifacts/m4b1b1/` (ignored artifact directory):

- `page-read-landscape-before-1440x900.png`, `page-read-landscape-after-1440x900.png` — visually
  identical page geometry before/after Page Edit; selection ring is view state only.
- `page-edit-overlay-landscape-1440x900.png`, `page-edit-overlay-landscape-960x720.png`
- `page-read-portrait-before-1440x900.png`
- `page-edit-overlay-portrait-1440x900.png`, `page-edit-overlay-portrait-960x720.png`
- `page-edit-spanning-overlay-portrait-1440x900.png`,
  `page-edit-spanning-overlay-portrait-960x720.png`

The screenshots show the overlay as page-anchored editor chrome over the unchanged sheet, including
the internally scrollable spanning-block overlay. Subjective visual judgement remains with the
product owner.

## Risks and follow-ups

- **E2E flake:** one initial `e2e:critical` run hit the existing undo/redo selection timeout in
  `routes undo and redo across text and structural history`; an immediate rerun passed 16/16. The
  failure is unrelated to Page Edit paths, but it should be watched by the Sentinel/orchestrator.
- **Narrow block columns:** the overlay width equals the block's page card width, so a short block in
  a narrow portrait column shows a truncated header title (full title in `title`/`aria-label`).
  Widening it is a product/geometry decision, not made here.
- **Fit-page typography:** at 62% portrait fit the overlay uses the page's 10.5pt text at the same
  zoom, so editing is WYSIWYG but visually small. A separate overlay zoom would be a product
  decision.
- **Paste of an external image** in the overlay is not explicitly blocked; there are no image
  actions, and a pasted node without an `assetId` becomes the existing labeled placeholder on
  commit. Image authoring remains deferred.
- **Root `Enter` for a selected block not on the current page** falls back to Continuous Edit; the
  overlay opens only from a fragment on the visible page.
- **Global undo inside Page Edit** remains disabled by design; the committed block is undone from
  Continuous Edit.

## Not verified

- Manual VoiceOver pass and subjective visual judgement (product owner).
- Dedicated e2e coverage for tab-close/quit while an overlay is open (implemented in the commit
  path; save/reload is UI-tested).
- Commit rejection due to a save/write failure (only a deleted block was exercised); the overlay
  keeps text on any rejected command by construction.
- 1,000-block Page Edit and long-session memory profiling.
- Screen recording (product owner only).

## Next suggested step

Sentinel review of this slice, then a product-owner visual/VoiceOver pass. M4c PDF can consume the
unchanged Page Read geometry; no paginator, PDF, or marker code was touched.
