# ADR-0010 — Page vertical gaps: three settings, fixed horizontal corridor

- **Status:** Accepted by the product owner (19 November 2026); revised to three vertical settings
  by the product owner the same day (v0.1.1 revision 2).
- **Decision owner:** Product owner.
- **Related:** ADR-0006 (group-level wrap), ADR-0007 (Page/PDF parity), ADR-0008 (personal page
  settings), `docs/spec.md` §7.2, `docs/design-tokens-page.md`, v0.1.1 brief and its revision 2.
- **Does not supersede:** ADR-0006 or ADR-0007; it refines the page spacing model inside them.
- **Replaces:** the unmerged revision-1 draft of this ADR (one vertical sibling gap). Git keeps it.

## Context

Three vertical spacing values reach the Page tree today, and only one of them is a real setting:

- `PageTheme.siblingGap` is stored (0–96, default 18) but has no effect. `effectivePageTheme` and
  `pageLayoutOptions` overwrite it with `PAGE_EDGE_GEOMETRY.siblingGap` (18).
- `PageTheme.calloutGap` is stored (0–96, default 16) but has no effect. `pageLayoutOptions`
  overwrites it with `PAGE_EDGE_GEOMETRY.calloutGap` (16).
- `chapterGap` is not a PageTheme field at all. `pageLayoutOptions` passes
  `DEFAULT_LAYOUT_OPTIONS.chapterGap` (32), so the top-level rhythm cannot be overridden.

At the same time, one `LayoutOptions.siblingGap` value serves two unrelated purposes:

- the **vertical** gap between stacked Page cards, which a dense study tree wants to compress; and
- the **horizontal** parent → right-child-group corridor, which is an invariant because it carries
  the 4 px lead, the 14 px stem and the fixed arrowhead.

One value cannot serve both axes: honouring the stored value naively would silently change the
arrow corridor, and the corridor is not configurable (ADR-0006, Page design tokens).

The product owner first closed this as one vertical sibling gap. In revision 2 the owner split the
vertical axis into the three rhythms a page actually has — top-level blocks, child stacks, callout
stacks — because compressing one should not compress the others. The horizontal corridor stays
fixed.

## Decision

1. **Page has three independent vertical gap settings.** Each is a personal Page setting (a global
   default plus a per-document override, ADR-0008), fixed under density, and consumed by Page
   measurement, Page Read/Edit and PDF. None is document data.

   | Field | Label | Default | Range | Sets |
   |---|---|---:|---:|---|
   | `PageTheme.siblingGap` | **Child gap** | 18 | 0–96 | Parent → below-child gap; child → child stack gap; the next sibling after a previous subtree; the callout-stack → child transition. |
   | `PageTheme.chapterGap` | **Top-level gap** | 32 | 0–96 | The vertical gap between top-level blocks in a chapter. |
   | `PageTheme.calloutGap` | **Callout gap** | 16 | 0–96 | Parent → anchored-callout gap for below placements; callout → callout gap. |

   The child gap does not move top-level blocks or the callout stack; the top-level gap does not
   move children or callouts; the callout gap does not move direct children. In callout mode A the
   first callout sits in the right lane at the parent's y, so the parent → callout transition there
   is horizontal and the callout gap applies only to the callout → callout stack.
2. **The horizontal parent → right-group corridor is not a setting.** It remains the engine
   constant `PAGE_EDGE_GEOMETRY.siblingGap` = 18. The field keeps its historical name; its meaning
   is horizontal-only and it is documented as such. Page production maps it to the pure layout as
   an explicitly named option, `LayoutOptions.rightGroupGap`. Child indent 26, callout card indent
   38, callout right gap 24, trunk insets 12/24 and the arrowhead stay fixed too.
3. **The pure layout has one option per axis.** `LayoutOptions.siblingGap` is the child gap,
   `LayoutOptions.chapterGap` is the top-level gap and `LayoutOptions.calloutGap` is the callout
   gap — all vertical. `LayoutOptions.rightGroupGap` is the horizontal corridor. No code path may
   read one for another, and the compaction row split must use `rightGroupGap` horizontally and
   `siblingGap` vertically. `DEFAULT_LAYOUT_OPTIONS` keeps 24/24/32/20 for DOM-free layouts, labs
   and estimators; Page production supplies the resolved three values and the 18 px corridor.
4. **`effectivePageTheme` honours and normalizes the three values.** It clamps each to 0–96 with
   its default, never multiplies it by density, and no longer overwrites `siblingGap` or
   `calloutGap` with corridor constants. `chapterGap` stops coming from `DEFAULT_LAYOUT_OPTIONS`.
   `pageLayoutOptions` maps `effective.siblingGap`, `effective.chapterGap` and
   `effective.calloutGap` to their vertical options and `PAGE_EDGE_GEOMETRY.siblingGap` to
   `rightGroupGap`.
5. **The three settings are exposed once**, in Page → Advanced layout: **Child gap**,
   **Top-level gap**, **Callout gap**, in that order, in px, 0–96, 1 px step. They use the existing
   per-document override path (override dot, "Use global layout"); an invalid draft is blocked, never
   clamped by the UI. The group help becomes "Values in pixels. Editing a value makes this layer
   Custom." (ratified Q4).
6. **Default Page output is unchanged.** At the defaults, 18/32/16 resolves to the same geometry as
   0.1.0, with the 18 px corridor passed separately as `rightGroupGap`; default page count, fixture
   coordinates and the PDF gate keep their baseline. The `LayoutOptions` object gains one field, but
   no rendered coordinate changes.
7. **Docs and tests state the split.** `docs/spec.md` §7.2 and §4.7, `docs/design-tokens-page.md`
   and code comments describe three vertical settings and one horizontal invariant. Tests assert
   each axis moves alone at 0/default/max, the corridor stays 18, density does not scale, and
   Page/PDF parity holds. Continuous is untouched and never reads `PageTheme`.

## Alternatives rejected

- **One vertical gap for all three rhythms.** Rejected by the product owner in revision 2: the
  three rhythms answer different reading problems, and one lever would move a dense top-level
  chapter and a callout stack together.
- **Derive the top-level and callout gaps arithmetically from the child gap** (for example child +
  14, child − 2). Rejected: it hides the coupling, cannot reproduce the independent 18/32/16
  defaults with one range, and makes every future default change a formula change.
- **Keep one value for both axes.** A gap setting would move the arrow corridor and change the Page
  edge contract on every adjustment. Rejected: the corridor must stay 18 px at every setting.
- **Make both vertical and horizontal gaps configurable.** Rejected: the horizontal corridor is the
  arrow geometry (lead + stem + head), not a spacing preference; configuring it needs a new edge
  model and ADR.
- **Density-scale the gaps.** Rejected: density is a type/box lens; the Page corridor and origin
  tokens are fixed at 60/70/100/120 %. Scaling a gap would move pages under density for a reason the
  user did not ask for.
- **Add a document or chapter field.** Rejected: page settings are personal by ADR-0008; a gap is a
  page lens and a document field would change `document.json` for a preference.
- **A per-block, per-parent or per-placement gap.** Rejected: geometry is content-driven and has no
  per-block pixel controls; the three settings are document-wide.
- **A new smaller default for new documents.** Rejected by the product owner: 18/32/16 remain the
  defaults; only an explicit override changes them.
- **Rename `PAGE_EDGE_GEOMETRY.siblingGap` now.** Rejected as a separate cleanup: it would touch
  many guards for no behaviour gain; a comment, the spec and the token doc pin it to the horizontal
  corridor.

## Consequences

Positive:

- A dense study tree can compress its child stacks, its top-level rhythm or its callout stacks
  independently, without touching the arrow corridor.
- The horizontal corridor becomes impossible to move by accident: the vertical settings and the
  corridor have separate sources and separate options.
- Page Read, Page Edit, Page measurement and PDF keep one resolved `PageSettings`; a per-document
  override reaches all of them and the fingerprint.
- The default Page output is unchanged: 18/32/16, so fixtures, page counts and the PDF gate keep
  their baseline.

Negative / work:

- Changing any gap repaginates: page count, manual breaks and continuation markers can move. That
  is expected and remains deterministic.
- A previously stored, non-default `siblingGap` or `calloutGap` now applies on load. No migration:
  the UI never exposed those fields, both are personal settings, and `chapterGap` defaults to 32 in
  an older settings file.
- Tests that documented "the stored corridor is ignored" are rewritten: `siblingGap` and
  `calloutGap` are honoured on the vertical axis, and the fixed-corridor assertion moves to
  `rightGroupGap` / `PAGE_EDGE_GEOMETRY.siblingGap`. That is a contract change, not a weakened test.
- `PAGE_EDGE_GEOMETRY` no longer owns `calloutGap`: it is no longer an invariant, so the setting's
  default becomes a `PageTheme` default constant. `PAGE_EDGE_GEOMETRY.siblingGap` remains as the
  horizontal constant only.
- Labs and regression oracles that used one gap for both axes must set `siblingGap` and
  `rightGroupGap` to their old value to stay byte-identical; `DEFAULT_LAYOUT_OPTIONS` keeps both at
  24 so DOM-free defaults do not move.
- The settings fingerprint string changes because the theme gains a field. Fingerprints are
  in-memory per measured run, so no stored artifact migrates.
- `PAGE_EDGE_GEOMETRY.siblingGap` remains a slightly misleading name; a comment and the spec/token
  docs pin it to the horizontal corridor.

## Revisit triggers

- Real documents need a configurable horizontal corridor, or a new arrow geometry.
- Density must scale any of the three vertical gaps.
- A per-block, per-parent, per-chapter or per-placement gap is requested.
- A fourth vertical gap, or a layout model that places blocks without the three rhythms.
- Page/PDF parity breaks, or one gap moves another axis or the horizontal corridor.
- `PAGE_EDGE_GEOMETRY.siblingGap` is renamed or the Page edge model changes.
