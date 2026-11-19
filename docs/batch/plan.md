# Plan — v0.1.1 input and Page vertical gaps

**Role:** Planner (design package; no application code, no tests, no `docs/plan.md` edit).
**Revision:** 2 — 19 November 2026. Track B is now **three vertical Page settings** (child,
top-level, callout), not one; Q1–Q6 are closed. Revision 1 is in git (`2927821`).
**Base:** `6c7a631` (the commit that contains `docs/batch/brief.md`).
**Branch:** `t3/page-vertical-gaps-plan` (the brief's intended name is `docs/v0.1.1-plan`; the
worktree branch is authoritative).
**Commit:** one docs commit: this plan, the ADR, the ADR index row. Not merged, not pushed.
**Contract:** `docs/batch/brief.md` as amended by the product owner's revision-2 instruction; this
plan; `docs/adr/0010-page-vertical-gaps.md`.
**ADR rename:** `docs/adr/0010-page-sibling-gap.md` is renamed to
`docs/adr/0010-page-vertical-gaps.md` because the decision now covers three gaps. The ADR index is
updated; every reference in this plan uses the new path.
**Brief note:** `docs/batch/brief.md` still carries revision 1's Track B (one sibling gap) and the
old ADR filename. The revision-2 instruction wins (`docs/agents/roles.md`, conflict rule 1) and the
orchestrator amends the brief before either builder starts. `docs/plan.md` also still describes one
setting; the orchestrator owns it and updates it at integration, not this batch.

---

## 1. Goal

Ship 0.1.1 — the already-merged anchor-resolution index (`fc8fbbc`) plus four editor input/paste
fixes and three per-document Page vertical gaps (child, top-level, callout), with the horizontal
parent → right-group corridor fixed at 18 px — built by two builders in parallel on disjoint files,
integrated once, verified once, and released as one 0.1.1 dmg.

---

## 2. Closed decisions (from the brief and the product owner's revision 2; do not reopen)

| # | Decision |
|---|---|
| D1 | **Track A scope:** heading marker toggle; formula `$` selection toggle; table-cell inline marks/formulas with GFM paste/export; HTML math paste normalization. |
| D2 | **Track B scope:** three vertical Page settings — child gap, top-level gap, callout gap — and ADR-0010; the horizontal corridor stays a fixed 18 px engine constant. |
| D3 | **Out of scope:** the long inline-formula width (plan §13) and the arrow-boundary issue (plan §14). They stay in `docs/plan.md`. |
| D4 | **Page vertical gaps:** (a) **Child gap** = `PageTheme.siblingGap`, default 18, range 0–96, per-document, Page/PDF; sets the parent → below-child gap, the child → child stack gap, the next sibling after a previous subtree, and the callout-stack → child transition. (b) **Top-level gap** = new `PageTheme.chapterGap`, default 32, range 0–96, per-document, Page/PDF; sets the vertical gap between top-level blocks in a chapter. (c) **Callout gap** = `PageTheme.calloutGap` (the field exists and is currently ignored), default 16, range 0–96, per-document, Page/PDF; sets the parent → anchored-callout and callout → callout vertical gap. All three are fixed under density. The horizontal parent → right-group corridor stays a fixed 18 px engine constant (`LayoutOptions.rightGroupGap`); nothing horizontal is configurable. No document-schema change. Default Page output stays byte-compatible at 18/32/16. |
| D5 | One release `0.1.1`; two worktrees/builders; one integration window; one full `verify` after both merges. |
| D6 | No new dependency. No document-schema change. No second derivation or layout rewrite. No Sentinel unless the product owner explicitly approves one. |
| D7 | The anchor batch's visible rules (callout lane, dots, trunk) are closed; do not reopen them. |

---

## 3. Plan-level decisions (delegated by the brief; implementation/UX detail, not product)

| # | Decision | Why |
|---|---|---|
| P1 | **Split the two surfaces.** The general `SelectionToolbar` is shown inside table cells for a non-empty inline selection (its existing Bold, Italic, Inline code, Link, Math, highlight, branch actions). `TableToolbar` keeps table management only (row/column/alignment/copy/source, 13 actions) and is anchored to the **bottom edge of the table**, not the active cell: its rect depends only on the table, so moving between cells does not move it. It sits outside the horizontal scroll wrapper; Page Edit stays render-only (Q6). | The old bubble followed the active cell (`getReferencedVirtualElement` returned `cellBounds`), so the bar jumped on every cell move; the formatting cluster made it 17 actions. Two surfaces, two jobs; the 13 management actions stay and `editor-appearance` stays at 13. |
| P2 | GFM cell inline support = **bold, italic, strike, inline code, inline math, hard break** (ratified Q5). Links, highlights and anchor marks are not created by GFM paste and are exported as plain cell text. | The cell model is one paragraph of inline content; the brief names bold/italic/code/math and the acceptance only requires bold + `$…$`. Links need URL parsing/sanitization and are a separate format decision; highlights/anchors are not representable in GFM. |
| P3 | The heading marker removes a level with **Backspace at the heading start** (H3→H2→H1→paragraph); adds a level with `#` at the start. A fourth `#` at H3 is consumed as a no-op; guest `.md` headings follow 1–6 (ratified Q2/Q3). | Mirrors the marker the user sees; no new chord; keeps plain Backspace's "never cross the block" rule (the key is consumed by the heading, not by the block boundary). |
| P4 | The HTML math normalizer rewrites **foreign** containers only (`.math`, `.math-inline`, KaTeX/MathJax annotation) and leaves NoteForest's own inline-math markup untouched. | Protects NoteForest-to-NoteForest paste; the foreign shapes are the ones the bug reports use. |
| P5 | **Axis names and sources.** `LayoutOptions.siblingGap` = child gap (vertical); `LayoutOptions.chapterGap` = top-level gap (vertical); `LayoutOptions.calloutGap` = callout gap (vertical); `LayoutOptions.rightGroupGap` = horizontal corridor. `PAGE_EDGE_GEOMETRY.siblingGap` keeps its historical name as the **horizontal** 18 px constant. The three vertical defaults are separate named constants, not aliases of the corridor constant. | One value cannot silently move another axis; the equal 18 px of the child default and the corridor is a coincidence and must not become a coupling. |
| P6 | **Settings surface.** The three fields sit together in Page → Advanced layout, after Segment gap and before List indent, in the owner's order: **Child gap**, **Top-level gap**, **Callout gap**; px; 0–96; step 1. The group help becomes "Values in pixels. Editing a value makes this layer Custom." (ratified Q4). No new control type, no horizontal field, no document field. | One place for one model; labels are the product owner's; the new help is accurate for all six layout fields (none is per level). |
| P7 | `chapterGap` is a **`PageTheme` field**, and it must join **both** numeric key lists: `packages/layout/src/page-settings.ts` (`PAGE_THEME_NUMERIC_KEYS`, used by `normalizePageSettingsOverride`) and `apps/desktop/src/renderer/src/settings/page-advanced.ts` (`PAGE_THEME_NUMERIC_KEYS`, used to freeze a Custom baseline). Missing either silently drops a per-document override or a frozen custom value. | Two lists exist today; neither is exhaustive-checked by the type system, so the plan names the test that catches it. |

---

## 4. Two-track parallel plan

### 4.1 Branches and base

| Track | Branch | Base | Start gate |
|---|---|---|---|
| Planner | `t3/page-vertical-gaps-plan` | `6c7a631` | now |
| Track A | `t3/v0.1.1-input` | the commit that merges this plan package (ADR included) | plan + ADR on `main` |
| Track B | `t3/v0.1.1-page-gap` | the same merge commit | plan + ADR on `main`; brief's Track B amended to the three settings |

Both builders branch from the **same** `main` commit. Neither rebases onto the other; the files are
disjoint (section 5). Track B's ADR is already on `main` before it starts.

### 4.2 Track A checkpoints (in order)

| Checkpoint | Content | Done when |
|---|---|---|
| **A0** | Branch and baseline. | `npm test` baseline recorded on the untouched branch; no product change before A1. |
| **A1 — paste** | HTML math normalization (P4) and the GFM cell inline parser/serializer (P2), including pasted `$…$` becoming real nodes in cells. | Unit tests for the normalizer and the GFM inline layer are green; the `special-text` paste cases are green; `npm run typecheck` green. |
| **A2 — toggles** | Heading marker (P3) and formula `$` wrap/unwrap, registered in the forest editor and the flat guest schema. | Unit tests + the `special-text` heading/formula cases green; Read mode shows no marker; invalid LaTeX visible; one undo step. |
| **A3 — table surface** | Split surfaces (P1): selection bubble formatting in cells, fixed bottom management bar, and the Continuous/Page/PDF cell proof. | `special-text` and the new `m4c1` cell case green; Copy as Markdown round-trip evidenced; `verify:fast` green on the branch. |
| **A4 — lane regressions** | Fix the four remaining lane failures (plan §6 Track A A4), the P1 split and the typed GFM conversion. | The four touched UI files pass in one lane; unit/typecheck green; no file beyond the A4 list. |

### 4.3 Track B checkpoints (in order)

| Checkpoint | Content | Done when |
|---|---|---|
| **B0** | Branch and baseline; confirm ADR-0010 (new path) is on `main`; confirm the brief's Track B says three settings. | `npm test` baseline recorded; ADR link checked; brief/ADR agreement checked. Stop and ask if the brief still says one setting. |
| **B1 — model split** | Three `PageTheme` fields (18/32/16, 0–96, normalization, no density scaling); `LayoutOptions.rightGroupGap`; `layout.ts` horizontal reads use it; `effectivePageTheme` and `pageLayoutOptions` split the three vertical values + corridor; compaction row split. | `page-settings` / `page-gap` / `page-packing` / `page-compaction` unit tests green; `typecheck` green. |
| **B2 — settings** | `siblingGap`, `chapterGap`, `calloutGap` in `ADVANCED_LAYOUT_KEYS` and `PAGE_THEME_FIELD_SPECS` (Child gap / Top-level gap / Callout gap, px, 0–96, step 1); `chapterGap` in both numeric key lists; group help (Q4). | `page-advanced` + `dialog-copy` unit tests + `ui-settings-advanced` field/validation/help cases green. |
| **B3 — parity and docs** | Page/PDF/density evidence; spec §7.2/§4.7, design tokens, `page-advanced.ts` comment; screenshots. | `print-parity`, `print-model`, `m4d1`, `r1b` green; `verify:fast` green; docs readable by `page-token-guards`; default page count/PDF baseline unchanged. |

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
| `apps/desktop/src/renderer/src/editor/TableToolbar.tsx` | edit | Management only (13 actions); remove the formatting cluster; anchor to the table bottom edge, not the active cell (P1). |
| `apps/desktop/src/renderer/src/editor/SelectionToolbar.tsx` | edit | Show the classic formatting bubble inside table cells; remove the `!isActive('table')` suppression (P1). |
| `apps/desktop/src/renderer/src/editor/extensions.ts` | edit | Register the three new extensions in the forest editor. |
| `apps/desktop/src/renderer/src/markdown/flat-schema.ts` | edit | Register the same extensions in the flat guest schema (heading cap follows 1–6 there). |
| `apps/desktop/src/renderer/src/styles.css` | edit | Heading marker widget style and the table management bar's bottom-edge layout (mirror the inline-code token; no new copy). |
| `tests/support/harness.mjs` | edit | Add a dual-format clipboard helper (`text` + `html`) beside `writeClipboard`. Track A owns it. |
| `apps/desktop/test/heading-marker.test.ts` | new | Pure add/remove/cap/read-only/guest-level cases. |
| `apps/desktop/test/formula-toggle.test.ts` | new | Wrap/unwrap/guards/trim/one-transaction cases. |
| `apps/desktop/test/html-math-paste.test.ts` | new | Synthetic `.math`, KaTeX and MathJax annotation clips; NoteForest HTML untouched; list/mark preservation. |
| `apps/desktop/test/gfm-inline.test.ts` | new | Parse/serialize marks, math guards, escapes, round-trip, malformed input. |
| `apps/desktop/test/special-text.test.ts` | edit | Table cell marks/math through `parseGfmTable`/`gfmFromTableNode`. |
| `tests/ui/special-text.test.mjs` | edit | Heading marker, formula toggle, cell paste/copy, selection-bubble formatting in a cell, fixed bottom table bar (section 10.2). |
| `tests/ui/m4c1-print-compositor.test.mjs` | edit | One focused table-cell bold + inline-math Page/PDF parity case. |
| `apps/desktop/src/renderer/src/editor/table-commands.ts` | edit | A4: typed GFM conversion serializes the paragraph's inline marks/math, not `textContent`. |
| `tests/ui/markdown-file-view.test.mjs` | edit | A4: strip the heading marker widget from the guest heading text assertion; canonical content stays clean. |
| `tests/ui/editor-appearance.test.mjs` | edit | A4: replace the stale above-cell placement block with the table-relative bottom-bar stability check; 13 actions stay. |
| `docs/batch/report-input-fix.md` | new | A4 report input. |
| `docs/batch/report-input.md` | new | Track A builder report input (avoids `report.md` collision). |

**Track A run-only:** `apps/desktop/test/table-cell-guard.test.ts`,
`apps/desktop/test/formula-transactions.test.ts`, `apps/desktop/test/formula-clipboard.test.ts`,
`tests/ui/m4b1b1-page-edit-overlay.test.mjs` (cell formula rendering in Page Edit).

### 5.2 Track B (`t3/v0.1.1-page-gap`)

| File | Kind | Note |
|---|---|---|
| `packages/layout/src/page-settings.ts` | edit | Three gap constants/defaults (18/32/16), preset values, `resolveTheme` fallbacks, `PageTheme.chapterGap`, the layout `PAGE_THEME_NUMERIC_KEYS`, `effectivePageTheme` normalization, `pageLayoutOptions` mapping. |
| `packages/layout/src/types.ts` | edit | `LayoutOptions.rightGroupGap`; axis comments for `siblingGap`, `chapterGap`, `calloutGap`; `DEFAULT_LAYOUT_OPTIONS` keeps 24/24/32/20. |
| `packages/layout/src/layout.ts` | edit | Horizontal reads use `rightGroupGap` (`subtreeColumn`, `rightX`, compaction first-row x/item x/row packing, preferred width); vertical reads keep `siblingGap`, `chapterGap`, `calloutGap`; split the compaction `gap` into horizontal and vertical. |
| `packages/layout/src/edge-style.ts` | edit | Comment only for `siblingGap` (horizontal corridor); remove `calloutGap` from the invariant `PageEdgeGeometry` because it is now a setting default. |
| `apps/desktop/src/renderer/src/settings/page-advanced.ts` | edit | Three keys in `ADVANCED_LAYOUT_KEYS`; three `PAGE_THEME_FIELD_SPECS` (labels, px, 0–96, step 1); `chapterGap` in `PAGE_THEME_NUMERIC_KEYS`; update the "corridor is hidden" comment. |
| `apps/desktop/src/renderer/src/settings/PageAdvancedSettings.tsx` | edit | Layout group help becomes the ratified Q4 sentence. No new control. |
| `docs/spec.md` | edit | §7.2 three settings + fixed horizontal corridor; §4.7 theme row adds the three gaps. |
| `docs/design-tokens-page.md` | edit | Three numeric rows (18/18, 32/32, 16/16), corridor table, density list, remove the "Chapter gap is not a PageTheme field" row, `DEFAULT_LAYOUT_OPTIONS` row for `rightGroupGap` (24), update the `siblingGap` fallback note. Keep the exact row shape `page-token-guards` parses: a backticked key, then the numeric columns, with the optional `(unit)` on the numeric rows. |
| `packages/layout/test/page-gap.test.ts` | new | Per-axis movement at 0/default/max; horizontal corridor fixed; top-level/callout/child independence; density 60/100/120; no overlap; `stacked`/`compaction` behavior. |
| `packages/layout/test/page-settings.test.ts` | edit | Defaults 18/32/16; map (three vertical + `rightGroupGap`); effective no-scale; non-default honored; `chapterGap` survives `normalizePageSettingsOverride`; rewrite the "legacy corridor ignored" case as "vertical honoured, corridor fixed". |
| `packages/layout/test/page-packing.test.ts` | edit | The 16 px horizontal-safe-gap case sets `rightGroupGap: 16`; audit axis-specific reads. |
| `packages/layout/test/page-compaction.test.ts` | edit | The lab oracle sets `siblingGap: 16` **and** `rightGroupGap: 16` so both axes keep their old 16 px geometry. |
| `packages/layout/test/layout-lab.ts` | edit | The wrapped-child oracle computes `rightX` with `layoutOptions.rightGroupGap`, not `siblingGap`. |
| `apps/desktop/test/page-advanced.test.ts` | edit | Editable keys (three), specs (labels/ranges/step), hidden list, `customThemeOverride` preserves `chapterGap`. |
| `apps/desktop/test/dialog-copy.test.ts` | edit | The `PageAdvancedSettings.tsx` copy list gets the ratified Q4 sentence. |
| `apps/desktop/test/print-parity.test.ts` | edit | Stored 20/40/22 apply vertically (Page/print parity at 100 % and 80 %); `rightGroupGap` 18; density does not scale; top-level gap moves the top-level rhythm. |
| `packages/pdf/test/print-model.test.ts` | edit | Per-document three gaps reach the print model; a gap-only mismatch fails identity. |
| `tests/ui/ui-settings-advanced.test.mjs` | edit | Three fields present, labels, help sentence, 0–96 validation (one out-of-range gap), saved values, override dot, Use global. |
| `tests/ui/r1b-page-settings.test.mjs` | edit | Per-document child 40 / top-level 64 / callout 24 apply to Page, persist, global stays 18/32/16; horizontal corridor 18. |
| `tests/ui/m4d1-page-density.test.mjs` | edit | 60/100/120 % does not scale any of the three; horizontal child offsets stay 18 at a non-default child gap; page count trend keeps its existing reason. |
| `docs/batch/report-page-gap.md` | new | Track B builder report input. |

**Track B run-only:** `apps/desktop/test/page-token-guards.test.ts`,
`apps/desktop/test/page-model.test.ts`, `apps/desktop/test/page-edge-parity.test.ts`,
`apps/desktop/test/highlight.test.ts`, `apps/desktop/test/continuous-settings-isolation.test.ts`,
`apps/desktop/test/continuous-settings-preview.test.ts`, `apps/desktop/test/page-adapter.test.ts`,
`packages/layout/test/edge-style-isolation.test.ts`, `packages/layout/test/density-topology.test.ts`,
`packages/layout/test/page-callout-modes.test.ts`, `packages/layout/test/page-subtree-wrap.test.ts`,
`packages/layout/test/group-wrap.test.ts`, `packages/layout/test/page-edges.test.ts`,
`packages/layout/test/r2i-lab.test.ts`, `packages/layout/test/r2j-lab.test.ts`,
`tests/ui/m4b1-page-view.test.mjs`, `tests/ui/m4c1-print-compositor.test.mjs`,
`tests/ui/m4c3-pdf-gate.test.mjs`.

Those run-only geometry suites all use the default 18/32/16 or `DEFAULT_LAYOUT_OPTIONS`' 24/32/20,
so their numbers must not change. If one fails, fix the axis read — do not update its numbers.

### 5.3 Shared / neither track

| File | Owner | Rule |
|---|---|---|
| `docs/batch/plan.md`, `docs/adr/0010-page-vertical-gaps.md`, `docs/adr/README.md` | Planner (this commit) | Builders never edit. |
| `docs/batch/brief.md` | Orchestrator | Must be amended to the three settings and the new ADR path before B0. |
| `docs/batch/report.md` | Orchestrator | Written after both merges from the two track reports; never a builder collision. |
| `docs/plan.md` | Orchestrator | Do not edit in this batch; the `docs/plan.md` §13/§14 items remain and its Page-gap bullet is updated at integration. |
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
2. `#` with a collapsed caret at `parentOffset === 0` raises the level within the schema cap; at the
   note cap (H3) a fourth `#` is consumed as a no-op (ratified Q2). Backspace at the same position
   lowers H3→H2→H1→paragraph (ratified Q3). Both dispatch one transaction that closes the history
   group, so one undo restores the previous level.
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
   its schema's 1–6, the note cap is 1–3 with the no-op at H3 (ratified Q2).

**A3 — table surface.**

1. Show the existing `SelectionToolbar` inside table cells for a non-empty inline selection: keep
   its current Bold, Italic, Inline code, Link, Math, highlight and branch actions; remove the
   `!isActive('table')` suppression. It may move with the text selection; that is the formatting
   surface. Page Edit keeps no formatting cluster (Q6).
2. `TableToolbar` keeps management only: row above/below/delete, column left/right/delete, align
   left/center/right, Copy as Markdown, source. Remove the Bold/Italic/Inline code/Inline formula
   cluster (13 actions stay). Anchor the bar to the **table bottom edge**: return the table bounds
   from `getReferencedVirtualElement`, not `cellBounds`, and place a zero-height reference at the
   table bottom so the bar sits below the table, outside the horizontal scroll wrapper. Moving the
   caret between cells must not move it; page/table scroll may.
3. Verify the cell model is unchanged: `InlineTableCell`/`InlineTableHeader` still hold exactly one
   paragraph; block content is still refused and never flattened (VH1).
4. Add the Page/PDF cell proof to `m4c1`: a table cell with bold text and an inline formula renders
   the same marks/nodes in Page Read and the print compositor, and the exported PDF text contains
   the cell text. No table layout change, no new page-break rule.
5. Copy as Markdown uses the A1 serializer; source panel shows the same string.

**A4 — lane regressions.**

The first orchestrator Electron lane (after the A/B merge) found five failures. The fifth
(`editor-appearance` 13→17) is resolved by the P1 split, not by a test update. Four lane fixes
remain, plus the table-surface split and the typed GFM conversion; the files are authorized in
§5.1.

1. `special-text` A1/A2: after a native `Home`, `#` at the heading start does not raise the level
   because the handler reads the ProseMirror selection, which can lag the DOM caret. Resolve the
   live DOM caret (the `arrowStays` pattern) or otherwise make `Home` + `#` work; keep one undo.
2. `special-text` A1/A3: the assertion looks for `strong`/`em` in `tbody td`, but the GFM fixture
   puts Bold/Italic in the header row. Assert `th` for Bold/Italic and `td` for `$x^2$`/`<br>`.
   Update the same case for the P1 split: formatting actions come from the selection bubble, the
   table bar has only the 13 management actions, and its rect is unchanged when the caret moves
   between cells.
3. `m4c1`: the Page Read table has no `strong` for the fixture's `bold` mark. Trace the Page cell
   mark path; fix the product if the mark is dropped, or the fixture only if its mark name is not
   canonical. Prove bold in Page Read and the PDF text.
4. `markdown-file-view`: the heading marker widget appears in `innerText`, so the guest heading
   assertion sees `#Markdown fixture`. Strip `.nf-heading-marker` in the test (canonical content is
   clean) or make the affordance not contribute to text without hiding it in editable guest views.
5. Typed GFM conversion (AC-08): `table-commands.ts` still reads `paragraph.textContent`, so a typed
   table loses delimiters already consumed by the inline input rules. Serialize the paragraph's
   inline nodes/marks with the A1 layer so typed tables keep marks/math. Add a focused test.
6. `editor-appearance`: replace the stale "deeper body row keeps the bar above the active cell"
   block with the table-relative bottom-bar stability check (the bar's offset from the table bottom
   is unchanged when the caret moves to another cell). The 13-action count stays.

Run `special-text`, `m4c1`, `markdown-file-view` and `editor-appearance` in one lane after
`npm run build`; focused unit tests and `typecheck`. Report `docs/batch/report-input-fix.md`.

### Track B

**B1 — model split.**

1. Add the three defaults as separate constants (names are a suggestion; one source each):
   `PAGE_CHILD_GAP_DEFAULT = 18`, `PAGE_TOP_LEVEL_GAP_DEFAULT = 32`,
   `PAGE_CALLOUT_GAP_DEFAULT = 16`; one range `PAGE_GAP_MIN = 0`, `PAGE_GAP_MAX = 96`. Presets and
   `DEFAULT_PAGE_SETTINGS` use the defaults. Do **not** alias the child default to
   `PAGE_EDGE_GEOMETRY.siblingGap`, even though both are 18 today.
2. `PageTheme`: document `siblingGap` as the child gap, add `chapterGap`, document `calloutGap` as
   the callout gap. Rewrite the shared "legacy stored page geometry" doc block so it no longer
   claims `siblingGap`/`calloutGap` are unread; only the fixed corridor fields (`childIndent`, the
   trunk insets, `calloutCardIndent`, `calloutRightGap`) stay compatibility-only. Add `chapterGap`
   to `PAGE_THEME_NUMERIC_KEYS` (the layout module's list used by `normalizePageSettingsOverride`).
   In `resolveTheme`, clamp all three to 0–96 with fallbacks 18/32/16 (`siblingGap`'s current 16 and
   `calloutGap`'s current 12 are wrong defaults).
3. `effectivePageTheme`: remove `siblingGap` and `calloutGap` from the fixed `corridor` object; add
   a vertical-gap normalization for all three; never multiply by density; include the normalized
   values in both the `density === 1` early return and the scaled return. `pageCssVariables` is
   unchanged (gaps are layout options, not CSS).
4. `LayoutOptions`: add `rightGroupGap: number`; document `siblingGap` (child), `chapterGap`
   (top-level), `calloutGap` (callout) and `rightGroupGap` (horizontal). `DEFAULT_LAYOUT_OPTIONS`
   keeps `siblingGap: 24`, adds `rightGroupGap: 24`, keeps `chapterGap: 32` and `calloutGap: 20`.
5. `pageLayoutOptions`: map `effective.siblingGap` → `siblingGap`, `effective.chapterGap` →
   `chapterGap`, `effective.calloutGap` → `calloutGap`, and `PAGE_EDGE_GEOMETRY.siblingGap` (18) →
   `rightGroupGap`. Stop passing `DEFAULT_LAYOUT_OPTIONS.chapterGap` and the corridor constants for
   the three vertical values.
6. `layout.ts`: horizontal reads use `rightGroupGap` — `subtreeColumn` remaining/preferred width,
   `rightX`, compaction first-row x, the in-row item gap, `planCompactionRow`'s gap,
   `preferredSubtreeWidth` and `packPreferredRows`. Vertical reads keep the right field — top-level
   cursor uses `chapterGap`; callout cursor uses `calloutGap`; below-child start, child cursor,
   wrap keep-out, callout-stack → child and compaction **row top** use `siblingGap`. Split the one
   compaction `gap` local into `horizontalGap` and `verticalGap`; do not change the corridor,
   trunk insets, child indent or the arrowhead.
7. `edge-style.ts`: `PAGE_EDGE_GEOMETRY.siblingGap` stays 18 and is documented as the horizontal
   corridor only. Remove `calloutGap` from `PageEdgeGeometry` (it is no longer an invariant); the
   callout setting's default is `PAGE_CALLOUT_GAP_DEFAULT`.

**B2 — settings.**

1. Add `siblingGap`, `chapterGap`, `calloutGap` to `ADVANCED_LAYOUT_KEYS` after `segmentGap` in that
   order, before `wrapIndent`. Add the three `PAGE_THEME_FIELD_SPECS`:
   `{ label: 'Child gap', unit: 'px', min: 0, max: 96, step: 1 }`,
   `{ label: 'Top-level gap', unit: 'px', min: 0, max: 96, step: 1 }`,
   `{ label: 'Callout gap', unit: 'px', min: 0, max: 96, step: 1 }`.
2. Add `chapterGap` to the renderer's `PAGE_THEME_NUMERIC_KEYS` so `customThemeOverride` freezes it
   like every other hidden numeric value. The controller/UI inherit the fields through the existing
   key lists; no new control type.
3. Out-of-range drafts show the existing range error and block the write; no clamping by the UI.
   Per-document override, the override dot, per-field Use global and "Use global layout" work
   through the existing theme-field path (`customThemeOverride` for a write, `withoutThemeField(s)`
   for Use global).
4. Change the Advanced layout group help to
   "Values in pixels. Editing a value makes this layer Custom." (Q4) and update the copy test.

**B3 — parity, docs, evidence.**

1. `docs/spec.md` §7.2: replace the invariant list with (a) the three vertical settings (defaults
   18/32/16, 0–96, per document, fixed under density, Page + PDF) and their exact scopes from D4;
   (b) the horizontal corridor invariant 18 (4 lead + 14 stem) and the fixed child indent 26,
   callout card indent 38, callout right gap 24 and trunk insets 12/24. §4.7 theme row adds
   "vertical gaps".
2. `docs/design-tokens-page.md`: `siblingGap` and `calloutGap` become Page settings (0–96, fixed
   under density, per document), `chapterGap` gets a 32/32 numeric row, the "Chapter gap is not a
   PageTheme field" row is removed, the corridor table says `siblingGap` is the horizontal corridor
   only and no longer lists `calloutGap` as an invariant, the density paragraph lists the three
   vertical gaps as fixed, and the `DEFAULT_LAYOUT_OPTIONS` table gets a `rightGroupGap` row (24)
   in the exact format the token guard parses.
3. `page-advanced.ts` comment: the three vertical gaps are editable; only the horizontal corridor,
   `childIndent` and the callout lane/trunk fields stay hidden.
4. Evidence: Page at child 18/40, top-level 32/64, callout 16/24 in one document; the measured
   horizontal child offset stays 18; density 60/100/120 with non-default gaps unscaled; a PDF print
   model carrying 40/64/24; per-document reload persists. Screenshots and the measured numbers in
   the report.

---

## 7. Acceptance criteria

Each criterion is testable and has a named owner. Track A = `A`, Track B = `B`; the orchestrator
owns the final gate.

| ID | Criterion | Evidence |
|---|---|---|
| AC-01 | While the caret is in an editable heading, the marker shows exactly one `#` per level for H1–H3; the marker is not paragraph text and is absent from the canonical content and the block's text projection. | `heading-marker.test.ts`, `special-text` UI; document JSON snapshot. |
| AC-02 | Typing `#` at the heading start raises H1→H2→H3 and a fourth `#` is consumed as a no-op; Backspace at the start lowers H3→H2→H1→paragraph; each change is one undo step that restores the previous level. | `heading-marker.test.ts`, `special-text` UI undo assertions. |
| AC-03 | Enter at the end of a heading creates a paragraph; Shift+Enter is a hard break; paragraph→heading via the existing `# ` input rule still works. | `special-text` UI. |
| AC-04 | Continuous Read, Page Read and the PDF show no heading marker; Page Edit is editable and shows it like Continuous Edit; the PDF text layer has no `#` prefix added by the affordance. | `special-text` UI Read case; `m4b1b1` (run); `m4c1`/PDF text. |
| AC-05 | A non-empty selection inside one textblock wraps into one `inlineMath` with `latex` = trimmed selection; outer whitespace stays text; one undo restores the original text and marks. | `formula-toggle.test.ts`, `special-text` UI. |
| AC-06 | An `inlineMath` `NodeSelection` unwraps to its LaTeX source with one undo; empty-caret typing is not intercepted; code blocks, cross-textblock/display-math/image barriers and inline-math-containing selections are not intercepted; a wrapped or unwrapped range that carried an anchor leaves the anchor repairable (selector resolution or a visible broken state) and undoable; a `NodeSelection` that is not an inline formula is never replaced by a literal `$`. | `formula-toggle.test.ts`, `special-text` UI. |
| AC-07 | Invalid LaTeX wraps/unwraps without rejection: the node keeps the source and shows the existing inline error. | `formula-toggle.test.ts`, `special-text` UI (`.katex-error`). |
| AC-08 | A pasted or typed GFM table cell with `**bold**`, `*italic*`, `~~strike~~`, `` `code` ``, `$…$` and `<br>` becomes real marks/nodes in the cell; a pasted `$…$` is a node immediately, not literal until retyped. | `gfm-inline.test.ts`, `special-text.test.ts`, `special-text` UI. |
| AC-09 | Copy as Markdown writes the cell marks/math back and a parse→serialize→parse round-trip is stable; literal delimiters are escaped and survive. | `gfm-inline.test.ts`, `special-text` UI clipboard assertion. |
| AC-10 | Cell block content is still refused and never flattened (VH1); the cell remains one paragraph. | `table-cell-guard.test.ts` (run), `special-text` UI. |
| AC-11 | Inside a table cell, the classic selection bubble is the formatting surface (Bold, Italic, Inline code, Link, Math, highlight, branch) and appears only for a non-empty selection; the table management bar keeps only row/column/alignment/copy/source (13 actions), has no formatting cluster, and is anchored to the table bottom edge: moving the caret between cells leaves its rect unchanged, and no second management bar appears. The guest Markdown editor mounts the same surfaces; Page Edit shows no formatting cluster. | `special-text` UI, `editor-appearance` (edit), `markdown-file-view` (edit). |
| AC-12 | Bold + inline formula in a cell render in Continuous, Page Read and the print/PDF output; table pagination rules are unchanged. | `special-text` UI, `m4c1` UI + PDF text. |
| AC-13 | A dual-format clipboard with plain `$…$` and HTML `.math`/annotation spans pastes as a list with the formulas restored and the other marks kept; NoteForest-to-NoteForest rich paste is unchanged. | `html-math-paste.test.ts`, `special-text` UI, `markdown-file-view` (edit). |
| AC-14 | `PageTheme.siblingGap` (Child gap, default 18), `PageTheme.chapterGap` (Top-level gap, default 32) and `PageTheme.calloutGap` (Callout gap, default 16) are stored 0–96, normalized on load, per-document overridable, and reach Page Read/Edit, measurement and PDF; none is density-scaled. | `page-settings.test.ts`, `print-model.test.ts`, `r1b` UI. |
| AC-15 | The child gap moves only the parent → below-child gap, the child → child stack and the next sibling after a previous subtree (and the callout-stack → child transition); at 0/18/40/96 every horizontal child offset, the parent → right-group corridor, the child indent, the callout lane and the trunk insets stay fixed (corridor 18). | `page-gap.test.ts`, `r1b` UI measurements. |
| AC-16 | The top-level gap moves only vertical spacing between top-level blocks in a chapter; at 0/32/64/96 it changes no child gap, callout gap or horizontal coordinate, and chapter-start pages are unchanged. | `page-gap.test.ts`, `print-parity.test.ts`. |
| AC-17 | The callout gap moves only the parent → anchored-callout (below placements) and callout → callout gap; at 0/16/40/96 it changes no direct-child gap, top-level gap or horizontal coordinate; the mode A first callout stays in the right lane at the parent's y. | `page-gap.test.ts`, `page-callout-modes.test.ts` (run). |
| AC-18 | The three settings move independently: changing one to min/max leaves the other two gaps and the horizontal corridor at their previous values (a one-axis-at-a-time matrix, plus one all-at-max no-overlap run). | `page-gap.test.ts` matrix. |
| AC-19 | Density 60/100/120 does not scale any of the three gaps: the stored and effective values are identical at every step, while typography and padding still scale. | `page-settings.test.ts`, `print-parity.test.ts`, `m4d1` UI. |
| AC-20 | The default 18/32/16 resolves to the same Page geometry and page count as 0.1.0: no default-options coordinate assertion changes; `m4b1` page count and `m4c3` PDF gate stay at baseline. | Unchanged `page-packing`/`page-compaction`/`page-subtree-wrap`/`group-wrap`/`page-callout-modes`/`page-edges`/`density-topology` geometry; `m4b1`/`m4c3` (run); token defaults 18/32/16. |
| AC-21 | Page and PDF use the same resolved three gaps: the measured layout options equal `pageLayoutOptions(theme)`, the print map carries the same values, and a layout measured under different gaps fails the export identity instead of re-paginating silently. | `print-parity.test.ts`, `print-model.test.ts`, `r1b` UI; release PDF smoke. |
| AC-22 | Advanced layout shows Child gap, Top-level gap and Callout gap in px with step 1, validates 0–96, rejects out-of-range drafts without clamping, supports the per-document override dot and Use global, and shows the ratified group help. | `page-advanced.test.ts`, `dialog-copy.test.ts`, `ui-settings-advanced` UI. |
| AC-23 | Spec §7.2/§4.7, design tokens and the `page-advanced.ts` comment describe three vertical settings and one fixed horizontal corridor; the token guard passes; Continuous is untouched; no new dependency and no document-schema change; `verify:fast` per branch and one full `verify` at integration are green. | `page-token-guards.test.ts` (run), docs diff, dependency diff, schema fixture unchanged, `verify` output. |

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
- H3 + `#` → the fourth `#` is consumed as a no-op (ratified Q2); there is no H4 in a note.
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
- The guest `.md` editor gets the same split: selection-bubble formatting in a cell, and the fixed
  bottom management bar; its flat schema already has the marks and inline math.

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

### 8.5 Page vertical gaps

- **Defaults.** 18/32/16 resolved with the 18 px horizontal corridor → identical page count and
  geometry to 0.1.0 (baseline). Any default-coordinate change is a defect.
- **Child gap.** 0 → stacked cards touch; 96 → more pages possible, no clipping, no negative
  cursor. It moves the parent → below-child gap, the child stack, the next sibling after a
  previous subtree and the callout-stack → child start. It moves no top-level block, no callout
  stack, and no horizontal coordinate.
- **Top-level gap.** 0 → top-level cards touch; 96 → the chapter grows and may add pages. It moves
  only the vertical gap between top-level blocks in a chapter; a chapter still starts on a new
  page; manual breaks and continuation markers remain deterministic.
- **Callout gap.** 0 → a callout touches its parent (or the previous callout); 96 → the callout
  stack grows and may add pages. It applies to below placements (B2, `stacked`, legacy beside) and
  to callout → callout in every mode. In mode A the first callout stays at the parent's y in the
  right lane, so the parent → callout transition is horizontal and only the callout → callout gap
  applies.
- **Horizontal corridor.** The parent → right-group corridor, child indent, mode A callout lane,
  callout card indent and trunk insets never move with any of the three settings; the corridor
  stays 18 at 0/18/40/96.
- **Density.** 60/100/120 does not scale any of the three; typography, card padding and segment gap
  still scale, so page count can change for the existing density reason.
- **Packing.** `stacked` keeps its historical order and uses the three gaps as above; `compaction`
  uses `rightGroupGap` for the in-row item gap and `siblingGap` for the row top (lab oracles set
  both axes to their old value).
- **Legacy settings.** A stored non-default `siblingGap` or `calloutGap` now applies; `chapterGap`
  defaults to 32 in an older settings file. No migration and no document write.
- **Override.** A per-document override at child 40 / top-level 64 / callout 24 applies to Page
  Read/Edit and PDF; the global layer stays 18/32/16; reload keeps the document values.
- **Unchanged.** Manual-break hints, anchor fallback, the callout lane/dot/trunk rules and the
  unhonoured-hint warning are unchanged.

---

## 9. Non-goals

- The long inline-formula width (plan §13) and the arrow-boundary issue (plan §14).
- A horizontal gap setting, a per-block/per-parent/per-chapter gap, or any new layout model.
- A document-schema change or page settings in `document.json`.
- New dependencies; new UI suite files; `tests/ui/suites.mjs` changes.
- Block content in table cells, merged cells, table resize, or table layout changes.
- Links/highlights/anchors in GFM cells; Markdown export beyond the existing Copy as Markdown.
- A formatting toolbar in the Page Edit overlay (Q6 ratified: Page Edit renders stored marks/math
  only; formatting stays in the selection bubble and table management in the Continuous/guest bar).
- Copy changes beyond the three gap labels and the ratified group help (Q4).
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

- `packages/layout/test/page-gap.test.ts` (new): per-axis movement at 0/default/max; child 40,
  top-level 64, callout 24; the other two gaps and the corridor unchanged; horizontal x fixed at
  18; below-group; callout mode A/B2; density 60/100/120; no overlap; `stacked`/`compaction`.
- `packages/layout/test/page-settings.test.ts` (edit): defaults 18/32/16; map (three vertical +
  `rightGroupGap`); effective no-scale; non-default honored; `normalizePageSettingsOverride` keeps
  `chapterGap`; rewrite the legacy case as "vertical honoured, corridor fixed". Split the density
  corridor test: `siblingGap`/`calloutGap` are no longer asserted equal to the corridor constants;
  assert the three vertical values unscaled and the horizontal corridor (child indent, trunks,
  callout right gap) fixed.
- `packages/layout/test/page-packing.test.ts` (edit): the horizontal-safe-gap case uses
  `rightGroupGap: 16`; axis audit.
- `packages/layout/test/page-compaction.test.ts` (edit): lab oracle sets `siblingGap: 16` and
  `rightGroupGap: 16`; signature unchanged.
- `packages/layout/test/layout-lab.ts` (edit): wrapped-child oracle reads `rightGroupGap`.
- `apps/desktop/test/page-advanced.test.ts` (edit): editable keys, specs (labels, 0–96, step 1),
  hidden list, `customThemeOverride` keeps `chapterGap`.
- `apps/desktop/test/dialog-copy.test.ts` (edit): the ratified group-help sentence.
- `apps/desktop/test/print-parity.test.ts` (edit): stored 20/40/22 apply vertically; `rightGroupGap`
  18; Page/print parity at 100 % and 80 %; density unscaled.
- `packages/pdf/test/print-model.test.ts` (edit): per-document three gaps reach the model; a
  gap-only mismatch fails identity.
- Run: `page-token-guards.test.ts`, `page-model.test.ts`, `page-edge-parity.test.ts`,
  `highlight.test.ts`, `continuous-settings-isolation.test.ts`, `continuous-settings-preview.test.ts`,
  `page-adapter.test.ts`, `edge-style-isolation.test.ts`, `density-topology.test.ts`.

### 10.2 UI suite matrix

| Suite | Track | Edit? | What it proves | Lane |
|---|---|---|---|---|
| `tests/ui/special-text.test.mjs` | A | extend | Heading marker H1–H3, add/remove/no-op/undo, Read no marker; formula wrap/unwrap/invalid/undo; table cell paste, marks/math, Copy as Markdown; selection-bubble formatting and the fixed bottom table bar. | A |
| `tests/ui/m4c1-print-compositor.test.mjs` | A | one case | Bold + inline formula in a cell: Page Read and print compositor parity; PDF text. | A |
| `tests/ui/markdown-file-view.test.mjs` | A | edit | NoteForest ↔ guest rich paste still keeps table/formula/marks; the guest heading text assertion strips the marker widget (serial suite). | A |
| `tests/ui/editor-appearance.test.mjs` | A | edit | 13 management actions, one compact row; the table bar is anchored to the table bottom edge and its table-relative offset is stable across cell moves. | A |
| `tests/ui/m4b1b1-page-edit-overlay.test.mjs` | A | no | Cell formula still renders and the inline→block refusal still names the reason. | A |
| `tests/ui/ui-settings-advanced.test.mjs` | B | edit | Three gap fields present with their labels and the ratified help; 0–96 validation, saved values, override dot, Use global. | B |
| `tests/ui/r1b-page-settings.test.mjs` | B | edit | Per-document child 40 / top-level 64 / callout 24 apply to Page, persist, global stays 18/32/16; horizontal child offset 18. | B |
| `tests/ui/m4d1-page-density.test.mjs` | B | edit | 60/100/120 % does not scale any of the three; the top-level DOM gap stays at the stored value. | B |
| `tests/ui/m4b1-page-view.test.mjs` | B | no | Page Read geometry/page count at the default 18/32/16. | B |
| `tests/ui/m4c3-pdf-gate.test.mjs` | B | no | Default PDF gate unchanged (page count, text, cuts). | B |

No two rows run at the same time. `markdown-file-view` is a `SERIAL_FILES` suite; keep it out of
any parallel pool.

### 10.3 Screenshots and evidence

- Track A: `special-text` artifacts showing the marker on H1/H2/H3, no marker in Read, the formula
  wrap/unwrap, the invalid-LaTeX error, the pasted table with bold + formula, the selection bubble
  over a cell, and the fixed bottom management bar. `m4c1` artifacts showing the cell in Page and
  print, plus the extracted PDF text line. Copy as Markdown output as text in the report.
- Track B: `ui-settings-advanced` screenshot of the three fields and the help sentence; `r1b`/`m4d1`
  screenshots of Page at the default and at child 40 / top-level 64 / callout 24, with the measured
  horizontal child offset (18) and vertical gaps; the JSON rect evidence (`layoutOptions`, block
  x/y) in the report; the print-model output for the non-default values.
- Every UI change has an app screenshot; no screen recording.
- Reports list artifact paths, commands, and the exact assertions, not "see above".

### 10.4 Commands

Per builder: focused `npx vitest run <files>` per checkpoint; `npm run typecheck`; at the end
`npm run verify:fast`. UI: `node --test tests/ui/<file>` per touched file (or a surface group at
`--concurrency 4`) inside the single Electron lane. Orchestrator: one full `npm run verify` at
integration. Do not add retries or sleeps; do not run two UI suites at concurrency 4 at once.

---

## 11. Rejected alternatives (plan-level)

- **Keep the formatting cluster in the table toolbar / let the bar follow the active cell** — the
  bar moves on every cell change and the cluster makes 17 actions; rejected by the product owner
  in favor of the split (P1).
- **Make the GFM inline layer a full Markdown parser** — out of scope, high risk, and the cell
  model has no block content; a narrow parser is enough (P2).
- **Normalize HTML math to literal `$…$` only** — prose paste would stay literal (the input rule
  does not run on paste); the slice must carry real nodes; rejected.
- **Use a second layout pass for the gaps** — forbidden by the brief (no layout rewrite) and would
  create a second derivation; rejected.
- **One vertical gap for all three rhythms** — rejected by the product owner in revision 2; the
  three readings are independent and one lever would move unrelated stacks.
- **Derive the top-level/callout gaps from the child gap** — hidden coupling, cannot express the
  independent 18/32/16 defaults and ranges; rejected.
- **Expose the horizontal corridor too** — contradicts D4 and ADR-0006; rejected.
- **Scale a gap with density** — rejected in ADR-0010.
- **Add a new UI suite for v0.1.1** — adds runtime and a `suites.mjs` edit for no coverage gain;
  extend the owning suites instead.
- **Fix the long inline formula or the arrow boundary now** — explicitly out of scope (D3).

---

## 12. Stop conditions

- The brief's Track B or the ADR still describes one vertical gap at B0; ask the orchestrator to
  amend the brief before coding.
- A change needs a document-schema change, a new dependency, an ADR beyond 0010, or a layout
  rewrite.
- A builder needs a file not in section 5, or the two tracks collide on any file.
- A visible change appears beyond the brief (new copy, another toolbar, a new chord).
- The horizontal corridor moves when any vertical gap changes; or Page/PDF parity fails.
- A default 18/32/16 document changes page count or fixture coordinates.
- A per-document `chapterGap` override is dropped on load, or a frozen Custom theme loses it.
- NoteForest-to-NoteForest rich paste breaks.
- A step stays red after one fix attempt.
- The code contradicts `docs/spec.md` or an accepted ADR in a way the plan cannot resolve.

---

## 13. Closed questions (Q1–Q6)

The product owner closed every product question on 19 November 2026. **No open product decision
remains.** These are recorded, not proposed.

| # | Question | Resolution |
|---|---|---|
| Q1 | Does the setting move the parent → below-child gap and the callout-stack → child transition, or only sibling cards? | **Three explicit settings replace the one universal gap.** Child gap owns parent → below-child, child → child, next sibling after a previous subtree and callout-stack → child; top-level gap owns top-level spacing; callout gap owns parent → callout and callout → callout. The horizontal corridor is not part of any of them. |
| Q2 | Typing a fourth `#` at H3 (no H4 in a note); guest `.md` headings. | **Consume it as a no-op at the note cap 1–3.** Guest `.md` headings follow the flat schema's 1–6. |
| Q3 | Is Backspace at the heading start the removal key? | **Yes.** It lowers H3→H2→H1→paragraph, one undo step. |
| Q4 | May the Advanced layout group help become "Values in pixels. Editing a value makes this layer Custom."? | **Yes.** That exact sentence. |
| Q5 | Is the table-cell inline set bold, italic, strike, code, inline math, hard break? | **Yes.** Links, highlights and anchors are not parsed and export as plain text. |
| Q6 | May Page Edit stay render-only while formatting lives in the selection bubble and table management in the Continuous/guest bar? | **Yes.** Page Edit renders marks/math only for this batch. |

Resolved without a product decision:

- **"Sibling gap" name on the engine constant.** The brief keeps `PAGE_EDGE_GEOMETRY.siblingGap`
  (18) as the horizontal corridor; the plan keeps the name and adds `LayoutOptions.rightGroupGap`
  for explicit use (ADR-0010).
- **ADR filename.** The file is renamed to `0010-page-vertical-gaps.md`; the ADR index and this
  plan use the new path. The brief still names the old path until the orchestrator amends it.
- **Brief branch name vs harness branch.** The brief says `docs/v0.1.1-plan`; the worktree is
  `t3/page-vertical-gaps-plan`. The actual branch is used; the orchestrator can rename at merge.
- **Two builder reports.** The single `docs/batch/report.md` would be a collision; each builder
  writes a track report input (`report-input.md`, `report-page-gap.md`) and the orchestrator writes
  the batch report. This is a process split, not a product decision.

---

## 14. v0.1.1 release steps

1. Both tracks merged into `main`; the single full `npm run verify` green at UI concurrency 4; no
   open S1/S2; the two track reports are folded into `docs/batch/report.md`.
2. Update `CHANGELOG.md` for 0.1.1: heading marker, formula `$` toggle, table-cell marks/formulas
   and GFM round-trip, HTML math paste, and Page vertical gaps (child, top-level, callout) as
   per-document Page settings with the horizontal arrow corridor fixed at 18. Keep the known
   limitations and note that the `docs/plan.md` §13/§14 items remain.
3. Update `docs/status.md`: release date, tag, dmg path, installed app, verify counts, open
   product-owner gate (visual/VoiceOver/PDF).
4. Bump the version to `0.1.1` in the root, `apps/desktop`, `packages/core`, `packages/layout`,
   `packages/pdf`; regenerate the lockfile with `npm install --package-lock-only`; confirm a clean
   `npm ci` and typecheck from the lockfile.
5. `npm run dist`; packaged smoke on the dmg: open a fixture, Page Read, set the per-document gaps
   to child 40 / top-level 64 / callout 24, export a PDF, verify page count, real text and no
   missing glyphs; confirm the horizontal child offset is still 18; install with
   `scripts/install-local.mjs`.
6. Tag `v0.1.1` at the release commit; push/tag policy is the orchestrator's (the 0.1.0 release
   tagged the commit and installed locally). The product owner's manual visual/VoiceOver/PDF pass
   remains the release gate.
7. Remove both worktrees in the same step as the merge; keep the batch history in git.
8. Update the Page-gap bullet in `docs/plan.md` (the roadmap still says one setting) after the
   batch ships; it is the orchestrator's file, not this plan package.

---

## 15. Risks

- **Axis leak.** A horizontal read left on `siblingGap`, or a vertical read switched to
  `rightGroupGap`, would move the arrow corridor or the wrong stack. The per-axis matrix in
  `page-gap.test.ts` (one field at 0/default/max, the other two and the corridor asserted) is the
  guard. The compaction split is the riskiest edit: in-row gap is horizontal, row top is vertical.
- **`chapterGap` in only one key list.** If the layout list misses it, a per-document override is
  dropped on load; if the renderer list misses it, a Custom freeze loses it on a preset switch.
  Tests assert both round-trips.
- **Default baseline drift.** Any changed coordinate at 18/32/16 in the existing fixture suites is a
  defect, not an accepted update. The release gate is the unchanged default page count and PDF.
- **Stored legacy values.** A stored non-default `siblingGap`/`calloutGap` now applies on first load.
  This is intended; the release note says so. `chapterGap` defaults to 32 with no legacy value.
- **Density confusion.** Page count can still change at 60/120 % because typography/padding scale;
  the tests must assert the gap values, not an unchanged page count.
- **GFM escape contract** is the subtle Track A part: `splitGfmRow` already unescapes `\|`/`\\`. The
  inline layer must not double-unescape; the round-trip tests (literal `\`, `*`, `_`, `` ` ``, `$`,
  `|`) are the guard.
- **HTML math normalization** may over-match prose that contains a `math` class or an annotation
  outside a formula. The NoteForest guard and the "no math container → untouched" test are the
  guard; a false positive is a bug, not a trade-off.
- **Settings UI copy** is limited to the three labels and the ratified group help; do not slip in
  other wording.
- **UI serialization** is a process risk: two Electron lanes at once cause timeouts on this
  machine; the single lane in section 4.4 is mandatory.

---

## 16. Handoff summary

- **Track A** owns the editor/paste surface and its tests; **Track B** owns the pure layout, the
  three settings fields, the docs and the Page/PDF evidence; the file map in section 5 is
  exhaustive.
- **Track B has three vertical levers, one horizontal invariant:** child 18, top-level 32, callout
  16; corridor 18; no document field; defaults unchanged.
- **Order:** plan + ADR merge → A1/A2/A3 and B0/B1/B2/B3 in parallel → page-gap merge → input merge
  → one full verify → release.
- **Orchestrator actions before the builders:** amend `docs/batch/brief.md` Track B to the three
  settings and the new ADR path; update the `docs/plan.md` Page-gap bullet at integration.
- **No code in this package.** The next artifact is the builder report input per track, then the
  orchestrator's batch report.
