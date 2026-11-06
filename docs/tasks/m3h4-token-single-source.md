# M3h4 — design-token single source and CSS guard

**Role:** Implementer / Builder  
**Milestone:** M3h — Sentinel re-review minors  
**Base:** current `main` after the M3h re-review integration (`362d41d`)  
**Worktree:** isolated builder worktree prepared by orchestrator v2  
**Scope:** S3-3 only. No visual redesign, no type/radius scale expansion, no new UI feature, no new
runtime dependency.

## Goal

Make `apps/desktop/src/renderer/src/lib/design-tokens.ts` the **single source of truth** for the
geometry/shell values that are currently duplicated in CSS, and add a guard test so future drift
fails CI. The rendered result must not change.

Canonical values already ratified by the product owner:

- `editorPaddingBottom` = **88 px** (the unused token said 96; CSS already renders 88).
- `chapterGap` = **28 px** (the unused token said 32; CSS already renders 28).
- `siblingGap` / `--nf-child-gap` = **24 px**.
- `callout.safeGap` = **16 px minimum** (effective gap may be larger).
- below-stack `rowIndent` 26, `trunkInset` 12, `trunkGap` 8, `stemMin` 12.

## Required work

1. Wire the CSS to the token source for the geometry/shell values that are currently duplicated:
   - editor canvas max width and horizontal/top/bottom padding;
   - chapter gap;
   - child/right-group gap;
   - card bounds (top-level 160–480, child 144–420) and card padding 10;
   - edge widths (1.25 / 1.75, muted 1);
   - the documented stacking z-index values (parent card 2, callout lane 1, right group 0, edge 0)
     where they are part of the same token story;
   - below row indent, trunk inset/gap, stem min, callout gap/lane/safe gap/max anchor offset.
2. Use one mechanism, not two:
   - either set root CSS custom properties from `DESIGN_TOKENS` at app boot and make `styles.css`
     consume them; or
   - generate a token CSS file from the TS module at build/test time.
   Do not leave a second hand-maintained copy with matching numbers.
3. Keep token-only router values (edge lane, arrowhead, port spacing) as TS; document which values
   are CSS-bound and which are router-only.
4. Add a guard test that fails if a CSS custom property or literal that is supposed to come from a
   token drifts. The test must import the TS token module, not duplicate the numbers.
5. Remove or wire the dead tokens called out by the review: `canvasMaxWidth`, `childRowGap`,
   `chapterGap`, `cardRadius`, `editorPaddingTop`, `editorPaddingBottom`, `edgeWidth`,
   `edgeWidthActive`, `topLevel/child bounds`, `wrapIndent` (reserved for M4 may stay documented).
6. Update `docs/design-tokens.md` to say which values are runtime CSS variables and which are
   router-only.

Do **not** introduce a full spacing/type/radius scale or restyle components; that belongs to M6.
Do not change visible colors, typography, layout, or animation.

## Tests and gates

- `npm run typecheck`
- targeted vitest/token guard; `npm test`
- `npm run test:ui` (at least m2-shell, m2-view, m3-anchor-callout) to prove no visual/layout drift
- `npm run e2e:critical`
- `npm run verify:fast`
- Computed-style assertions for 88/28, 24 child gap, card bounds, edge widths, z-index.
- Screenshot before/after at 1440 and 960; no diff expected.

The Orchestrator runs one full `npm run verify` after integration.

## Deliverable

Report: worktree path, branch, base, commit, summary, files, token/CSS mapping, guard test, tests and
timings, screenshots, risks, and anything not verified. Do not merge or push. Stop and ask if a
visual change is unavoidable or a token has no single correct value.
