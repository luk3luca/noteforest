# Batch report — v0.1.1 input and Page gaps

**Status:** shipped 0.1.1 on 19 November 2026. One integration window; the full `verify` is green.
No Sentinel: the product owner did not approve one. The orchestrator reviewed the plan and ran the
gate.

**Commits:** anchor index `fc8fbbc`; Track B `60a4e45`; Track A `0db131a`; Track A lane fixes
`5a2201b`; legacy UI assertions `275d523`; release commit (version, changelog, status, this report).

## What shipped

- **Anchor resolution index** (already merged before this batch): one index in core, owned by
  `DocumentSession`; Continuous, Page and PDF agree on resolved, ambiguous, broken and idle anchors.
  The below-callout trunk is at +24 and a below card never sits left of the +38 lane.
- **Track A — editor input and paste:** heading marker levels (H1–H3, `#` raises, Backspace lowers,
  one undo), `$` selection wrap/unwrap for inline formulas, table-cell inline marks/formulas with
  GFM paste and Copy-as-Markdown round-trip, and foreign HTML math paste restored to the editor's
  inline shape. Table surfaces are split: the classic selection bubble formats in a cell; the table
  management bar keeps 13 actions and is anchored to the table bottom edge, not the active cell.
- **Track B — Page vertical gaps:** three per-document settings in Page → Advanced — Child gap (18),
  Top-level gap (32), Callout gap (16); 0–96, fixed under density, applied to Page and PDF. The
  horizontal parent → right-group corridor stays a fixed 18 px (`LayoutOptions.rightGroupGap`).
- **A4:** lane regressions closed (live DOM caret for Home + `#`, header/body table assertions,
  Page cell bold/PDF, guest `.md` marker strip, typed GFM conversion via `gfmInlineFromNode`), plus
  the table-surface split and the Electron 45 clipboard helper.

## Checks

| Check | Result |
|---|---|
| Full `npm run verify` | **green** — 183 unit files / 1,909 tests; boundaries 306 files / 1,495 imports / 16 rules; e2e 16/16; recovery 14/14; UI **71/71** at concurrency 4 (364.9 s) |
| `npm ci` + `npm run typecheck` from the 0.1.1 lock | green |
| Track A UI lane | `special-text` 11/11, `m4c1` 8/8, `markdown-file-view` 5/5, `editor-appearance` 1/1 |
| Track B UI lane | `ui-settings-advanced` 8/8, `r1b-page-settings` 5/5, `m4d1-page-density` 4/4 |
| Perf | The anchor warm-up p95 guard flaked once under parallel load (17.46 ms / 16.56 ms vs 16); it passes isolated and in the green full run. No test weakened. |

The first full verify found two **legacy test assertions**, not product regressions: the stacked
callout test still expected the pre-anchor lane x, and the vault guest heading read `#Diario` because
the marker widget is visible in the editable guest. Both were updated test-only; the second full
verify is the green one above.

## Acceptance

- Track A AC-01…AC-13 pass (unit + the lane evidence); A4 items pass; the `editor-appearance` test
  keeps 13 management actions and asserts the bottom-bar rect is stable across cell moves.
- Track B AC-14…AC-23 pass: the three gaps move independently, the horizontal corridor stays 18,
  Page/PDF parity holds, density does not scale them, and the 18/32/16 default baseline is unchanged.
- No new dependency, no document-schema change, no second layout derivation.
- The product owner's visual, VoiceOver and PDF pass on the installed app is the remaining release
  gate.

## Evidence

- `docs/batch/report-input.md` — Track A builder report.
- `docs/batch/report-input-fix.md` — A4 lane fixes and test-only evidence.
- `docs/batch/report-page-gap.md` — Track B builder report.
- `artifacts/special-text/v011-*`, `artifacts/m4c1/ui/print-table-cell-*`,
  `artifacts/editor-appearance/table-toolbar-header.png`,
  `artifacts/ui-settings-advanced/advanced-layout.png`,
  `artifacts/r1b-page-settings/page-gaps-40-64-24.png`,
  `artifacts/m4d1-page-density/page-read-gaps-*`.

## Risks and next

- `docs/plan.md` keeps the long inline-formula card width and the arrow-boundary issue as the next
  known issues; the Page-gap, heading, formula-toggle, table-cell and HTML-paste items are shipped and
  removed from the roadmap.
- A legacy stored non-default `siblingGap`/`calloutGap` now applies on load; the 18/32/16 defaults
  keep the 0.1.0 output byte-compatible.
- The three UI test updates are test-only: the stacked callout lane 38 (anchor clamp), the guest `.md`
  marker strip, and the bottom-bar stability assertion in `editor-appearance`.
