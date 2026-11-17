# P2 — release polish

**Builder report.** One worktree (`t3/80b3bee1`, branch from `main` at `baad3ac`), one commit. Six small
fixes and the two intermittent UI suites from `docs/tasks/p2-polish.md`. B2's files (`styles.css`,
`useAppearanceSync.ts`, `AppearanceSettings.tsx`, the settings types/normalizer, `code-palette.test.ts`)
are untouched.

---

## Summary

1. **The selection bubble leaves the tree behind a modal.** `SelectionToolbar.shouldShow` returns `false`
   when `overlayOwnsCommands()` is true, *and* the component subscribes to the overlay owner and returns
   `null` while Settings/dialog, the palette or the Export sheet owns the channel. The subscription is
   required, not decorative: TipTap only re-evaluates `shouldShow` on an editor transaction, and opening a
   dialog dispatches none (its `updateOptions` path replaces the callback without re-checking visibility).
2. **The shifted-bracket tab bindings are real.** `Chord` gained an optional `code`; a chord with `code`
   compares `KeyboardEvent.code` only (the display still comes from `key`). `tab-previous-bracket` /
   `tab-next-bracket` declare `BracketLeft` / `BracketRight`, so `⇧⌘]` fires on a US layout where the
   character is `}`. Both stay `list: false`.
3. **Export PDF is `⌘P`.** The catalogue chord and the native File accelerator are `⌘P`; `⇧⌘E` is removed,
   not aliased (v1 is unreleased). The canvas header's `aria-keyshortcuts` is `Meta+P`, and its title, the
   palette hint and the Settings row all read the catalogue. The renderer also matches `⌘P` (the documented
   double-delivery convention for menu-owned keys; `dispatch` drops the second delivery in its 120 ms
   window), so the key works without the native menu.
4. **`Edit → Find… / Find Next / Find Previous`.** Three native items after Undo/Redo and a separator,
   before the clipboard roles, with `CmdOrCtrl+F` / `G` / `Shift+G` and `registerAccelerator: false`.
   `MenuCommand` gained `find-open`, `find-next`, `find-previous`; the renderer routes them to `openFind`,
   `findNext`, `findPrevious` with the same no-op rules as `⌘F`/`⌘G` (no note, Markdown guest file, no
   active find surface). The catalogue now owns the three menu accelerators, so the menu/catalogue equality
   test covers them.
5. **A rich table cell lists as unreadable.** The pure VH1 judgement moved to
   `packages/core/src/table-cells.ts` (exported from `@noteforest/core`) and the core vault scan applies it
   in `noteRow` to the document it has **already parsed**, so the row is `unreadable` with the same short
   line as a corrupt note. `apps/desktop/src/main/table-cell-guard.ts` is now a re-export, so the loader
   still refuses **before** `repository.open` — no lock, no migration, no write, `document.json` stays
   byte-identical. Cost: **no second read and no second parse**; the content walk runs only when the text
   mentions `tableCell`/`tableHeader` (see the read-count test).
6. **`⇧Esc` closes the find again.** `close-find` declares a second chord `{ key: 'Escape', shift: true }`;
   no other Escape grew a Shift variant.
7. **The two intermittent UI suites.** Diagnosed rather than retried: the load-sensitive constructs were
   fixed frame budgets. `page-scroll` waited a fixed 80 ms after 10–15 zoom clicks and 80/120 ms after
   PageUp/PageDown/ArrowDown, while Chromium *animates* page scrolls (trace: the first read after PageDown
   saw +7.5 px, the settled value 400 ms later was +718 px), so the old waits asserted a scroll in flight.
   `m4b1b1` had a 200 ms budget and two immediate "type then assert" reads. Both suites now wait on
   conditions (the reported zoom step, the landed offset, the travelled scroll distance, the overlay text)
   and the overlay mount/focus waits are 15 s. No retry wrapper; neither suite is in `SERIAL_FILES` (they
   do not touch the clipboard or any other shared OS resource).

---

## Files changed

- `apps/desktop/src/renderer/src/lib/shortcuts.ts` — `Chord.code`, code-first matching, `⌘P`, bracket
  codes, find menu accelerators, `⇧Esc` second chord.
- `apps/desktop/src/renderer/src/editor/SelectionToolbar.tsx` — overlay check in `shouldShow`, reactive
  `useOverlayOwnsCommands()` and `null` behind a modal.
- `apps/desktop/src/renderer/src/shell/overlay-owner.ts` — `useOverlayOwnsCommands()`.
- `apps/desktop/src/renderer/src/App.tsx` — renderer `⌘P` branch.
- `apps/desktop/src/renderer/src/actions.ts` — `find-open` / `find-next` / `find-previous` in
  `runMenuCommand`.
- `apps/desktop/src/renderer/src/shell/CanvasHeader.tsx` — `aria-keyshortcuts="Meta+P"`.
- `apps/desktop/src/main/menu-template.ts` — `CmdOrCtrl+P`; the three Find items.
- `apps/desktop/src/shared/api.ts` — three `MenuCommand`s.
- `apps/desktop/src/main/table-cell-guard.ts` — re-export of the core predicate.
- `packages/core/src/table-cells.ts` (**new**) — the pure rich-cell judgement (moved).
- `packages/core/src/index.ts` — export it.
- `packages/core/src/node/vault.ts` — the scan applies it in `noteRow`.
- `apps/desktop/test/shortcuts.test.ts` — brackets, `⌘P`, `⇧Esc`, the Edit menu items, `eventFor`/signature
  include `code`.
- `apps/desktop/test/copy-cd.test.ts` — Edit labels/ids and the File accelerator.
- `apps/desktop/test/library-rich-cell.test.ts` (**new**) — row state, refusal, byte identity, read count.
- `packages/core/test/vault-scan.test.ts` — rich-cell row vs inline row.
- `tests/ui/m3-reference.test.mjs` — bubble hidden behind a dialog and restored (item 1).
- `tests/ui/ui-editor-shortcuts.test.mjs` — Settings row, palette hint, `⌘P`/`⇧⌘E`, brackets, Edit → Find,
  `⇧Esc`; the Edit-menu JSON artifact.
- `tests/ui/ui-overlay-command-gate.test.mjs` — `findOpen`/`findQuery` in the snapshot; `⌘P` and the three
  Find commands are gated behind Settings.
- `tests/ui/data-recovery.test.mjs` — the Library row for the rich-cell note; the inline row stays `ok`.
- `tests/ui/page-scroll.test.mjs`, `tests/ui/m4b1b1-page-edit-overlay.test.mjs` — condition waits (item 7).
- `docs/design/shortcuts.md` — the P2 status note and the closed open items.
- `docs/reports/p2-polish.md` — this report.

Not touched: `styles.css`, `useAppearanceSync.ts`, `AppearanceSettings.tsx`, the settings types/normalizer,
`code-palette.test.ts`.

---

## Checks

| Check | Result | Time |
|---|---|---|
| `npm run check:boundaries` | 289 files, 1404 imports, 16 rules | 0.4 s |
| `npm run typecheck` (4 workspaces) | pass | 5.7 s |
| `npx vitest run` (169 files) | 1725 passed (was 1717; +8 new) | 9.3 s |
| the four targeted suites together | 27/27, exit 0 | 28.4 s |
| `m3-reference` (in that run) | 6/6 (new bubble case) | 11.5 s |
| `ui-editor-shortcuts` (in that run) | 10/10 (4 new) | 6.1 s |
| `ui-overlay-command-gate` (in that run) | 7/7 | 7.8 s |
| `data-recovery` (in that run) | 4/4 (2 + 2: rich row, inline row) | 2.1 s + 5.6 s |
| `node tests/ui/run.mjs --group page --concurrency 4` (before the fixes) | 20/20 | 116.9 s |
| `node tests/ui/run.mjs --group page --concurrency 4` (after the fixes) | 20/20 | 111.9 s (page-scroll 17.9 s, m4b1b1 20.6 s) |
| `page-scroll` standalone × 5 (after the fixes) | 8/8 each | 16.18–16.65 s |
| `m4b1b1` standalone × 5 (after the fixes) | 10/10 each | 18.55–18.64 s |
| `npm run verify:fast` | **exit 0** | 61.7 s (boundaries 289 files / 1404 imports / 16 rules; typecheck 4 workspaces; 169 unit files / 1725 tests; e2e 16/16) |

`npm run verify` was **not** run (the Orchestrator runs it after both merges).

### The loop evidence (item 7)

Baseline before any change (the current `out/` build, the unchanged suites):

```
=== page-scroll run 1 === exit=0  # pass 8  # fail 0  real 16.76
=== page-scroll run 2 === exit=0  # pass 8  # fail 0  real 16.74
=== page-scroll run 3 === exit=0  # pass 8  # fail 0  real 16.94
=== page-scroll run 4 === exit=0  # pass 8  # fail 0  real 16.67
=== page-scroll run 5 === exit=0  # pass 8  # fail 0  real 16.69
=== m4b1b1 run 1 === exit=0  # pass 10  # fail 0  real 19.07
=== m4b1b1 run 2 === exit=0  # pass 10  # fail 0  real 19.12
=== m4b1b1 run 3 === exit=0  # pass 10  # fail 0  real 19.49
=== m4b1b1 run 4 === exit=0  # pass 10  # fail 0  real 19.51
=== m4b1b1 run 5 === exit=0  # pass 10  # fail 0  real 19.43
```

Full logs: `artifacts/p2-polish/page-scroll-run-{1..5}.log`, `artifacts/p2-polish/m4b1b1-run-{1..5}.log`,
summary `artifacts/p2-polish/page-scroll-loop-baseline.txt` / `m4b1b1-loop-baseline.txt`.

After the fixes:

```
=== page-scroll run 1 === exit=0  # pass 8  # fail 0  real 16.21
=== page-scroll run 2 === exit=0  # pass 8  # fail 0  real 16.20
=== page-scroll run 3 === exit=0  # pass 8  # fail 0  real 16.22
=== page-scroll run 4 === exit=0  # pass 8  # fail 0  real 16.18
=== page-scroll run 5 === exit=0  # pass 8  # fail 0  real 16.65
=== m4b1b1 run 1 === exit=0  # pass 10  # fail 0  real 18.58
=== m4b1b1 run 2 === exit=0  # pass 10  # fail 0  real 18.62
=== m4b1b1 run 3 === exit=0  # pass 10  # fail 0  real 18.64
=== m4b1b1 run 4 === exit=0  # pass 10  # fail 0  real 18.64
=== m4b1b1 run 5 === exit=0  # pass 10  # fail 0  real 18.55
```

Full logs: `artifacts/p2-polish/page-scroll-after-{1..5}.log`,
`artifacts/p2-polish/m4b1b1-after-{1..5}.log`, summary `artifacts/p2-polish/loop-after-fix.txt`.

**The original failure did not reproduce.** Both suites were 5/5 standalone before the change and the page
group was 20/20 in a loaded pool (concurrency 4, B2's suites running on the same machine, load average
~5/10 cores). The evidence for the fix is therefore structural plus a trace, not a reproduced red run:

- `page-scroll` `setZoom` clicked the stepper 10–15 times and then waited a fixed 80 ms; the test read
  `data-page-zoom` next. The new wait reads the reported step.
- The keyboard-scroll block pressed PageDown/ArrowDown/PageUp and waited 120/80/120 ms, then compared
  `scrollTop`. A debug trace during the diagnosis showed Chromium animating the page scroll: immediately
  after `PageDown` the offset was still 787 (unchanged), the first settled read after two frames was
  794.5, and 400 ms later it was 1505. On an idle machine the 120 ms wait happened to land after enough
  of the animation; under load PageUp's 120 ms could elapse *before* its animation started, which is
  exactly an intermittent failure of `< arrowKey`. The test now waits for the travelled distance
  (`viewport / 2` for a page step, 1 px for a line step).
- `setScroll` now waits for the scroller to hold the requested offset (or the clamped end) instead of
  assuming the assignment landed; the two indicator assertions that follow a scroll wait for the page the
  centre names (`waitCurrentPage`).
- `m4b1b1` replaced its 200 ms budget and its two immediate `keyboard.type` → `textContent` reads with
  `waitOverlayText` (the same condition `typeInOverlay` already used), and the overlay mount/focus waits
  went from 5 s to 15 s. The 300-block case's `typingMs < 5000` wall-clock bound became `< 15000` with a
  comment: the hard responsiveness gate is `tests/perf`; this suite's product assertion is that typing
  does not re-run the page model, which is asserted separately.

No suite was added to `SERIAL_FILES`: neither uses the clipboard, the OS Trash, or any other shared
resource. No retry wrapper was added.

---

## Acceptance criteria

| Criterion | Verdict | Evidence |
|---|---|---|
| With a modal open, the selection bubble is gone from the tree and comes back on close | **PASS** | `m3-reference` new case: live selection → bubble visible with its Bold control → `⇧⌘L` opens Link as reference → `[data-testid="selection-toolbar"]` count `0` and no control reachable → `Esc` → bubble visible again. `artifacts/p2-polish/bubble-hidden-behind-dialog.png` |
| `⌘⇧[` / `⌘⇧]` cycle tabs by `event.code`, `⌃Tab` still works, no dead binding | **PASS** | unit `matches the shifted brackets by physical key on a US layout (P2)`; UI `cycles tabs with the shifted brackets by physical key and keeps Control+Tab (P2)` with two tabs; both entries stay `list: false` and are asserted so |
| `⌘P` opens Export PDF; `⇧⌘E` does not; menu, header and Settings agree | **PASS** | unit `binds Export PDF to ⌘P and leaves ⇧⌘E unbound (P2)` + menu/catalogue equality; UI `opens Export PDF with ⌘P and no longer with ⇧⌘E (P2)` (header `title`/`aria-keyshortcuts`, sheet opens, `⇧⌘E` leaves it closed); Settings row `Export PDF… ⌘P`; palette hint `⌘P` |
| `Edit` has the three Find items with the standard accelerators, they work from the menu, and they are gated behind a modal | **PASS** | unit `mirrors the Find menu items and their renderer-owned accelerators` (labels, accelerators, `registerAccelerator: false`, click → command, position after Redo/before Cut); UI `runs Edit → Find, Find Next, and Find Previous from the native menu (P2)`; gate test asserts `find-open`/`find-next`/`find-previous` and `⌘F` change nothing behind Settings (`findOpen`/`findQuery` are now in the snapshot). `artifacts/p2-polish/edit-menu.json` (a native menu is OS-rendered, not DOM — see risks) |
| A rich-cell note lists as unreadable; opening it still refuses byte-identically; a normal note and an inline-table note are unaffected | **PASS** | core `vault-scan` (rich row `unreadable` + reason, inline row `ok`); `library-rich-cell.test.ts` (short line, `openStore` recovery, no lock/store/dirty, byte-identical, inline + plain open, one `document.json` read per note); UI `data-recovery` (row `data-doc-status="unreadable"`, reason line, status label, tooltip, recovery surface, bytes unchanged; inline row `ok`). `artifacts/p2-polish/library-rich-cell-row.png` |
| `⇧Esc` and `Esc` both close the find | **PASS** | unit `closes the find with Esc and ⇧Esc, and advertises neither (P2)`; UI `closes the find with Shift+Escape as well as Escape (P2)` |
| `page-scroll` and `m4b1b1` pass 5 consecutive standalone runs each, with the wait fixed | **PASS** | the loop output above; page group 20/20 under load before and after |
| No behaviour change beyond these items; no page geometry, print or document-format change | **PASS** | `schemaVersion` untouched, no layout/print file changed, no settings field added; the only new catalogue chords are the three menu accelerators (already existing renderer keys) and `⌘P` replacing `⇧⌘E` |

---

## Screenshots and artifacts

- `artifacts/p2-polish/bubble-hidden-behind-dialog.png` — text selected, Link as reference open, no bubble.
- `artifacts/p2-polish/library-rich-cell-row.png` — the Library row: warning glyph, title, “This note
  couldn’t be read.”, `Unreadable` label.
- `artifacts/p2-polish/settings/export-row.png` — Settings → Editor, `Export PDF… ⌘P`.
- `artifacts/p2-polish/page/export-header.png` — the Page canvas header's Export button.
- `artifacts/p2-polish/edit-menu.json` — the native Edit menu (ids, labels, accelerators) as the harness
  cannot capture an OS-rendered menu.

---

## Risks and open questions

1. **A native menu cannot be screenshotted by the harness.** It is not DOM; the JSON artifact plus the
   menu/catalogue unit test are the evidence. The product-owner visual pass can still look at it.
2. **The rich-cell row loses `documentId`/counts** exactly like a corrupt note (the row is the corrupt
   shape). A move/rename of such a package therefore does not reconcile its session/settings entry — the
   same limitation a corrupt note already has. Nothing opens or writes it either way.
3. **The rich-cell walk runs on every scan** for a document whose text mentions `tableCell`/`tableHeader`
   (every note with a table). It walks the parsed content once; it does not read or parse the file again
   (proved by the read-count test). A 300-block note with a table adds one linear walk per scan.
4. **`⌘P` has two delivery paths** (native accelerator + renderer branch), like `⌘S`/`⌘N`. The 120 ms
   `dispatch` dedupe makes one press one export; a deliberate double press inside 120 ms is dropped, the
   same as `⌘S`.
5. **The intermittent suites were fixed structurally, not from a reproduced red run.** The trace proves the
   old waits observed an animation in flight; the new waits are conditions on the effect. If the
   Orchestrator's full verify still shows a failure, the failing line will now name the condition that did
   not happen instead of a bare offset comparison.
6. **`m4b1b1`'s 300-block wall-clock bound is now 15 s** (was 5 s). The product invariant (typing does not
   re-run the page model) is unchanged and still asserted; the hard performance gate remains `tests/perf`.
7. **`docs/design/shortcuts.md`** is updated in place (status note + the closed items + the two Find rows).
   It is a design record, not spec/UX/ADR/plan.

---

## Next step

The Orchestrator runs one full `npm run verify` after both P2 and B2 are merged, with no builder active.
The product-owner visual/VoiceOver pass over the new Edit menu and the Settings Export row remains open.
