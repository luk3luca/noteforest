# P2 — release polish

**Role:** Builder
**Milestone:** release polish
**Base:** `main` at launch (B1 merged; B2 running in another worktree — do not touch its files).
**Worktree:** created by the Orchestrator, branch `t3/p2-polish`.
**Timebox:** 6 hours.

Six small, independent fixes found in the v1 pass, plus the two intermittent UI suites. Nothing here is new
product surface: every item removes a contradiction between what the app says and what it does.

B2 is running in parallel and owns `styles.css`, `useAppearanceSync`, `AppearanceSettings`, the settings
types/normalizer and `code-palette.test.ts`. Do not edit those files.

## 1. The selection bubble must not live behind a modal

`editor/SelectionToolbar.tsx` `shouldShow` looks only at the editor selection, the formula editor and the
table. With text selected and a modal open, the bubble's buttons stay in the tree: invisible to the eye,
reachable by VoiceOver and by any strict locator (`m3-reference` hit exactly that).

- Return `false` when `overlayOwnsCommands()` (`shell/overlay-owner`) is true, before any editor check.
- Test: select text in a block, open a dialog that is not the bubble (e.g. Link as reference), and assert
  the toolbar is not visible and its controls are not reachable; closing the dialog restores it when the
  selection is still live.

## 2. The shifted-bracket tab bindings never fire

`lib/shortcuts.ts` has `tab-previous-bracket` (`⌘⇧[`) and `tab-next-bracket` (`⌘⇧]`) with `list: false`.
They match `event.key` `[`/`]`, which on a US layout cannot happen while Shift is held (`{`/`}`). Make them
real or delete them; do not leave dead code.

**Do this:** match by `KeyboardEvent.code` so the keys are layout-independent.
- Extend `Chord` with an optional `code` and make `chordMatches` compare `event.code` when present
  (falling back to `key` otherwise); the display still comes from the chord's `key`.
- Use `BracketLeft` / `BracketRight` for the two entries and keep `list: false` (the tab row already shows
  `⌃Tab` / `⌃⇧Tab`; a second pair in the same row is noise).
- Unit: the matcher accepts `{code:'BracketRight', shift, mod}` and rejects the same key without shift.
- UI: `Meta+Shift+BracketRight` / `BracketLeft` cycle tabs; the existing `⌃Tab` path still works.

## 3. Export PDF moves to `⌘P`

`⌘P` is the universal "produce a document" key; today it is unbound and Export is `⇧⌘E`.

- In the catalogue, `export-pdf` uses `⌘P`. v1 is unreleased, so **replace** `⇧⌘E` rather than keeping two
  keys for one verb. Update the native menu accelerator, the canvas-header title and `aria-keyshortcuts`,
  and any palette hint (all read the catalogue).
- UI: `⌘P` opens the export sheet; `⇧⌘E` no longer does; the Settings row reads `Export PDF… ⌘P`.

## 4. `Edit → Find… / Find Next / Find Previous`

The find exists as a key, the palette and the header bar, but not where macOS users look first.

- Add three items to the native `Edit` menu, after Undo/Redo and a separator, before the clipboard roles:
  `Find…` (`CmdOrCtrl+F`), `Find Next` (`CmdOrCtrl+G`), `Find Previous` (`CmdOrCtrl+Shift+G`), all
  `registerAccelerator: false` (the renderer owns them, exactly like the palette/undo pattern), sending
  `find-open`, `find-next`, `find-previous`.
- Wire the new `MenuCommand`s in `shared/api.ts` and in the renderer's menu handler to `openFind`,
  `findNext`, `findPrevious`. In a Markdown guest file or with no note, they are no-ops like `⌘F`.
- Update the overlay command gate test's command list if it enumerates menu commands; a menu click while a
  modal is open must stay gated.

## 5. A note with a rich table cell must say so in the Library

The VH1 guard (`main/table-cell-guard.ts`) refuses such a note **before** `repository.open`, so it opens in
the unreadable/recovery state and `document.json` stays byte-identical — but the Library row looks normal.

- Put the same judgement in the Library scan (whatever produces the row status: `main/library.ts` plus
  core's package scan) so the row carries the unreadable state exactly like a corrupt note, with the same
  short line, and opening still refuses (no migration, no lock, no write).
- Do not move the open-time guard: it must stay before `repository.open`.
- Tests: a rich-cell package lists as unreadable, opening it still refuses with the short line and a byte-
  identical file; inline-only tables list and open normally. A large-ish library (the existing vault
  fixture) still scans without reading every document twice — say the cost in the report if you add a parse.

## 6. `⇧Esc` closes the find again

The catalogue's Escape chord requires an unmodified key, so `⇧Esc` stopped closing the find (B1 recorded
it). Restore it as a second chord on the find-close entry, not by loosening every Escape.

- Test: `⌘F`, type, `Shift+Escape` closes the bar; `Esc` still does.

## 7. The two intermittent UI suites

`tests/ui/page-scroll.test.mjs` and `tests/ui/m4b1b1-page-edit-overlay.test.mjs` fail occasionally when the
machine is loaded (never standalone). Both must become deterministic. This is diagnostic work, not a
retry wrapper:

- Reproduce: run each suite standalone in a loop (at least 5 consecutive runs each) and, if possible, once
  with a parallel UI group as load. Record the exact failing line and the state at failure.
- Fix the missing condition: replace fixed frame counts, `waitForTimeout`s or "type then assert" sequences
  with condition waits (the harness already has selectors/assertion helpers). If the evidence says the app
  loses an event — e.g. a keystroke typed before the Page Edit overlay owns focus — fix the **product**
  race and keep the test as the regression.
- Do not add either suite to `SERIAL_FILES` unless a shared OS resource is proven (they do not use the
  clipboard).
- Evidence: the loop output (5 green runs each), the failing case if reproduced, and what changed.

## Out of scope

- The empty-child block floor (product owner's call), Settings → Data, crop/region re-pick, the 1,000-block
  scroll frame, the highlighter/find/Page code, B2's files.
- Any new shortcut beyond `⌘P` and the menu accelerators above.

## Files

Read: `editor/SelectionToolbar.tsx`, `shell/overlay-owner.ts`, `lib/shortcuts.ts`, `App.tsx`,
`main/menu-template.ts`, `shared/api.ts`, `main/table-cell-guard.ts`, `main/library.ts`, the core package
scan, `tests/ui/m3-reference.test.mjs`, `tests/ui/ui-editor-shortcuts.test.mjs`,
`tests/ui/ui-overlay-command-gate.test.mjs`, `tests/ui/vault-library.test.mjs`,
`tests/ui/data-recovery.test.mjs`, `tests/ui/page-scroll.test.mjs`,
`tests/ui/m4b1b1-page-edit-overlay.test.mjs`.

Expected to touch: the files above plus the catalogue unit test and the report
`docs/reports/p2-polish.md`. Not `styles.css`, not the settings files, not `code-palette.test.ts`.

## Acceptance criteria

- [ ] With a modal open, the selection bubble is gone from the tree and comes back on close.
- [ ] `⌘⇧[` / `⌘⇧]` cycle tabs on a US layout (by `event.code`), `⌃Tab` still works, and no dead binding is
      left in the catalogue.
- [ ] `⌘P` opens Export PDF; `⇧⌘E` does not; menu, header and Settings agree.
- [ ] `Edit` has the three Find items with the standard accelerators, they work from the menu, and they are
      gated behind a modal like every other command.
- [ ] A rich-cell note lists as unreadable in the Library; opening it still refuses byte-identically; a
      normal note and an inline-table note are unaffected.
- [ ] `⇧Esc` and `Esc` both close the find.
- [ ] `page-scroll` and `m4b1b1` pass 5 consecutive standalone runs each, with the wait fixed or the product
      race fixed; report the evidence.
- [ ] No behaviour change beyond these items; no page geometry, print or document-format change.

## Tests and evidence

- Targeted: `npx vitest run`, `node tests/ui/run.mjs --group shell --concurrency 2`,
  `node --test tests/ui/m3-reference.test.mjs tests/ui/ui-editor-shortcuts.test.mjs
  tests/ui/ui-overlay-command-gate.test.mjs tests/ui/vault-library.test.mjs`, the two suites in a loop.
- End of task: `npm run verify:fast`. Do not run `npm run verify` (the Orchestrator runs it after both
  merges, with no builder active).
- Screenshots in `artifacts/p2-polish/`: the bubble hidden behind a dialog, the Edit menu, the Library row
  for a rich-cell note, the Settings row for Export.

## Stop and ask

- if the rich-cell row needs a core-boundary change beyond the scan (say what);
- if the intermittent failure reproduces as a product race you cannot fix without touching Page Edit
  geometry or the paginator;
- if replacing `⇧⌘E` breaks a suite that asserts the old key in more than the obvious places.

## Report format

Summary, files changed, checks with timings, pass/fail per criterion, the loop evidence for the two suites,
risks, next step. One commit; do not merge.
