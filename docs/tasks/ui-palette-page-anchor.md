# Palette tune + Vivid accents, Page edge corridor, anchor quote chip

**Role:** Implementer / Builder
**Milestone:** UI stabilization — appearance, Page geometry, anchor references
**Base:** `main` at the commit that adds this brief (`597d70b` plus the brief commit)
**Worktree:** created by the delegate from that base; do not work in the main checkout
**Timebox:** 7 hours

## Context

The product owner approved the measured palette tune and asked for a second **Vivid** accent group
(violet, magenta, cyan, orange) in addition to the four pastel accents. The Page edge corridor still
has a 12/14 px inconsistency and scales with density; it should become one fixed standard. The
anchor callout still uses a rounded pill; it should become a squared chip in the app control
language, and formula anchors should render their LaTeX in the chip.

The preview pages are design-only references:
`docs/design/ui-lab/colors.html` (pastel + Vivid swatches, current vs recommended) and
`docs/design/ui-lab/anchor-quote.html` (pill vs squared chip vs inline). They are not product code.

## Goal

One worktree, three ordered commits, one full verify:

1. palette tune + the four Vivid accents, registry groups, contrast tests, docs;
2. the fixed 18 px Page edge corridor, independent of density;
3. the squared anchor quote chip with KaTeX formulas, code/image/text formatting, and tests.

## In scope

### Commit 1 — palette tune + Vivid accents (data-only)

Apply these measured changes (the approved values; keep everything else):

- dark `text-3` `#8b9199` → `#949aa2`;
- light `text-3` `#5f6b75` → `#5b6771`;
- dark `border-2` `#3c4148` → `#6e737a`;
- light `border-2` `#b8c4cd` → `#82888c`;
- light `--note-surface` `#f6f8fb` → `#f2f6f9`; hover `#eef3f7` → `#e9f0f5`;
- dark teal `accent #89c0ba`, `strong #99d1ca`, `hover #92cac3`;
- dark rose `accent #e5a5b3`, `strong #f6b5c3`, `hover #efaebc`;
- dark amber `soft #3a3124` → `#382f22`;
- light rose `hover #7d2f43` → `#873348`.

Keep `border-1` at rest (documented exception for SC 1.4.11); `border-2` is the 3:1 hover/focus/control
boundary. Do not switch resting buttons/inputs to `border-2`.

Add four **Vivid** accents to the registry, in addition to the pastel four:

| id | dark accent / strong / soft / hover / contrast | light accent / strong / soft / hover / contrast |
|---|---|---|
| violet | `#BE38F3` / `#D26BFF` / `#2A173A` / `#C94DFF` / `#0B0F12` | `#8B2BB8` / `#6F1E96` / `#F3E1FB` / `#7A25A6` / `#FFFFFF` |
| magenta | `#F43F8E` / `#FF6BA8` / `#361524` / `#FF57A0` / `#101418` | `#B0185C` / `#8E124A` / `#FBE0EC` / `#9F1553` / `#FFFFFF` |
| cyan | `#22D3EE` / `#67E8F9` / `#0C242B` / `#3BDDF3` / `#101418` | `#0E7490` / `#0B5F77` / `#DDF5FA` / `#0C6A84` / `#FFFFFF` |
| orange | `#FB923C` / `#FDBA74` / `#2C1E12` / `#FCA55A` / `#101418` | `#C2410C` / `#9A3412` / `#FDE8D7` / `#AD3A0B` / `#FFFFFF` |

- Add a `group: 'pastel' | 'vivid'` field to `AccentSet` (or an equivalent grouped export); keep the
  existing `id/label/dark/light` shape, drop no fields, add no `swatch` field (it is derived).
- The Appearance page renders two labelled groups, **Pastel** and **Vivid**, from the registry.
  `accent` remains a validated id string; unknown → blue. No `settingsVersion` change, no migration.
- The Vivid values are chosen for the same contrast standard: text on accent/hover/strong ≥ 4.5:1,
  accent/strong vs surfaces ≥ 3:1, text-3 on soft ≥ 4.5:1. Extend the contrast/registry tests to all
  eight accents and both themes; update the Appearance UI test to see both groups.
- Update `docs/design/color-system.md` §3/§4 and the token docs for the new values, groups, and the
  Vivid table; keep the research note as a historical snapshot (do not rewrite its four-accent
  recommendation).

### Commit 2 — Page edge corridor (fixed 18 px, density-independent)

- Define one Page corridor invariant: **lead 4 px + stem 14 px = 18 px** parent→child, with the
  fixed 6×6 arrowhead and the current Page stroke widths. Use `PAGE_EDGE_STYLE` and a small
  `PAGE_EDGE_GEOMETRY`/derived helper; Page/print read only the Page style (already split in the
  previous batch).
- `siblingGap` becomes **18 px** for compact and comfortable. `childIndent` 26 px
  (12 trunk + 14 stem), `calloutCardIndent` 38 px (24 trunk + 14 stem), `calloutGap` 16 px,
  `calloutRightGap` 24 px. Trunk insets stay 12/24.
- **Density must not scale the edge corridor**: stop scaling `siblingGap`, `childIndent`,
  `calloutCardIndent`, `calloutGap`, `calloutRightGap`, and the trunk insets in
  `effectivePageTheme`. Density still scales typography, card padding, segment gap and content
  width.
- Remove `siblingGap`, `childIndent`, `calloutCardIndent`, `calloutGap`, `calloutRightGap` from the
  user-facing Page advanced controls (engine constants). Keep the stored `PageTheme` fields for
  compatibility if needed, but the engine uses the fixed values; tests must not assert the old
  density scaling.
- Tests: root/child/grandchild/callout at 60/70/100/120% must show the same 18 px corridor and the
  same arrowhead; Page count may change, so run the Page/PDF gate (`m4c1`/`m4c2`/`m4c3`) and record
  the new counts. Page/print must never read the Continuous edge style.

### Commit 3 — squared anchor quote chip + formula rendering

- Replace the rounded `.nf-callout-quote` pill with a **squared chip** in the app control language:
  `border-radius: var(--radius-control)` (3 px), `border-1`, `surface-2`, glyph in accent,
  text-2 at 10.5–11 px; hover `border-2`/text-1; selected `accent-soft` + accent-strong inset border.
  Keep the same button, click-to-focus/select, ARIA label, title, `data-anchor-*` attributes, and
  the callout head layout. No 999 px pill.
- Switch the chip content by anchor kind:
  - **formula** (`selector.kind === 'formula'`): use `selector.latex` (whole or term) and the existing
    KaTeX dependency to render inline; no new dependency. If the formula is very long or KaTeX fails,
    fall back to `Σ` + the plain quote with the full text in `title`.
  - **code**: `{}` + monospace quote (existing truncation).
  - **image**: `▧` + label + `region`/`point`.
  - **text**: `“` + quote.
- Keep the formula term's visual inline and aligned; set a max width with a safe overflow/fallback;
  do not let a formula break the callout head or the card.
- Tests: text, formula term, formula whole, formula error/long fallback, code, image, selected/hover,
  click selection, broken/ambiguous state; screenshots dark/light. The Page/PDF ghost stays plain
  text (out of scope).
- Update `docs/design/color-system.md`? No; this is editor UI. Update the anchor-related token/UX doc
  if one exists; otherwise the report documents the contract.

## Out of scope

- Page/print `--paper-*` token alignment, tagged PDF/page range, full theme packs.
- Free color picker, per-document appearance, any `settingsVersion` change.
- Corrupt/missing RecoverySurface, status panel behavior, Page/PDF paper colors.
- A separate inline-quote variant; the squared chip is the chosen form.
- Page formula rendering in the print ghost.

## Files

Read:
- `packages/layout/src/appearance.ts`, `page-settings.ts`, `page-chrome.ts`, `edge-style.ts`,
  `edge-path.ts`, `page-routing.ts`, `page-edges.ts`, `layout.ts`, `types.ts`.
- `apps/desktop/src/renderer/src/styles.css`, `settings/AppearanceSettings.tsx`,
  `settings/page-advanced.ts`, `shell/SettingsDialog.tsx`, `page/PageEdges.tsx`,
  `print/PrintDocument.tsx`, `editor/views/BlockViews.tsx`, `lib/tree.ts`.
- `docs/design/color-system.md`, `docs/design-tokens-continuous.md`,
  `docs/design-tokens-page.md`, `research/color-palettes.md`, the two lab proof pages.
- Tests: `packages/layout/test/appearance.test.ts`, `page-*.test.ts`,
  `packages/pdf/test/print-model.test.ts`, `apps/desktop/test/appearance-css-guard.test.ts`,
  `appearance.test.ts`, `page-advanced.test.ts`, `page-token-guards.test.ts`;
  `tests/ui/ui-appearance-v3.test.mjs`, `ui-batch-b`, `ui-settings-advanced`, `m4b1*`,
  `m4c1`–`m4c3`.

Expected to touch: the files above, their unit/UI tests, the color/token docs, and
`docs/reports/ui-palette-page-anchor.md`.

## Acceptance criteria

- [ ] Pastel tune values are applied; text-3/border-2/note-surface/accents match the table; all eight
      accents pass the contrast gates in dark and light; the Appearance page shows Pastel and Vivid
      groups; `accent` remains an id string with blue fallback; no schema change.
- [ ] Page corridor is exactly 18 px (lead 4 + stem 14) at 60/70/100/120%, across right/below/callout;
      density does not change it; Page/PDF gate passes with the new page counts; Page/PDF never read
      the Continuous edge style.
- [ ] The callout chip is squared, not a pill, in dark/light; text/code/image/formula content is
      correct; formula terms and short whole formulas render with KaTeX; long/error formulas fall
      back safely; click/ARIA/title/data attributes and selection remain.
- [ ] Existing assertions updated to the intended behavior, none weakened; no fixed sleeps/native
      dialogs; no schema/dependency/Page-paper change beyond the corridor and chip.
- [ ] `npm run verify` exit 0 with real timings; all UI suites at the default pool.

## Tests and evidence

- Targeted while working: appearance/registry/contrast tests, layout Page suites, edge isolation,
  print model, Page/PDF suites, `ui-appearance-v3`, `ui-batch-b`, `ui-settings-advanced`, `m4b1*`,
  and the anchor/callout UI tests.
- End of task: one full `npm run verify` (~3–4 min).
- Screenshots: Appearance Pastel/Vivid (dark/light), Page corridor at 60/100/120, chip text/formula/
  code/image, selected/hover, dark/light. Put evidence in each suite's own `artifacts/<suite>` dir.
- A real PDF page with a formula anchor in the chip is not required; the Page ghost stays text. The
  chip is Continuous-only.

## Stop and ask

Stop and report when:

- the Page corridor change needs a paginator/print change beyond the fixed geometry;
- an eight-accent registry needs a schema change or breaks the unknown-id fallback;
- the formula chip cannot be made safe for long formulas without a product decision (fallback is the
  default);
- a baseline test fails for an unrelated reason.

## Report format

- Summary mapped to the three commits.
- Files changed.
- Checks with real timings and suite counts.
- Acceptance criteria pass/fail with evidence.
- Open questions / risks.
- Next suggested step (R4 Export defaults or R6 design).

Commit in the worktree; do not merge or push.
