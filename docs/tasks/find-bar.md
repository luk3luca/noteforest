# Find bar (`⌘F`) — v1

**Role:** Builder
**Phase:** 6 (find bar only; the sidebar Search is the next slice)
**Base:** HEAD of `main` (the docs commit that adds this brief)
**Worktree:** provided by the orchestrator harness; work only there
**Timebox:** 2 days

## Context

`⌘F` opens a find bar over the current surface and searches the open note. The approved design is
`docs/design/find-bar.md` and the lab `docs/design/find-bar-ui-lab/`; this brief is the code slice
for the **bar** only. The sidebar Search view is designed but not built here.

The bar is deliberately the VS Code widget minus the toggles: query, `1 of 4`, previous/next,
close. No case toggle, no whole-word, no regex, no options menu, no results panel.

## Goal

`⌘F` finds every occurrence of a literal, case-insensitive query in the open note, shows the count,
and moves through the occurrences in document order, highlighting them in Continuous and going to
the block's page in Page.

## In scope

### A · Search engine (pure)

1. A pure search over the document model, in `lib/find.ts` (or an equivalent shared module), with
   unit tests. Fields: block text, code text, LaTeX source (inline and block), anchor quotes, branch
   labels, chapter titles. Case-insensitive; literal; no regex interpretation.
2. **One result per occurrence.** A text match inside an anchor's range is an **Anchor** result with
   its anchor id; a stored quote that is no longer in the content is an Anchor result on the record.
   A chapter title and a branch label are one result each and select their chapter/source.
3. **Document order**: chapters, top-level blocks, then children depth-first with anchored children
   before direct children (the outline order), then the next sibling. DFS pre-order, not BFS.
4. A result carries at least: block/chapter ids, kind (`text`/`code`/`formula`/`anchor`/`label`/
   `chapter`), the anchor/branch id when relevant, the rune offset/range, and a one-line snippet
   (the future sidebar uses it; the bar does not render it).
5. Cap at 100 occurrences; the engine reports the total and a `truncated` flag.

### B · The bar

6. `FindBar` mounted in the surface (the workspace main column), absolutely positioned at the
   top-right: 360 × 40, 10 px inset, radius 8, shadow. It floats; it never changes the canvas flow or
   the Page zoom. It is not part of Page/PDF.
7. Input 28 px, placeholder “Find in note”, `aria-label`; the count `1 of 4` (occurrences) or
   **“No results”**; previous/next 28 px icon buttons disabled at 0; close `X`. No toggles, no menu,
   no panel.
8. `⌘F` opens and focuses; when open it focuses and selects the query. `⌘F` in a document without a
   note (library, no tab) does nothing. `.md` guest files are out of v1.
9. The bar keeps the last query for the session; opening selects it.

### C · Matching, navigation, highlight

10. Debounce 120–150 ms; one linear scan per query; no index.
11. On a query change the first occurrence becomes current and the view moves to it; the count
    updates. All matches are marked; the current one is stronger.
12. Continuous: a temporary decoration (ProseMirror plugin) marks the matches in the editor and the
    current one; scroll it into view and select its block. The decoration is cleared on close. Hitting
    a collapsed block expands its ancestors (reuse the Health `expandAncestors` path).
13. Page: go to the page that contains the block fragment and **ring the block**; the page keeps its
    zoom. The exact-word highlight inside the page is a follow-up (CSS Custom Highlight API).
14. Read mode: the bar works, navigation only; no editing chrome. `Esc` closes and restores the
    selection saved when the bar opened, and returns focus to the editor.
15. Keyboard: `Esc` close; `↵` next; `⇧↵` previous; `⌘G` / `⌘⇧G` next/previous; `↑`/`↓` next/previous
    (the current row is the same); `Home`/`End` first/last; `Tab` leaves the bar. `aria-live` count.
16. No document: the bar does not open. Print/export hidden test hooks stay off the bar.

### D · Chip size fix

17. Align the callout chips: `.nf-callout-quote` gets `min-height: 20px` and `font-size: 11px`; the
    state and reference chips stay 20 px / 10.5 px (they already are). Add/extend the CSS test so the
    three chips are 20 px high at rest; the quote may grow for KaTeX formulas.

### E · Tests and evidence

18. Unit: the fields, case-insensitivity, literal text (a `.*` query matches the characters), every
    occurrence, the DFS order with a nested/chapter example, anchor mapping, chapter/branch results,
    the 100 cap.
19. UI: `⌘F` open/close; count; arrows, `↵`/`⇧↵`, `⌘G`/`⌘⇧G`; all matches + the current stronger;
    scroll; a collapsed hit expands; Page goes to the page and rings the block; Read mode; no
    document; `Esc` restores the selection and focus; the chip heights.
20. Performance: 300 and 1,000 blocks, query latency within the design budget (16 ms / 50 ms on the
    dev machine); no per-keystroke audit, no layout measurement.
21. Screenshots under `artifacts/find-bar/`: bar with results, no results, Page, Read, collapsed hit.

## Out of scope

- The sidebar Search view (next slice), the Page exact-word highlight, replace, regex, accent
  folding, `.md`, library-wide search, the copy sweep/dialog work.
- Any schema, settings, Page geometry, PDF, showcase or library change.

## Files

Read:
- `docs/design/find-bar.md`, `docs/design/find-bar-ui-lab/`
- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx` (the editor projection, anchors)
- `apps/desktop/src/renderer/src/editor/extensions.ts` (decorations)
- `apps/desktop/src/renderer/src/state/shell.ts`, `actions.ts` (keymap/dialogs)
- `apps/desktop/src/renderer/src/page/PageView.tsx`, `page/print-model-registry.ts` (page lookup)
- `apps/desktop/src/renderer/src/lib/document-health.ts`, `lib/tree.ts` (read order helpers)
- `apps/desktop/src/renderer/src/shell/Workspace.tsx` (surface mount)

Expected to touch: a new `FindBar.tsx`, a new search lib and a decoration plugin, `App.tsx`/
`Workspace.tsx`, `actions.ts`, `state/shell.ts`, `styles.css`, `PageView.tsx`, tests,
`docs/reports/find-bar.md`.

## Acceptance criteria

- [ ] `⌘F` opens the bar over Continuous and Page, Edit and Read; `Esc` closes, restores the
      selection and returns focus.
- [ ] The bar is exactly query + count + previous/next + close; no toggles, no menu, no panel.
- [ ] Count = occurrences; “No results” at 0; arrows disabled.
- [ ] All six fields match, case-insensitively, literally; `.*` is not a regex.
- [ ] Ordering is DFS/reading order (anchored children before direct children).
- [ ] Continuous marks all matches and the current one, scrolls, selects the block; collapsed
      ancestors expand.
- [ ] Page goes to the page and rings the block; no layout/zoom change.
- [ ] 100-occurrence cap; 300/1,000-block latency within budget.
- [ ] Chip heights aligned (20 px; quote font 11); CSS test.
- [ ] `npm run verify:fast` green; `npm run test:ui:shell` green; screenshots.
- [ ] No pageerror; no regression in editor/library/settings/Page.

## Tests and evidence

- Targeted: `npm test` (search lib + decoration), `npm run build && npm run test:ui:shell`, the
  find-bar UI suite (new), the Page group.
- End of task: `npm run verify:fast`.
- Screenshots as in E21.
- No native dialogs, no fixed sleeps; do not weaken existing assertions.

## Stop and ask

- if the model→ProseMirror range mapping is not 1:1 and needs a new projection API;
- if `⌘F` collides with a native accelerator or the browser's find;
- if the Page ring cannot be applied to the fragment without touching the print model;
- if the DFS order helper does not exist and the outline order would need a new one;
- on any schema/settings/Page/PDF change.

## Report format

Summary, files changed, checks with timings, acceptance criteria pass/fail, risks, next step. Write
`docs/reports/find-bar.md`, commit once in the worktree, do not merge, and report the worktree path
and the commit hash.
