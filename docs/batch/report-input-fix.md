# A4 report input fix — Track A lane regressions (v0.1.1)

**Branch:** `t3/track-a4-table-toolbar-fixes` (the worktree branch; the brief's intended name is
`t3/v0.1.1-input`).
**Base:** `33bc2c5` (`docs: split the table selection and management surfaces` on `main`).
**Scope:** plan §6 A4 items 1–5 plus the P1 surface split, only the files in plan §5.1.
**Commit:** the single A4 commit on this branch (SHA reported in the handoff message).

---

## 1. Summary

All four lane regressions and the typed GFM conversion are implemented. The table surfaces are
split as approved by the product owner:

1. **P1 split.** `SelectionToolbar` is the formatting surface inside table cells; its
   `!isActive('table')` suppression is gone. `TableToolbar` is management only (13 actions), with
   the Bold/Italic/Inline code/Inline formula cluster and its imports removed. Its reference rect is
   a zero-height line at the **table bottom**, so a caret move between cells cannot move it; the
   portal keeps it outside the horizontal scroll wrapper.
2. **Heading `Home` + `#`.** `headingLevelTransaction` accepts the live DOM caret (the
   `arrowStays` pattern) and syncs the editor selection to it. Because macOS `Home` is a
   document-scroll command (the caret does not move in a contenteditable), the heading extension
   now maps plain `Home` inside a heading to the heading start in one selection transaction.
   `Home` + `#` raises H1→H2 in one undo.
3. **special-text A1/A2/A3.** The A1/A3 case asserts `th` for Bold/Italic and `td` for `$x^2$` and
   `<br>`, then proves the split: formatting from the selection bubble, exactly 13 management
   actions with none of the four formatting actions, one management bar, and an unchanged bar rect
   when the caret moves between cells. The formula cells now start with `Control+a`
   (`selectTextblockStart`, a ProseMirror command) instead of native `Home`, which is a no-op on
   macOS. The heading hard-break assertion ignores ProseMirror's trailing placeholder `<br>`.
4. **m4c1 Page bold.** The Page path never dropped the mark: the paginator renders **one table per
   row segment**, so the first `table.nf-table` is the header row and the bold body cell is its own
   table. The case now targets `strong`/`.nf-math-inline` across the page view's tables. The shared
   `snapshotSheet` helper tolerates a page with no edge SVG (this fixture has no branches); every
   existing m4c1 case keeps its real edge comparison. Bold, the formula, print parity and the PDF
   text are proven.
5. **markdown-file-view.** A `headingText` helper strips `.nf-heading-marker` from a clone before
   reading a guest heading; the canonical content is unchanged. Applied to the three heading
   assertions (`Markdown fixture`, `Other file`, `External change`).
6. **Typed GFM conversion (AC-08).** `gfmInlineFromNode` in `table-node.ts` serializes a paragraph's
   inline ProseMirror nodes/marks back to cell source (`**`, `*`, `~~`, backticks, `$…$`, `<br>`).
   `table-commands.ts` `paragraphsAround` uses it instead of `textContent`, so typed tables keep
   marks and math after the input rules consumed the delimiters. A focused unit test covers the
   adapter, the rebuilt source and the parse-back into real marks.

One extra test-support fix: `writeClipboardHtml` used the pre-Electron-45 `clipboard.write({text,
html})` shape. Electron 45 expects `ClipboardItem[]`; the helper now uses it with the legacy
fallback (same pattern as `m3c3b4`). The first lane never reached the HTML-paste step, so this was
not in the five failures.

**Lane fix:** `editor-appearance` had a stale deep-body placement block that assumed the old
above-cell bar. With the bottom-edge design it can never pass; the orchestrator authorized the
test-only replacement with the table-relative stability check. The suite is now **1/1 green**.

---

## 2. Files changed

Product:

- `apps/desktop/src/renderer/src/editor/SelectionToolbar.tsx` — cell selections show the classic
  bubble.
- `apps/desktop/src/renderer/src/editor/TableToolbar.tsx` — management only, 13 actions, bottom
  anchoring.
- `apps/desktop/src/renderer/src/editor/heading-marker.ts` — live DOM caret, plain `Home` at a
  heading start.
- `apps/desktop/src/renderer/src/lib/heading-marker.ts` — `caretPos` override + selection sync.
- `apps/desktop/src/renderer/src/editor/table-node.ts` — `gfmInlineFromNode`.
- `apps/desktop/src/renderer/src/editor/table-commands.ts` — typed run uses the inline serializer.

Tests and support:

- `apps/desktop/test/heading-marker.test.ts` — live-caret override cases.
- `apps/desktop/test/special-text.test.ts` — typed marks/math conversion case.
- `tests/support/harness.mjs` — Electron 45 `ClipboardItem[]` clipboard write.
- `tests/ui/special-text.test.mjs` — header/body assertions, split surface case, `Control+a`, hard
  break selector.
- `tests/ui/m4c1-print-compositor.test.mjs` — per-row table locators, no-edge parity tolerance.
- `tests/ui/markdown-file-view.test.mjs` — marker-stripped heading text.
- `tests/ui/editor-appearance.test.mjs` — replaced the stale above-cell block with the
  table-relative bottom-bar stability check (orchestrator-authorized test-only change).
- `docs/batch/report-input-fix.md` (this file).

No dependency, lockfile, schema, version or file outside plan §5.1 was changed.

---

## 3. Checks run

| Check | Result | Timing |
|---|---|---|
| `npm run build` (electron-vite) | main, preload, renderer built | 0.3 s |
| Focused unit: `npx vitest run heading-marker gfm-inline special-text table-paragraph-insertion page-segments` | 5 files, 60 tests passed | 0.41 s |
| Full unit `npm test` | 183 files, 1909 tests passed | 7.0 s |
| `npm run typecheck` | desktop node + web, core, layout, pdf | 5.8 s |
| UI lane, sequential: `special-text` | 11/11 passed | 25 s |
| UI lane, sequential: `m4c1-print-compositor` | 8/8 passed | 18 s |
| UI lane, sequential: `markdown-file-view` | 5/5 passed | 20 s |
| UI lane, sequential: `editor-appearance` | 1/1 passed (stale block replaced with the bottom-bar stability check) | 20 s |

Lane logs: `/private/var/folders/8s/bnccfc3d2pz2044r5ft_942c0000gn/T/opencode/a4-lane-*.log`.
Focused runs: `a4-unit.log`, `a4-typecheck.log`.

**Not run, by the brief:** `npm run verify:fast`, `npm run e2e`, `test:perf`, `test:visual`. The
orchestrator owns the full gate.

---

## 4. Acceptance items

| A4 item | Status | Evidence |
|---|---|---|
| P1 split: selection bubble in cells; table bar 13 management actions anchored to the table bottom | **Pass** | `special-text` A1/A3: 13 `[data-action]`, no `bold`/`italic`/`inline-code`/`inline-formula`, one management bar, identical rounded rect across two cells, bar below the table; `artifacts/special-text/v011-table-surface-split-1440x900.png`. `editor-appearance` passes the 13 count and both below-table checks before the stale block. |
| Heading `Home` + `#` raises H1→H2, one undo | **Pass** | `special-text` A1/A2 `v011-heading-marker-h1/h3`, undo restores H1; unit `heading-marker.test.ts` live-caret override. |
| special-text A1/A3 header `th` / body `td` assertions + split | **Pass** | `special-text` A1/A3; `artifacts/special-text/v011-table-cell-marks-1440x900.png`. |
| m4c1 Page bold + inline math + print/PDF text | **Pass** | `m4c1` case 8; `artifacts/m4c1/ui/print-table-cell-page-1440x900.png`, `print-table-cell-print-1440x900.png`, `print-table-cell.pdf` (`Ellipse`, `Shape`, `πab`). |
| markdown-file-view heading marker strip | **Pass** | `markdown-file-view` 5/5; `artifacts/markdown-file/tab.png`. |
| Typed GFM conversion (AC-08), focused test | **Pass (unit)** | `special-text.test.ts` “serializes typed paragraph marks and math back to cell source (AC-08)”. The UI typed-table case (`special-text` D) stays green; a typed-marks UI case was not added. |
| `editor-appearance` at 13, run-only | **Pass** | Count 13, both below-table checks, and the table-relative bar offset is unchanged after moving to a deeper body row; `artifacts/editor-appearance/table-toolbar-header.png`. |

---

## 5. Evidence

- `artifacts/special-text/v011-heading-marker-h1-1440x900.png`
- `artifacts/special-text/v011-heading-marker-h3-1440x900.png`
- `artifacts/special-text/v011-heading-marker-read-1440x900.png`
- `artifacts/special-text/v011-formula-invalid-1440x900.png`
- `artifacts/special-text/v011-table-cell-marks-1440x900.png`
- `artifacts/special-text/v011-table-surface-split-1440x900.png`
- `artifacts/special-text/v011-html-math-paste-1440x900.png`
- `artifacts/m4c1/ui/print-table-cell-page-1440x900.png`
- `artifacts/m4c1/ui/print-table-cell-print-1440x900.png`
- `artifacts/m4c1/ui/print-table-cell.pdf`
- `artifacts/editor-appearance/table-toolbar-header.png` (13-action bar, below the table)
- `artifacts/editor-appearance/continuous-dark.png` (before the stale block)

Copy as Markdown stays:

```text
| **Bold** | *Italic* |
| --- | --- |
| $x^2$ | a<br>b |
```

---

## 6. Resolved: `editor-appearance` deep-body placement

The file's old block at lines 555–593 asserted the pre-P1 behavior: after three Tabs from the first
body row it called `waitToolbarAboveCell()` and required `toolbar.bottom <= cell.top`. With the bar
at the **table bottom edge** that can never pass. The orchestrator authorized the test-only change;
the block now asserts the table-relative bar offset is unchanged after moving to a deeper body row,
and keeps the 13-button and below-table checks. The suite is 1/1 green; no product behavior changed.

---

## 7. Risks and open items

- **`editor-appearance` was test-only updated.** The block asserted the removed above-cell placement;
  the new assertion checks the table-relative bottom-bar stability. Product code unchanged.
- **`Home` inside a heading is now product-handled.** Native macOS `Home` is a scroll command, so
  without this `Home` + `#` could never pass. Plain `Home` in a heading collapses to the heading
  start; `Shift+Home` is untouched. Paragraph `Home` remains native (a no-op on macOS); the formula
  UI cases use `Control+a` (the ProseMirror textblock-start command) instead.
- **Typed GFM marks are unit-proven.** The UI covers pasted marks/math and the existing typed-table
  conversion (plain text). A typed bold/math UI case would add runtime for no new code path.
- **`gfmInlineFromNode` drops link/highlight/anchor marks** from the typed table source, matching
  P2: those are not GFM cell syntax.
- **Literal `<br>` text** in a typed cell still becomes a hard break on conversion — the historical
  cell-format limitation, unchanged.
- **m4c1 helper tolerance.** A page with no edge SVG now compares `null === null`; pages that do
  render edges keep the full path/trunk comparison.
- **`anchor-performance` flake** from the Track A report is unrelated and did not appear in the
  full unit run.

## 8. Next step

Orchestrator: run `verify:fast` and the single full `verify` after merge. No push, tag, merge or PR
was performed by the builder.
