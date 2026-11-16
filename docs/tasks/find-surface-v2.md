# Find surface v2 — toolbar cluster + sidebar Search

**Role:** Builder
**Phase:** 6 follow-up (one find surface; the v1 bar is merged)
**Base:** HEAD of `main` (the docs commit that adds this brief)
**Worktree:** provided by the orchestrator harness; work only there
**Timebox:** 2 days

## Context

The `⌘F` bar is merged and floating at the canvas top-right. The product owner wants it **in the
surface toolbar**, in the empty centre of the row that already carries undo/redo, Continuous/Page
and Edit/Read, as one 28 px cluster. The same slice adds the **sidebar Search** view: the matching
engine already exists; this is its persistent, browsing presentation. Design:
`docs/design/find-bar.md`; lab: `docs/design/find-bar-ui-lab/` (section 2 is the toolbar).

## Goal

One find surface: the toolbar cluster is the quick find; the sidebar Search is the browsing view;
they share query, results and the current occurrence.

## In scope

### A · Toolbar placement

1. Move `FindBar` from the floating card into the canvas toolbar, in the centre between undo/redo and
   the layout/Edit-Read controls. One 28 px cluster: field, count (`1 of 4` / “No results”), previous,
   next, close. No card, no shadow, no extra row; the toolbar height does not change.
2. Behaviour, keys and highlights are unchanged: `⌘F` opens/focuses and selects the query; `Esc`
   restores; `↵`/`⇧↵`, `⌘G`/`⌘⇧G`, `↑`/`↓`, `Home`/`End`; Continuous decoration; Page page + block
   ring; Read; no document does nothing; `.md` no-op.
3. At narrow widths the input shrinks before the layout/Edit controls; the count, arrows and close
   stay. Update the geometry/mount tests and the screenshots.

### B · Sidebar Search view

4. Add the **Search** section to the activity bar (fourth icon, after Health, before Settings) and a
   `sidebarTab: 'health' | 'library' | 'outline' | 'search'` value; the session parser accepts it and
   unknown values still fall back to `library`.
5. The view: header `Search`, the count, close; a 28 px input; results grouped by chapter, a block
   title, then one row per **occurrence** with a two-line snippet around the match (the match
   emphasised; code/LaTeX snippets in mono); the current row filled; clicking jumps to the
   occurrence. The view replaces the Outline while active and returns to the previous section on
   close.
6. **Shared find state**: query, results, current occurrence and total are one state, read by the
   toolbar cluster and the sidebar view. Typing in either updates both; the current row and the
   editor/page highlight follow. `⌘F` opens the toolbar, not the sidebar. Opening the Search section
   shows the current query (the last one).
7. Read mode: navigation only. No document: the view says “Open a note to search.” `.md`: “Search is
   available in notes.” No document/`.md` shows no results.
8. The snippets reuse the engine's `snippet`/`start`/`end`/`kind`; no new matching logic.

### C · Tests and evidence

9. Unit: the shared find state (query → results → current, both views), the session `search` value.
10. UI: the toolbar cluster geometry (inside the toolbar, 28 px, no overlay); opening the Search
    section from the activity bar; the results (groups, block title, two-line snippets, emphasised
    match); the current row; clicking jumps (Continuous and Page, Edit and Read); typing in the
    sidebar updates the toolbar and vice versa; close returns to the previous section; no document;
    `.md`.
11. Screenshots under `artifacts/find-surface-v2/`: toolbar cluster with results and “No results”,
    sidebar Search with snippets, the shared state, Page, Read.

## Out of scope

- The Page exact-word highlight (follow-up), `.md` search, replace, regex, accent folding.
- The copy sweep/dialog work; the provisional strings above may be adjusted by the copy plan later.
- Schema, settings, Page geometry, PDF, library, showcase.

## Files

Read:
- `docs/design/find-bar.md`, `docs/design/find-bar-ui-lab/`
- `apps/desktop/src/renderer/src/shell/FindBar.tsx`, `lib/find.ts`, `editor/find-decorations.ts`
- `apps/desktop/src/renderer/src/shell/CanvasHeader.tsx` (the toolbar row), `Sidebar.tsx`
- `apps/desktop/src/renderer/src/state/shell.ts`, `apps/desktop/src/main/library.ts` (session)
- `apps/desktop/src/renderer/src/styles.css`
- `tests/ui/find-bar.test.mjs`, `library-surface.test.mjs`, `v0-shell-frame.test.mjs`

Expected to touch: `FindBar.tsx`, a new sidebar Search view (e.g. `shell/SearchSection.tsx`),
`CanvasHeader.tsx`, `Sidebar.tsx`, `state/shell.ts`, `main/library.ts`, `styles.css`, tests,
`docs/reports/find-surface-v2.md`.

## Acceptance criteria

- [ ] The find cluster lives in the toolbar, 28 px, no card/shadow, no overlay, no row-height change;
      it works in Continuous and Page, Edit and Read.
- [ ] `Esc` restores the selection and focus; all keys and highlights behave as in v1.
- [ ] The Search section is in the activity bar, persists as `search`, accepts the session value, and
      replaces the Outline while active; close returns to the previous section.
- [ ] The results show chapter groups, block title, one two-line snippet per occurrence with the match
      emphasised, the current row filled; clicking jumps.
- [ ] Query/results/current are shared between the toolbar and the sidebar in both directions.
- [ ] No document and `.md` states; Read mode; no pageerror.
- [ ] `npm run verify:fast` green; `npm run test:ui:shell` green; screenshots.
- [ ] No schema/settings/Page/PDF/library change.

## Tests and evidence

- Targeted: `npm test`, `npm run build && npm run test:ui:shell`, the find-bar suite + the new sidebar
  Search cases.
- End of task: `npm run verify:fast`.
- Screenshots as in C11.
- No native dialogs, no fixed sleeps; do not weaken existing assertions.

## Stop and ask

- if the canvas toolbar has no room for a 360 px cluster at the minimum window without hiding a
  control;
- if the shared find state needs a new store outside `state/shell.ts`;
- if the session parser rejects `search` without a migration;
- if the sidebar Search would duplicate the Outline tree state in a way that loses restore;
- on any schema/settings/Page/PDF change.

## Report format

Summary, files changed, checks with timings, acceptance criteria pass/fail, risks, next step. Write
`docs/reports/find-surface-v2.md`, commit once in the worktree, do not merge, and report the worktree
path and the commit hash.
