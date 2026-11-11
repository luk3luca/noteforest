# UI Batch V — visual refinement

**Role:** Builder / Implementer
**Milestone:** UI rework, Batch V (visual refinement)
**Base:** `design/ui-map` head at delegation (the commit containing this brief)
**Worktree:** provided by the T3 delegation; do not work in the parent checkout
**Timebox:** 1.5 working days; checkpoint commits
**Source of truth:** this brief + the existing Batch A/B/C implementation and tokens

## Context

Batches A/B/C are merged into `design/ui-map`; the core shell, Settings, Export, Palette, and Page
settings are implemented. The product owner is testing the app and identified four visual/behavioral
refinements. This batch fixes only those. It does not add future settings, does not implement the
lazy-new-document lifecycle, and does not change Page/PDF output.

Read first:

- `AGENTS.md`, `docs/tasks/ui-rework.md`, `docs/reports/ui-batch-a.md`, `ui-batch-b.md`,
  `ui-batch-c.md`.
- `apps/desktop/src/renderer/src/shell/SettingsDialog.tsx`, `styles.css`, `App.tsx` (Toaster),
  `shell/TabBar.tsx`, `editor/DocumentEditor.tsx`, `settings/*`.
- `docs/design-tokens.md`, `docs/design-tokens-continuous.md`, the V0 shell tests, the Settings/
  Page settings UI suites.

## Goal

Remove the four visual inconsistencies without changing behavior or the Page/PDF model:

1. **Settings modal fixed size.** It must not change width by active page.
2. **Toast visual language** aligned with the app tokens.
3. **Tab behavior** with non-shrinking status icons and an expanded active tab.
4. **Canvas chapter lateral inset** so the title is not flush with the panel edge.

## In scope

### V1 — Settings fixed size

- Use one desktop width for every Settings page: **980 px** (or 960 if the page content genuinely
  needs less; do not vary by active page). `max-width: 92vw` only for narrow windows.
- Keep the height fixed (580 px) with the body scrollable; no page-dependent height jump.
- The Page preview column remains only on Page; other pages use the same panel width with a
  consistent content max-width/centering. No empty third column that looks like a missing panel.
- Responsive: below ~920 px the Page preview hides and the panel may use the narrow width; this is a
  viewport rule, not a page rule.
- Add a test that opens General, Page, and Editor and asserts the same outer width (and the preview
  only on Page).

### V2 — Toast tokens

The Sonner container is already tokenized, but the internals still use Sonner defaults. Align:

- width **340 px** (mobile full width), padding **12 px 14 px**, radius **8 px** (`--radius-panel`),
  background `surface-3`, border `--border`, shadow `0 12px 32px rgb(0 0 0 / 0.45)`;
- title **12.5 px / 500**, line-height 1.4, `--text`; description **11.5 px / 400**, line-height
  1.4, `--text-secondary`;
- icon **15–16 px**, stroke 1.5, using the app success/warning/danger colors; no bright/filled
  Sonner default icons;
- keep max 3 visible, no focus steal, existing actions/behavior; no new toast API.
- Add a UI/computed-style test if practical; otherwise a screenshot of success/info/error toasts.

### V3 — Tab behavior

- **Never shrink status icons:** `.nf-tab-missing` fixed 12×12 (`flex: 0 0 12px`), lock and close
  `flex: none`; the `!` stays a circle. Dirty dot already fixed.
- **Active tab expands, inactive tabs compact:** active tab with priority width (roughly
  `min-width: 170–190`, `max-width: 220`), inactive tabs shrink with a floor around 80–96 px and
  ellipsis. The active tab is always visible; `+` remains immediately after the last visible tab;
  overflow uses the existing tab menu when inactive tabs hit the floor; no horizontal scroll.
- **Status stays visible:** lock, `!`, and dirty dot remain visible in the compact state. Do not hide
  them; the title can be truncated or hidden only if the status icons remain legible. Close stays
  active/hover.
- Preserve drag reorder, middle-click close, dirty/lock/recovery states, keyboard Delete/⌘W, and
  the existing tab ARIA structure.
- Add a stress test with 8–14 tabs: icons keep their size, active tab is the widest, inactive tabs
  reach the floor without scroll, `+` is visible, overflow lists the rest, active tab always visible.

### V4 — Canvas chapter inset

- Add a small lateral content inset for Continuous: `editorPaddingX = 8 px` (medium 8, compact 6),
  so the chapter title no longer starts at the panel border. Keep the top/bottom tight.
- Remove/compensate the `margin-left: -2px` on the chapter title/input so the visible text starts at
  the intended inset. The cards/edges move with the canvas; no layout-engine or Page/PDF change.
- Update `docs/design-tokens-continuous.md`; add a token/CSS test and a screenshot.

## Out of scope

- Lazy new document (draft tab/no file until first edit) — separate lifecycle batch.
- Future settings pages (Appearance, Export defaults, Page chrome, manual breaks, Data recovery,
  Continuous global, Editor/General), External API/agent access.
- Settings behavior (instant save, scope/override, Page advanced), Page/PDF output, Page sheet,
  paginator, print compositor.
- New dependencies, schema/migrations, lab/spec/UX/ADR/plan/AGENTS edits.

## Tests and evidence

- Targeted: `v0-shell-frame`, `m2-shell`, `m2-view`, `ui-batch-a`, `ui-batch-b`, `ui-batch-c`,
  Settings/Page suites; add Batch V tests for fixed Settings width, tab stress, toast styles,
  chapter inset.
- Do not weaken assertions, add fixed sleeps, or open native dialogs.
- Screenshots under `artifacts/ui-batch-v/`: Settings General/Page/Editor at the same width, tabs
  with 2/8/14 tabs, toast success/info/error, canvas chapter inset.
- End: one `verify:fast` with timings. Do not run full `verify` (Orchestrator at integration).

## Acceptance criteria

- [ ] Settings uses one width for every page; only the viewport changes the responsive width.
- [ ] Toast width/padding/radius/typography/icons match the app tokens; behavior unchanged.
- [ ] Tab status icons never distort; active tab expands, inactive tabs compact, status stays
      visible, `+` after the last tab, no scroll, overflow works.
- [ ] Chapter title starts with an 8 px lateral inset (6 px compact); no Page/PDF change.
- [ ] No behavior/schema/dependency change beyond these visuals; tests/screenshots/one
      `verify:fast` pass.

## Integration

The Orchestrator reviews, runs the full `npm run verify`, merges into `design/ui-map`, then merges
`design/ui-map` into `main` (the product owner's main-merge gate after this visual batch). The
builder does not merge, push, or open a PR.

## Report format

Summary; checkpoint commits; files changed; checks/timings; acceptance pass/fail; worktree/branch/
head; open questions/risks; next step.
