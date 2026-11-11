# UI Sentinel fixes re-check — F1 overlay ownership, F2 write identity, F3 corrupt settings, F4/F7 evidence

**Role:** Reviewer / Sentinel (independent)
**Milestone:** UI stabilization (post Batches A/B/C/V)
**Base:** `main` at the commit that adds this brief (fix batch `58a9b6a`)
**Worktree:** fresh worktree created by the delegate from that base
**Timebox:** 2 hours

## Context

The UI post-merge Sentinel (`docs/reviews/ui-post-merge-review.md`) returned **request changes** with
three S2 findings:

- **F1** — modal overlays did not gate global shortcuts/native-menu commands; an open Export sheet
  could export a different document under the original filename.
- **F2** — pending document-scoped Page settings writes bound to the active tab at flush time;
  a tab/document change could write the override to another document or report `saved` without a
  write.
- **F3** — a corrupt global `settings.json` was overwritten by the next ordinary setting change
  while the warning and Saved footer disagreed.

It also found two test-infrastructure issues: **F4** shared/deleted screenshot directories and
**F7** a hardcoded runner list, an unused env, and a timeout without an explicit reason.

The fix batch (F1/F2 + the immediate-write capture correction, F3, F4, F7) is merged at `58a9b6a`.
The Orchestrator full `npm run verify` on `main` at that commit is green: 169.35 s, 109 unit files /
1099 tests, 16/16 e2e, 14/14 recovery, 44/44 UI at the default pool, 0 pageErrors.

This re-check decides whether the three S2 findings are genuinely closed and the F4/F7 evidence is
sound, before the next settings block starts.

- `docs/reviews/ui-post-merge-review.md` (original findings and reproductions)
- `docs/tasks/ui-sentinel-fixes.md` (fix contract)
- `docs/reports/ui-sentinel-fixes.md` (builder report, correction, integration)
- `docs/review-checklist.md`, `docs/definition-of-done.md`
- `docs/spec.md` (settings/persistence/read-only), `docs/ux.md`, ADR-0007, ADR-0008

## Goal

One independent verdict on the fix batch: the three S2 repros now fail closed, the contracts hold on
the paths the brief names, the evidence isolation and runner hardening are real, and no existing
assertion was weakened.

## In scope

1. **F1 overlay ownership and export identity.** Reproduce the original repro: open documents A and B,
   open Export on B, press `⌘1` / a native tab or close command, then Export. The command must not
   change the active tab, and the produced PDF must contain B only under B's filename. Also check
   Settings (and another dialog) versus keyboard and native menu commands, the palette's own `⌘K`
   toggle and row execution, nested Settings → Export, native cut/copy/paste/select-all/quit, and the
   closed-pinned-document path (clear error, no file written).
2. **F2 write identity.** Reproduce the original cross-document write and the close-during-write
   path. Confirm: debounced and immediate writes use the identity captured at their start; a closed
   target writes nothing and shows a visible not-saved state; `Retry` cannot turn it into Saved; a
   scope switch flushes on the original layer; no write ever lands on another document.
3. **F3 corrupt global settings.** Reproduce: corrupt `settings.json`, launch, ordinary change →
   refusal, bytes and backup unchanged, warning stays, footer not Saved. Then Reset → defaults
   written atomically, backup kept, warning cleared only after success, later changes save.
4. **F4 evidence isolation.** Two full UI runs at the default pool; the four (plus the new regression
   suite's) evidence directories coexist and no suite deletes another suite's directory.
5. **F7 runner hardening.** The meta-test equals `tests/ui/*.test.mjs`; a temporary extra suite
   changes the meta-test result (revert it); a timeout prints `timed out after N s` and fails with
   exit 1; `NOTEFOREST_UI_RUNNER` is gone; groups and `--list` are unchanged.
6. **Fix quality.** Read the fix diff `fd28c3c..<base>`: scope, no schema/dependency/spec/UX/ADR
   change, no weakened or deleted existing assertion, no test-only behavior leaking into product
   paths, and the immediate-write capture-before-flush contract.
7. **Gate.** Run `npm run verify` once on the base commit and record real timings.

## Out of scope

- F5 (rendered compact tab icons), F6 (Settings/Export axe/focus), F8 (copy/state polish), F9
  (Settings close error visibility), F10 (remaining failure-path coverage) — tracked S3s, not this
  re-check.
- Product decisions: tab windowing, Settings centering, fit-width 0.91, density/preset Q-11,
  cross-document margin fallback, Settings default page, per-document Continuous page.
- Any code/test/spec/UX/ADR/plan edit, any fix, merge, or push.

## Acceptance criteria (for the re-check)

- [ ] The original F1 repro now fails closed on both keyboard and native-menu paths; Export writes
      only the pinned document under its filename, and a closed pinned document writes no file.
- [ ] The original F2 repro cannot write to another document; a closed target is visibly not saved
      and never `saved`; debounced and immediate paths both hold.
- [ ] The original F3 repro leaves corrupt bytes and the backup untouched, shows the failure, and the
      explicit Reset lifecycle works and later writes succeed.
- [ ] F4 evidence directories coexist after two parallel runs and no cross-suite delete exists.
- [ ] F7 meta-test/list/timeout behavior verified, including a temporary suite addition (reverted).
- [ ] No existing assertion weakened or deleted; no schema/dependency/spec/UX/ADR drift.
- [ ] `npm run verify` exit 0 with real timings; no pageErrors.
- [ ] Verdict (accept / accept with findings / request changes), S1–S3 findings with file:line,
      residual risks, and what still needs the product owner.

## Tests and evidence

- `npm run verify` once (~3 min).
- Targeted: `node tests/ui/run.mjs --group shell,settings`, the new
  `ui-overlay-command-gate` suite, `m4e1-settings-platform`, and the settings/page-settings unit
  files. Two full UI runs for F4.
- Reproduce findings; do not infer. No native dialogs, no fixed sleeps, no retries, no weakened
  assertions.

## Stop and ask

Stop and report when:

- the baseline verify fails for an unrelated reason;
- a repro needs a product decision;
- evidence cannot be produced without a human (subjective visual/VoiceOver);
- a finding would require a schema or public-command change.

## Report format

Write `docs/reviews/ui-sentinel-fixes-recheck.md` with reviewer/date/reviewed base/worktree/
environment, verdict, F1–F3 status with the original repro result and evidence, F4/F7 status, the
fix-diff quality check, checks with real timings, what was not verified, residual risks, open
product-owner questions, and the recommended next step.

Commit only that review file. Do not merge or push. Final response mirrors the brief: summary,
files changed, checks with timings, findings by severity, open questions/risks, next step.
