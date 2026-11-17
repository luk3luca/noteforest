# R1b — settings store and PageTheme/density wiring

**Role:** Implementer / Builder
**Milestone:** refactor — personal page settings
**Base:** current `main` after R1a
**Worktree:** isolated builder worktree prepared by orchestrator v2
**Scope:** resolve global + per-document page settings, wire the compact PageTheme into Page
Read/Edit/measurement, and prove the density change. No Page arrows, no Continuous marker removal,
no Settings UI, no manual-break UI.

## Goal

Page Read/Edit must stop using the temporary defaults and use the resolved personal PageSettings:

```text
settings.json (global AppSettings.page)
  + session.pageSettingsOverride[document]
  -> mergePageSettings(...)
  -> PageView / measurement / PageBlockEditor / PDF
```

The compact theme must actually drive pagination, not just exist in the model.

Read:

- `docs/adr/0008-personal-page-settings.md`
- `docs/tasks/refactor-personal-page-settings.md` (R1b)
- `docs/reports/r1a-canonical-schema-v2.md`
- `packages/layout/src/page-settings.ts`
- `apps/desktop/src/renderer/src/page/{adapter,model,usePageModel,PageView,PageBlockEditor,measurement,segments}.ts(x)`
- `apps/desktop/src/shared/api.ts`, `state/session.ts`, `state/shell.ts`, `App.tsx`
- `apps/desktop/src/main/library.ts` session/settings paths

## 1. Settings persistence

- Add a global `settings.json` in app support (same directory as `shell-session.json`), atomic write,
  missing/corrupt falls back to `DEFAULT_APP_SETTINGS`.
- Main: `readSettings`/`writeSettings`; normalize with `normalizeAppSettings`.
- Shared API/preload: `saveSettings(state: AppSettings): Promise<void>`; bootstrap returns
  `settings: AppSettings` (or a dedicated `getSettings`).
- `SessionTabState` gains optional:
  - `pageSettingsOverride?: PageSettingsOverride`;
  - `continuousSettingsOverride?: ContinuousSettingsOverride`.
  `readSession` normalizes; `buildSession` writes; old sessions default to no override.
- Renderer: a small settings store/hook that:
  - loads global settings at bootstrap;
  - resolves `PageSettings(doc) = mergePageSettings(appSettings.page, override)`;
  - persists global settings on change;
  - persists per-document overrides in the session (or saves session after change);
  - subscribes so Page surfaces re-render/re-measure when settings change.
- No Settings UI/commands yet; expose a test bridge (`window.__noteforestTest.settings` and a setter)
  for UI tests. Do not leave a second unresolved default path.

## 2. PageTheme wiring

Replace the temporary static page values:

- `page/adapter.ts`: `pageSetupOf(settings)`, `corePageGeometry(settings)`;
  `PAGE_LAYOUT_OPTIONS` → `pageLayoutOptions(settings.theme)`;
  `PAGE_CSS_VARIABLES` → `pageCssVariables(settings.theme)`.
- `page/model.ts`: `computePageModel(document, port, settings)` uses explicit `setup`, theme layout
  options, and `settings.manualBreakBeforeBlockIds`.
- `page/usePageModel.ts`: accepts resolved settings; re-runs when settings change; cancellation
  unchanged.
- `page/measurement.ts`: accepts theme/settings, applies `pageCssVariables` to the host, uses
  `pageLayoutOptions` for card chrome/segment gap/list indent.
- `page/PageView.tsx`: props include resolved `PageSettings`; page dimensions/geometry from
  `settings.setup` (A4/A5/Letter); margins/header/footer positions from that geometry; CSS variables
  applied to the sheet/stage; segments use theme gaps/list indent.
- `page/PageBlockEditor.tsx`: overlay geometry/margins from resolved settings.
- `styles.css`: page typography/box variables are overridden by the theme map; `:root` may keep
  fallbacks but no page metric may bypass `pageCssVariables` in Page/measurement. Remove duplicated
  static page metric assumptions where they would conflict with the theme.
- `DocumentEditor`: resolve settings for the active doc and pass to PageView/PageBlockEditor.
- `App.tsx` test bridge `orientation` and `structure().manualBreakBeforeBlockIds` come from resolved
  settings, not defaults.
- PDF/print model: ensure `layoutDocument` receives the resolved `settings.setup` and paginate receives
  the resolved manual breaks. Do not add a second page-settings path.
- Continuous page markers (still present in this slice) must use the resolved settings if they still
  run; they will be removed in R2.

## 3. Density lab

- Add a lab/test that measures the showcase and `scale-300` with:
  - pre-R1 comfortable density;
  - compact default;
  - at least one intermediate (e.g., 9.5 pt/12 mm or max card width 380/420).
- Report page count, blocks/page, content height used, whitespace, max line length, defects.
- The default must be compact; if compact still produces an unacceptable page count, report numbers
  and propose the next lever (wider cards, two-column top-level packing) instead of silently
  choosing a more aggressive font.
- Screenshot Page Read at 1440×900 and 960×720, landscape and portrait, with compact.

## 4. Tests

- Unit: settings persistence read/write/default/corrupt; global + override merge; page size
  A4/A5/Letter geometry; theme→layout options/CSS variables; session override round trip.
- UI: Page Read uses compact theme/margins; changing a settings override via the test bridge
  re-paginates; A5/Letter changes page dimensions/page count; Page Edit overlay geometry follows;
  existing Page Read/Edit/image suites green.
- Keep Continuous unchanged except that it must not read page settings (no page model if R2 not yet).
- Gates: check:boundaries, typecheck, targeted vitest, npm test, test:ui, test:recovery:run,
  e2e:critical, one verify:fast.

## 5. Do not

- Do not implement Page arrows, continuous marker removal, Settings UI, manual-break UI/cleanup, or
  PDF print compositor.
- Do not touch `~/Documents` or the showcase.
- Do not edit spec/UX/plan; report.
- No new external dependency.

## Deliverable

Report `docs/reports/r1b-settings-theme-density.md`: worktree/branch/base/commit, settings/session
schema, resolution path, theme wiring files, density lab table and chosen values, tests/timings,
screenshots, risks, not verified. Do not merge or push. Stop and ask if the compact default still
needs a product density decision or if existing UI tests depend on the old comfortable geometry.
