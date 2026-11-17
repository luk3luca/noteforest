# R3 appearance v3, tab sizing, page-number paper-center, and document status panel — implementation report

**Role:** Builder / Implementer
**Milestone:** UI settings — Wave 3 (shell appearance and status)
**Brief:** `docs/tasks/ui-appearance-v3.md`; design contract `docs/design/color-system.md` (approved 12 November 2026)
**Branch:** `t3/ui-appearance-v3`
**Base:** `94ea3bd` (`main` head)
**Worktree:** `a builder worktree`
**Date:** 12 November 2026

---

## 1. Summary

The R3 batch is implemented as four ordered commits, one per brief section:

1. **`066c36a` — shell color contract + Appearance v3.**
   - `packages/layout/src/appearance.ts` is the single source for the shell appearance: the four
     approved accents (blue, teal, amber, rose) with dark/light `accent`, `strong`, `soft`, `hover`,
     `contrast`; theme/UI-scale/UI-font/code-font types; normalization; and
     `appearanceCssVariables`.
   - Canonical roles (`--bg-app`, `--bg-canvas`, `--bg-sidebar`, `--surface-1/2/3`, `--text-1/2/3`,
     `--border-1/2`, `--accent`, `--accent-strong`, `--accent-soft`, `--accent-hover`,
     `--accent-contrast`, `--accent-ring`, `--edge`, `--edge-active`, `--edge-muted`, `--danger`,
     `--danger-soft`, `--danger-border`, `--success`, `--success-soft`, `--warning`,
     `--warning-soft`, `--warning-border`, `--overlay`, `--shadow-panel`, `--shadow-overlay`) with
     dark and light theme blocks. Every migration alias (`--shell`, `--canvas`, `--sidebar`,
     `--text`, `--text-secondary`, `--text-tertiary`, `--border`, `--border-strong`,
     `--focus-ring`) is a `var()` reference; the Tailwind `--color-*` mapping is the React Aria
     alias set. Components were renamed to the canonical roles.
   - Shell literals removed: the accent primary hover (`#a9c3dc` → `--accent-hover`), the four
     `rgba(155,183,212,…)` overlays (→ `color-mix` on `--accent-strong`), the danger
     overlays (→ `--danger-soft`/`--danger-border`), `#7aa2f7`/`#e08a8a` fallbacks, the modal and
     panel shadows, and the toast shadow.
   - `settingsVersion: 3` with a pure v2 → v3 migration (`appearance` missing → defaults) and an
     appearance write path that preserves unknown top-level, page, and appearance keys.
   - Appearance settings page (App → Appearance): theme segmented, registry swatches
     (`aria-pressed`, selected ring), UI size segmented, UI font select, code font select, a real
     preview strip (surface/text/accent button, ring, selected row, code sample), and Reset
     appearance. It is global, has no document/read-only scope, and works with zero documents.
   - `--ui-scale` is an explicit shell text scale (font-size `calc(px * var(--ui-scale))` in tabs,
     sidebar, toolbar, menus, Settings, palette, dialogs, status, toasts, buttons) — never a
     transform/zoom. Editor content and Page/print sizes are untouched.
   - `--ui-font` drives the shell only. `.nf-page-scope` now uses a fixed `--nf-page-font` stack
     (plus Page-local `--nf-page-focus`, `--nf-page-defect`, `--nf-page-edge-blocked`), so the
     paper never recolors or rescales with the shell.
   - The code font sets `--mono-font` (editor code, Page code, PDF code) and joins the
     page-settings fingerprint: `pageSettingsFingerprint(settings, codeFont)`,
     `computePageModel(..., codeFont)`, `ExportSnapshot.codeFont`, `PrintModelOptions.codeFont`,
     and `PrintModel.codeFont`. A measured run under one code font can no longer be printed with
     another; `PrintDocument` publishes the stack as `--mono-font` on the print root.
2. **`4d43f57` — tab sizing.**
   - Every tab may expand to 220 px (`flex: 1 1000 220px`, `max-width: 220`); inactive tabs shrink
     first to an 80 px floor; the active tab keeps its expanded width
     (`flex: 1 1 220px`, `min-width: 170`) and may shrink to 170 only at the inactive floor.
   - The tablist requests one 220 px slot per visible tab so `+` stays after the last tab; the
     visible-window threshold, overflow menu, ARIA/keyboard, drag reorder, middle-click, and
     context menu are unchanged. Status icons and the close control never shrink.
   - The threshold/constants moved to `lib/tab-policy.ts` with `tabFloorWidth` and
     `visibleTabWindow`; a CSS contract test keeps the stylesheet and the JS on one policy.
3. **`cf735e4` — page-number paper-center.**
   - `pageChromeLayout` exposes `pageNumberShift = (margins.right - margins.left) / 2`; the shared
     `PageChromeView` translates the number by it. Footer text stays left, `data-page-indicator`
     stays on the number, and symmetric margins produce exactly 0 (output unchanged).
4. **`d84638d` — `DocumentStatusPanel`.**
   - One shell component in the main column between `Toolbar` and the canvas panel, for the active
     document only, outside the canvas scroll/zoom surface. Neutral `--surface-1`, `--border-1`,
     radius 8, no left stripe; warning color only on the icon and title.
   - Stale lock: full panel (`role=alert`), lock metadata in a `Details` row, `Take over lock`
     primary, `Cancel` secondary, `Esc` = Cancel. Cancel collapses to a 34 px slim bar ("Read-only ·
     stale lock", Review), per document for the session; a restart shows the full panel. Take over
     succeeds → panel removed, tab lock refreshed, document editable; errors stay visible.
   - Generic read-only: slim bar with the reason and a Details disclosure, no takeover.
   - Focus goes to the primary action once when the state blocks an edit; there is no focus trap;
     the slim bar is `aria-live="polite"`; the appearance animation is removed by reduced motion.
   - The old in-canvas stale-lock/read-only banners and `StaleLockBanner.tsx` are gone; save
     failure and the repair notice stay in the editor; corrupt/missing keep `RecoverySurface`.

`adc9c2c` adds the PDF code-font gate to the R3 suite and updates the UI test docs/README.

No new dependency, no Page/print paper change (only the code font, which the brief allows), no
paginator/print-compositor change beyond the code-font identity.

## 2. Files changed

New:

- `packages/layout/src/appearance.ts`, `packages/layout/test/appearance.test.ts`
- `apps/desktop/src/renderer/src/lib/apply-appearance.ts`
- `apps/desktop/src/renderer/src/shell/useAppearanceSync.ts`
- `apps/desktop/src/renderer/src/settings/AppearanceSettings.tsx`
- `apps/desktop/src/renderer/src/lib/tab-policy.ts`
- `apps/desktop/src/renderer/src/shell/DocumentStatusPanel.tsx`
- `apps/desktop/src/renderer/src/state/document-status.ts`
- `apps/desktop/test/appearance.test.ts`, `appearance-css-guard.test.ts`, `tab-policy.test.ts`
- `tests/ui/ui-appearance-v3.test.mjs`, `tests/ui/ui-document-status.test.mjs`

Modified (main paths):

- `packages/layout/src/page-settings.ts` (`AppSettings.appearance`, fingerprint with code font,
  `normalizeAppSettings`), `packages/layout/src/page-chrome.ts` (`pageNumberShift`),
  `packages/layout/src/index.ts`
- `packages/pdf/src/printModel.ts` (`codeFont` in options/model/identity),
  `packages/pdf/test/print-model.test.ts`, `packages/layout/test/page-chrome.test.ts`
- `apps/desktop/src/shared/settings-file.ts` (v3 migration/write), `shared/export.ts`
  (`ExportSnapshot.codeFont`)
- `apps/desktop/src/renderer/src/styles.css` (theme blocks, aliases, page font, UI scale,
  tab policy, status panel), `main.tsx` (default appearance before first paint),
  `App.tsx` (appearance sync + toast theme + print model identity),
  `state/settings.ts` (appearance patch), `settings/settings-pages.ts`, `settings/AppearanceSettings.tsx`,
  `shell/SettingsDialog.tsx` (Appearance page), `shell/TabBar.tsx`, `shell/Workspace.tsx`,
  `shell/StaleLockBanner.tsx` (deleted), `editor/DocumentEditor.tsx`,
  `page/model.ts`, `page/usePageModel.ts`, `page/PageChromeView.tsx`,
  `print/PrintDocument.tsx`, `print/entry.tsx`, `export-snapshot.ts`
- Tests: `apps/desktop/test/settings.test.ts`, `ui-batch-v-css.test.ts`;
  `tests/ui/suites.mjs`, `tests/ui/README.md`, `tests/ui/ui-batch-v.test.mjs`,
  `tests/ui/ui-batch-a.test.mjs`, `tests/ui/m4e1-settings-platform.test.mjs`,
  `tests/ui/ui-settings-recovery.test.mjs`, `tests/recovery/m2f-recovery.test.mjs`

## 3. Checks (real timings)

| Check | Result |
|---|---|
| `npm run check:boundaries` | ✔ 186 files, 903 imports, 16 rules |
| `npm run typecheck` | exit 0 (desktop node+web, core, layout, pdf) |
| `npx vitest run` | 113 files / **1171 tests** passed, ~3.0 s |
| e2e (`tests/e2e/m2-editor.test.mjs`) | 16 tests passed |
| recovery (`m2f-recovery` + backup-restore) | 14 tests passed |
| UI (`node tests/ui/run.mjs`) | **48/48 suites**, 8 workers, **99.1 s** |
| **`npm run verify`** (final, at head) | **exit 0, 2:50 total** (`/tmp/verify-final2.log`) |

New/affected UI suite timings from the final full run: `ui-appearance-v3` 15.5 s,
`ui-document-status` 11.6 s, `ui-batch-v` 25.3 s, `ui-batch-a` 22.2 s, `m4e1-settings-platform`
14.0 s, `ui-settings-recovery` 11.6 s, `m2-shell` 13.9 s, `m4c1` 12.6 s, `m4c2` 21.3 s,
`m4c3-pdf-gate` 30.7 s, `m4c3-packaged` 2.3 s, `m4d1` 20.8 s, `m4d2` 24.1 s, `r1b` 12.8 s. No fixed sleeps were added;
every wait is a condition, and the suites ran at the default pool.

Screenshots/evidence (in `artifacts/`):

- `ui-appearance-v3/`: `appearance-dark-blue.png`, `appearance-light-blue.png`,
  `appearance-light-amber.png`, `appearance-scale-serif.png`, `appearance-no-document.png`,
  `paper-baseline-dark.png`, `paper-light-rose.png`, `paper-system-mono.png`,
  `page-number-read-asymmetric.png`, `page-number-edit-asymmetric.png`,
  `page-number-preview-asymmetric.png`; `export/page-number-evidence.json` and
  `export/pdf-code-font-evidence.json` (baseline → shell-changed → code-changed PDF summaries).
- `ui-document-status/`: `read-only-slim.png`, `stale-lock-full.png`, `stale-lock-taken-over.png`.
- `ui-batch-v/`: `tabs-2.png`, `tabs-4.png`, `tabs-8.png`, `tabs-14.png`.

## 4. Acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| Canonical shell tokens + `var()` aliases; no shell hex/rgba outside the theme/Page blocks; dark look preserved except the stronger accent | **PASS** | `appearance-css-guard.test.ts` (literal scan, alias values, derived ring roles, no accent literal in CSS); `ui-batch-v` toast/settings guards |
| Dark/light/system + four accents; swatches/preview update immediately; persistence across quit/reopen; old settings load with defaults; `settingsVersion: 3` | **PASS** | `settings.test.ts` (v2→v3, unknown fields, unknown accent), `appearance.test.ts`, `ui-appearance-v3` test 1 (persist + relaunch, settings.json v3) |
| UI scale changes shell chrome text, not Page/PDF body size; UI font changes shell only; paper unchanged by theme/accent/uiFont/uiScale | **PASS** | `ui-appearance-v3` tests 1–3 (computed tab/sidebar/page sizes, paper snapshot deep-equal), PDF test 4 (`shellChanged` deep-equals baseline) |
| Code font changes editor + Page/PDF code; identity includes it; real PDF passes the font/text gate | **PASS** | `print-model.test.ts` (mismatched code font throws), `ui-appearance-v3` test 4 (3 real exports: same text/size/page count across shell change, different embedded fonts with System Mono, no JetBrains, 0 missing glyphs) |
| Tabs expanded when space allows; inactive shrink first; active at 220 until the floor; overflow threshold unchanged; no horizontal scroll; stable status icons; overflow lists all | **PASS** | `tab-policy.test.ts` (CSS contract + window thresholds), `ui-batch-v` tab test at 2/4/8/14 tabs (220/220/shrunk-active-220/windowed, + after last, menu lists all) |
| Page number centered on the paper with asymmetric margins; symmetric unchanged; Page/PDF parity | **PASS** | `page-chrome.test.ts` (shift sign, band + shift = paper center), `ui-appearance-v3` test 3 (Read/Edit/preview within 1 px / 0.6 %, PDF within 2 mm of page center) |
| Status panel between Toolbar and canvas; full→slim, Review, Take over, generic read-only, canvas reflow; corrupt/missing keep RecoverySurface; no pageErrors | **PASS** | `ui-document-status` (placement, reflow, per-document Cancel, restart, reduced motion, no focus trap, take over + save), `m2f-recovery` (Esc = Cancel, slim bar, metadata Details, take over) |
| Guards: accent completeness/contrast, shell text contrast, CSS literal scan, paper isolation | **PASS** | `appearance.test.ts` (4 accents × 2 themes: text on accent/hover/strong ≥ 4.5, ring/border ≥ 3 on every surface), `appearance-css-guard.test.ts` (`text-1/2/3` ≥ 4.5 on all six shell surfaces in both themes; light `text-3` lighter than `text-2`), `ui-appearance-v3` paper/PDF tests |
| `npm run verify` exit 0 with real timings; all UI suites at the default pool | **PASS** | exit 0, 2:50; UI 48/48 at concurrency 8 |

## 5. Deviations and decisions inside the brief

- **`--shadow-overlay` value.** The design block lists `0 18px 48px rgb(0 0 0 / 0.45)`, but the
  accepted dialog shadow is `0 24px 64px rgb(0 0 0 / 0.55)`. The brief requires the dark look to
  be preserved, so the token carries the current value. Menu/bubble/panel shadows match the
  design's `--shadow-panel` exactly.
- **`--shadow-toast` added to the token set.** The Batch V toast shadow
  (`0 12px 32px rgb(0 0 0 / 0.45)`) is a distinct accepted look; instead of changing it or leaving
  a literal, it is one extra role with one meaning (design §1.5 allows more roles, not
  duplicates).
- **Page-local interaction colors.** The paper now owns `--nf-page-focus`, `--nf-page-defect`, and
  `--nf-page-edge-blocked` in its skin block, so selection/focus/caret/defect marks keep the same
  light-skin values under any shell theme or accent (design §6 "theme switch renders the same
  Page"). Page-view chrome (counter, banners, stage background) still uses shell roles because it
  is chrome around the paper, not the paper.
- **Page number shift sign.** The band center is off by `(left - right)/2`, so the correction is
  `(right - left)/2`; the field is named `pageNumberShift` and the unit test asserts
  `bandCenter + shift == pageWidth/2`.
- **UI scale surface set.** Font sizes were converted to `calc(px * var(--ui-scale))` across the
  named surfaces plus buttons, dialogs, recovery, export, status, and toasts — all shell chrome.
  The Continuous editor body, chapter titles, callouts, images, and the whole Page/print skin were
  deliberately left in fixed px. This is an explicit shell type scale, not a global transform.
- **Tab flex-shrink weighting.** Inactive tabs use `flex-shrink: 1000` vs the active `1`, so the
  active tab stays visually at 220 until the inactive floor is reached (within a fraction of a
  pixel) before absorbing the remaining shrink to 170.
- **Focus on mount.** The stale-lock panel focuses `Take over lock` once per document (it starts
  blocking an edit); later Review reopens do not steal focus. `Esc` works while focus is inside the
  panel; the panel is not a modal and has no trap.

## 6. Open questions / risks

- **Product-owner visual check.** The batch needs a human dark/light pass (accent strength,
  light-theme contrast feel, slim-bar placement) and the existing PDF visual check.
- **Light theme body text (resolved in the correction commit).** The brief's contrast gate covers
  accent text (≥ 4.5) and focus/control borders (≥ 3); the first pass left `--text-3` at `#6f7c86`
  (~4.28:1 on white). It is now `#5f6b75`, which meets 4.5:1 on every shell surface (5.46 canvas,
  5.00 bg-app, 4.99 surface-2, 4.81 bg-sidebar, 4.63 surface-3) while staying lighter than
  `--text-2` (`#4d5a63`). A unit test now covers `text-1/2/3` against all six shell surfaces in
  both themes.
- **`settingsVersion: 3` migration message.** Every v2 file now reports "Settings were upgraded to
  the current format" once. That is correct but a user-visible notice; the Sentinel may want to
  confirm the copy.
- **Code font metrics.** System Mono may reflow code-heavy documents (page count can change). The
  gate records text/size/page counts for the fixture; a 50-page code document is not re-run here
  (out of timebox, not a contract change).
- **Tab width at medium counts.** At 8 tabs the inactive tabs land around 122 px and the active at
  220; at the 14-tab window the actual widths can sit just above the 80 px floor because the
  window is chosen from floor widths. The exact widths depend on the window, so the tests assert
  ranges and ordering, not a single number.
- **Windows/Linux fonts.** `ui-serif`/`ui-monospace` resolve to platform fonts; the tests run on
  macOS and assert stack families, not glyph metrics.

## 7. Integration

- Fast-forward into `main` from `94ea3bd` to `d276353`.
- Full `npm run verify` on `main` at `d276353`: **exit 0, 174.91 s** — 113 unit files / 1173
  tests, 16/16 e2e, 14/14 recovery, **48/48 UI** at the default pool, 0 pageErrors.
- The light `--text-3` correction is included (`#5f6b75`, 4.63:1 on `surface-3`), with the
  text-role contrast guard.
- Next: Page edge geometry (gap consistency across right/below/callout and density), then R4 Export
  defaults; the product-owner dark/light and PDF visual pass remains open.

## 8. Next suggested step

Run the targeted R3 Sentinel against `docs/tasks/ui-appearance-v3.md` and
`docs/design/color-system.md`, then the product-owner dark/light and PDF visual pass. After
acceptance, the planned Phase 3 no-op Page/print `--paper-*` alignment can start; the settings
sequence then continues with the remaining planned pages (Export defaults, Continuous global,
manual breaks, Data recovery/library) as decided by the orchestrator.
