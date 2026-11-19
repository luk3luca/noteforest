# Batch report — v0.1.3 polish: code-theme polarity and palette reason

**Status:** shipped 0.1.3 on 19 November 2026. One integration window; the full `verify` is green.
No Sentinel: the product owner did not approve one. The orchestrator reviewed the brief and ran the
gate.

**Commits:** polish `ca00cc2`; release commit (version, changelog, status, this report). The builder
report is `report-polish.md`.

## What shipped

- **#3 — mixed-polarity code-theme chrome:** when a code theme's polarity differs from the app theme
  (`Light+` on a dark app; `Dark+`/`Monokai` on a light app), the code fence row and copy chip follow
  the code theme's own `--code-surface`/`--code-text` chrome. Same-polarity pairs keep the shell
  surface/text rules; the language label, fences, separators and the four-theme picker are
  unchanged.
- **#7 — palette reason tooltip:** the clipped `.nf-palette-reason` span now has `title` with the
  full Read-mode sentence. The label, copy, row height, `data-palette-reason`, marker and disabled
  behaviour are unchanged.

The only integration adjustment was test-only: CSSOM returned `#fff` for the `#ffffff` surface token,
so the mixed-pair assertion compares normalized hex. No product CSS changed.

## Checks

| Check | Result |
|---|---|
| Full `npm run verify` | **green** — 184 unit files / 1,933 tests; boundaries 306 files / 1,495 imports / 16 rules; e2e 16/16; recovery 14/14; UI **71/71** at concurrency 4 (364.2 s) |
| `code-themes` + `appearance-css-guard` | 38/38 |
| `npm test` | 184 files / 1,933 tests |
| `npm run typecheck` | green (all workspaces) |
| `npm run build` | main/preload/renderer green; `color-mix` parses |
| UI lane | `editor-appearance` 1/1, `command-surface` 6/6 |

## Evidence

- `artifacts/editor-appearance/mixed-light-plus-dark-app.png`
- `artifacts/editor-appearance/mixed-one-light-dark-app.png`
- `artifacts/editor-appearance/mixed-monokai-light-app.png`
- `artifacts/editor-appearance/mixed-dark-plus-light-app.png`
- `artifacts/editor-appearance/export/editor-appearance-evidence.json` (`mixedOnDark`, `mixedOnLight`)
- `artifacts/command-surface/read-palette-reason.png`

## Remaining known issues

`docs/plan.md` now lists seven: empty-child floor, 1,000-block scroll p95, rich-cell move
reconciliation, Page Edit second undo entry, `⇧Esc`, the read-only sentence and Fit page. The
small-fix shortlist keeps only the Page Edit second undo entry (#4). The v2 feature list is
unchanged.
