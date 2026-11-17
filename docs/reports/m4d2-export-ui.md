# M4d2 — Export PDF UI (temporary thin slice)

**Role:** Implementer / Builder
**Base:** `main` at `bceeeed` (M4c3 integration `1a3eb62` + M4d1/M4d2 briefs)
**Date:** 9 November 2026
**Worktree:** `a builder worktree`
**Branch:** `t3/c1f3b2d2`
**Head:** the tip of `t3/c1f3b2d2` (full SHA in the handback message)

## Summary and scope

Adds the confirmed temporary export entry before the UI/settings rework:

- **File → Export PDF…** (`menu-export-pdf`, `⌘⇧E`, matching `docs/ux.md` §T5).
- **Command palette** action with the same shortcut hint.
- A temporary **Export PDF** button in the Page toolbar (icon + label).
- One shared renderer flow for all three entries: native save dialog →
  optional explicit replacement → `window.noteforest.exportPdf` →
  `getExportJob` polling → done/failed/cancelled.
- A small non-modal export panel with progress + phase, Cancel while running,
  the output path, Reveal in Finder, typed failures (including preflight block
  names and warnings), and an explicit **Replace PDF** confirmation.
- Works from Continuous and Page; the Page view never needs to be mounted. The
  engine is unchanged; the only main-process additions are the save-dialog and
  reveal helpers (M4c2 already owns the job, hidden window, `printToPDF`,
  atomicity, and cancellation).

Out of scope and untouched: density (M4d1), final Settings/UI, engine/API
export changes, external `export.pdf`, batch/print dialogs, spec/UX/ADR, merge.

## Files changed

New:

- `apps/desktop/src/renderer/src/export/export-flow.ts` — shared flow, visible
  state (zustand), job polling, explicit replacement, cancel/reveal, action
  reporting, test-only flow history.
- `apps/desktop/src/renderer/src/export/ExportStatusPanel.tsx` — progress /
  replace / done / failed panel.
- `apps/desktop/test/export-ui-filename.test.ts` — `<title>.pdf` sanitization.
- `tests/ui/m4d2-export-ui.test.mjs` — 7 E2E flows (menu, Page button, palette,
  save-cancel, preflight block, cancel-while-running, explicit overwrite,
  no-document).
- `docs/reports/m4d2-export-ui.md` — this report.

Modified:

- `apps/desktop/src/shared/export.ts` — `ChooseExportPathResult` and
  `pdfFileNameForTitle` (shared by renderer and main).
- `apps/desktop/src/shared/api.ts` — `export-pdf` menu command,
  `chooseExportPath`, `revealExport`, type re-export.
- `apps/desktop/src/preload/index.ts` — two bridge methods.
- `apps/desktop/src/main/index.ts` — `export:choose-path` (guarded
  `showSaveDialog`, `defaultPath = title.pdf`, `.pdf` enforced, `stat` for the
  replacement hint) and `export:reveal`.
- `apps/desktop/src/main/menu.ts` — File → Export PDF… (`CmdOrCtrl+Shift+E`).
- `apps/desktop/src/renderer/src/actions.ts` — palette entry + menu routing.
- `apps/desktop/src/renderer/src/App.tsx` — mounts the panel, test-only export
  state/history; fixes a pre-existing dedupe bug that dropped the first menu
  command issued within 120 ms of renderer start (see Risks).
- `apps/desktop/src/renderer/src/page/PageView.tsx` — toolbar button only.
- `apps/desktop/src/renderer/src/styles.css` — panel styles.
- `apps/desktop/src/renderer/src/global.d.ts` — test bridge types.
- `package.json` — the new UI suite is part of `test:ui` and `verify`.

## Behavior

1. **Entry.** All three entries call `exportActiveDocument()`. The menu command
   is routed by the existing `runMenuCommand` switch; the palette calls the same
   function directly; the Page toolbar button calls it directly.
2. **No active document.** A clear toast (`Open a document before exporting a
   PDF.`) and no save dialog. A read-only (locked) document is *allowed* to
   export, because export never mutates the package; no extra gate was added.
3. **Save dialog.** Main-process `dialog.showSaveDialog` with
   `defaultPath = <title>.pdf` (sanitized: separators/reserved/control
   characters → spaces, empty → `Untitled.pdf`, one `.pdf` only), `Export`
   button, PDF filter, `createDirectory` + `showOverwriteConfirmation`. A bare
   filename keeps the OS/Electron default folder; a product default folder is
   left to the UI rework. Cancel returns `{ canceled: true }`: no job, no error,
   no panel, no file.
4. **Explicit overwrite.** The helper also reports `exists`. If true, the panel
   shows **Replace existing PDF?** with `Replace PDF` / `Cancel`; only Replace
   starts the job with `overwrite: true`, and Cancel keeps the file
   byte-identical. The engine still refuses to clobber with `overwrite: false`
   (`link` no-clobber), so a file created after the dialog is also safe.
5. **Progress/cancel.** The panel mirrors `getExportJob` every 120 ms with the
   real phase (`queued → snapshot → model → print → validate → write`), a
   progress bar/percent, and Cancel → `cancelExport`. The terminal `cancelled`
   state clears the panel, shows `Export cancelled.`, and leaves no output or
   partial file.
6. **Success.** `PDF exported`, page count, output path, optional warnings, and
   **Reveal in Finder** (main-process `shell.showItemInFolder`, absolute `.pdf`
   validated). **Done** dismisses.
7. **Failure.** `Export failed` with the typed code and message; preflight
   details list the affected block title (e.g. `Tall block`), plus asset/page
   warnings. No file and no partial file are produced.
8. **Works from Continuous and Page.** The Flow only uses the open runtime; in
   the menu test the Page view is never mounted (``.nf-page-view` count 0).

## Acceptance

| Criterion | Status | Evidence |
| --- | --- | --- |
| File menu, palette, and Page button start the same flow | **Pass** | `actions.ts` / `PageView.tsx` call `exportActiveDocument`; tests 1, 2, 3 and the overwrite test use menu, Page button, and palette. |
| Default `title.pdf`, cancel safe, overwrite explicit | **Pass** | `defaultPath` asserted `Export menu.pdf`, `Page callout modes.pdf`, `Palette cancel.pdf`; save-cancel leaves status `idle` with no job; replacement prompt + hash-identical cancel. |
| Progress, success path, cancel, typed preflight/engine errors | **Pass** | History `running 0.05 → print 0.5 → validate 0.75 → done`; success panel with path/page count; cancel returns `idle`, 0 files; `preflight-blocked` names `Tall block`. |
| Works from Continuous and Page without Page mounted | **Pass** | Test 1 asserts no `.nf-page-view`; test 2 exports from Page Read. |
| No partial file on cancel/failure; no native dialogs in tests | **Pass** | `cancel/` empty after cancel; blocked export writes no file; tests either override `showSaveDialog` (guard list empty) or use the guard and assert its recorded `showSaveDialog`. |
| UI tests cover menu + Page button, save/cancel, blocked, cancel | **Pass** | 7/7 in `tests/ui/m4d2-export-ui.test.mjs`. |
| M4c1/M4c2/M4c3 suites stay green | **Pass** | Targeted M4c1 6/6, M4c2 7/7, M4c3 gate 3/3, M4b1 9/9, M4b1a2 2/2; full lists remain in `verify`. |
| Targeted tests + one `verify:fast` with timings | **Pass** | See Checks/timings. |
| Report maps criteria and lists risks | **Pass** | This report. |

## Evidence

Artifacts (gitignored, produced by the suite):

- `artifacts/m4d2/page-export-panel.png` — Page Read with the toolbar
  **Export PDF** button and the success panel (path, page count, Done,
  Reveal in Finder).
- `artifacts/m4d2/export/export-ui-evidence.json` — per-case evidence:
  menu default path/history, page-toolbar page count, save-cancel default path
  and `idle`, the full `preflight-blocked` error naming `Tall block`, cancel job
  id + 0 output files, explicit overwrite flag and first hash, no-document case.
- `artifacts/m4d2/export/menu.pdf`, `page-toolbar.pdf`, `replace.pdf` — real
  inspected PDFs; page count matches the job, A4 geometry within 0.25 mm, body
  text extractable.

Observed flow (menu case):

```text
running queued 0   → running snapshot 0.05 → running print 0.5
→ running validate 0.75 → done 1
```

Blocked case message (abbreviated):

```text
preflight-blocked: Export blocked: Block Tall block: Block tall has no safe
break inside page 1's content height (703 px). It overflows by 4136 px rather
than being cut. Export is blocked.
```

## Checks and timings

Environment: Node 22.23.1, `npm ci` in the worktree (no dependency changes).

- `npm run check:boundaries` — 162 files, 796 imports, 16 rules; pass.
- `npm run typecheck` — all workspaces; pass.
- `npm run build` — desktop production build; pass.
- `node --test tests/ui/m4d2-export-ui.test.mjs` — 7/7 pass, suite 6.33 s,
  wall 14.6 s (7 Electron launches; hidden except the screenshot case).
- `npm run verify:fast` (final) — exit 0:
  - boundaries + typecheck pass;
  - unit **98 files / 962 tests**, 2.44 s (baseline 97/959 plus the new
    filename test);
  - critical e2e **16/16**, 44.0 s;
  - single command, exit 0.
- Targeted regression runs:
  - `tests/ui/m4c2-pdf-export.test.mjs` — 7/7, 14.1 s.
  - `tests/ui/m4c3-pdf-gate.test.mjs` — 3/3, 19.8 s.
  - `tests/ui/m4c1-print-compositor.test.mjs` — 6/6, 11.9 s.
  - `tests/ui/m4b1-page-view.test.mjs` — 9/9, 14.4 s.
  - `tests/ui/m4b1a2-read-mode-gating.test.mjs` — 2/2, 12.5 s.
- No renderer `pageerror`/console errors in the M4d2 suite (`after` assertion).

## Open questions / risks

- **Default folder is not a product decision.** The dialog suggests only the
  filename, so Electron/OS chooses the last-used/default folder. The UI rework
  should decide a default (Documents/Downloads/last used) and whether the
  export path is remembered per document.
- **Pre-existing dedupe bug fixed.** The menu dispatcher used `?? 0` for "last
  dispatch", so the first menu command within 120 ms of renderer start was
  dropped. The no-document export test exposed it. The fix only changes the
  missing-entry case; intentional rapid-repeat dedupe is unchanged.
- **Read-only documents are exported, not blocked.** Export is a read
  operation and the snapshot comes from memory. If the product wants a
  confirmation for a locked/read-only package, that is a later UX decision.
- **Reveal in Finder is not exercised in E2E** to avoid opening Finder on the
  test machine; the button is rendered and the IPC validates absolute `.pdf`
  paths. The product owner can try it manually.
- **Overwrite prompt is a renderer panel**, not a native message box. This
  keeps tests deterministic and avoids a second OS dialog; the engine's
  no-clobber check remains the final guard. The UI rework may replace it with
  a sheet.
- **Panel placement is temporary** (fixed bottom-right above the status bar) and
  may overlap a sonner toast in edge cases; intentionally minimal until the UI
  rework.
- **No engine changes.** Only one preload/main helper pair was added
  (`export:choose-path`, `export:reveal`), as allowed by the brief.

## Next step

Orchestrator: run the single full `npm run verify`, inspect the Page Read
screenshot, and hand the build to the product owner for the File-menu/Page-
button/Notability check. The UI rework should then decide the final export
entry points and the default output folder.

## Integration

- Merged to `main` as `01608bd` (base `bceeeed`).
- The new Page toolbar button exposed a fit-page oscillation at 960 px:
  the wrapping toolbar changed the viewport height, which changed the
  fit-page zoom and the sheet size. The temporary fix keeps the Page toolbar
  on one rail (`flex-wrap: nowrap; overflow-x: auto`); the final narrow-width
  layout belongs to the UI rework.
- One full `npm run verify` on the integrated tree after the M4d1 density
  merge: **exit 0** — **99 test files / 982 tests**, **37 UI suites / 129
  tests**, **16 critical e2e**, **14 recovery**, **0 pageErrors**.
