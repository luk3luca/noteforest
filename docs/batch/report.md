# Report — command surface

**Builder.** Branch `t3/implement-command-surface`. Base: `e661261` (the commit that contains the
brief and the plan). One commit. Not merged, not pushed.

## Summary

The four hand-written command listings are replaced by one manifest and four adapters.

- `shared/commands.ts` declares the 40 application commands: group, label (or a contextual palette
  label), menu placement, palette membership, chord link, repeat policy and one availability
  predicate returning `enabled` / `disabled(reason)` / `hidden`. The five refusal sentences live
  there once.
- `shared/api.ts` turns `MenuCommand` into the runtime `MENU_COMMANDS` tuple plus a derived type:
  the same 26 ids, same order, byte-identical.
- The chord catalogue moved to `shared/shortcuts.ts` and gained `shortcutFor`, `menuAccelerator`,
  `shortcutScope` and `hasChord`; every renderer importer follows the new path and the glyph guard
  scans `shared/` too.
- `main/menu-template.ts` derives the 24 application items from the manifest (labels, wire ids,
  catalogue accelerators). It keeps only the macOS roles, the separators and the eight pinned ids
  on the same order scale, plus the one `close-window` window action.
- The renderer gained `commands/context.ts` (the only store reader), `run.ts` (overlay gate, one
  decision, surface policy), `runners.ts` (exhaustive `Record<AppCommandId, () => void>`),
  `keys.ts` (global chord router with target guards and the repeat policy), `palette.ts` (shipped
  note order + the guest six, block rows spliced in) and `block-commands.ts` (the twelve block
  entries with their author gate).
- `App.tsx` lost `dispatch`, `SINGLE_PATH_COMMANDS`, `lastDispatch`, the 120 ms map and the whole
  keydown chain: the menu and the test bridge enter `runAppCommand`, one capture listener enters
  the key router, and the bridge exposes `commandState(id)`.
- `actions.ts` lost `paletteCommands`, `runMenuCommand` and `applyBlockType`; every action function
  stays. `blockedByReadMode` reads the shared reason.
- Ownership is one-way: every labelled menu item displays the catalogue accelerator with
  `registerAccelerator: false`; `event.repeat` replaces the time window (history and zoom stay
  repeatable).

Visible changes are exactly D2 (`Read mode — switch to Continuous Edit to run this command` on the
key/menu toast) and D4 (`link-reference` is a disabled row and `⇧⌘L` consumes and reports).

## Files changed

New:

- `apps/desktop/src/shared/commands.ts`
- `apps/desktop/src/renderer/src/commands/context.ts`
- `apps/desktop/src/renderer/src/commands/run.ts`
- `apps/desktop/src/renderer/src/commands/runners.ts`
- `apps/desktop/src/renderer/src/commands/keys.ts`
- `apps/desktop/src/renderer/src/commands/palette.ts`
- `apps/desktop/src/renderer/src/commands/block-commands.ts`
- `apps/desktop/test/commands.test.ts`
- `apps/desktop/test/command-availability.test.ts`
- `apps/desktop/test/command-surfaces.test.ts`
- `tests/ui/command-surface.test.mjs`

Moved (with small accessors added): `apps/desktop/src/renderer/src/lib/shortcuts.ts` →
`apps/desktop/src/shared/shortcuts.ts`.

Modified:

- `apps/desktop/src/shared/api.ts` (wire tuple + derived type)
- `apps/desktop/src/main/menu-template.ts` (derived menu)
- `apps/desktop/src/renderer/src/App.tsx`, `actions.ts`, `global.d.ts`
- `apps/desktop/src/renderer/src/lib/editability.ts`, `lib/editor-context-menu.ts`
- `apps/desktop/src/renderer/src/export/export-flow.ts`
- `apps/desktop/src/renderer/src/shell/CommandPalette.tsx`
- the chord-import path only: `renderer/src/editor/keymap.ts`, `editor/SelectionToolbar.tsx`,
  `page/PageBlockEditor.tsx`, `page/page-edit-state.ts`, `page/PageView.tsx`,
  `shell/CanvasHeader.tsx`, `shell/FindBar.tsx`, `shell/PagePosition.tsx`, `shell/SettingsDialog.tsx`,
  `shell/Sidebar.tsx`, `shell/TabBar.tsx`, `shell/Toolbar.tsx`, `shell/ViewControls.tsx`,
  `shell/Workspace.tsx`
- tests: `apps/desktop/test/shortcuts.test.ts`, `copy-cd.test.ts`,
  `page-edit-commit-keys.test.ts`, `read-mode-gating.test.ts`, `tests/ui/suites.mjs`

Removed: `apps/desktop/src/renderer/src/lib/shortcuts.ts` (moved), `paletteCommands`,
`runMenuCommand`, `dispatch`, the dedupe map and set, and the `App.tsx` keydown chain.

## Checks and timings

Checkpoint runs (`npm run verify:fast` = boundaries + typecheck + all unit tests + e2e):

| # | When | Result | Wall clock |
|---|---|---|---|
| 1 | after the shared move, the wire tuple, the manifest and the derived menu, with the dispatcher, runners, key router and palette already wired in the same working tree | pass | 1 m 02.9 s |
| 2 | final tree (steps 1–9) | pass | 1 m 01.5 s |

Checkpoint 1 deviation, reported as required: the nine steps were implemented as one working tree,
so the literal step-4 tree (derived menu + the eleven shipped `registerAccelerator` values, old
`App.tsx` chain) cannot be reproduced without reverting steps 5–8. Checkpoint 1 therefore contains
the composed no-behaviour portion plus the adapters; checkpoint 2 contains the complete batch. The
step-4 risk itself (wrong section, order, label, accelerator) is asserted by the final
`copy-cd.test.ts` and `commands.test.ts` menu tests, which pass.

Supporting runs:

- `npm test`: 174 files, 1794 tests (checkpoint 1) / 1795 tests (final), ~8.9 s each.
- New parity suite `tests/ui/command-surface.test.mjs`: 6/6 pass, ~14 s.
- Touched existing UI suites, run individually (all pass): `m4b1a2-read-mode-gating` 16 s,
  `ui-editor-shortcuts` 15 s, `ui-overlay-command-gate` 18 s, `m4b1b1-page-edit-overlay` 25 s,
  `find-bar` 29 s, `ui-batch-a` 23 s, `ui-batch-b` 26 s, `ui-batch-v` 17 s,
  `markdown-file-view` 20 s, `v0-shell-frame` 20 s, `m4b1-page-view` 19 s.

Evidence artifacts (gitignored, `artifacts/command-surface/`):

- `read-palette-reason.png` — Read mode, the palette's `New chapter` row with the unified sentence.
- `no-document-refusal-toast.png` — File → New chapter with no document: one `Open a document first`
  toast and the empty shell unchanged.
- `link-reference-disabled-row.png` — the disabled `Link as reference…` row with
  `Select a block first.`
- `app-menu.json` — the real application menu as installed: every app label, its accelerator, and
  `registerAccelerator: false` on each item that carries one (`Fit page` and `Keyboard shortcuts`
  have no accelerator; the standard roles keep theirs).

Not run, by the brief: `test:perf`, `test:visual`, the full `npm run verify` (the Orchestrator owns
the integration gate).

## Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Wire contract unchanged (26 ids, unique, one manifest record each) | pass — `commands.test.ts` |
| 2 | One declaration per command (label/contextual label, group, menu or no menu, palette membership, shortcut link, availability) | pass — 40 records; `commands.test.ts` |
| 3 | Menu parity (labels, separators, order, eight ids, accelerators) | pass — `commands.test.ts`, `copy-cd.test.ts` |
| 4 | One owner per chord | pass — template has no `CmdOrCtrl` literal; every accelerator `registerAccelerator: false`; 33 chords ↔ 33 commands (four `text-*` roles excepted) |
| 5 | The matrix | pass — 40 × 6 table-driven, plus selection, find, tabs, page, locked-note cases |
| 6 | Surface policy (`hidden` silent/unconsumed, `disabled` consumed/reported once, `enabled` once) | pass — `command-surfaces.test.ts`, parity UI |
| 7 | Extensibility | pass — `Record<AppCommandId, () => void>`; surface/label/chord tests |
| 8 | Throttle gone | pass — no time-based dedupe; UI: one `⌘N` = +1 tab, two quick presses = +2, one `⌘W` = −1, one menu click = one run |
| 9 | Palette inventory unchanged | pass — 36 note rows in shipped order, the guest six, 12 block rows and their gate |
| 10 | Settings unchanged | pass — `ui-editor-shortcuts` (34 rows, labels, keys, filters) unchanged |
| 11 | Gate and overlay behaviour unchanged | pass — `ui-overlay-command-gate`, `m4b1b1-page-edit-overlay`, parity suite |
| 12 | Copy: only D2/D4 | pass — `copy-cd.test.ts`; every unchanged label byte-identical |
| 13 | No new surfaces (dependency, IPC, schema, `DocumentCommand`, session, PDF) | pass |
| 14 | Evidence | pass — above artifacts, unit/UI output, both checkpoints |

## Decisions applied

- **D1** all chords renderer-owned; the menu displays the catalogue accelerator with
  `registerAccelerator: false`; the 120 ms map, the single-path set and the shim are deleted.
- **D2** the Read refusal is `Read mode — switch to Continuous Edit to run this command` on the
  palette row, the key and the menu.
- **D3** read-only/locked notes keep the Read reason; recorded below as a known issue.
- **D4** `link-reference` without a selection is a disabled row; `⇧⌘L` consumes the chord and toasts
  `Select a block first.`
- **D5** `flush` stays a wire-reserved id (manifest record, no menu, no row, no chord).
- **D6** Fit page outside Page stays enabled and inert; UX follow-up below.
- **D7** one batch, two checkpoints (see the deviation note under checks).
- **D8** `anchor-health` keeps its id.
- **D9** `docs/design/shortcuts.md` is untouched for the Orchestrator.

## Open questions and risks

1. **Known issue (D3).** A note open read-only in Continuous Edit gets
   `Read mode — switch to Continuous Edit to run this command`, which is the wrong sentence. It is
   the shipped defect the plan defers; fixing it needs a new reason and owner-approved copy.
2. **UX follow-up (D6).** `Fit page` stays enabled and inert in Continuous, as shipped.
3. **`close-window` and the modal gate.** The plan keeps `close-window` outside the overlay gate
   (§3.4/§3.5). The menu click already bypassed the gate; now `⇧⌘W` also closes the window while
   Settings/the palette/the Export sheet is open (it was ignored before). It is unit-tested and
   follows the plan, but it is a small behaviour change the product owner may want to see.
4. **Read palette row width.** The unified Read sentence is clipped in the row (the shipped CSS
   already clipped this exact palette reason). The full string is the row's `data-palette-reason`
   and is asserted; the key and menu toasts show it in full.
5. **Palette memo dependencies.** The palette is modal, so `hasSelection`/`tabCount` cannot change
   while it is open; the existing deps (`seq`, layout/mode key) still cover every runtime update.
   Noted as plan risk 8.
6. **Environment only, no repo change.** Apps declare `@noteforest/core@0.0.0-m2.1` while the
   workspace packages are `0.1.0`, so `npm ci` cannot resolve them from the registry. The worktree
   gates ran on a clone of the main checkout's `node_modules` (the same versions, workspace links
   repointed at this worktree). Do not commit `apps/desktop/node_modules`; it is an untracked
   symlink used for the gates.
7. **Manual checks for the product owner** (plan §9): every chord in the built app with a menu open
   and after refocusing the window; hold-to-undo and hold-to-zoom now repeat per event rather than
   once per 120 ms.

## Next step

1. Orchestrator: run one full `npm run verify` at integration (UI concurrency 4).
2. Orchestrator: update `docs/design/shortcuts.md` (module table, the S3-1 "deliberately double"
   note, the `menu` comment) — D9.
3. Sentinel: independent review against `docs/review-checklist.md`, starting with
   `shared/commands.ts`, `commands/run.ts`, `commands/keys.ts`, `main/menu-template.ts`.
4. Product owner: the manual chord pass and a look at the three screenshots plus `app-menu.json`.
