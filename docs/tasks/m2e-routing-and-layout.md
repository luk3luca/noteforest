# M2e — Parent-relative layout + arrow routing

**Status:** Approved (4 November 2026)  
**Owner:** Builder (worktree)  
**Depends on:** M2d merged; `packages/core`; ADR-0004 M2e addendum; `docs/ux-shell.md`; `docs/spec.md` v0.4.4 (D23)  
**Out of scope:** M3 anchors/reference edges, page view, PDF, external API, light theme, font/size settings UI (M6)

## Goal

Revert global depth columns to **parent-relative placement**, swap the `+`/collapse controls, and fix the arrow rendering with a **designed routing lab** before changing product code. Add zoom/fit-width and Focus branch for deep indentation.

## 1. Parent-relative placement (D23; revert D22)

- A child group starts after its parent card plus the sibling gap; **no global x per depth**.
- Same-depth blocks under different parents may sit at different x; this is intended.
- Remove the depth-column computation/margins (`lib/columns.ts`, `--nf-card-col`, column x) from the editor. Keep pure column code only if reused elsewhere; otherwise delete it and its tests.
- Keep content-driven widths, top-level vertical stack, sibling vertical stack, and horizontal editor scroll for deep branches.
- Metrics stay: canvas max 1,600, top-level 160–480, child 144–420, gap 16, padding 10, editor padding 28–40.
- The 4-level empty chain must still fit at 1440; deeper chains scroll.
- Update tests from "same depth same x" to "child group starts at parent right + gap" and "different parents may differ in x".

## 2. Swap `+` and collapse

- `+` add-child at the **center of the right edge** (branch port), outside the text.
- Collapse at the **top-right** of the card: chevron on hover/selection; collapsed dot + child count always visible; `aria-expanded`; `⌘.`.
- No footer, no height change. The branch trunk may remain a secondary collapse target; the visible control is top-right.
- `+` sibling stays at the bottom edge; drag handle stays in the left gutter.
- Ensure `+` and collapse do not overlap; both are outside the card; no layout shift.

## 3. Arrow routing lab + fix (design first)

Do not change the product router until the lab and `docs/design/edge-routing.md` exist.

### Lab

Create a static/dev-only lab page that renders real card rectangles and arrow paths for the same cases side by side:

- one child at parent center;
- one child above/below center (small dy and large dy);
- two/three/five children with 16 px gaps;
- first child above the parent center;
- close children where the branch stem is shorter than the arrowhead;
- trunk where one child is far below;
- wrapped/page-width case (for M4 reference; not used in the editor).

Variants to compare:

- **V1** orthogonal elbow + fixed-size arrowhead polygon + minimum 12 px horizontal stem.
- **V2** fan/staggered ports for close children + fixed arrowhead.
- **V3** soft S-curve only for near-aligned cards (dy < 24 px) + fixed arrowhead.
- **V4** shared trunk + short branch with fixed arrowhead + T-junction continuity.

Screenshots at 1440×900 and 1024×768 for each variant. Write `docs/design/edge-routing.md` with the cases, variant trade-offs, chosen variant, and why. Then implement the chosen variant in `lib/edge-routing.ts` / `EdgeLayer`.

### Fix requirements

- Arrowhead is a **fixed-size polygon** at the endpoint, independent of path length; do not use a marker that scales with a short segment.
- Final segment into the child is horizontal and at least 12 px; the arrowhead points right.
- The first child's path is continuous from the parent port to the child; the trunk starts at the T-junction; no gap or skew.
- Close children: separate ports or a minimum stem; the arrowhead must remain legible.
- No backwards segment/U-turn; direction parent → child.
- Unit tests for all lab cases, including close/offset.

## 4. Zoom/fit and Focus branch

- Zoom out/in/reset: `⌘-`, `⌘+`, `⌘0`; display the current zoom in the status bar or a compact control.
- **Fit width**: set zoom so the active document/branch content fits the editor viewport; navigation only, no layout/document change.
- **Focus branch**: show the selected block's ancestor chain + descendants; hide/dim other top-level blocks/sibling branches. Reversible; view state only; document untouched.
- These exist to inspect deep indentation without infinite horizontal scroll.
- Page-width wrap preview is M4; do not build it here.

## 5. Keep M2c/M2d behavior

Do not regress: desync queue/reconciliation, keyboard model, heading escape, UI sans 15.5, inline chapter edit, right/bottom `+` (now swapped), contextual add top-level/chapter, non-destructive Backspace, landscape default, M2d collapse dot.

## Tests and gates

- Unit: parent-relative offsets; different parents may differ in x; 4-level fit; deep chain overflow; arrow lab cases; fixed arrowhead/min stem; trunk continuity.
- E2E: 4-level chain at 1440; deep chain scroll; zoom/fit; focus branch; `+` center and collapse top-right; collapse no height change; Backspace; add top-level/chapter; no desync.
- `npm run typecheck`, `npm test`, `npm run e2e`; 300-block performance no worse than M2d by >20%; axe 0 serious/critical.
- Screenshots under `artifacts/m2e/`: 4-level, deep scroll, routing lab variants, chosen arrows, controls, focus/zoom.
- No screen recording/Notability.

## Deliverables

- Implemented app.
- `docs/design/edge-routing.md` + lab/screenshots.
- Tests + screenshots.
- `docs/reports/m2e-routing-and-layout.md` with gate table, measurements, chosen variant, known gaps.
- Worktree path, branch, commits, commands.

## Acceptance

Child placement is parent-relative; a wide block does not push unrelated branches; 4-level chain fits at 1440; close/offset arrows are legible and forward; `+` is centered and collapse top-right; collapse adds no height; zoom/fit and Focus branch work; no M2c/M2d regressions.
