# Report — v0.1.1 Track B (Page vertical gaps)

**Role:** Builder, Track B.
**Branch:** `t3/88d8867f` (the harness-created worktree branch; the brief's intended name is
`t3/v0.1.1-page-gap`).
**Base:** `1a91281` (`docs: v0.1.1 builder brief for three Page gaps`).
**Commit:** one commit on the branch; the SHA is in the handoff message (`git log -1 --format=%H`).
**Contract:** `docs/batch/brief.md`, `docs/batch/plan.md` (Track B, §4.3, §5.2, §6 B1–B3, §7
AC-14–AC-23, §8.5, §10), `docs/adr/0010-page-vertical-gaps.md`.
**Status:** B0–B3 implemented. All unit checks green. The Electron UI lane is pending because the
brief assigns it to the orchestrator; the UI test edits are written but not executed here.

## Summary

Three independent Page vertical gaps are now real Page settings:

- **Child gap** = `PageTheme.siblingGap`, default **18**, 0–96, fixed under density.
- **Top-level gap** = `PageTheme.chapterGap` (new field), default **32**, 0–96.
- **Callout gap** = `PageTheme.calloutGap`, default **16**, 0–96.

The pure layout now has one option per axis: `LayoutOptions.siblingGap` (child, vertical),
`chapterGap` (top-level, vertical), `calloutGap` (callout, vertical) and `rightGroupGap` (the fixed
18 px horizontal parent → right-group corridor). Every horizontal read in `layout.ts` was audited
and moved to `rightGroupGap`; the compaction row gap was split into `horizontalGap`/`verticalGap`.
`effectivePageTheme` no longer overwrites the three stored values and never scales them;
`pageLayoutOptions` maps all four options. `chapterGap` joins both numeric key lists (P7). The three
fields are in Page → Advanced layout as Child gap / Top-level gap / Callout gap (px, 0–96, step 1)
with the ratified group help. Default Page output at 18/32/16 is unchanged by construction: the
same numeric values reach the same reads, only through separate fields.

## Checkpoints

- **B0 — branch and baseline.** ADR-0010 is present at the new path and the brief's Track B names
  three settings, so no stop condition. Baseline `npx vitest run` on the untouched branch: 178
  files / 1833 tests green. `node_modules` was absent in the worktree; `npm ci` installed it from
  the unchanged lockfile.
- **B1 — model split.** Three defaults/ranges and `chapterGap`; presets, `resolveTheme`,
  `effectivePageTheme`, `pageLayoutOptions`, `PAGE_THEME_NUMERIC_KEYS`; `LayoutOptions.rightGroupGap`
  with axis docs; `layout.ts` axis audit and compaction split; `edge-style.ts` comment plus
  `calloutGap` removed from `PageEdgeGeometry`.
- **B2 — settings.** `ADVANCED_LAYOUT_KEYS` (+3 at the owner's position), `PAGE_THEME_FIELD_SPECS`
  (+3), renderer `PAGE_THEME_NUMERIC_KEYS` (+`chapterGap`), the ratified group help, and the
  `page-advanced.ts` corridor comment.
- **B3 — parity, docs, evidence.** Spec §7.2/§4.7, Page design tokens, `page-gap.test.ts`,
  `page-settings`/`print-parity`/`print-model` coverage, and the three UI suite edits including
  screenshot capture points.

## Files changed

Product code:

- `packages/layout/src/page-settings.ts` — gap constants (18/32/16, 0–96), `PageTheme.chapterGap`,
  axis docs, presets, `resolveTheme` fallbacks, `effectivePageTheme` vertical normalization,
  `pageLayoutOptions` mapping, numeric key list.
- `packages/layout/src/types.ts` — `LayoutOptions.rightGroupGap`, axis comments,
  `DEFAULT_LAYOUT_OPTIONS` keeps 24/24/32/20.
- `packages/layout/src/layout.ts` — horizontal reads use `rightGroupGap` (`subtreeColumn`,
  `rightX`, compaction first-row x / item x / row packing, `preferredSubtreeWidth`,
  `packPreferredRows`); vertical reads keep their own field; compaction `gap` split.
- `packages/layout/src/edge-style.ts` — `siblingGap` documented as the horizontal corridor;
  `calloutGap` removed from the invariant `PageEdgeGeometry`.
- `apps/desktop/src/renderer/src/settings/page-advanced.ts` — three editable keys, three field
  specs, `chapterGap` in both key lists, updated corridor comment.
- `apps/desktop/src/renderer/src/settings/PageAdvancedSettings.tsx` — ratified group help.

Docs:

- `docs/spec.md` — §7.2 three settings + horizontal corridor; §4.7 theme row.
- `docs/design-tokens-page.md` — three numeric rows, removed "Chapter gap is not a PageTheme field",
  corridor table, density paragraph, `rightGroupGap` 24 row, sibling fallback note.

Tests:

- `packages/layout/test/page-gap.test.ts` (new) — per-axis movement, independence matrix, mode A/B2,
  stacked/compaction, density, all-at-max overlap safety.
- `packages/layout/test/page-settings.test.ts`, `page-packing.test.ts`, `page-compaction.test.ts`,
  `layout-lab.ts`.
- `apps/desktop/test/page-advanced.test.ts`, `dialog-copy.test.ts`, `print-parity.test.ts`.
- `packages/pdf/test/print-model.test.ts`.
- `tests/ui/ui-settings-advanced.test.mjs`, `tests/ui/r1b-page-settings.test.mjs`,
  `tests/ui/m4d1-page-density.test.mjs` (written, not run here).
- `docs/batch/report-page-gap.md` (this file).

No file outside plan §5.2 was touched. No dependency, schema or `document.json` change.
`docs/batch/plan.md`, the ADR, the brief, `docs/plan.md`, `tests/ui/suites.mjs`, `package.json` and
the lockfile are untouched.

## Checks (with timings)

| Check | Result |
|---|---|
| `npm ci` | 471 packages, 3 s |
| B0 baseline `npx vitest run` | 178 files / 1833 tests green, 9.61 s |
| B1 focused: `npx vitest run packages/layout/test/page-settings.test.ts page-gap.test.ts page-packing.test.ts page-compaction.test.ts r2i-lab.test.ts r2j-lab.test.ts` | 6 files / 81 tests green, 0.67 s |
| B2+B3 focused: `npx vitest run apps/desktop/test/page-advanced.test.ts dialog-copy.test.ts print-parity.test.ts page-token-guards.test.ts packages/pdf/test/print-model.test.ts` | 5 files / 88 tests green, 0.69 s |
| Full `npx vitest run` | 179 files / 1851 tests green, 8.75 s (repeated green at 9.31 s and 9.32 s) |
| `npm run typecheck` | green, 5.83 s (run three times) |
| `npm run check:boundaries` | green, 299 files / 1469 imports / 16 rules |

One intermediate full run executed concurrently with `npm run typecheck` reported a single failing
test; the following two isolated runs and a deliberate concurrent rerun were fully green, so it was
a cold-worker/timing transient rather than a product failure. No test was changed to accommodate it.

Not run here (by brief): `npm run verify:fast`, `npm run e2e`, and every Electron UI suite.

## Acceptance criteria

| ID | Status | Evidence |
|---|---|---|
| AC-14 | **Units pass; UI pending** | `page-settings.test.ts` (18/32/16 defaults, 0–96 clamp, per-document `chapterGap` round-trip, no density lens); `print-model.test.ts` (40/64/24 reach the model); `r1b` case written (values, persistence, global 18/32/16). |
| AC-15 | **Units pass; UI pending** | `page-gap.test.ts` child axis at 0/18/40/96: below-child, child stack, top-level unaffected, x identical; `r1b` measures child 40 and 18 px corridor. |
| AC-16 | **Pass (unit + parity)** | `page-gap.test.ts` top-level at 0/32/64/96; `print-parity.test.ts` top-level 32→64 keeps Page/print parity and x. |
| AC-17 | **Pass (unit)** | `page-gap.test.ts` B2 at 0/16/24/96 and mode A (`first callout at parent y`, only callout→callout moves); `page-callout-modes.test.ts` run green. |
| AC-18 | **Pass (unit)** | `page-gap.test.ts` one-axis-at-min/max matrix (other gaps and `rightGroupGap` fixed, x identical) + all-at-96 no-overlap. |
| AC-19 | **Units pass; UI pending** | `page-settings.test.ts` and `print-parity.test.ts` assert unscaled gaps at 60/80/100/120 while padding/type scale; `m4d1` case written for 60/100/120. |
| AC-20 | **Pass for units/geometry** | No default fixture or default coordinate assertion changed; `page-subtree-wrap`, `group-wrap`, `page-callout-modes`, `page-edges`, `density-topology`, `r2i/r2j` labs green; default options carry 18/32/16 and corridor 18. `m4b1`/`m4c3` pending in the Electron lane. |
| AC-21 | **Units/print pass; UI pending** | `print-parity.test.ts` asserts `layoutOptions === pageLayoutOptions(theme)` with 20/40/22; `print-model.test.ts` a gap-only mismatch throws `PrintModelSettingsMismatchError`; `r1b` written; release PDF smoke is the orchestrator's. |
| AC-22 | **Units pass; UI pending** | `page-advanced.test.ts` (order, labels, px, 0–96, step 1, `chapterGap` frozen in a Custom baseline, out-of-range rejected without clamping); `dialog-copy.test.ts` ratified sentence; `ui-settings-advanced` written (fields, labels, help, 97 rejected, saved values, override dot, Use global). |
| AC-23 | **Units/docs pass; verify:fast pending** | Spec/tokens/comment updated; `page-token-guards.test.ts` green; boundaries green; no dependency or schema diff; Continuous untouched; `verify:fast` is the orchestrator's serialized lane. |

## Evidence paths

The UI suites capture these when the orchestrator runs the Electron lane:

- `artifacts/ui-settings-advanced/advanced-layout.png` — the three fields and the ratified help.
- `artifacts/r1b-page-settings/page-gaps-40-64-24.png` — Page at child 40 / top-level 64 /
  callout 24 (measurements asserted in the same test).
- `artifacts/m4d1-page-density/page-read-gaps-60.png` and `page-read-gaps-100.png` — non-default
  gaps at 60 % and 100 % density.

Exact pending UI assertions:

- `ui-settings-advanced`: three inputs present in order; labels Child gap / Top-level gap / Callout
  gap; values 18/32/16; `px` unit; help "Values in pixels. Editing a value makes this layer
  Custom."; `chapterGap` 97 shows "0 to 96 px", keeps the text, writes nothing; 40/64/24 persist on
  the document layer; the sibling-gap override dot appears and Use global returns to 18.
- `r1b`: a stacked fixture measures callout→parent 24, child→child 40, top-level→top-level 64 in
  Page DOM coordinates; resolved values 40/64/24 persist in `document-settings.json` (including
  `chapterGap`) while global stays 18/32/16; a beside fixture at child gap 40 measures the horizontal
  corridor at 18.
- `m4d1`: child 40 / top-level 64 / callout 24 stay identical at 60/100/120 % while card padding is
  4.8/8/9.6 px; the beside corridor stays 18 at every density.

## Risks and open questions

- **Axis leak** is the main risk. The matrix in `page-gap.test.ts` is the guard, and the compaction
  split is covered by both the oracle (`siblingGap`/`rightGroupGap` both 16) and a direct row-top
  test.
- **Key-order identity.** `printModel` compares `layout.layoutOptions` to `pageLayoutOptions(theme)`
  by JSON string equality, which is key-order sensitive. `pageLayoutOptions` was re-ordered to match
  `DEFAULT_LAYOUT_OPTIONS`; a future field must keep that order or every print identity check fails.
- **Legacy stored gaps.** A previously stored non-default `siblingGap`/`calloutGap` now applies on
  load (ADR-0010 consequence, intended, no migration).
- **UI lane.** The three edited UI suites are syntax-checked (`node --check`) but not executed here;
  if their DOM measurements are off, they will fail in the orchestrator's lane without affecting the
  unit model.
- **Density page count** may still move for the existing typography/padding reason; tests assert the
  gap values, not an unchanged count (plan §8.5).

## Next step

Orchestrator: run the single serialized Electron lane for the three edited suites, then
`verify:fast`, then merge `t3/88d8867f` first per plan §4.4 and remove the worktree.
