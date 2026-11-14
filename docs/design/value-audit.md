# Chrome value audit — borders, cards, panels

**Status:** Analysis for product-owner review. No code change.
**Date:** 14 November 2026.
**Scope:** numeric chrome values (border widths, radii, shadows, panel/sidebar sizes, card padding,
panel gaps). Typography, density curves, and Page/PDF geometry are out of scope; the settings
inventory covers the user-facing values.

---

## 1. Method

Collected the values from `apps/desktop/src/renderer/src/lib/design-tokens.ts`,
`apps/desktop/src/renderer/src/styles.css`, `apps/desktop/src/shared/shell.ts`,
`packages/layout/src/page-settings.ts`, `packages/layout/src/edge-style.ts`, and the Settings
components. Classified each as:

- **S** — standard or grid-consistent (1 px hairline, 4/8 px grid, 44/48 touch/header).
- **P** — deliberate product choice, ratified.
- **D** — derived from a choice (not a token).
- **L** — legacy or near-duplicate worth cleaning.
- **E** — engine/semantic geometry contract; do not normalize.

The list below is curated, not every literal: about **60–70 numeric chrome values**, of which the
large majority are grid-consistent or semantic.

## 2. Inventory

### 2.1 Border widths

| Value | Where | Class | Judgment |
|---|---|---|---|
| 1 px | cards, panels, inputs, Page card border | S/E | keep; hairline contract |
| 2 px | focus ring, strong selection | S | keep |
| 3 px | anchor chip radius, not a border width | — | see radii |

Only two border widths. **Healthy.**

### 2.2 Radii

| Value | Where | Class | Judgment |
|---|---|---|---|
| 3 | `--radius-control` (inputs, buttons, anchor chip) | P | near 4; candidate to fold into 4 |
| 4 | card / Page card / image (`--nf-card-radius`) | P | keep as the card radius |
| 6 | `--radius-overlay`, `--radius-strip` | L | two names, one value; fold into the panel scale |
| 7 | `--radius-chip` (tabs) | L | 1 px from 8; fold into 8 |
| 8 | `--radius-panel` (sidebar, toolbar, canvas) | S/P | keep as the panel radius |
| 9 | `--nf-note-radius` (Continuous card) | P/L | V0 visual; close to 8; decide one |

**Six radii for three roles** (control, card, panel) plus a note-card variant. This is the main
accumulated-choice debt: 3/4/6/7/8/9 are visually near-neighbors. A scale of **4 (control/card) and
8 (panel/overlay/chip)** would remove four values with no layout impact; the Continuous note radius
9 would become 8 (or 10 if the note should stay visually softer). Visual-only, screenshots needed.

### 2.3 Shadows

| Value | Role | Class |
|---|---|---|
| `0 8 24` | panel | P |
| `0 24 64` | overlay | P |
| `0 12 32` | toast | P |

Three roles, three shadows; consistent. **Healthy**; no normalization needed.

### 2.4 Panel and shell sizes

| Value | Where | Class | Judgment |
|---|---|---|---|
| 180 / 264 / 640 | sidebar min / default / max | P | 264 = 8×33, 180 = 4×45, 640 = 8×80; keep |
| 48 | collapsed rail | S | VS Code/Material; keep |
| 44 | header, toolbar | P/S | app token; keep |
| 28 | rows, icon buttons | P | compact UI; keep |
| 30 | Settings gear box | P | matches the rail; keep |
| 1180 × 820 | Settings modal | P | new layout; keep |
| 184 | Settings nav | S | 8×23; keep |
| 536 | Settings pane max | **L/D** | derived from the old 980 modal (980−184−258); with the 1180+400 rail the space is 594. The rows are designed at 536; either keep and document or move to ~592 with a visual pass |
| 320–400 | Settings preview rail clamp | P | new; keep |
| 228/312 (or 224/308) | derived sidebar totals with a 48 bar | D | not tokens; document |

The **264** is not the problem: 264 is a multiple of 8. **260** (4×65) and **270** (2×135) are
*less* grid-consistent. There is no case for changing 264 for “roundness”. If a decimal round is
wanted, 280 (8×35) or 240 (8×30) would be grid-rounded, but they change the approved default and the
resize/reset/session contract for no functional gain. **Keep 264.**

The **536** is the real leftover: it is a derived width from the pre-R6 Settings modal, now
centered in a wider pane. Keeping it is defensible (readable row width); it should be documented as a
choice, not a token.

### 2.5 Card paddings

| Value | Where | Class | Judgment |
|---|---|---|---|
| 10 | Continuous card (`cardPadding`) | P | off the 8-grid; the only 10 in cards |
| 8 / 12 | Page card compact / comfortable (`PageTheme.cardPadding`) | P/E | density-scaled; keep |
| 8 / 12 | Settings panels, code blocks, Page cards | P | mostly 8/12 |

Three card paddings across surfaces: **8/10/12**. The Page pair is a density scale (8 compact, 12
comfortable); the Continuous 10 sits alone. Normalizing the Continuous 10 to 8 or 12 is possible but
**measurement-affecting** for the Continuous canvas (card width/height, wrapping, edge placement).
Do it only with a visual pass and the Continuous geometry tests; not a pure token rename.

### 2.6 Gaps and spacing (selected)

Semantic/engine values (do not normalize): edge corridor 18 (4+14), sibling gap 18, child indent 26,
callout gap 16, callout card indent 38, callout right gap 24, trunk insets 12/24, edge gap 2, minGap
4, arrow 6, stem 12, lane 2–14, callout lanes 240–480.

Chrome values: 2/3/4/6/7/8/10/14/16/18/20/22/24/28/36/40/48/54. Many are grid-consistent; the
odd ones (3, 6, 7, 10, 14, 18, 22) are a mix of semantics (18 corridor, 14 stem) and small
near-duplicates (3/6/7 gaps in popovers and rows). A small **gap scale 4/8/12/16/24** would clean the
popover/row gaps without touching the edge geometry.

### 2.7 Icons and control heights

Icon sizes 11/12/13/14/15/17; control heights 20/22/28/30/32/44/48. These are role-specific (status,
warning, button, sidebar, activity) and generally consistent. A 12/14/16/18 scale could reduce the
spread, but the gain is small; not a priority.

## 3. What is standard, what is a choice, what is debt

| Group | Count (approx.) | Status |
|---|---|---|
| Grid/standard (1 px, 2 px, 4/8, 44/48, 28) | ~15 | healthy |
| Product choices (sidebar 180/264/640, 1180×820, 320–400 rail, shadows, card 4, panel 8) | ~15 | healthy, documented |
| Semantic geometry (18 corridor, 26/38 indents, 16/24 callout gaps, 12/24 insets, edge widths) | ~20 | **do not touch**; Page/PDF gate |
| Near-duplicates/legacy (radii 3/6/7/9, card padding 10, Settings pane 536, doc 208–360) | ~10 | candidates |
| Derived (224/228/308/312, 536, sidebar totals) | ~5 | document, do not tokenize |

## 4. Recommendations

1. **Do not chase decimal roundness.** 264 is 8×33; 260/270 are worse on the grid. Keep the sidebar
   tokens. The real debt is radii and card padding, not the width.
2. **Normalize the radius scale** to two roles: **4** (control/card) and **8**
   (panel/overlay/chip/note), with the Continuous note radius 9 mapped to 8 (or 10 if the note must
   stay softer). Visual-only; no measurement change. One CSS pass + screenshots.
3. **Keep the Page card padding 8/12** (density scale). Decide the Continuous card padding 10: either
   document it as intentional or move it to 12 (or 8) with a Continuous visual + geometry pass.
4. **Document the Settings pane 536** as a deliberate readable width (or move to ~592 with a
   screenshots pass); it is not a token.
5. **Fix the docs mismatch**: `ui-shell-map`/`ui-shell-contents` say 208–360; the code uses
   180/640/264. Align the docs to the code (or re-ratify the range).
6. **Do not normalize the semantic geometry** (edge corridor, indents, callout gaps, trunk insets).
   Those are a visual contract and a Page/PDF gate.
7. **One source**: radii and shadows live in CSS root, card tokens in `design-tokens.ts`, Page card
   values in `PageTheme`. A small token index (already `docs/design-tokens.md`) should list them; a
   guard can catch a new literal. The values are not duplicated in code today beyond the near-duplicate
   names.
8. **Icons**: optional 12/14/16/18 scale later; low value.

Suggested order: after the Sentinel, a **visual token pass**: radii (4/8), popover gaps (4/8/12),
card padding decision, Settings pane decision, docs alignment. Radius changes are visual-only; card
padding changes need a Continuous visual + geometry check; Page/PDF untouched.

## 5. Decisions

Resolved with the product owner (14 November 2026):

1. **Radius scale:** **4/8** (control/card and panel/overlay/chip/note); the note radius 9 maps to 8.
   No third 10 step.
2. **Continuous card padding:** keep **10**, documented as the note-surface optical inset. Changing
   it is measurement-affecting; not worth a Continuous/Page geometry pass now.
3. **Settings pane:** keep **536**, documented as a deliberate readable width (8×67, on the grid).
   It is not a token and not a layout bug.
4. **Sidebar range:** keep **180/264/640**; docs aligned to the code.
5. **Token pass timing:** after the Sentinel, folded into the shell activity bar S1 (visual-only:
   radii, popover gaps); card padding and pane width are documented, not changed.
