# R3 — Appearance v3, color contract, tab sizing, page-number centering, document status panel

**Role:** Implementer / Builder
**Milestone:** UI settings — Wave 3 (shell appearance and status)
**Base:** `main` at the commit that adds this brief (`bf92f78` plus the brief commit)
**Worktree:** created by the delegate from that base; do not work in the main checkout
**Timebox:** 7 hours

## Context

`docs/design/color-system.md` (approved 12 November 2026) freezes the shell color contract, the
accent registry, the Page/print boundary, and the `DocumentStatusPanel` pattern. This batch implements
that contract, the Appearance settings page, and three small shell fixes already agreed with the
product owner:

- tabs expand while there is space, then inactive tabs shrink before overflow;
- the page number is centered on the paper, not only on the text band;
- the stale-lock / read-only banner becomes a detached status panel between the toolbar and the
  canvas.

The Page/print token namespace (`--paper-*`) is **not** in this batch; it is a later visual no-op.

## Goal

One worktree, four ordered commits: the shell color contract and Appearance v3, tab sizing, the
page-number paper-center, and the `DocumentStatusPanel` for stale-lock/read-only. One full verify at
the end.

## Commit order

1. **Color contract + Appearance v3** (largest).
2. **Tab sizing**.
3. **Page-number paper-center**.
4. **DocumentStatusPanel** (stale lock + read-only only).

Do not reorder: the small fixes are independent, and the panel consumes the new status tokens. If a
later commit cannot be completed, stop and report rather than merging a partial batch.

## In scope

### 1. Shell color contract (commit 1)

Adopt `docs/design/color-system.md` §3:

- Canonical roles: `--bg-app`, `--bg-canvas`, `--bg-sidebar`, `--surface-1/2/3`, `--text-1/2/3`,
  `--border-1/2`, `--accent`, `--accent-strong`, `--accent-soft`, `--accent-hover`,
  `--accent-contrast`, `--accent-ring`, `--edge`, `--edge-active`, `--edge-muted`, `--danger`,
  `--danger-soft`, `--danger-border`, `--success`, `--success-soft`, `--warning`, `--warning-soft`,
  `--warning-border`, `--overlay`, `--shadow-panel`, `--shadow-overlay`.
- Keep migration aliases for one release: `--shell` → `--bg-app`, `--canvas` → `--bg-canvas`,
  `--sidebar` → `--bg-sidebar`, `--text` → `--text-1`, `--text-secondary` → `--text-2`,
  `--text-tertiary` → `--text-3`, `--border` → `--border-1`, `--border-strong` → `--border-2`,
  `--focus-ring` → `--accent-ring`, and the 11 `--color-*` React Aria aliases. Aliases must be
  `var()` references, never duplicated values.
- `--edge-active` = `var(--accent-strong)`; `--accent-ring` = `var(--accent-strong)`; `--focus-ring` =
  `var(--accent-ring)`.
- Replace shell literals: `#a9c3dc` → `--accent-hover`; the four `rgba(155,183,212,…)` accent
  overlays → `--accent-ring`/`--accent-soft`; `rgba(217,139,139,…)` → `--danger-soft`/
  `--danger-border`; `#7aa2f7` and `#e08a8a` fallbacks removed; overlay/shadows → tokens.
- Dark values preserve the current look; the only intended visual change is a stronger selection/
  focus/active-edge accent (`--accent-strong`). Light values follow §3.3; adjust only if the contrast
  test fails.
- Theme application: `html[data-theme="dark"|"light"]`, `system` resolved from
  `prefers-color-scheme` and updated on change. Apply before/at bootstrap; no flash is acceptable only
  if it is not user-visible in the tests.
- **Paper isolation:** the Page and PDF must not change with theme, accent, `uiScale`, or `uiFont`.
  Audit `.nf-page-scope` and print CSS; the Page font stack is the Page theme, not `--ui-font`. Code
  font is the only appearance value that reaches Page/PDF (§4).

### 2. Accent registry and Appearance settings (commit 1)

- `ACCENTS` registry with the four initial sets from `color-system.md` §4 (blue, teal, amber, rose),
  each with dark/light `accent`, `strong`, `soft`, `hover`, `contrast`. Unknown id → blue.
- Pure `shared/appearance.ts` (or equivalent) types:
  `theme: 'dark'|'light'|'system'`, `accent: string`, `uiScale: 0.9|1|1.1`,
  `uiFont: 'system'|'serif'`, `codeFont: 'jetbrains'|'system-mono'`; defaults dark, blue, 1, system,
  jetbrains.
- `settingsVersion: 3` with a pure v2 → v3 migration: a missing `appearance` normalizes to defaults,
  unknown fields survive, old files load. `settingsDocumentForWrite` writes the appearance namespace.
  No schema beyond v3; no per-document appearance override.
- Appearance page (App group) with: theme segmented, accent swatches (registry-driven, `aria-pressed`,
  selected ring), UI size segmented, UI font select, code font select, a compact preview strip
  (surface/text/accent/code), and Reset appearance. No fake controls. Appearance is global and works
  with zero documents; no document/read-only scope.
- Apply theme/accent/scale/fonts on bootstrap and on change. The preview and the shell update
  immediately; the footer save state follows the existing instant-save path.

### 3. UI scale and fonts (commit 1)

- `uiScale` changes shell chrome text only. Use a `--ui-scale` token and a small, explicit shell text
  scale; do not use a global `transform`/`zoom`. Tabs, sidebar, toolbar, menus, Settings labels, and
  command palette must visibly scale; Page/PDF content size must not.
- `uiFont` sets `--ui-font` (system or system serif). Page/PDF must keep their Page font.
- `codeFont` sets `--mono-font` for editor code and Page code/PDF. The print/measure identity must
  include the code font so a stale measured run cannot print a different font; extend the existing
  print-model/export identity if needed. PDF gate: export a document with code and verify real text
  and the chosen font family; Page count must not change for the same page settings unless the font
  metrics genuinely change (then the gate records it).
- Do not add a bundled font; JetBrains Mono is already present.

### 4. Tab sizing (commit 2)

- All tabs may expand up to 220 px when space allows; inactive tabs are not fixed at 96 px anymore.
- As tabs are added, **inactive tabs shrink first**, from 220 toward 80; the active tab stays at 220
  and may shrink to 170 only when the inactive tabs are already at the floor.
- When the active 170 + inactive 80 floors do not fit, the existing visible window + overflow menu
  behavior starts. Overflow threshold must match today (same floor widths); no horizontal scroll.
- Status icons (`!`, lock, dirty) never shrink; `+` stays after the last visible tab; drag reorder,
  keyboard/ARIA, middle-click, context menu and the overflow menu list every tab.
- Update `ui-batch-v` expectations (2/4/8/14 tabs) and add assertions that all tabs are expanded when
  space allows and that inactive tabs shrink before overflow. Update `tests/ui/README.md` if the tab
  policy text changes.

### 5. Page-number paper-center (commit 3)

- The number is centered on the **paper**, not only on the content band: offset by
  `(margins.left − margins.right) / 2`. With symmetric margins the output is unchanged.
- Footer text stays left; the number keeps `data-page-indicator`; `pageChromeLayout` geometry is not
  otherwise changed.
- Test with asymmetric margins: the number center equals the page center within tolerance in Page
  Read, Page Edit, the preview, and the PDF. Update any chrome geometry assertions.

### 6. `DocumentStatusPanel` (commit 4)

Implement `docs/design/color-system.md` §5, limited to **stale lock and generic read-only**:

- New shell component rendered in the main column between `Toolbar` and the canvas panel, for the
  active document only. Not inside the canvas scroll/zoom surface. The canvas reflows when it appears
  or disappears.
- Stale lock: neutral `--surface-1` panel, `--border-1`, radius 8, warning icon + title, body,
  lock metadata in a secondary row/`Details`, actions right. "Take over lock" primary; "Cancel"
  collapses to a 34 px slim bar with the lock icon, "Read-only · stale lock", "Review". Review
  reopens the full panel. Take over succeeds/dismisses; errors stay visible.
- Generic read-only (no stale lock): slim bar with the reason and Details; no takeover.
- Remove the stale-lock and read-only banners from `DocumentEditor`; leave save-failure and repair
  notices where they are (out of scope). Keep the lock/takeover runtime APIs.
- Corrupt/missing documents keep the existing `RecoverySurface`; do not add a new corrupt panel.
- `role="alert"` on appearance, `aria-live` on the slim bar, `Esc` = Cancel, no focus trap; focus the
  primary action only when the state blocks an edit. Reduced motion: no height animation.
- Cancel state is per document for the session; returning to that tab keeps the slim bar. A restart
  shows the full panel.
- Update `tests/recovery/m2f-recovery.test.mjs` for the new hooks and add a UI/status regression for
  placement, full→slim, Review, Take over, generic read-only, and canvas reflow. Register any new UI
  suite in `tests/ui/suites.mjs`.

### 7. Tests, guards, evidence

- Unit: appearance defaults/migration/normalization; accent registry completeness + contrast
  (text on accent ≥ 4.5:1; focus/control borders ≥ 3:1); CSS literal guard (no hex/rgba outside
  theme/accent/Page/print blocks); code-font identity; tab width policy; page-number offset.
- UI: Appearance controls and persistence, dark/light/system (emulated media), accent switching,
  UI scale/font, code font, paper isolation (theme/accent do not change Page/PDF), tabs, page number,
  status panel.
- PDF: `m4c1`/`m4c2`/`m4c3`; a real exported PDF with code in both code fonts; theme/accent/UI font
  change leaves the PDF text/size/font unchanged except code font.
- Screenshots: Appearance dark/light/accent/scale, status panel full/slim, tabs 2/4/8/14, page number
  with asymmetric margins.
- One full `npm run verify` at the end; no fixed sleeps, no native dialogs, no weakened assertions.

## Out of scope

- Page/print `--paper-*` token alignment (later, visual no-op with PDF parity).
- Corrupt/missing status panel; save-failure/repair banner relocation.
- Palette research, full theme packs, Page font, per-document appearance.
- Export defaults, Continuous global, library/backup, manual breaks.
- Any paginator/print-compositor change beyond the code-font identity and the existing chrome.
- New dependencies; schema beyond `settingsVersion: 3`; decorative color beyond the design.

## Files

Read:
- `docs/design/color-system.md`; `docs/design/ui-settings-contents.md` §3; `docs/design-tokens*.md`.
- `apps/desktop/src/renderer/src/styles.css`, `lib/design-tokens.ts`,
  `settings/apply-design-tokens.ts` (or equivalent), `settings/settings-pages.ts`,
  `shell/SettingsDialog.tsx`, `shell/TabBar.tsx`, `shell/Workspace.tsx`,
  `editor/DocumentEditor.tsx`, `shell/StaleLockBanner.tsx`, `shell/RecoverySurface.tsx`,
  `page/PageChromeView.tsx`, `print/PrintDocument.tsx`, `print/print.css`.
- `apps/desktop/src/shared/settings-file.ts`, `shared/api.ts`, `shared/document-settings.ts`,
  `state/settings.ts`, `main/library.ts`, `main/index.ts`, `preload/index.ts`,
  `renderer/src/global.d.ts`.
- `packages/pdf/src/printModel.ts`, `packages/layout/src/page-chrome.ts`,
  `packages/layout/src/page-settings.ts` (only chrome/identity touch points).
- Tests: `apps/desktop/test/settings*.test.ts`, `design-tokens-css.test.ts`,
  `print-parity.test.ts`, `export-snapshot.test.ts`, `ui-suite-list.test.ts`;
  `tests/ui/ui-batch-v`, `m2-shell`, `m4b1-page-view`, `m4b1b1-page-edit-overlay`,
  `m4c1`–`m4c3`, `m4d2`, `ui-batch-a`, `ui-batch-b`, `tests/recovery/m2f-recovery.test.mjs`.

Expected to touch:
- The shell/Settings/appearance/settings-file/print-identity files above, their unit tests, affected
  UI suites, `tests/ui/suites.mjs` if a suite is added, and
  `docs/reports/ui-appearance-v3.md`.

## Acceptance criteria

- [ ] Canonical shell tokens + aliases; no shell hex/rgba outside the token/theme/accent blocks;
      dark look preserved except the stronger selection/focus/active-edge accent.
- [ ] Dark/light/system themes and four accents work; swatches and preview update immediately;
      persistence survives quit/reopen; old settings load with defaults; `settingsVersion: 3`.
- [ ] UI scale changes shell chrome text (tabs/sidebar/toolbar/menus/Settings) but not Page/PDF body
      size; UI font changes shell only; Page/PDF paper is unchanged by theme/accent/uiFont/uiScale.
- [ ] Code font changes editor and Page/PDF code; the print/measure identity includes it; a real PDF
      with code passes the font/text gate.
- [ ] Tabs: all expanded when space allows; inactive shrink first; active stays expanded until the
      floor; overflow threshold unchanged; no horizontal scroll; status icons stable; overflow lists
      all tabs.
- [ ] Page number centered on the paper with asymmetric margins; symmetric output unchanged; Page/PDF
      parity.
- [ ] Status panel sits between toolbar and canvas; stale-lock full panel, Cancel → slim bar, Review,
      Take over, generic read-only slim bar; canvas reflows; corrupt/missing still use RecoverySurface;
      recovery tests updated; no pageErrors.
- [ ] Guards: accent completeness/contrast, CSS literal scan, paper isolation.
- [ ] `npm run verify` exit 0 with real timings; all UI suites at the default pool.

## Tests and evidence

- Targeted while working: appearance/settings unit files, the new Appearance UI suite, recovery
  stale-lock suite, `ui-batch-v`, `m4b1*`, `m4c1`–`m4c3`, typecheck/boundaries.
- End of task: one full `npm run verify` (~3–4 min with the new suites).
- Screenshots/PDF as above; put evidence in each suite's own `artifacts/<suite>` directory.

## Stop and ask

Stop and report when:

- the code-font identity requires a wider print-model/export contract than the existing identity path;
- the light/accent contrast cannot meet the thresholds without changing the proposed palette in a
  product-visible way;
- the UI scale requires a broad shell typography refactor beyond the named surfaces;
- the status panel requires corrupt/missing integration or save-failure relocation (out of scope);
- a baseline test fails for an unrelated reason.

## Report format

- Summary mapped to the four commits and the design contract.
- Files changed.
- Checks with real timings and suite counts.
- Acceptance criteria pass/fail with test/evidence.
- Open questions / risks.
- Next suggested step.

Commit in the worktree; do not merge or push.
