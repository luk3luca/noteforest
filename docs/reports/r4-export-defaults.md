# R4 — Export defaults (schema v4) + status surfaces

**Role:** Implementer / Builder  
**Date:** 13 November 2026  
**Worktree:** `a builder worktree` (fresh from `main` at `43154e8`)  
**Branch:** `t3/667c35c1` (fresh from `main` at `43154e8`)  
**Commit:** one worktree commit (not merged, not pushed).  
**Brief:** `docs/tasks/r4-export-defaults.md`

## Summary

### A. Export namespace + schema v4 — done

- `AppSettings` now has `export: { folder: string | null }`; `null` is the OS Documents folder.
  `normalizeExportSettings` trims a non-empty folder, and maps a missing/unknown/non-string/empty
  value to `null` (`packages/layout/src/page-settings.ts`).
- `SETTINGS_SCHEMA_VERSION` is **4**. The pure v3 → v4 migration loads `export.folder: null` without
  writing during a read; the next ordinary write stamps v4 and adds `export.folder`.
- `settingsDocumentForWrite` writes `export.folder` and preserves unknown top-level, page,
  appearance, and export keys. The version is never lowered; corrupt/unreadable/recovery behavior is
  unchanged. There is no document-schema or per-document export change.
- `export:defaults` resolves `settings.export.folder` when set, otherwise `app.getPath('documents')`.
  The session `lastExportFolder` override is deleted; `export:choose-folder` no longer persists a
  choice. The sheet starts at the resolved setting; Choose… changes only the current export.
- A missing folder uses the existing export write error (`write-failed`), creates nothing, and
  returns to Configure where Choose… is required.

### B. Settings → Export page — done

- New `ExportSettingsPage`: **Default folder** (path or `Documents`; native **Choose…**;
  **Use Documents** reset), a read-only sanitized `<title>.pdf` name note (`Untitled.pdf` with no
  document), and no Advanced area at all (no metadata/tagged/range/coming-soon).
- Global only: no scope switch. The **Export PDF…** action is kept with the existing overlay-gated
  flush behavior. Help copy states Page layout is always exported and no native save dialog is used.
- The Data page automatically shows schema 4 through the existing constant.

### C. Export sheet — done

- Removed the **Add date** checkbox/state/flow and the date helper. The filename is
  `<title>.pdf` (`Untitled.pdf` when empty) with the existing sanitization and fixed `.pdf` suffix.
- No metadata/tagged/page-range/Advanced rows. Kept folder Choose…, filename edit, in-sheet
  overwrite, preflight, progress/cancel/result/warnings, read-only/Continuous behavior, and one job
  at a time.

### D. Document-level error surfaces — done

- `SaveFailureBanner` is rewritten with the R3 neutral panel geometry: one 1 px neutral border,
  `--radius-panel`, `--surface-1`, warning/danger icon + title, body copy, and actions on the right.
  The 3 px danger left border and danger title bar are gone.
- The banner moved from `DocumentEditor` to shell chrome in `Workspace`, beside
  `DraftMaterializeBanner`/`DocumentStatusPanel`. The package path is inside a closed Details
  disclosure (plus the section `title`), not a primary monospace line.
- A draft failure suppresses `SaveFailureBanner` while `runtime.isDraft`; only
  `DraftMaterializeBanner` (Choose another library…/Retry) renders, and no `draft:<id>` text is
  visible. A real save failure keeps Retry, Restore backup, Save a copy, Reload, Reveal, and
  Overwrite for external modification.
- The no-left-accent guard now covers `nf-save-failure`, `nf-draft-banner`, `nf-status-panel`, and
  `nf-status-slim`, and asserts the neutral panel geometry.

## Files changed

- `packages/layout/src/page-settings.ts`
- `packages/layout/test/page-settings.test.ts`
- `apps/desktop/src/shared/settings-file.ts`
- `apps/desktop/src/shared/export.ts`
- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/renderer/src/state/settings.ts`
- `apps/desktop/src/renderer/src/App.tsx`
- `apps/desktop/src/renderer/src/export/export-flow.ts`
- `apps/desktop/src/renderer/src/export/ExportSheet.tsx`
- `apps/desktop/src/renderer/src/settings/ExportSettings.tsx` (new)
- `apps/desktop/src/renderer/src/shell/SettingsDialog.tsx`
- `apps/desktop/src/renderer/src/shell/Workspace.tsx`
- `apps/desktop/src/renderer/src/shell/SaveFailureBanner.tsx`
- `apps/desktop/src/renderer/src/editor/DocumentEditor.tsx`
- `apps/desktop/src/renderer/src/styles.css`
- `apps/desktop/test/settings.test.ts`
- `apps/desktop/test/settings-store.test.ts`
- `apps/desktop/test/export-ui-filename.test.ts`
- `apps/desktop/test/export-defaults.test.ts` (new)
- `apps/desktop/test/no-left-accent.test.ts`
- `tests/ui/m4d2-export-ui.test.mjs`
- `tests/ui/document-lifecycle.test.mjs`
- `tests/ui/ui-document-status.test.mjs`
- `tests/ui/ui-batch-a.test.mjs`
- `tests/ui/m4e1-settings-platform.test.mjs`
- `tests/ui/ui-settings-recovery.test.mjs`
- `tests/ui/ui-appearance-v3.test.mjs`
- `tests/e2e/m2-editor.test.mjs` (shell-scoped save-failure locator)
- `tests/recovery/m2f-backup-restore.test.mjs` (shell-scoped save-failure locator)
- `docs/design/ui-export-contents.md` (R4 decisions applied)
- `docs/reports/r4-export-defaults.md`

## Checks run

| Check | Result | Timing |
|---|---|---|
| `npm run check:boundaries` | pass, 195 files / 941 imports / 16 rules | included in verify |
| `npm run typecheck` | pass (desktop node + web; core/layout/pdf) | included in verify |
| `npx vitest run` | pass, 123 files / 1252 tests | 4.0 s (verify run) |
| `npm run verify:fast` (final) | **exit 0**, full run | **53.9 s total** |
| `npm run e2e` (inside verify:fast) | pass, 16 tests | 42.9 s |
| `node --test tests/ui/m4d2-export-ui.test.mjs` | pass, 11 tests | 12.8 s suite / 21.1 s process |
| `node --test tests/ui/document-lifecycle.test.mjs` | pass, 6 tests | 6.9 s / 15.1 s |
| `node --test tests/ui/ui-document-status.test.mjs` | pass, 4 tests | 7.0 s / 15.1 s |
| `node --test tests/ui/ui-batch-a.test.mjs` | pass, 6 tests | 7.8 s / 15.9 s |
| `node --test tests/ui/ui-settings-advanced.test.mjs` | pass, 8 tests | 11.1 s / 19.2 s |
| `node --test tests/ui/v0-shell-frame.test.mjs` | pass, 8 tests | 9.0 s / 17.1 s |
| `node --test tests/ui/m4e1-settings-platform.test.mjs` | pass, 4 tests | 4.2 s / 12.3 s |
| `node --test tests/ui/ui-settings-recovery.test.mjs` | pass, 6 tests | 3.2 s / 11.3 s |
| `node --test tests/ui/ui-appearance-v3.test.mjs` | pass, 6 tests | 7.9 s / 16.1 s |
| `node --test tests/ui/ui-overlay-command-gate.test.mjs` | pass, 7 tests | 6.5 s / 14.7 s |
| `npm run test:recovery:run` | pass, 14 tests | 18.2 s |
| `npm run build` | pass (required before UI suites; not timed separately) | — |

Targeted suites all have zero `pageErrors`. Screenshots:

- `artifacts/m4d2-export-ui/settings-export-documents.png`
- `artifacts/m4d2-export-ui/settings-export-custom.png`
- `artifacts/m4d2-export-ui/export-configure.png`
- `artifacts/document-lifecycle/draft-blocked.png` / `draft-blocked-light.png`
- `artifacts/ui-document-status/save-failure-dark.png` / `save-failure-light.png`

## Acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| `settingsVersion` is 4; v3 preserves page/appearance and gains `export.folder: null`; v4 round-trips; unknown fields survive; no document/per-document export schema | **Pass** | `settings.test.ts` R4 migration/round-trip/unknown-key tests; `page-settings.test.ts` normalization tests; full unit suite 1252 pass |
| Settings → Export shows Default folder (Documents or custom) with Choose…/Use Documents, read-only `<title>.pdf`, empty Advanced, Export PDF action | **Pass** | `m4d2-export-ui` Settings test + screenshots; `ui-batch-a` export page assertions (schema 4) |
| Sheet starts at the settings default; Choose… affects only this export; missing folder errors; filename `<title>.pdf` no date; no metadata/tagged/range rows | **Pass** | `m4d2-export-ui` default-folder, per-export, missing-folder, filename, and no-Advanced tests; overwrite test re-chooses per export |
| Save failure is a neutral detached panel with no left stripe, lives in shell chrome; draft failure shows only the draft banner with no `draft:<id>`; real failure keeps actions | **Pass** | `ui-document-status` R4 test (computed 1 px equal border edges, shell placement, actions, closed Details, dark/light); `document-lifecycle` draft assertions and light/dark screenshots; `no-left-accent` guard |
| No Page/PDF visual or print change, no R6, no native save dialog, no weakened tests; one commit | **Pass** | Page/PDF code untouched; boundary check pass; no save dialog added; existing tests updated for the moved banner and schema 4, not removed; single commit |

## Open questions / risks

- `export.folder` accepts any trimmed non-empty string. The absolute path is produced by the native
  folder picker; a hand-edited relative path is not rejected at load time and fails at export with
  the existing folder/write error. This avoids a renderer-side path parser.
- Repeated exports to a non-default folder require Choose… each time by design (the sheet no longer
  remembers the last pick). This is the R4 “setting is the source of truth” decision.
- The status strip can still read “Save failed” during a draft failure; it is a status label, not an
  error banner. The brief’s one-surface rule is satisfied for `SaveFailureBanner`.
- E2E/recovery suites locate the save-failure surface through `.nf-main-column` now; the surface
  identity (`data-save-failure`, code, title/message/actions) is unchanged.
- `export:defaults` reads `settings.json` per sheet open (no cache); this matches the store’s
  source-of-truth model and avoids stale defaults after a Settings change.
- No PDF visual/print suite was rerun beyond `verify:fast`; no Page/PDF code changed.

## Next step

**R6 Continuous design** (global Continuous settings), then the product-owner visual/VoiceOver pass
over R3/R4, the palette/sidebar/status bars, and the remaining Settings pages (manual breaks,
library/backup, search). R4 is delivered; R6 is the next settings block.
