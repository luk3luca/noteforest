# Builder report — palette tune + Vivid accents, Page edge corridor, anchor quote chip

**Task:** `docs/tasks/ui-palette-page-anchor.md`
**Role:** Implementer / Builder
**Worktree:** `a builder worktree`
**Branch:** `t3/ui-palette-page-anchor`
**Base:** `01a92f5` (main head)
**Head:** `t3/ui-palette-page-anchor`, three commits from base `01a92f5` (this report is in the
third commit; the hash is reported in the handoff message because a commit cannot contain its own
hash).
**Status:** implemented, three commits, one full `npm run verify` exit 0

## Summary mapped to the commits

### 1. `955e877` — palette tune + four Vivid accents (data-only)

- Applied the measured tune: dark `text-3 #949aa2`, light `text-3 #5b6771`, dark
  `border-2 #6e737a`, light `border-2 #82888c`, light `--note-surface #f2f6f9` / hover
  `#e9f0f5`, dark teal `#89c0ba/#99d1ca/#92cac3`, dark rose `#e5a5b3/#f6b5c3/#efaebc`,
  dark amber soft `#382f22`, light rose hover `#873348`.
- Added `AccentGroup` (`pastel | vivid`) and `ACCENT_GROUPS` / `accentsInGroup()`; violet,
  magenta, cyan, and orange use the exact approved dark/light accent/strong/soft/hover/
  contrast values. `accent` is still a validated id string; unknown → blue. No
  `settingsVersion` change, no migration, no `swatch` field (derived from `accent`).
- Appearance renders two labelled registry groups (Pastel, Vivid); the swatch grid keeps
  `data-accent-option` and adds `data-accent-group` / `.nf-accent-group-label`.
- Contrast/registry tests cover all eight accents in both themes: text on accent/hover/
  strong ≥ 4.5, accent/strong on every shell surface ≥ 3, text-3 on soft ≥ 4.5. The CSS
  guard records `border-1` as the resting hairline (SC 1.4.11 exception) and asserts
  `border-2` ≥ 3:1 on every shell surface. Resting controls were not changed.
- `docs/design/color-system.md` §3/§4 and `docs/design-tokens-continuous.md` updated;
  `research/color-palettes.md` is untouched and stays historical.

### 2. `645579e` — fixed 18 px Page edge corridor

- `PAGE_EDGE_GEOMETRY` in `packages/layout/src/edge-style.ts`: lead 4 + stem 14 = 18 px,
  `siblingGap` 18, `childIndent` 26 (12 + 14), `calloutCardIndent` 38 (24 + 14),
  `calloutGap` 16, `calloutRightGap` 24, trunk insets 12/24. `PAGE_EDGE_STYLE.stemMin`
  becomes 14; Continuous keeps 12. The 6 × 6 arrowhead and Page stroke widths
  (1.25/1.75/1) are unchanged.
- `effectivePageTheme`/`pageLayoutOptions` resolve the corridor from the constants and no
  longer scale it (or the wrap origins) with density. A legacy stored
  `siblingGap/childIndent/calloutCardIndent/calloutGap/calloutRightGap/childTrunkInset/
  calloutTrunkInset` is kept on the theme for settings compatibility but cannot move an
  arrow. The wrapped-child origin is a hard floor: `maxWrapIndent` can no longer cut
  below 26 (fixed in `wrapOriginX`).
- `siblingGap`, `childIndent`, and `calloutGap` are removed from the user-facing Page
  advanced controls (`ADVANCED_LAYOUT_KEYS` / field specs); the stored fields stay in
  `PageTheme` and `PAGE_THEME_NUMERIC_KEYS` for custom-baseline preservation.
- Tests at 60/70/100/120% cover right/below/callout/grandchild placement and the exact
  lead/stem/trunk split; edge-style isolation asserts Continuous 12 vs Page 14 and that
  the Page/print modules read only the Page style. Page/PDF gate re-run: A4 portrait 61,
  A5 landscape 134, Letter portrait 62, 300-block fixture 27 pages (evidence
  `artifacts/m4c3/gate/gate-evidence.json`), Page Read count equals the PDF.
- `docs/design-tokens-page.md` / `design-tokens-continuous.md` updated; the advanced UI
  suite now asserts the corridor fields are absent from the controls.

### 3. `49cfb9b` — squared anchor quote chip + formula rendering

- `.nf-callout-quote` is a squared control: `--radius-control` 3 px, 1 px `--border-1`,
  `--surface-2`, accent glyph, `text-2` at 10.5 px; hover `border-2` + text-1; selected
  `accent-soft` with a 1 px `accent-strong` inset border. The 999 px pill is gone.
- Formula anchors render `selector.latex` inline with the existing KaTeX dependency
  (whole and term). A new pure helper `anchorFormulaRender` returns `null` html for empty,
  over-96-code-point, or invalid sources; the chip then shows `Σ` + the plain quote and
  keeps the full source in `title`. The KaTeX tree is `aria-hidden`; the button label
  carries the accessible plain quote. Max chip/formula width prevents card growth.
- Code keeps `{}` + mono quote (existing 48-code-point truncation); image keeps `▧` +
  label + `region`/`point`; text keeps `“` + quote. Button, click-to-focus/select, ARIA
  label, `title`, `data-anchor-*`, and the callout head are unchanged. Page/PDF ghost
  labels stay plain text.
- Tests: unit helper coverage (term, whole, invalid, over-long, exact limit, blank); UI
  coverage for formula term/whole KaTeX, invalid/over-long fallback, code mono, image
  glyph/point, text hover/selected/click, ambiguous/broken state; dark and light
  screenshots. The anchor design doc records the chip contract
  (`docs/design/m3-anchors-references.md` §6.3.1).

## Files changed

```text
packages/layout/src/appearance.ts
packages/layout/src/edge-style.ts
packages/layout/src/layout.ts
packages/layout/src/page-edges.ts
packages/layout/src/page-settings.ts
packages/layout/test/appearance.test.ts
packages/layout/test/edge-style-isolation.test.ts
packages/layout/test/group-wrap.test.ts
packages/layout/test/page-callout-modes.test.ts
packages/layout/test/page-routing.test.ts
packages/layout/test/page-settings.test.ts

apps/desktop/src/renderer/src/editor/anchor-formula.ts        (new)
apps/desktop/src/renderer/src/editor/views/BlockViews.tsx
apps/desktop/src/renderer/src/settings/AppearanceSettings.tsx
apps/desktop/src/renderer/src/settings/page-advanced.ts
apps/desktop/src/renderer/src/styles.css
apps/desktop/test/anchor-formula.test.ts                     (new)
apps/desktop/test/appearance-css-guard.test.ts
apps/desktop/test/page-advanced.test.ts
apps/desktop/test/print-parity.test.ts
apps/desktop/test/ui-batch-v-css.test.ts

tests/ui/m2-shell.test.mjs
tests/ui/m3-anchor-outline.test.mjs
tests/ui/m3-code-anchor.test.mjs
tests/ui/m3-formula-anchor.test.mjs
tests/ui/m3-formula-term.test.mjs
tests/ui/m3c3b2-image-anchors.test.mjs
tests/ui/m4d1-page-density.test.mjs
tests/ui/r2b-page-packing.test.mjs
tests/ui/r2i-page-subtree-wrap.test.mjs
tests/ui/ui-appearance-v3.test.mjs
tests/ui/ui-settings-advanced.test.mjs

docs/design/color-system.md
docs/design/m3-anchors-references.md
docs/design-tokens-continuous.md
docs/design-tokens-page.md
docs/reports/ui-palette-page-anchor.md
```

## Checks (real timings)

One full `npm run verify`, exit 0, **170.85 s** wall:

| Stage | Result | Time |
|---|---|---:|
| `check:boundaries` | 188 files, 909 imports, 16 rules | <1 s |
| `typecheck` (desktop/core/layout/pdf) | clean | included |
| `npm test` (Vitest) | 115 files / 1197 tests passed | 3.02 s |
| `npm run e2e` (build + critical e2e) | build + 16/16 tests | 43.9 s |
| `test:recovery:run` | 14/14 | 18.2 s |
| `node tests/ui/run.mjs` | 48/48 suites, concurrency 8 (default pool) | 98.9 s |

Targeted while working:

- `npx vitest run packages/layout/test packages/pdf/test` → 19 files / 189 tests, 0.47 s.
- `npx vitest run apps/desktop/test` → 87 files / 808 tests, 1.82 s.
- `node --test tests/ui/m3-formula-anchor.test.mjs` → 2/2.
- `node --test` for formula term, code, outline, image, callout layout, live health,
  split/merge, placement undo → 16/16.
- `node tests/ui/run.mjs --group page` → 16/16 after the corridor test updates;
  `--group settings` → 10/10.
- Individual m4b1b1 re-run after one load-related flake → 8/8; the final full verify was
  green with 48/48.

Page/PDF gate new counts: A4 portrait **61**, A5 landscape **134**, Letter portrait
**62**, 300-block fixture **27**. PDF page count equals the paginator in every case.

## Acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| Pastel tune + eight accents pass both themes; Appearance shows Pastel/Vivid; `accent` id with blue fallback; no schema change | **Pass** | `packages/layout/test/appearance.test.ts` (all 8, both themes, text-on-accent/hover/strong, accent/strong surfaces, text-3 on soft); `apps/desktop/test/appearance-css-guard.test.ts`; `tests/ui/ui-appearance-v3.test.mjs` (2 groups, 8 swatches, violet applied); `settingsVersion` untouched |
| Page corridor exactly 18 px at 60/70/100/120%, right/below/callout; density-independent; Page/PDF gate passes; Page/PDF never read the Continuous style | **Pass** | `page-settings.test.ts` corridor block (4 densities + legacy override); `page-callout-modes.test.ts` corridor test (root/child/grandchild/callout at 4 densities); `edge-style-isolation.test.ts` (Continuous 12 vs Page 14, poisoned Continuous values leave Page byte-identical); m4c1–m4c3 + PDF gate green |
| Chip is squared, not a pill; text/code/image/formula content correct; formula terms and short wholes use KaTeX; long/error fall back; click/ARIA/title/data attributes/selection remain | **Pass** | `ui-batch-v-css.test.ts` chip contract; `anchor-formula.test.ts`; `m3-formula-anchor` (KaTeX + fallback + light/dark), `m3-formula-term` (term + ambiguous), `m3-code-anchor` (mono), `m3c3b2-image-anchors` (glyph/point), `m3-anchor-outline` (hover/selected/click, dark/light) |
| Existing assertions updated to intended behavior, none weakened; no fixed sleeps/native dialogs; no schema/dependency/Page-paper change beyond corridor/chip | **Pass** | Updated suites assert the new corridor/chip contract; no new dependency (KaTeX already present); Page paper/skin untouched; no `settingsVersion`/schema change |
| `npm run verify` exit 0 with real timings; all UI suites at the default pool | **Pass** | Full run above: 48/48 UI, concurrency 8 |

## Evidence

- Appearance: `artifacts/ui-appearance-v3/appearance-dark-violet.png`, `appearance-dark-blue.png`,
  `appearance-light-blue.png`, `appearance-light-amber.png`.
- Page corridor at 60/100/120%: `artifacts/m4d1-page-density/page-read-60.png`,
  `page-read-100.png`, `page-read-120.png`; exact geometry is asserted in the unit corridor
  tests.
- Page/PDF gate: `artifacts/m4c3/gate/gate-evidence.json`, `gate-a4-portrait.pdf`,
  `artifacts/m4c3/packaged/`.
- Chip: `artifacts/m3b2b/anchor-chip-dark-1440x900.png`, `anchor-chip-light-1440x900.png`
  (text, hover/selected); `artifacts/m3c1/formula-anchor-1440x900.png`,
  `formula-anchor-light-1440x900.png` (KaTeX whole/term), `formula-chip-fallback-dark-1440x900.png`,
  `formula-chip-fallback-light-1440x900.png` (invalid/over-long fallback);
  `artifacts/m3c2a/formula-term-1440x900.png`; image/point evidence under `artifacts/m3c3b2/`.

## Open questions / risks

1. **Formula fallback threshold is a heuristic.** 96 code points is conservative so a whole
   formula cannot widen the card; the full LaTeX stays in `title`. A shorter inline limit
   may be preferable after product-owner visual review; it is one constant
   (`ANCHOR_FORMULA_MAX_CODEPOINTS`).
2. **Legacy corridor fields are inert but still stored.** An old per-document override keeps
   its numbers in `settings.json`/overrides and in the fingerprint, but the engine ignores
   them. A future cleanup can remove the fields with a settings migration; this task does
   not change the schema.
3. **UI flake observed once.** In an intermediate full verify, `m4b1b1-page-edit-overlay`
   timed out waiting for the overlay to close under concurrency 8; it passed alone (8/8)
   and in the final full verify (48/48). The failure is in the Page Edit navigation path,
   not in the changed surfaces; it is recorded here as a load-sensitivity risk.
4. **`DEFAULT_LAYOUT_OPTIONS` still carries the DOM-free lab defaults** (`siblingGap` 24,
   `calloutGap` 20). Page production always supplies `PAGE_EDGE_GEOMETRY`; the lab defaults
   are documented as engine fallbacks and are used by the R2 lab oracles.
5. `research/color-palettes.md` intentionally still recommends the four pastel accents; it
   is a historical snapshot, and the shipped registry now has eight.

## Next suggested step

**R4 Export defaults** (the next stopped settings block) or **R6 design**, per the roadmap.
Before that, a Sentinel can review this worktree; the only product-owner visual check I
recommend is the 96-code-point formula fallback and the 180 px inline formula cap.
