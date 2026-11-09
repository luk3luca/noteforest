# M4e1 — Settings platform fixes (S2-1, S2-2, S2-5, S2-6)

**Role:** Builder / Implementer  
**Milestone:** pre-UI settings platform fix; the Settings menu IA is designed later  
**Base:** `main` after the full-codebase Sentinel (`4ac9d46` plus this brief; exact SHA in the handoff)  
**Worktree:** assigned by the Orchestrator  
**Timebox:** 2 days

## Context

The full-codebase Sentinel verdict is **request changes before Settings/UI
rework**, no S1, six S2. This task closes the settings-platform S2s:

- **S2-1** — Settings cannot open without an open document.
- **S2-2** — per-document overrides die with the tab; keyed by path.
- **S2-5** — settings writes are fire-and-forget, corrupt settings reset silently,
  no schema version/backup.
- **S2-6** — `ContinuousSettings.zoom` is dead and duplicated by the real
  per-document view zoom.

The Settings menu design will be done in the later redesign; keep the current
dialog structure and only make the app-level settings reachable. Do not design the
final IA here.

## In scope

### S2-1 — Settings app-level

- Move the Settings branch ahead of the “No document open” gate in
  `Dialogs.tsx`.
- Render the global sections (library/app data, density global default,
  appearance placeholders only if already present) with no document.
- Per-document controls show disabled with a reason when no document is active.
- `⌘,` and the palette Settings entry work with zero tabs.
- Add a no-document UI test.

### S2-2 — durable per-document overrides

- Persist page/continuous overrides outside `SessionTabState` (a document-settings
  map in app-support, keyed by canonical document id with path fallback).
- Migrate existing session tab overrides on load; keep session cleanup.
- Close tab → quit → relaunch → reopen restores the override.
- Rename/move keeps the override (document id first, path fallback); delete
  removes it or leaves an orphan according to a documented rule.
- Add store/main persistence tests and a UI close/restart/reopen test where
  feasible.

### S2-5 — settings durability

- Serialize settings writes (last-write-wins), surface write failures in the UI;
  never show “saved” before the write succeeds.
- Add a settings schema version + pure migration chain; no stored-data loss.
- On corrupt `settings.json`: preserve a `.corrupt-<timestamp>` copy, warn in the
  UI, offer reset/restore (minimal panel is fine; final IA later).
- Decide/preserve unknown fields explicitly; test roundtrip.
- Avoid full-object blind replace or add an explicit `updateAppSettings`.
- Tests: write failure, corrupt file, unknown fields, rapid writes.

### S2-6 — one Continuous zoom source

- Remove the dead `ContinuousSettings.zoom` + overrides/serialization/tests, or
  make it the real global default **only if** the current per-document
  `DocumentViewState.zoom` remains the effective source.
- Recommended: keep per-document view zoom and remove the dead field.
- Test that Continuous zoom still works per document and no settings control is
  dead.

## File ownership / coordination

Own: `state/settings.ts`, `main/library.ts`, `state/session.ts`,
`shared/api.ts`, `Dialogs.tsx` settings shell/no-document branch, app bootstrap
if needed, settings tests.

Do **not** edit density floors/range, PageTheme.density, layout/topology, or
Page callout mode; M4e2 owns those. If `page-settings.ts` must change for
`ContinuousSettings` removal, edit only the Continuous settings type/normalize
region and note it; avoid density constants.

Do not design the final Settings menus; later redesign owns IA/labels/buttons.

## Out of scope

- Density 60–120/floors/topology (M4e2).
- Page/Continuous token split (later).
- Final Settings UI/IA, appearance, manual breaks, export polish.
- PDF/export engine, spec/UX/ADR/plan changes.
- Merge, push, PR, parent-checkout edits.

## Files to read

- `docs/reviews/full-codebase-settings-review.md` S2-1/S2-2/S2-5/S2-6.
- `docs/reviews/settings-inventory.md` §1, §8, §9, §12–§15.
- `apps/desktop/src/renderer/src/state/settings.ts`,
  `shell/Dialogs.tsx`, `state/session.ts`, `main/library.ts`, `shared/api.ts`.
- `apps/desktop/src/shared/view-state.ts`, `editor/DocumentEditor.tsx`.
- Existing settings tests: `apps/desktop/test/settings-store.test.ts`, UI
  `m4d1-page-density.test.mjs`, `r1b-page-settings.test.mjs`.

## Acceptance criteria

- [ ] Settings opens with zero documents; per-doc controls disabled with reason.
- [ ] Overrides survive close → quit → reopen; rename/move handled; delete
      documented/tested.
- [ ] Settings writes serialized, failures visible, corrupt file backed up and
      warned; schema version + migration; unknown fields test.
- [ ] Dead Continuous zoom removed (or one real source); per-document zoom still
      works.
- [ ] Targeted tests + one `npm run verify:fast` with timings.
- [ ] Report maps criteria and lists risks.

## Stop and ask

Stop and report if:

- the override identity needs a product decision beyond id + path fallback;
- the settings schema migration needs a broader data model change;
- removing ContinuousSettings conflicts with M4e2’s page-settings edits;
- the no-document Settings needs the final IA;
- the baseline has unrelated failures.

## Report format

- Summary and scope.
- Files changed.
- Checks/timings.
- S2-1/S2-2/S2-5/S2-6 evidence.
- Acceptance pass/fail.
- Open questions/risks.
- Worktree path, branch head SHA.
