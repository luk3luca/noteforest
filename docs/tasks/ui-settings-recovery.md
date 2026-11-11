# R1 — Settings data recovery (global unreadable + document map reset/restore)

**Role:** Implementer / Builder
**Milestone:** UI settings — Wave 1 (recovery & trust)
**Base:** `main` at the commit that adds this brief (`55033fd` plus the brief commit)
**Worktree:** created by the delegate from that base; do not work in the main checkout
**Timebox:** 3 hours

## Context

The UI Sentinel fixes re-check (`docs/reviews/ui-sentinel-fixes-recheck.md`) accepted the S2 batch and
left one settings recovery gap:

- **S3-2** — `Reset settings` renders only for `corrupt`; an `unreadable` global file has no Reset,
  and **Dismiss** clears `settingsStatus`, so the warning and the recovery action disappear while
  ordinary writes stay refused.
- **S3-13 / S3-3** (`docs/reviews/settings-freeze-review.md`,
  `docs/reviews/settings-inventory.md` MS-16) — a corrupt or unreadable `document-settings.json`
  has a warning and Dismiss only; there is no in-app reset or restore, so per-document page
  settings stay frozen until the file is repaired outside the app.

The design contract is `docs/design/ui-settings-contents.md` §8 (Data & About) and §11 step 8:
document map reset/restore must preserve a backup and must never silently replace the map. Note
content is not at risk; this is about per-document page overrides.

S4 test nits from the same re-check also belong here: the F4 static guard omits the new
`ui-overlay-command-gate` suite, `m3g1`/`m3h2` artifact directories are still shared by two suites
each, and two `m4e1` test titles carry a stale `(S2-5)` suffix.

## Goal

One batch that gives both settings files a real, explicit recovery path in Settings → Data & About,
keeps the recovery reachable after Dismiss, and closes the S4 test-guard nits.

## In scope

### 1. Global settings recovery (S3-2)

- Show **Reset settings** for both `corrupt` and `unreadable` states (the existing
  `settings:reset` path already replaces the file with defaults and keeps the backup). If the reset
  fails, keep the warning/status and show the failure; do not pretend success.
- **Dismiss must not clear the underlying read status.** Replace the current
  `dismissSettingsWarning('global') → settingsStatus = OK` behavior with a separate dismissed flag
  (or equivalent): Dismiss hides the top banner for the session only, while Data & About always
  shows the real status, message, backup path and the Reset action for `corrupt`/`unreadable`.
  Reopening Settings or the app must still expose recovery.
- Same treatment for the document-settings warning: Dismiss hides the banner, but Data & About keeps
  the status and recovery action.
- Keep `newer` read-only warning semantics; unknown fields are preserved.

### 2. Document settings map recovery (S3-13 / S3-3)

- Show the `document-settings.json` status in Data & About: `ok` / `defaults` / `corrupt` /
  `unreadable`, with the message and any backup path.
- **Reset map** action, with an in-app confirmation (no native dialog):
  - confirm copy names the scope: “This removes all per-document page overrides. Note content is not
    affected.”;
  - back up the current map before replacing it (for example
    `document-settings.backup-<timestamp>.json`; keep the existing corrupt backup too);
  - write an empty map atomically through the existing serialized queue;
  - clear the in-memory `documentSettings` and `pageOverrides`, set the status to `ok`, and refresh
    the Data page.
- **Restore backup** action, available when a valid backup exists:
  - list/restore the newest valid backup (the main process owns the choice; expose at least whether
    a backup exists);
  - back up the current file before replacing it, validate the backup with the existing normalizer,
    and fail without replacing anything if it is invalid;
  - load the restored entries into the renderer store and set the status to `ok`.
- Both actions must never be implicit: `saveDocumentSettings` keeps refusing corrupt/unreadable
  writes until the user chooses Reset/Restore.
- No note document content is read or changed.

### 3. Plumbing

- Add the typed main-process functions and IPC (for example `document-settings:reset` and
  `document-settings:restore`), preload methods, `NoteForestApi` types, and store actions. Keep the
  existing serialized queue and atomic write path; no direct JSON writes from the renderer.
- Keep the no-document, read-only, and open-document states correct; recovery of the global map is
  available with zero documents.

### 4. S4 test-guard nits

- `apps/desktop/test/ui-suite-list.test.ts`: include `ui-overlay-command-gate` in the evidence-directory
  owners map and in the “only this suite may name its directory” guard.
- Give the shared artifact directories unique owners: `m3g1` is used by
  `m3-anchor-callout-layout` and `m3-anchor-callout-stacking`; `m3h2` by `m3-reference` and
  `m3-repair`. Use per-suite directories (for example `m3-anchor-callout-layout`,
  `m3-anchor-callout-stacking`, `m3-reference`, `m3-repair`) and update any static guard.
- Remove the stale `(S2-5)` suffix from the two `m4e1-settings-platform` test titles (keep the
  behavior assertions).

## Out of scope

- Any new settings field, schema/migration bump, or `settingsVersion` change.
- Library folder/backup policy, retention, folder changing (R7, M6).
- Appearance, Export defaults, Continuous global, Page chrome, manual breaks.
- S3-1 Close Window: do **not** gate or change it in this batch.
- Weakening or deleting existing assertions; fixed sleeps; native OS dialogs.

## Files

Read:
- `apps/desktop/src/main/document-settings.ts`, `main/library.ts`, `main/index.ts`.
- `apps/desktop/src/preload/index.ts`, `src/shared/api.ts`, `src/shared/document-settings.ts`,
  `src/renderer/src/global.d.ts`.
- `apps/desktop/src/renderer/src/state/settings.ts`,
  `src/renderer/src/shell/SettingsDialog.tsx` (Data & About and the warning block).
- `docs/design/ui-settings-contents.md` §8/§11, `docs/reviews/settings-freeze-review.md` S3-3/S3-13,
  `docs/reviews/settings-inventory.md` MS-16, `docs/reviews/ui-sentinel-fixes-recheck.md` §8.
- Existing tests: `apps/desktop/test/document-settings.test.ts`, `settings-store.test.ts`,
  `settings.test.ts`, `ui-suite-list.test.ts`, `tests/ui/m4e1-settings-platform.test.mjs`.

Expected to touch:
- The main/preload/shared/renderer files above.
- `apps/desktop/test/document-settings.test.ts`, `settings-store.test.ts`, `settings.test.ts`,
  `ui-suite-list.test.ts`.
- A UI recovery suite (new `tests/ui/ui-settings-recovery.test.mjs` or a justified extension of
  `m4e1`), `tests/ui/m3-anchor-callout-layout.test.mjs`, `m3-anchor-callout-stacking.test.mjs`,
  `m3-reference.test.mjs`, `m3-repair.test.mjs`, `tests/ui/suites.mjs` if a suite is added, and
  `tests/ui/README.md` if the evidence directories are documented.
- `docs/reports/ui-settings-recovery.md`.

## Acceptance criteria

- [ ] Corrupt **or unreadable** global `settings.json`: Data & About shows the status and Reset;
      Dismiss hides only the banner; reopening Settings still shows the status and Reset; a failed
      Reset keeps the warning and surfaces the error; a successful Reset writes defaults, keeps the
      backup, and clears the status.
- [ ] Corrupt or unreadable `document-settings.json`: Data & About shows the status and warning;
      Reset requires confirmation, backs up the current file, writes an empty map atomically, clears
      per-document overrides in memory and on disk, and leaves note content untouched.
- [ ] Restore backup is offered only when a valid backup exists; it backs up the current file,
      restores the entries (validated), refreshes the store, and fails without replacing anything on
      an invalid backup.
- [ ] Save remains refused while the map is corrupt/unreadable until an explicit recovery action.
- [ ] S4: the suite-list guard includes `ui-overlay-command-gate`, every evidence directory has one
      owner, the four affected suites use unique directories, and the stale `(S2-5)` titles are
      gone.
- [ ] No schema/dependency change; no existing assertion weakened; no native dialog; no fixed sleep.
- [ ] `npm run verify` exit 0 with real timings; UI 45 suites (44 + the new one) at the default pool,
      no pageErrors.

## Tests and evidence

- Targeted while working: the new/changed unit files with `npx vitest run`, the data/recovery UI
  suite by name, typecheck, boundaries.
- End of task: one full `npm run verify` (~3 min).
- Screenshots only if useful, in the suite's own `artifacts/<suite>` directory.

## Stop and ask

Stop and report when:

- the reset/restore semantics are ambiguous (which backup is “the” backup, retention, confirmation
  scope);
- a recovery action would need a schema/migration change;
- a baseline test fails for an unrelated reason;
- a native dialog would be required.

## Report format

- Summary mapped to S3-2, S3-13/S3-3, S4.
- Files changed.
- Checks with real timings and suite counts.
- Acceptance criteria pass/fail with the test/evidence.
- Open questions / risks.
- Next suggested step.

Commit in the worktree; do not merge or push.
