# M3 Sentinel review — functional closure and design-system audit

**Role:** Reviewer / Sentinel (independent)  
**Milestone:** M3 — span anchors and reference edges  
**Base:** current `main` after M3g5 (branch lead + nested below placement) is merged  
**Worktree:** fresh review worktree from `main`  
**Scope:** M3 acceptance, product-owner fixes, design-token extraction, regressions. No code changes.

## Context

M3a1–M3f2 plus five product-owner review fixes (M3g1 below-stack/idle anchors, M3g2 lane
width/right-group push/edge radius, M3g3 callout safe zone, M3g4 callout stacking/trunk gap, M3g5
right-trunk lead and nested below-stack placement) are merged. The product owner did a manual pass
and found real layout issues; this review must be stricter than a normal code review about **visual
and layout consistency**, and must extract design rules/tokens rather than only listing bugs.

Read first:
- `AGENTS.md`, `docs/plan.md`, `docs/spec.md` v0.4.5, `docs/ux.md` v1.4, ADR-0005.
- `docs/design/m3-anchors-references.md`, `docs/design-tokens.md`, `docs/reviews/m2f-phase5c-review.md`.
- M3 reports: `docs/reports/m3*.md`, especially M3g1/M3g2/M3g3/M3g4/M3g5.
- `docs/definition-of-done.md`, `docs/review-checklist.md`.

## Mandatory checks

### 1. Product-owner fixes (reproduce at app level)
- Below stack: trunk starts inside the parent at `+12` and `trunkGap` (8 px) below the card bottom;
  rows indented `+26`; block and arrow move together; no card overflow.
- Anchor stacking: an anchor child added after a direct child is hit-testable and painted above the
  direct-child group; parent card controls stay above the lane; safe zone still prevents overlap.
- Lane alignment recovery: reload a saved note with callouts repeatedly; `--nf-lane-width` stays
  240–480 and every row has a measured `--nf-callout-offset` (no full-canvas lane).
- Idle anchors: no underline/dot/marker/callout when no outgoing branch; undo restores; canonical
  binding untouched or exactly restored.
- Lane width: 240–480; right group at `max(parent.right, lane.right)+24`; only the excess pushes;
  callout right stops 16 px before the right-group trunk; direct children wrap below after callouts
  when the safe zone is too narrow.
- Right trunk: the shared trunk leaves the parent with a visible horizontal lead (24 px group gap =
  10 px lead + 12 px stem + 2 px gap), then descends.
- Nested below stack: a child of a callout (or of a wrapped direct child) stacks under that row, never
  on the enclosing parent's direct-child column; the two cards must not overlap.
- Edge radius 2 px: near-right angles, no wide arcs, clean gapped trunk start.
- Test at 1440, 960, and a 160 px parent with a far-right anchor; multiple callouts and direct
  children; nested callouts; max-width parent.

### 2. Design-system audit (this is a primary deliverable)
- Inventory hardcoded layout/visual values in `apps/desktop` CSS/TS that are **not** in
  `design-tokens.ts` or CSS variables: spacing, indents, gaps, widths, radii, line widths, z-index,
  colors, borders, shadows, typography, breakpoints, min/max card sizes.
- Check consistency: callout lane, right group, trunk, arrow stems, edge colors, selected/idle/broken
  states, reference chips, health sheet, split/merge states, empty chapters, table/code/formula
  blocks, zoom/fit.
- Extract a proposed token list with: semantic name, current value(s) found, where used, whether it
  is a must-fix inconsistency or a future polish. Include colors/borders/typography beyond the
  current geometry tokens.
- Check whether a single source of truth exists for each rule; flag values that differ only because
  of drift.
- Do not implement; produce the extraction table for the Orchestrator.

### 3. M3 acceptance criteria
- AC-03–AC-07, AC-10, AC-12, AC-15–AC-22, AC-54–AC-58: per-AC status with evidence.
- AC-56: `buildExportPlan` exactly-once manifest; M4 PDF evidence correctly deferred.
- AC-18: split/merge anchor migration, identity, one undo.
- AC-21 image anchors: **blocked** by the missing image/asset pipeline. State explicitly whether M3
  can be accepted with a recorded deferral or requires the pipeline first.
- Anchored-first order, reference edges layout-neutral, shared child once, repair identity.

### 4. Regressions and quality
- M2/M3 critical flows, undo/redo identity, save/reload, split/merge, health sheet.
- Critical e2e budget: 21 tests, suite time; UI suite time; no skipped/weakened tests, no fixed sleeps,
  no native-dialog waits.
- Accessibility: axe serious/critical zero; marker/health/reference focus paths; VoiceOver is a
  product-owner gate, not automated.
- No dead code/secrets/network calls.

## Deliverable

`docs/reviews/m3-review.md` in English:

- verdict (accept / accept with minor / request changes);
- per-AC table with evidence and tests;
- product-owner-fix status;
- **design-token extraction table** (must-fix vs future) and any inconsistent visual rules;
- new findings ranked S1–S4 with file:line and repro;
- test inventory/timings;
- residual gaps (image anchors, paste/duplicate, chip overlap, 160 px cap, nested-callout coverage,
  lane attachment race regression);
- what was not verified.

No product code, tests, spec, UX, ADR, or plan changes. You may update
`docs/review-checklist.md`/`docs/definition-of-done.md` phase notes if the review finds a gate change.

## Stop and ask

Stop if a finding requires a product decision (image-anchor acceptance, unified-flow model, token
values), or if a visual rule conflicts with the ratified design package.

## Report format

Verdict, AC status, design extraction table, new findings, timings, residual gaps, product-owner
decisions needed.
