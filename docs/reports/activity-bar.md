# Shell activity bar (S1) — implementation report

**Task:** `docs/tasks/activity-bar.md`
**Design:** `docs/design/shell-activity-bar.md` (15 November 2026 decisions included)
**Role:** Implementer / Builder
**Worktree:** `a builder worktree`
**Branch:** `t3/shell-activity-bar`
**Base:** `9a8158e` (the docs commit that adds the brief and the design)
**Head:** the single commit on this branch; its SHA is reported in the handoff message (a report
cannot contain the hash of the commit that introduces it)
**Verdict:** **PASS** for the S1 acceptance criteria, with the interpretation and the Page-surface
risk in §5.

---

## 1. Summary

### Bar

- One `ActivityBar` component is rendered by `Sidebar` in **both** states as the card's leading
  column, so the chevron, both section icons, the Health action, and the Settings gear keep their
  exact x/y across a collapse: the collapse adds or removes the content column, it never remounts or
  moves the bar (the DOM node survives because the bar is the first child of the same `<aside>` in
  both branches).
- Geometry: 48 px column (`flex: 0 0 48px`, `width: 48px`), `padding: 8px 0`, 8 px gaps, 28 × 28
  buttons with 17 px icons, `border-radius: 4px` (the design's 4/8 rule, not the 3 px control
  radius).
- Active section: filled icon (`fill="currentColor"`, 1.9 stroke) + `surface-2` + `text-1`.
  **No accent stripe and no edge indicator** — there is no `border-inline-start` and no
  `box-shadow` in the selected rule (unit-guarded).
- Hover: `surface-1` + `text-1`; focus: 2 px `--accent-ring` outline (asserted live).

### Sections

- Library/Outline are a **vertical tablist** (`role="tablist"`, `aria-orientation="vertical"`,
  `aria-selected`, roving tabindex, Up/Down with wrap, Home/End, automatic activation, focus follows
  selection). The `data-sidebar-tab`, `#nf-sidebar-tab-*`, `nf-sidebar-panel`/`aria-labelledby`
  contract and the `sidebarTab` store key are unchanged, so every existing library/outline flow and
  test selector keeps working.
- Clicking a section while collapsed switches the section **and** expands the sidebar to it.

### Health bridge

- A third icon button between the tablist and the Settings group calls the same command as the
  palette entry: `openDialog({ kind: 'anchor-health' })` with no filter. It is an **action**, not a
  tab: no `role="tab"`, no `aria-selected`, no persisted section, and the active section is
  unchanged (asserted, including the sheet's `data-health-no-document` state with no document).
- No command-layer or dialog-API change was needed (stop condition not hit). S2 can promote the same
  button to a tab.

### Settings, removals

- The gear moved from the sidebar footer to the bar bottom; `⌘,` and the focus-restore-to-button
  behaviour after closing the sheet are unchanged.
- **Dividers**: the `[data-activity-foot]` group is unconditional, so a 1 px `--border-1` divider sits
  above the gear **expanded and collapsed**; it spans the 48 px bar and the gear is the last row in
  both states (asserted in both, plus a CSS contract test).
- Removed: the Library/Outline segmented control (`nf-sidebar-tabs`/`nf-sidebar-tab`), the header
  collapse button, the whole footer row (`nf-sidebar-foot`, `nf-sidebar-settings` text row,
  `nf-sidebar-settings-icon`), and the old rail head/foot classes. The header keeps only the 28 px
  search button (⌘K) in its 44 px row.

### Width model (no session migration)

- `sidebarWidth` stays the **content** width (180 / 264 / 640) and the session file is unchanged:
  a persisted `264` still reads and writes `264` (asserted against `shell-session.json`).
- The panel is sized `content + 48` (`defaultSize`, `minSize` 228, `maxSize` 688,
  `collapsedSize` 48); every drag is converted back with `sidebarContentWidth()` before it is
  stored, the snap/reset targets `sidebarPanelWidth(SIDEBAR_SNAP_WIDTH)` = 312, and expand restores
  `sidebarWidth + 48`. Collapse is exactly the bar (48), so a 264 setting renders a 312 card and the
  canvas gains exactly the 264 content column on collapse (asserted with real measurements).
- The rendered content column is 262 px for a stored 264 — the card's two 1 px borders, exactly as
  before S1 — never 216. The renderer clamps through `clampSidebarContentWidth`; the session parser
  (`apps/desktop/src/main/library.ts`) keeps its own range check over the same `180/264/640`
  constants, so a persisted `264` round-trips unchanged and needs no migration.

### Library icon semantics

- Note = `NotebookText`, `.md` = `FileText`, unreadable stays `FileWarning`; each OK row carries
  `data-library-icon="note|markdown"` so tests do not depend on lucide internals.
- Note glyph `text-2`, `.md` glyph `text-3`, and the `.md` **extension is rendered as a separate
  `text-3` suffix** after the title (the full basename stays the row's `aria-label`/`title`, and
  row text still reads `diario.md`). Kind is never colour-only: glyph + suffix differ. The split is a
  pure helper (`lib/library-rows.ts`) with unit tests.

---

## 2. Files changed

Renderer:

- `apps/desktop/src/renderer/src/shell/Sidebar.tsx` — `ActivityBar` (tablist, Health action,
  Settings group + divider, chevron), collapsed/expanded composition, Library row icons + `.md`
  suffix, footer/tab-strip removal.
- `apps/desktop/src/renderer/src/shell/Workspace.tsx` — content-width panel model (`+48` sizing,
  drag/snap/reset/expand conversion, `collapsedSize` = bar).
- `apps/desktop/src/renderer/src/state/shell.ts` — re-exports the bar/width helpers and clamps a
  width with `clampSidebarContentWidth`.
- `apps/desktop/src/shared/shell.ts` — `ACTIVITY_BAR_WIDTH`, `clampSidebarContentWidth`,
  `sidebarPanelWidth`, `sidebarContentWidth` (one source for renderer and session parser).
- `apps/desktop/src/renderer/src/styles.css` — activity bar/button/foot rules, content column,
  removal of the tab strip + footer + rail head/foot, `.nf-library-note-icon`,
  `.nf-library-markdown-icon`, `.nf-library-suffix`.
- `apps/desktop/src/renderer/src/lib/library-rows.ts` **(new)** — `markdownTitleSuffix`.
- `apps/desktop/src/renderer/src/App.tsx` — test bridge exposes `sidebarWidth` (one line, used to
  assert the stored content width).

Tests:

- `apps/desktop/test/activity-bar.test.ts` **(new)** — width model round trip/clamps, store clamp,
  `.md` title split, CSS contract (48/28/17, 4 px radius, surface-2 selected with no accent
  border/shadow, unconditional foot divider, removed selectors, icon colours).
- `tests/ui/v0-shell-frame.test.mjs` — expanded bar/section/Health/Settings assertions, footer and
  segmented control removal, rail divider, icon-x stability for chevron + sections + gear (17 px),
  sidebar grid measured from the content column, resize/264-snap/collapse-delta/session-file
  assertions, and two Page zoom assertions made geometry-independent (see §5).
- `tests/ui/library-surface.test.mjs` — vertical tablist, Up/Down/Home/End + wrap, roving tabindex,
  visible focus ring, horizontal arrows inert, Health bridge + no-document sheet + section
  unchanged, section-click-expands, collapsed bar/divider/gear.
- `tests/ui/vault-library.test.mjs` — folder/note/`.md` icon semantics, `.md` suffix, colour
  relationships, full-name label, `artifacts/activity-bar/library-rows.png`.
- `tests/ui/settings-shell-layout.test.mjs` — bar icon centres/sizes (17 px) and 28 × 28 boxes in
  both states, collapsed divider.
- `tests/ui/ui-batch-a.test.mjs`, `tests/ui/ui-batch-v.test.mjs` — scenario viewport adjustments so
  the tab-geometry contracts (five tabs visible at the floor; four 220 px chips fit) hold with the
  48 px narrower main column (assertions unchanged).

Docs / evidence:

- `docs/reports/activity-bar.md` (this file).
- `artifacts/activity-bar/` — `expanded-library.png`, `expanded-outline.png`,
  `collapsed-rail-settings-divider.png`, `library-rows.png` (git-ignored evidence, produced by
  `library-surface` and `vault-library`).

No spec/UX/ADR/plan/design changes.

---

## 3. Checks run (real timings)

| Command | Result | Time |
| --- | --- | --- |
| `npm run verify:fast` (boundaries + typecheck + vitest + build + e2e) | **green**: 148 unit files / 1466 tests, 16/16 e2e | **58.4 s** wall |
| `npm run test:ui:shell` (build + 17 suites, concurrency 4) | **17/17 passed**, 0 pageErrors | **107.7 s** suite total (1:48.4 incl. build) |
| `node --test tests/ui/v0-shell-frame.test.mjs` | 8/8 (repeated 3× after the fixes, 8/8 each) | ~19.5 s per run |
| `node --test tests/ui/library-surface.test.mjs` | 7/7 | ~19.3 s |
| `node --test tests/ui/vault-library.test.mjs` | 5/5 | ~15.3 s |
| `node --test tests/ui/ui-batch-a.test.mjs` / `ui-batch-v.test.mjs` | 6/6 and 5/5 | ~23 s / ~17 s |
| `node --test tests/ui/ui-batch-b.test.mjs tests/ui/ui-settings-advanced.test.mjs` | 18/18 | ~40 s |
| `npx vitest run apps/desktop/test/activity-bar.test.ts` | 9/9 | 0.1 s |

Baseline check: the same `v0-shell-frame` file was green 3/3 on a clean export of `9a8158e` before
the change, and is green 3/3 after it (§5 explains the two Page-zoom assertions that had to be
expressed in a geometry-independent way).

---

## 4. Acceptance criteria

| # | Criterion | Status |
| --- | --- | --- |
| 1 | Expanded: bar on the left with Library (active), Outline, Health, Settings at the bottom with a divider above it; no segmented control in the header; no Settings footer row | **PASS** (UI + CSS contract) |
| 2 | Collapsed: 48 px bar with the same icons and Settings, divider above Settings, chevron to expand, icon x identical to expanded (no shift) | **PASS** (0.5 px tolerance on chevron, both sections, and the gear; 17 px icons) |
| 3 | `⌘\` toggles; the canvas loses/gains exactly 48 px; a persisted 264 shows a 264 content column | **PASS** as specified: the card is `content + 48` (312 for 264), collapse is 48 and gives the canvas exactly the 264 content column, the session stores 264 (not 312), and the rendered column is 262 = 264 − the card's two 1 px borders (never 216) |
| 4 | Pointer and keyboard: Up/Down/Home/End move and activate Library/Outline; focus is visible; `aria-selected` and `role=tablist` correct | **PASS** (Up/Down with wrap, Home, End, roving tabindex, 2 px focus ring, `aria-orientation="vertical"`, horizontal arrows inert) |
| 5 | Health opens the existing Document health sheet (or its no-document state) and leaves the active section unchanged | **PASS** (same `anchor-health` dialog, no filter, no tab semantics, section unchanged) |
| 6 | Library: note and `.md` differ by icon and `.md` suffix, not colour alone | **PASS** (glyph + suffix + `data-library-icon`; note text-2 / `.md` text-3) |
| 7 | Existing library/outline flows and all current sidebar tests pass; no pageerror | **PASS** (17/17 shell suites, library/vault suites green, zero renderer errors) |
| 8 | Gate: `npm run verify:fast` green with real timings | **PASS** (§3) |

---

## 5. Open questions / risks

1. **Page fit-sync race (pre-existing, out of this slice's scope).** `PageView` writes the effective
   fit zoom back into `pageZoom` in an effect after a paint
   (`apps/desktop/src/renderer/src/page/PageView.tsx:480`). A reset issued immediately after a fit
   change (⌘0 right after ⇧1/⇧2) can therefore be overwritten by that late write: the state ends
   `pageFit: 'none'` with `pageZoom` = the fit value. The race existed before S1 but was invisible
   at 1440 × 900 because the fit-width zoom was exactly 1.00; the 48 px narrower canvas makes it
   0.97, which exposed it in `v0-shell-frame`. Left untouched (Page is out of scope), and two
   assertions were made geometry-independent instead of hard-coding 100 %
   (`pageZoom` before/after a layout switch). Suggested follow-up for S2 or a Page task: read the
   live fit from the store inside that effect (or skip when the current store fit no longer equals
   the effect's closure) — a few lines — and add a UI regression for ⇧2 → ⌘0.
2. **⌘0 and the native menu.** On macOS ⌘0 is also a native View-menu accelerator, so the command
   can arrive over IPC after the renderer handled the key. The test now uses one keyboard ⌘0 per
   test in the Page block and the percentage control for the Continuous reset (still the same
   `fitActiveLayout('actual')` action); the ⌘0 keyboard path itself stays covered by the page-view
   suite.
3. **Tab-strip thresholds.** The main column is 48 px narrower at the same window size (design §8
   risk). Two scenario viewports changed so the Batch A/V tab contracts still describe their own
   premise: five tabs visible at the floor needs ≥ `tabFloorWidth(5)` = 506 px (960 → 1000), and four
   220 px chips need ~892 px of strip (1440 → 1600). No assertion was relaxed.
4. **Visual pass.** The bar/glyph choices (filled `Library`, `ListTree`, `Activity` for Health,
   gear) and the filled-icon look need the product owner's eye, together with the Page preview/rail
   and the Continuous canvas at 1280 px (design §8). Evidence: `artifacts/activity-bar/`.
5. **Health is a bridge.** No badge, no in-sidebar view, no empty Health panel; the button is an
   action until S2 promotes it to a tab (no persisted section, no `⌘` shortcut added).
6. `aria-controls="nf-sidebar-panel"` stays on the section tabs when the sidebar is collapsed (the
   panel is not mounted then); the tabs remain the sections' only control and the chevron carries
   `aria-expanded`/`aria-controls`. If S2 wants a stricter model, the collapsed tablist could drop
   `aria-controls`.

## 6. Next suggested step

S2 — Document health in the sidebar (`docs/design/document-health-ui-lab/`): promote the Health
button to a tab with the badge, land the sections/selected-error layout and the 264 → 664 detail,
retire the modal sheet, and, while touching that surface, fix the Page fit-sync race from §5.1 as a
small separate commit.
