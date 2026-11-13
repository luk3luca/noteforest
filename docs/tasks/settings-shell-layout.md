# Settings & shell layout batch

**Role:** Implementer / Builder
**Milestone:** Settings follow-up (post R6)
**Base:** `main` head at delegation (includes this brief)
**Worktree:** created by the delegate from that base; do not work in the main checkout
**Timebox:** 1 day

## Context

R6 shipped the global Continuous settings with a live sample preview. The product-owner review
found four layout problems that were deferred to this batch:

1. **Settings is too small for a right-side preview.** It is 980 × 580, so the Continuous and
   Appearance previews sit at the bottom of a scrolling page and are effectively invisible while
   tuning. Page already has a 258 px right rail.
2. **Settings should be taller as well as wider.** The Page preview must show **two pages stacked**
   (page 1 above page 2) like a document, not two side by side, so the height is the binding
   constraint.
3. **Continuous is under the "Document" nav group** even though it is now global.
4. **Sidebar collapse/expand and Settings icons shift** by a small amount when the sidebar is
   collapsed. The icon must not move or change size.

The Continuous preview sample is 355 px wide at default settings (up to 476 px at the maximum width
caps), which drives the rail width.

## Goal

One worktree, **one commit** (no per-file/hunk split), one `npm run verify:fast`, the affected UI
suites, and screenshots.

## In scope

### A. Modal geometry

- `.nf-settings-modal`: `width: 1180px`, `max-width: 92vw`.
- Height: **820 px**, capped so the footer is always reachable with the current top offset:
  `height: min(820px, calc(100vh - 132px))`. The overlay stays top-anchored (no centering); do not
  change the palette or the other modal overlays.
- `.nf-settings` follows the modal height (`height: 100%`, no second height literal). Header, nav
  and footer stay fixed; only the page body scrolls.

### B. One preview rail for three pages

- Replace the Page-only 258 px rail with **one rail** used by Page, Continuous and Appearance:
  `width: clamp(320px, 34%, 400px)`, same border-left, padding and title/scope structure.
- The rail is a sibling of the page section (where the Page preview already lives). The active page
  decides which preview it renders; the modal never changes width when switching pages.
- Move the Continuous preview out of `ContinuousSettingsPage` and the Appearance preview out of
  `AppearanceSettingsPage` into the rail. Keep their `data-*` hooks:
  `data-continuous-preview`, `data-continuous-preview-stage`, `data-appearance-preview`,
  `data-appearance-preview-code`, etc.
- Continuous preview: fit it to the rail width. The sample stage is 355 px at defaults and up to
  476 px at the caps; wrap it in a scale-to-fit frame (same idea as the Page preview) so it never
  clips. Spacing, corridor and arrow geometry stay exact; only the card widths use the documented
  preview factor.
- Appearance preview in the rail: one column (the current two-column sample grid stacks at rail
  width).
- Keep the existing ≤920 px rule that hides the rail; the Page, Continuous and Appearance pages
  must still work without it (their controls are unaffected).

### C. Page preview: two stacked pages

- In the ready state, render **page 1 and page 2 stacked vertically** (page 1 first), each with its
  own chrome, fragments, edges and trunks from the existing page model/projection; no second
  `usePageModel` pass, no re-pagination.
- Each sheet keeps the A4 aspect ratio and a small muted label above it (`1`, `2`). The region
  label and summary state the page count as today.
- Both sheets fit the rail height at the 820 px modal on a 900 px-tall window without scrolling;
  on shorter windows they scale down uniformly. If the document has one page, show **one** sheet
  (no empty second page). The no-document sample and the empty-document states stay one sheet.
- The invalid/paused overlay still covers the stack; keep `data-page-preview-sheet`,
  `data-page-preview-state`, `data-page-preview-page-count` and the existing test hooks. Add a
  per-sheet index attribute if useful.

### D. Settings nav

- Move Continuous from the **Document** group to the **App** group. Order inside App: General,
  Appearance, Continuous. Page stays the only Document item.

### E. Sidebar icon alignment

- In the expanded and collapsed states, the collapse/expand icon and the Settings gear must keep the
  **same icon centre** and the **same icon size** (15 px). The rail head/foot currently shrink to
  content and are centred, which shifts the icons by ~2 px; the footer padding and a border also
  contribute ~1 px.
- Fix the rail head/foot to full width with the same 8 px inset, match the footer geometry, and keep
  the 28 × 28 collapse button and the 30 × 30 gear box in both states.
- Add a UI assertion that measures the icon centre (the `svg` bounding box) in both states and
  requires a horizontal and vertical difference ≤ 0.5 px for both icons.

## Out of scope

- Continuous arrow colours/widths; the resting edge accent stays as it is.
- Modal centering, if any (explicitly deferred).
- Special text: formulas, code fences, inline code, tables, Markdown copy. Do not touch
  `docs/design/special-text-lab.html`.
- Page/PDF layout, pagination, print model, PageTheme, PageChrome values.
- Settings schema (`settingsVersion` stays 5), document schema, export defaults.
- Any new Settings page or control.

## Files

Read:
- `apps/desktop/src/renderer/src/shell/SettingsDialog.tsx`, `Sidebar.tsx`.
- `apps/desktop/src/renderer/src/settings/ContinuousSettings.tsx`,
  `ContinuousSettingsPreview.tsx`, `AppearanceSettings.tsx`, `PageSettingsPreview.tsx`,
  `page-setup.ts`.
- `apps/desktop/src/renderer/src/styles.css` (settings shell, preview rail, sidebar rail).
- Tests: `tests/ui/r6-continuous-settings.test.mjs`, `tests/ui/ui-batch-a.test.mjs`,
  `tests/ui/ui-batch-b.test.mjs`, `tests/ui/ui-batch-v.test.mjs`,
  `tests/ui/ui-appearance-v3.test.mjs`, `tests/ui/r1b-page-settings.test.mjs`,
  `tests/ui/m4d1-page-density.test.mjs`, `tests/ui/v0-shell-frame.test.mjs`, and the sidebar
  measurements wherever they already live.

Expected to touch: the components and CSS above, their tests, and
`docs/reports/settings-shell-layout.md`.

## Acceptance criteria

- [ ] Settings is 1180 × 820 (capped by the viewport) and the footer is always reachable.
- [ ] Page, Continuous and Appearance all use the same right rail; switching pages never changes
      the modal width.
- [ ] The Continuous preview is visible in the rail while the sliders are in view, updates live,
      and never clips at the default or maximum width caps.
- [ ] The Appearance preview is in the rail and reads as one column.
- [ ] The Page preview shows page 1 and page 2 stacked when the document has ≥2 pages, one sheet
      otherwise; both sheets are fully visible without scrolling at 900 px window height.
- [ ] Continuous is in the App nav group.
- [ ] The sidebar collapse/expand and Settings icons keep the same centre and size across the
      collapsed/expanded states (measured test, ≤ 0.5 px).
- [ ] No schema, Page/PDF geometry, print model, or settings-version change; no fixed sleeps; no
      native dialogs; existing assertions updated, none weakened.

## Tests and evidence

- Targeted: the affected UI suites plus a measure of the modal/rail/icon geometry; one
  `npm run verify:fast`.
- Screenshots in `artifacts/settings-shell/`:
  - 1792 × 1120 dark: Continuous default, Continuous changed, Page with two pages, Appearance.
  - 1440 × 900 dark: Continuous; 1280 × 800 dark: Continuous.
  - light: Continuous and Page.
  - no document open: Continuous.
  - sidebar collapsed and expanded (the icon alignment evidence).
- Report the real timings and the suite counts; state the worktree, branch and head.

## Stop and ask

Stop if two stacked Page previews cannot fit without changing the page model, if moving a preview
into the rail requires changing the settings store, if the sidebar icon change requires new layout
tokens, or if a baseline test fails for an unrelated reason.

## Report format

- Summary mapped to A–E.
- Files changed.
- Checks with real timings.
- Acceptance criteria pass/fail with evidence.
- Open questions / risks.
- Next step (product-owner visual pass, then the special-text batch).
- One commit in the worktree; do not merge or push.
