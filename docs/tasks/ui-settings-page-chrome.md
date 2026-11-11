# R2 — Page chrome settings (header, footer, page number)

**Role:** Implementer / Builder
**Milestone:** UI settings — Wave 2 (Page output)
**Base:** `main` at the commit that adds this brief (`1b1077c` plus the brief commit)
**Worktree:** created by the delegate from that base; do not work in the main checkout
**Timebox:** 4 hours

## Context

The Page renderer and the PDF currently print a fixed chrome: header = document title + chapter
title, footer = chapter title + `Page N of M` at the right. The roadmap's R2 is **Page chrome**:
header/footer/page-number settings, global default + per-document override, rendered identically in
Page Read, Page Edit, the Settings preview, and the PDF.

The product owner confirmed these defaults and scope on 11 November 2026:

- page number: on/off, **on by default**, bottom-center;
- header source: none / document title / chapter title, **document title by default**;
- footer source: same options, **chapter title by default**;
- no free text, no dedicated chrome font, no first-page suppression, no chapter-start change;
- no Page toolbar redesign in this batch.

Intended visible delta from today: the header stops repeating the chapter title (UX v1.5 says the
running header is the document title), the footer keeps the chapter title, and the page number moves
from the right edge to the bottom center. Everything else must stay identical.

## Goal

One batch that adds a typed, additive Page chrome setting, wires it through the single resolved Page
settings object into Page Read, Page Edit, the preview, and the PDF, and exposes it on the Page
settings page with the existing global/document scope and override semantics.

## In scope

### 1. Model (`packages/layout`)

- Add `PageChrome`:
  ```ts
  type PageChromeSource = 'none' | 'document' | 'chapter';
  interface PageChrome {
    header: PageChromeSource;
    footer: PageChromeSource;
    pageNumber: boolean;
  }
  ```
- Add `chrome: PageChrome` to `PageSettings` and `chrome?: Partial<PageChrome>` to
  `PageSettingsOverride`. Defaults: `{ header: 'document', footer: 'chapter', pageNumber: true }`.
- Extend `mergePageSettings`, `normalizePageSettings`, `normalizePageSettingsOverride`, the override
  helpers (with/without chrome, per-field presence, equal-to-global removal) and
  `pageSettingsFingerprint` so a chrome change is part of the measured/print identity.
- This is an **additive field**: old `settings.json` and document overrides without `chrome` must
  load with the defaults. Do not bump `settingsVersion`; explain in the report why the existing
  raw-page spread preserves the field and why no migration is needed.
- Keep `PageTheme.chromePt` as the chrome type size.

### 2. Chrome content and rendering

- Extend `pageChromeContent` (or an equivalent pure helper) to take the resolved `PageChrome` and
  return `headerText: string | null`, `footerText: string | null`, `pageLabel: string | null`
  (`Page N of M` only when `pageNumber` is true). Keep the document/chapter titles and continuation
  labels available for the ghost/continues bands.
- Page Read and Page Edit use the same `PageChrome` component; render the header only when
  `headerText` is non-null, the footer text only when `footerText` is non-null, and the page number
  only when `pageLabel` is non-null. The page number keeps `data-page-indicator` when visible.
- Footer layout: footer text on the left, page number **centered** in the page width, the right slot
  empty. Header text stays left. Do not change the margin-band geometry (`pageChromeLayout`).
- The preview (`PageSettingsPreview`) uses the same projection/Surface, so it must update with the
  draft chrome; invalid margins keep the last valid model as today.
- Print (`PrintDocument` / print model) renders exactly the same header/footer/number as Page Read;
  the print model identity/fingerprint includes chrome.
- No chapter-start change; no manual breaks; no page-number suppression on page 1.

### 3. Settings UI (Page page)

- Add a **Chrome** section on the Page page (after Page setup, before/after typography as the IA
  allows) with:
  - Header: segmented/select `None` / `Document title` / `Chapter title`;
  - Footer: same three options;
  - Page number: toggle.
- Global/document scope behaves like the rest of Page: document scope shows per-field override dots
  and “Use global” for each field/group; switching scope never writes; a value equal to the global
  value removes the override instead of storing a no-op; no-document/read-only states follow the
  existing Page behavior.
- Writes go through the existing immediate-write path with the F2 captured target
  (`runImmediate`/`capturePageSettingsTarget`); no new debounce for toggles. The Page Edit
  commit-before-write ordering stays.
- Reset/Use global actions and the footer save status behave like the other Page controls.

### 4. Coverage

- Unit: normalization/defaults for old files, merge/override creation/removal, fingerprint includes
  chrome, chrome content for every header/footer/number combination, print model chrome.
- UI: global and document chrome changes update Page Read, Page Edit, the preview and an exported
  PDF; override dots/Use global; page number off removes the indicator; defaults; read-only/
  no-document; no pageErrors.
- Print/PDF parity: `m4c1-print-compositor`, `m4c2-pdf-export`, `m4c3-pdf-gate` (and
  `r1b-page-settings` / `m4b1*` as needed).
- Update existing assertions that expect the old header/footer text or the right-aligned number;
  do not weaken them.

## Out of scope

- Chapter-start behavior (“new chapter = new page” stays), manual breaks, page range, cover pages,
  first-page suppression.
- Free-text header/footer, custom chrome font/color/position beyond the approved bottom-center,
  per-page chrome, Appearance/Export defaults/Continuous global/library backup.
- Page toolbar hierarchy redesign.
- Schema/migration/`settingsVersion` bump, new dependencies, weakened assertions, fixed sleeps,
  native dialogs.

## Files

Read:
- `packages/layout/src/page-settings.ts`, `page-chrome.ts`, `types.ts`.
- `packages/pdf/src/printModel.ts`, `packages/pdf/test/print-model.test.ts`.
- `apps/desktop/src/renderer/src/page/PageView.tsx`, `projection.ts`, `usePageModel.ts`,
  `page/PageSurface` (same file), `print/PrintDocument.tsx`, `print/print.css`, `styles.css`.
- `apps/desktop/src/renderer/src/settings/PageSettingsPreview.tsx`,
  `settings/usePageSettingsController.ts`, `shell/SettingsDialog.tsx`.
- `apps/desktop/src/shared/settings-file.ts`, `shared/document-settings.ts`.
- `docs/design/ui-settings-contents.md` §4/§8, `docs/design-tokens-page.md` chrome rows,
  `docs/ux.md` Page chrome/G1, `docs/spec.md` page numbers/headers.
- Tests: `packages/layout/test/page-settings.test.ts`, `page-chrome.test.ts`,
  `apps/desktop/test/page-model.test.ts`, `print-parity.test.ts`, `settings-store.test.ts`,
  `page-advanced.test.ts`; UI `m4b1-page-view`, `m4b1b1-page-edit-overlay`,
  `m4c1-print-compositor`, `m4c2-pdf-export`, `m4c3-pdf-gate`, `r1b-page-settings`,
  `ui-batch-b`, `ui-settings-advanced`.

Expected to touch:
- The model/print/renderer/Settings files above, their unit tests and the affected UI suites.
- A new UI suite or a justified extension of `ui-batch-b`/`m4b1-page-view` for chrome controls;
  register any new suite in `tests/ui/suites.mjs`.
- `docs/reports/ui-settings-page-chrome.md`.

## Acceptance criteria

- [ ] Header `None` / `Document title` / `Chapter title` renders the chosen text in Page Read, Page
      Edit, the preview and the PDF; footer does the same independently.
- [ ] Page number on shows `Page N of M` bottom-center in Page Read/Edit/preview/PDF; off removes
      it everywhere. No page-1 suppression.
- [ ] Global default and per-document override work with dots, “Use global”, equal-to-global
      removal, no write on scope switch, and the existing no-document/read-only behavior.
- [ ] Defaults preserve the approved output: header = document title, footer = chapter title, page
      number on; the only default visual change is the removed duplicate chapter header and the
      centered number.
- [ ] Old settings files without `chrome` load with defaults; no `settingsVersion` change; no schema
      drift.
- [ ] PDF/Page parity and print identity: the same chrome appears in the PDF; the fingerprint
      changes when chrome changes and stale exports fail as before.
- [ ] Existing assertions updated to the new intended output, none weakened; no pageErrors.
- [ ] `npm run verify` exit 0 with real timings; all UI suites at the default pool.

## Tests and evidence

- Targeted while working: the layout/print unit files, `m4b1*`, `r1b`, `ui-batch-b`, and the PDF
  suites; typecheck/boundaries.
- End of task: one full `npm run verify` (~3 min).
- Screenshots of the Chrome settings and a Page with header/footer/number in the suite's own
  `artifacts/<suite>` directory; a PDF text check for the header/footer/page number.

## Stop and ask

Stop and report when:

- the approved defaults conflict with a spec/UX requirement (for example a mandatory header);
- a chrome field cannot be made additive without a version bump/migration;
- PDF parity needs a print-compositor or paginator change beyond the chrome text/layout;
- a baseline test fails for an unrelated reason.

## Report format

- Summary mapped to the model, rendering, Settings UI, and PDF parity.
- Files changed.
- Checks with real timings and suite counts.
- Acceptance criteria pass/fail with the test/evidence.
- Open questions / risks.
- Next suggested step.

Commit in the worktree; do not merge or push.
