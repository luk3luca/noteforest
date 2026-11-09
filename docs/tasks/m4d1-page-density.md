# M4d1 — Page density control (temporary thin slice)

**Role:** Builder / Implementer  
**Milestone:** Page density setting before the full-codebase Sentinel/settings inventory  
**Base:** `main` after M4c3 (`1a3eb62` plus this brief; exact SHA in the handoff)  
**Worktree:** assigned by the Orchestrator  
**Timebox:** 1.5 days

## Context

The product owner accepted the PDF gate and asked for a Page density control:
A4 portrait top-level cards are large, so parent/child often wraps below; a
"dezoom" that fits more content per page is wanted. This is **not** a CSS zoom:
it changes the values used before measurement and makes the paginator reflow.
Page Read, Page Edit, and PDF must all use the same resolved density.

This is a temporary thin slice. The full-codebase Sentinel/settings inventory
and the later UI rework will polish the control and its placement; do not build
the final Settings pages here.

## Goal

Add a Page-only density setting (slider 80–120%, default 100%) that scales the
Page theme before measurement, re-paginates, and is persisted globally with an
optional per-document override. Provide a minimal Settings control so the
product owner can test showcase/stress.

## Decisions (confirmed by product owner)

- One user-facing slider: **Page density**, 80–120%, step 5, default 100.
- Global default + per-document override.
- Body text floor: **8 pt** (compact is 9 pt; at 80–88% the type may clamp while
  geometry still shrinks). `minContentWidth` floor ~150 px.
- Page Read, Page Edit, PDF share the resolved density; no PDF-only scale.
- Temporary UI; final placement/shape in the UI rework.
- Export PDF UI is a separate task (M4d2); do not implement it here.

## In scope

- Add a `density` value to the Page settings/theme model (0.8–1.2, default 1),
  normalized and included in the settings fingerprint. Backward-compatible with
  existing settings/overrides.
- Pure `resolve/applyPageThemeDensity(theme)` (name is yours) that derives the
  effective theme used by `pageLayoutOptions`, `pageCssVariables`, measurement,
  and the print model:
  - typography sizes scale with density, body floor 8 pt;
  - card padding, segment/sibling/callout gaps, wrap indents, child/trunk
    indents scale;
  - `maxCardWidth` scales and is clamped to a readable range (suggest 280–560);
  - `minContentWidth` clamps to ~150;
  - page setup/margins never change.
- Wire the effective theme everywhere the resolved PageTheme is consumed
  (Page Read/Edit measurement, CSS variables, print/export snapshot). The
  existing fingerprint must include density so PDF identity stays exact.
- Minimal SettingsDialog Page section:
  - "Page density" slider with percent label and Reset;
  - scope: global default + "Use for this document" override (or equivalent
    clear control);
  - explicit Apply/Cancel (product-owner preference); a live preview is welcome
    if it does not complicate Cancel;
  - no final visual polish; keep it inside the existing dialog patterns.
- Tests:
  - normalization/ranges/default, per-document override, fingerprint;
  - effective theme values at 80/90/100/110/120 (body floor, card width, gaps);
  - layout lab on showcase/stress/scale-300 at several densities: page count,
    whitespace, body readability note;
  - Page Read/Edit at two densities and a PDF/print-model identity check if
    cheap (full export UI is M4d2).
- Report at `docs/reports/m4d1-page-density.md`.

## Out of scope

- Export PDF UI, save dialog, menu/palette (M4d2).
- Final Settings page design/UI rework, button shapes/positions.
- Continuous density; Continuous tokens unchanged.
- Full-codebase Sentinel, settings inventory, spec/UX/ADR changes.
- Changing page size/margins or the paginator algorithm.
- Merge, push, PR, parent-checkout edits.

## Files to read

- `packages/layout/src/page-settings.ts` — PageTheme/tokens/normalization/CSS.
- `packages/layout/src/layout.ts`, `types.ts` — `pageLayoutOptions` consumers.
- `apps/desktop/src/renderer/src/state/settings.ts` — global/override store.
- `apps/desktop/src/renderer/src/shell/Dialogs.tsx` — SettingsDialog.
- `apps/desktop/src/renderer/src/page/usePageModel.ts`, `model.ts`,
  `measurement.ts` — re-measure/re-paginate path.
- `packages/pdf/src/printModel.ts` — resolved theme/fingerprint.
- `docs/tasks/page-settings-ui-plan.md`, `docs/adr/0008-personal-page-settings.md`.
- `packages/layout/test/page-settings.test.ts`, layout labs, UI test harness.

Expected to touch:

- `packages/layout/src/page-settings.ts` (+ types if needed)
- `apps/desktop/src/renderer/src/state/settings.ts`
- `apps/desktop/src/renderer/src/shell/Dialogs.tsx`
- Page model/measurement/print consumers as required
- tests/labs, `docs/reports/m4d1-page-density.md`

## Acceptance criteria

- [ ] Density 80–120 default 100, normalized, persisted global + per-doc.
- [ ] Effective theme re-measures/re-paginates; Page Read/Edit/PDF share it.
- [ ] Body ≥ 8 pt, minContentWidth ≥ ~150, maxCardWidth readable clamp.
- [ ] Page setup/margins unchanged; Continuous untouched.
- [ ] Settings control works with Apply/Cancel and reset.
- [ ] Lab records page count/whitespace/readability at 80/90/100/110/120.
- [ ] Targeted tests + one `npm run verify:fast` green with timings.
- [ ] Report maps criteria and lists risks.

## Stop and ask

Stop and report if:

- density requires a settings-schema migration or a print/PageTheme contract
  change;
- the body floor makes the 80% slider meaningless without a product decision;
- the lab shows a readability/page-count regression that needs a product call;
- the control requires a final Settings UI decision;
- the baseline has unrelated failures.

## Report format

- Summary and scope.
- Files changed.
- Checks/timings.
- Acceptance pass/fail.
- Lab page count/whitespace/readability.
- Open questions/risks.
- Worktree path, branch head SHA.
