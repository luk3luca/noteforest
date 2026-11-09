# M4e1 — Settings platform fixes (S2-1, S2-2, S2-5, S2-6)

**Role:** Implementer / Builder  
**Base:** `main` at `70b6a19` (M4e1/M4e2 briefs)  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-9fe348a5-e27f1c8e707763f5`  
**Branch:** `t3/m4e1-settings-platform-fixes`  
**Head (implementation):** `bdbbdc710cf47c23ec0746dd8ac3119e2a2e93c0`; the final
branch head adds this report.

## 1. Summary and scope

Closed the four settings-platform S2 findings from
`docs/reviews/full-codebase-settings-review.md` without changing the Settings
menu IA, density range/floors, PageTheme, layout/topology, or Page callout
behavior (M4e2 owns those).

- **S2-1:** Settings is now app-level. It opens with zero documents (⌘, and the
  palette), global controls work, and the per-document scope is disabled with a
  visible reason.
- **S2-2:** per-document overrides moved out of `SessionTabState` into a
  durable `app-support/document-settings.json` map keyed by canonical document
  id with a path fallback. Legacy session overrides are migrated once. Close →
  quit → relaunch → reopen restores them. Rename/move is id-based; a deleted
  package leaves a documented orphan that can never apply to another document id.
- **S2-5:** settings writes are serialized in the renderer and in the main
  process, the UI only reports "saved" after the atomic write succeeds, failures
  are visible and retryable, `settings.json` has `settingsVersion: 2` with a pure
  migration chain, corrupt files are copied to
  `settings.corrupt-<timestamp>.json` and warned in Settings (plus a bootstrap
  toast), unknown fields are preserved on write, and the global update path is an
  explicit partial merge (`updateAppSettings`) instead of a blind replace.
- **S2-6:** the dead `ContinuousSettings.zoom` (and its override/serialization
  path) is removed. The only Continuous zoom is the per-document
  `DocumentViewState.zoom`; a test proves it still works and that no settings
  zoom exists.

## 2. Files changed

### New

- `apps/desktop/src/shared/settings-file.ts` — versioned settings document,
  pure migration chain, unknown-field-preserving write merge.
- `apps/desktop/src/shared/document-settings.ts` — pure per-document identity
  rules: normalize, find (id first, path fallback), upsert/clear, adopt on
  rename/move, legacy session migration, deterministic serialization.
- `apps/desktop/src/main/document-settings.ts` — durable map file I/O,
  corrupt backup, serialized read-modify-write.
- `apps/desktop/test/document-settings.test.ts` — identity, rename/move,
  delete/orphan, migration, corrupt file, rapid writes.
- `tests/ui/m4e1-settings-platform.test.mjs` — no-document Settings, close →
  quit → reopen, corrupt warning, failed write/retry, Continuous zoom.

### Modified

- `packages/layout/src/page-settings.ts` — removed `ContinuousSettings`,
  `ContinuousSettingsOverride`, `DEFAULT_CONTINUOUS_SETTINGS`,
  `normalize/mergeContinuousSettings*`; `AppSettings` is `{ page }`.
- `packages/layout/test/page-settings.test.ts` — updated defaults and removed
  the dead continuous expectations; added a legacy `continuous` ignore test.
- `apps/desktop/src/shared/api.ts` — settings file status/result types,
  `DocumentSettingsSaveInput`, session tab no longer carries overrides,
  bootstrap returns statuses + durable entries, bridge saves return results.
- `apps/desktop/src/main/library.ts` — status-aware settings read, corrupt
  backup, serialized write + unknown-field merge, session read split
  (`readSessionWithOverrides`), bootstrap migration, document-settings wrappers.
- `apps/desktop/src/main/index.ts` — new bootstrap fields, `settings:save`
  result, `document-settings:save` IPC.
- `apps/desktop/src/preload/index.ts` — result-typed `saveSettings`,
  `saveDocumentSettings`.
- `apps/desktop/src/renderer/src/state/settings.ts` — durable entries,
  id-aware resolution, serialized write coordinator, save status/error, retry,
  `updateAppSettings`, warning dismissal/reset.
- `apps/desktop/src/renderer/src/state/session.ts` — session writes no longer
  contain personal settings overrides.
- `apps/desktop/src/renderer/src/App.tsx` — new bootstrap init, rename/move
  adoption, quit-time settings flush, corrupt toasts, ⌘, renderer fallback,
  updated test bridge.
- `apps/desktop/src/renderer/src/actions.ts` — adopt a durable entry when a
  moved/renamed package opens.
- `apps/desktop/src/renderer/src/shell/Dialogs.tsx` — Settings branch moved
  ahead of the no-document gate; warning/save/error panel; disabled document
  scope with reason; global updates via `updateAppSettings`.
- `apps/desktop/src/renderer/src/page/PageView.tsx`,
  `apps/desktop/src/renderer/src/export-snapshot.ts` — resolve settings by
  document id + path.
- `apps/desktop/src/renderer/src/global.d.ts` — test bridge additions.
- `apps/desktop/test/settings.test.ts` — missing/corrupt/migration/unknown
  fields/newer schema/write failure/rapid writes.
- `apps/desktop/test/settings-store.test.ts` — durable resolution, id-first,
  no blind replace, failed/rapid writes, legacy continuous ignore.
- `apps/desktop/test/editor-layouts-modes.test.ts` — session cleanup and zoom
  single-source assertions.
- `tests/ui/r1b-page-settings.test.mjs`, `tests/ui/m4d1-page-density.test.mjs`
  — assert the durable map and that the session no longer carries overrides.
- `package.json` — added the M4e1 UI suite to `test:ui` and `verify`.

## 3. Checks and timings

| Check | Result | Time |
|---|---|---|
| `npm run check:boundaries` | 165 files, 811 imports, 16 rules | — |
| `npm run typecheck` (all workspaces) | pass | — |
| `npx vitest run` (targeted + full) | 100 files / 1005 tests pass | 2.58 s |
| `node --test tests/ui/m4e1-settings-platform.test.mjs` | 4 tests pass | 11.2 s |
| `node --test tests/ui/m4d1-page-density.test.mjs` | 3 tests pass (density trend unchanged) | 16.8 s |
| `node --test tests/ui/r1b-page-settings.test.mjs` | 4 tests pass | 11.0 s |
| `node --test tests/ui/r2b-page-packing.test.mjs` | 3 tests pass | 10.5 s |
| `npm run verify:fast` | pass (boundaries + typecheck + unit + e2e) | 52.49 s real |
| e2e (inside `verify:fast`) | 16 tests pass | 43.7 s |
| UI screenshot | `artifacts/m4e1/settings-no-document.png` | — |

No `pageErrors` in the new or re-run UI suites.

## 4. S2 evidence

### S2-1 — Settings app-level

- `Dialogs.tsx`: the `dialog.kind === 'settings'` branch now runs before the
  `runtime === null` gate.
- No-document state: the global density slider, library/app-data paths, theme
  and reveal action are usable; the “This document” radio is disabled and
  `[data-page-density-document-reason]` explains why; “Undo last change” is
  disabled and a note names the reason.
- UI test: launch with zero tabs, open Settings with ⌘,, apply a global 85%
  density, assert `settings.json` (`settingsVersion: 2`), open Settings again
  from the palette, then open a document and see 85% inherited.

### S2-2 — durable per-document overrides

- `app-support/document-settings.json` is the only durable override store.
  Entries are `{ documentId, packagePath, page }`; resolution is id first, then
  a path-only entry. `SessionTabState` no longer has an override field and
  `buildSession` never writes one.
- Bootstrap reads legacy `pageSettingsOverride` values from `shell-session.json`
  only to migrate them (`readSessionWithOverrides` +
  `migrateLegacySessionOverrides`); an existing durable entry wins.
- Rename/move: `openPath`/bootstrap call `adoptDocumentSettings`, re-keying the
  id entry to the new path. A new document at the old path with a different id
  does not inherit the old entry (unit test).
- Delete rule: v1 has no document-delete command, so the entry is left as an
  orphan keyed by the deleted document id; it can never apply to another
  document. This is documented in `shared/document-settings.ts` and tested
  (different id at the same path resolves to no entry).
- UI test: set an 80% document override, assert the durable file entry keyed by
  the document id and that the session has no override, close the tab, quit,
  relaunch, reopen the same package, and see 80% again.

### S2-5 — settings durability

- Renderer: one write queue, newest-request-wins status, “saving” until the
  main-process result, visible error + Retry, quit flushes the queue.
- Main: one write queue, atomic temp→rename, result only after rename. The
  write merges known paths onto the previous raw object, so unknown top-level
  and nested (`page`, `setup`, `margins`, `theme`) fields survive; a newer
  `settingsVersion` is never lowered.
- `settingsVersion: 2`; v1 (no version) drops only the dead `continuous` block;
  a corrupt file is copied to `settings.corrupt-<timestamp>.json` before the
  app can overwrite it, and Settings shows the warning, backup path, reset and
  dismiss actions.
- `updateAppSettings` merges a partial patch (density-only leaves size,
  orientation, preset, manual breaks intact); the Settings dialog uses it for
  global changes.
- Tests: main missing/corrupt/migration/unknown-field/newer-schema/write-failure/
  rapid-write cases; renderer “not saved before write”, failure + retry,
  serialized rapid writes, no blind replace; UI corrupt warning/backup and a
  read-only app-support directory producing a visible error then a successful
  Retry.

### S2-6 — one Continuous zoom source

- `ContinuousSettings`, its override type, defaults, normalizers, session
  serialization, and store APIs are removed. The layout package's
  `AppSettings` is `{ page }`.
- The only continuous zoom is `DocumentViewState.zoom` (`shared/view-state.ts`,
  `DocumentEditor.tsx`), still persisted per document in the session.
- Unit: a legacy `continuous` block cannot reappear in `AppSettings`; the
  per-document zoom still changes and round-trips.
- UI: `⌘=` in Continuous changes the active document's zoom to 1.1 while
  `settings().app.continuous` is `undefined`.

## 5. Acceptance

- [x] Settings opens with zero documents; per-document controls disabled with a reason.
- [x] Overrides survive close → quit → reopen; rename/move handled; delete rule documented and tested.
- [x] Settings writes serialized, failures visible, corrupt file backed up and warned; schema version + migration; unknown fields tested.
- [x] Dead Continuous zoom removed; per-document zoom still works.
- [x] Targeted tests + one `npm run verify:fast` with timings.
- [x] Report maps criteria and lists risks.

## 6. Open questions / risks

1. **Delete cleanup is deferred by rule.** Orphan entries for packages deleted
   outside the app remain in `document-settings.json`. They are id-keyed and
   cannot leak to another document, but a future library cleanup should prune
   ids not referenced by any scanned document. This is a v1 scope decision, not
   a defect.
2. **Path-only legacy entries are inherently ambiguous** until the package opens
   once and the entry gains its id. This only affects an unreadable/missing
   package inherited from a pre-S2-2 session.
3. **Document-settings corruption has no destructive reset button.** The file is
   backed up and warned; per-document overrides for that run are empty, and a
   save is refused rather than silently replacing the damaged map. A reset/restore
   action can be added in the final Settings IA.
4. **A write failure during quit is logged, not blocking.** The dialog already
   surfaces the failure and offers Retry; quit still preserves document data.
5. **Settings menu IA/labels/buttons are unchanged.** The dialog is still the
   M4d1 thin slice plus warning/error states; the later redesign owns the final
   layout, per-field override dots, and Continuous/export sections.
6. **§15 “Help → Keyboard shortcuts” still opens Settings.** Existing issue,
   intentionally untouched (final menu design is out of scope).

## 7. Handoff

- Worktree: `/Users/luca/.t3/worktrees/noteforest/t3-9fe348a5-e27f1c8e707763f5`
- Branch: `t3/m4e1-settings-platform-fixes`
- Head SHA: recorded in the final message and by `git log -1` in the worktree.
- Next suggested step: targeted Sentinel review of M4e1, then the M4e2 density/
  topology work. The Settings/UI redesign can proceed with the app-level shell
  and durable override model already in place.
