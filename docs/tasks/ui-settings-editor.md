# R5 — Settings Editor page: searchable shortcut list and Help → Keyboard shortcuts

**Role:** Implementer / Builder
**Milestone:** UI settings — Wave 1 (Editor/General quick win)
**Base:** `main` at the commit that adds this brief (`55033fd` plus the brief commit)
**Worktree:** created by the delegate from that base; do not work in the main checkout
**Timebox:** 2 hours

## Context

The Editor page already exists in Settings with a grouped, read-only shortcut list and the autosave
copy (“Autosave after 800 ms; ⌘S flushes immediately”). Two gaps remain:

- **AP-22 / S3-8** — `Help → Keyboard shortcuts` still sends the plain `settings` command
  (`apps/desktop/src/main/menu.ts`), so it opens Settings on the default page, not the shortcut list
  the menu item promises.
- The design contract (`docs/design/ui-settings-contents.md` §6) calls for a **searchable** list.
  The current list is static; there is no filter or empty state.

The design also says future single-key shortcut and autosave-interval rows stay hidden until fields
exist. No schema change is needed for this batch.

## Goal

One small batch that makes Help → Keyboard shortcuts open Settings on the Editor shortcut list and
makes that list genuinely searchable, with no fake controls and no schema change.

## In scope

### 1. Help → Keyboard shortcuts

- Add one `MenuCommand` (for example `settings-shortcuts`) sent by the native Help item instead of
  `settings`.
- Route it through the same renderer dispatch/gate path as the other menu commands; it opens
  Settings on the **Editor** page, with the shortcut list visible and focus in the shortcut search
  field (or the list when search is not focused).
- Keep `Settings…` (`⌘,`) opening the current default page; keep the About/General “Open shortcut
  list” button opening Editor.
- The existing overlay command gate still applies: the menu command must not open Settings behind an
  open modal/sheet; it is a normal gated app command.

### 2. Searchable shortcut list

- Add a search field above the grouped list with an accessible name
  (`aria-label="Search keyboard shortcuts"`), placeholder copy, and a clear action.
- Filter by label **and** shortcut, case-insensitive, across every group; hide groups with no
  matches; show an empty state (“No shortcuts match …”) with the query and a clear action.
- Keep the current read-only grouped layout and `<kbd>` rendering; no new shortcut data source unless
  needed for the filter. The list remains a reference, not a configurable keymap.
- Keyboard: the field is reachable by Tab, Escape clears the query (and does not close Settings),
  and the existing dialog Escape/close behavior is preserved when the field is empty.
- Keep the autosave information. Do **not** add single-key shortcut toggles, autosave interval, or
  any other disabled/“coming soon” control.

### 3. Coverage

- Add a UI regression suite (for example `tests/ui/ui-editor-shortcuts.test.mjs`, registered in
  `tests/ui/suites.mjs` so the runner meta-test stays green) covering:
  - the native `settings-shortcuts` command opens Settings with the Editor page active;
  - filtering by label and by key, hidden empty groups, empty state and clear;
  - the General/About “Open shortcut list” path still lands on Editor;
  - autosave copy is present; no future/disabled rows;
  - no pageErrors.
- Add or extend a unit test for the menu-command mapping if a menu test module exists; otherwise the
  UI test through the same `dispatchMenuCommand` bridge is the evidence.
- Update `tests/ui/README.md` only if the new suite changes the surface map.

## Out of scope

- Configurable single-key shortcuts, autosave interval, save-on-quit (no schema fields).
- Appearance, Export defaults, Page chrome, Continuous global, manual breaks, data recovery.
- S3-1 Close Window: do not gate or change it.
- A separate non-Settings shortcut sheet; the design target is Settings → Editor.
- Schema/migration/dependency changes; weakening or deleting existing assertions; fixed sleeps;
  native OS dialogs.

## Files

Read:
- `apps/desktop/src/main/menu.ts` (Help item), `src/shared/api.ts` (`MenuCommand`),
  `src/renderer/src/actions.ts` and `App.tsx` (dispatch/menu routing).
- `apps/desktop/src/renderer/src/shell/SettingsDialog.tsx` (Editor page, `SHORTCUTS`, nav,
  `dismiss`/close behavior), `src/renderer/src/state/shell.ts`, `src/renderer/src/global.d.ts`.
- `docs/design/ui-settings-contents.md` §6, `docs/ux.md` shortcut table,
  `docs/reviews/settings-inventory.md` AP-22, `docs/reviews/settings-freeze-review.md` S3-8.
- Existing tests: `tests/ui/ui-batch-a.test.mjs`, `m2-shell.test.mjs`,
  `apps/desktop/test/ui-suite-list.test.ts`, `tests/ui/suites.mjs`.

Expected to touch:
- `apps/desktop/src/main/menu.ts`, `src/shared/api.ts`, `src/renderer/src/actions.ts` and/or
  `App.tsx`, `src/renderer/src/state/shell.ts`, `src/renderer/src/shell/SettingsDialog.tsx`,
  `src/renderer/src/global.d.ts` if the test bridge needs a typed command.
- `tests/ui/ui-editor-shortcuts.test.mjs` (new), `tests/ui/suites.mjs`,
  `apps/desktop/test/ui-suite-list.test.ts` if the list changes.
- `docs/reports/ui-settings-editor.md`.

## Acceptance criteria

- [ ] `Help → Keyboard shortcuts` opens Settings on the Editor page with the shortcut list visible;
      the native command goes through the same gated dispatch path as other menu commands.
- [ ] The shortcut list filters by label and by key, hides empty groups, shows a useful empty state,
      clears with the clear action/Escape, and remains keyboard accessible.
- [ ] The General/About link still opens Editor; `⌘,` still opens the default Settings page.
- [ ] No future/disabled rows; single-key shortcuts and autosave interval remain absent; autosave
      copy unchanged.
- [ ] The new UI suite is registered and the runner meta-test stays green; no pageErrors.
- [ ] No schema/dependency change; no existing assertion weakened; no fixed sleep, no native dialog.
- [ ] `npm run verify` exit 0 with real timings; UI 45 suites at the default pool.

## Tests and evidence

- Targeted while working: the new suite, `m2-shell`, `ui-batch-a`, `ui-suite-list`, typecheck,
  boundaries.
- End of task: one full `npm run verify` (~3 min).
- Screenshot of the filtered/empty Editor page in the suite's own `artifacts/ui-editor-shortcuts`
  directory.

## Stop and ask

Stop and report when:

- the “Help → Keyboard shortcuts” target is ambiguous (Settings → Editor vs a separate sheet);
- a test-only bridge change would be needed beyond the existing menu-command bridge;
- the search requires a new shortcut data source with schema impact;
- a baseline test fails for an unrelated reason.

## Report format

- Summary mapped to AP-22/S3-8 and the search requirement.
- Files changed.
- Checks with real timings and suite counts.
- Acceptance criteria pass/fail with the test/evidence.
- Open questions / risks.
- Next suggested step.

Commit in the worktree; do not merge or push.
