# ADR-0010 — Page sibling gap: vertical setting, fixed horizontal corridor

- **Status:** Accepted by the product owner (19 November 2026), recorded in the v0.1.1 brief.
- **Decision owner:** Product owner.
- **Related:** ADR-0006 (group-level wrap), ADR-0007 (Page/PDF parity), ADR-0008 (personal page
  settings), `docs/spec.md` §7.2, `docs/design-tokens-page.md`, v0.1.1 brief.
- **Does not supersede:** ADR-0006 or ADR-0007; it refines the page spacing model inside them.

## Context

`PageTheme.siblingGap` exists in the personal Page theme (stored 0–96, default 18) but has no
effect. `effectivePageTheme` and `pageLayoutOptions` replace it with
`PAGE_EDGE_GEOMETRY.siblingGap` (18), and one `LayoutOptions.siblingGap` value is used for two
different things:

- the **vertical** gap between stacked Page cards, which a dense study tree wants to compress; and
- the **horizontal** parent → right-child-group corridor, which is an invariant because it carries
  the 4 px lead, the 14 px stem and the fixed arrowhead.

One value cannot serve both axes: honouring the stored value naively would silently change the arrow
corridor, and the corridor is not configurable (ADR-0006, Page design tokens). The product owner
closed the decision in the v0.1.1 brief: the vertical gap becomes a per-document setting; the
horizontal corridor stays a fixed 18 px engine constant.

## Decision

1. **`PageTheme.siblingGap` is the vertical stack gap only.** It is the gap between stacked Page
   cards: a sibling stack under one parent and the parent → below-group transition share this one
   vertical stack gap. It is:
   - stored 0–96, default 18, no smaller default for new documents;
   - a personal Page setting with a per-document override (ADR-0008 resolution), not document data;
   - fixed under density: the density lens never scales it;
   - applied by Page measurement, Page Read/Edit and PDF.
2. **The horizontal parent → right-group corridor is not a setting.** It remains the engine constant
   `PAGE_EDGE_GEOMETRY.siblingGap` = 18. The `PAGE_EDGE_GEOMETRY` field keeps its historical name;
   its meaning is now horizontal-only and it is documented as such. Page production maps it to the
   pure layout as an explicitly named option, `LayoutOptions.rightGroupGap`.
3. **The pure layout has one option per axis.** `LayoutOptions.siblingGap` is vertical;
   `LayoutOptions.rightGroupGap` is horizontal. No code path may read one for the other.
   `DEFAULT_LAYOUT_OPTIONS` keeps 24 for both, so DOM-free layouts and labs that need identical
   gaps stay unchanged; Page production passes the effective vertical value and the 18 px corridor
   separately.
4. **`effectivePageTheme` stops overwriting the stored gap.** It normalizes `siblingGap` to 0–96
   (default 18) and leaves it unscaled. `pageLayoutOptions` maps `effective.siblingGap` to the
   vertical option and `PAGE_EDGE_GEOMETRY.siblingGap` to `rightGroupGap`.
5. **The setting is exposed once.** `siblingGap` joins `ADVANCED_LAYOUT_KEYS` and
   `PAGE_THEME_FIELD_SPECS` as **Sibling gap**, px, 0–96, 1 px step. It is a per-document override
   like every other advanced layout value; an invalid draft is blocked, never clamped by the UI.
6. **Docs and tests state the split.** `docs/spec.md` §7.2 and `docs/design-tokens-page.md` describe
   the vertical setting and the horizontal invariant as two values. Density tests assert the
   vertical value is not scaled; Page/PDF parity tests assert the horizontal corridor stays 18 at
   every gap value. Continuous is untouched and never reads `PageTheme`.

## Alternatives rejected

- **Keep one value for both axes.** A gap setting would move the arrow corridor and change the Page
  edge contract on every adjustment. Rejected: the corridor must stay 18 px at every setting.
- **Make both vertical and horizontal gaps configurable.** Rejected: the horizontal corridor is the
  arrow geometry (lead + stem + head), not a spacing preference; configuring it needs a new edge
  model and ADR.
- **Density-scale the vertical gap.** Rejected: density is a type/box lens; the Page corridor and
  origin tokens are fixed at 60/70/100/120 %. Scaling the gap would move pages under density for a
  reason the user did not ask for.
- **Add a new `PageTheme` field or a document field.** Rejected: `PageTheme.siblingGap` already
  exists with the right range and is personal settings by ADR-0008; no schema change is needed.
- **A per-block or per-chapter gap.** Rejected: geometry is content-driven and has no per-block
  pixel controls; the setting is document-wide.
- **A new smaller default for new documents.** Rejected by the product owner: 18 remains the
  default; only an explicit override changes it.

## Consequences

Positive:

- A dense study tree can compress its vertical card stacks without touching the arrow corridor.
- The horizontal corridor becomes impossible to move by accident: the vertical setting and the
  corridor are separate options with separate sources.
- Page Read, Page Edit, Page measurement and PDF keep one resolved `PageSettings`; a per-document
  override reaches all of them and the fingerprint.
- The default Page output is unchanged: default 18 → 18, so fixtures, page counts and the PDF gate
  keep their baseline.

Negative / work:

- Changing the gap repaginates: page count, manual breaks and continuation markers can move. That is
  expected and remains deterministic.
- A previously stored, non-default `siblingGap` (the field was stored but ignored) now applies on
  load. No migration: 18 is the default, the UI never exposed the field, and the value is a personal
  setting, not document data.
- The old “the stored corridor is ignored” tests are rewritten: `siblingGap` is now honoured on the
  vertical axis, and the fixed-corridor assertion moves to `rightGroupGap` /
  `PAGE_EDGE_GEOMETRY.siblingGap`. This is a contract change, not a weakened test.
- Labs and regression oracles that used one gap for both axes must set both options to their old
  value to stay byte-identical.
- `PAGE_EDGE_GEOMETRY.siblingGap` remains a slightly misleading name; a comment and the spec/token
  docs pin it to the horizontal corridor. Renaming it is a separate cleanup (it would touch many
  guards for no behaviour gain).

## Revisit triggers

- Real documents need a configurable horizontal corridor, or a new arrow geometry.
- Density must scale the vertical gap.
- A per-block, per-chapter or per-placement gap is requested.
- Page/PDF parity breaks, or the horizontal corridor moves when the vertical setting changes.
- `PAGE_EDGE_GEOMETRY.siblingGap` is renamed or the Page edge model changes.
