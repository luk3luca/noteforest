# Identity and settings follow-ups

**Role:** Implementer / Builder
**Milestone:** Post-re-check fixes + ADR-0009
**Base:** `main` head at delegation (contains this brief and ADR-0009)
**Worktree:** created by the delegate; do not work in the main checkout
**Source:** `docs/reviews/sentinel-fixes-recheck.md` (R1, R2, R3, S4 nits); `docs/adr/0009-copy-mints-new-document-id.md`
**Timebox:** 2 days

## Context

The targeted re-check accepted the Sentinel fixes with no S1/S2, but left two S3 residuals and one S4
residual. The product owner also accepted ADR-0009: `Save a copy` mints a new document id. F2 (legacy
rich table cells) remains an accepted latent limitation; do not touch the table projection.

## In scope

### R1 — id-safe cleanup, main and renderer agree (S3)

- `shared/document-settings.ts` `documentSettingsRemoval`: an id is ambiguous when **any other
  durable entry** in the same map already uses it, not only when `sharedIdPaths` names another
  package. Keep every other id-keyed entry, report it as `keptAmbiguous`, and remove only the exact
  package path (plus the unambiguous id case when no other entry/session tab shares it).
- This makes main match `renderer/state/settings.ts` `forgetDocumentSettings`, which already treats
  another durable entry with the same id as shared.
- Update the unit test that expected an “unambiguous id” to remove a stale moved path: the stale
  entry is now kept (harmless; `adoptDocumentSettingsEntry` re-keys it on the next open).
- Add a unit/integration case: two same-id entries, one in another library/closed copy, trash the
  first → the second entry survives on disk and in memory; `keptAmbiguous` reports it.
- Keep the path-first rule and the existing same-library two-copy UI test.

### R2 — debounced materialization must not drop the following immediate write (S3)

- `usePageSettingsController.executeImmediate`: a captured `draft:<id>` target can become stale when
  the pre-execute flush runs a pending debounced write that materializes the draft. Resolve a
  captured draft target to its open materialized runtime **by document id** before the
  `targetIsGone` check (or retarget the capture when the draft key was replaced by its package).
- Do **not** move the target capture after the flush: that reopens the F2 cross-document defect.
- `lastImmediate` must store the retargeted identity so Retry succeeds; no false “document closed”
  error.
- Add one UI case: new draft → Settings → Page → Document scope → move the density slider (240 ms
  debounce) → click **A5** inside that window. The draft materializes, the A5 write succeeds, the
  preview shows A5, and Retry (if shown) is not needed. Screenshot/log in `artifacts/identity-followups/`.

### R3 — Page Edit overlay can show the inline→block reason (S4)

- The formula conversion toast uses `getEditorBindings(...).notify`; `PageBlockEditor` never
  registers bindings. Give the overlay the same notify binding (or use a shared toast helper that
  works without bindings), so Inline → Block inside a table cell in Page Edit shows the reason and
  keeps the formula inline.
- Add the assertion to the Page Edit overlay suite (or the special-text Page Edit case); no data is
  at risk because the conversion is rejected.

### Nits (S4)

- Fix the two test lines where a `test(...)` opener is joined with its first statement (the re-check
  names them; search the new suites).
- Leave the historical review docs as history; the active docs were aligned separately.

### ADR-0009 — Save a copy mints a new document id

- `saveDocumentCopy` (`apps/desktop/src/main/library.ts`) must write a **new document identity**:
  fresh id from the core id factory, title from the destination package basename (the dialog default
  is `<name> copy`), `createdAt`/`updatedAt` now, revision 1, assets copied, no per-document settings
  override inherited. The source package is never modified.
- Content, anchors, branches, shared children, and assets are preserved. Validate the copy before
  writing.
- Finder duplicates keep the same id; do not change cleanup/reconciliation rules for them.
- Tests: two copies from one document get distinct ids and titles; the copy opens with revision 1
  and valid content; trashing the original keeps the copy's override/tab; a Finder-style same-id
  duplicate still uses path-first cleanup and the other copy keeps its settings.

## Out of scope

- Context menus, formula Page panel, mode parity, indent/drag (the A+D batch).
- Code colors / Page syntax highlighting.
- Document health / activity bar.
- F2 and the table projection; table toolbar redesign.
- Schema, settingsVersion, Page/PDF, export, showcase.
- Full `npm run verify` (the Orchestrator runs it at UI concurrency 4).

## Acceptance

- [ ] R1: any same-id durable entry is ambiguous; main and renderer agree; cross-library closed-copy
      case keeps the copy's entry; tests.
- [ ] R2: density-debounce + A5 materializes and writes; no false “closed”; Retry works; UI test.
- [ ] R3: Page Edit overlay shows the inline→block reason; test.
- [ ] Nits fixed.
- [ ] ADR-0009: Save a copy gets a new id/title/revision/timestamps; tests.
- [ ] No F2, schema, settingsVersion, Page/PDF, export, or showcase change.
- [ ] No fixed sleeps/native dialogs; existing assertions updated, none weakened.

## Evidence and report

- Targeted unit/UI per item; one `npm run verify:fast`; affected suites at concurrency ≤ 3.
- `docs/reports/identity-followups.md`: per-item summary, files, checks with timings, PASS/FAIL,
  risks, next step.
- One commit; report the worktree, branch, and head SHA. Do not merge or push.
