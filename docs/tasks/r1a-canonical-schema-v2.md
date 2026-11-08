# R1a — canonical schema v2 and page-settings foundation

**Role:** Implementer / Builder
**Milestone:** refactor — personal page settings
**Base:** current `main` after ADR-0008
**Worktree:** isolated builder worktree prepared by orchestrator v2
**Scope:** move page fields out of the canonical document and introduce the pure page-settings model.
No Page arrows, no density UI, no settings store/UI yet.

## Goal

Make the canonical document a continuous canvas only:

- no `pageSetup`;
- no `manualBreakBeforeBlockIds`;
- no `viewState`.

Add a pure page-settings foundation used by layout/page/PDF in the next slice. There are **no real
user documents**; test notes/fixtures can be rewritten. No legacy seeding is required.

Read:

- `docs/adr/0008-personal-page-settings.md`
- `docs/adr/0007-editor-layouts-and-modes.md`
- the code audit in the current thread / `packages/core/src/{types,document,validation,serialize}.ts`
- `packages/layout/src/{types,layout,paginator}.ts`
- `apps/desktop/src/renderer/src/page/{adapter,model}.ts`
- `apps/desktop/src/renderer/src/App.tsx` test bridge
- fixtures/tests listed below

## 1. Page-settings module (pure, `packages/layout/src/page-settings.ts`)

Add types, defaults, normalization, and mapping:

```ts
PageSize = 'A4' | 'A5' | 'Letter'
PageSetup { size; orientation; margins }
PageTheme {
  preset: 'compact' | 'comfortable' | 'custom';
  fontScale; bodyPt; bodyLine; headingScale;
  codePt; codeLine; tablePt; tableLine;
  labelPt; chromePt; markerPt;
  cardPadding; cardBorder; segmentGap;
  siblingGap; wrapIndent; maxWrapIndent;
  calloutGap; maxCardWidth; minContentWidth;
}
PageSettings { setup: PageSetup; theme: PageTheme; manualBreakBeforeBlockIds: string[] }
ContinuousSettings { zoom: number } // foundation only; more continuous fields later
AppSettings { page: PageSettings; continuous: ContinuousSettings }
```

- `DEFAULT_PAGE_SETTINGS`: A4 **landscape**, 12 mm margins, `compact` theme with the dense candidate
  values (body 9 pt/1.3, headings 14/12/10.5, code 8/1.3, table 8.5/1.25, cardPadding 8, segmentGap
  4, siblingGap 16, wrapIndent 12, maxWrapIndent 36, calloutGap 12, maxCardWidth 420).
- `DEFAULT_APP_SETTINGS` uses those defaults.
- `pageDimensionsMm(size, orientation)`, extend `pageGeometry` to A4/A5/Letter.
- `pageLayoutOptions(theme)` maps theme to `LayoutOptions`.
- `pageCssVariables(theme)` returns all page typography/box CSS variables.
- `normalizePageSettings`, `mergePageSettings` (default + partial override), safe clamps.
- Export from `packages/layout/src/index.ts`.

Do not wire the theme into PageView/measurement yet; R1b does that. But the module must be tested.

## 2. Core schema v2

- `CURRENT_SCHEMA_VERSION = 2`.
- Remove from `Document`:
  - `pageSetup`;
  - `manualBreakBeforeBlockIds`;
  - `viewState`.
- Remove `PageSetup`, `PageOrientation`, `MarginsMm`, `DEFAULT_MARGINS_MM`,
  `DEFAULT_PAGE_ORIENTATION`, `defaultPageSetup`, `ViewState` from core if no longer used.
- Migration v1→v2: delete those three known legacy fields; preserve other unknown fields. No legacy
  seeding.
- Remove validation for pageSetup/manualBreak/viewState; update validation stats/messages.
- `createDocument`/`CreateDocumentInput`: no pageSetup.
- `document.create` command: no pageSetup.
- `CreateDocumentPackageInput`/`DocumentStore.create`: no pageSetup.
- `serialize.ts`: remove the manual-break default normalization.
- `restore` command: remove manual-break diff/restore fields.
- `block.delete`/`merge`/`shared.ts`: remove manual-break cleanup. The settings layer will own it
  later (R2/R4).
- `commands/types.ts`: remove pageSetup/manualBreak fields.
- Update core schema fixtures:
  - keep a v1 fixture with the legacy fields to test migration;
  - update `v2-newer` to version 3;
  - add/update v2 current fixture.

## 3. Layout decoupling (minimal for this slice)

- `NoteDocument` may keep a transient `pageSetup` for now only if removing it would balloon the
  slice; the preferred target is to remove `pageSetup`/`manualBreakBeforeBlockIds` from
  `NoteDocument` and pass a `PageSettings` (or `PageSetup`) argument through `layoutDocument`.
  If you keep a transient field, mark it clearly and report it as debt for R1b.
- `paginate` must no longer fall back to `document.manualBreakBeforeBlockIds`; manual breaks are an
  option only.
- Existing fixtures that are core documents must not contain pageSetup/manualBreak. Layout tests
  that need page setup should inject `DEFAULT_PAGE_SETTINGS.setup` in the test helper.

## 4. Desktop compatibility (temporary defaults)

Until R1b/R2 wire the settings store:

- `page/adapter.ts` uses `DEFAULT_PAGE_SETTINGS.setup` instead of `document.pageSetup`;
  `toLayoutDocument` must not read document page/manual fields.
- `page/model.ts` uses an empty manual-break list or `DEFAULT_PAGE_SETTINGS.manualBreakBeforeBlockIds`.
- `App.tsx` test bridge `orientation` uses `DEFAULT_PAGE_SETTINGS.setup.orientation`; `structure()`
  stops exposing document manual breaks (or exposes the default empty list).
- Keep `PAGE_LAYOUT_OPTIONS`/CSS as-is for now; R1b maps the compact theme.
- Page Read/Edit must keep working with default settings.

## 5. Tests/fixtures/scripts

Update:

- `fixtures/*.json` — remove `pageSetup` and `manualBreakBeforeBlockIds` from canonical fixtures.
- `scripts/generate-fixtures.mjs` — stop writing them; keep fixtures valid.
- `packages/core/test/fixtures/schema/*.json` — v1 migration fixture, current v2, newer v3.
- `packages/core/test/{model,serialize,duplicate-remap,anchor-performance,destructive-undo,move-undo,commands,commands-invariants}.test.ts`
- `packages/layout/test/*` and helpers: inject `DEFAULT_PAGE_SETTINGS.setup`; pass manual breaks as
  options where needed.
- `apps/desktop/test/{page-adapter,page-model,page-edit,adapter,text-history,anchor-health,delete-references,tree,editor-projection}.test.ts`
- `tests/support/page-fixtures.mjs`, `tests/ui`, `tests/e2e`, `tests/recovery`, `tests/visual`.
- `scripts/lib/verify.mjs` — orientation from default page settings, not document.
- `App.tsx` test bridge.
- Add a unit test that a v1 document with all three legacy fields migrates to v2 and strips them,
  preserving unknown fields.

## 6. Do not

- Do not implement Page arrows, continuous marker removal, density UI, settings persistence, or
  manual-break UI. Those are R1b/R2/R3.
- Do not edit user showcase or `/Users/luca/Documents`.
- Do not edit spec/UX/plan; report.
- Do not add a new external dependency.

## Gates

- `npm run check:boundaries`
- `npm run typecheck`
- targeted vitest
- `npm test`
- `npm run test:ui`
- `npm run test:recovery:run`
- `npm run e2e:critical`
- one `npm run verify:fast` at the end

## Deliverable

Report `docs/reports/r1a-canonical-schema-v2.md`: worktree/branch/base/commit, page-settings API,
schema v2 migration, removed core fields/commands, layout status, fixture/test changes, tests/timings,
risks, not verified, and any transient debt left for R1b. Do not merge or push. Stop and ask if
removing `NoteDocument.pageSetup` in this slice becomes too large; do not silently leave a second
page-settings path.
