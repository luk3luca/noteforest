# Batch — command surface

**Role:** Builder. **Plan:** `docs/batch/plan.md`. **Branch:** `t3/command-surface`.
**Worktree:** yes (shared, main, renderer and tests). **Base:** the commit that contains this brief.
**Timebox:** one session; stop and report if a step stays red after one fix attempt.

## Goal

Implement the command-surface plan: one manifest, one dispatcher, four adapters, the 26 wire ids
preserved, and the 120 ms throttle gone. No behavior change beyond D2 and D4.

## Decisions (closed)

| # | Decision |
|---|---|
| D1 | All chords are renderer-owned. The native menu displays the catalogue accelerator with `registerAccelerator: false`; the throttle, the single-path set and the shim are deleted. |
| D2 | The Read refusal uses the palette's sentence everywhere. |
| D3 | Read-only/locked notes keep the Read reason for now; record it as a known issue in the report. |
| D4 | `link-reference` without a selection is a disabled row; `⇧⌘L` consumes the chord and toasts. |
| D5 | `flush` stays a wire-reserved id. |
| D6 | Fit page outside Page stays enabled and inert; record a UX follow-up. |
| D7 | One batch, two checkpoints: `npm run verify:fast` after step 4 and after step 9. |
| D8 | `anchor-health` keeps its id. |
| D9 | The Orchestrator updates `docs/design/shortcuts.md` after integration. |

## Scope

Plan sections 2–5: 40 application commands, the 26 IPC wire ids unchanged, the 12 block-only
palette entries left out of the manifest, the chord catalogue moved to `shared/`, the manifest, the
context, the availability, the dispatcher, the runners, the menu adapter, the key router, the
palette adapter, the tests and the cleanup. No context menus, no dynamic menu items, no new
commands, no schema change, no copy beyond D2 and D4.

## Acceptance

The plan's 14 criteria. In particular: the wire ids are byte-identical; one availability rule per
command; one owner per chord; menu, palette and key agree; one keypress runs one command; no
behavior regression; the 69 existing UI suites and the new parity suite are green; `verify:fast`
passes at both checkpoints.

## Tests and evidence

Per step, as the plan lists. Targeted tests while working; `npm test` and the touched UI suites;
`npm run e2e` for the critical path; `npm run verify:fast` at the two checkpoints. Screenshots for
the four visible changes (D1 wiring, D2 sentence, D4 row, no-document refusals). No `test:perf` or
`test:visual` unless the brief is amended. The Orchestrator runs one full `npm run verify` at
integration.

## Commit

One commit at the end. The nine steps are internal checkpoints, not nine commits. Report the
checkpoint results and any step that needed a detour.

## Stop and report

- A step is still red after one fix attempt.
- A visible change beyond D2 and D4 appears.
- The manifest or the wire set needs a different design.
- A dependency, a schema change or a native dialog is needed.
- The code contradicts the plan in a way that changes the design.

## Report

Summary, files changed, checks run with timings, acceptance criteria pass/fail, decisions applied,
open questions and risks, next step.
