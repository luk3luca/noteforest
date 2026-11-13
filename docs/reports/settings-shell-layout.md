# Settings & shell layout — implementation report

**Role:** Implementer / Builder
**Date:** 13 November 2026
**Brief:** `docs/tasks/settings-shell-layout.md`
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-94091194-8df2b3f7d0c49d97`
**Branch:** `t3/settings-shell-layout`
**Base:** `79afbb1` (`main` head at delegation, includes the brief)
**Commit:** one worktree commit — this report commit on top of `79afbb1`; not merged, not pushed

## Summary

### A. Modal geometry — done

- `.nf-settings-modal` is `width: 1180px`, `max-width: 92vw`, and
  `height: min(820px, calc(100vh - 132px))`. The overlay is unchanged
  (`align-items: flex-start`, `padding-top: 108px`): the modal stays top-anchored, never centered,
  and at a 900 px-tall window it is 1180 × 768 with the footer at y 876 (fully reachable).
- `.nf-settings` follows the modal with `height: 100%`; the old `580px` and `max-height: 86vh`
  literals are gone. The header (44 px) and footer (48 px) keep fixed heights and the left nav is
  fixed; only `.nf-settings-pane` scrolls (`overflow-y: auto`).
- The `≤920 px` viewport rule keeps the 840 px narrow width and hides the rail.

### B. One preview rail for Page, Continuous and Appearance — done

- `.nf-settings-preview` is now the one rail: `width: clamp(320px, 34%, 400px)`,
  `border-left: 1px solid var(--border-1)`, `padding: 18px 16px 20px`, the same
  `Preview` title and a muted scope line. It is the sibling of `.nf-settings-pane` exactly where
  the Page preview already lived. The active page decides which preview renders; pages without a
  preview render no rail, and the modal width/height never change when switching pages.
- **Continuous** moved out of `ContinuousSettingsPage` into the rail
  (`ContinuousSettingsPreview`). It keeps `data-continuous-preview`,
  `data-continuous-preview-stage`, `data-preview-card`, the note/card markup, the `EdgeLayer`
  router, and its `aria-label="Continuous preview"`. The 355 px default stage fits the rail
  content width (367 px) at scale 1; at the maximum width caps (a 476 px stage) one uniform
  transform scales the stage into the rail (`scale 0.773`), and the frame clips only the scaled
  box. Spacing, corridor, arrowhead and stroke widths remain the model values; only the
  documented 0.35 card-width preview factor and the presentation transform are preview-only.
- **Appearance** moved out of `AppearanceSettingsPage` into the rail
  (`AppearanceSettingsPreview`), keeping `data-appearance-preview`, `data-appearance-preview-code`,
  `-focus`, `-selection`. In the rail the sample grid is one column. Theme, accent, and code font
  still come from the real settings store and follow live.
- Both pages keep a small "where the preview lives" help line in place of the moved block; the
  Appearance reset action stays a real control on the page.
- `useMeasuredSize.ts` is the small shared measurement hook (ResizeObserver + callback ref). It
  has no timers and re-attaches when a preview swaps states (sample ↔ document ↔ empty).

### C. Page preview: page 1 and page 2 stacked — done

- In the ready state the rail renders **page 1 above page 2**, both from the existing
  `usePageModel` result and one `projectPageContent` projection. There is no second model pass and
  no re-pagination: `model.pages.slice(0, 2)` feeds `PageSurface` with its own fragments,
  `buildPageEdgeModel` edges/trunks, and the projected chrome per page. Each sheet has a small
  muted `1` / `2` label.
- The stack measures the leftover rail height and derives **one uniform scale** for both sheets
  (`min(width, height-per-sheet, 1)`), so both are fully visible without scrolling; shorter
  windows scale both down together. Measured at 1440 × 900: two 364 × 257 landscape sheets inside
  a 367 × 561 stack, rail `scrollHeight == clientHeight`, `scrollTop 0`.
- One-page documents render one sheet (`1`); the no-document sample and the empty-document state
  stay one unlabelled sheet. The invalid/paused overlay still covers the stack.
- Hooks kept: `data-page-preview`, `-state`, `-page-count`, `-size`, `-orientation`, `-density`,
  `-updating`, `-summary`, `-scope`, `-fragment`, `-invalid`, `data-fragment-*`; added
  `data-page-preview-sheet` on every sheet frame, `data-page-preview-sheet-index`,
  `data-page-preview-sheet-count`, and `data-page-preview-page`/`-label` for the stack.

### D. Settings nav — done

- App: General, Appearance, **Continuous**. Document: **Page** only. Workflow and Data are
  unchanged. Arrow-key navigation follows the rendered order; the UI test asserts both the flat
  order and the group structure.

### E. Sidebar icon alignment — done

- `.nf-sidebar-rail` now stretches its head/foot instead of centering content; `.nf-rail-head` and
  `.nf-rail-foot` are full width with the same 8 px inset as the expanded shell, so the 28 × 28
  collapse/expand and the 30 × 30 gear keep their exact centres.
- The expanded Settings footer moved its gear into a 30 × 30 icon slot
  (`.nf-sidebar-settings-icon`), the same box as the rail gear; the gear centre is identical in
  both states and the label sits just after the slot. Icon size stays 15 px in both states.
- Measured at 1440 × 900: collapse/expand `(31, 57)` expanded = `(31, 57)` collapsed; Settings
  `(32, 836)` expanded = `(32, 836)` collapsed; both icons 15 × 15. The UI assertion requires
  ≤ 0.5 px in x and y, for both icons (`v0-shell-frame` and the new suite).

## Files changed

- `apps/desktop/src/renderer/src/shell/SettingsDialog.tsx` — nav group move; render the rail for
  Page, Continuous and Appearance.
- `apps/desktop/src/renderer/src/shell/Sidebar.tsx` — 30 × 30 icon slot in the Settings footer.
- `apps/desktop/src/renderer/src/settings/PageSettingsPreview.tsx` — stacked two-page preview from
  one model, measured uniform scale, per-sheet chrome/fragments/edges/trunks, one-sheet states.
- `apps/desktop/src/renderer/src/settings/ContinuousSettingsPreview.tsx` — rail presentation and
  scale-to-fit frame (model, cards, edges, hooks unchanged).
- `apps/desktop/src/renderer/src/settings/AppearanceSettingsPreview.tsx` — **new** rail preview.
- `apps/desktop/src/renderer/src/settings/AppearanceSettings.tsx` — preview moved out; reset stays.
- `apps/desktop/src/renderer/src/settings/ContinuousSettings.tsx` — preview moved out;
  "Preview" help line points to the rail.
- `apps/desktop/src/renderer/src/settings/useMeasuredSize.ts` — **new** shared measurement hook.
- `apps/desktop/src/renderer/src/styles.css` — modal/rail/stack/continuous/appearance/sidebar
  geometry.
- `apps/desktop/test/ui-batch-v-css.test.ts` — the CSS contract (1180, capped height, rail clamp,
  media rule).
- `tests/ui/settings-shell-layout.test.mjs` — **new** suite (A–E geometry + screenshots).
- `tests/ui/suites.mjs` — register the new suite (FILES, settings and shell groups).
- `tests/ui/ui-batch-v.test.mjs` — fixed-surface/rail/height assertions updated.
- `tests/ui/ui-batch-b.test.mjs` — the no-document sample asserts one unlabelled sheet.
- `tests/ui/ui-batch-a.test.mjs` — nav order + App/Document group assertions.
- `tests/ui/v0-shell-frame.test.mjs` — icon centre tolerance tightened to 0.5 px and 15 px size
  asserted for both icons.
- `docs/reports/settings-shell-layout.md` — this report.

## Checks run

| Check | Result | Timing |
| --- | --- | --- |
| `npm run build` | pass | ~7 s |
| `node --test tests/ui/settings-shell-layout.test.mjs` | 3/3 pass | 13.1 s (in the runner) |
| `node tests/ui/run.mjs --group settings,shell` | 20/20 suites pass, 0 pageErrors | 65.1 s |
| `npm run verify:fast` | exit 0 — boundaries 202 files / 969 imports / 16 rules, typecheck pass, 126 unit files / 1267 tests, 16/16 e2e | 54.1 s total (e2e suite 43.2 s) |

Affected suites (all green): `settings-shell-layout`, `ui-batch-v`, `ui-batch-a`, `ui-batch-b`,
`r6-continuous-settings`, `ui-appearance-v3`, `ui-settings-advanced`, `m4d1-page-density`,
`r1b-page-settings`, `v0-shell-frame`, `m4e1-settings-platform`, `ui-editor-shortcuts`,
`ui-settings-recovery`, `ui-overlay-command-gate`, `ui-document-status`, `library-surface`,
`document-lifecycle`, `m2-shell`, `m2-view`, `backspace-boundary`.

## Acceptance criteria

| Criterion | Verdict | Evidence |
| --- | --- | --- |
| Settings is 1180 × 820 (capped) and the footer is always reachable | pass | `ui-batch-v` + `settings-shell-layout`: modal 1180 × min(820, 100vh − 132), top 108, footer bottom ≤ innerHeight; 900 px window → 768 high, footer at 876 |
| Page, Continuous and Appearance use the same right rail; switching pages never changes the modal width | pass | rail = clamp(320, 34%, 400) on all three pages, identical width, modal width/height constant across 6 page switches |
| Continuous preview visible in the rail, live, never clips at default or max caps | pass | stage 355 px at scale 1; max caps → 476 px stage scaled to the 368 px rail content (`0.773`), stage/frame inside rail; `r6` live slider edits still move the cards |
| Appearance preview in the rail and one column | pass | rail `grid-template-columns: 341px` (one column), code/focus/selection hooks present, sample inside the rail |
| Page preview shows page 1 + page 2 stacked when ≥2 pages, one sheet otherwise; both visible at 900 px height | pass | 3-page fixture → sheets 1,2 with own fragments and `Page N of 3` chrome, no rail scroll; 1-page → one sheet; sample/empty → one unlabelled sheet |
| Continuous is in the App nav group | pass | group assertion: App = General, Appearance, Continuous; Document = Page |
| Sidebar icons keep centre and size (≤ 0.5 px) | pass | measured identical centres in both states; 15 × 15 px; 28 × 28 collapse and 30 × 30 gear boxes |
| No schema/Page/PDF/settings-version change; no fixed sleeps; no native dialogs; no weakened assertions | pass | settingsVersion untouched (5); no layout/print/settings-store edits; tests use `waitForFunction`/`waitForSelector`; only geometry assertions were updated to the new intended geometry |

## Screenshots (`artifacts/settings-shell/`, git-ignored)

- 1792 × 1120 dark: `continuous-default-1792x1120-dark.png`,
  `continuous-changed-1792x1120-dark.png`, `appearance-1792x1120-dark.png`,
  `page-two-pages-1792x1120-dark.png`.
- 1440 × 900 dark: `continuous-1440x900-dark.png`, `page-two-pages-1440x900-dark.png`,
  `page-1440x900-dark.png`, `appearance-1440x900-dark.png`.
- 1280 × 800 dark: `continuous-1280x800-dark.png`.
- Light: `continuous-light-1792x1120.png`, `page-two-pages-1792x1120-light.png`,
  `page-empty-1440x900-light.png`.
- No document open: `continuous-no-document-1792x1120.png`.
- Icon alignment: `sidebar-expanded-settings-icons.png`,
  `sidebar-collapsed-settings-icons.png`.

## Open questions / risks

- **The stacked sheets are small by construction.** The rail height is the binding constraint, so
  at a 900 px-tall window each page is about 364 × 257 (A4 landscape); A4 portrait is narrower.
  That is the required "two pages, no scrolling" trade-off; a product-owner visual pass may prefer
  a taller modal or a page-only taller rail.
- **The expanded Settings label moved ~7 px right.** The gear now sits in the same 30 × 30 slot as
  the collapsed rail gear so the icon centre is exact; the label follows the slot. The footer
  button hover surface still starts at the same 8 px inset.
- **Continuous preview at the width caps is uniformly scaled** (spacing included), because the
  whole stage is one transform. The underlying spacing/corridor/arrow values are exact; only the
  presentation scales. Default settings render at scale 1, so the common case is 1:1.
- **The rail exists only on Page, Continuous and Appearance.** General/Editor/Export/Data center
  the 536 px column in the wider body; this is deliberate (no empty preview column), but it means
  the content column's horizontal position differs from the preview pages.
- **At ≤920 px the rail hides** for all three preview pages (existing viewport rule kept); the
  preview is then unavailable, and the controls are unaffected.
- No schema, settings-store, Page/PDF layout, print-model, or PageChrome change; the settings
  schema stays v5.

## Next step

- Product-owner visual pass over the new modal/rail/stacked page preview and the sidebar icon
  alignment (screenshots above), then the special-text batch. Do not reopen the Continuous
  arrow colours/widths, modal centering, or Page/PDF geometry here.
