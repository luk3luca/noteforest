# UI rework — Batch A (shell + Settings shell + Export + Palette)

**Role:** Builder / Implementer
**Milestone:** UI rework, delivery Batch A
**Base:** `design/ui-map` head at delegation (the commit containing this brief)
**Worktree:** provided by the T3 delegation; do not work in the parent checkout
**Timebox:** 2 working days; checkpoint commits are expected
**Visual reference:** `docs/design/ui-lab/` (mock only; do not copy its code)
**Source of truth:** the design docs, the frozen settings inventory, and this brief

## Context

The UI design pass is complete enough to implement. The lab at `docs/design/ui-lab/` shows the
chosen shell (C: fixed canvas header, undo/redo left, icon-only layout/mode right, edge-to-edge,
fixed while the canvas scrolls), the Settings model (instant save), the Export states, and the
Palette behavior. The product already has a V0 shell, a durable settings platform, an export job
pipeline, and a basic command palette; this batch integrates the design into those real components.

The product owner consolidated the plan into two delivery batches:

- **Batch A (this brief):** all non-Page/PDF UI — shell C, tabs, zoom, active rows, Settings shell,
  Export sheet, Palette.
- **Batch B (next):** Page settings (setup/margins/preview/validation/density/preset), Page chrome,
  and any PDF-affecting change.

Batch A must not change the Page sheet, paginator, print compositor, or PDF output. Export UI may
change its orchestration around the existing print pipeline, but not the produced PDF's layout.

Read first:

- `AGENTS.md`, `docs/tasks/ui-rework.md`, `docs/design/ui-lab/README.md`.
- `docs/design/ui-shell-map.md`, `docs/design/ui-shell-contents.md`.
- `docs/design/ui-settings-contents.md`, `docs/reviews/settings-inventory.md`,
  `docs/reviews/settings-freeze-review.md`, `docs/reviews/full-codebase-settings-review.md`.
- `docs/design/ui-export-contents.md`, `docs/design/ui-overlays-keyboard.md`.
- `docs/design-tokens.md`, `docs/design-tokens-page.md`, `docs/design-tokens-continuous.md`.
- `docs/spec.md`, `docs/ux.md`, `docs/ux-shell.md`.
- The affected source/tests under `apps/desktop`, `packages/layout`, `tests/ui`, `tests/e2e`,
  `tests/recovery`.

## Goal

The Electron app matches the Batch A design in the real shell/settings/export/palette components,
with the documented behavior, no fake controls, no Page/PDF output change, and green tests.

## In scope

### 1. Shell C and toolbar

- Add the **fixed 34 px canvas header** inside the canvas panel, for both Continuous and Page:
  - undo/redo on the left;
  - Page navigation and Export on the left after a divider when Page;
  - **icon-only** layout/mode segmented controls on the right; no words;
  - the header is outside the canvas scroll container and stays fixed while the canvas scrolls.
- Move layout/mode out of the toolbar. The toolbar has tabs, `+`, overflow, zoom, and the palette
  button only. Keep the 44 px toolbar and the 8 px floating-panel line.
- **Edge-to-edge canvas content**: remove lateral content padding, reduce the bottom inset, keep a
  small header inset for focus rings (`header 6 px`, content `0` lateral, bottom `8 px`; Page stage
  `14 px 0 8 px`). Adapt the values to the real containers without changing Page/PDF output.
- Implement C only. Do not add the lab's B/D/E variant switcher to the product.
- Tabs:
  - remove the global close-current-tab button;
  - tabs shrink with a 96 px floor, no horizontal scroll;
  - `+` immediately after the last tab and always visible; overflow chevron after it;
  - preserve activate/close/middle-click/drag-reorder/overflow/dirty/lock/recovery.
- Remove the zoom dropdown/selector (`actual / fit width / fit page`). Keep `−`, the percentage
  (click resets), and `+`, layout-aware. Do not add a new selector.
- Active Library/Topics rows: replace the 2 px left accent stripe with a 1 px accent ring around
  the normal rounded corners (`inset 0 0 0 1px var(--accent)`). Keep the accent-soft background.
  Use the same active treatment in the Settings nav where it does not break the nav hierarchy.

### 2. Settings shell — instant save

- Replace the current thin Settings dialog with the IA in `ui-settings-contents.md`: App (General,
  Appearance), Document (Page, Continuous), Workflow (Editor, Export), Data (Data & About). Future
  pages that have no real control are hidden in the product (the lab may show them empty); no fake
  or disabled "coming soon" rows.
- **Instant save** for all real settings:
  - no Apply/Cancel, no dirty dots, no unsaved-change close prompt;
  - footer status `Saved / Saving… / Couldn't save — Retry` and a `Done` close;
  - debounce sliders/text inputs; a failed write must show the error and never a false saved;
  - Page Edit (if open) commits before Page density/geometry writes; a failed commit blocks the
    write and shows the error.
- **Scope/override** for Page:
  - global default vs this document; switching scope never writes or creates an override;
  - per-field override dots; "Use global" per field/group; reset to global for the document layer;
  - a value equal to global auto-removes the override (working rule);
  - no document: document scope disabled with a reason; global controls usable;
  - read-only: personal overrides allowed; content never mutated.
- Keep the **existing Page density** (and any existing Page setup) working inside the new shell;
  do not implement the full Page setup/preview/validation rework (Batch B). Do not regress the
  current Page/PDF behavior.
- General/Editor: real information only (autosave info, shortcut list entry, version); future rows
  (default layout/mode if no field, single-key shortcuts, autosave interval) are hidden.
- Data & About: real library/app-data paths, settings file status/version, reveal actions where
  available, and reset-settings/warning behavior already supported. Document-map reset/restore,
  External API, library folder/backup settings are Batch B/future.
- Settings accessibility: dialog focus trap, Escape/Done, arrow/click nav, labels/help/errors,
  focus restore. No native message boxes for app decisions.

### 3. Export sheet

Implement `docs/design/ui-export-contents.md` against the existing export job pipeline:

- 560 px modal sheet, header/body/sticky footer; no native save dialog.
- Configure: folder picker (directories only; the only native surface), filename with fixed `.pdf`,
  sanitized/empty behavior, Add date, destination preview, resolved Page summary (including the
  “Page layout will be exported” note from Continuous), preflight note, Cancel/Export.
- Overwrite: one in-sheet prompt; explicit `Replace PDF` danger; Cancel returns to Configure.
- Progress: phase label + real progress/percent when available, output path, Cancel; closing/Esc
  offers Cancel; temp cleanup.
- Done: produced page count/path, **all** warnings grouped/expandable, Reveal / Open PDF / Done.
- Failed: human message, typed code, affected blocks/warnings, Close / Retry (same path/options).
- Cancelled: “No file was written”, Close / Retry.
- One job at a time; focus the existing sheet; Page Edit commits first; export from Continuous is
  allowed and says Page layout. No PDF layout/output change; the existing print model/pipeline is
  the source.
- Future metadata/tagged PDF/page range are **not shown** as controls until their schema exists.
- Update main/preload/tests for the folder picker/path/overwrite behavior. Do not add a new native
  save dialog.

### 4. Command palette

- Implement the palette structure/behavior in `ui-overlays-keyboard.md`:
  - groups Commands / Documents / Blocks; documents show chapter counts; blocks show chapter;
  - search labels/titles only (no content search); empty/no-match state;
  - keyboard: `⌘K` open/close, arrows move, Enter runs, Esc closes; focus restore;
  - disabled rows remain visible with a reason (read mode); disabled rows are skipped by Enter;
  - commands use the registry labels/shortcuts and existing action handlers: New note, Save,
  Export PDF…, Switch to Page/Continuous, Switch to Read/Edit, Toggle sidebar, Settings…,
  New chapter (disabled in Read mode);
  - remove the dead “Command palette” entry; do not duplicate commands;
  - Settings/Export entries open their surfaces; layout/mode/sidebar commands run the same handlers.
- Read-mode gating must use the shared editability helper. Do not add a second whitelist.

### 5. Tests and evidence

- Update the V0/UI suites for the new C header, tabs, zoom removal, active ring, settings instant
  save/overrides/no-document/read-only/error, export states, and palette keyboard/read-mode.
- Add coverage specifically for:
  - header fixed/outside scroll; edge-to-edge values; icon-only view controls;
  - no global close; tabs shrink/no scroll; `+` after the last tab;
  - zoom selector gone; minus/percentage/plus still layout-aware;
  - active ring (not a left stripe) in Library/Topics;
  - instant save status and failed-write Retry; no Apply/Cancel; no dirty dots;
  - scope switch does not create an override; equal-to-global auto-removes; Use global;
  - no-document and read-only settings states; future pages hidden/no fake controls;
  - export configure/overwrite/progress/done/failed/cancelled; all warnings; no native save dialog;
  - palette groups/search/empty/arrow/Enter/disabled reason/read mode.
- Do not weaken assertions; no fixed sleeps; use condition waits. E2E must not open native OS
  dialogs; use the test dialog guard. Add screenshots under `artifacts/ui-batch-a/` (ignored like
  prior artifacts) for expanded shell, C header Page/Continuous, Settings, Export states, Palette.
- Targeted during work: `npm run check:boundaries`, `npm run typecheck`, affected unit/UI/e2e
  suites. End of task: **one** `npm run verify:fast` with timings. Do not run the full
  `npm run verify` (the Orchestrator does at integration).

## Out of scope

- Full Page settings: setup/preview/validation/density/preset/scope UI beyond the existing density
  slice; Page chrome; manual breaks.
- Page sheet, paginator, print compositor, PDF output; any change that re-paginates or changes
  print geometry/typography.
- Appearance v3 (theme/accent/uiScale/uiFont/codeFont), Export defaults, Continuous global
  settings, Data map recovery/External API/library-backup/light theme/search.
- Spec/UX/ADR/plan/AGENTS edits (report only), lab code edits (the lab is the visual reference).
- New dependencies, settings schema/migration, or a native message box.
- A product variant switcher; C is the implementation, D remains a design alternative only.

## Acceptance criteria

- [ ] C canvas header is fixed/edge-to-edge, undo/redo left, icon-only layout/mode right; toolbar
      has only tabs/`+`/overflow/zoom/palette.
- [ ] No global close; tabs shrink/no scroll; `+` after the last tab; overflow works.
- [ ] Zoom selector is gone; minus/percentage/plus work and remain layout-aware.
- [ ] Library/Topics active rows use the 1 px accent ring, not a left stripe.
- [ ] Settings uses instant save, status/Retry/Done, no Apply/Cancel/dirty dots; scope/override,
      no-document/read-only, and future-page behavior match the docs; existing Page density is not
      regressed.
- [ ] Export sheet has all states, no native save dialog, in-sheet overwrite, progress/cancel,
      done/failed/cancelled, all warnings; PDF output is unchanged.
- [ ] Palette has groups/search/empty/keyboard/disabled reason/read-mode and no dead entries.
- [ ] Page/PDF output and existing Page/Page Edit behavior are unchanged; no schema/dependency
      change; no fake controls.
- [ ] Targeted tests, screenshots, and one `verify:fast` pass; report maps every criterion.

## Stop and ask

- Removing the native save dialog requires a main/preload API that is not available or breaks
  native-dialog test policy.
- Instant save/override semantics would require a settings schema/migration change.
- The C header cannot be implemented without a Page/PDF layout change.
- A baseline test fails for an unrelated reason or a test would need weakened assertions.
- A product decision is missing (e.g., a future page would need a fake control).
- The worktree/base is not the brief commit; stop and report.

## Integration

The Orchestrator reviews the checkpoint commits, runs the full `npm run verify`, and merges the
branch into `design/ui-map` — **not `main`**. Batch B (Page settings/PDF) starts after Batch A is
integrated. The builder does not merge, push, or open a PR.

## Report format

- Summary; checkpoint commits; files changed; checks with real timings; acceptance pass/fail;
  worktree/branch/head; open questions/risks; next suggested step.
