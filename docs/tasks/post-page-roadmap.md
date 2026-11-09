# Post-Page roadmap — PDF, full Sentinel, settings

**Status:** planning only. Page remains the only implementation focus for now.  
**Context:** R2i/R2j Page layout/callout work is next. PDF, a full-codebase
Sentinel/refactor, and Settings UI come after the Page checkpoint.

## Recommended order

```text
1. Page fixes (R2i subtree wrap, R2j callout A/B2) + Page checkpoint
2. Quick targeted Sentinel on Page/edge/token/PDF seams
3. M4c Page PDF + PDF gate
4. Full-codebase Sentinel + refactor/fixer
   - includes the complete settings-variable inventory
5. Settings UI (Page + Continuous)
6. Targeted Sentinel/fixer on Settings + final verify
```

## Why this order

### Why not full Sentinel before PDF

PDF adds a real subsystem and a new token surface: print theme, print-only
geometry, pagination markers, PDF job/export, A5/Letter, raster parity. A
full-codebase review before PDF would not see that code, so the settings
inventory and refactor would be incomplete. It would also delay the product
value and force a second full review after PDF.

### Why a quick Sentinel before PDF

A targeted review is still worth it:

- Page layout/tree/wrap logic;
- edge/trunk topology and Page/PDF shared records;
- Page token placement and the absence of hardcoded pixels;
- PDF seam: print compositor can consume `PageEdgeModel` without a second
  router;
- tests/fixtures that PDF will inherit.

This is a **Page/PDF seam review**, not the full-codebase review.

### Why the full Sentinel before Settings

Settings must expose variables, ranges, labels, groups, defaults, and Page vs
Continuous separation. A full-codebase review is the right place to find:

- duplicated literals and hidden magic numbers;
- variables that should become PageTheme tokens;
- variables that should stay engine constants;
- Continuous vs Page ownership;
- print-only values that Settings should expose or hide;
- per-document override candidates;
- stale/dead settings fields and migration needs.

If Settings UI comes first, it will be built on an unreviewed token model and
will likely be reworked after the full review.

### Why a targeted Sentinel after Settings

After Settings, the risk is confined to the settings UI/store/migrations. A
targeted review + fixer is enough unless the full-codebase refactor changes the
UI foundation.

## Full-codebase Sentinel scope

- All packages: `core`, `layout`, `pdf`, desktop main/preload/renderer.
- Design tokens: Continuous, Page, shared edge primitives, print theme.
- Settings candidates: every numeric/geometric/typographic value, default,
  range, label, group, advanced/hidden, global/document override.
- Page vs Continuous ownership: no shared namespaces, no cross-imports of design
  values.
- PDF-only values: print skin, page numbers, margins, continuation markers,
  export behavior.
- Layout/edge/trunk contracts and dead code.
- Tests/fixtures/docs drift.
- Output: review report + prioritized refactor/fixer brief; no product-code
  changes in the Sentinel role itself.

## PDF gate note

- Full 50+ page gate on A4.
- A5 and Letter: smoke checks in M4c (page count, text extraction, no cut
  content, no blank pages); full visual gate can follow if needed.
- PDF uses resolved PageSettings; Settings UI is not a prerequisite.

## Manual-break entry point

Open decision; recommended default for Settings:

- Page toolbar action: “Break before block” for the selected block;
- block context menu / outline context menu as a second entry;
- no separate mode or global list-only workflow.

## Resolved Page decisions feeding this roadmap

- B2 offsets: callout trunk 24, callout card 38; child trunk 12, child card 26.
- Fallback when neither A nor B2 fits: **stacked** (callouts first, children
  below); B1 is dropped.
- Mode A: children start below the callout stack.
- Mode A leader may exit through the parent card’s right side.
- Order: place parent → subtree-aware child wrap → callout mode → re-check if
  the lane changes the child origin.
- Page/PDF trunks continue with R2g semantics.
