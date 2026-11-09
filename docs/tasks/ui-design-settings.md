# UI design — Settings + Page toolbar/setup/export

**Role:** UX / Product designer (design deliverable; no product-code edits)  
**Milestone:** design before the UI rework  
**Base:** `main` after the settings freeze (`81207e3`/`e4ad25c` plus this brief; exact SHA in the handoff)  
**Timebox:** 2 days

## Context

The settings schema is **frozen for design** (`docs/reviews/settings-freeze-review.md`,
frozen `docs/reviews/settings-inventory.md`): no S1/S2; S2-1–S2-6 and S3-1
closed. The fix phase is complete. The next step is the **UI design**, not
implementation: menus, contexts, grouping, buttons, shapes, states, and copy.
The implementation rework comes after product-owner review.

Use the frozen inventory as the source of truth. Do not re-open model decisions
unless the design exposes a real contradiction; list those as open decisions.

## Goal

Produce a complete, reviewable UI design for:

- app-level Settings (including zero-document state);
- Page settings surfaces: Page Setup, Typography/density, Layout/Advanced,
  Manual breaks;
- Settings scope model (global vs per-document override);
- Page toolbar and its grouping;
- Export PDF sheet/panel;
- the interaction states that the settings/export work must handle.

The design must be implementable in the existing React/React Aria/Electron app
with the frozen settings model. It must not require new dependencies or model
changes.

## Deliverables

1. `docs/design/ui-settings-design.md` — design spec:
   - IA/sitemap: Settings sections/pages and Page surfaces;
   - for each screen: purpose, entry points, layout structure, controls,
     labels, help/copy, primary/secondary actions, keyboard/VoiceOver notes;
   - global vs document scope behavior, override dots, partial overrides,
     “Use global”, Apply/Cancel/Reset, dirty/preview/validation;
   - advanced disclosure: what is first-class, advanced, hidden, engine constant;
   - states: no document, read-only, Page Edit open, invalid margins, corrupt
     settings, save failure/write retry, density low-end warning, export
     running/cancelled/failed/done, empty/loading;
   - button hierarchy and placement rules;
   - responsive/narrow-window behavior (Page toolbar one rail, overflow);
   - implementation notes (existing components/classes, no new deps);
   - open product decisions with recommendations.
2. Static/standalone mockups under `docs/design/mockups/` (HTML/CSS/vanilla JS
   or a self-contained React prototype; no Electron, no mock bridge):
   - Settings Page (Setup/Typography/Advanced/Breaks) with global/document scope;
   - Settings other sections (Continuous/Appearance/Editor/Export/Data-About)
     using only frozen settings; do not invent a dead Continuous zoom control;
   - Page toolbar + Page Setup sheet + Export sheet;
   - state gallery: no document, read-only, dirty/apply, validation error,
     corrupt settings/write failure, density 60/70/80/100, export
     running/error/done.
   - Use the real design tokens/values from `docs/design-tokens-page.md`,
     `docs/design-tokens-continuous.md`, and the shared primitives; keep a
     single local token CSS so the mockup cannot drift from the real values.
3. Screenshots or an easy-to-open `index.html` entry for product-owner review.
   If a browser/screenshot tool is unavailable, provide the self-contained HTML
   and say so.

## Scope details

### Settings

- App-level; opens with zero documents. Per-document controls disabled with a
  reason when no document is open.
- Page section: Setup (size/orientation/margins + preview), Typography (preset,
  Page density 60–120, body/heading/code/table sizes; advanced line heights),
  Layout (advanced: card width, indents/gaps, packing/callout behavior copy),
  Manual breaks (list, add/remove, stale warnings).
- Scope: All documents / This document; partial overrides; override dots;
  group-level Use global; switching scope alone must not create an override.
- Explicit Apply/Cancel; Reset; no mixed instant-save.
- Frozen model: Page density 60–120, body 7 pt/140/240–560, adaptive callout
  topology; do not design a global Continuous zoom setting (per-document view
  zoom only).
- Export section: default folder, filename/date, overwrite, metadata, reveal;
  these are open decisions—recommend a default.
- Appearance/editor/app-data/About: include if within the frozen model; mark
  future items clearly.
- Do not expose engine internals (`fontScale`/`headingScale` until fixed,
  packing internals, trunk insets, fingerprints).

### Page toolbar/sheets

- Group controls: page nav | zoom/fit | setup | density | export | overflow
  (Open in Continuous). No six equal buttons; icon+label only for Export or
  primary settings; tooltips/aria labels.
- Page Setup sheet: same controls/preview as Settings, global/document scope.
- Density control: 60–120 slider with current value, “60% is fine print; 70% is
  the gentler dense step” guidance, global/document scope, Apply/Cancel.
- Export sheet: destination, filename/date, overwrite, progress/cancel, error
  with block names/warnings, done + Reveal; no native message box.
- Read-only/no-document states disabled with reasons.

### States and copy

Design and list copy for every state in the brief. Use human language, not raw
codes; warnings must be expandable. Ensure focus/VoiceOver order and keyboard
shortcuts are described.

## Out of scope

- Product code, tests, spec/UX/ADR changes, dependencies, Electron/mock bridge.
- Final component implementation and the rework itself.
- Re-opening the frozen settings model (report contradictions instead).
- Merge, push, PR, parent-checkout edits.

## Files to read

- `docs/reviews/settings-freeze-review.md`, `docs/reviews/settings-inventory.md`.
- `docs/tasks/page-settings-ui-plan.md`, `docs/ux.md`, `docs/ux-shell.md`,
  `docs/spec.md` (read-only).
- `docs/design-tokens.md`, `docs/design-tokens-page.md`,
  `docs/design-tokens-continuous.md`.
- `docs/reports/m4e1-settings-platform.md`, `m4e2-page-density-topology.md`,
  `m4e3-token-doc-split.md`.
- Existing shell/Page components for patterns: `Dialogs.tsx`, `PageView.tsx`,
  `CommandPalette.tsx`, `styles.css`, export panel.

## Acceptance criteria

- [ ] Design spec covers Settings IA, Page surfaces, toolbar, export, scope,
      advanced/hidden, states, buttons, responsive, a11y.
- [ ] Mockups are standalone, use real tokens, and cover the required screens
      and state gallery.
- [ ] No invented settings outside the frozen model; open decisions listed.
- [ ] Implementation notes map to existing components/dependencies.
- [ ] Product-owner can review from an `index.html`/screenshots.
- [ ] No product code/tests/spec/UX/ADR changes.

## Stop and ask

Stop and report if:

- the frozen model contradicts a required screen;
- a product decision is needed before the design can be coherent;
- the design needs a dependency or a model change;
- the mockups cannot be rendered/screenshotted in the environment.

## Report format

- Summary and design principles.
- Screen/state inventory.
- Key decisions/recommendations and open product decisions.
- Mockup entry point/screenshots.
- Implementation notes/risks.
- Worktree path, branch head SHA.
