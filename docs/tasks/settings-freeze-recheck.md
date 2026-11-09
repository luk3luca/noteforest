# Targeted settings-freeze re-check (after M4e1/M4e2/M4e3)

**Role:** Reviewer / Sentinel (independent; no product-code edits)  
**Milestone:** settings-schema freeze before the UI design/rework  
**Base:** `main` after M4e3 (`4ad695e` plus this brief; exact SHA in the handoff)  
**Worktree:** assigned by the Orchestrator  
**Timebox:** 4 hours

## Why this re-check

The full-codebase Sentinel requested changes before the Settings/UI rework (six
S2, no S1). The fix phase is now merged:

- **M4e1** — app-level Settings, durable per-document overrides, versioned/
  corrupt-safe/serialized settings writes, dead Continuous zoom removed.
- **M4e2** — density 60–120 with 7 pt body/240 card/140 minContent, floor-anchored
  type curve, adaptive callout topology.
- **M4e3** — Page/Continuous token/docs split, legacy literals and duplicate CSS
  fallback removed, Page measurement uses the Page cap; behavior unchanged.

Full verify is green: **102 files / 1022 tests**, **38 UI suites / 133 tests**,
**16 e2e**, **14 recovery**, **0 pageErrors**.

This is the **freeze gate** before the UI design: verify the S2/S3-1 closure,
refresh the inventory to the final model, and list only the decisions the design
still owns. Do not design the menus here.

## Scope

Review:

- `docs/reviews/full-codebase-settings-review.md`, `settings-inventory.md`.
- M4e1/M4e2/M4e3 reports and diffs.
- `docs/tasks/m4e1-settings-platform.md`, `m4e2-page-density-topology.md`,
  `m4e3-token-doc-split.md`.
- `packages/layout/src/page-settings.ts`, `types.ts`, `layout.ts`,
  `page-chrome.ts`; `docs/design-tokens*.md`.
- `apps/desktop/src/shared/settings-file.ts`, `document-settings.ts`,
  `main/document-settings.ts`, `main/library.ts`, `state/settings.ts`,
  `shell/Dialogs.tsx`, `page/measurement.ts`, `styles.css`.
- Settings/density/token/PDF tests and UI suites.
- `docs/review-checklist.md`, `docs/definition-of-done.md`.

## Checks

1. **S2-1** — Settings opens with zero documents; global sections usable; per-doc
   controls disabled with a reason; ⌘, and palette.
2. **S2-2** — per-doc overrides survive close/quit/reopen; id-first/path-fallback;
   migration; rename/move; delete orphan rule.
3. **S2-3** — density 60–120, 7/240/140, floor-anchored curve; 60% denser than
   80/100; Page/PDF parity; 85–95% curve trade-off recorded; no stale 8 pt row.
4. **S2-4** — adaptive A/B2/stacked topology tested/documented; preset remains
   density-only.
5. **S2-5** — writes serialized, failures visible, corrupt backup/warning,
   settingsVersion/migrations, unknown fields; no fire-and-forget.
6. **S2-6** — dead Continuous zoom removed; per-document view zoom still works.
7. **S3-1** — token/docs split, legacy literals/fallback, measurement cap,
   guards; behavior unchanged.
8. **Regressions/gaps** — any new S1/S2 from the fixes; tests/evidence; docs
   drift; the remaining open decisions.

## Deliverables

- `docs/reviews/settings-freeze-review.md`:
  - verdict: **frozen for design** or **changes requested**;
  - S2/S3-1 closure evidence;
  - any remaining S1/S2/S3 with file:line;
  - design-ready summary and open decisions.
- Update `docs/reviews/settings-inventory.md` to the **frozen** state:
  - settings schema `settingsVersion: 2`, document-settings map, no
    `ContinuousSettings.zoom`, no-document Settings, durable/corrupt writes;
  - density 60–120, 7/240/140, floor-anchored curve, adaptive topology;
  - Page/Continuous token ownership from M4e3;
  - remove/close rows fixed by M4e1/M4e2/M4e3; mark remaining rows
    **design decision** vs **engine constant** vs **hidden**;
  - refresh duplicate/missing/migration registers.
- Allowed: update `docs/review-checklist.md`/`definition-of-done.md` with
  reusable rules. No product code, tests, spec, UX, ADR, or plan edits.

## Out of scope

- UI design/menus/mockups, Settings IA, button shapes/positions.
- Refactors/fixes; report them, do not implement.
- Full verify re-run (the Orchestrator already ran it).
- Merge/push/PR.

## Checks and evidence

- Targeted unit/UI commands are allowed; no fixed sleeps/native dialogs/screen
  recordings.
- Use the M4e2 real-DOM lab/table and M4e1/M4e3 tests as evidence; re-run
  targeted suites only if needed.
- Stop and report if the baseline is inconsistent or a product decision blocks
  the freeze.

## Report format

- Verdict and summary.
- S2/S3-1 closure table.
- Remaining findings/risks.
- Frozen inventory summary + pointer.
- Open design decisions.
- Worktree path, branch name, head SHA.
