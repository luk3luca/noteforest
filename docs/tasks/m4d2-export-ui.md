# M4d2 — Export PDF UI (temporary thin slice)

**Role:** Builder / Implementer  
**Milestone:** temporary export entry before the full-codebase Sentinel/settings inventory  
**Base:** `main` after M4c3 (`1a3eb62` plus M4d1/M4d2 briefs; exact SHA in the handoff)  
**Worktree:** assigned by the Orchestrator  
**Timebox:** 1 day

## Context

The M4c2 export engine and M4c3 PDF gate are merged, but there is **no
user-facing export entry**. The product owner cannot export showcase/stress from
the app. Add a temporary, functional UI now; the later UI rework will decide the
final button shapes/positions/contexts.

The export engine already provides `window.noteforest.exportPdf`,
`getExportJob`, `cancelExport`; the hidden window builds the model and writes
atomically. Do not change the engine unless a small preload/API addition is
needed for the save dialog.

## Goal

Let the user export the active document to PDF from the app:

- **File → Export PDF…** menu item;
- **command palette** action;
- a temporary **Export PDF** button in the Page toolbar;
- native save dialog with a sensible default filename and overwrite policy;
- clear progress, success (path), cancel, and typed error surfaces;
- works from both Continuous and Page (the engine does not need Page mounted).

## Decisions (confirmed by product owner)

- Temporary UI, no final design; the UI rework will reposition/restyle.
- File menu + command palette + Page toolbar button.
- Save dialog; explicit output path; overwrite confirmation.
- Progress/cancel; errors must name the affected blocks for preflight failures.
- No native dialogs in tests; use the existing `NOTEFOREST_E2E` dialog guard and
  override it explicitly in the export test.

## In scope

- Add a menu command (`export-pdf`) to `MenuCommand`/native File menu; renderer
  handles it and calls the export flow for the active document.
- Add a command palette action with the same command.
- Add a small `Export PDF` button to the Page toolbar (temporary; icon + label
  or accessible icon button) that runs the same flow.
- Save dialog:
  - main-process `dialog.showSaveDialog` (or an equivalent typed main/preload
    helper) with default filename from the document title + `.pdf`;
  - cancel returns no job and no error toast;
  - existing file prompts/uses explicit `overwrite` policy; do not silently
    replace.
- Export flow UI:
  - start job; show progress/“Exporting PDF…”;
  - poll `getExportJob`;
  - success: toast/dialog with the output path and an optional “Reveal in
    Finder” action;
  - failure: typed message, including preflight block names and asset warnings;
  - cancel action while running (`cancelExport`); no partial file.
- Handle no active document/read-only/blocked states with a clear message.
- Tests:
  - UI test triggers export via menu command and via Page button (or palette),
    uses a test-overridden save path, waits for `done`, asserts the PDF exists
    and page count/PDF inspection (reuse M4c2/M4c3 helpers);
  - save-dialog cancel leaves no file/job;
  - preflight-blocked document shows the error and leaves no file;
  - cancel while running cleans up;
  - no fixed sleeps/native dialogs; assert the dialog guard.
- Report at `docs/reports/m4d2-export-ui.md`.

## Out of scope

- Final Settings/UI rework, button shapes/positions, menu redesign.
- Density setting (M4d1) or page layout changes.
- Export engine changes; M4c2/M4c3 gates already cover page count/text/atomic.
- External `export.pdf` API, batch export, print dialog, Notability automation.
- Spec/UX/ADR changes, full-codebase Sentinel/refactor.
- Merge, push, PR, parent-checkout edits.

## Files to read

- `apps/desktop/src/main/menu.ts`, `apps/desktop/src/shared/api.ts` (`MenuCommand`).
- `apps/desktop/src/renderer/src/shell/CommandPalette.tsx`.
- `apps/desktop/src/renderer/src/App.tsx` (menu command routing, snapshot bridge).
- `apps/desktop/src/preload/index.ts`, `shared/api.ts`,
  `shared/export.ts` (export API/types).
- `apps/desktop/src/renderer/src/page/PageView.tsx` toolbar + `styles.css`.
- `apps/desktop/src/main/dialog-guard.ts`, `tests/support/ui-session.mjs`,
  `tests/ui/m4c2-pdf-export.test.mjs`, `tests/ui/m4c3-pdf-gate.test.mjs`.
- `docs/tasks/m4c2-export-orchestration.md`, `docs/reports/m4c2-export-orchestration.md`.

Expected to touch:

- `apps/desktop/src/main/menu.ts`
- `apps/desktop/src/shared/api.ts` (menu command)
- `CommandPalette.tsx`, `App.tsx`
- `PageView.tsx` (button only) + `styles.css`
- new export dialog/toast helper component if needed
- preload/main save-dialog helper if needed
- `tests/ui/` M4d2 suite, `package.json`
- `docs/reports/m4d2-export-ui.md`

## Acceptance criteria

- [ ] File → Export PDF…, command palette, and Page toolbar button all start the
      same export flow.
- [ ] Save dialog: default title.pdf, cancel safe, overwrite explicit.
- [ ] Progress, success path, cancel, typed preflight/engine errors.
- [ ] Works from Continuous and Page without Page mounted dependency.
- [ ] No partial file on cancel/failure; no native dialogs in tests.
- [ ] UI test covers menu + Page button, save/cancel, blocked document, cancel.
- [ ] Existing M4c1/M4c2/M4c3 suites stay green.
- [ ] Targeted tests + one `npm run verify:fast` with timings.
- [ ] Report maps criteria and lists risks.

## Stop and ask

Stop and report if:

- the save dialog needs a product decision (default folder, overwrite copy);
- the menu/palette/Page button conflict with an existing command or keybinding;
- the export job needs an engine/API change beyond a small preload helper;
- the UI test cannot avoid a native dialog deterministically;
- the baseline has unrelated failures.

## Report format

- Summary and scope.
- Files changed.
- Checks/timings.
- Acceptance pass/fail.
- Save/cancel/error/progress evidence.
- Open questions/risks.
- Worktree path, branch head SHA.
