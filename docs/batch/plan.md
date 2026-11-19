# Plan — v0.1.1 input and Page gap

**Role:** Planner (design package; no application code, no tests, no `docs/plan.md` edit).
**Base:** `6c7a631` (the commit that contains `docs/batch/brief.md`).
**Branch:** `t3/v0-1-1-plan-and-adr` (the brief's name is `docs/v0.1.1-plan`; the worktree branch
was created by the harness — use the actual branch).
**Commit:** one docs commit, two artifacts plus the ADR index row. Not merged, not pushed.
**Contract:** `docs/batch/brief.md`; this plan and `docs/adr/0010-page-sibling-gap.md`.

---

## 1. Goal

Ship 0.1.1 — the already-merged anchor-resolution index (`fc8fbbc`) plus four editor input/paste
fixes and a per-document vertical Page sibling gap — built by two builders in parallel on disjoint
files, integrated once, verified once, and released as one 0.1.1 dmg.

---

## 2. Closed decisions (from the brief; do not reopen)

| # | Decision |
|---|---|
| D1 | **Track A scope:** heading marker toggle; formula `$` selection toggle; table-cell inline marks/formulas with GFM paste/export; HTML math paste normalization. |
| D2 | **Track B scope:** Page vertical sibling gap and ADR-0010. |
| D3 | **Out of scope:** the long inline-formula width (plan §13) and the arrow-boundary issue (plan §14). They stay in `docs/plan.md`. |
| D4 | **Page gap:** vertical only. The horizontal parent → right-group corridor stays a fixed 18 px engine constant; nothing horizontal is configurable. The vertical gap is fixed under density, is a per-document override, applies to Page and PDF. Default 18; range 0–96. No smaller default for new documents. |
| D5 | One release `0.1.1`; two worktrees/builders; one integration window; one full `verify` after both merges. |
| D6 | No new dependency. No document-schema change. No second derivation or layout rewrite. No Sentinel unless the product owner explicitly approves one. |
| D7 | The anchor batch's visible rules (callout lane, dots, trunk) are closed; do not reopen them. |

---

## 3. Plan-level decisions (delegated by the brief; implementation/UX detail, not product)

| # | Decision | Why |
|---|---|---|
| P1 | The table formatting actions go in the **existing `TableToolbar`** as one compact cluster: Bold, Italic, Inline code, Inline formula. The general `SelectionToolbar` stays suppressed inside tables. | The table already owns one contextual bar and `SelectionToolbar.shouldShow` explicitly defers to it. Two bubbles over one cell selection would stack, cover the cell and duplicate the table's command surface. |
| P2 | GFM cell inline support = **bold, italic, strike, inline code, inline math, hard break**. Links, highlights and anchor marks are not created by GFM paste and are exported as plain cell text. | The cell model is one paragraph of inline content; the brief names bold/italic/code/math and the acceptance only requires bold + `$…$`. Links need URL parsing/sanitization and are a separate format decision; highlights/anchors are not representable in GFM. |
| P3 | The heading marker removes a level with **Backspace at the heading start** (H3→H2→H1→paragraph); adds a level with `#` at the start. | Mirrors the marker the user sees; no new chord; keeps plain Backspace's "never cross the block" rule (the key is consumed by the heading, not by the block boundary). |
| P4 | The HTML math normalizer rewrites **foreign** containers only (`.math`, `.math-inline`, KaTeX/MathJax annotation) and leaves NoteForest's own inline-math markup untouched. | Protects NoteForest-to-NoteForest paste; the foreign shapes are the ones the bug reports use. |
| P5 | Axis split names: `LayoutOptions.siblingGap` = vertical; `LayoutOptions.rightGroupGap` = horizontal. `PAGE_EDGE_GEOMETRY.siblingGap` keeps its historical name as the **horizontal** 18 px constant. | One value cannot silently move both; the engine constant's name is preserved for continuity and pinned by comments/docs. |

---

## 4. Two-track parallel plan

### 4.1 Branches and base

| Track | Branch | Base | Start gate |
|---|---|---|---|
| Planner | `t3/v0-1-1-plan-and-adr` | `6c7a631` | now |
| Track A | `t3/v0.1.1-input` | the commit that merges this plan package (ADR included) | plan + ADR on `main` |
| Track B | `t3/v0.1.1-page-gap` | the same merge commit | plan + ADR on `main` |

Both builders branch from the **same** `main` commit. Neither rebases onto the other; the files are
disjoint (section 5). Track B's ADR is already on `main` before it starts.

### 4.2 Track A checkpoints (in order)

| Checkpoint | Content | Done when |
|---|---|---|
| **A0** | Branch and baseline. | `npm test` baseline recorded on the untouched branch; no product change before A1. |
| **A1 — paste** | HTML math normalization (P4) and the GFM cell inline parser/serializer (P2), including pasted `$…$` becoming real nodes in cells. | Unit tests for the normalizer and the GFM inline layer are green; the `special-text` paste cases are green; `npm run typecheck` green. |
| **A2 — toggles** | Heading marker (P3) and formula `$` wrap/unwrap, registered in the forest editor and the flat guest schema. | Unit tests + the `special-text` heading/formula cases green; Read mode shows no marker; invalid LaTeX visible; one undo step. |
| **A3 — table surface** | `TableToolbar` formatting cluster (P1) and the Continuous/Page/PDF cell proof. | `special-text` and the new `m4c1` cell case green; Copy as Markdown round-trip evidenced; `verify:fast` green on the branch. |

### 4.3 Track B checkpoints (in order)

| Checkpoint | Content | Done when |
|---|---|---|
| **B0** | Branch and baseline; confirm ADR-0010 is on `main`. | `npm test` baseline recorded; ADR link checked. |
| **B1 — model split** | `PageTheme.siblingGap` honoured on the vertical axis; `LayoutOptions.rightGroupGap` added; `layout.ts` horizontal reads use it; `effectivePageTheme` and `pageLayoutOptions` split. | `page-settings` / `page-gap` / `page-packing` / `page-compaction` unit tests green; `typecheck` green. |
| **B2 — settings** | `siblingGap` in `ADVANCED_LAYOUT_KEYS` and `PAGE_THEME_FIELD_SPECS` (Sibling gap, px, 0–96, step 1). | `page-advanced` unit tests + `ui-settings-advanced` field/validation case green. |
| **B3 — parity and docs** | Page/PDF/density evidence; spec §7.2, design tokens, `page-advanced.ts` comment; screenshots. | `print-parity`, `print-model`, `m4d1`, `r1b` green; `verify:fast` green; docs readable by `page-token-guards`. |

### 4.4 Serialized verification lane

Unit tests, typecheck and builds may run in parallel. **One Electron lane only**:

1. Track A runs `npm run verify:fast` and its touched UI files, one process at a time (or one
   surface group at `--concurrency 4`). Post the result.
2. Only then Track B runs `npm run verify:fast` and its touched UI files. Never two Electron suites
   at concurrency 4 at once, and never two `verify:fast` runs at once.
3. Merge order is fixed to avoid two integration orders: **`t3/v0.1.1-page-gap` first**, then
   `t3/v0.1.1-input`. The files are disjoint; the order is a process choice, not a dependency.
   After each merge run `verify:fast`; after both run the single full `verify`.
4. Track A adds no UI suite file and does not edit `tests/ui/suites.mjs`; Track B does not either.
   The UI count stays the same.

Touched suites are run directly with `node --test tests/ui/<file>` where a whole group would be
wasteful; the full `verify` (pool at concurrency 4) remains the integration gate. The rule that
matters is the serialized lane above.

---

## 5. Exact file collision map

Every file a builder may change is listed here. **A file not on this list is a stop condition**
(brief, "Two tracks collide on a file not listed in the plan"). "Run" means read/execute only, no
diff.

### 5.1 Track A (`t3/v0.1.1-input`)

| File | Kind | Note |
|---|---|---|
| `apps/desktop/src/renderer/src/lib/heading-marker.ts` | new | Pure level/range helpers: current heading level, add/remove level, cap, marker text. |
| `apps/desktop/src/renderer/src/editor/heading-marker.ts` | new | ProseMirror plugin: `#` at heading start, Backspace at heading start, `Decoration.widget`, `isEditable` gate. |
| `apps/desktop/src/renderer/src/lib/formula-toggle.ts` | new | Pure wrap/unwrap transactions and guards (one textblock, trimmed latex, barrier and empty-core rules). |
| `apps/desktop/src/renderer/src/editor/formula-toggle.ts` | new | `$` key handler (wrap selection, unwrap inline-math `NodeSelection`), no empty-caret interception. |
| `apps/desktop/src/renderer/src/lib/html-math.ts` | new | DOM-free foreign-math HTML normalizer (classes, TeX annotations, entities, NoteForest guard). |
| `apps/desktop/src/renderer/src/editor/html-math-paste.ts` | new | `transformPastedHTML` extension; converts foreign math to the editor's own inline-math HTML shape. |
| `apps/desktop/src/renderer/src/lib/gfm-inline.ts` | new | Cell inline AST ↔ GFM source: bold/italic/strike/code/math/hard break + escaping. |
| `apps/desktop/src/renderer/src/lib/gfm-table.ts` | edit | `tableCellText` delegates to the inline serializer; splitter/round-trip contract. |
| `apps/desktop/src/renderer/src/editor/table-node.ts` | edit | `tableNodeFromGfm` builds marks and inline-math nodes from the inline AST. |
| `apps/desktop/src/renderer/src/editor/TableToolbar.tsx` | edit | Formatting cluster (P1) with `data-action` hooks for tests. |
| `apps/desktop/src/renderer/src/editor/extensions.ts` | edit | Register the three new extensions in the forest editor. |
| `apps/desktop/src/renderer/src/markdown/flat-schema.ts` | edit | Register the same extensions in the flat guest schema (heading cap follows 1–6 there). |
| `apps/desktop/src/renderer/src/styles.css` | edit | Heading marker widget style only (mirror the inline-code delimiter token; no new copy). |
| `tests/support/harness.mjs` | edit | Add a dual-format clipboard helper (`text` + `html`) beside `writeClipboard`. Track A owns it. |
| `apps/desktop/test/heading-marker.test.ts` | new | Pure add/remove/cap/read-only/guest-level cases. |
| `apps/desktop/test/formula-toggle.test.ts` | new | Wrap/unwrap/guards/trim/one-transaction cases. |
| `apps/desktop/test/html-math-paste.test.ts` | new | Synthetic `.math`, KaTeX and MathJax annotation clips; NoteForest HTML untouched; list/mark preservation. |
| `apps/desktop/test/gfm-inline.test.ts` | new | Parse/serialize marks, math guards, escapes, round-trip, malformed input. |
| `apps/desktop/test/special-text.test.ts` | edit | Table cell marks/math through `parseGfmTable`/`gfmFromTableNode`. |
| `tests/ui/special-text.test.mjs` | edit | Heading marker, formula toggle, cell paste/copy cases (section 10.2). |
| `tests/ui/m4c1-print-compositor.test.mjs` | edit | One focused table-cell bold + inline-math Page/PDF parity case. |
| `docs/batch/report-input.md` | new | Track A builder report input (avoids `report.md` collision). |

**Track A run-only:** `apps/desktop/test/table-cell-guard.test.ts`,
`apps/desktop/test/formula-transactions.test.ts`, `apps/desktop/test/formula-clipboard.test.ts`,
`tests/ui/markdown-file-view.test.mjs` (NoteForest rich paste regression; serial suite),
`tests/ui/m4b1b1-page-edit-overlay.test.mjs` (cell formula rendering in Page Edit).

### 5.2 Track B (`t3/v0.1.1-page-gap`)

| File | Kind | Note |
|---|---|---|
| `packages/layout/src/page-settings.ts` | edit | Constants, preset defaults, sanitize fallback 18, `effectivePageTheme` no overwrite/no density, `pageLayoutOptions` split. |
| `packages/layout/src/types.ts` | edit | `LayoutOptions.rightGroupGap`; `DEFAULT_LAYOUT_OPTIONS` gets 24 for both axes. |
| `packages/layout/src/layout.ts` | edit | Horizontal reads (`subtreeColumn`, `rightX`, compaction rows, preferred width) use `rightGroupGap`; vertical reads keep `siblingGap`. |
| `packages/layout/src/edge-style.ts` | edit | Comment only: `siblingGap` is the horizontal corridor; value stays 18. |
| `apps/desktop/src/renderer/src/settings/page-advanced.ts` | edit | `ADVANCED_LAYOUT_KEYS` + `PAGE_THEME_FIELD_SPECS` entry; update the "corridor is not exposed" comment. |
| `apps/desktop/src/renderer/src/settings/PageAdvancedSettings.tsx` | edit (conditional) | Only the group help sentence if the product owner approves the copy in Q4; otherwise untouched. |
| `docs/spec.md` | edit | §7.2 split; §4.7 theme row adds sibling gap. |
| `docs/design-tokens-page.md` | edit | `siblingGap` setting row; corridor table; density list; `DEFAULT_LAYOUT_OPTIONS` row for `rightGroupGap` (keep the `| \`key\` | number |` format that `page-token-guards` parses). |
| `packages/layout/test/page-gap.test.ts` | new | Vertical-only movement, 0/18/40/96, density 60/100/120, below-group, no overlap. |
| `packages/layout/test/page-settings.test.ts` | edit | Map/effective/defaults; rewrite the "legacy corridor ignored" case as "vertical honoured, corridor fixed". |
| `packages/layout/test/page-packing.test.ts` | edit | The 16 px horizontal-safe-gap case uses `rightGroupGap`; audit axis-specific `DEFAULT_LAYOUT_OPTIONS.siblingGap` reads. |
| `packages/layout/test/page-compaction.test.ts` | edit | Lab oracle: set both axes to the old 16 so the fixture signature is unchanged. |
| `apps/desktop/test/page-advanced.test.ts` | edit | Editable keys, spec range 0–96 step 1, invalid drafts blocked. |
| `apps/desktop/test/print-parity.test.ts` | edit | Stored 20 now applies vertically (100 % and 80 %); `rightGroupGap` 18; parity still holds. |
| `packages/pdf/test/print-model.test.ts` | edit | Per-document gap reaches the print model; a mismatched options pair still fails identity. |
| `tests/ui/ui-settings-advanced.test.mjs` | edit | `siblingGap` is visible (remove it from the hidden list), range validation and a saved value. |
| `tests/ui/r1b-page-settings.test.mjs` | edit | Per-document override applies to Page, persists, global stays 18. |
| `tests/ui/m4d1-page-density.test.mjs` | edit | 60/100/120 % does not scale the gap; horizontal child offsets stay 18 at a non-default gap. |
| `docs/batch/report-page-gap.md` | new | Track B builder report input. |

**Track B run-only:** `apps/desktop/test/page-token-guards.test.ts`,
`apps/desktop/test/page-model.test.ts`, `apps/desktop/test/page-edge-parity.test.ts`,
`apps/desktop/test/highlight.test.ts`, `apps/desktop/test/continuous-settings-isolation.test.ts`,
`apps/desktop/test/continuous-settings-preview.test.ts`, `apps/desktop/test/page-adapter.test.ts`,
`packages/layout/test/edge-style-isolation.test.ts`, `packages/layout/test/density-topology.test.ts`,
`tests/ui/m4b1-page-view.test.mjs`, `tests/ui/m4c1-print-compositor.test.mjs`,
`tests/ui/m4c3-pdf-gate.test.mjs`.

### 5.3 Shared / neither track

| File | Owner | Rule |
|---|---|---|
| `docs/batch/plan.md`, `docs/adr/0010-page-sibling-gap.md`, `docs/adr/README.md` | Planner (this commit) | Builders never edit. |
| `docs/batch/report.md` | Orchestrator | Written after both merges from the two track reports; never a builder collision. |
| `docs/plan.md` | Orchestrator | Do not edit in this batch; §13/§14 remain. |
| `docs/status.md`, `CHANGELOG.md`, all five `package.json`, `package-lock.json` | Orchestrator (release) | Section 14 only. |
| `tests/ui/suites.mjs` | Neither | No new UI suite file, so the list and its meta-test stay untouched. |
| `apps/desktop/src/renderer/src/settings/usePageSettingsController.ts` | Neither | It consumes the key lists; no edit expected. If it needs an edit, Track B owns it and the plan must be amended first. |

---

## 6. Numbered changes

### Track A

**A1 — paste layer.**

1. Add the DOM-free inline layer (`lib/gfm-inline.ts`): one neutral AST for text, hard break,
   bold, italic, strike, inline code and inline math; a parser with the same Obsidian `$…$` guards
   as `findInlineMathInput` (no space after the opening or before the closing `$`, no newline, no
   inner `$`, escaped delimiters stay literal) and a serializer with one escape contract for `\`,
   `*`, `_`, `` ` ``, `$`; pipes stay with `escapeGfmCell`.
2. Rewire `gfm-table.ts` (`tableCellText` → inline serializer) and `table-node.ts` (inline AST →
   schema marks + `inlineMath` nodes). Keep `GfmTableData` string cells and alignment unchanged.
3. Add `lib/html-math.ts`: recognize foreign math containers (`.math`, `.math-inline`, KaTeX
   `.katex-mathml`, MathJax `<annotation encoding="application/x-tex">`), take the TeX annotation
   first and the element text second, decode entities, drop the wrapper, keep the surrounding
   list/marks; return NoteForest's own HTML unchanged when it already carries the editor's math
   node shape.
4. Add `editor/html-math-paste.ts` with `transformPastedHTML`, registered in both extension sets.
   It rewrites each foreign container to the editor's **own** inline-math HTML shape (the shape
   `InlineFormulaNode` parses; the builder confirms it from the renderer rather than guessing).
5. Tests: unit + the `special-text` GFM paste and dual-format HTML paste cases (section 10.2).
   The table toolbar and Page/PDF proof stay in A3.

**A2 — toggles.**

1. Add `lib/heading-marker.ts` + `editor/heading-marker.ts`. The marker is a widget at the heading
   textblock start, `contenteditable=false`, `aria-hidden=true`, shown only when
   `editor.isEditable` and the caret is in that heading; text is `#` × level. Nothing is written to
   the document.
2. `#` with a collapsed caret at `parentOffset === 0` raises the level within the schema cap;
   Backspace at the same position lowers it, and H1 becomes a paragraph. Both dispatch one
   transaction that closes the history group, so one undo restores the previous level. At the cap,
   see Q2.
3. Add `lib/formula-toggle.ts` + `editor/formula-toggle.ts`. Non-empty selection in one textblock
   with no inline-math node in the range: replace the selection with `inlineMath` whose `latex` is
   the trimmed core; keep leading/trailing whitespace as text. Empty trimmed core or a barrier
   (cross-textblock, display math, image) → do not intercept (literal `$`). A `code` or `anchor`
   mark inside the selection is consumed with the text; an anchor loses its mark binding and
   resolves by selector or becomes visibly broken and repairable (spec §8.2/§8.6); the branch is
   never deleted and undo restores.
4. `NodeSelection` on `inlineMath`: replace the node with its `latex` text, keeping the node's
   marks, caret after the text; a formula anchor, if any, loses its node binding and resolves by
   selector or becomes visibly broken and undoable. Any other `NodeSelection` (block math, image,
   block) consumes `$` and does nothing, so a selected atom is never replaced by a literal `$`.
   Empty caret → never intercept; the `$…$` input rule and the formula paste rule stay as today.
5. Invalid LaTeX is not rejected: the node is created with the source and the existing KaTeX
   error rendering stays visible. No guessing, no rewrite.
6. Register in `createEditorExtensions` and `createFlatMarkdownExtensions`; the flat heading cap is
   its schema's 1–6, the note cap is 1–3 (Q2).

**A3 — table surface.**

1. Add the cluster to `TableToolbar` (P1): Bold, Italic, Inline code, Inline formula. Bold/italic/
   code use the editor's own toggle commands; the formula button wraps a non-empty selection with
   the A2 transaction, or inserts an empty inline formula and opens its source editor through the
   existing auto-edit path. `SelectionToolbar` keeps `!isActive('table')`.
2. Verify the cell model is unchanged: `InlineTableCell`/`InlineTableHeader` still hold exactly one
   paragraph; block content is still refused and never flattened (VH1).
3. Add the Page/PDF cell proof to `m4c1`: a table cell with bold text and an inline formula renders
   the same marks/nodes in Page Read and the print compositor, and the exported PDF text contains
   the cell text. No table layout change, no new page-break rule.
4. Copy as Markdown uses the A1 serializer; source panel shows the same string.

### Track B

**B1 — model split.**

1. Add `PAGE_SIBLING_GAP_MIN = 0`, `PAGE_SIBLING_GAP_MAX = 96`,
   `PAGE_SIBLING_GAP_DEFAULT = 18` (names are a suggestion; one source is required). Presets and
   `DEFAULT_PAGE_SETTINGS` use 18; `resolveTheme`'s fallback becomes the 18 default.
2. `effectivePageTheme`: remove `siblingGap` from the corridor object; normalize the stored value
   to 0–96 with the default 18; never multiply by density; keep the rest of the density lens
   unchanged.
3. `LayoutOptions`: add `rightGroupGap: number`; document both axes; `DEFAULT_LAYOUT_OPTIONS` keeps
   24/24. `pageLayoutOptions` maps `effective.siblingGap` → `siblingGap` and
   `PAGE_EDGE_GEOMETRY.siblingGap` → `rightGroupGap`.
4. `layout.ts`: horizontal reads use `rightGroupGap` — `subtreeColumn` remaining/preferred width,
   `rightX`, mode-A/beside right columns, compaction row/item gaps, preferred subtree width and
   row packing. Vertical reads keep `siblingGap` — below-group start, callout-stack transition,
   child cursor, wrap keep-out, compaction row top. Do not change the 18 px corridor, trunk insets,
   child indent or the arrowhead.
5. Update `edge-style.ts` comments only; value 18 stays.

**B2 — settings.**

1. Add `siblingGap` to `ADVANCED_LAYOUT_KEYS` (after `segmentGap`, before `wrapIndent`) and a
   `PAGE_THEME_FIELD_SPECS` entry `{ label: 'Sibling gap', unit: 'px', min: 0, max: 96, step: 1 }`.
2. The controller/UI inherit the field through the existing key lists; no new control type.
   Out-of-range drafts show the existing range error and block the write; no clamping by the UI.
3. Per-document override, the override dot and "Use global layout" work through the existing
   `withThemeField` / `withoutThemeField` path.

**B3 — parity, docs, evidence.**

1. `docs/spec.md` §7.2: separate the vertical setting (default 18, 0–96, per document, fixed under
   density, Page + PDF) from the horizontal corridor invariant (18, child indent 26, callout
   offsets, density-independent). §4.7 theme row adds "sibling gap".
2. `docs/design-tokens-page.md`: `siblingGap` row becomes a Page setting; the corridor table says
   `siblingGap` is the horizontal corridor only; the density paragraph removes it from the fixed
   corridor list and adds the vertical setting as fixed under density; the
   `DEFAULT_LAYOUT_OPTIONS` table gets a `rightGroupGap` row (24) in the exact format the token
   guard parses.
3. `page-advanced.ts` comment: the corridor is no longer "all hidden"; only the horizontal
   corridor fields stay hidden.
4. Evidence: Page 18 vs 40 in one document, horizontal child offsets unchanged, density 60/100/120
   with gap 40 unscaled, PDF print model carries 40, per-document reload persists. Screenshots and
   the measured numbers in the report.

---

## 7. Acceptance criteria

Each criterion is testable and has a named owner. Track A = `A`, Track B = `B`; the orchestrator
owns the final gate.

| ID | Criterion | Evidence |
|---|---|---|
| AC-01 | While the caret is in an editable heading, the marker shows exactly one `#` per level for H1–H3; the marker is not paragraph text and is absent from the canonical content and the block's text projection. | `heading-marker.test.ts`, `special-text` UI; document JSON snapshot. |
| AC-02 | Typing `#` at the heading start raises H1→H2→H3; Backspace at the start lowers H3→H2→H1→paragraph; each change is one undo step that restores the previous level. | `heading-marker.test.ts`, `special-text` UI undo assertions. |
| AC-03 | Enter at the end of a heading creates a paragraph; Shift+Enter is a hard break; paragraph→heading via the existing `# ` input rule still works. | `special-text` UI. |
| AC-04 | Continuous Read, Page Read and the PDF show no heading marker; Page Edit is editable and shows it like Continuous Edit; the PDF text layer has no `#` prefix added by the affordance. | `special-text` UI Read case; `m4b1b1` (run); `m4c1`/PDF text. |
| AC-05 | A non-empty selection inside one textblock wraps into one `inlineMath` with `latex` = trimmed selection; outer whitespace stays text; one undo restores the original text and marks. | `formula-toggle.test.ts`, `special-text` UI. |
| AC-06 | An `inlineMath` `NodeSelection` unwraps to its LaTeX source with one undo; empty-caret typing is not intercepted; code blocks, cross-textblock/display-math/image barriers and inline-math-containing selections are not intercepted; a wrapped or unwrapped range that carried an anchor leaves the anchor repairable (selector resolution or a visible broken state) and undoable; a `NodeSelection` that is not an inline formula is never replaced by a literal `$`. | `formula-toggle.test.ts`, `special-text` UI. |
| AC-07 | Invalid LaTeX wraps/unwraps without rejection: the node keeps the source and shows the existing inline error. | `formula-toggle.test.ts`, `special-text` UI (`.katex-error`). |
| AC-08 | A pasted or typed GFM table cell with `**bold**`, `*italic*`, `~~strike~~`, `` `code` ``, `$…$` and `<br>` becomes real marks/nodes in the cell; a pasted `$…$` is a node immediately, not literal until retyped. | `gfm-inline.test.ts`, `special-text.test.ts`, `special-text` UI. |
| AC-09 | Copy as Markdown writes the cell marks/math back and a parse→serialize→parse round-trip is stable; literal delimiters are escaped and survive. | `gfm-inline.test.ts`, `special-text` UI clipboard assertion. |
| AC-10 | Cell block content is still refused and never flattened (VH1); the cell remains one paragraph. | `table-cell-guard.test.ts` (run), `special-text` UI. |
| AC-11 | The table toolbar exposes Bold, Italic, Inline code and Inline formula; no second selection bubble appears in a cell; the actions work in Continuous, and the guest Markdown editor mounts the same toolbar (no second copy). | `special-text` UI, `markdown-file-view` (run). |
| AC-12 | Bold + inline formula in a cell render in Continuous, Page Read and the print/PDF output; table pagination rules are unchanged. | `special-text` UI, `m4c1` UI + PDF text. |
| AC-13 | A dual-format clipboard with plain `$…$` and HTML `.math`/annotation spans pastes as a list with the formulas restored and the other marks kept; NoteForest-to-NoteForest rich paste is unchanged. | `html-math-paste.test.ts`, `special-text` UI, `markdown-file-view` (run). |
| AC-14 | `PageTheme.siblingGap` is the vertical gap: default 18, clamp 0–96, per-document override, fixed under density; Page Read/Edit and PDF use the resolved value. | `page-settings.test.ts`, `page-gap.test.ts`, `print-parity.test.ts`, `print-model.test.ts`, `r1b` UI. |
| AC-15 | Changing the setting moves vertical card spacing only; every horizontal child offset and the parent → right-group corridor stay 18 at 0/18/40/96. | `page-gap.test.ts`, `m4d1` UI measurements. |
| AC-16 | Density 60/100/120 does not scale the gap; default documents keep 18 and the same page count as the baseline. | `page-settings.test.ts`, `m4d1` UI. |
| AC-17 | Advanced layout shows "Sibling gap" in px with step 1, validates 0–96, rejects out-of-range drafts, and supports the per-document override dot and "Use global layout". | `page-advanced.test.ts`, `ui-settings-advanced` UI. |
| AC-18 | Spec §7.2, design tokens and the `page-advanced.ts` comment describe the split; the token guard passes; Continuous is untouched. | `page-token-guards.test.ts` (run), docs diff. |
| AC-19 | No new dependency and no document-schema change; no marker text in content and no permanent editor state; `verify:fast` per branch and one full `verify` at integration are green. | Dependency diff of the code batch (no added/removed package; only the release version bump later), schema fixture unchanged, `verify` output. |

---

## 8. Edge cases and behavior

### 8.1 Heading marker

- Caret outside the heading → no marker; caret in a nested inline node inside the heading → marker
  still shows (the heading owns the caret).
- Empty heading, H1–H3, heading inside a blockquote/list → marker; level changes work.
- Read mode (`isEditable === false`) → no marker in Continuous Read, Page Read/PDF; Page Edit is
  editable and shows it.
- `#` with a non-collapsed selection or with a modifier → not intercepted (literal typing replaces
  the selection as today).
- IME composition (`event.isComposing`) → not intercepted.
- H3 + `#` → open question Q2 (proposed: consume, no level change; there is no H4 in a note).
- Guest `.md` headings H4–H6 → the extension uses the flat schema's cap 6; a note caps at 3.
- Undo/redo after a level change restores the level, not the whole block; a second undo restores
  the preceding text edit.
- Copy, find and text projection see no marker (the widget is not content).
- Backspace at paragraph start keeps the existing "stay in block" behavior; only a heading start
  removes a level.

### 8.2 Formula `$` toggle

- Selection with leading/trailing spaces → spaces stay text, `latex` is the trimmed core; an
  all-whitespace selection is not intercepted.
- Selection inside one textblock but spanning marks → node created; marks inside the range
  (including `code` and `anchor`) are not preserved inside the atomic formula; outer text marks are
  untouched. A text anchor in the range loses its mark binding and resolves by selector or becomes
  visibly broken and repairable; the branch is never deleted and undo restores the mark.
- Selection containing `inlineMath`, or crossing a textblock/display math/image → not intercepted;
  the literal `$` replaces the selection as a normal key would.
- `NodeSelection` on `inlineMath` (anchored or not) unwraps to latex text with the node's marks; a
  formula anchor loses its node binding and resolves by selector or becomes visibly broken and
  undoable. `NodeSelection` on `blockMath` or another atom → the key is consumed with no change
  (never replace a selected atom with `$`).
- Invalid latex (e.g. `\frac{`) → node created, `.katex-error` visible, no rejection/repair.
- Empty caret in prose, heading, table cell → never intercepted; `$…$` input rule and the
  exact-string formula paste rule unchanged.
- One undo per wrap/unwrap; a second undo restores the prior edit.
- Table cell: same wrap/unwrap; block-formula conversion stays refused inside a cell (existing
  `formulaKindTransaction` guard).

### 8.3 Table cells

- GFM splitter: escaped pipes `\|`, `<br>`/newline → hard break, alignment row, inconsistent
  columns → no table (unchanged).
- Inline parser: unmatched `**`, `*`, `~~`, backticks or `$` stay literal; `$5 and $10` is not
  math (same guards); `$ x $` is not math; nested/overlapping delimiters resolve left-to-right;
  a literal `$` round-trips with `\$`.
- Header cells and body cells use the same path; an empty cell is an empty paragraph.
- A cell with only math, bold + math, or math + hard break is valid.
- Pasting a table into a table, or into a code block, keeps today's refusal.
- Block content pasted into a cell is still refused; a multi-paragraph cell never flattens.
- Page/PDF: marks and inline math render; a table row is still atomic; no new break rule.
- The guest `.md` editor's table toolbar gets the same cluster; its flat schema already has the
  marks and inline math.

### 8.4 HTML math paste

- Dual-format clipboard (plain `$…$` + HTML with math spans): the HTML path wins; the result keeps
  the list structure, the bold/italic/link marks and the formulas as inline nodes.
- KaTeX variant (`.katex` + `.katex-mathml` + `<annotation encoding="application/x-tex">`) and
  MathJax variant (`<mjx-container>` + `<math>` + annotation) both normalize; the annotation wins
  over rendered glyph text.
- Obsidian-style `.math`/`.math-inline` spans without an annotation use their text content.
- Multiple spans on one line, math in a list item, entities (`&amp;`, `&lt;`) and nested tags are
  preserved.
- NoteForest's own inline-math HTML is untouched (no double conversion, no nesting); copying a note
  to another note is byte-compatible in the resulting content.
- No math span → the paste is untouched; empty/plain clipboard → untouched.

### 8.5 Page gap

- 0 → cards touch; no overlap, no negative cursor; 96 → larger page count possible, no clipping.
- 18 default → identical page count/geometry to 0.1.0 (baseline).
- Per-document override at 40 → Page Read/Edit and PDF; global stays 18; reload keeps 40.
- Density 60/100/120 → the gap value is the stored value (not scaled); typography/padding still
  scale, so page count may change for the existing density reason.
- Horizontal child x, arrow corridor, child indent, callout right gap and trunk insets never move
  with the setting.
- Mode A/B2 callout transition uses the vertical gap; callout-to-callout stays `calloutGap` (16).
- `stacked` legacy packing uses the vertical gap for its stacks; `compaction` keeps its lab
  oracle by setting both axes to the old value in tests.
- A stored legacy `siblingGap` (e.g. 40) now applies; no migration and no document write.
- Manual breaks and continuation markers follow the new pagination; an unhonoured hint warning is
  unchanged.

---

## 9. Non-goals

- The long inline-formula width (plan §13) and the arrow-boundary issue (plan §14).
- A horizontal gap setting, per-block/per-chapter gap, or any new layout model.
- A document-schema change or page settings in `document.json`.
- New dependencies; new UI suite files; `tests/ui/suites.mjs` changes.
- Block content in table cells, merged cells, table resize, or table layout changes.
- Links/highlights/anchors in GFM cells; Markdown export beyond the existing Copy as Markdown.
- A formatting toolbar in the Page Edit overlay (it has no formatting chrome today; Page/PDF only
  render the stored marks/nodes).
- Copy changes beyond the "Sibling gap" label and the conditional group help (Q4).
- Callout lane/dot/trunk changes from the anchor batch.

---

## 10. Required tests and evidence

### 10.1 Unit / integration

**Track A**

- `apps/desktop/test/heading-marker.test.ts` (new): level add/remove/cap, read-only, guest cap,
  marker text, no document text, one transaction.
- `apps/desktop/test/formula-toggle.test.ts` (new): wrap/unwrap, trim, barriers (cross-textblock,
  display math, image, inline math), empty core, one transaction, invalid latex, anchor-broken
  consequence.
- `apps/desktop/test/html-math-paste.test.ts` (new): KaTeX/MathJax/Obsidian variants, entities,
  multiple spans, NoteForest guard, list/mark preservation.
- `apps/desktop/test/gfm-inline.test.ts` (new): parser/serializer, escapes, math guards,
  round-trip, malformed input.
- `apps/desktop/test/special-text.test.ts` (edit): `parseGfmTable`/`gfmFromTableNode` with marks
  and math.
- Run: `table-cell-guard.test.ts`, `formula-transactions.test.ts`, `formula-clipboard.test.ts`.

**Track B**

- `packages/layout/test/page-gap.test.ts` (new): 0/18/40/96 vertical movement, horizontal x fixed
  at 18, below-group, callout transition, density 60/100/120, no overlap.
- `packages/layout/test/page-settings.test.ts` (edit): default 18, clamp, override, effective
  no-scale, options split; rewrite the legacy-corridor case.
- `packages/layout/test/page-packing.test.ts` (edit): horizontal safe-gap case and axis audit.
- `packages/layout/test/page-compaction.test.ts` (edit): lab oracle both axes at the old value.
- `apps/desktop/test/page-advanced.test.ts` (edit): editable key, spec, validation.
- `apps/desktop/test/print-parity.test.ts` (edit): stored 20 applies vertically; `rightGroupGap`
  18; Page/print parity at 100 % and 80 %.
- `packages/pdf/test/print-model.test.ts` (edit): per-document gap reaches the model; mismatched
  options fail identity.
- Run: `page-token-guards.test.ts`, `page-model.test.ts`, `page-edge-parity.test.ts`,
  `highlight.test.ts`, `continuous-settings-isolation.test.ts`, `continuous-settings-preview.test.ts`,
  `page-adapter.test.ts`, `edge-style-isolation.test.ts`, `density-topology.test.ts`.

### 10.2 UI suite matrix

| Suite | Track | Edit? | What it proves | Lane |
|---|---|---|---|---|
| `tests/ui/special-text.test.mjs` | A | extend | Heading marker H1–H3, add/remove/undo, Read no marker; formula wrap/unwrap/invalid/undo; table cell paste, marks/math, Copy as Markdown; cell formatting cluster. | A |
| `tests/ui/m4c1-print-compositor.test.mjs` | A | one case | Bold + inline formula in a cell: Page Read and print compositor parity; PDF text. | A |
| `tests/ui/markdown-file-view.test.mjs` | A | no | NoteForest ↔ guest rich paste still keeps table/formula/marks (regression; serial suite). | A |
| `tests/ui/m4b1b1-page-edit-overlay.test.mjs` | A | no | Cell formula still renders and the inline→block refusal still names the reason. | A |
| `tests/ui/ui-settings-advanced.test.mjs` | B | edit | "Sibling gap" field present, 0–96 validation, saved value, override dot. | B |
| `tests/ui/r1b-page-settings.test.mjs` | B | edit | Per-document gap 40 applies to Page, persists, global stays 18. | B |
| `tests/ui/m4d1-page-density.test.mjs` | B | edit | 60/100/120 % does not scale the gap; horizontal corridor stays 18. | B |
| `tests/ui/m4b1-page-view.test.mjs` | B | no | Page Read geometry/page count at the default. | B |
| `tests/ui/m4c3-pdf-gate.test.mjs` | B | no | Default PDF gate unchanged (page count, text, cuts). | B |

No two rows run at the same time. `markdown-file-view` is a `SERIAL_FILES` suite; keep it out of
any parallel pool.

### 10.3 Screenshots and evidence

- Track A: `special-text` artifacts showing the marker on H1/H2/H3, no marker in Read, the formula
  wrap/unwrap, the invalid-LaTeX error, the pasted table with bold + formula, and the table toolbar
  cluster. `m4c1` artifacts showing the cell in Page and print, plus the extracted PDF text line.
  Copy as Markdown output as text in the report.
- Track B: `ui-settings-advanced` screenshot of the new field; `r1b`/`m4d1` screenshots of Page at
  gap 18 and 40 with the measured horizontal offset; the JSON rect evidence (`layoutOptions`,
  block x/y) in the report; the print-model test output for gap 40.
- Every UI change has an app screenshot; no screen recording.
- Reports list artifact paths, commands, and the exact assertions, not "see above".

### 10.4 Commands

Per builder: focused `npx vitest run <files>` per checkpoint; `npm run typecheck`; at the end
`npm run verify:fast`. UI: `node --test tests/ui/<file>` per touched file (or a surface group at
`--concurrency 4`) inside the single Electron lane. Orchestrator: one full `npm run verify` at
integration. Do not add retries or sleeps; do not run two UI suites at concurrency 4 at once.

---

## 11. Rejected alternatives (plan-level)

- **Put table formatting in the selection bubble instead of the table toolbar** — two bubbles over
  one cell, and `SelectionToolbar` already defers to the table; rejected (P1).
- **Make the GFM inline layer a full Markdown parser** — out of scope, high risk, and the cell
  model has no block content; a narrow parser is enough (P2).
- **Normalize HTML math to literal `$…$` only** — prose paste would stay literal (the input rule
  does not run on paste); the slice must carry real nodes; rejected.
- **Use a second layout pass for the gap** — forbidden by the brief (no layout rewrite) and would
  create a second derivation; rejected.
- **Expose the horizontal corridor too** — contradicts D4 and ADR-0006; rejected.
- **Scale the gap with density** — rejected in ADR-0010.
- **Add a new UI suite for v0.1.1** — adds runtime and a `suites.mjs` edit for no coverage gain;
  extend the owning suites instead.
- **Fix the long inline formula or the arrow boundary now** — explicitly out of scope (D3).

---

## 12. Stop conditions

- Q1–Q4 need a product-owner answer and the builder would have to invent one.
- A change needs a document-schema change, a new dependency, an ADR beyond 0010, or a layout
  rewrite.
- A builder needs a file not in section 5, or the two tracks collide on any file.
- A visible change appears beyond the brief (new copy, another toolbar, a new chord).
- The horizontal corridor moves when the vertical gap changes; or Page/PDF parity fails.
- NoteForest-to-NoteForest rich paste breaks.
- A step stays red after one fix attempt.
- The code contradicts `docs/spec.md` or an accepted ADR in a way the plan cannot resolve.

---

## 13. Open questions and ambiguities

These are recorded, not silently resolved. A2/B3 stop if the owner disagrees.

| # | Question | Proposed default | Owner |
|---|---|---|---|
| Q1 | The brief says "vertical gap between sibling cards only", but the engine's `siblingGap` is the universal vertical stack gap: it also sets the parent → below-child gap and the callout-stack → child transition. Does the setting move those too? | Apply it to the existing vertical stack gap (all vertical card spacing); the horizontal corridor stays fixed. A strictly sibling-only gap would need a new layout option and is beyond "no layout rewrite". | Product owner |
| Q2 | Typing a fourth `#` at H3 (no H4 in a note) — consume it as a no-op, or insert a literal `#`? Guest `.md` files have H4–H6; use 1–6 there. | Consume at the note cap (no level change); follow the flat schema's 1–6 in guest files. | Product owner |
| Q3 | Removing a heading level uses Backspace at the heading start. Is that the ratified removal key? | Yes; it mirrors the marker and adds no chord. The alternative (Delete at the end) is not proposed. | Product owner |
| Q4 | The Advanced layout group help currently says "Values in pixels, per level." Sibling gap is not per level. May it become "Values in pixels. Editing a value makes this layer Custom."? | Keep the current sentence until approved; the field label and unit are already decided by the brief. | Product owner (copy) |
| Q5 | Table cell inline set beyond the brief's bold/italic/code + math: strike is included; links, highlights and anchors are not parsed and export as plain text. Acceptable? | Yes (P2). A link cell is a separate GFM/URL decision. | Product owner (scope confirmation) |
| Q6 | Page Edit has no formatting toolbar today; the new cluster is in the Continuous/guest table toolbar. Is rendering-only in Page Edit acceptable? | Yes; the brief's acceptance asks for Page/PDF rendering, not a Page Edit formatting surface. | Product owner (scope confirmation) |

Also ambiguous, resolved without a product decision:

- **"Sibling gap" name on the engine constant.** The brief keeps `PAGE_EDGE_GEOMETRY.siblingGap`
  (18) as the horizontal corridor; the plan keeps the name and adds `LayoutOptions.rightGroupGap`
  for explicit use (ADR-0010).
- **Brief branch name vs harness branch.** The brief says `docs/v0.1.1-plan`; the worktree is
  `t3/v0-1-1-plan-and-adr`. The actual branch is used; the orchestrator can rename at merge.
- **Two builder reports.** The single `docs/batch/report.md` would be a collision; each builder
  writes a track report input (`report-input.md`, `report-page-gap.md`) and the orchestrator writes
  the batch report. This is a process split, not a product decision.

---

## 14. v0.1.1 release steps

1. Both tracks merged into `main`; the single full `npm run verify` green at UI concurrency 4; no
   open S1/S2; the two track reports are folded into `docs/batch/report.md`.
2. Update `CHANGELOG.md` for 0.1.1: heading marker, formula `$` toggle, table-cell marks/formulas
   and GFM round-trip, HTML math paste, Page sibling gap. Keep the known limitations and note that
   plan §13/§14 remain.
3. Update `docs/status.md`: release date, tag, dmg path, installed app, verify counts, open
   product-owner gate (visual/VoiceOver/PDF).
4. Bump the version to `0.1.1` in the root, `apps/desktop`, `packages/core`, `packages/layout`,
   `packages/pdf`; regenerate the lockfile with `npm install --package-lock-only`; confirm a clean
   `npm ci` and typecheck from the lockfile.
5. `npm run dist`; packaged smoke on the dmg: open a fixture, Page Read, set the per-document gap to
   40, export a PDF, verify page count, real text and no missing glyphs; install with
   `scripts/install-local.mjs`.
6. Tag `v0.1.1` at the release commit; push/tag policy is the orchestrator's (the 0.1.0 release
   tagged the commit and installed locally). The product owner's manual visual/VoiceOver/PDF pass
   remains the release gate.
7. Remove both worktrees in the same step as the merge; keep the batch history in git.

---

## 15. Risks

- **Q1 interpretation** (parent→below gap also moves): the setting is more than "siblings only". If
  the owner wants the literal reading, stop; it needs a new layout option.
- **GFM escape contract** is the subtle part: `splitGfmRow` already unescapes `\|`/`\\`. The inline
  layer must not double-unescape; the round-trip tests (literal `\`, `*`, `_`, `` ` ``, `$`, `|`)
  are the guard.
- **HTML math normalization** may over-match prose that contains a `math` class or an annotation
  outside a formula. The NoteForest guard and the "no math container → untouched" test are the
  guard; a false positive is a bug, not a trade-off.
- **Settings UI copy** (Q4) is the only copy change; do not slip in other wording.
- **Page count drift** at a non-default gap is expected; the default 18 baseline must stay
  byte-compatible, so any default-page-count change is a defect.
- **UI serialization** is a process risk: two Electron lanes at once cause timeouts on this
  machine; the single lane in section 4.4 is mandatory.

---

## 16. Handoff summary

- **Track A** owns the editor/paste surface and its tests; **Track B** owns the pure layout,
  settings field and docs; the file map in section 5 is exhaustive.
- **Order:** plan + ADR merge → A1/A2/A3 and B1/B2/B3 in parallel → page-gap merge → input merge →
  one full verify → release.
- **No code in this package.** The next artifact is the builder report input per track, then the
  orchestrator's batch report.
