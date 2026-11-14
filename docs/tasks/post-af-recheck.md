# Phase 0a — targeted re-check of identity and editor surfaces

**Role:** Reviewer / Sentinel
**Phase:** 0a (post-A–F)
**Base:** current `main` at delegation (includes C `fd4fed9`, A+D `f081cb0`, test fixes `bd3884c`/`c1b522c`)
**Deliverable:** `docs/reviews/post-af-fixes-recheck.md` (one commit, docs only)
**Worktree:** created by the delegate; no merge or push
**Timebox:** 1 day

## Why

C (identity/settings + ADR-0009 copy id) and A+D (context menus, Page formula panel, mode parity,
indent/outdent) were integrated and the full verify is green at UI concurrency 4:
boundaries 230/1077/16, unit 134 files/1343 tests, e2e 16, recovery 14, UI 55/55 (213.6 s, 0
pageErrors). Two integration seams were fixed in tests only: the Page Edit formula panel moved to the
body, and the indent UI test needed explicit editor focus. This re-check judges whether the findings
and the new behaviors are actually correct, and whether the fixes introduced regressions.

## Scope

Read `docs/tasks/identity-followups.md`, `docs/tasks/editor-surfaces-structure.md`,
`docs/reports/identity-followups.md`, `docs/reports/editor-surfaces-structure.md`, ADR-0009, and the
design `docs/design/indent-and-drag.md`.

Review the diff `70a6144..c1b522c` (the two features plus the two test-only integration fixes).

### Identity / settings (C)

- **R1**: any other durable entry with the same document id is ambiguous; exact path always removed;
  main and renderer agree; cross-library closed copy keeps its override; `keptAmbiguous` reported.
- **R2**: captured draft target resolved by document id after the pre-execute flush; no false
  “document closed”; Retry works; the capture-before-flush guard still prevents cross-document writes.
- **R3**: the inline→block rejection toast appears in the Page Edit overlay.
- **ADR-0009**: `Save a copy` mints a new id, title from destination, revision 1, copy timestamps;
  content/anchors/branches/assets preserved; no inherited override; Finder duplicates keep same id
  and path-first cleanup.

### Editor surfaces / structure (A+D)

- **Context menus**: target detection (prose/card/cell/code/formula/Read); prose gets text ops + the
  full block menu; card no text; cell text + table commands; code/formula text only; Read Copy/Select
  All; formula source stays open; selection preserved; one menu only; native text ops work with undo.
- **Page Edit formula panel**: fixed body panel, all controls visible, no horizontal scrollbar,
  anchored/flipped, Esc/⌘↵/Done one commit and one undo.
- **Mode parity**: layout switch preserves Edit/Read; Page Edit does not auto-open; session restore;
  Page Read unchanged.
- **Indent/outdent**: previous primary sibling as parent, last child; disabled reason; Tab/⇧Tab only on
  a selected block outside text; menu/palette share the rule; same-parent anchored reorder keeps the
  primary edge and anchor; reparent converts the old edge to a reference and creates a fresh primary,
  with toast and one undo; cycle/chapter checks.
- **Test fixes**: the Page Edit locator follows the body panel; the indent test focuses the editor;
  judge whether these hide a product defect.

## Invariants

- No schema/settingsVersion/Page/PDF layout/export/showcase change.
- Read-mode gating still blocks all mutation surfaces.
- No fixed sleeps or native dialogs; assertions updated only for intentional contract changes.
- The F2 limitation remains untouched (no table projection change).

## Evidence

- The Orchestrator’s full verify log is green at UI concurrency 4; do not duplicate a full run.
- Run targeted repros/suites only where the builder evidence is insufficient.
- Check `artifacts/editor-surfaces/` and `artifacts/identity-followups/` evidence; re-run if needed.

## Verdict and report

- Verdict: **accept**, **accept with findings**, or **request changes**; S1–S4 findings with
  file:line, repro, evidence, smallest credible fix.
- New findings only for regressions in this diff or S1/S2 in touched code.
- Do not edit product code/tests/spec/UX/ADR/plan. Checklist/DoD updates only if stale.
- Report worktree, branch, head, checks with timings, verdict, findings, next step.
