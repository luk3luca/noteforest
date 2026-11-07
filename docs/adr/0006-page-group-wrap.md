# ADR-0006 — Page layout: group-level left-origin wrap

- **Status:** Accepted in principle by the product owner (7 November 2026); implementation and
  layout-lab validation in M4
- **Decision owner:** Product owner
- **Related:** spec §7.10/§11, ADR-0002 (PDF pipeline), `docs/ux.md` reader/page, M4 plan

## Context

The current page layout (`packages/layout/src/layout.ts`) keeps a direct child to the right when the
remaining page width can hold its card, and otherwise wraps it below the parent at
`parent.x + wrapIndent` (18 px). For a deep branch, the parent is already far to the right, so the
wrap starts far to the right and leaves little horizontal room. Descendants then wrap again from the
right edge, producing narrow columns and a cascade of extra line wraps. The PDF becomes visually
fragmented even when the content itself is simple.

The product priority is **readable horizontal width first**, PDF length second. A longer PDF is
acceptable if each page is easier to read.

## Decision

A child group stays to the right **only when the entire child group fits** in the remaining page
content width. Otherwise, the **whole group** moves below its parent, with a single left-origin
indent, and the rule recurses inside each child.

```text
layoutBlock(parent):
  measure every direct child's subtree width
  if every child subtree fits to the right of parent:
      place all direct children to the right, in order
  else:
      place all anchored callouts below the parent (existing order)
      place every direct child below the parent at parent.x + wrapIndent
      recurse for each child's own group

  wrapIndent = 18 px (initial token)
  cumulative wrap indent is capped; the exact cap is validated in the M4 layout lab
```

- **Origin:** `parent.x + wrapIndent`, not `parent.right`. For a top-level block, `parent.x` is the
  page content left, so the first wrap uses the page width from the left.
- **Granularity:** the group is atomic. If one child/subtree does not fit, all direct siblings move
  below together. No per-child “rescue” placement to the right.
- **Anchored callouts** remain below the parent, in existing anchor order, before wrapped direct
  children.
- **Recursive:** a child that still overflows wraps its own group at its own left origin, with the
  next indent.
- **Indent cap:** after a small number of cumulative wrap steps, the layout stops increasing the
  left indent and uses a fixed band near the page content left, so a pathological deep chain cannot
  drift right. The exact cap is a design token validated in M4; it is not a per-depth global indent.
- **Same policy in reader, page view, and PDF.** D14 requires one layout engine and two renderers; a
  PDF-only rule would break WYSIWYG.

## Consequences

Positive:

- Each wrapped subtree gets the page width from the left, not a narrow column near the right edge.
- The top-level block remains the entry point; children appear below it as an outline-like group.
- Fewer cascading wraps and less visual fragmentation on deep branches.
- Deterministic and measurable: subtree width is a pure layout input.

Negative:

- Siblings that could individually fit to the right move below when the group does not fit.
- Vertical height and PDF page count can increase; accepted by the product owner.
- The layout engine needs recursive subtree measurement and a stable cap to avoid oscillation.
- The reader and page view must share the same group-wrap rule; a PDF-only change is forbidden.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Current right-first + wrap at `parent.x + 18` | Calls out the deepest/rightmost parent, causing narrow columns and cascading wraps. |
| Global left staircase for every depth | Indents all siblings even when everything fits; turns the whole document into an outline and wastes width. |
| Per-child subtree-aware wrap | Keeps more siblings right, but preserves the right-edge drift for the children that do not fit and makes the page less predictable. |
| CSS re-pagination / print-only layout | Violates ADR-0002 and D14. |

## Gate / validation

M4 layout lab on the showcase and the 300-block fixture comparing:

1. current right-first layout;
2. group-level left-origin wrap (this ADR);
3. per-child subtree-aware left wrap.

Metrics: page count, max used width, whitespace, number of wraps, edge crossings, and readability.
The product owner prioritizes width/readability over page count. Exact `wrapIndent` and cap values
are decided from the lab and recorded in `docs/design-tokens.md`; they are not silently chosen in
code.

## Revisit triggers

- Group wrap causes pathological page counts at 300 blocks even after the cap.
- A future page size/orientation changes the width budget materially.
- The product owner reverses the width-over-length priority.
- The reader/page view needs a different width profile that cannot share the same engine.
