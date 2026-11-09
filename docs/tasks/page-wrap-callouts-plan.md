# Page wrap + callout modes — design plan

**Status:** planning only; no implementation started.  
**Scope:** Page Read/Edit and PDF only. Continuous is untouched.  
**Base:** `main` after R2f/R2g/R2h; Page checkpoint still pending.  
**Launch:** tomorrow, after the product owner confirms the open decisions below.

## 1. Design-token layout

Recommendation: **completely separate design systems** for Continuous and Page,
with two code namespaces and two docs. Settings will expose many more Page
choices than Continuous choices, so sharing a token namespace or a preset would
be the wrong abstraction.

### Continuous

- Code: `apps/desktop/src/renderer/src/lib/design-tokens.ts`
- Docs: `docs/design-tokens-continuous.md`
- Owns shell/canvas, editor padding, card bounds, chapter gap, Continuous-only
  values.
- Must not import or duplicate Page layout values.
- Settings footprint is small: zoom, maybe canvas width, future font/spacing.

### Page

- Code: `packages/layout/src/page-settings.ts` — `PageTheme`, presets, custom
  parsing; this is the single point for Page layout/typography/callout/trunk
  positions.
- Docs: `docs/design-tokens-page.md`
- Owns page sizes/margins (setup), PageTheme typography, card widths, gaps,
  callout lane/modes, child indent, trunk offsets, page-only edge values.
- Page renderer and PDF read the same resolved `PageTheme`/`PageSettings`; no
  second copy in JSX or CSS.
- Every new Page token carries settings metadata: group, label, unit, range,
  default, preset availability, and whether it is beginner/advanced/hidden.
  This is what makes the future settings UI possible without hardcoded forms.

### Shared engine primitives, not shared design

- `packages/layout/src/edge-style.ts` may stay as low-level renderer primitives:
  path helpers, arrow geometry, stroke cap/join, corner rounding code.
- **Design values are not shared.** Page gets its own `pageEdgeStyle` values in
  `PageTheme` (trunk insets, stem, gap, arrow size if it diverges); Continuous
  keeps its own. They may start from the same defaults, but each surface has a
  single source of truth.
- `docs/design-tokens.md` becomes a short index that links the two independent
  design docs; it must not duplicate values.

### Guard tests

- Page layout values are read from `PageTheme`; no hardcoded pixel positions in
  `layout.ts`/`page-edges.ts` for the new behavior.
- A PageTheme test covers defaults, presets, custom overrides, settings metadata,
  and CSS variables where applicable.
- A Continuous token test covers its own values; it must not read PageTheme.
- A docs check ensures the two design docs point at their own code modules and do
  not re-declare each other's values.

### New Page tokens (names provisional)

| Token | Purpose | Starting value |
|---|---|---:|
| `childIndent` | Direct-child/level indent in Page | 26 px |
| `childTrunkInset` | Outer child trunk from parent left | 12 px |
| `calloutTrunkInset` | Inner callout trunk from parent left | 24 px |
| `calloutCardIndent` | Callout card left from parent left | 38 px |
| `calloutRightGap` | Mode A callout lane gap from parent right | 24 px |
| `calloutModeMinWidth` | Minimum right space to choose mode A | 240 px |
| `pageStemMin` | Page-only left stem before arrowhead | 12 px |
| `pageTrunkGap` | Page below-trunk start offset | 0 px |
| `wrapIndent` / `maxWrapIndent` | Existing PageTheme wrap bounds | keep |

All Page values live in `PageTheme`; the settings UI reads the same metadata.
The exact B2 offsets are the first open decision.

### Related plans

- Settings/menu: `docs/tasks/page-settings-ui-plan.md`
- PDF consumer: `docs/tasks/m4c-pdf-plan.md`

## 2. Feature 1 — subtree-aware wrap

### Rule

For every parent:

1. Compute the preferred width of the **whole primary subtree** of each direct
   child, not only the child card:
   - card + gap + the widest child column recursively;
   - use max, not row packing: siblings are a level column.
2. If every direct child subtree fits to the right of the parent, keep the group
   at the parent's right column and the parent's y.
3. Otherwise, move the **whole direct-child group** below the parent at
   `parent.x + childIndent` (capped by the page right and `maxWrapIndent`).
4. From the new position, repeat for each child: try its own children to the
   right; if they do not fit, indent them below that child.
5. Keep sibling order and group atomicity. Do not split one sibling right and
   another below when the group fails.

### Diagrams

All fits:

```text
P ── C1 ── G1
     C2 ── G2
     C3
```

P + C1 + G1 does not fit, but C1 + G1 does after the group wraps:

```text
P
  C1 ── G1
  C2 ── G2
  C3
```

Even C1 + G1 does not fit at the new origin:

```text
P
  C1
    G1
  C2 ── G2
  C3
```

### Implementation notes

- Add a pure `preferredColumnWidth`/`subtreeFitsRight` helper in
  `packages/layout/src/layout.ts`, cached by `(blockId, availableWidth)`.
- It must use the same card box and callout-lane budget as the real placement.
- Replace the direct-child own-card fit check in the non-compaction path only.
- The compaction lab policy is not the product path; leave it alone or keep it
  as an oracle.
- Measure the impact on page count, whitespace, and overlap with a lab fixture
  before accepting.

## 3. Feature 2 — callout modes A + B2

B1 (one shared below trunk) is dropped. The fallback when neither A nor B2
fits is the current **stacked** placement: callouts first, children below.

### Mode A — right-side callouts when there is room

```text
P ──→ c1
│    c2
└─→ C1 ── G1
   C2
```

- Callouts stack to the right of the parent.
- Direct children start below the callout stack, indented at the normal child
  origin; they descend to avoid collision.
- Callout group and child group have separate trunks; callout arrows enter left.
- Choose A only when the required callout lane width fits to the parent's right.

### Mode B2 — two below trunks when there is no right room

```text
P
│  ╎
│  ╎├─→ c1
│  ╎├─→ c2
│
└─→ C1 ── G1
└─→ C2
```

- Outer/left trunk: direct children, classic inset.
- Inner/right trunk: callouts, double offset.
- Callouts come first below the parent; direct children start lower.
- Both trunks are independent and continue across pages per R2g.
- Every child arm enters left; no card overlap; nested child trunks remain
  independent.

### Mode selection

Per parent, deterministic:

```text
if right lane fits callouts:
  A
else if B2 fits without collision:
  B2
else:
  stacked fallback (callouts first, children below)
```

The decision is per parent, not global. It must not depend on viewport or zoom;
it uses the resolved Page width/margins and the parent's placed box.

### Callout placement vs Feature 1

Order to evaluate:

1. place/measure the parent;
2. decide whether the direct-child group should wrap using the subtree-fit rule;
3. choose the callout mode from the resulting free right space;
4. place callouts/children in the chosen mode;
5. re-run the subtree fit if the callout lane changes the child origin.

The exact order is an open design point; it needs to avoid oscillation and
double layout.

## 4. Decisions

Resolved:

1. **B2 offsets:** callout trunk 24 px, callout card 38 px; child trunk 12 px,
   child card 26 px. The callout trunk is the inner/right trunk; the child
   trunk is the outer/left trunk.
2. **Fallback if neither A nor B2 fits:** stacked — callouts first, children
   below. B1 is dropped.
3. **Mode A:** children start below the callout stack at the child indent.
4. **Mode A callout leader:** it may exit through the parent card's right side.
5. **Order:** place parent → subtree-aware child wrap → callout mode → re-check
   if the lane changes the child origin.
6. **Page breaks:** callout and child trunks continue with R2g semantics;
   callout and child groups stay separate on continuation pages.
7. **Settings save:** explicit Apply/Cancel, not instant-save.
8. **PDF sizes:** A4 full 50+ page gate; A5/Letter smoke checks in M4c.

Still open:

- Manual-break entry point: recommended Page toolbar + block/outline context
  menu; final UX decision in Settings.
- Whether any R2i/R2j geometric value is user-facing or advanced/hidden in
  Settings; the PageTheme metadata inventory decides this.

## 5. Task sequence for tomorrow

### P0 — Token/doc split (small, no behavior change)

This is Page-only. Continuous tokens/docs stay independent and are not edited
except for the shared engine boundary.

- Split docs into Continuous/Page/index; move new Page layout values into
  `PageTheme`; add defaults/tests.
- No visual change; guard that no literal positions remain in layout code.
- Estimate: 2–3 h.

### R2i — Subtree-aware Page wrap

- Implement whole-subtree fit, group wrap at parent + childIndent, recursive
  right-first behavior, atomic siblings.
- Keep current callout placement.
- Lab: P→C1→G1, wide fan, showcase/stress; page count/whitespace/overlap.
- Estimate: 4–6 h plus lab.

### R2j — Page callout modes A + B2

- Mode A right lane; B2 two below trunks; stacked fallback.
- Edge/trunk integration with R2g; no Continuous change.
- Lab: callouts with/without right space, multiple callouts, page breaks.
- Estimate: 1–2 days depending final geometry.

### Checkpoint

- Full `verify`, screenshots, product-owner Page check.
- Only after acceptance: M4c PDF.
- R3/R4 remain after the checkpoint.

## 6. Non-goals

- No Continuous changes.
- No M4c PDF during this plan.
- No spec/UX/ADR change without the Architect/product owner.
- No free positioning, pins, or arbitrary coordinates.
- No change to the canonical document schema.

## 7. Acceptance for the design lab

- [ ] P→C1→G1: if the full subtree does not fit, C1 moves below P and G1 stays
      right of C1 when it fits.
- [ ] If C1+G1 still does not fit, G1 wraps below C1.
- [ ] Siblings remain one atomic level column.
- [ ] Mode A: callouts right, children below, no collision.
- [ ] Mode B2: callouts on the inner/right trunk first, children on the
      outer/left trunk lower, no collision.
- [ ] Every child/callout arm enters left.
- [ ] Trunks continue across pages; nested trunks stay independent.
- [ ] Page count and empty lower-left area measured before/after.
- [ ] Full verify green at integration.
