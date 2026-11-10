# UI rework — Batch B (Page settings + Page/PDF)

**Role:** Builder / Implementer
**Milestone:** UI rework, delivery Batch B
**Base:** `design/ui-map` head at delegation (the commit containing this brief)
**Worktree:** provided by the T3 delegation; do not work in the parent checkout
**Timebox:** 2 working days; checkpoint commits
**Visual reference:** the Batch A app and `docs/design/ui-lab/` (Page settings mock; mock only)
**Source of truth:** `docs/design/ui-settings-contents.md` §4, the frozen settings inventory, the
Page tokens, and this brief

## Context

Batch A is merged into `design/ui-map` at `af815eb` and is the real shell/settings/export/palette
foundation. Batch B completes the Page settings surface:

- Page setup/orientation/margins, global + per-document scope, live preview, validation, and
  density/preset;
- Page/PDF-affecting work only where the settings require it;
- no fake future controls. Appearance v3, Export defaults, Continuous global, Page chrome, manual
  breaks, Data recovery, and External API remain planned/empty pages.

The Page sheet, paginator, print compositor, and PDF output must stay identical to Batch A for the
same settings. Changing a Page setting may legitimately re-paginate, but the Page Read/Edit/PDF
paths must consume the same effective settings and stay in parity.

Read first:

- `AGENTS.md`, `docs/tasks/ui-rework.md`, `docs/reports/ui-batch-a.md`.
- `docs/design/ui-settings-contents.md` §4; `docs/reviews/settings-inventory.md`;
  `docs/reviews/settings-freeze-review.md` (S3-2, S3-12, open decisions 1–4).
- `docs/design-tokens-page.md`, `docs/adr/0007-editor-layouts-and-modes.md`,
  `docs/adr/0008-personal-page-settings.md`.
- `docs/adr/0002-pdf-pipeline.md`, the M4c1/M4c2/M4c3/M4d1/M4d2 reports.
- `apps/desktop/src/renderer/src/shell/SettingsDialog.tsx`, `state/settings.ts`,
  `page/PageView.tsx`, `page/measurement.ts`; `packages/layout/src/page-settings.ts`;
  `apps/desktop/src/shared/settings-file.ts`, `main/document-settings.ts`.
- Affected unit/UI/e2e/PDF tests.

## Goal

The Page settings page is complete for the frozen model: real values, instant save, global/document
scope, live preview, validation, and parity with Page Read/Edit/PDF.

## In scope

### 1. Page setup

- Page size **A4 / A5 / Letter**; orientation **portrait / landscape**; margins **top/right/bottom/
  left** in mm.
- Four labeled number fields plus an **All sides** control; unit suffix; keyboard/stepper behavior.
- Validation: 0–100 mm per field; content area at least 20 mm per axis; inline error with
  `aria-describedby`; invalid values block the write and show the error; **no silent sanitize/reset**
  to 12 mm.
- Defaults: A4 landscape / 12 mm (working decision; confirm in the first checkpoint).
- Scope: **Global default / This document**; switching scope never writes or creates an override.
  Per-field override dots, **Use global** per field/group, reset to global/default; a value equal to
  global auto-removes the override.
- No document: document scope disabled with a reason; global setup usable. Read-only: personal
  overrides allowed; content never mutated.
- Page Edit (if open) commits before a geometry/density write; a failed commit blocks the write and
  shows the error.

### 2. Typography / density

- Preset **Compact / Comfortable / Custom**; density slider 60–120%, step 5, current value, reset.
- Preset and density are one effective PageTheme; changing density from a preset shows Custom (or
  the agreed Q-11 behavior); do not expose hidden `fontScale`/`headingScale`.
- Advanced typography (body/heading/code/table sizes, line heights, Page font) stays hidden in this
  batch; Page font is deferred.
- Max card width is **first-class** only if the frozen inventory marks it as a real user setting;
  use the frozen value/defaults, not the old lab numbers. Do not expose engine/advanced spacing
  (segment/sibling/callout gaps, card padding/border, indents) unless the frozen inventory marks
  them first-class.
- Density changes may move a callout between the right lane and below (adaptive topology); the UI
  may include one help line, no fixed-topology promise.

### 3. Live preview

- Page thumbnail in Settings, using the **real** page model/measurement, not a fake skeleton.
- It reflects the draft setup/orientation/margins/density/preset and the active scope
  (global default vs this document), updates on valid changes, and shows an invalid/loading state.
- Same geometry/typography as Page Read; the print/PDF path still uses the same resolved settings.
  No separate re-pagination in the preview beyond the existing model.
- If no document is available, use a clearly labeled sample or disable the preview with a reason;
  no fake exact page count.

### 4. Persistence and parity

- Use the existing global settings store + durable per-document map; no schema/migration change.
- Instant save only; status/retry/Done from Batch A; failed writes never show a false saved.
- Page Read, Page Edit, measurement, and PDF use the same effective settings. Add/update parity
  tests for A4/A5/Letter, portrait/landscape, 12 mm and a non-default margin, density 60/100/120,
  and a document override.
- Page density changes must not change the print model for the same settings; PDF page count and
  text/geometry parity remain green.

### 5. Tests and evidence

- Update `r1b-page-settings`, `m4d1-page-density`, `m4e1-settings-platform`, `m4b1-page-view`,
  `m4c1-print-compositor`, `m4c3-pdf-gate`, `m4d2-export-ui` as needed; add a Batch B Page settings
  suite covering:
  - size/orientation/margins write, scope switch no write, per-field override/Use global,
    equal-to-global auto-remove, no-document/read-only;
  - margin labels/units/All sides, 0–100, min content 20 mm, inline error, no silent reset;
  - preset/density/Custom, reset, density topology help;
  - live preview updates and invalid/loading;
  - Page Edit commit before a geometry/density write, failure blocks;
  - Page/PDF parity at the settings above.
- Do not weaken assertions, add fixed sleeps, or open native dialogs. E2E must use the test dialog
  guard.
- Screenshots under `artifacts/ui-batch-b/` (ignored): Page settings default, invalid margins,
  document override, preview update, Page Read/PDF parity if useful.
- Targeted during work: `check:boundaries`, `typecheck`, affected unit/UI/e2e/PDF suites. End:
  one `verify:fast` with timings. Do not run the full `verify` (the Orchestrator does at integration).

## Out of scope

- Page chrome (header/footer/page numbers/chapter start), manual breaks, Page font/advanced
  typography, Appearance v3, Export defaults, Continuous global, Data map recovery, External API,
  library/backup, light theme/search. These remain empty/planned pages; no fake controls.
- Page sheet/paginator/print-compositor redesign; PDF layout changes for the same settings.
- Settings shell/instant-save/export/palette changes (Batch A is the foundation; only Page-specific
  integration).
- Spec/UX/ADR/plan/AGENTS edits (report only), lab code edits, new dependencies, settings
  schema/migration.

## Acceptance criteria

- [ ] Page setup (size/orientation/margins) is real, instant-saved, scoped, and validated; margins
      are labeled with mm/All sides and invalid values show an error without a silent reset.
- [ ] Scope/override dots, Use global, equal-to-global auto-remove, no write on scope switch,
      no-document/read-only are covered.
- [ ] Preset Compact/Comfortable/Custom + density 60–120 work; advanced typography is hidden.
- [ ] Live preview reflects the draft and active scope, with invalid/loading states.
- [ ] Page Edit commits before geometry/density writes; failure blocks the write.
- [ ] Page Read/Edit/measurement/PDF use the same settings and stay in parity; no PDF output change
      for the same settings.
- [ ] Tests/screenshots/one `verify:fast` pass; report maps every criterion.

## Stop and ask

- A Page setting needs a new schema/migration or an unfrozen field.
- Page chrome/advanced typography/manual breaks would be required to finish; they are future.
- The preview cannot use the real model without changing Page/PDF output.
- A Page/PDF parity test fails or a baseline fails for an unrelated reason.
- A product decision is missing; do not invent a fake control.

## Integration

The Orchestrator reviews, runs the full `npm run verify`, and merges into `design/ui-map` — not
`main`. Batch B completes the core UI; future functions remain planned/empty. The builder does not
merge, push, or open a PR.

## Report format

Summary; checkpoint commits; files changed; checks/timings; acceptance pass/fail; worktree/branch/
head; open questions/risks; next suggested step.
