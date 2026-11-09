# Full-codebase Sentinel + settings inventory

**Role:** Reviewer / Sentinel (independent; no product-code edits)  
**Milestone:** full-codebase review after PDF/density/export UI, before the Settings/UI rework  
**Base:** `main` at the M4d1/M4d2 integration (`53c7e49` plus this brief commit)  
**Worktree:** assigned by the Orchestrator  
**Timebox:** 3 days

## Why this review

The Page/PDF pipeline, Page density, and the temporary export UI are now merged
and verified (99 files / 982 tests, 37 UI suites / 129 tests, 16 e2e, 14
recovery, 0 pageErrors at `a4d142d`/`53c7e49`). The next product step is a
Settings/UI rework, but the settings model must be inventoried first. Review the
whole codebase and produce the complete settings inventory and a prioritized
refactor/fixer brief. Do not implement the rework here.

## Scope

Review all packages and the desktop app:

- `packages/core` — document model, commands, schema, persistence.
- `packages/layout` — Continuous layout, Page layout, paginator, page settings,
  density, edges/trunks, chrome, print model.
- `packages/pdf` — print model, inspection, export contract.
- `apps/desktop` — main, preload, renderer (shell, Page, Continuous, export UI,
  settings store/dialog), tests.
- Docs: spec, UX, ADRs, design tokens, settings plans, reports, reviews.

Do not review the external API `packages/api` (not scaffolded) or M5.

## Settings inventory (main deliverable)

Catalog every user/engine value that a future Settings UI might expose or that
the engine owns. For each item record:

- name/path and current default;
- type/unit, valid range, clamping/normalization;
- user-facing vs advanced vs engine constant vs print-only;
- Page vs Continuous vs shared/global vs per-document override;
- label/group/context where it belongs in the future UI;
- consumers (layout, measurement, CSS, print, export);
- duplicated/hardcoded/dead/stale status;
- migration needs.

Include at least:

- Page setup: size, orientation, margins; defaults and ranges.
- PageTheme typography: density, font scale, body/heading/code/table/label/
  chrome/marker sizes, line heights.
- Boxes/spacing: card padding/border, segment/sibling/callout gaps, wrap/max
  wrap/child indents, trunk insets, callout card/right/mode floor.
- Packing/topology: pagePacking, callout modes, child wrap, subtree fit,
  stacked legacy path.
- Manual breaks and unhonored-hint behavior.
- Print/PDF: print skin, page chrome, page numbers, continuation/ghost, export
  default filename/folder, overwrite policy, hidden-window/preflight settings.
- Continuous: zoom, canvas width, future font/width/spacing.
- App/shell: theme, library/app-data paths, any view-state settings that are
  not document content.
- Export UI: menu/palette/Page button, progress/cancel, default path behavior.

Flag values that should be hidden, computed, merged, renamed, or moved between
Page/Continuous; values that must not be exposed; and missing settings that the
UI rework will need.

## Review questions

1. Architecture and boundaries: package responsibilities, imports, dead code,
   duplicated helpers, error handling, state ownership.
2. Page/Continuous separation: tokens/namespaces/docs; any shared design value
   that should be split; `docs/design-tokens.md` index vs Page/Continuous docs.
3. Settings correctness: persistence, merge/resolve, per-document override,
   normalization, fingerprints, migration/backward compatibility.
4. Density (M4d1): effective theme, floors (body 8 pt, minContentWidth 150,
   maxCardWidth 280–560), global/per-doc UI, Page/PDF parity, lab results.
5. Export UI (M4d2): menu/palette/Page entries, save dialog, overwrite/progress/
   cancel/error, Continuous/Page behavior, temporary UI risks.
6. PDF/print: M4c pipeline, print model, hidden window, validation, settings
   identity, packaging; any R3–R10/S3 leftover.
7. Tests/evidence/docs: coverage of the new settings/UI, stale docs, missing
   gates, fixed sleeps/native dialogs, reliability.
8. UI rework input: contexts/pages, control grouping, advanced disclosure,
   button positions/shapes, states, naming, cleanup priorities.

## Output

Write:

- `docs/reviews/full-codebase-settings-review.md` — verdict, severity-ranked
  findings (S1/S2/S3) with file:line evidence, architecture findings, answers to
  the eight questions, and a prioritized refactor/fixer brief for the
  Orchestrator.
- `docs/reviews/settings-inventory.md` — the complete settings catalog for the
  UI rework, grouped by Page/Continuous/global/print/export, with the fields
  above and explicit “expose/hide/advanced/engine constant” decisions.

You may update `docs/review-checklist.md`/`docs/definition-of-done.md` with
reusable rules. Do not modify product code, tests, spec, UX, ADR, or plan. No
merge/push/PR.

## Checks

- Targeted unit/UI commands are allowed; the Orchestrator already ran the full
  verify at `a4d142d`/`53c7e49`. Do not re-run the full `npm run verify`.
- No fixed sleeps, native dialogs, or screen recordings.
- Stop and report if the baseline is inconsistent or a finding needs a product
  decision.

## Report format

- Summary and verdict.
- Findings and evidence.
- Settings inventory summary + pointer to `settings-inventory.md`.
- Refactor/fixer brief priorities.
- UI rework input (contexts/pages/controls/button hierarchy).
- Open questions/risks.
- Worktree path, branch name, head SHA.
