# Dialogs + Settings copy — batch A+B (frame and Details)

**Role:** Builder
**Milestone:** copy sweep A+B (the visible dialog language)
**Base:** HEAD of `main` (the docs commit that adds this brief)
**Worktree:** provided by the orchestrator harness; work only there
**Timebox:** 4 days

## Context

The copy audit is done and the four rules are confirmed. `docs/design/dialogs.md` is the frame and
the inventory; `docs/design/copy-plan.md` is the exact old → new table (rows A and B are this
batch). The find surface v2 is merged; the health modal is the frozen reference and is not touched.

## Goal

Every Frame dialog and Settings use the same frame and the new copy: header X, fixed footer slots,
outlined danger, one sentence of description, and Details where a technical value exists. The
Builder substitutes the A and B rows verbatim; no judgement calls.

## In scope

### A · The frame

1. `DialogFrame`: optional kicker, sentence-case title, **header X** with `aria-label="Close"` and
   `title="Close (Esc)"`, `aria-labelledby` on the title (no double label), one-line description,
   body scroll, fixed footer. Sizes: 480 default, 560 for lists/records; the 640 `wide` modifier and
   `nf-dialog-modal-wide` are removed. Radius 8, one overlay shadow, 48 px inset.
2. Footer slots `[navigation] … [secondary] [primary]`: one primary; `Cancel`/`Close` in secondary;
   `Show in note`/`Back` in navigation; the `…` menu is **not shipped** until a dialog needs it
   (empty menu is not rendered). Danger is outlined, never filled; danger is never the default
   focus; focus returns to the trigger on close.
3. Confirm pattern: the dialog is the confirm; no nested modal stacks. `Enter` submits only a
   single-field dialog with no destructive choice; `Esc` = Cancel/Close.
4. Move **Insert table** onto the Frame (480) with title, description, X and footer.
5. Settings and the Export sheet keep their own layouts but adopt the header X, sentence-case title
   and footer slots (`Saved` … `Done`; per-state Export footer), and Export goes to 560.
6. The health repair modal is frozen; do not change its copy or footer.

### B · Copy A and B

7. Apply the exact `docs/design/copy-plan.md` rows:
   - **A** (Dialogs): A-01 … A-25, including the Export sheet (A-22) and the table-size frame
     (A-13), the Markdown conflict/close, Trash, Detach, Reload, Overwrite, Restore, Link as
     reference, Move, Delete block, image alt, the New library/folder/rename/move forms, and the new
     Details dialog (A-24).
   - **B** (Settings): every B row across `SettingsDialog` and `settings/*` — Page, Continuous,
     Appearance, Export, Data & About, previews and controllers. `DELETE` rows are removed, not
     reworded; `KEEP` rows are not touched.
8. `Details` (dialogs.md §3): the disclosure component (summary `Details`, one code line, `Copy`,
   `Copied`, no telemetry), the dialog hosts (D07, D15, D16, D17) and the dialog-related envelopes
   gain `details?: string` where a path/OS error is currently interpolated. The raw value moves to
   Details; the short line stays in the dialog. The toast host and the main-process envelopes are
   batch C, not here.
9. Banned words: the empty-allowlist guard runs over the A/B copy-bearing modules
   (`DialogFrame`, the dialogs, the Export sheet, the Settings modules, the save-failure/recovery
   helpers touched here). The C/D modules extend the same guard later.

### C · Tests and evidence

10. New `tests/ui/ui-dialog-frame.test.mjs` (+ `suites.mjs` + `ui-suite-list`): one `h2`, header X
    with `aria-label="Close"`, one-line description, footer order, `Cancel` focused on the danger
    dialogs, 480/560 width, no 640.
11. Update the existing suites named in dialogs.md §5 (rename dialog, Markdown conflict, trash
    lifecycle, save-failure unit, Export, Settings) to the new short lines and the Details summary.
    Do not assert whole paragraphs; assert the short line + the Details presence.
12. Screenshots under `artifacts/copy-ab/`: every Frame dialog state at 480/560, the table-size
    frame, the four Settings pages, the Export failed state with Details open, the save-failure
    banner? (banner is C). At least the dialogs and Settings.
13. `npm run verify:fast` green; `npm run test:ui:shell` green.

## Out of scope

- C+D rows: main-process errors and envelopes, banners/toasts, recovery surface, status bar,
  editor labels/menu/tooltips/palette, native menu sentence case.
- The toast `Details` action (C, pending product confirmation), the find labels/copy, the health
  modal, the `…` menu until needed, the `document`/`note` one-noun sweep.

## Files

Read:
- `docs/design/dialogs.md` (frame, inventory, Details, tests); `docs/design/copy-plan.md` (A/B rows);
  `docs/design/copy-audit.md` §2/§5; `docs/design/document-health-sidebar.md` (frozen reference).
- `shell/DialogFrame.tsx`, `shell/Dialogs.tsx`, `shell/SettingsDialog.tsx`, `settings/*`,
  `export/ExportSheet.tsx`, `shell/TableSizeDialog.tsx`, `lib/save-failure.ts`, `lib/recovery.ts`,
  `styles.css`, the test files in dialogs.md §5.

Expected to touch: the files above, a new Details component, the A/B test files, `styles.css`,
`docs/reports/copy-ab.md`.

## Acceptance criteria

- [ ] Every Frame dialog has the header X, the labelled title, the footer slots, outlined danger,
      and the 480/560 size; no 640; `Cancel` focused on danger; focus restored.
- [ ] Table size is on the Frame; Settings/Export keep their layouts but adopt X/title/footer slots;
      Export is 560; the health modal is unchanged.
- [ ] Every A and B row is applied exactly: no string differs from the plan; `DELETE` removed;
      `KEEP` untouched; no banned word in the A/B modules.
- [ ] Details works in the dialog hosts, copies the value and toasts `Copied`; the short line stays.
- [ ] The new `ui-dialog-frame` suite and the updated suites pass; no whole-paragraph assertions;
      `verify:fast` and `test:ui:shell` green; screenshots.
- [ ] No pageerror; no schema/settings/Page/PDF/find/health change.

## Tests and evidence

- Targeted: `npm test`, `npm run build && npm run test:ui:shell`, the new frame suite.
- End of task: `npm run verify:fast`.
- Screenshots as in C12.
- No native dialogs, no fixed sleeps; do not weaken assertions.

## Stop and ask

- if a dialog cannot fit 480/560 without a second scroll once its copy is cut;
- if the Export sheet cannot adopt the header/footer slots without a state redesign;
- if a copy row conflicts with a code behavior or a test's meaning;
- if a dialog Details needs a main-process envelope change that belongs to C;
- on any schema/settings/Page/PDF change.

## Report format

Summary, files changed, checks with timings, acceptance criteria pass/fail, risks, next step. Write
`docs/reports/copy-ab.md`, commit once in the worktree, do not merge, and report the worktree path
and the commit hash.
