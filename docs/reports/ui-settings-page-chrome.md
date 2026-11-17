# R2 — Page chrome settings (header, footer, page number)

- **Role:** Implementer / Builder
- **Worktree:** `a builder worktree`
- **Branch:** `t3/page-chrome-settings`
- **Base:** `25e71d8` — `docs: add the R2 Page chrome brief`
- **Implementation commit:** `311f7f9` — `feat: page chrome settings (R2)`
- **Report commit:** the follow-up docs commit that adds this file; the branch head SHA is in the handback message.
- **Status:** complete; no merge, no push.

## Summary

One typed Page chrome setting now drives Page Read, Page Edit, the Settings preview, and
the PDF from the same resolved `PageSettings.chrome` object.

- **Model (`packages/layout`)**: `PageChrome { header: 'none' | 'document' | 'chapter';
  footer: same; pageNumber: boolean }`; defaults `{ header: 'document', footer: 'chapter',
  pageNumber: true }`. `PageSettings.chrome` is required and `PageSettingsOverride.chrome`
  is partial. Merge, normalization, and the per-document override helper path all carry it,
  and `pageSettingsFingerprint` includes chrome so a chrome change is part of the measured
  and print identity. This is an additive field: old `settings.json` files and old document
  overrides without `chrome` load the defaults. No `settingsVersion` bump and no migration.
- **Text and rendering**: `pageChromeContent` now returns `headerText`, `footerText`, and
  `pageLabel` (null when off) alongside the unchanged document/chapter titles and
  continuation labels. A new shared `PageChromeView` is mounted by `PageSurface` (Page Read
  and Page Edit), `PrintDocument`, and the Settings preview. A `none` source renders no
  header/footer node; the page number renders only when on and keeps `data-page-indicator`.
  The footer is footer text left, number centered, empty right slot; header text stays left.
  `pageChromeLayout` geometry is unchanged.
- **Settings UI (Page page)**: a Chrome section after Page setup with Header and Footer
  selects (`None` / `Document title` / `Chapter title`), a Page-number checkbox, per-field
  override dots, per-field and group “Use global”, and a global “Reset to default”.
  Writes use the existing immediate path (`runImmediate` + `capturePageSettingsTarget` +
  `commitThenWritePageSettings`), so there is no new debounce, Page Edit is committed first,
  a closed document cannot be retargeted, switching scope never writes, and a value equal to
  the global value removes the override instead of storing a no-op. The document/global
  scope, no-document, and read-only rules are the existing Page rules.
- **Print/PDF**: `buildPrintModel` passes the resolved chrome into `pageChromeContent`, so
  `PrintPage.chrome` carries the same text as Page Read; the print compositor renders the
  same `PageChromeView`. The settings fingerprint (now including chrome) is still required
  and validated, so a stale measured run fails as before. `m4c2` extracts the header, footer,
  and page number from a real exported PDF.

The intended visible delta from before is exactly the approved one: the header no longer
repeats the chapter title, the footer keeps the chapter title, and the page number moved
from the right edge to the bottom center. There is no page-1 suppression, no chapter-start
change, no free text, no chrome font/color setting, and no toolbar redesign.

## Additive-field / no-migration rationale

- `mergePageSettings(base, override)` calls `sanitizeChrome(override?.chrome, base.chrome)`.
  With no `chrome` key (old `settings.json`, old document override) every field falls back to
  the base value, which is the approved default for a normalized settings object.
- `normalizePageSettingsOverride` keeps only the chrome fields that were actually present and
  valid, so a partial document override stays partial and a later global change still reaches
  it.
- `settingsDocumentForWrite` already spreads the raw `page`, `page.setup`, `page.theme`, and
  margin objects before writing known values, which is what preserves unknown keys. For the
  new known field it now writes `chrome: { ...rawChrome, ...settings.page.chrome }`; an
  unknown future chrome key written by a newer build survives, while the three known fields
  are written. Reading an old file still produces a complete `AppSettings` with the chrome
  defaults.
- `document-settings.json` is normalised through `normalizePageSettingsOverride`, so a
  chrome-only entry survives serialization and a corrupt chrome value is dropped without
  invalidating the rest of the entry.
- Because no stored shape became invalid and every missing value has a defined default, a
  schema version bump would add migration code without changing any file semantics. This is
  the same additive-field policy used for earlier Page fields inside `page`.

## Files changed

Model and print:

- `packages/layout/src/page-settings.ts`
- `packages/layout/src/page-chrome.ts`
- `packages/pdf/src/printModel.ts`
- `packages/layout/test/page-settings.test.ts`
- `packages/layout/test/page-chrome.test.ts`
- `packages/pdf/test/print-model.test.ts`

Renderer, print, and Settings:

- `apps/desktop/src/renderer/src/page/PageChromeView.tsx` (new shared chrome renderer)
- `apps/desktop/src/renderer/src/page/PageView.tsx`
- `apps/desktop/src/renderer/src/page/projection.ts`
- `apps/desktop/src/renderer/src/print/PrintDocument.tsx`
- `apps/desktop/src/renderer/src/settings/PageSettingsPreview.tsx`
- `apps/desktop/src/renderer/src/settings/page-setup.ts`
- `apps/desktop/src/renderer/src/settings/usePageSettingsController.ts`
- `apps/desktop/src/renderer/src/shell/SettingsDialog.tsx`
- `apps/desktop/src/renderer/src/state/settings.ts`
- `apps/desktop/src/renderer/src/styles.css`
- `apps/desktop/src/shared/settings-file.ts`

Unit tests:

- `apps/desktop/test/page-setup.test.ts`
- `apps/desktop/test/settings-store.test.ts`
- `apps/desktop/test/settings.test.ts`
- `apps/desktop/test/document-settings.test.ts`
- `apps/desktop/test/page-model.test.ts`
- `apps/desktop/test/print-parity.test.ts`

UI suites:

- `tests/ui/m4b1-page-view.test.mjs` (new chrome Read/Edit test and screenshot)
- `tests/ui/ui-batch-b.test.mjs` (global, document, read-only, no-document, Page Edit
  ordering, screenshots)
- `tests/ui/m4c2-pdf-export.test.mjs` (real exported-PDF chrome case)
- `tests/ui/m4c3-pdf-gate.test.mjs` (header/footer geometry selectors updated)

## Checks with real timings

Fresh worktree: `npm ci` added 199 packages in 2 s.

Targeted while working:

| Check | Result |
|---|---|
| `npx vitest run` on the 9 touched unit files | 9 files / 162 tests passed — 416 ms |
| `npm run typecheck` (all 4 workspaces) | pass — desktop node + web, core, layout, pdf |
| `npm run check:boundaries` | pass — 180 files, 883 imports, 16 rules |
| `node --test tests/ui/m4b1-page-view.test.mjs` | 10/10 tests — 15.0 s |
| `node --test tests/ui/ui-batch-b.test.mjs` | 10/10 tests — 19.4 s (re-run after the final read-only assertion) |
| `node --test tests/ui/m4b1b1-page-edit-overlay.test.mjs` | 8/8 — 15.1 s |
| `node --test tests/ui/m4c1-print-compositor.test.mjs` | 6/6 — 12.0 s |
| `node --test tests/ui/m4c2-pdf-export.test.mjs` | 10/10 — 16.8 s |
| `node --test tests/ui/m4c3-pdf-gate.test.mjs` | 3/3 — 19.6 s |
| `node --test tests/ui/r1b-page-settings.test.mjs` | 4/4 — 11.0 s |
| `node --test tests/ui/ui-settings-advanced.test.mjs` | 8/8 — 19.1 s |
| `node --test tests/ui/r2a-page-arrows-cleanup.test.mjs` | 3/3 — 12.3 s |
| `node --test tests/ui/m4d1-page-density.test.mjs` | 3/3 — 17.9 s |
| `node --test tests/ui/m4d2-export-ui.test.mjs` | 8/8 — 18.8 s |
| `node --test tests/ui/m4e1-settings-platform.test.mjs` | 4/4 — 12.1 s |

One full gate:

| Stage | Result |
|---|---|
| `npm run verify` — total wall time | **exit 0 — real 169.59 s (~2 m 50 s)** |
| boundaries | pass — 180 files, 883 imports, 16 rules |
| typecheck | pass — 4 workspaces |
| unit | **109 files / 1129 tests passed — 3.01 s** |
| critical e2e | **16/16 passed — 43.77 s suite** (budget < 60 s) |
| recovery | **14/14 passed** |
| UI | **46/46 suites passed, 0 failed — 98.7 s**, default pool/concurrency 8 |
| pageErrors | 0 across the UI suites |

The full run happened before the last test-only addition (a chrome assertion in the existing
read-only UI test). That suite was re-run afterwards and passed 10/10 in 19.4 s; no product
code changed after the full run.

Screenshots/evidence:

- `artifacts/m4b1-page-chrome/page-chrome-defaults.png` — Page Read with the default
  document header, chapter footer, centered `Page 1 of 1`.
- `artifacts/ui-batch-b/page-settings-chrome-override.png` — Chrome section with a document
  footer + page-number override, dots, “Use global”, and the live preview.
- `artifacts/ui-batch-b/page-settings-sample-preview.png` — no-document sample with the
  global chrome controls.
- `artifacts/m4c2/export/export-evidence.json` plus `chrome-default.pdf` / `chrome-custom.pdf`
  from the m4c2 run (real text extraction for header, footer, and page number).

## Acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| Header `None` / `Document title` / `Chapter title` renders in Page Read, Page Edit, the preview and the PDF; footer independently | **Pass** | `page-chrome.test.ts` all 18 source/number combinations; `print-model.test.ts` chrome text; `print-parity.test.ts` F3 Page Read vs print equality; `m4b1-page-view` Read/Edit test; `ui-batch-b` document test; `m4c2` PDF text |
| Page number on = `Page N of M` bottom-center in all four surfaces; off removes it; no page-1 suppression | **Pass** | `m4b1-page-view` asserts band-center geometry, absence of the right-aligned edge, and removal on Page Read/Edit; `ui-batch-b` asserts the preview indicator disappears; `m4c2` default PDF asserts `Page 1 of 1` and the custom PDF asserts it is absent; `m4c1`/`m4c3` parity and geometry |
| Global default + per-document override: dots, Use global, equal-to-global removal, no write on scope switch, no-document/read-only | **Pass** | `page-setup.test.ts` override helpers; `settings-store.test.ts` chrome patch/override; `ui-batch-b` document chrome test (dots, per-field/group Use global, equal-to-global removal, scope-switch byte comparison), no-document sample test, read-only document test |
| Approved defaults preserve the output; only the duplicate chapter header is removed and the number is centered | **Pass** | `page-settings.test.ts` defaults; `m4b1-page-view` default screenshot and assertions; PDF gate visual/raster and geometry checks |
| Old settings without `chrome` load defaults; no `settingsVersion` change; no schema drift | **Pass** | `page-settings.test.ts` old-settings test; `settings.test.ts` old-file load + v2 write; `document-settings.test.ts` chrome-only override normalization |
| PDF/Page parity and print identity; fingerprint changes with chrome; stale exports fail | **Pass** | `print-model.test.ts` chrome identity mismatch; `print-parity.test.ts` print/projection chrome equality; `m4c1` snapshot parity; `m4c2`/`m4c3` real PDFs |
| Existing assertions updated to the new intended output, none weakened; no pageErrors | **Pass** | `m4c3` header/footer selectors updated (footer text added to the geometry checks); m4c2 checks extended; suite `after` hooks assert empty `pageErrors` |
| `npm run verify` exit 0 with real timings; UI suites at the default pool | **Pass** | Table above |

## Integration

- Fast-forward into `main` from `25e71d8` to `d23b582`.
- Full `npm run verify` on `main` at `d23b582`: **exit 0, 175.94 s** — 109 unit files /
  1129 tests, 16/16 e2e, 14/14 recovery, **46/46 UI** at the default pool, 0 pageErrors.
- Open for the product-owner visual pass: the number is centered in the footer margin band;
  with asymmetric margins it is not paper-center. A one-line `(left − right) / 2` offset is
  the change if paper-center is required.

## Open questions / risks

1. **Center reference with asymmetric margins.** The number is centered in the footer margin
   band (between the left and right margins). With the default 12 mm symmetric margins this
   is the paper center; with an asymmetric preset (for example the planned Notability wide
   right margin) it is slightly offset from the paper center. If the product owner means the
   paper center there, a small `(left − right) / 2` offset on the number is the one-line
   change; the brief's “do not change the margin-band geometry” was read as band centering.
2. **Chrome in the measured fingerprint.** A chrome toggle changes the fingerprint, so Page
   Read and the Settings preview re-run measurement and pagination even though chrome does
   not affect layout. This is the brief's identity requirement and keeps print/export honest;
   the cost is a measurement pass on a chrome click. A future split between a measured-run
   identity and a print-only chrome identity would need a contract change.
3. **Page number vs page navigation.** Turning the chrome number off removes the visible
   footer chrome everywhere, but the Page toolbar and the sheet `aria-label` still expose
   “Page N of M” as navigation/context. That is deliberate; the setting controls printed
   page chrome, not page navigation or accessibility context.
4. **Footer text overflow.** Footer text now has `overflow: hidden` + ellipsis inside its
   grid column so a long chapter title cannot push the centered number off-center. The header
   keeps its previous single-line behavior; a very long document title is not ellipsized (same
   as before this task).
5. **Docs gap.** `docs/design/ui-settings-contents.md` §4 does not yet list a Chrome row (the
   settings inventory was frozen before R2). The implementation follows the brief defaults;
   adding the §4 row is a UX/docs follow-up, not a Builder edit.
6. **Responsive Settings.** The Chrome controls were verified at 1440 × 900. At the 840 px
   breakpoint the preview is hidden by the existing layout; the three-option segmented
   controls still fit the pane, but that width was not screenshot-evidenced in this task.

## Next suggested step

Sentinel review against the brief and the review checklist, with attention to the
fingerprint/re-measure trade-off and the center reference with asymmetric margins. After
acceptance, record the Chrome section in `docs/design/ui-settings-contents.md` §4 and ask the
product owner for the PDF/Settings visual pass. R3/R4 remain stopped.
