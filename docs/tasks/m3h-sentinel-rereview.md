# M3h Sentinel re-review — closure of the request-changes findings

**Role:** Reviewer / Sentinel (independent)  
**Milestone:** M3h — Sentinel fix pass  
**Base:** current `main` after M3h1/M3h2/M3h3 (`b7ee20e`)  
**Worktree:** fresh review worktree from `main`  
**Scope:** verify the closure of the M3 request-changes findings and the AC-21 deferral. No code changes.

## Context

The original Sentinel review (`docs/reviews/m3-review.md`) requested changes for four S2 findings,
two product S3 findings, and the AC-21 image-anchor gate. Product-owner decisions are recorded in
`docs/plan.md`, `docs/spec.md`, and `docs/design-tokens.md`:

- AC-21 and the image rows of AC-57 are deferred to M3c3b; the image pipeline gates M4/PDF image
  acceptance.
- Canonical shell tokens are 88/28; `callout.safeGap` is a 16 px minimum; idle removal is in M3h3;
  VoiceOver remains the product-owner gate.

Read first:
- `AGENTS.md`, `docs/plan.md`, `docs/reviews/m3-review.md`, `docs/design-tokens.md`, spec v0.4.5.
- M3h reports: `docs/reports/m3h1-placement-undo-active-trunks.md`,
  `docs/reports/m3h2-anchor-safety-flows.md`, `docs/reports/m3h3-live-health-idle-removal.md`.
- The M3h builder diffs/commits and the existing review checklist/DoD.

## Mandatory checks

### S2 findings (must all be closed)
1. **S2-1 placement undo.** Type text in a child, resize so it flips right → below, press `⌘Z`: the
   text edit is undone, block count stays unchanged; the next `⌘Z` reaches the prior structural
   edit. Check the builder’s replay approach for correctness and fallback behavior.
2. **S2-2 AC-55 repair.** Candidate selection and Relink open a before/after preview; Cancel/close
   mutates nothing; Confirm applies one undoable `anchor.repair`; anchor/branch IDs survive. The old
   one-click test must not remain.
3. **S2-3 AC-06 delete disclosure.** Deleting a block/subtree lists external reference parents
   (source/chapter/role/target) before confirm; cancel mutates nothing; confirm removes them with one
   undo.
4. **S2-4 AC-17 live broken state.** Delete anchored text: block warning, callout state, and health
   chip update immediately; repair is reachable; undo clears the warning and redo restores it. Check
   text at minimum and note formula/code coverage.

### S3 findings
- **S3-1 active trunks:** selecting a callout activates only the below trunk; selecting a direct child
  only the right trunk; the second-right-child lead behavior remains correct.
- **S3-2 idle removal:** All anchors includes idle anchors, Remove anchor keeps the target, is one
  undo, and restores the record/binding exactly; a live anchor cannot be removed through this path.

### Gate and regressions
- AC-21 deferral is recorded and consistent with the plan/spec; no image-anchor claim is made.
- M2/M3 critical flows, undo/redo identity, save/reload, split/merge, health sheet, and critical test
  budget still pass.
- Token S3-3 (CSS/TS source drift) may remain as planned **M3h4**; it is not an M3 acceptance blocker
  if recorded. Do not silently ratify a different value.
- No skipped/weakened tests; no fixed sleeps in gate suites; no native-dialog waits.
- Axe/VoiceOver: note what was not re-checked; VoiceOver remains the product-owner gate.

## Deliverable

`docs/reviews/m3h-review.md` in English:

- verdict (accept / accept with minor / request changes);
- table mapping each original S2/S3 finding to closed/open with evidence and tests;
- any new findings ranked S1–S4;
- AC-21 deferral status and remaining M3 gate items;
- test inventory/timings and what was not verified;
- explicit statement whether M3 may proceed to the product-owner VoiceOver/visual gate.

No product code, tests, spec, UX, ADR, or plan changes. You may update
`docs/review-checklist.md`/`docs/definition-of-done.md` phase notes if the gate changes.

## Stop and ask

Stop if the AC-21 deferral is not actually recorded, if a fix is only view-only masking without the
required behavior, or if a new finding requires a product decision.
