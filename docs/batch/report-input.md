# Track A report input — editor input and paste (v0.1.1)

**Branch:** `t3/track-a-editor-input-paste` (the harness branch; the brief's intended name is
`t3/v0.1.1-input`).
**Base:** `1a91281` (brief, plan and ADR on `main`).
**Commit:** the single Track A commit on this branch (SHA reported in the handoff message).
**Scope:** plan §4.2 checkpoints A0–A3, only the files in plan §5.1.

---

## 1. Summary

Four input/paste fixes are implemented:

1. **HTML math paste** — foreign KaTeX, MathJax (`mjx-container`, `math/tex` script) and Obsidian
   `.math`/`.math-inline` containers are normalized to the editor's own
   `<span data-type="inline-math" data-latex="…">` shape in `transformPastedHTML`, before the slice
   is parsed. NoteForest's own math HTML is returned unchanged.
2. **GFM cell inline layer** — one neutral AST (text, hard break, bold, italic, strike, code,
   inline math) with a parser and serializer. Table paste and typed conversion build real marks and
   `inlineMath` nodes from cell source; Copy as Markdown writes them back with one escape contract.
3. **Heading marker** — a `Decoration.widget` `#`×level at the start of the heading that owns an
   editable caret. `#` at the start raises H1→H2→H3 (the fourth is a consumed no-op at the note
   cap); Backspace lowers H3→H2→H1→paragraph; Read mode shows nothing; the marker is never document
   text. The flat guest schema follows 1–6.
4. **Formula `$` toggle** — a non-empty selection inside one textblock wraps into one `inlineMath`
   with the trimmed source; an inline-formula `NodeSelection` unwraps to its LaTeX. Barriers,
   anchors, invalid LaTeX and the one-undo rule follow plan §6 A2 and §8.2.

The table toolbar gained the Bold, Italic, Inline code and Inline formula cluster. Page Edit stays
render-only; the selection bubble stays suppressed in cells.

---

## 2. Files changed

New:

- `apps/desktop/src/renderer/src/lib/gfm-inline.ts`
- `apps/desktop/src/renderer/src/lib/html-math.ts`
- `apps/desktop/src/renderer/src/lib/heading-marker.ts`
- `apps/desktop/src/renderer/src/lib/formula-toggle.ts`
- `apps/desktop/src/renderer/src/editor/html-math-paste.ts`
- `apps/desktop/src/renderer/src/editor/heading-marker.ts`
- `apps/desktop/src/renderer/src/editor/formula-toggle.ts`
- `apps/desktop/test/gfm-inline.test.ts`
- `apps/desktop/test/html-math-paste.test.ts`
- `apps/desktop/test/heading-marker.test.ts`
- `apps/desktop/test/formula-toggle.test.ts`
- `docs/batch/report-input.md` (this file)

Edited:

- `apps/desktop/src/renderer/src/lib/gfm-table.ts` — splitter keeps non-pipe escapes for the inline
  layer; `tableCellText` delegates to the inline serializer.
- `apps/desktop/src/renderer/src/editor/table-node.ts` — the inline AST builds schema marks and
  `inlineMath` nodes; hard breaks; the one-paragraph cell model is unchanged.
- `apps/desktop/src/renderer/src/editor/TableToolbar.tsx` — the formatting cluster.
- `apps/desktop/src/renderer/src/editor/extensions.ts` — registers the three new extensions.
- `apps/desktop/src/renderer/src/markdown/flat-schema.ts` — the same three, heading cap 6.
- `apps/desktop/src/renderer/src/styles.css` — heading-marker widget style (mirrors the inline-code
  delimiter token).
- `apps/desktop/test/special-text.test.ts` — cell marks/math parse → node → serialize cases.
- `tests/support/harness.mjs` — `writeClipboardHtml(text, html)`.
- `tests/ui/special-text.test.mjs` — marker, formula toggle, cell marks/copy/cluster, HTML math paste.
- `tests/ui/m4c1-print-compositor.test.mjs` — one table-cell bold + inline-math Page/print/PDF case.

No file outside plan §5.1 was touched. No dependency, schema, version or lockfile change.

---

## 3. Checks run

| Check | Result | Timing |
|---|---|---|
| A0 baseline `npm test` on the untouched branch | 178 files, 1833 tests passed | 9.86 s (10.8 s wall) |
| A1 focused: `npx vitest run gfm-inline html-math-paste special-text table-cell-guard formula-clipboard` | 5 files, 67 tests passed | 0.39 s (0.80 s wall) |
| A2 focused: `npx vitest run heading-marker formula-toggle formula-transactions` | 3 files, 32 tests passed | 0.41 s (0.81 s wall) |
| Full unit `npm test` (final) | 182 files, 1889 tests passed | 9.10 s (9.31 s wall) |
| `npm run typecheck` | passed (desktop node + web, core, layout, pdf) | 6.3 s |
| `npm run check:boundaries` | 306 files, 1497 imports, 16 rules | 0.4 s |
| `npm run build` (electron-vite) | main, preload, renderer built | 0.8 s |

One intermediate full `npm test` run failed the pre-existing
`packages/core/test/anchor-performance.test.ts` p95 guard at 16.56 ms (limit 16 ms) under parallel
load; it passes in isolation and the final full run is green. See risks.

**Not run, by the brief:** `npm run verify:fast`, `npm run e2e`, all Electron UI suites,
`test:perf`, `test:visual`. The UI edits are written and syntax-checked, but the orchestrator owns
the single serialized Electron lane.

---

## 4. Acceptance criteria

| AC | Status | Evidence |
|---|---|---|
| AC-01 marker one `#` per level, not content | **Pass (unit); UI pending lane** | `heading-marker.test.ts` marker text/visibility; `special-text` UI asserts `#`/`##`/`###`, `contenteditable=false`, `aria-hidden=true`, canonical heading text `Title` only |
| AC-02 raise/no-op/lower/one undo | **Pass (unit); UI pending lane** | `heading-marker.test.ts` level transactions and consume at cap; `special-text` UI H1→H2→H3, fourth `#` no-op, Backspace to paragraph, undo restores the level |
| AC-03 Enter paragraph, Shift+Enter break, `# ` rule | **Pending UI lane** | `# ` asserted in the marker UI case; Enter and Shift+Enter cases added (`st-heading-enter`, `st-heading-break`); editor keymap unchanged |
| AC-04 no marker in Read/PDF, Page Edit shows it | **Partial: Read case pending UI; Page Edit/PDF run-only** | `heading-marker.test.ts` `editable:false` → null; UI Read case added; `m4b1b1` run-only, PDF text has no affordance because the paginator never sees the widget |
| AC-05 wrap trimmed selection, whitespace text, one undo | **Pass (unit); UI pending lane** | `formula-toggle.test.ts` trim/one step/NodeSelection; UI `  x^2  ` → `data-latex="x^2"`, first/last text `'  '`, one undo |
| AC-06 unwrap, barriers, anchors, non-formula atom | **Pass (unit); UI pending lane** | `formula-toggle.test.ts` NodeSelection unwrap/empty core/code block/cross-textblock/AllSelection/consume; UI block-math atom consumes `$`; anchor test proves the mark is dropped and the original record is untouched |
| AC-07 invalid LaTeX visible | **Pass (unit); UI pending lane** | `formula-toggle.test.ts` `\frac{` kept; UI asserts `data-latex="\frac{"` and `.katex-error` |
| AC-08 cell marks/math from pasted/typed GFM | **Partial — pasted pass; typed source capture gap** | `gfm-inline.test.ts` + `special-text.test.ts` parse → node → serialize; UI pasted `**bold**`, `*italic*`, `$x^2$`, `a<br>b` are real marks/nodes. **Typed path:** `table-commands.ts` captures `paragraph.textContent`, so delimiters already consumed by the inline input rules (bold/italic/code/math) are not recoverable. That file is outside plan §5.1; reported, not changed (see risks) |
| AC-09 Copy as Markdown round-trip | **Pass (unit)** | `gfm-inline.test.ts` escape contract (`\ * _ ` $ ~ |`) and round-trip; `special-text.test.ts` parse→block→serialize equality; UI Clipboard assertion for `| **Bold** | *Italic* |\n| --- | --- |\n| $x^2$ | a<br>b |` |
| AC-10 block content refused, one paragraph | **Pass** | No schema change; `table-cell-guard.test.ts` run green; `special-text.test.ts` cell stays one paragraph |
| AC-11 toolbar cluster, no second bubble, guest same toolbar, no Page Edit cluster | **Pass (implementation); UI pending lane, guest/Page Edit run-only** | `TableToolbar.tsx` cluster with `data-action` hooks; `SelectionToolbar` untouched (`!isActive('table')`); `MarkdownFileEditor` mounts the same component; Page Edit has no toolbar. UI asserts no selection bubble over a cell |
| AC-12 cell bold + formula in Continuous/Page/PDF | **Pass (implementation); m4c1 pending lane** | UI cluster case for Continuous; new `m4c1` case asserts Page Read `strong` + `.nf-math-inline`, print-host parity and PDF text `Ellipse`/`Shape`; no table layout change |
| AC-13 HTML math paste + NoteForest rich paste | **Pass (unit); UI pending lane, rich paste run-only** | `html-math-paste.test.ts` KaTeX/MathJax v2+v3/Obsidian/entities/lists/marks/own-HTML guard; UI dual-format clipboard list with bold `Speed` + formula `v`; `markdown-file-view` run-only |

---

## 5. Evidence

Expected paths from the UI cases (to be produced by the orchestrator's Electron lane):

- `artifacts/special-text/v011-heading-marker-h1-1440x900.png`
- `artifacts/special-text/v011-heading-marker-h3-1440x900.png`
- `artifacts/special-text/v011-heading-marker-read-1440x900.png`
- `artifacts/special-text/v011-formula-invalid-1440x900.png`
- `artifacts/special-text/v011-table-cell-marks-1440x900.png`
- `artifacts/special-text/v011-table-toolbar-cluster-1440x900.png`
- `artifacts/special-text/v011-html-math-paste-1440x900.png`
- `artifacts/m4c1/ui/print-table-cell-page-1440x900.png`
- `artifacts/m4c1/ui/print-table-cell-print-1440x900.png`
- `artifacts/m4c1/ui/print-table-cell.pdf`

Unit evidence (green, no artifacts): `apps/desktop/test/{gfm-inline,html-math-paste,heading-marker,formula-toggle,special-text}.test.ts`.

Copy as Markdown expected string, proved by `special-text.test.ts` and the UI case:

```text
| **Bold** | *Italic* |
| --- | --- |
| $x^2$ | a<br>b |
```

---

## 6. Implementation notes

- **GFM escape layers.** The row splitter resolves only the structural pipe (`\|`, one escaping
  backslash removed) and preserves every other escape, including `\\`, for the inline layer. An
  escaped delimiter is therefore unescaped exactly once. The inline serializer escapes
  `\ * _ ` $ ~`; pipes stay with `escapeGfmCell`. A literal `\` + `|` round-trips.
- **Inline AST.** Marks are a flat set per text run. The serializer keeps an open-delimiter stack so
  `**a *b* c**` stays one bold run around an italic run, and handles the `***` combined run and
  adjacent italic→bold / bold→italic boundaries.
- **Math guards.** The inline cell parser reuses `findInlineMathInput`, so `$5 and $10`, `$ x $`,
  `$$x$$` and escaped `\$` behave exactly like typing in prose.
- **HTML math.** The normalizer is a string scanner, not a DOM parser: balanced containers are
  matched by tag name/attributes, the TeX `annotation` wins, the element text is the fallback, and
  entities are decoded then re-encoded into `data-latex`. NoteForest's own `data-type` math returns
  the fragment unchanged.
- **`transformPastedHTML`.** It is implemented as the TipTap extension field (composed into the
  view's paste pipeline), not a ProseMirror plugin prop: TipTap's composed direct prop would shadow
  a plugin prop.
- **Heading marker.** The extension priority is 1100 so its `handleKeyDown` sees Backspace before
  the branch keymap's "never cross the block" rule. `closeHistory` keeps each level change out of
  the preceding typing group.
- **Formula toggle.** `$` is read from `event.key`, not a layout key code; Meta/Ctrl/Alt and IME
  composition are not intercepted. `view.editable` gates both key handlers.

---

## 7. Risks and open items

- **Typed GFM conversion source capture (AC-08 partial).** `table-commands.ts` builds the typed run
  from `paragraph.textContent`; by the time the user presses Enter, the bold/italic/code/math input
  rules have usually consumed the delimiters and the atom's text is empty. Paste, parse and the
  cell builder are correct. A fix needs `table-commands.ts` (outside plan §5.1) to pass the
  paragraph's ProseMirror inline content (or a cell-aware serializer) to the table builder. This is
  a plan-scope amendment, not implemented here. The plan's named AC-08 test files do not cover this
  path; the UI case covers paste.
- **UI lane unrun.** Every new UI assertion is unexecuted by the builder, as required. The
  orchestrator must run `node --test tests/ui/special-text.test.mjs` and
  `node --test tests/ui/m4c1-print-compositor.test.mjs` in the serialized Electron lane, plus the
  run-only `markdown-file-view` and `m4b1b1` regressions.
- **`tests/ui/editor-appearance.test.mjs` will fail on its button count.** Line 545 asserts
  `headerGeometry.buttons.length === 13`; the new formatting cluster makes it 17. The file is not in
  plan §5.1, so it was **not edited** (the file map is exhaustive and a file outside it is a stop
  condition). The required one-line fix is `13` → `17`; no other assertion in that suite depends on
  the button list, and the toolbar height stays one compact row. The orchestrator should amend the
  file map or apply that change before the lane.
- **Perf guard flake.** `packages/core/test/anchor-performance.test.ts` failed once at 16.56 ms
  against a 16 ms p95 while the whole pool was busy; it passes alone and in the final full run. This
  is pre-existing and unrelated to Track A; do not rerun `verify` twice on account of it unless it
  repeats.
- **`_` is not an emphasis delimiter.** The narrow cell parser reads `*` for emphasis only; `_` is
  escaped on write and unescaped on read. External GFM using `_` emphasis stays literal. Q5/P2 allow
  the narrow layer; a wider dialect would be a format decision.
- **Literal `<br>` text** in a cell serializes to the hard-break syntax, the same historical
  limitation as `escapeGfmCell`.
- **Marker in Page Edit** relies on `editor.isEditable`; Page Edit is editable in its overlay, so
  AC-04's "shows it like Continuous Edit" should hold. It was not run here.

## 8. Next step

Orchestrator: run the single serialized Electron lane on this branch (`special-text`, `m4c1`, the
run-only `markdown-file-view`/`m4b1b1` and the touched unit files), then merge after the Page-gap
branch. Decide whether to amend plan §5.1 for the typed GFM cell capture; it is the only acceptance
sub-case not fully met. No push, tag, merge or PR was performed.
