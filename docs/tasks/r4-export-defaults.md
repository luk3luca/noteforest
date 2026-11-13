# R4 — Export defaults (schema v4) + status surfaces

**Role:** Implementer / Builder
**Milestone:** Post-library settings (R4)
**Base:** `main` head at delegation (`d33ed07` plus this brief)
**Worktree:** created by the delegate from that base; do not work in the main checkout
**Timebox:** 2 days

## Context

The product owner confirmed the R4 shape: a global `export` namespace with `settingsVersion: 4`,
default folder **Documents**, filename `<title>.pdf` **without a date**, an empty Advanced area
(no metadata, tagged PDF, or page range), and no per-document export defaults. The same batch also
fixes the document-level error surfaces: the old `SaveFailureBanner` still has a red left stripe
and lives inside the editor, while the lock panel and the new draft banner are neutral detached
panels. A draft materialization failure currently renders both the draft banner and the old save
banner, including the raw `draft:<id>` key.

The approved settings/export design is `docs/design/ui-export-contents.md`; the status-panel
language is the R3 `DocumentStatusPanel` (neutral surface, no colored left stripe).

## Goal

One worktree, **one commit**, one `npm run verify:fast`, targeted UI suites.

## In scope

### A. `export` namespace and schema v4

- Add `export: { folder: string | null }` to `AppSettings` (`packages/layout/src/page-settings.ts`):
  `null` means the OS Documents folder; a non-empty absolute path is a user default. Normalize
  unknown/missing values safely; default `null`.
- Bump `SETTINGS_SCHEMA_VERSION` to **4**. Extend the pure migration chain and
  `settingsDocumentForWrite`:
  - v3 → v4 adds `export.folder: null` when absent; v4 files round-trip;
  - unknown top-level and unknown `export` keys are preserved;
  - the version is never lowered; corrupt/unreadable settings keep the existing recovery behavior;
  - no document-schema change, no per-document export settings.
- The main process resolves the export default: `settings.export.folder` if set, otherwise
  `app.getPath('documents')`. `export:defaults` returns that folder (drop the session
  `lastExportFolder` override; the setting is the source of truth).
- The export sheet starts at the resolved default folder. **Choose… changes only the current
  export**; the saved default is changed only in Settings → Export. If the chosen/default folder is
  missing, show the existing folder error and require Choose…; never create/copy silently.

### B. Settings → Export page

Replace the current “Current behavior” placeholder with a real page:

- **Default folder**: resolved path (or “Documents” when `null`) + **Choose…** + **Use Documents**
  reset; global only, no scope switch.
- **File name**: read-only `<document title>.pdf`, sanitized, no date, no pattern editor.
- **Advanced**: not shown (empty). No metadata, tagged PDF, or page range controls; no disabled
  “coming soon”.
- Keep the **Export PDF…** action on the page. No native save dialog; the folder picker remains the
  only native surface. Update the help copy so it matches “Page layout is always exported”.
- No `settingsVersion` UI; the Data page can show v4.

### C. Export sheet

- Remove the **Add date** checkbox and `addDate` state/flow: the filename is `<title>.pdf`
  (`Untitled.pdf` when empty), with the existing sanitization and `.pdf` suffix.
- Remove the date branch from the shared filename helper/tests; no date anywhere.
- No metadata/tagged/page-range rows. The Advanced area stays absent.
- Keep: folder Choose…, filename edit, in-sheet overwrite, preflight, progress/cancel, result,
  warnings, read-only/Continuous behavior, one job at a time.
- Tests: default folder from settings, custom folder, missing folder error, no date, filename
  sanitize, overwrite, export from Continuous, read-only, no Advanced rows.

### D. Document-level error surfaces

Unify the save-failure, draft-materialization, and lock/read-only surfaces:

- Rewrite `SaveFailureBanner` with the R3 neutral panel geometry (1 px border, `--radius-panel`,
  `--surface-1`, warning/danger icon + title, body, actions on the right). **Remove the 3 px
  `--danger` left border and the danger title bar**; no colored left stripe. Keep the existing
  actions (Retry, Restore backup, Overwrite when applicable, Save a copy, Reload, Reveal), but
  group them cleanly.
- Move the save-failure surface from `DocumentEditor` into the shell chrome (`Workspace`) for the
  active runtime, next to the `DraftMaterializeBanner`/`DocumentStatusPanel`, so all document-level
  errors share placement and shape.
- **Draft failure**: show only `DraftMaterializeBanner` (Choose another library…/Retry); suppress
  `SaveFailureBanner` while `runtime.isDraft`; never show the raw `draft:<id>` key in visible text.
  For a materialized document, the path belongs in a Details/title, not a primary monospace line.
- Keep the draft banner copy and actions; keep the lock panel unchanged.
- Add a guard/test that `.nf-save-failure` has no left border/stripe; the no-left-accent guard must
  cover the save-failure/status surfaces as well.
- Tests: a draft materialization failure renders exactly one error surface (`data-save-failure`
  absent, no `draft:` text), a real save failure still shows its actions, the shell placement is
  outside the canvas, dark/light screenshots.

## Out of scope

- PDF metadata, tagged PDF, page range, filename pattern/date, per-document export defaults.
- Native save dialog, print pipeline changes, `PageSettings`/`PageTheme`, R6 Continuous.
- Draft/trash behavior beyond the error-surface suppression; library roots; search; backup UI.
- Any schema change other than `settingsVersion: 4` + `export.folder`.

## Files

Read:
- `docs/design/ui-export-contents.md`, `docs/reviews/settings-inventory.md` §20.8.
- `apps/desktop/src/shared/settings-file.ts`, `apps/desktop/src/renderer/src/state/settings.ts`,
  `packages/layout/src/page-settings.ts`.
- `apps/desktop/src/main/index.ts` (`export:defaults`, `export:choose-folder`),
  `apps/desktop/src/shared/export.ts`, `apps/desktop/src/renderer/src/export/export-flow.ts`,
  `export/ExportSheet.tsx`.
- `apps/desktop/src/renderer/src/shell/SettingsDialog.tsx`, `shell/Workspace.tsx`,
  `editor/DocumentEditor.tsx`, `shell/SaveFailureBanner.tsx`, `shell/DraftMaterializeBanner.tsx`,
  `styles.css`.
- Tests: `apps/desktop/test/settings-*.test.ts`, `export-*.test.ts`, `no-left-accent.test.ts`;
  `tests/ui/m4d2-export-ui.test.mjs`, `ui-batch-a.test.mjs`, `ui-batch-b.test.mjs`,
  `ui-settings-advanced.test.mjs`, `document-lifecycle.test.mjs`, `v0-shell-frame.test.mjs`.
- `docs/agents/brief-template.md`.

Expected to touch: the files above, their tests, `docs/design/ui-export-contents.md`, and
`docs/reports/r4-export-defaults.md`.

## Acceptance criteria

- [ ] `settingsVersion` is 4; a v3 file preserves page/appearance and gains `export.folder: null`;
      v4 round-trips; unknown fields survive; no document/per-document export schema.
- [ ] Settings → Export shows Default folder (Documents or a custom path) with Choose… and Use
      Documents, a read-only `<title>.pdf` note, an empty Advanced area, and the Export PDF action.
- [ ] The export sheet starts at the settings default; Choose… affects only the current export; a
      missing folder errors; the filename is `<title>.pdf` with no date; no metadata/tagged/range
      rows.
- [ ] Save failure uses the neutral detached panel, no left stripe, lives in shell chrome; a draft
      failure shows only the draft banner with its actions and no `draft:<id>` text; a real save
      failure keeps its recovery actions.
- [ ] No Page/PDF visual or print change, no R6, no native save dialog, no weakened tests; one
      commit.

## Tests and evidence

- Targeted: settings migration/write, export flow/name, main defaults, no-left guard, the export
  UI suite, `document-lifecycle`, `ui-batch-a`, `ui-settings-advanced`, `v0-shell-frame`.
- End of task: one `npm run verify:fast`. The Orchestrator runs the single full `npm run verify`.
- Screenshots: Settings → Export (Documents and custom folder), export sheet configured (no date),
  draft failure with one neutral banner, real save failure neutral panel, dark/light.
- No native OS dialog may block a test; use the existing `NOTEFOREST_E2E` folder-picker mock. No
  fixed sleeps; no weakened assertions.

## Stop and ask

Stop and report if:

- v4 needs a document-schema change or per-document export settings;
- the default folder cannot be resolved without a renderer/main API change beyond the described
  `export:defaults`;
- the status-surface unification conflicts with the R3 `DocumentStatusPanel` contract;
- a save-failure action cannot be preserved in shell chrome without losing per-tab identity;
- a baseline test fails for an unrelated reason.

## Report format

- Summary mapped to A–D.
- Files changed.
- Checks with real timings and suite counts.
- Acceptance criteria pass/fail with evidence.
- Open questions / risks.
- Next step (R6 design).
- Commit in the worktree; do not merge or push. One commit.
