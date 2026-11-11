# UI rework — master plan and reference index

**Status:** Design phase on `design/ui-map`. No product code until the lab is frozen.
**Owner:** Orchestrator.
**Date:** 10 November 2026.
**Visual reference:** `docs/design/ui-lab/` (`http://127.0.0.1:5180/` with the lab server).
**Source of truth:** the design docs and the frozen settings inventory, not the lab. The lab is a
visual mock; it does not replace the spec, UX, ADRs, or the review checklist.

**Scope:** the desktop shell (titlebar, toolbar, tabs, sidebar, canvas header, status strip), the
Page frame/toolbar, Settings, Export, command palette, dialogs, context menus, toasts/banners,
native menu and keyboard parity, responsive/accessibility. The Page sheet, paginator, print
compositor, and PDF output are not redesigned; ADR-0007 and ADR-0008 still own those surfaces.

---

## 0. How to use this plan

- The **lab** shows the visual direction and the interaction states. It is not product code.
- The **design slices** are the source for contents and behavior.
- The **frozen settings inventory** is the source for values and schema; do not invent fields.
- Each phase gets its own brief (`docs/agents/brief-template.md`), one worktree, targeted tests,
  and one `verify:fast`; the Orchestrator runs the full `verify` at integration.
- Future functions are listed here with their references. Their pages/sections stay empty in the
  lab and hidden in the product until they have at least one real control; no fake/disabled
  "coming soon" rows.
- "Details at phase start" means the reference index is complete, but the exact field list,
  validation, copy, and tests are written in that phase's brief.

## 1. Working decisions (10 November 2026)

These are the decisions the UI plan is built on; details are recorded in the phase briefs.

### Shell

- **C is the preferred shell**: a fixed 34 px canvas header inside the canvas, undo/redo on the
  left, icon-only layout/mode on the right, edge-to-edge canvas content, tight bottom inset, no
  lateral content padding. **D (floating pill)** is the preferred alternative. B (toolbar icons)
  and E (sidebar commands) remain reference variants in the lab.
- The header is outside the canvas scroll container, so it stays fixed while the canvas scrolls.
- **Tabs:** no global close button; each tab closes itself. Tabs shrink with a floor; no horizontal
  scroll; `+` sits immediately after the last tab and stays visible; overflow goes to the menu.
- **Zoom:** the `actual/fit width` dropdown is removed. Keep minus / percentage / plus; clicking the
  percentage resets. Zoom is layout-aware.
- **Active rows:** a 1 px accent ring around the normal rounded corners, not a left accent stripe.
  Apply the same treatment to Library, Topics, and Settings nav where appropriate.

### Settings

- **Instant save.** No Apply/Cancel, no dirty dots, no unsaved-change close prompt. Footer status:
  `Saved / Saving… / Couldn't save — Retry`, with a `Done` close. Debounce sliders/text inputs.
- **Scope/override:** global default + per-document override for Page. Scope switching never writes
  or creates an override. Per-field override dots, "Use global" per field/group, "Reset to global"
  for the document layer. A value equal to global auto-removes the override (recommended working
  rule). Page Edit commits before geometry/density changes.
- **Continuous:** persistent Continuous settings are global-only. The only live zoom is the
  per-document `DocumentViewState` view control; it is not a settings.json field. Remove the
  per-document Continuous settings page; add a global Continuous page only when real global fields
  exist (canvas width, card width/spacing).
- **Future pages:** empty in the lab and recorded in this plan; hidden in the product until at
  least one real control exists. No disabled fake rows.
- **Page settings are a real phase**: setup/orientation/margins, preview, validation, density and
  preset. Defaults: A4 landscape / 12 mm (working default; confirm at the phase brief). Density
  60–120%, step 5; presets Compact/Comfortable/Custom. Advanced typography/layout is deferred
  until its exposure is settled; `fontScale`/`headingScale` stay hidden. Page chrome and manual
  breaks come later.
- **Read-only:** personal Page overrides are allowed; content is never mutated. Page Edit is off.
- **No document:** Settings opens; app-level pages work; document-only pages are disabled with a
  reason.
- **Save/error states:** failed writes show an error + Retry; corrupt/newer settings keep the
  recovery/warning behavior in the docs; no false "saved".

### Export

- One modal sheet, 560 px, no native save dialog; in-sheet overwrite prompt; progress + cancel;
  done/failed/cancelled; all warnings grouped/expandable. The folder picker is the only native
  surface. Export always uses the resolved Page model, including from Continuous.
- Settings > Export defaults are future; the sheet remembers the last folder for now.

### Palette and overlays

- One command registry: menu, palette, toolbar, context menu, and keyboard read the same command.
- Palette: commands, documents (chapter counts), blocks; search labels/titles; no content search;
  disabled rows show a reason; empty/no-match state; keyboard move/open/close.
- Dialogs/context menus/toasts/banners follow `ui-overlays-keyboard.md`; no native message boxes
  for app decisions; read-mode whitelist is shared.

## 2. Surface matrix

| Surface | Current state | Design / model references | Phase | Dependencies and notes |
|---|---|---|---|---|
| **App shell, TitleBar, Toolbar, TabStrip** | V0 visual merged; C/D in lab | `docs/design/ui-shell-map.md`, `ui-shell-contents.md`, `docs/design-tokens.md`, ADR-0004, ADR-0007, lab | **P1** | 30 px titlebar, 44 px toolbar, 8 px floating panels; tabs shrink/no scroll; `+` after last; no global close. |
| **Canvas header (C) / pill (D)** | Lab preferred | `ui-shell-map.md`, `ui-shell-contents.md`, lab, `design-tokens-continuous.md` | **P1** | Undo/redo left, icon-only layout/mode right; fixed; edge-to-edge. D is the alternative. |
| **Sidebar, Library, Topics, footer, rail** | V0 merged; active ring in lab | `ui-shell-contents.md`, `ui-settings-contents.md` (footer entry), `settings-inventory.md`, lab | **P1** | 264/48 rail; Settings button; counts; active ring; no left accent stripe. |
| **StatusStrip** | V0 merged | `ui-shell-contents.md`, lab | **P1** | Floating 24 px; save/word/block/anchor health only. |
| **Continuous canvas** | Merged | `ui-shell-contents.md`, `design-tokens-continuous.md`, ADR-0007 | **P1** | C header; 9 px note cards; no page chrome. |
| **Page frame, PageToolbar, PageStage, Page Edit** | M4 merged | `ui-page-contents.md`, `design-tokens-page.md`, ADR-0007, ADR-0008, M4 reports | **P3** | Page sheet/PDF internals unchanged; header/settings only. |
| **Settings frame and IA** | Lab draft | `ui-settings-contents.md`, `settings-inventory.md`, `settings-freeze-review.md`, `full-codebase-settings-review.md`, lab | **P2** | Instant save; nav; future pages; no document/read-only/error states. |
| **Settings > General** | Lab draft | `ui-settings-contents.md` §2; no schema fields today | **P2** | Defaults are DES; keep the page small or empty until fields exist. |
| **Settings > Appearance** | Lab draft | `ui-settings-contents.md` §3; `settingsVersion: 3`; light/accent tokens | **P6** | Empty/future page; theme/accent/uiScale/uiFont/codeFont; code font PDF gate. |
| **Settings > Page** | Lab draft | `ui-settings-contents.md` §4; `settings-inventory.md`; `design-tokens-page.md`; ADR-0008; `settings-freeze-review.md` S3-12 | **P3** | Setup/margins/preview/validation/density/preset/scope; advanced later. |
| **Settings > Continuous** | Lab draft | `ui-settings-contents.md` §5; `settings-freeze-review.md`; ADR-0008; M4e1 report | **P6** | Remove per-document page; global-only when real fields exist; zoom is view state. |
| **Settings > Editor** | Lab draft | `ui-settings-contents.md` §6; `ui-overlays-keyboard.md` | **P2/P5** | Real shortcut list; future single-key/autosave rows hidden. |
| **Settings > Export** | Lab draft | `ui-settings-contents.md` §7; `ui-export-contents.md` §9 | **P6** | Future defaults; empty page until the `export` namespace exists. |
| **Settings > Data & About** | Lab draft | `ui-settings-contents.md` §8; `settings-freeze-review.md` S3-3 (map recovery) | **P2/P6** | Paths/reveal/settings status; recovery/reset map later. |
| **Export sheet** | Shipped M4d2; lab states | `ui-export-contents.md`, ADR-0002, `m4c1`/`m4c2`/`m4c3` reviews, `apps/desktop/src/main/export-*.ts`, `renderer/src/export/` | **P4** | 560 px; no native save dialog; overwrite/progress/result; all warnings. |
| **Command palette** | Basic shipped; lab | `ui-overlays-keyboard.md`, `ux.md`, command registry/read-mode gating, `shell/CommandPalette.tsx` | **P4** | Commands/documents/blocks; search; disabled reason; no content search; keyboard. |
| **Dialogs, context menus** | Shipped/basic | `ui-overlays-keyboard.md` §2–3, `ux.md`, `shell/Dialogs.tsx`, `ContextMenu.tsx` | **P5** | Shared frames; gating; no native message boxes. |
| **Toasts, banners** | Shipped/basic | `ui-overlays-keyboard.md` §4, `SaveFailureBanner`, `StaleLockBanner` | **P5** | No toast for export/settings; banners for decisions. |
| **Native menu, shortcuts, keyboard** | Shipped/basic | `ui-overlays-keyboard.md` §5, `ux.md`, `main/menu.ts` | **P5** | Registry parity; read-mode whitelist; K-01…K-14. |
| **Responsive, accessibility, VoiceOver** | Specified | `ui-overlays-keyboard.md` §6/8, `ui-settings-contents.md` §1.4/1.5, `docs/definition-of-done.md`, `review-checklist.md` | **P5** | Breakpoints; focus trap; labels/reasons; product-owner VoiceOver/visual pass. |
| **Page chrome, manual breaks, Data recovery, library/backup, light theme/search** | Future | `settings-freeze-review.md` open #7; `ui-settings-contents.md` §4.5/§8; plan M6 | **P6** | References complete; details in phase briefs; empty pages until real controls. |

## 3. Phases

| Phase | Scope | Gate |
|---|---|---|
| **P1 — Shell foundation** | C header (D alternative), tabs shrink/no scroll/`+`, zoom dropdown removal, active-row ring, no-document/read-only shell states, status strip, responsive shell. | Screenshots at 1280/1440; tab stress (2/8/14); no pageErrors; targeted UI/e2e; `verify:fast`. |
| **P2 — Settings shell** | Instant save, nav, future empty pages, Data & About paths/status, no-document/read-only, save error/corrupt/newer states, no fake controls; refresh the lab Settings mock to the same model (no Apply/Cancel). | Settings UI tests incl. no document, write failure, future page empty; lab/product parity; screenshots; `verify:fast`. |
| **P3 — Page settings** | Setup/orientation/margins, defaults, scope/override, live preview, validation, density/preset; Page Edit commit policy. | Margins validation; scope switch no override; preview updates; Page/PDF parity; tests/screenshots. |
| **P4 — Export + palette** | Export sheet all states; no native save dialog; overwrite/progress/result; palette registry, search, groups, disabled reasons, keyboard. | Export UI tests incl. overwrite/cancel/fail/warnings; palette keyboard/read-mode tests; screenshot. |
| **P5 — Overlays, menu, keyboard, a11y** | Dialogs, context menus, toasts/banners, native menu parity, shortcut table, responsive, focus/VoiceOver. | Keyboard/read-mode parity; a11y checks; visual/VoiceOver pass; `verify:fast`. |
| **P6 — Future settings** | Appearance v3, Export defaults, Continuous global, Page chrome, manual breaks, Data recovery, library/backup, light/search. | Per-feature briefs; no schema change without a migration; PDF gates where output changes. |

Phase gates are cumulative: a later phase cannot break an earlier accepted surface. The Orchestrator
runs one full `npm run verify` at each integration, not per builder.

## 4. Reference index

### Structure and shell

- `docs/design/ui-shell-map.md` — component map, D-01…D-13, revised 10 Nov shell.
- `docs/design/ui-shell-contents.md` — TitleBar, Toolbar, Sidebar, StatusStrip.
- `docs/design/ui-page-contents.md` — PageToolbar, Page canvas, Page Edit.
- `docs/design/ui-overlays-keyboard.md` — palette, dialogs, context menus, toasts, shortcuts,
  responsive, state matrix.
- `docs/design/ui-lab/README.md` — visual lab, variants B/C/D/E2/E3, Export/Palette states.
- `docs/design-tokens.md`, `docs/design-tokens-page.md`, `docs/design-tokens-continuous.md`.
- `docs/adr/0004-ui-shell-and-branch-editor.md`, `docs/adr/0007-editor-layouts-and-modes.md`.

### Settings and values

- `docs/design/ui-settings-contents.md` — IA, pages, states, scope, save model, Appearance.
- `docs/reviews/settings-inventory.md` — frozen values, schema, ownership, hidden/engine markers.
- `docs/reviews/settings-freeze-review.md` — frozen model, S3/S4 follow-ups, open decisions.
- `docs/reviews/full-codebase-settings-review.md` — S2 fixes and settings sweep.
- `docs/adr/0008-personal-page-settings.md` — global defaults + per-document overrides.
- `packages/layout/src/page-settings.ts`, `apps/desktop/src/shared/settings-file.ts`,
  `apps/desktop/src/shared/document-settings.ts`, `apps/desktop/src/main/document-settings.ts`,
  `apps/desktop/src/renderer/src/state/settings.ts`, `shell/Dialogs.tsx`.

### Page and PDF

- `docs/design-tokens-page.md`, `docs/reviews/settings-inventory.md` §Page.
- `docs/adr/0002-pdf-pipeline.md`, `docs/adr/0006-page-group-wrap.md`,
  `docs/adr/0007-editor-layouts-and-modes.md`, `docs/adr/0008-personal-page-settings.md`.
- `docs/reviews/m4c1-print-compositor-review.md`,
  `docs/reviews/m4c2-export-orchestration-review.md`,
  `docs/design/ui-export-contents.md`.
- Reports: `docs/reports/m4c1-print-compositor.md`,
  `docs/reports/m4c2-export-orchestration.md`, `docs/reports/m4c3-pdf-gate.md`,
  `docs/reports/m4d1-page-density.md`, `docs/reports/m4d2-export-ui.md`,
  `docs/reports/m4e1-settings-platform.md`, `docs/reports/m4e2-page-density-topology.md`,
  `docs/reports/m4e3-token-doc-split.md`.

### Export

- `docs/design/ui-export-contents.md` — all states, destination, overwrite, progress, warnings.
- `docs/design/ui-settings-contents.md` §7 — future defaults.
- `docs/design/ui-export-contents.md` §9 — cross-link to the future `export` namespace.
- `docs/adr/0002-pdf-pipeline.md`.
- `apps/desktop/src/main/export-job.ts`, `export-preflight.ts`, `export-service.ts`,
  `export-window.ts`, `apps/desktop/src/shared/export.ts`,
  `apps/desktop/src/renderer/src/export/`, `renderer/src/export-snapshot.ts`.

### Palette, overlays, keyboard

- `docs/design/ui-overlays-keyboard.md` — command registry, palette, dialogs, menus, toasts,
  shortcut table, responsive, state matrix.
- `docs/ux.md`, `docs/ux-shell.md` — flows and keyboard model (stale shortcut tables flagged).
- `apps/desktop/src/renderer/src/shell/CommandPalette.tsx`, `ContextMenu.tsx`, `Dialogs.tsx`,
  `main/menu.ts`; read-mode gating in `lib/editability.ts`.

### Contract and gates

- `docs/spec.md`, `docs/ux.md`, `docs/ux-shell.md`.
- `docs/definition-of-done.md`, `docs/review-checklist.md`.
- `docs/agents/roles.md`, `docs/agents/brief-template.md`.
- Tests: `apps/desktop/test/`, `packages/layout/test/`, `tests/ui/`, `tests/e2e/`,
  `tests/recovery/`, `tests/visual/`.

## 5. Future functions and empty pages

The following are recorded now, with full references; their pages are **empty** in the lab and stay
out of the product until a real control exists. The phase brief fills the field list, validation,
copy, and tests when the phase starts.

| Function | References | Entry criteria |
|---|---|---|
| Appearance v3 | `ui-settings-contents.md` §3; `settings-freeze-review.md`; light/accent tokens | `settingsVersion: 3`, pure migration, light token set/accent tokens, code-font PDF gate |
| Export defaults | `ui-settings-contents.md` §7; `ui-export-contents.md` §9 | `export` namespace + migration; PDF metadata/tagged gate |
| Continuous global | `ui-settings-contents.md` §5; `settings-freeze-review.md` | real global fields (canvas width/card width/spacing); no per-document override |
| Page chrome | `settings-freeze-review.md` open #7; Page/PDF docs | field list and defaults; header/footer/page-number/chapter-start design |
| Manual breaks | `ui-settings-contents.md` §4.5; `settings-freeze-review.md` | delete/split/merge cleanup rules; no fake list |
| Data recovery | `ui-settings-contents.md` §8; `settings-freeze-review.md` S3-3/S3-12 | reset map/restore backup + confirmation; backup path |
| External API / agent access | `docs/adr/0003-external-agent-api.md` | **Removed from Settings** (product owner, 11 Nov 2026). Any future agent surface is MCP/commands, not a Settings token/scope/audit harness page. |
| Library folder / backup | `ui-settings-contents.md` §8; plan M6 | folder change policy; backup retention; destructive confirmations |
| Light theme / search / onboarding | plan M6; spec/UX | milestones; no UI before the model exists |

## 6. Delivery batches (product-owner decision, 10 November 2026)

To avoid one delegate restart per design page, the implementation is consolidated:

- **Batch A — non-Page/PDF UI (merged 10 November 2026, `af815eb`):** P1 shell, P2 Settings shell,
  P4 Export + palette, and the palette/read-mode parts of P5. One implementer and worktree,
  checkpoint commits, one `verify:fast`, one full integration verify. Brief:
  `docs/tasks/ui-batch-a.md`; report: `docs/reports/ui-batch-a.md`.
- **Batch B — Page settings/PDF (merged 11 November 2026, `34e4ade`):** P3 Page settings
  (setup/orientation/margins, live preview, validation, density/preset, scope/override), the
  Page/PDF-affecting work, and only the remaining P5 parity required by that path.
- **Batch C — Page advanced typography/layout (next):** frozen PageTheme fields, first-class
  `maxCardWidth` and the advanced typography/layout groups; no schema. Brief:
  `docs/tasks/ui-settings-advanced.md`.
- **Batch V — visual refinement (after C):** Settings fixed width, toast tokens, tab behavior,
  canvas inset. Then `design/ui-map` merges to `main`.
- Future functions (Appearance v3, Export defaults, Continuous global, Page chrome, manual breaks,
  Data recovery, library/backup, light/search) remain empty/planned; no fake controls.
  **External API/agent access is removed from Settings** (product owner, 11 November 2026): any
  future agent surface is MCP/commands, not a Settings token/scope/audit harness.

The phases in §3 remain the acceptance checkpoints inside the batches. Batch A must not change the
Page sheet, paginator, print compositor, or PDF output.

## 7. Handoff rules

- One delivery batch, one brief, one worktree; the builder does not merge.
- The lab is the visual reference; the docs and frozen inventory are the source of truth.
- No fake controls: future pages are empty or hidden; no disabled "coming soon" rows.
- Every phase includes no-document, read-only, error, and future-empty states where applicable.
- UI changes need screenshots; VoiceOver/subjective visual checks belong to the product owner.
- The Orchestrator runs the full `verify` once per integration; the builder runs targeted tests and
  one `verify:fast`.
- The reference index is complete now; the exact field/test detail is added in the phase brief.
- Command labels: unify `Save` vs `Save now` and sentence case per K-12; the palette example in
  `ui-overlays-keyboard.md` still says “Save now” while the shortcut table says “Save”. Pick one in
  P4 and sweep the docs.

## 8. Status

- Shell: Batch A merged; C header (fixed, edge-to-edge, undo/redo left, icon-only views right),
  tabs, zoom removal, active ring are implemented in Electron.
- Settings: Batch A + B merged; instant-save shell, scope/override, no-document/read-only, existing
  Page density and the full Page setup/margins/preview/validation/preset surface.
- Export: Batch A merged; 560 px sheet, no native save dialog, all states, grouped warnings.
- Palette: Batch A merged; commands/documents/blocks, search, keyboard, disabled reasons, empty
  state, read-mode gating.
- Page: Batch B merged; Page Read/Edit/measurement/PDF parity at A4/A5/Letter, portrait/landscape,
  margins, density 60/100/120, and document overrides.
- Next: Batch C Page advanced typography/layout (brief `docs/tasks/ui-settings-advanced.md`), then
  the visual refinement batch (Settings fixed width, toast, tabs, canvas inset), then merge
  `design/ui-map` to `main`. Future pages remain planned/empty (Appearance v3, Export defaults,
  Continuous global, Page chrome, manual breaks, Data recovery, library/backup, light/search).
  External API/agent access is not a Settings page; MCP/commands only if pursued.
