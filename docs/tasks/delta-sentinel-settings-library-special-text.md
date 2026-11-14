# Delta Sentinel — settings, library, export, special text

**Role:** Reviewer / Sentinel
**Milestone:** Post special-text gate (delta since the last accepted review)
**Base for the review:** `58a9b6a` (last accepted UI re-check) → code head `2988d2b` (2026-11-14)
**Deliverable:** `docs/reviews/post-settings-library-special-text-review.md`, plus the settings
inventory delta. Read-only on code; one worktree, one commit (docs only).

## Why this review

Since `58a9b6a` the app gained settings/shell rework, library/drafts/trash, export defaults,
Continuous settings (schema v5), the special-text editor, and the polish pass. The integration full
`verify` is green at UI concurrency 4 (unit 132/1314, e2e 16, recovery 14, UI 54/54, 207 s, 0
pageErrors). This is the gate before the next product block. Review the delta, not the unchanged
codebase.

## Areas in the delta

1. **Settings / shell**
   - `settingsVersion: 5`: pure v4→v5 migration, `continuous` defaults/ranges/clamp, unknown keys
     at every level, version never lowered, corrupt/unreadable recovery.
   - Settings write identity, no-document Settings, per-document overrides lifetime, instant save,
     pending flush, error/backup states.
   - R2 Page chrome (header/footer/page-number), R3 Appearance (theme/accent/UI scale/code font),
     R4 Export (folder default), R6 Continuous (spacing/arrows/widths), Settings 1180 × 820 + shared
     preview rail (Page two stacked pages, Continuous scale-to-fit, Appearance one column).
   - Page/PDF isolation: Continuous values must never reach Page/PDF; the isolation test.
2. **Library and document lifecycle**
   - One active library, `libraries.json` recents, Library/Outline tabs, drafts materialized on the
     first real edit, rename/reveal/OS Trash, document-id move reconciliation, flush-before-switch,
     live/stale locks, cleanup of recents/settings/session, never trashing a library root.
3. **Export**
   - Default folder/Documents/custom, `<title>.pdf` without date, sheet reading the setting, export
     identity, preflight, progress/cancel, atomic output, overwrite policy.
4. **Editor**: block-boundary Backspace, arrow isolation, history-entry fix.
5. **Special text**
   - Code block: node view/lowlight, idle label, Copy only in editing, editable fence language,
     three exits, syntax colours editor-only, Page/PDF neutral.
   - Tables: inline-only cells + pure normalization, N×M picker, contextual toolbar (rows/columns/
     alignment/copy/source), paragraph above/below, Tab/append row, Enter hard break, typed/pasted
     GFM, Copy as Markdown, Continuous inner scroll.
   - Formulas: anchor-only outline, inline-block box, single click NodeSelection, in-place source,
     action row (Branch/Copy/Inline-Block), copy with delimiters, paste rule, inline↔block
     conversion; **check the anchor risk**: conversion splits the host paragraph and may shift node
     paths for text anchors in that paragraph.
   - Inline code: preventDefault fix, delimiter widgets on caret-in/out, Read mode, `⇧``, mini menu.
   - Selection toolbar link reset.
6. **Test infrastructure**
   - Serial `document-lifecycle`, stale test app cleanup, clipboard helpers, the 8-way pool timeouts
     and the green 4-way run. Judge whether the default concurrency must change or a suite must be
     serialized.

## Required evidence

- Read `AGENTS.md`, `docs/agents/roles.md`, `docs/review-checklist.md`, `docs/definition-of-done.md`.
- Read the builder reports: `docs/reports/special-text-editing.md`,
  `docs/reports/special-text-polish.md`, `docs/reports/settings-shell-layout.md`, and the earlier
  reports for library/lifecycle/export.
- Read the design docs: `docs/design/continuous-settings.md`, `docs/design/library-and-documents.md`,
  `docs/design/value-audit.md`, `docs/design/anchor-health.md` (proposal), `docs/design/shell-activity-bar.md`
  (proposal), `docs/tasks/special-text-*.md`.
- Inspect the diff `58a9b6a..2988d2b` and run targeted checks. The integration full verify is
  green at UI concurrency 4; you may run the affected suites (or the full verify at 4) but do not
  duplicate a green 8-way run that already failed on this machine.
- Check the invariants: Page/PDF isolation, Read-mode gating, anchor contracts, schema v2/settings v5,
  no document data in settings/view state, no fixed sleeps/native dialogs, existing assertions not
  weakened.
- Verify the specific risks: formula conversion anchor paths, clipboard focus fallback, delimiter
  widgets in Continuous Read, table toolbar silhouette, arrow isolation with multi-block selections,
  settings override lifetime, draft/trash/recents consistency, export identity.

## Settings inventory delta

The frozen inventory (`docs/reviews/settings-inventory.md`, 9 Nov, base `ca59fc5`) predates R2, R3,
R4, R6. Add a **post-freeze delta** section (or a companion `docs/reviews/settings-inventory-delta.md`)
listing the new namespaces and values with defaults/ranges/scope:

- Page chrome (header/footer/page-number), global + per-document.
- Appearance (theme, accent, UI scale, UI font, code font), global.
- Export (folder), global.
- Continuous (spacing, arrows, widths) at `settingsVersion: 5`, global.
- The settings shell (1180 × 820, shared rail) is UI chrome, not a setting.
- Mark what is frozen vs still a design decision; do not rewrite the frozen catalog for history.

## Verdict and findings

- Verdict: **accept** / **accept with findings** / **request changes**, with S1–S4 findings.
- Every finding needs file:line, a reproducible description, evidence (test/command/screenshot), and
  the smallest credible fix (not an implementation).
- New findings outside the delta are allowed only if they are regressions or S1/S2 in touched code.
- Do not edit code, tests, spec, UX, ADR, or plan. You may update `docs/review-checklist.md` /
  `docs/definition-of-done.md` if the checklist is stale.

## Rules

- One worktree, one commit (the review + inventory delta), no merge or push.
- No fixed sleeps or native dialogs in any new test/evidence.
- The showcase document is user data and is not part of this review.
- Report the worktree, branch, head, checks with timings, verdict, findings, and next step.

## Open questions to settle in the review

- Is the 8-way pool instability a test-infra S2 (default concurrency/serial suites) or an accepted
  local limitation?
- Is the inline→block formula conversion safe enough for anchored formulas, or must it be blocked/
  remapped before the next release?
- Are the idle/hidden anchor states covered by the future Anchor health panel, or is any of it an
  S2 data-integrity bug today?
- Does the Settings pane 536 / radius spread (value audit) need a fix inside the Sentinel, or is it
  correctly deferred to the shell batch?
