# Find highlight in Page — spike result

**Status:** investigation, 17 November 2026. Closes the prerequisite for the find/highlighter batch.
**Question:** how does a find match map onto the paginated Page DOM, given that the page is measured and
must not move?

## The facts

- The paginator works with `MeasuredSegment` (`packages/layout/src/types.ts`): `index`, `kind`, `y`,
  `height`, `breakableBefore`, and **`nodePath`** — the path into the block content tree. It carries **no
  model text offsets**.
- The Page renderer builds its own render segments (`page/segments.ts`) and each one already carries the
  same `nodePath`. A block is drawn segment by segment; a segment is the element a paragraph, a list item,
  a code line, a table row or a formula becomes.
- The find engine (F3) reports, per result, the `blockId` plus **absolute offsets in the projection text**
  and, in the same shape `find-decorations.ts` already uses in Continuous, the projection gives each text
  segment a `nodePath` and a range.
- Continuous maps a match to ProseMirror positions; Page has no ProseMirror. It has DOM text inside
  segment elements.

## The proposal

1. **Tag the rendered segments**: emit `data-node-path="3.1"` on each page segment element. Cheap, no
   layout impact, and it is the only missing link.
2. **Map a match to `(element, offsetInElementText)` pairs**, the same way Continuous maps to ProseMirror:
   walk the block projection for the result's block, take the text segments whose range intersects the
   match, and turn each into the element found by `data-node-path` plus an offset inside its text.
3. **Paint with the CSS Custom Highlight API**, not by wrapping spans:
   `CSS.highlights.set('nf-find', new Highlight(...ranges))` and a second name for the current hit. This
   is the decisive point — wrapping text in spans would change the measured DOM and could reflow the
   pagination. Highlights paint without touching the tree.
4. A match that crosses a segment or a page boundary becomes **several ranges in one highlight**: one
   occurrence, painted in pieces. That is the same shape the Continuous decoration already has, and it is
   why the "one range" note in the earlier risk list is about the *current* occurrence, not the painting.
5. **Print is untouched**: the highlight lives in the screen renderer; the print compositor builds its own
   DOM from the print model, so a find highlight can never reach the PDF. Worth an explicit test.

## What it costs

- The tag and the projection walk are small; the mapping is the bulk, and it is the same code the
  persistent highlighter will need (an offset → page ranges function, used twice).
- No measurement, pagination, print or model change.

## Risks and open points

- `CSS.highlights` needs a recent Chromium: assume it is available in the packaged Electron, and make the
  batch assert it rather than assume silently.
- The highlighter (persistent marks) will need the same mapping plus a rendered style that survives a
  selection: two highlight names, one transient, one permanent, with different colours.
- A mark inside a **table cell** hits the same known limitation the find decoration already has; the
  table-cell guard batch removes the legacy shapes but does not add cell ranges.
