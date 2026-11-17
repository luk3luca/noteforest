# Dialogs + Settings copy — batch A+B (frame and Details)

**Role:** Implementer / Builder
**Date:** 16 November 2026
**Brief:** `docs/tasks/dialog-copy-a-b.md`
**Design:** `docs/design/dialogs.md`, `docs/design/copy-plan.md` rows A and B,
`docs/design/copy-audit.md` §2/§5
**Worktree:** `a builder worktree`
**Base:** `0574ede` (the docs commit that adds the brief and the C+D brief)
**Commit:** one worktree commit — this report commit on top of `0574ede`; not merged, not pushed

## Summary

### A. The frame — done

- `shell/DialogFrame.tsx` is the single implementation: optional kicker, one
  `h2` title (sentence case), `aria-labelledby` (no double label), the 28 px
  header X (`aria-label="Close"`, `title="Close (Esc)"`, same action as
  Cancel/Esc, never confirms), one-line description, scrolling body, and a fixed
  footer with the slots `[navigation] … [secondary] [primary]`. The `…` slot is
  a spacer; no empty menu is rendered.
- Sizes are semantic: `default` = 480, `records` = 560. The 640 `wide` prop,
  `.nf-dialog-modal-wide`, and its CSS are removed; no dialog is 640.
- `focusSecondary` focuses the secondary slot on open. Applied to the danger
  dialogs D02 (Trash), D06 (Markdown close), D07 (external change), D14 (close
  tab), D15 (reload), D16 (overwrite), D20 (delete block); the field dialogs keep
  their `autoFocus` field and status dialogs focus the dialog container.
- Focus returns to the trigger on unmount (explicit restore after React Aria’s
  own restore, skipped when another dialog is open). Proven in the new suite for
  the save-failure banner trigger and in `v0-shell-frame` for a tab menu trigger.
- Danger remains the existing outlined style (`--danger` ink, `--danger-border`
  1 px, the normal button surface, 12 % danger hover); the suite proves the
  danger primary is not filled with the danger colour and is never the default
  focus.
- Insert table moved onto the frame at 480 (title, description, X, footer slots);
  its own overlay/header/action row are gone and the 10 × 10 grid stays.
- Settings and the Export sheet keep their own layouts. Settings already had
  `Saved` … `Done`; it now uses the same header X (`aria-label="Close"`,
  `title="Close (Esc)"`, 13 px lucide X) and the same sentence-case title. The
  Export sheet already was 560 with a per-state footer; it now uses the shared
  `nf-dialog-actions` slot classes plus the spacer and the same header X. Its
  max width follows the 48 px inset.
- The health repair modal is untouched (copy, geometry, header, footer). Global
  frame CSS additions do not change it: its own `.nf-health-dialog-*` rules and
  title padding win, and the document-health suite (footer geometry, modal
  width) is green.

### B. Copy rows A and B — done

- Every A and B row from `docs/design/copy-plan.md` is applied verbatim as a
  single worktree commit. `DELETE` rows are removed (the three save/restore
  trailing notes, the reference trailing note, the table preflight line, the
  export code line, the settings engine/rationale lines, the raw message
  paragraphs); `KEEP` rows are untouched.
- Dialog changes include: `New library`, `Create library`, the four Trash
  descriptions, `Remove`, the new lock/newer-schema lines, the conflict/close
  copy, `No note open`, `Detach from parent?`, the math/Link/table/closes/reload/
  overwrite/restore/reference/move/delete/image copy, and the Alt text toasts.
- Settings changes cover `SettingsDialog` and `settings/*`: Page lens/margins/
  chrome/density, General saving, Editor shortcuts/saving, Data libraries/
  settings-file/document-map copy, the status labels, the newer/unreadable
  warnings, the reset/restore confirms, the Appearance help, Continuous help and
  reset, Export defaults, Page advanced help, the preview error, and the two
  controller fallbacks. The old computed content-area clause and every engine
  note are gone.
- Export sheet: `The file is named after the note.`, `Page layout`, the page-count
  line, the overwrite copy/help, the 18 → 12 failure sentences, `{block} ·
  {group}` warning rows with all messages in one Details block, and the code in
  Details.
- `lib/save-failure.ts` `overwriteConfirmation().description` is the new short
  sentence and no longer interpolates the path; `path` stays on the record for
  Details.
- Banned words: a new `apps/desktop/test/dialog-copy.test.ts` asserts every
  applied row verbatim, every deleted row absent, and scans the applied copy plus
  every string/template literal and plain JSX text node in the A/B modules for
  the banned list with an empty banned-word allowlist. The only excluded text is
  the plan’s B-01.31 KEEP label `Schema version` (a schema-file term the plan
  explicitly keeps; it is a KEEP row, not new copy).

### C. Details — done

- New `shell/Details.tsx`: native `<details>`/`<summary>` (summary `Details`,
  closed by default, state not persisted), one code line with
  `role="group" aria-label="Technical details"`, `user-select: text`, full value
  in `title`, two lines maximum, and a `Copy` button outside the summary that
  copies verbatim and toasts `Copied`. No telemetry and no external link.
- Hosts: D07 (Markdown path), D15 (reload path), D16 (overwrite path), D17 (raw
  backup-listing error), plus the Settings raw settings-file and document-map
  messages. The short line stays in the dialog.
- Envelopes: `ListBackupsFailure` gained `details?: string`; the main
  `listBackups` OS-error catch now returns the short `Backups couldn’t be listed.`
  with the raw error in `details`, and `restoreNewestBackup` carries the details
  through. `RestoreBackupFailure` gained the additive `details?: string` field for
  the C split; the dialog already renders it when present.
- D25 (`DetailsDialog`) exists with `Details`, the one code block (the
  `Technical details` group), `Copy` in the navigation slot and `Close` in the
  secondary slot. Its only specified trigger is the toast `Details` action, which
  is batch C; the frame suite opens it through a test-only hook
  (`window.__noteforestTest.openDetails`) and proves the 480 frame, copy, toast,
  and close.

### D. Tests and evidence — done

- New `tests/ui/ui-dialog-frame.test.mjs` (in `tests/ui/suites.mjs` and the
  `shell` group; `ui-suite-list` owns `copy-ab`): five real-app tests cover the
  480 dialogs (rename, new library, table size), the 560 record dialogs (delete
  block, link as reference, trash), the danger focus/Details/clipboard/focus
  restore path (reload, overwrite), restore backup, D25, all seven Settings
  pages, and the failed Export sheet. Each asserts exactly one `h2`,
  `aria-labelledby`, the X label/title/28 px, a one-line description, the exact
  footer order, exactly one primary on the right, and 480/560 with no 640.
- Updated `v0-shell-frame` (rename frame, X close, field focus, focus returns to
  the tab), `markdown-file-view` (new short lines + path Details),
  `document-lifecycle` (trash descriptions, path Details, `Remove`),
  `save-failure` unit (short overwrite description + path on the record),
  `m4d2-export-ui` (new summary, warning rows + Details, failed short line/code
  in Details), `ui-overlay-command-gate` (failed short line + Details),
  `ui-settings-recovery`, `ui-batch-a`, `ui-batch-b`, `ui-settings-advanced`,
  `ui-editor-shortcuts`, `m4e1-settings-platform` (the moved B rows).
- No whole-paragraph assertions: the suites assert the short line and the
  Details summary/value.

## Files changed

- `apps/desktop/src/renderer/src/shell/DialogFrame.tsx` — frame, X,
  `aria-labelledby`, one-line description, footer slots, 480/560, focus restore.
- `apps/desktop/src/renderer/src/shell/Details.tsx` (new) — disclosure + D25.
- `apps/desktop/src/renderer/src/shell/Dialogs.tsx` — A copy, Details hosts,
  560/focus slots, D25 host.
- `apps/desktop/src/renderer/src/shell/TableSizeDialog.tsx` — moved onto Frame.
- `apps/desktop/src/renderer/src/shell/SettingsDialog.tsx` — B copy, header X,
  Details hosts, reset/restore copy.
- `apps/desktop/src/renderer/src/settings/AppearanceSettings.tsx`,
  `ContinuousSettings.tsx`, `ExportSettings.tsx`, `PageAdvancedSettings.tsx`,
  `PageSettingsPreview.tsx`, `usePageSettingsController.ts`,
  `useContinuousSettingsController.ts` — B copy.
- `apps/desktop/src/renderer/src/export/ExportSheet.tsx`,
  `export/export-copy.ts` (new) — A-22 copy, warning rows/Details, failure map,
  header X/footer slots.
- `apps/desktop/src/renderer/src/lib/save-failure.ts` — A-16.1 description.
- `apps/desktop/src/renderer/src/state/shell.ts`,
  `apps/desktop/src/renderer/src/App.tsx`,
  `apps/desktop/src/renderer/src/global.d.ts` — D25 state + test-only opener.
- `apps/desktop/src/shared/api.ts`, `apps/desktop/src/main/library.ts` —
  additive `details?` on the backup failure types and the D17 listing split.
- `apps/desktop/src/renderer/src/styles.css` — frame header/size/footer slots,
  Details, removed 640/trash-path/grouped-warning rules, export inset.
- Tests: `apps/desktop/test/dialog-copy.test.ts` (new),
  `apps/desktop/test/save-failure.test.ts`, `apps/desktop/test/ui-suite-list.test.ts`,
  `tests/ui/ui-dialog-frame.test.mjs` (new), `tests/ui/suites.mjs`, and the
  updated suites listed above.
- `docs/reports/copy-ab.md` (this report).

## Checks run

| Check | Result | Timing |
|---|---|---|
| `npm run verify:fast` (boundaries, typecheck, unit, e2e) | exit 0 | **58.74 s** wall |
| — unit (`vitest run`) | 155 files / 1538 tests | 6.2 s |
| — e2e (`m2-editor`) | 16/16 | 45.7 s |
| `npm run test:ui:shell` | 19/19 suites, 0 page errors | **124.53 s** wall (123.9 s suites) |
| `ui-dialog-frame` alone | 5/5 | 14.7 s |
| `node tests/ui/run.mjs --group settings` (extra, touched B pages) | 12/12 | 59.2 s |
| Targeted suites (document-lifecycle, markdown-file-view, v0-shell-frame, m4d2, ui-overlay-command-gate, ui-settings-recovery, ui-batch-a/b, ui-settings-advanced, ui-editor-shortcuts, m4e1, special-text, document-health, r6, ui-appearance-v3) | green | as above |

Commands: `npm ci` was required in the fresh worktree; `npm run build` before
the UI runs. No fixed sleeps, no native dialogs, no weakened assertions.

## Acceptance criteria

- [x] Every Frame dialog has the header X, the labelled title, the footer slots,
      outlined danger, and the 480/560 size; no 640; `Cancel` focused on danger;
      focus restored.
- [x] Table size is on the Frame; Settings/Export keep their layouts but adopt
      X/title/footer slots; Export is 560; the health modal is unchanged.
- [x] Every A and B row is applied exactly; `DELETE` removed; `KEEP` untouched;
      no banned word in the A/B copy guard.
- [x] Details works in the dialog hosts, copies the value and toasts `Copied`;
      the short line stays.
- [x] The new `ui-dialog-frame` suite and the updated suites pass; no
      whole-paragraph assertions; `verify:fast` and `test:ui:shell` green;
      screenshots under `artifacts/copy-ab/`.
- [x] No pageerror; no schema/settings/Page/PDF/find/health change.

## Screenshots (`artifacts/copy-ab/`)

- `frame-rename-480.png`, `frame-new-library-480.png`,
  `frame-table-size-480.png`, `frame-reload-480.png`,
  `frame-overwrite-480.png`, `frame-details-480.png`.
- `frame-delete-block-560.png`, `frame-link-reference-560.png`,
  `frame-trash-560.png` (Details open), `frame-restore-backup-560.png`,
  `export-failed-details-560.png` (Details open).
- `settings-general.png`, `settings-appearance.png`, `settings-continuous.png`,
  `settings-page.png`, `settings-editor.png`, `settings-export.png`,
  `settings-data.png`.

## Risks and open questions

1. **D25 has no product trigger yet.** Its only specified trigger is the toast
   `Details` action (batch C). The dialog is complete and tested through the
   test-only `openDetails` hook; C wires the toast.
2. **One C-adjacent line is shipped for D17.** D17’s note requires the raw
   listing error in Details; `listBackups` therefore returns
   `Backups couldn’t be listed.` (the C-14.24 short line) plus `details`. This is
   the minimum needed for the D17 host and does not change behavior. The other
   `RestoreBackupFailure` OS-error splits remain for C; the field is additive.
3. **Continuous’s empty Preview section is removed.** B-03.6 deletes the help
   that was its only content; the `Preview` label survives as the right-rail
   heading (B-03.10 KEEP). A strict reading could ask for an empty section, which
   would be worse UI.
4. **One-line descriptions truncate with ellipsis.** D03/D04 use the path as the
   description; the full value is in the paragraph’s `title`. This follows the
   frame’s one-line rule.
5. **Details is visually two lines maximum.** Long paths and the newline-joined
   export messages are clipped visually; the exact value is in `title` and
   `Copy`. This follows the §3.1 cap.
6. **`Schema version` (Data & About) is a planned KEEP label** even though
   `schema` is in the banned list; the plan’s exact KEEP row wins. The guard does
   not treat it as new copy.
7. **The settings warning keeps the B-01.24 damaged-copy path line next to the
   raw-message Details.** B-01.24 is an explicit KEEP (“the path is the
   find-the-file case”), so the two technical values are not joined into one
   ` · ` line; joining would delete a kept element.

## Next suggested step

Batch C: the toast host opens D25, the main-process messages/envelopes split into
short lines + Details, the Save-failure banner/status panel adopt the shared
component, and the error/banner/toast copy rows land.
