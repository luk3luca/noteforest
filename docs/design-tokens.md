# Design tokens — index

**Status:** Active index (M4e3 Page/Continuous split, 9 November 2026)
**Scope:** Navigation and ownership only. Values live in the two surface docs and their source modules.

Page and Continuous are separate design systems. They may share low-level renderer primitives
(stroke, arrowhead, path helpers, card radius), but they do not share a settings namespace, a
preset, or a token document. Equal numbers across the two namespaces are coincidental unless the
shared-primitives table explicitly says otherwise.

## Surface documents

| Surface | What it owns | Source of truth | Document |
|---|---|---|---|
| **Page** | `PageSetup`, `PageTheme`, density, page typography/boxes, Page packing and callout topology, page chrome, Page route values, print/PDF constraints | `packages/layout/src/page-settings.ts`, `page-chrome.ts`, `page-routing.ts` | [`design-tokens-page.md`](design-tokens-page.md) |
| **Continuous** | Canvas width/padding, shell gaps, card shell, Continuous zoom view state, callout lane/safe zone, stacking, shell CSS variables | `apps/desktop/src/renderer/src/lib/design-tokens.ts`, `apply-design-tokens.ts`, `apps/desktop/src/shared/view-state.ts` | [`design-tokens-continuous.md`](design-tokens-continuous.md) |
| **Shared engine primitives** | Edge stroke, arrowhead, corner radius, lane/stem/trunk values, orthogonal path helpers, shared card radius | `packages/layout/src/edge-style.ts` (surface styles), `packages/layout/src/edge-path.ts` (path/arrow algorithms); shell card radius in `design-tokens.ts` | [`design-tokens-continuous.md`](design-tokens-continuous.md#shared-edge-primitives) |

The Page presentation map (`pageCssVariables`) is Page-only and is documented in the Page doc.
It is not a token namespace and never supplies Continuous values.

## Ownership rules

1. **Page values** are personal (`AppSettings.page` plus a per-document override), resolved by
   `effectivePageTheme`/`pageLayoutOptions`/`pageCssVariables`, and consumed by Page Read/Edit,
   Page measurement, and PDF. They are never stored in `document.json`.
2. **Continuous values** are shell/editor tokens or per-document view state. Continuous never calls
   `layoutDocument` and never reads `PageTheme`/`PageSettings`.
3. **Shared primitives** are engine values with one owner (`EDGE_STYLE`, or the shell card radius).
   They must be identical on both surfaces; they are not a user-facing Page or Continuous setting.
4. A Settings control changes the owning namespace only. The Settings menu information architecture
   is designed after this split; this document does not define menus.
5. Do not add a second hand-maintained copy of a token in CSS, a component, or a lab.

## Guards

- `apps/desktop/test/page-token-guards.test.ts` checks the Page/Continuous ownership split, the
  Page CSS variable map, the absence of a compact CSS fallback, the removed legacy Page literals,
  and the value rows in these docs against the source constants.
- `apps/desktop/test/design-tokens-css.test.ts` checks the Continuous `DESIGN_TOKENS` →
  `DESIGN_TOKEN_CSS_VARIABLES` → `styles.css` path.
- `packages/layout/test/page-settings.test.ts` checks the Page theme/density/CSS map contract.
- `packages/layout/test/group-wrap.test.ts` and the Page labs check the per-level wrap cap rather
  than an accumulated indent.

## Historical note

Before M4e3 this file mixed Page and Continuous values in one table. The split is behavior
preserving: Page counts, geometry, density values, and PDF output are unchanged. The old planned
token-override model is superseded by ADR-0008: Page is a personal lens over a continuous canonical
document, and future Settings work targets the owning namespace above.

## Future resize tokens

Planned in `docs/tasks/future-manual-resize.md`; not scheduled and not part of the current token
set. They are described in [`design-tokens-continuous.md`](design-tokens-continuous.md#future-resize-tokens-post-m4).
