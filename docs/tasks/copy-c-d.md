# Copy C+D — errors, banners, editor, menus

**Role:** Builder
**Milestone:** copy sweep C+D (the tail after A+B)
**Base:** `f834ca4` (`main` after the copy A+B and find v3 merges).
**Worktree:** provided by the orchestrator harness; work only there
**Timebox:** 4 days

## Base addendum (16 November 2026, before launch)

A+B is merged at `552335c` and find v3 at `2692df0`. Two consequences for this brief:

- **`Details` and D25 already exist** in `shell/Details.tsx` (`Details`, `DetailsDialog`). Use them:
  do not re-create the component, do not change its markup, and do not redesign D25. This batch
  only adds hosts (banners, panels, status) and the toast `Details` action that opens D25.
- **The sidebar Search changed in find v3.** It now has a chapter rule with per-chapter counts,
  label-only headings, occurrence cards in the shared `.nf-result-row`, and the shared `ab`
  whole-word toggle in the header. Item 6 below is a **label alignment only**: the count/empty-state
  wording and the header palette button. Do not touch the hierarchy, the card rows, the `ab` toggle,
  the engine, or the shared state.

## Context

A+B is the frame, the dialogs, Settings and the Details component (brief
`docs/tasks/dialog-copy-a-b.md`). This batch applies the **C** rows (errors, toasts, banners,
recovery, status) and the **D** rows (editor labels, menus, palette, headers, sidebar) of
`docs/design/copy-plan.md`, and finishes the Details data path. The four copy rules and the
dialogs.md decisions are confirmed (16 November 2026): a toast carries one `Details` action that
opens D25; the native menu is sentence case; `document`/`note` keeps the current split.

## Goal

Every user-visible error/toast/banner is one short line with the technical value behind `Details`;
every editor/menu/palette/status label follows the same voice; the native menu is sentence case; the
find v2 labels are aligned. The Builder substitutes the C and D rows verbatim; no judgement calls.

## In scope

### C · Errors, toasts, banners, recovery, status

1. Apply the **C** rows: `main/library.ts`, `main/index.ts`, `main/export-preflight.ts`,
   `main/markdown-file.ts`, `main/backup-restore.ts`, `main/document-settings.ts`,
   `state/runtime.ts`, `actions.ts`, `App.tsx`, `export/export-flow.ts`, the export sheet's failed
   state (A-22.14 short sentences are A, already), `markdown/markdown-save.ts`,
   `shell/StatusBar.tsx`, `SaveFailureBanner`, `DraftMaterializeBanner`, `RecoverySurface`,
   `DocumentStatusPanel`. `DELETE` rows removed; `KEEP` untouched.
2. **Details data path** (dialogs.md §3.5): the failure envelopes gain `details?: string`
   additively (IPC types, no schema bump). Where a message interpolates `errorMessage(error)`,
   `err.message` or a path, the message keeps the short outcome and the value moves to `details`.
   The renderer never composes a technical sentence.
3. **Hosts**: banners/panels put the Details disclosure after the body copy and before the actions;
   the recovery surface keeps its `Reason` row and adopts the component where it fits; a toast
   stays one line and carries one optional `Details` action that opens D25 (the dialog from A+B).
   Only one Details per surface; two values join with ` · `.
4. Rewrite any raw preflight/export technical string that reaches Details so it contains no banned
   word (allowed inside Details only: PID, host, session, lock, `document.json`, `settings.json`,
   mm, pt, px).

### D · Editor, menus, palette, headers, sidebar

5. Apply the **D** rows: `BlockViews` labels/titles/aria; the block/chapter/reference/vault menus in
   `actions.ts`; the native menu (`main/menu.ts`) in sentence case; `CommandPalette`;
   `CanvasHeader`; `ViewControls`/`Toolbar`; `Sidebar` D-07 rows (including
   `Open folder as library…`, `New library…`, `Remove from recents`, the note/outline labels).
6. **Find v2 labels alignment** (copy-plan D.7 note): keep `No results` and `1 of 4` exactly; the
   sidebar Search count reads `No results` at zero instead of `0` plus a duplicate empty line; the
   one-line empty states (`Type to search this note.`, `Open a note to search.`,
   `Search is available in notes.`) stay one sentence; `Refine the search` stays. The sidebar header
   palette button becomes an icon + `⌘K` with `aria-label`/`title` `Command palette (⌘K)` — the word
   `Search` is removed so it no longer collides with the Search view; the palette itself is
   unchanged.
7. **Banned-word guard**: extend the A+B guard to the C/D copy-bearing modules
   (`lib/save-failure.ts`, `lib/recovery.ts`, `lib/editability.ts`, `export/export-flow.ts`,
   `shell/StatusBar.tsx`, the export short-message map, the main modules). Empty allowlist.
8. Tests: the banned-word guard; the unit strings named in dialogs.md §5 (`read-mode-gating`,
   `save-failure`, session); the UI suites for Markdown, recovery, document lifecycle, status,
   palette, editor shortcuts; the native menu labels (a unit test over the menu template); the
   Details toast action and D25; the find sidebar labels (count/empty states). Screenshots under
   `artifacts/copy-cd/`: save-failure banner with Details open, a toast with the Details action and
   D25, recovery, status panel, palette, sidebar Search, native menu (one screenshot).

## Out of scope

- A+B (the frame, dialogs, Settings, the Details component itself, D25); the health modal and the
  find engine; any schema, Page/PDF geometry, library behavior, shortcut or command change.
- The `document`/`note` one-noun sweep.

## Files

Read:
- `docs/design/copy-plan.md` (C and D rows), `docs/design/dialogs.md` (§3 Details, §6 decisions),
  `docs/design/copy-audit.md` §2/§5, `docs/design/find-bar.md` (the find labels), the A+B report.
- The C/D files above and `shared/api.ts` (the envelopes), `main/menu.ts`, `styles.css`.

Expected to touch: the files above, the envelope types, `styles.css` (Details hosts/banners), the
tests, `docs/reports/copy-cd.md`.

## Acceptance criteria

- [ ] Every C row is applied exactly: short message in place, technical value in `details`, `DELETE`
      removed, `KEEP` untouched; the envelopes are additive.
- [ ] Details works in a dialog, a banner/panel, and the toast action → D25 (Copy, Close, `Copied`);
      one Details per surface; no banned word in a user-facing string.
- [ ] Every D row is applied; the native menu is sentence case; the palette is unchanged; the
      sidebar header palette button is icon + `⌘K` with the new aria/title.
- [ ] The find v2 labels are aligned: `No results` and `1 of 4` exact, zero shows `No results`, the
      empty states are one sentence, `Refine the search` stays.
- [ ] The banned-word guard covers the C/D modules; the updated suites pass; `verify:fast` and
      `test:ui:shell` green; screenshots.
- [ ] No pageerror; no schema/settings/Page/PDF/health/find-engine change.

## Tests and evidence

- Targeted: `npm test`, `npm run build && npm run test:ui:shell`, the new Details/guard tests.
- End of task: `npm run verify:fast`.
- Screenshots as in D8.
- No native dialogs, no fixed sleeps; do not weaken assertions.

## Stop and ask

- if an envelope change is not additive or would need a schema/IPC migration;
- if a short message loses information the user needs to act (the Details value is the fallback);
- if the native menu sentence case collides with a shortcut, an ID or a test's meaning;
- if the find label alignment needs a product decision beyond the D.7 note;
- on any schema/settings/Page/PDF change.

## Report format

Summary, files changed, checks with timings, acceptance criteria pass/fail, risks, next step. Write
`docs/reports/copy-cd.md`, commit once in the worktree, do not merge, and report the worktree path
and the commit hash.
