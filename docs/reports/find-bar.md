# Phase 6 — Find bar (`⌘F`)

**Role:** Implementer / Builder
**Date:** 15 November 2026
**Brief:** `docs/tasks/find-bar.md`
**Design:** `docs/design/find-bar.md`, lab `docs/design/find-bar-ui-lab/index.html`
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-833dabf3-a78c7810fe4373a9`
**Base:** `349fb2d` (`docs: find bar v1 brief and decisions`)
**Commit:** `2d4be58` — one worktree commit (not merged, not pushed)

## Summary

### A. Search engine (pure) — done

`apps/desktop/src/renderer/src/lib/find.ts`: one linear, read-only pass over the canonical
document. No index, no mutation.

- Fields: block text (text nodes), code text (code blocks), LaTeX source (inline and display),
  anchor quotes, branch labels, chapter titles. Nothing else (image alt text and table chrome are
  not searched).
- Case-insensitive and literal. `literalRanges` is a per-code-point scan for the rare
  astral/case-fold case and a lowercased `indexOf` scan otherwise; `.*` and `a\d` match their own
  characters, never a pattern.
- **One result per occurrence.** The result carries `id`, `kind`
  (`text`/`code`/`formula`/`anchor`/`label`/`chapter`), `field` (`text`/`code`/`formula`/`quote`/
  `label`/`chapter`), `blockId`, `chapterId`, optional `anchorId`/`branchId`, code-point
  `start`/`end`, `occurrence` (0-based index among the block's text-node matches) and a one-line
  `snippet` (≈ 40 code points of context; the bar never renders it, the sidebar will).
- Anchor mapping: a text match inside the anchor's **bound** projection range is an `anchor`
  result with its anchor id; a code match inside the anchor's code offsets and a formula match
  inside the anchor's formula range do the same. A stored quote with **no content binding**
  (`inspectAnchorBinding().presence === 'none'`) is an `anchor` result on the record, so a lost
  quote is still findable and never double-counts the bound text.
- Chapter titles and branch labels are one result each; a label belongs to the branch **source**
  block and sits right after that block's content, before its children.
- Order is the outline order (D3): chapters, the chapter title, the top-level blocks, then each
  block's children depth-first with anchored children before direct children. The child order is
  rebuilt from one branch pass with cached `resolveAnchor` resolutions (`directChildIds` would
  rebuild the branch list per block, which is quadratic); `findReadingOrder` is asserted equal to
  `flattenBlocks` for nested/anchored/chapter fixtures.
- Cap: `FIND_RESULT_LIMIT = 100`; the report carries `total` (every occurrence) and `truncated`.

### B. The bar — done

`apps/desktop/src/renderer/src/shell/FindBar.tsx`, mounted once in `Workspace` inside
`.nf-canvas-panel` (which now has `position: relative`).

- 360 × 40, `top: 44px` (canvas header 34 + 10) and `right: 10px`, 8 px radius, shadow; absolutely
  positioned over the note. It never joins the canvas flow and never re-fits the Page; it is not in
  the print surface or the PDF.
- Anatomy is exactly query + count + previous/next + close. Input 28 px, placeholder and
  `aria-label` "Find in note"; `role="search"`; count `1 of 4` / `1 of 100+` / **No results** with
  `aria-live="polite"`; 28 px icon buttons disabled at 0; `×` closes. No toggles, no menu, no panel.
- `⌘F` opens and focuses; a second `⌘F` re-focuses and selects the query but keeps an in-progress
  draft (a quick double press cannot revert typed characters). With no note (library, no tab) or a
  Markdown guest file it does nothing. The session keeps the last query; opening selects it.
- Debounce `FIND_DEBOUNCE_MS = 140`; one scan per settled query and per committed document
  revision. No per-keystroke audit, no layout measurement.

### C. Matching, navigation, highlight — done

- On a query change the first occurrence becomes current; the count updates; the view moves.
- **Continuous**: `FindHighlightExtension` (`editor/find-decorations.ts`) is a plugin whose state is
  the query plus the current block/occurrence; `props.decorations` marks every match
  (`class="nf-find-hit"`) and the current one (`nf-find-hit-current` + `data-find-current="true"`).
  It is plugin state only: no document change, no history entry, cleared with a `null` meta when
  the bar closes, and rebuilt on a document edit.
  Ranges are re-derived from the editor's own text nodes (`literalRangesUtf16`, UTF-16 offsets
  for ProseMirror) instead of translating model offsets, so no new projection API is needed: the
  block occurrence index is the whole mapping. Hits with no text node (chapter title, stored
  quote, branch label) rely on the block selection ring, which `runtime.selectBlock` already
  draws; formula source cannot be word-highlighted because KaTeX renders it (documented follow-up).
- Jumping expands collapsed ancestors through the existing `runtime.expandAncestors`, selects the
  block, and scrolls the card into view (`scrollIntoView({ block: 'center' })`) **without** moving
  focus into the editor, so the bar keeps the caret.
- **Page**: `PageView` resolves the page that holds the hit's fragment from its own page model and
  sets `currentPage` once per new hit (a later manual page change does not snap back). The fragment
  gets `data-find-current="true"` and a 2 px accent-strong ring. No word highlight inside the page
  (CSS Custom Highlight API is the follow-up), no zoom change, and the print model never sees the
  attribute or a search.
- **Read mode**: works, navigation only. `Esc` clears the highlight, restores the block/anchor
  selection saved when the bar opened (not the last hit) and returns focus to the editor — or to
  the Page surface when the Page layout is showing.
- Keyboard: `Esc` close, `↵` next, `⇧↵` previous, `⌘G`/`⌘⇧G` next/previous (only while the bar is
  open), `↑`/`↓` next/previous, `Home`/`End` first/last, `Tab` leaves the bar. The bar is not an
  overlay owner, so `⌘G` keeps working while the query field has focus; a dialog above it still owns
  every command (`overlayOwnsCommands`).
- `⌘F` does not collide with a native accelerator: the custom menu (`src/main/menu.ts`) has no
  Find item and Electron has no built-in find UI, so the renderer keydown is the only path. The
  Settings → Editor shortcut list (Help → Keyboard shortcuts) gained `Find in note ⌘F` and
  `Next / previous match ⌘G / ⇧⌘G`.

### D. Chip size fix — done

`.nf-callout-quote` now has `min-height: 20px`, `font-size: 11px` and `line-height: 1.2` (so the
20 px box is exact and a KaTeX chip may still grow); `.nf-callout-quote-code` follows at 11 px. The
state chip (`.nf-callout-state`) and the reference chips (`.nf-ref-chip`) stay 20 px / 10.5 px.

## Files changed

- `apps/desktop/src/renderer/src/lib/find.ts` — new: pure engine, literal matching, snippets,
  reading order, cap.
- `apps/desktop/src/renderer/src/editor/find-decorations.ts` — new: decoration plugin + extension.
- `apps/desktop/src/renderer/src/shell/FindBar.tsx` — new: the floating bar.
- `apps/desktop/src/renderer/src/state/shell.ts` — find session state
  (`findOpen`/`findQuery`/`findResults`/`findTotal`/`findTruncated`/`findIndex`/`findFocusRequest`,
  actions, `currentFindResult`/`useCurrentFindResult`).
- `apps/desktop/src/renderer/src/actions.ts` — `openFind`, `closeFind`, `findNext`,
  `findPrevious`, `navigateToFindResult`, `findSearchDocument` (editor bodies over canonical).
- `apps/desktop/src/renderer/src/App.tsx` — `⌘F`/`⌘G`/`⌘⇧G`/`Esc` in the global keydown; find state
  in the test bridge.
- `apps/desktop/src/renderer/src/editor/DocumentEditor.tsx` — pushes the highlight into the editor.
- `apps/desktop/src/renderer/src/editor/extensions.ts` — registers `FindHighlightExtension`.
- `apps/desktop/src/renderer/src/page/PageView.tsx` — find page navigation + block ring.
- `apps/desktop/src/renderer/src/shell/Workspace.tsx` — mounts `FindBar` in the canvas panel.
- `apps/desktop/src/renderer/src/shell/SettingsDialog.tsx` — two shortcut rows.
- `apps/desktop/src/renderer/src/styles.css` — bar, hits, Page ring, `position: relative` on
  `.nf-canvas-panel`, quote chip fix.
- `apps/desktop/test/find.test.ts` — new: engine, order, anchors, cap, latency, decoration.
- `apps/desktop/test/card-chrome-css.test.ts` — the three-chip 20 px contract.
- `tests/ui/find-bar.test.mjs` — new suite (8 tests, 5 screenshots).
- `tests/ui/suites.mjs` — new suite in `FILES`, the `shell` and `page` groups.
- `tests/ui/ui-editor-shortcuts.test.mjs` — `ALL_ROWS` 24 → 26 for the two new rows.
- `docs/reports/find-bar.md` — this report.

No schema, settings, Page geometry/layout, PDF, showcase or library change. No new dependency.

## Checks run

| Check | Result |
| --- | --- |
| `npx vitest run apps/desktop/test/find.test.ts` | 18/18 pass; scan 300 blocks **1.61 ms**, 1,000 blocks **2.36 ms** (median of 5, warm) |
| `npx vitest run apps/desktop/test/card-chrome-css.test.ts apps/desktop/test/ui-batch-v-css.test.ts` | 16/16 pass |
| `npx vitest run apps/desktop/test/appearance-css-guard.test.ts apps/desktop/test/design-tokens-css.test.ts` | pass (the Page ring uses the Page-local focus token, so paper isolation holds) |
| `npx vitest run apps/desktop/test/ui-suite-list.test.ts` | 6/6 pass |
| `node --test tests/ui/find-bar.test.mjs` | 8/8 pass, 16.1 s |
| `node --test tests/ui/ui-editor-shortcuts.test.mjs` | pass (shortcut rows 24 → 26) |
| `npm run test:ui:shell` | **18/18 pass**, 110.3 s (1:50.99 wall) |
| `npm run verify:fast` | **exit 0**, 59.1 s: boundaries (263 files / 1270 imports / 16 rules), typecheck, unit **153 files / 1517 tests** 6.28 s, critical e2e **16/16** 45.7 s |

The latency acceptance (300 blocks ≤ 16 ms, 1,000 blocks ≤ 50 ms) is asserted in
`apps/desktop/test/find.test.ts` as the median of five warm runs, so a JIT/CI hiccup cannot flake
the gate but a quadratic regression fails it.

## Acceptance criteria

- [x] `⌘F` opens the bar over Continuous and Page, Edit and Read; `Esc` closes, restores the
      selection and returns focus. (UI: "opens with ⌘F…", "works in Read mode…", "goes to the
      page…", "restores the selection…")
- [x] The bar is exactly query + count + previous/next + close (no toggles/menu/panel);
      360 × 40, 10 px inset, floating. (UI geometry assertion.)
- [x] Count = occurrences; "No results" at 0; arrows disabled.
- [x] All six fields match, case-insensitively, literally; `.*` is not a regex. (Unit.)
- [x] Ordering is DFS/reading order (anchored children before direct children); asserted equal to
      `flattenBlocks`. (Unit.)
- [x] Continuous marks all matches and the current one, scrolls, selects the block; collapsed
      ancestors expand. (Unit decoration suite + UI.)
- [x] Page goes to the page and rings the block; no layout/zoom change. (UI: page 1 → 9,
      `data-find-current`, zoom unchanged.)
- [x] 100-occurrence cap with `total`/`truncated`; 300/1,000-block latency within budget.
- [x] Chip heights aligned (quote 20 px / 11 px; state and reference 20 px / 10.5 px); CSS test
      plus a live measurement of all three.
- [x] `npm run verify:fast` green; the find suite is in the `shell` and `page` groups; screenshots
      under `artifacts/find-bar/`.
- [x] No pageerror; no editor/library/settings/Page/PDF regression in the suites run.

## Screenshots (`artifacts/find-bar/`)

`bar-with-results.png`, `no-results.png`, `page.png`, `read.png`, `collapsed-hit.png`.

## Risks / limitations

1. **Word highlight scope.** Only block text and code are marked in Continuous. A formula-source,
   stored-quote, branch-label or chapter-title hit moves the view and selects the block (the block
   ring is the cue) but has no word to mark. The design's Page exact-word highlight is the
   documented follow-up (CSS Custom Highlight API) and is not in this slice.
2. **Search source.** The query runs over the canonical document with the editor buffer's bodies
   merged in, so freshly typed text is found before the idle content commit. The merge is one extra
   walk of the editor document per settled query; the measured 300/1,000-block budget covers the
   engine, not the merge. On a 1,000-block note this is still well inside a keystroke budget, but it
   is measured only in the UI smoke, not asserted.
3. **Occurrence alignment under an uncommitted edit.** The decoration counts text matches inside the
   block; if the buffer temporarily has more matches than the model before the current one, the
   strong mark can land one match off until the commit. With the merged search document this needs
   a mid-type change of the search basis to happen at all.
4. **Empty query** shows "No results" (the literal acceptance wording) rather than a blank count.
5. **Tab switch** while the bar is open closes it only when the new surface has no note (a Markdown
   guest); a switch between two notes re-runs the scan on the new note and keeps the query, which is
   arguably useful but not specified — a Sentinel may want an explicit decision. The Escape restore
   point is document-scoped (`packagePath` + block existence), so it can never select a block id
   from another note.
6. `⌘G` with the bar closed is a no-op (no search to move through); nothing else claims it. Next and
   previous **wrap around** at the ends (browser-find behaviour); the design does not state either
   way.
7. `.nf-canvas-panel` gained `position: relative`; the shell/Page groups re-run to prove the
   geometry and the Page cards are unchanged.
8. No command-palette entry: the design names `⌘F` as the bar's entry and the sidebar Search as the
   browsing view, so a palette row would be new scope. Easy to add later through
   `paletteCommands`.

## Next step

The sidebar Search section (the next slice) reuses `findInDocument` and the `snippet` field; it only
needs the browsing view, the chapter/block grouping and the shared current index. The Page
exact-word highlight (CSS Custom Highlight API) is the follow-up that closes the last field-highlight
gap without touching the PDF.
