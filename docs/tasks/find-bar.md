# Phase 6 — find bar (`⌘F`)

**Role:** Implementer / Builder
**Phase:** 6 (post-A–F, find bar only)
**Base:** `main` at delegation
**Worktree:** created by the delegate; one commit; no merge or push
**UX:** `docs/ux.md` F13 (search and navigate)
**Timebox:** 2 days

## Product model

`⌘F` opens a **find bar** over the current surface. It searches the **open document**, not the
library, and is a navigation tool, not a query language.

## Scope

- `⌘F` opens/closes the find bar at the top of the current surface; focus in the input; `Esc` closes
  and restores the previous selection.
- Search fields: block text, code text, LaTeX source (inline and block), anchor quotes, branch
  labels, chapter titles. Case-insensitive; no regex in v1.
- Results grouped by chapter/block with a breadcrumb and a short snippet; a count of matches.
- `Return` / `⇧Return` (and `⌘G` / `⌘⇧G`) cycle next/previous.
- On navigation: scroll to the hit, switch layout/mode only if needed, select the block; in
  Continuous highlight the matching text; in Page go to the page that contains the fragment and
  select/highlight the block.
- Collapsed content is searchable; selecting a hit expands the ancestors in the outline/tree.
- No replace UI in v1; no search across documents; no query syntax; no regex.
- Read mode: search and navigation only; no mutation.
- Performance: 300/1,000 blocks without blocking typing; debounce the query; no per-keystroke full
  audit.

## Not in scope

- Library-wide search, tags, backlinks, filters, regex, replace.
- A search palette or query language.
- The Document health/activity-bar surfaces.

## Files

`apps/desktop/src/renderer/src/shell/FindBar.tsx` (new), `Workspace.tsx`/`App.tsx` (mount), `actions.ts`
(open/focus/next/prev), `state/shell.ts` (find state if needed), `editor/` search helper or a shared
lib, `page/` navigation helper, `styles.css`, tests. Reuse the document model; do not add a search
index in v1.

## Tests

- Unit: query matching across block/code/LaTeX/anchor/label/chapter; case-insensitivity; no regex
  interpretation; snippet/breadcrumb; collapsed ancestors.
- UI: `⌘F` open/close, count, next/prev/Return/Shift+Return/⌘G, Esc restores selection; Continuous
  hit scroll/highlight; Page hit page/locate; collapsed content expands; Read mode; no document.
- Performance: 300 blocks and 1,000 blocks query latency; no fixed sleeps/native dialogs.
- No schema/settingsVersion/Page/PDF/export/showcase change.

## Acceptance

- [ ] Find bar works in Continuous and Page, Edit and Read, with the specified fields.
- [ ] Keyboard cycle and Esc restore; collapsed content expands.
- [ ] No library/global search, no regex, no replace.
- [ ] 300/1,000-block query remains responsive; screenshots; existing assertions not weakened.
- [ ] No full verify; the Orchestrator runs it at 4.

## Report

- `docs/reports/find-bar.md`: summary, files, checks with timings, PASS/FAIL, risks, next. One
  commit; worktree/branch/head.
