# Library surface — implementation report (L1 + L2)

**Role:** Implementer / Builder
**Task:** `docs/tasks/library-surface.md`
**Design:** `docs/design/library-and-documents.md` (LD-01…LD-12)
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-f4c93b3c-f67fa0c2775276d4`
**Branch:** `t3/library-sidebar-tabs-roots`
**Commits:** L1 `f2883be` (sidebar tabs), L2 (this commit; library roots)
**Base:** `2e46d2b` (`main` head after the UI-shell fix batch)
**Date:** 13 November 2026

## Summary

### L1 — Sidebar tabs

- `SessionState` now carries `sidebarTab: 'library' | 'outline'`; the main process
  normalizes a legacy/missing value to `library`, and the renderer persists the
  active tab through `buildSession`. Opening a document does not switch tabs.
- The expanded sidebar is now search → tab strip → one tab panel → Settings
  footer. The strip is a real `tablist` with two `tab` buttons, `aria-selected`,
  `aria-controls`, `ArrowLeft`/`ArrowRight`/`ArrowUp`/`ArrowDown`/`Home`/`End`
  movement (focus follows selection), and a visible focus ring.
- Library is the default tab: active library name + chevron, document count,
  local filter, document rows, and the single sidebar New note `+`.
- Outline is the existing Topics tree (chapters, blocks, anchors, collapse,
  rename, context menus) with the empty state “Open a document to see its
  outline.”
- The global sidebar-header `+` is gone; the Library header `+` is the only
  sidebar New note path. The Batch A/UI/e2e/visual selectors were updated.
- The fix-batch Library/Topics dividers were replaced by the tab boundary; the
  footer `border-top`, 28 px rows, full-row selection, and the 180/640/264 grid
  are unchanged.
- Removed the `.nf-tree-anchor-row` left rule and first/last radius overrides.
  Anchored rows are grouped by indentation and the quote; selection is the same
  full-row inset ring as every other row. A CSS guard test
  (`no-left-accent.test.ts`) fails if a tree/block/card/chapter/library row
  gains `border-left`/`border-inline-start`, and the UI suite asserts the
  computed 0 px border and full-row ring.

### L2 — Library roots

- New pure `main/library-roots.ts`: `libraries.json` version 1, max 8 recents,
  absolute/normalized paths, newest-first ordering, dedupe by normalized path,
  atomic writes, corrupt → timestamped backup + empty list + warning, newer
  version → warning + readable entries. No settings/document schema change.
- Active library is session state (`activeLibrary`). First run with no session
  field and no recents creates/activates `~/Documents/NoteForest` (or the
  `NOTEFOREST_LIBRARY` seed). A stored missing library is returned as missing
  and is never recreated; explicit `null` (last recent removed) stays empty.
- Main actions: `openLibraryPath` (native picker), `createLibraryRoot` (name +
  parent picker), `switchLibraryRoot`, `removeRecentLibraryRoot` (recents only),
  `locateLibraryRoot`, `refresh` via `scanLibrary`, `reveal` via
  `library:reveal`. `scanLibrary(root?)` takes an explicit root; `LibraryView`
  exposes active path/name, `missing`, recent libraries (active flag, missing
  flag, duplicate-basename parent path), and recent documents.
- `createDocument` targets the active library and fails clearly when no library
  or the active folder is missing. `isInsideLibrary` was replaced by
  `isInsideKnownLibrary` (active + recents, canonical realpath containment);
  save-copy/restore defaults and all open/backup/reload paths use the known
  roots. Package roots and nested libraries are rejected with specific messages.
- Recents are updated on open/create/switch, deduped by realpath, and display
  the path the user chose. `libraries.json` is separate from settings and the
  session.
- Renderer: Library header switcher menu (active check, recents, Open Folder as
  Library…, New Library…, Refresh, Reveal in Finder, Remove from Recent disabled
  for active), New Library modal (name + parent picker), missing state
  (“Library not found” + path + Locate… / Remove from Recent / Open another…),
  no-library state, and Data & About active path + recents + Open/Reveal/Remove
  links. No settings schema change.
- Switching/open/create/locate/remove flush open documents and pending settings
  first; a failed flush blocks the action with the error. Open tabs stay across
  a switch (LD-03); activating a tab from another known library updates the
  active library; opening a document from another known library activates its
  library. Launch restores the session active library even when the active tab
  belongs to another library.
- Move reconciliation matches missing session tabs and recent-document entries
  by canonical `document.id` when a library is opened/located (and on launch);
  legacy path-only entries stay missing. The renderer reopens reconciled tabs at
  their new paths. Per-document overrides remain id-first and untouched.

## Files changed

**Shared / main**

- `apps/desktop/src/shared/api.ts` — sidebar tab, active library, library
  recents/action/view types, session `documentId`, library IPC methods.
- `apps/desktop/src/main/library-roots.ts` — new pure `libraries.json` module.
- `apps/desktop/src/main/library.ts` — active library/session resolution,
  `libraries.json` integration, validation, open/create/switch/remove/locate,
  scan/view, `isInsideKnownLibrary`, reconciliation, bootstrap.
- `apps/desktop/src/main/index.ts` — library IPC handlers and native folder
  pickers; bootstrap returns the scanned library; reveal/known-root checks;
  save-copy default root.
- `apps/desktop/src/preload/index.ts` — preload bindings for the new library API.

**Renderer**

- `apps/desktop/src/renderer/src/App.tsx` — sidebar tab restore, library follow
  on later tab activation, test-state library fields.
- `apps/desktop/src/renderer/src/actions.ts` — library actions, flush gate,
  active-library follow, reconciliation application.
- `apps/desktop/src/renderer/src/state/shell.ts` — `sidebarTab`, menu check /
  description fields, `new-library` dialog state.
- `apps/desktop/src/renderer/src/state/session.ts` — persists sidebar tab,
  active library, and tab document id.
- `apps/desktop/src/renderer/src/shell/Sidebar.tsx` — tab strip, Library header
  switcher/missing/empty states, Outline panel.
- `apps/desktop/src/renderer/src/shell/ContextMenu.tsx` — checked recents and
  secondary parent-path line.
- `apps/desktop/src/renderer/src/shell/Dialogs.tsx` — New Library modal.
- `apps/desktop/src/renderer/src/shell/SettingsDialog.tsx` — Data & About library
  paths, recents, Open/Reveal/Remove.
- `apps/desktop/src/renderer/src/lib/paths.ts` — renderer path containment for
  the active-library follow rule.
- `apps/desktop/src/renderer/src/styles.css` — tab strip, library header,
  missing/no-library states, menu check/description, Data rows; anchor-row left
  rule removed.

**Tests**

- `apps/desktop/test/session-sidebar.test.ts` — legacy default, Outline
  round-trip, `buildSession`.
- `apps/desktop/test/no-left-accent.test.ts` — CSS guard.
- `apps/desktop/test/library-roots.test.ts` — manifest order/cap/corrupt/newer/
  dedupe/duplicate basenames.
- `apps/desktop/test/library-roots-main.test.ts` — first run, open/create/
  switch/remove, missing no recreate, locate reconciliation, package/nested
  rejection, realpath dedupe, create-in-active-library.
- `apps/desktop/test/save-failure.test.ts` — known-root containment.
- `apps/desktop/test/recovery-library.test.ts` — updated outside-library message.
- `tests/ui/library-surface.test.mjs` — 6 UI scenarios (tabs/ARIA/persistence,
  Outline empty/collapse, open/switch/recents/tab follow/launch restore, New
  Library + rejections, missing/locate, Data remove + no-library).
- `tests/ui/suites.mjs` — new suite in `FILES` and `shell`.
- `tests/support/ui-session.mjs` — `showOutline()` / `showLibrary()`.
- Existing UI/e2e/visual suites updated for the tab boundary and the single
  sidebar New note (`v0-shell-frame`, `ui-batch-a`, `m2-shell`,
  `m3-anchor-outline`, `m3-reference`, `m4b1a2-read-mode-gating`,
  `ui-document-status`, `m2-screenshots`, `m2-editor`).

## Checks (real timings)

| Check | Result |
|---|---|
| `npm run check:boundaries` | pass — 191 files, 920 imports, 16 rules |
| `npm run typecheck` | pass — desktop node + web, core, layout, pdf |
| `npm test` | pass — 119 files / 1219 tests, 3.61 s |
| `npm run e2e` | pass — 16/16, 44.0 s (build 0.24 s) |
| `node tests/ui/run.mjs --group shell --concurrency 4` | pass — 9/9 suites, 42.3 s |
| `node tests/ui/run.mjs --group settings --concurrency 4` | pass — 10/10 suites, 42.3 s |
| `node --test tests/ui/library-surface.test.mjs` | pass — 6/6, 15.8 s |
| `npm run verify:fast` | **exit 0** — boundaries, typecheck, unit, e2e |

Targeted extra suites: `m3-anchor-outline`, `m3-reference`,
`m4b1a2-read-mode-gating` (7/7, 16.9 s). No pageErrors in the new UI suite.

Screenshots (`artifacts/library-surface/`): `library-tab.png`,
`outline-tab.png`, `outline-empty.png`, `library-switcher.png`,
`new-library.png`, `library-missing.png`, `data-libraries.png`,
`no-library.png`, `library-tab-recents.png`.

## Acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| Library/Outline tabs with ARIA and persisted active tab; Outline shows active document + empty state; Library shows active library/filter/documents | **Pass** | `library-surface` tests 1–2; session unit test |
| No left accent bar on any block/card/chapter/tree row; anchor left rule gone; indentation/quote grouping; full-row ring | **Pass** | `no-left-accent.test.ts`; UI computed border 0 px + inset ring; `m3-anchor-outline` |
| One New note control (Library header); global header `+` gone; creates in active library | **Pass** | `library-surface` test 1; `v0-shell-frame`; e2e |
| Open folder as library, create library, switch recents, only active documents; missing never recreated; Locate/Remove work | **Pass** | `library-surface` tests 3–5; main unit tests |
| Recents persist, max 8, newest-first, realpath dedupe; package/nested roots rejected clearly | **Pass** | `library-roots` unit; main dedupe/rejection tests; UI rejections |
| Switching flushes pending saves; open tabs stay; tab activation follows library; recent document opens its library | **Pass** | `flushBeforeLibrarySwitch`; `library-surface` test 3; launch-restore assertion |
| Move reconciliation by document id updates tabs/recents; legacy path-only stays missing | **Pass** | main locate unit + `library-surface` test 5 |
| No draft/trash/external-doc/multi-root/search/backup/settings-version change | **Pass** | no such code or schema change |
| Existing assertions updated, none weakened; no fixed sleeps/native dialogs | **Pass** | updated suites; deterministic folder-picker mocks; no fixed sleeps added |

## Open questions / risks

- **Tab-strip `+` remains.** The brief removes the global sidebar-header `+` and
  keeps the Library header `+`; the Batch A tab-strip new-tab `+` is unchanged.
  If “one New note” is meant globally, that control should be removed in a
  follow-up decision (it is the tab-creation affordance today).
- **Flush-failure block is implemented but not exercised by a failing-save UI
  test.** The positive flush path is covered by the switch/locate UI flows and
  `runtime.flush()`; a deterministic permission failure would need a new
  fault-injection hook.
- **Recent-document manifest reconciliation is best-effort.** If only a recent
  document (no open tab) moved, `LibraryView.recent` can be stale for that
  launch even though `recent-documents.json` is updated. Tabs and the next scan
  are correct.
- **Legacy path-only entries** remain missing by design; they need an explicit
  Locate or manual path.
- **`NOTEFOREST_LIBRARY` seed** is used only when the session has no active
  library and no recents; an existing recents list wins on a pre-L2 session.
- **Data page Remove** is disabled for the active library (the missing state is
  the explicit active-removal path). This matches the brief; a user cannot
  remove the active library while it exists.
- **Corrupt `libraries.json` warning** is surfaced through `LibraryView.warnings`
  (bootstrap/scan toast), not a dedicated recovery page; the damaged file is
  preserved.
- No settings/document schema, Page/PDF, export, draft, trash, or external
  document behavior changed.

## Next step

L3 + L4 document lifecycle: `createDraft` and first-mutation materialization,
then rename title / reveal / Move to Trash with flush and live-lock rules. The
library roots and switcher are ready to be the draft target and the document
management surface.
