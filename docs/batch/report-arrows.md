# Track 2 report — arrow boundary (v0.1.2)

**Branch:** `t3/arrow-boundary-keymap` (the harness branch; the brief's intended name is
`t3/v0.1.2-arrow-boundary`).
**Base:** `3ad4017` (the brief commit).
**Commit:** `ceab1ac` — implementation, unit tests and the UI regressions; this report is the
follow-up commit on the same branch.
**Scope:** `docs/plan.md` #13 (T2) only: the editor keymap, the arrow-boundary lib, its unit test and
the owning UI suite.

---

## 1. Summary

Plain arrows no longer leave the block, mid-line included:

- **Vertical boundary is the visual line.** ArrowUp/ArrowDown are consumed when the live caret is
  on the first/last visual line of the block content, even when the caret is in the middle of the
  line. The old guard compared document offsets (`parentOffset === 0` / `=== content.size`), so a
  mid-word caret was reported as inward and the native key crossed the block.
- **A selected atom is guarded from its own end.** A selected inline formula (or block formula, or
  any other atom) at the end of the block body consumes ArrowRight/ArrowDown instead of falling
  through to the next block. The atom is only consumed: it is never replaced by a literal `$…$`
  source or turned into a block move.
- **The NodeSelection exemption is narrowed.** Only a code block or a table — the selected node
  itself or an ancestor — keeps the native key path. Every other selected node uses the boundary
  rule.
- **`⌘↑`/`⌘↓` and `⌘←`/`⌘→` are untouched.** Block navigation and line start/end stay the existing
  bindings; no new chord.
- **Live DOM caret, not only state.** The existing read of the browser caret (for the stale-state
  case after `⌘←`/`⌘→`) is preserved and now also feeds the line measurement.

## 2. Files changed

- `apps/desktop/src/renderer/src/editor/keymap.ts` — NodeSelection narrowing, line-aware boundary
  inputs, DOM line measurement helpers.
- `apps/desktop/src/renderer/src/lib/arrow-boundary.ts` — `atFirstLine`/`atLastLine` on the pure
  decision plus `visualLineBands`/`visualLineBoundary`.
- `apps/desktop/test/arrow-boundary.test.ts` — line-aware decision, atom-at-block-end and line-band
  geometry cases (16 tests).
- `tests/ui/special-text.test.mjs` — extended B2: mid-word Up/Down on both visual lines of a
  hard-break paragraph, `⌘↑`/`⌘↓`, `⌘←`/`⌘→`, inline formula at the block end, block formula at the
  block end, code block native arrows and its ArrowDown exit, table native ArrowDown between cells.
- `docs/batch/report-arrows.md` — this report.

No file outside the T2 area. No dependency, schema, version or lockfile change; no edit to
`docs/plan.md`, the brief, `tests/ui/suites.mjs` or the test runner.

## 3. Checks run

| Check | Result | Timing |
|---|---|---|
| `npx vitest run apps/desktop/test/arrow-boundary.test.ts` | 1 file, 16 tests passed | 59 ms (0.34 s wall) |
| `npm test` (full unit) | 183 files, 1920 tests passed | 8.70 s (8.91 s wall) |
| `npm run typecheck` (desktop node+web, core, layout, pdf) | exit 0, 0 `error TS` | 5.8 s |
| `npm run check:boundaries` | 306 files, 1495 imports, 16 rules | 0.43 s |
| `node --check tests/ui/special-text.test.mjs` | syntax ok | < 0.1 s |
| `special-text` UI lane (orchestrator) | 11/11 passed | 17 s |

**Not run by the builder, by the brief:** `npm run verify:fast`, `npm run e2e`, every Electron UI
suite, `test:recovery`, `test:perf`, `test:visual`. The orchestrator ran the single serialized
`special-text` lane; the other suites are at integration.

A local Chromium probe (Playwright against Chrome for Testing, not the app) confirmed the browser
primitives the new UI assertions rely on: `⌘←` from the second hard-break line lands at that line's
start (offset 0 of `beta`, not the paragraph start), `⌘→` at that line's end, ArrowUp across the
break keeps the column, and native ArrowDown in a table header cell moves to the next row's cell.

## 4. T2 acceptance

| Criterion (brief) | Status | Evidence |
|---|---|---|
| Plain ArrowRight on an inline-formula NodeSelection at the block end does not move to the next block | **Pass (unit + UI)** | `arrowBoundaryAction` consumes at `atBlockEnd`; keymap reads the atom end (`selection.from + nodeSize === $from.end(bodyDepth)`); UI B2 clicks the formula, then ArrowRight/ArrowDown, asserting the same block, the caret in the block, the atom present and no `$` in the prose |
| ArrowUp/ArrowDown at the first/last visual line stay mid-line (live DOM caret) | **Pass (unit + UI)** | `visualLineBands`/`visualLineBoundary`; keymap measures `.nf-block-prose` lines and `coordsAtPos` of the DOM-resolved caret; UI B2 hard-break block asserts mid-word Up and Down on both lines. The arrow keeps the visual column, so the character offset on the other line can differ; the test asserts the line and the block |
| A NodeSelection on a code block or table keeps the native path | **Pass (unit + UI)** | `atomic` covers the ancestor and the selected node (`codeBlock`/`table`); existing atomic unit cases; UI B2 asserts code-native arrows, the code ArrowDown exit and native table ArrowDown |
| Other selected atoms are never replaced by a literal `$` or a block move | **Pass (unit + UI)** | The node path only returns `stay`/`native`; UI B2 asserts no block move, the inline atom survives, the block formula keeps its selection, and the prose text has no `$` |
| `⌘↑`/`⌘↓` still navigate blocks | **Pass (bindings unchanged + UI)** | `block-previous`/`block-next` untouched; UI B2 presses both and waits for the selected block |
| `⌘←`/`⌘→` stay line start/end | **Pass (no binding added + UI)** | UI B2 asserts offset 0 and the line end inside the second visual line |
| No new chord | **Pass** | Only the existing `ArrowUp/ArrowDown/ArrowLeft/ArrowRight` bindings changed; no chord added |

## 5. Evidence

- Unit: `apps/desktop/test/arrow-boundary.test.ts` (16 tests, green).
- UI regression source: `tests/ui/special-text.test.mjs`, test `B2: plain arrows stay inside the
  block and ⌘↑/⌘↓ still navigate`.
- No screenshot: T2 changes input behavior only, and the brief asks for no screenshot on this
  track. The UI lane reads the live DOM caret and canonical block id, not pixels.

## 6. Implementation notes

- **Pure decision stays pure.** `arrowBoundaryAction` receives `atFirstLine`/`atLastLine` and falls
  back to the offset boundary when the geometry is missing, so an unmeasurable block keeps the
  previous behavior.
- **Line measurement.** Text line boxes inside `.nf-block-prose` are collected per text node, and a
  direct child that renders no text (empty paragraph, block formula, image) contributes its own box.
  Rects are merged into one band per visual line (2 px overlap tolerance), and the caret's vertical
  centre selects the band. Chrome layers beside the prose are never measured.
- **Live caret.** The DOM caret is resolved with `posAtDOM` and the box is read with
  `coordsAtPos` of that position; the state's `$from` is only used when the DOM point is missing or
  maps to another block. The existing stale-state rule is unchanged.
- **Node selection.** `atBlockStart` is deliberately false for a selected node: ArrowLeft must still
  collapse the selection inside the block instead of trapping it. Code/table nodes and ancestors
  return native before any geometry.
- **Perf.** Line geometry is computed only for ArrowUp/ArrowDown and is skipped in atomic contexts,
  so a table or code block never pays for measuring its content.
- **Page Edit and the `.md` guest editor have no `blockBody`**, so they keep their previous native
  arrow behavior. Continuous Read is still gated by `canEdit`.

## 7. Risks

- **UI lane run by the orchestrator.** `special-text` is 11/11 green. The only adjustment was a
  test expectation: ArrowUp keeps the visual column, so the character offset on the other line can
  differ; and an inline formula collapses to a caret in the block (the “continue writing” path),
  while a block formula keeps its NodeSelection. The product contract (no block move, atom
  survives, no literal `$`) is asserted.
- **Single-line blocks now consume plain ArrowUp/ArrowDown** at every column. This is the required
  behavior (`⌘↑`/`⌘↓` navigate blocks); it is a deliberate interaction change, not a regression.
- **Measurement fallback.** If the caret box or the block bands cannot be measured, the guard falls
  back to the offset boundary, which is the old behavior (mid-line keys may cross). No new failure
  path is introduced; the fallback only affects unmeasured blocks.
- **Tall inline atoms are not line bands.** Only text lines and textless child boxes are measured, so
  an inline formula does not inflate the first/last band. A line that contains only an inline atom
  has no text band; a caret cannot be inside it, and the offset fallback covers the paragraph
  boundary.
- **Interactive wrap.** For a soft-wrapped paragraph the bands come from the rendered lines, so the
  guard follows the actual wrap. The UI regression uses a hard break to be width-independent; the
  code path is the same.

## 8. Next step

T3 is merged. T2's `special-text` lane is green; merge T2 after T3, then T1 when it lands. The
orchestrator runs `verify:fast` per merge and the single full `verify` at the end. No merge, push,
tag or PR was performed by the builder.
