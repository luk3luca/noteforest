# Editor appearance phase 1 — implementation report

**Role:** Builder / Implementer
**Phase:** 1 (post-A–F editor appearance)
**Branch:** `t3/editor-appearance-monokai-toolbar`
**Base:** `1b65e79` (`main`)
**Worktree:** `a builder worktree`
**Date:** 14 November 2026

---

## 1. Summary

Part A and Part B of the phase-1 brief are delivered together, with tests and evidence.

- **Part A — code palette and Page/PDF syntax colours.** The muted pastel `--code-*` roles are
  replaced by **Monokai** in the dark theme and **One Light** in the light theme, exactly as the
  approved `docs/design/code-palette.md` table. A new shared `lib/code-highlight.ts` owns the one
  lowlight registry and highlights a code line while inserting the `nf-anchor` wrappers around the
  highlight markup. `page/segments.ts` runs that helper per code line with the block's language (and
  the editor's same auto fallback for an unknown language), so Page Read, Page Edit, and print/PDF
  render the same token classes from the same segment HTML. The fixed-light paper gets its own
  `--nf-page-code-*` One Light roles; it never reads the shell `--code-*` theme roles, so a dark app
  theme cannot print Monokai. `hljs-*` selectors are scoped to `.nf-continuous-surface` and
  `.nf-page-scope` only; tables, inline code, and prose never match them. Code backgrounds, borders,
  font size, line height, and spacing are unchanged; Page font-style/weight rules stay
  Continuous-only, so pagination cannot change.
- **Part B — table toolbar silhouette (F8).** The toolbar is one compact icon row (30 px tall, no
  text labels, no second row) with all 13 commands still present. Placement is computed from the
  active cell: header caret (or any case where an above-caret bar would overlap the header) puts the
  bar just below the table; otherwise it stays above the active cell. Floating UI `flip`/`shift`
  with an 8 px viewport padding keep it on screen. The read-only source preview moved out of the
  toolbar into a separate lower-right read-only panel, so expanding it never grows the silhouette
  over the table and never blocks content below it. Commands, keyboard behaviour, roles,
  `aria-label`s, `aria-pressed`, `aria-expanded`, and the copy confirmation contract are preserved.

No schema change, no `settingsVersion` bump, no Page layout/geometry/pagination change, no export
contract change, no showcase change, no new dependency.

## 2. Files changed

Source:

- `apps/desktop/src/renderer/src/lib/code-highlight.ts` *(new)* — one shared `lowlight` instance;
  `codeAnchorSpans` (longest-token/first-occurrence matching, every occurrence preserved);
  `highlightCodeLineHtml` (hast → nested `hljs-*` HTML with exactly one `nf-anchor` wrapper per token
  occurrence, text byte-identical, plain fallback that never drops an anchor).
- `apps/desktop/src/renderer/src/editor/code-block.ts` — imports the shared lowlight instance instead
  of creating a second registry (editor decorations unchanged).
- `apps/desktop/src/renderer/src/page/segments.ts` — code lines use the shared helper with the block
  language; token anchors become `CodeAnchorSpan`s; whole-code anchors keep wrapping the first line;
  the same helper also colours nested code blocks inside blockquote/list/table atomic containers.
- `apps/desktop/src/renderer/src/styles.css` — Monokai/One Light `--code-*` values; the fixed paper's
  One Light `--nf-page-code-*` roles on the Page skin root; scoped `hljs-*` rules for Continuous and
  Page/print; compact table toolbar CSS; separate source-panel CSS.
- `apps/desktop/src/renderer/src/editor/TableToolbar.tsx` — compact one-row silhouette, header-aware
  virtual reference, viewport clamp options, icon-only commands with unchanged labels, icon copy
  confirmation plus a screen-reader status, source preview portal.

Tests:

- `apps/desktop/test/code-highlight.test.ts` *(new)* — per-line highlighting, text preservation,
  balanced markup, one wrapper per token across highlight spans, longest-token/every-occurrence
  matching, plaintext/unknown fallback, multiline-hint rejection.
- `apps/desktop/test/code-palette.test.ts` *(new)* — exact Monokai/One Light/paper token values, no
  pastel leftovers in those roles, comment contrast floor/quietest role, every `hljs-*` selector
  scoped to Continuous or Page, no shell `--code-*` read on the paper, unchanged Page code
  background/border/`white-space: pre`.
- `apps/desktop/test/page-segments.test.ts` — Page code lines are highlighted per line without
  changing segmentation; token and whole-code anchors survive; plaintext/inline code/table text stay
  neutral.
- `tests/ui/editor-appearance.test.mjs` *(new)* — dark/light Continuous colours, Page Read colours and
  anchor rectangle, Page Edit colours, paper stays One Light after switching the app to dark, PDF
  page count/text/raster colours (One Light present, Monokai absent), table toolbar below the header
  with the header caret, below the table for the first body row, above the caret for a deeper row,
  inside the viewport, 13 labelled commands, source toggle `aria-expanded`.
- `tests/ui/special-text.test.mjs` — the old "Page Read is neutral" assertion is replaced by the new
  colour contract (One Light keyword/comment present, real code text, no editor code chrome).
- `tests/ui/suites.mjs` — the new suite is listed in `FILES` and the `page` group.

Docs:

- `docs/reports/editor-appearance.md` — this report.

## 3. Acceptance

- [x] **Dark Continuous uses Monokai; light uses One Light; no pastel values remain.**
      Exact values are asserted by `code-palette.test.ts`; computed colours are asserted in the UI
      suite (`rgb(249, 38, 114)` keyword dark, `rgb(166, 38, 164)` light).
- [x] **Page Read and Page Edit show the same token colours; PDF shows colours; text is real and
      selectable; page count and pagination unchanged.**
      Page Read, Page Edit, and the PDF raster carry One Light; the PDF text extraction contains the
      code lines; the new suite asserts the export page count equals the Page model, and the M4c3 gate
      suite passes with its page-count/parity assertions. The highlighted markup adds no metric:
      every span inherits the code font, and the paper does not get the Continuous italic/strong
      rules.
- [x] **Code anchors still wrap the right token/whole block in Page Read/PDF; anchor suites green.**
      One `nf-anchor` wrapper per token occurrence (unit + Page Read assertion); `m3-code-anchor`,
      `m3-anchor-callout-layout`, `m4b1-page-view`, `m4c1-print-compositor` pass.
- [x] **Table toolbar never covers the header/active cell; every current command remains reachable;
      viewport-clamped; keyboard/ARIA intact.**
      Geometry assertions in the new UI suite (header caret below the table, first body row below the
      table, deeper row above the active cell and clear of the header, 8 px viewport bounds); 13
      command buttons with non-empty labels; the existing special-text table test still exercises
      row/column/alignment/paragraph/copy/source commands.
- [x] **No schema/settingsVersion/Page layout/showcase change beyond syntax markup; no fixed
      sleeps/native dialogs; existing assertions updated only for the colour contract.**
      No schema/settings/export file touched. The only existing UI assertion change is the Page Read
      colour contract in `special-text.test.mjs`. New waits are conditions (`waitForSelector`,
      `waitForFunction`, geometry predicates); the export test uses the existing dialog-guard mock.

## 4. Behaviour details

**Palette.** Dark: keyword/tag `#f92672`, string `#e6db74`, number `#ae81ff`, comment `#75715e`,
function `#a6e22e`, type `#66d9ef`, meta/attr `#fd971f`. Light and paper: keyword `#a626a4`, string
`#50a14f`, number/meta `#986801`, comment `#a0a1a7`, function `#4078f2`, type `#c18401`, tag
`#e45649`. The paper roles are separate declarations (`--nf-page-code-*`), so Page Read/Edit and the
print window do not depend on `data-theme`.

**Highlighting and anchors.** `codeAnchorSpans` finds token occurrences exactly as before; the
serializer flattens lowlight's hast into text runs with their nested class frames and reopens frames
around an anchor boundary. The anchor wrapper therefore surrounds the highlight markup and stays a
single span even when the token crosses several `hljs-*` boundaries (for example `total = sum`),
which keeps the measurement occurrence count at one. `plaintext` is a registered lowlight grammar
and stays neutral; an unknown stored language uses lowlight auto-detection, matching the editor
decorations. If highlighting throws, the plain fallback still emits every anchor.

**Table toolbar.** The floating reference is the active cell rect; when the caret is in a
`tableHeader`, or when an above-caret bar would intersect the first row, the reference is a
zero-height rect below the table and placement `top` draws the bar there. The menu height is measured
from the live bubble (32 px first-show fallback), so the below-table gap is stable. `flip` and
`shift` use an 8 px padding. The paragraph commands use the compact `¶↑`/`¶↓` glyphs with unchanged
accessible labels. Copy swaps the icon to a check and keeps the `Copied` status text (visually
hidden, announced), so the existing feedback contract and tests remain valid.

## 5. Checks

All commands run in this worktree on 14 November 2026.

| Check | Result | Time / notes |
|---|---|---|
| `npm run check:boundaries` | PASS | 233 files, 1092 imports, 16 rules, 0.4 s |
| `npm run typecheck` | PASS | 5.1 s (all workspaces) |
| `npm test` | PASS | 139 files / 1377 tests, 4.7 s warm (9.6 s cold) |
| `npm run verify:fast` | PASS | boundary + typecheck + unit + critical e2e; e2e 16/16 in 34.9 s suite time (43.1 s command incl. build) |
| `node --test tests/ui/editor-appearance.test.mjs` | PASS | 1 suite / 2.1 s test; 10.3 s wall incl. app lifecycle |
| `node --test tests/ui/special-text.test.mjs` | PASS | 9/9 tests, 11.6 s suite |
| `node --test --test-concurrency=3 m3-code-anchor, m3-anchor-callout-layout, m4b1-page-view` | PASS | 17/17 tests, 15.8 s |
| `node --test --test-concurrency=2 m4b1b1-page-edit-overlay, m4c1-print-compositor` | PASS | 16/16 tests, 16.5 s |
| `node --test --test-concurrency=2 m4d2-export-ui, ui-appearance-v3` | PASS | 17/17 tests, 21.3 s |
| `node --test tests/ui/m4c3-pdf-gate.test.mjs` | PASS | 3/3 gate tests, 11.9 s suite (300-block export budget still passes) |

The full `npm run verify` was **not** run: the Orchestrator runs it once at UI concurrency 4.

## 6. Evidence

Screenshots and data are under `artifacts/editor-appearance/` (gitignored):

- `artifacts/editor-appearance/continuous-dark.png` — Monokai Continuous.
- `artifacts/editor-appearance/continuous-light.png` — One Light Continuous.
- `artifacts/editor-appearance/page-read.png` — Page Read with One Light segments and the code-token
  anchor highlight.
- `artifacts/editor-appearance/pdf-page-1.png` — page 1 of the exported PDF rasterized at 150 dpi.
- `artifacts/editor-appearance/table-toolbar-header.png` — compact toolbar below the table with the
  caret in the header row.
- `artifacts/editor-appearance/export/Code palette.pdf` — the real exported PDF.
- `artifacts/editor-appearance/export/editor-appearance-evidence.json` — colours, page counts,
  toolbar geometry, and PDF pixel counts (147 One Light keyword pixels, 0 Monokai keyword pixels).

The source-panel placement is visible in the updated
`artifacts/special-text/table-source-1440x900.png`.

## 7. Risks and limitations

- Per-line highlighting intentionally differs from the editor's whole-block grammar state for
  constructs that continue across lines (a multi-line string/comment only has its first line
  coloured). This is colour-only and matches the approved "highlight per line" design; no metric
  changes.
- One Light comments are intentionally quiet (`#a0a1a7`, about 2.4:1 on `#f5f7f9`); this is the
  approved classic One Light value, and the unit test only guards a readability floor and that
  comments remain the quietest role.
- A first body row also puts the toolbar below the table (not above the caret), because an
  above-caret bar would cover the header row; this is the only way to satisfy both "above the caret"
  and "never cover the header row". Deeper rows keep the above-caret behaviour.
- The source preview is now a fixed lower-right read-only panel rather than part of the bubble. It
  has an explicit close button and still closes when the caret leaves the table; it no longer grows
  the toolbar silhouette or blocks the content directly under the table.
- The compact paragraph actions use glyphs (`¶↑`/`¶↓`) instead of text labels; the accessible names
  and titles are unchanged.

## 8. Next step

Sentinel review against `docs/tasks/editor-appearance.md`. The Orchestrator then runs one full
`npm run verify` at UI concurrency 4; the product-owner visual/VoiceOver pass covers the subjective
palette and toolbar judgment. Remaining phase-1 items after this batch are outside this brief (no
syntax-theme picker, no code-background theme, no content text colour/highlighter/block tint).
