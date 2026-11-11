# R5 — Settings Editor page: searchable shortcut list and Help → Keyboard shortcuts

**Role:** Implementer / Builder
**Milestone:** UI settings — Wave 1 (Editor/General quick win)
**Base:** `b63a78e` (main head; the brief commit)
**Branch:** `t3/settings-editor-shortcuts-search`
**Date:** 11 November 2026

## Summary

Two gaps closed in one small batch, with no schema, dependency, or existing-assertion change.

- **AP-22 / S3-8 — Help → Keyboard shortcuts now opens the shortcut list.** The native Help
  item sends a new `settings-shortcuts` `MenuCommand` instead of the plain `settings` command
  (`apps/desktop/src/main/menu.ts`). The renderer routes it through the existing
  `runMenuCommand`/`dispatch` path, so the overlay command gate applies unchanged: with any
  modal/sheet open the command is ignored. It opens Settings on the **Editor** page with focus
  in the shortcut search field. `⌘,` still opens the default Page page, and the General
  “Open shortcut list” button still switches the open dialog to Editor.
- **Search.** The Editor page keeps its grouped, read-only `<kbd>` list and gains a search
  field (`aria-label="Search keyboard shortcuts"`, placeholder “Search by name or shortcut”,
  clear action). It filters case-insensitively on the row **label** and the displayed
  **shortcut**, hides groups with no match, shows `No shortcuts match “…”` with a clear action
  when nothing matches, and `Escape` clears a non-empty query without closing Settings. An
  empty field keeps the normal dialog Escape behavior. The autosave copy is unchanged, and
  there are no single-key, autosave-interval, or “coming soon” controls.

No new shortcut data source was needed: the existing `SHORTCUTS` table is filtered in place.
The `settings` dialog target gained an optional typed `page` so menu routing and dialog
navigation share one page-id type (`settings/settings-pages.ts`).

## Files changed

- `apps/desktop/src/main/menu.ts` — Help item id `menu-keyboard-shortcuts`, sends
  `settings-shortcuts`.
- `apps/desktop/src/shared/api.ts` — `MenuCommand` gains `settings-shortcuts`.
- `apps/desktop/src/renderer/src/actions.ts` — `runMenuCommand` maps the command to
  `openDialog({ kind: 'settings', page: 'editor' })`.
- `apps/desktop/src/renderer/src/state/shell.ts` — `DialogState` settings variant gains
  optional `page`.
- `apps/desktop/src/renderer/src/settings/settings-pages.ts` — new `SettingsPageId` type
  (single page-id source for the dialog and menu routing).
- `apps/desktop/src/renderer/src/shell/SettingsDialog.tsx` — typed `initialPage`, search state
  and filter, search/clear/empty-state UI, Escape-clears-in-field, autofocus when opened on
  Editor; autosave copy unchanged.
- `apps/desktop/src/renderer/src/styles.css` — search row and empty-state styles.
- `tests/ui/ui-editor-shortcuts.test.mjs` — new 4-test regression suite.
- `tests/ui/suites.mjs` — suite registered in `FILES` and the `settings` group.
- `apps/desktop/test/ui-suite-list.test.ts` — per-suite evidence-dir owner entry for the new
  suite (meta-test stays authoritative).
- `tests/ui/README.md` — Settings surface-map row names the new suite.

## Checks with real timings

| Check | Result | Time |
|---|---|---|
| `npm run check:boundaries` | 179 files, 879 imports, 16 rules, 0 violations | part of verify:fast (~9 s incl. typecheck/unit/npm overhead) |
| `npm run typecheck` (4 workspaces) | pass | same verify:fast block |
| `npm test` (vitest) | 109 files / 1099 tests pass | 2.69 s |
| `npm run e2e` (build + critical) | 16/16 pass | 43.98 s total (test body 35.85 s) |
| `npm run test:recovery:run` | 14/14 pass | 17.45 s |
| `node tests/ui/run.mjs` (default pool 8) | **45/45 pass**, 0 pageErrors | 97.7 s |
| **`npm run verify`** | **exit 0** | **168.38 s real** |

Targeted runs while working:

| Check | Result |
|---|---|
| `node --test tests/ui/ui-editor-shortcuts.test.mjs` | 4/4 pass, 8.1 s suite |
| `node tests/ui/run.mjs --group settings --concurrency 4` | 7/7 pass, 33.7 s |
| `node --test tests/ui/m2-shell.test.mjs` | 4/4 pass, 11.4 s |
| `node --test tests/ui/ui-batch-a.test.mjs` | 5/5 pass, 18.7 s |
| `npx vitest run ui-suite-list / ui-batch-v-css / design-tokens-css` | 20/20 pass, 0.14 s |

The new suite is in the runner and ran in the full pool (`PASS ui-editor-shortcuts.test.mjs
(10.5s)`); the suite-list meta-test proves the list equals `tests/ui/*.test.mjs`.

Evidence screenshots (suite-owned directory `artifacts/ui-editor-shortcuts/`):
`editor-shortcuts.png` (native Help target), `editor-shortcuts-filtered.png` (query “focus”),
`editor-shortcuts-empty.png` (empty state with “zzzz”).

## Acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| Help → Keyboard shortcuts opens Settings on Editor with the list visible; native command uses the gated dispatch path | **Pass** | Native `Menu.getApplicationMenu().getMenuItemById('menu-keyboard-shortcuts')` click → Editor nav active, search and rows visible; with Settings open, a `settings-shortcuts` dispatch is ignored (suite test 2) |
| List filters by label and key, hides empty groups, useful empty state, clear action/Escape, keyboard accessible | **Pass** | Suite tests 3–4: `focus` → Editor-only 2 rows; `⌘s` → Save; `PAGE` → Shell+Page 4 rows; `zzzz` → empty state with query and groups hidden; clear button and Escape restore 24 rows; Tab reaches the field; Escape on an empty field closes |
| General/About link lands on Editor; `⌘,` opens the default page | **Pass** | Suite test 2 (`⌘,` → Page), test 3 (`Open shortcut list` → Editor) |
| No future/disabled rows; single-key and autosave interval absent; autosave copy unchanged | **Pass** | Suite test 1: exact autosave sentence, no `/single-key|autosave interval|coming soon/i`, zero disabled pane controls, 24 `<kbd>` rows |
| New suite registered, runner meta-test green, no pageErrors | **Pass** | `suites.mjs` + `ui-suite-list.test.ts`; full verify 45/45, `h.pageErrors` empty |
| No schema/dependency change; no weakened assertion; no fixed sleep or native dialog | **Pass** | Diff touches UI/menu/test files only; `package.json`/lock unchanged; all waits are conditions; no dialog use |
| `npm run verify` exit 0 with real timings; UI 45 suites at the default pool | **Pass** | 168.38 s real; 45/45 suites, default concurrency 8 |

## Open questions / risks

- **Search scope is the rendered list only.** Queries match the visible label and key glyphs
  (`⌘s`). Prose aliases (“Cmd+S”, “Command-S”) do not match; the brief specified label +
  shortcut, so this is intentional.
- **Strict row count.** The suite pins 24 rows and the three group names. Adding or removing a
  shortcut row requires updating the suite deliberately — that is the “no future rows”
  guard, not a flake.
- **Query lifetime.** The filter persists while the user switches Settings pages inside the
  same open dialog; it resets when Settings is closed and reopened. Not specified by the
  brief; no persisted state or schema impact.
- **No accelerator.** UX v1.5 lists `⌘⇧/` for the shortcut list; the Help item keeps no
  accelerator here. Wiring it is a keyboard-map decision outside this brief.
- **No menu unit test exists.** The native menu is Electron-only and has no unit module, so
  the UI suite is the evidence per the brief: it invokes the real menu item and the existing
  `dispatchMenuCommand` bridge (no new bridge method).
- **Close Window (S3-1)** was not touched; the overlay gate behavior for menus is unchanged.

## Integration

- Merged into `main` at `f5c9f69`; R1 was rebased onto it, and the Wave 1 integration verify ran on
  `main` at `4a87ae8`: **exit 0, 170.47 s** — 109 unit files / 1114 tests, 16/16 e2e, 14/14
  recovery, **46/46 UI** at the default pool, 0 pageErrors.
- No separate Sentinel review was run for this small batch; the UI suite and the integration verify
  are the evidence. A targeted review can be folded into the next settings checkpoint.
- Product-owner visual/VoiceOver pass remains open.

## Next suggested step

Sentinel review of this batch against the brief (AP-22/S3-8 + search), then continue the
settings Wave 1 sequence on `main`. A natural follow-up is an explicit keybinding/accelerator
decision for `⌘⇧/`, only if the product owner wants it; no code blocker exists.
