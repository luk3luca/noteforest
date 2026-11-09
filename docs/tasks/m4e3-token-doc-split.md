# M4e3 — Page/Continuous token + docs split (P0)

**Role:** Builder / Implementer  
**Milestone:** pre-UI token/docs split; Settings menu IA is designed later  
**Base:** `main` after M4e1/M4e2 (`d8ed3c6` plus this brief; exact SHA in the handoff)  
**Worktree:** assigned by the Orchestrator  
**Timebox:** 1.5 days

## Context

The full-codebase Sentinel marked the Page/Continuous token split **S3-1 (P0)**:
one `docs/design-tokens.md` mixes Page and Continuous values, Page still has
legacy literals and a duplicate CSS fallback, and Page measurement reads a
Continuous CSS token. This must be cleaned before the Settings/UI design so the
inventory and menus sit on stable ownership.

M4e1/M4e2 are merged and verified: settings platform S2s closed; density is
60–120 with **7 pt body, 240 card, 140 minContent**, floor-anchored type curve,
adaptive callout topology. Do not change those values or behavior here.

## Goal

Separate Page and Continuous design ownership in code and docs, remove the
legacy/duplicated Page values, and keep behavior byte-for-byte equivalent for
layout/Page/PDF. This is a refactor/docs task, not a feature.

## In scope

### Docs split

- Turn `docs/design-tokens.md` into a short **index**.
- Add separate Page and Continuous token docs:
  - `docs/design-tokens-page.md` — PageSetup/PageTheme/density, typography,
    boxes/spacing/indents, packing/callout topology, page chrome/edge/print
    values, Page-only vs shared engine primitives.
  - `docs/design-tokens-continuous.md` — Continuous canvas/zoom, shell tokens,
    shared edge primitives explicitly marked shared.
- Update AGENTS/docs links; remove the stale M6 “future token override” wording
  and the cumulative `maxWrapIndent` claim (implementation is per-level).
- Do not design the Settings menus; docs describe ownership/values only.

### Code cleanup

- Remove legacy Page literals/fallbacks identified in the Sentinel:
  `CALLOUT_ROW_INDENT = 26`, the 144 px readability floor and 16 px fallback in
  the legacy below-stack lane; replace with PageTheme/LayoutOptions or a
  documented engine constant, preserving behavior.
- Remove or generate the hand-maintained compact CSS fallback duplicated in
  `styles.css`; add a guard that it cannot silently drift (or delete it if the
  runtime always applies `pageCssVariables`).
- Fix `.nf-measure-card` reading the Continuous `--nf-child-max-width`; Page
  measurement must use the Page cap/measurement width.
- Remove unused `--nf-page-*` variables or wire them; no dead CSS/JS surface.
- `DEFAULT_LAYOUT_OPTIONS.childIndent` must not silently read a Page-only value;
  use `wrapIndent`/an engine default or document the contract and adjust tests.
- Fix `types.ts` stale “compaction for compact” comment; remove unused
  `pxToMm`/`MM_PER_PX` if confirmed dead.
- Decide/document Page card radius and chapter gap ownership (PageTheme vs
  shared primitive); no visual change.
- Add guard tests:
  - Page measurement/styles do not read a Continuous-only token;
  - CSS fallback matches the compact theme or is gone;
  - no legacy Page literal remains outside the documented layer;
  - docs links/rows are consistent with the code constants.

## Out of scope

- Changing density range/floors/curve, PageTheme values, layout/packing,
  callout geometry, page counts, PDF/export behavior.
- Settings menu IA/UI, manual breaks UI, export polish.
- Settings persistence/store/session (M4e1 done).
- Spec/UX/ADR/plan content changes beyond token-doc links; no product decisions.
- Merge, push, PR, parent-checkout edits.

## Files to read

- `docs/reviews/full-codebase-settings-review.md` S3-1.
- `docs/reviews/settings-inventory.md` §3–§5, §9, §12–§14.
- `docs/design-tokens.md`, `docs/adr/0008-personal-page-settings.md`,
  `docs/tasks/page-settings-ui-plan.md`.
- `packages/layout/src/page-settings.ts`, `layout.ts`, `types.ts`,
  `page-chrome.ts`, `edge-style.ts`.
- `apps/desktop/src/renderer/src/styles.css` (Page/measure/fallback),
  `page/measurement.ts`, `page/projection.ts`, `lib/design-tokens.ts`.
- Page/density/PDF tests and labs.

## Acceptance criteria

- [ ] Index + Page + Continuous token docs, links updated; no mixed ownership.
- [ ] Legacy Page literals/fallback removed or generated/documented; behavior
      unchanged.
- [ ] Page measurement no longer reads a Continuous-only token.
- [ ] Unused Page CSS vars/literals removed or wired; guard tests.
- [ ] `maxWrapIndent`/`childIndent`/compaction comments corrected or contract
      documented.
- [ ] Page counts/geometry/density/PDF results unchanged (targeted suites).
- [ ] One `npm run verify:fast` green with timings.
- [ ] Report maps criteria and lists risks.

## Stop and ask

Stop and report if:

- a cleanup requires a behavior/metric change;
- Page/Continuous ownership needs a product decision (e.g., card radius);
- the CSS fallback cannot be removed without a runtime change;
- a settings schema/value change is needed;
- the baseline has unrelated failures.

## Report format

- Summary and scope.
- Files changed.
- Checks/timings.
- S3-1 evidence.
- Behavior-unchanged evidence (page counts/geometry/PDF).
- Open questions/risks.
- Worktree path, branch head SHA.
