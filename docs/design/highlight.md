# Find in Page, and the highlighter

**Status:** design, 17 November 2026. Two sequential batches: **F4a** (find in Page) then **F4b** (the
highlighter). **F4a is merged at `cee3577`** (find paints the mounted pages through `CSS.highlights`);
**F4b is merged at `0c86e8a`**: the mark renders through the content schema and `applyMarks`; a stored mark never needed the find mapping.
**Inputs:** the spike `docs/design/find-page-highlight.md` (node-path tags + CSS Custom Highlight API),
`docs/design/find-bar.md` (the find model), the product-owner decisions of 16 November (4–5 tones, deleting
the text removes the highlight, it exports to PDF, the find wins visually), `page/segments.ts` (which
already renders marks).

## 1. Two layers, one primitive

| | Find | Highlighter |
|---|---|---|
| Lifetime | transient: derived from a query, cleared on close | permanent: stored in the document |
| Storage | none | an inline ProseMirror **mark** on the text |
| Appearance | border + underline + a stronger tint | a flat tint, no border |
| Survives edits | no | yes, and deleting the text deletes the highlight |

They share **one** mapping — offset in the block projection → ranges in Continuous and in Page — and that
is the whole reason to build them together. Neither changes the document model except the mark.

## 2. The mark

- `type: 'highlight'`, one attribute `tone` ∈ `blue | green | amber | rose`. Four tones, colour names, no
  semantics: a product owner who wants "green = done" can decide that, the schema does not.
- Inline only, additive, no id, no metadata, no comment text. **No notes on text** — that is the
  annotation layer that stays out of v1.
- Because it is a mark, ProseMirror gives us for free: mapping across edits, undo, copy/paste (a highlight
  copied into another block keeps its tone), and deletion (removing the marked text removes the mark).
- **Versioning:** marks are not whitelisted by `validation.ts`, so the mark is **additive** and no
  `schemaVersion` bump is needed. Two tests pin it: a v2 document without highlights opens unchanged, and a
  document with highlights reopens with them intact. The editor schema must define the mark in the same
  batch, otherwise ProseMirror would silently drop it on the first edit.

## 3. Colours

| Tone | Continuous (dark / light) | Paper (Page and PDF) |
|---|---|---|
| blue | accent at 20 % | accent-light at 28 % |
| green | success at 20 % | green at 28 % |
| amber | warning at 22 % | amber at 28 % |
| rose | danger at 18 % | rose at 28 % |

The tints are **background** only; the text keeps its own colour in both fields, so a highlight never
changes contrast. On paper the tint is the light-theme tone, because the paper is always light even in a
dark app: the PDF must look like a highlighter on paper, not like a dark-mode artefact.

## 4. Applying and removing

- The selection bubble (the existing inline toolbar) gains **four swatches** and, when the selection
  already carries a tone, a **five-swatch** row where the active one is pressed and the first is
  "remove". One row, no menu.
- Keyboard: `⌘⇧H` applies the **last used** tone; pressing it again on a selection that is uniformly that
  tone removes it. The last tone is session state, not a setting.
- Read mode: no swatches, no shortcut — the mark is visible but not editable, like every other mutation.
- A highlight is visible in **Continuous and Page**, and both read the same mark.

## 5. Rendering

- **Continuous:** the mark is a real decoration from the schema, so it renders as a span carrying
  `data-highlight-tone`. Nothing else to build.
- **Page:** `page/segments.ts` already applies marks when it builds the page text (`applyMarks`), so the
  highlight is one more case there. The page is measured, so the mark must be a **background** only: no
  padding, no border, no weight change — geometry must not move.
- **PDF:** the print model carries the same mark classes and the paper tones, so the export prints the
  tint. Nothing about the paginator changes.

## 6. Find in Page

Per the spike:

1. **Tag each rendered page segment** with `data-node-path="3.1"` — the only missing link.
2. **Map** a result (block id + offsets in the projection) to `(element, offsetInText)` pairs, reusing the
   projection walk `find-decorations.ts` already does for Continuous.
3. **Paint with `CSS.highlights`**, never by wrapping spans: wrapping would change the measured DOM and
   could reflow the pagination. Two registered highlights: `nf-find` for every match, `nf-find-current` for
   the current one.
4. **One occurrence, N ranges.** A match that crosses a segment or a page boundary is several ranges in one
   highlight, and the current occurrence puts *all* its ranges in `nf-find-current` — the "one range" rule
   from the earlier risk list, expressed as one name rather than one DOM range.
5. **Print carries no find highlight.** The print compositor builds its own DOM from the print model, so a
   find highlight cannot reach the PDF; the batch asserts it rather than assuming it.
6. Continuous keeps its existing decoration; the sidebar, the counts and the ordering do not change.

## 7. What is explicitly out of scope

- Notes or comments attached to text (the annotation layer).
- Per-document tone palettes, tone renaming, a highlighter panel.
- Highlighting images, formulas or whole blocks — the mark is on text.
- Any change to the paginator, the page model, the page chrome or the print geometry.

## 8. Order and shape of the work

| Batch | Contents |
|---|---|
| **F4a** | `data-node-path` tags, the offset→page mapping, `CSS.highlights` for find, one-current-across-ranges, the print "no highlight" assertion, tests |
| **F4b** | the `highlight` mark (tone), the editor schema entry, the selection-bubble swatches, `⌘⇧H`, Continuous and Page rendering, the print tones, reload/undo/copy tests |

F4b depends on F4a only for the mapping helper; if the helper lands clean in F4a, F4b reuses it instead of
writing a second one.
