# Settings Batch C — Page advanced typography and layout

**Role:** Builder / Implementer
**Milestone:** Settings feature implementation, Batch C
**Base:** `design/ui-map` head at delegation (the commit containing this brief)
**Worktree:** provided by the T3 delegation; do not work in the parent checkout
**Timebox:** 2 working days; checkpoint commits
**Source of truth:** `docs/design/ui-settings-contents.md` §4.3/§4.4, the frozen settings
inventory, and this brief

## Context

Batches A/B delivered the instant-save Settings shell and the core Page settings (setup/orientation/
margins/scope/preview/density/preset). The frozen PageTheme also contains advanced typography and
layout fields that already exist in the model but have no UI yet. This batch exposes them with the
right first-class/Advanced/hidden split, without a schema or migration.

The product owner removed External API/agent access from the Settings plan. Do not add it. If an
agent surface is pursued later, it is an MCP/commands surface, not a Settings harness/agent page.

The four visual refinements (Settings fixed width, toast tokens, tab behavior, canvas inset) and the
lazy-new-document lifecycle are separate batches; do not mix them here. Merge order after this
batch: design/ui-map → visual batch → main.

Read first:

- `AGENTS.md`, `docs/tasks/ui-rework.md`, `docs/reports/ui-batch-b.md`.
- `docs/design/ui-settings-contents.md` §4.3/§4.4; `docs/reviews/settings-inventory.md` §5/§6;
  `docs/reviews/settings-freeze-review.md` (S3-1, S3-2, S3-12).
- `docs/design-tokens-page.md`, ADR-0008, M4c1/M4c2/M4c3/M4d1/M4d2 reports.
- `apps/desktop/src/renderer/src/settings/page-setup.ts`, `page-settings-write.ts`,
  `usePageSettingsController.ts`, `PageSettingsPreview.tsx`,
  `apps/desktop/src/renderer/src/shell/SettingsDialog.tsx`;
  `packages/layout/src/page-settings.ts`; affected tests.

## Goal

The Page settings page exposes the frozen advanced typography and layout fields with real values,
instant save, scope/override, validation, live preview, and Page/PDF parity. No schema/migration,
no fake controls, no hidden/engine values.

## In scope

### 1. First-class / Advanced split

- **First-class:** `maxCardWidth` (inventory BX-14) as a normal Page setting, not inside Advanced.
- **Advanced typography** (collapsed by default, `Advanced typography`):
  - `bodyPt`, `bodyLine`
  - `heading1Pt`, `heading2Pt`, `heading3Pt`
  - `codePt`, `codeLine`
  - `tablePt`, `tableLine`
  - `labelPt`
- **Advanced layout** (collapsed by default, `Advanced layout`):
  - `minContentWidth`, `cardPadding`, `cardBorder`
  - `segmentGap`, `siblingGap`, `calloutGap`
  - `wrapIndent` labeled **List indent**
  - `maxWrapIndent`
  - `childIndent`
- Do not expose engine/hidden values: `fontScale`, `headingScale`, `pagePacking`, `calloutModes`,
  `wrapPolicy`, subtree-fit internals, `calloutModeMinWidth`, trunk insets, `calloutCardIndent`,
  `calloutRightGap`, chrome/marker point sizes (Page chrome is a future page), `chapterGap`,
  `cardRadius`, and all ENG constants.

### 2. Controls and validation

- Number fields with the frozen ranges from the inventory; units (`pt`, `px`) and clear labels.
- Cross-field constraints enforced without silent clamp/reset:
  - headings ≥ body + 3 / + 1.5 / + 1 (H1/H2/H3);
  - `maxWrapIndent` ≥ `wrapIndent`;
  - `childIndent` effective ≥ `childTrunkInset + 12 + 2`;
  - `minContentWidth`/`maxCardWidth` within their ranges and the density band where applicable.
- Invalid values show an inline error (role `alert`, `aria-describedby`) and block the write; keep
  the user's input visible.
- Preset/Custom: editing an advanced value sets/keeps the Custom marker per the frozen model;
  switching preset warns if advanced values would be replaced (Q-11). Do not silently discard
  advanced values.
- Density remains the lens; editing raw pt values is advanced and applies the density lens once.
- Scope/override: every advanced field participates in global/document scope, per-field override
  dots, Use global, equal-to-global auto-remove, and no write on scope switch.
- No document/read-only: same rules as Batch B; document scope disabled with a reason, read-only
  personal overrides allowed.
- Page Edit commits before any write that can re-paginate; failed commit blocks and shows the error.

### 3. Preview and parity

- The live Page preview reflects the draft advanced fields and the active scope.
- Page Read, Page Edit, measurement, and PDF consume the same effective theme; no separate
  paginator/print path.
- No PDF output change for the same settings; Page/PDF parity tests cover advanced typography and
  layout values (e.g., body/headings, card padding, gaps, indents, max card width).

### 4. Tests and evidence

- Extend the Batch B settings suite or add `ui-settings-advanced` covering:
  - first-class `maxCardWidth`;
  - advanced disclosure, all fields write/read, units/ranges;
  - cross-field validation and no silent reset;
  - preset/Custom behavior and warning;
  - scope/override/Use global/equal-to-global; no-document/read-only;
  - preview update; Page Edit commit; Page/PDF parity.
- Update `r1b-page-settings`, `m4d1-page-density`, `m4e1-settings-platform`, `m4b1-page-view`,
  `m4c1-print-compositor`, `m4c3-pdf-gate`, `m4d2-export-ui` as needed.
- Do not weaken assertions, add fixed sleeps, or open native dialogs. E2E uses the test dialog guard.
- Screenshots under `artifacts/ui-settings-advanced/` (ignored): advanced typography, advanced
  layout, max card width, invalid cross-field, preview.
- Targeted during work: `check:boundaries`, `typecheck`, affected unit/UI/e2e/PDF suites. End: one
  `verify:fast` with timings. Do not run full `verify` (Orchestrator at integration).

## Out of scope

- Page chrome, manual breaks, Page font, Appearance v3, Export defaults, Continuous global, Data
  recovery, External API/agent access, Editor/General future, library/backup, light/search.
- Settings fixed width, toast, tab behavior, canvas inset, lazy new document.
- Schema/migration, new dependencies, Page sheet/paginator/print-compositor redesign, spec/UX/ADR/
  plan/AGENTS edits, lab edits.

## Acceptance criteria

- [ ] `maxCardWidth` first-class; advanced typography/layout fields exposed under the correct
      Advanced groups; hidden/engine values remain hidden.
- [ ] Fields use frozen ranges/units, validate cross-field constraints inline, and never silently
      clamp/reset.
- [ ] Preset/Custom behavior is explicit; advanced values are not silently discarded.
- [ ] Advanced fields participate in scope/override/Use global/equal-to-global and no-document/
      read-only rules.
- [ ] Live preview and Page Read/Edit/PDF parity hold; no PDF change for the same settings.
- [ ] Page Edit commit-before-write works; failed commit blocks.
- [ ] Tests, screenshots, and one `verify:fast` pass; report maps criteria.

## Stop and ask

- A field is not actually frozen or requires a schema/migration.
- A cross-field rule conflicts with the model/sanitizer.
- Exposing a field would change PDF behavior beyond the settings values.
- A baseline/parity test fails for an unrelated reason.
- A product decision is missing; do not invent a control.

## Integration

The Orchestrator reviews, runs the full `npm run verify`, and merges into `design/ui-map` (not
`main`). After this batch, the visual refinement batch runs, then `design/ui-map` merges to `main`.
The builder does not merge, push, or open a PR.

## Report format

Summary; checkpoint commits; files changed; checks/timings; acceptance pass/fail; worktree/branch/
head; open questions/risks; next step.
