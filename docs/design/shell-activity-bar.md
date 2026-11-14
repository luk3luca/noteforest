# Shell activity bar — design proposal

**Status:** Proposal for product-owner review. No implementation yet; separate shell batch after
the special-text polish and the Sentinel.
**Date:** 14 November 2026.
**Scope:** replace the top Library/Outline tabs with a vertical activity bar (Library, Outline,
Anchor Health, future sections), like VS Code.
**Not in scope:** the Anchor health sheet content (separate design), the library surface behaviour,
the Page/PDF, settings.

---

## 1. Why

Today the sidebar is a card with a 44 px header (search + collapse), a 28 px **Library/Outline
segmented control**, the content, and a footer with Settings. Two tabs are fine; adding Health as a
third top tab starts to crowd the header, and future sections (Search, Topics, Data) do not fit. A
vertical activity bar:

- gives one stable place for every section and scales without touching the header;
- makes the **collapsed state useful**: the bar stays visible, so a section can be opened with one
  click instead of expand-then-tab;
- keeps the section icons at the **same x** in expanded and collapsed states, so nothing shifts;
- lets the Settings gear move to the bar's bottom, where it no longer competes with the content footer.

## 2. Sizing rationale (the numbers are derived, not magic)

Existing shell tokens (Batch A/V and the shell fixes): sidebar content **180 min / 264 default / 640
max**, header **44**, collapsed rail **48**, icon buttons **28**, rows **28**, 4/8 px spacing grid.

- **Activity bar 48 px**: matches the current collapsed rail and the Material/VS Code 48 dp target.
  Alternative **44 px**: aligns the first icon with the 44 px header. Recommendation: **48**; the
  header alignment is not worth losing the rail/standard match.
- **Sidebar total** = bar + content: **228–312** with 48 (or 224–308 with 44). The content keeps
  180–264; it never shrinks. The canvas loses the bar width, which is expected.
- **Collapsed** = bar only (48, was 48): the same width, so the canvas does not jump when collapsing.
  The icons keep their columns; the collapse control is the only new state.
- **Icons 17 px** inside 28 px buttons with 8 px padding; active state = filled icon + 2 px accent
  indicator on the bar's inner edge; tooltips; badges as small pills.
- **Vertical rhythm** 4/8: 8 px between icon buttons, 8 px top/bottom padding; Settings at the bottom.

## 3. Layout

```text
┌────┬──────────────────────────────────┐
│ 🗂  │  Search (⌘K)          [collapse] │  44 header
│ 🌳  │  ─────────────────────────────── │
│ ⚠3 │  Library or Outline content      │
│    │                                  │
│    │                                  │
│ ⚙  │                                  │
└────┴──────────────────────────────────┘
 48px   content 180–264 (total 228–312)
```

- Sections: **Library**, **Outline**, **Anchor Health**; future **Search**, **Topics**, **Data**.
- Anchor Health icon carries a badge with `broken + ambiguous` (needs repair); idle/orphans are shown
  as a muted count inside the Health view, not on the badge.
- Settings stays a **rail-bottom icon** (no “Settings” label); `⌘,` unchanged.
- The collapse control: a chevron/panel icon at the top of the bar (or the active icon toggles the
  content). `⌘\` still toggles; the bar never collapses.
- The top segmented Library/Outline control is removed; the sidebar tab state persists as the
  **active section** in the same session store.

## 4. Health view

The activity icon switches the sidebar content to a **compact Health view** (not the modal):

- summary: needs repair / idle / orphans / hidden counts;
- filter chips (Needs repair, Idle, Orphans, Hidden);
- a short list of rows (state, kind, block, quote); click = Locate;
- **Open full health** opens the existing sheet for actions/repair.
- Empty state: “All anchors are healthy.”
- The sheet remains the only place with repair actions; the view is read-only navigation.

## 5. Accessibility and keyboard

- The bar is a vertical `tablist` with `aria-orientation="vertical"`, `aria-selected`, roving
  tabindex, Up/Down arrows, Home/End; each icon has `aria-label`.
- `⌘2`/`⌘3` are already Continuous/Page; do not steal layout shortcuts. Avoid new global shortcuts
  in v1; the bar is pointer + arrows + existing palette commands.
- The collapse control keeps `aria-expanded` and `aria-controls`.
- The badge has an accessible label (“3 anchors need repair”), not color-only.

## 6. States

- Active section: filled icon, accent indicator, `aria-selected`.
- Hover: surface-1 background on the button, icon text-1.
- Collapsed: bar only, active section icon still selected; clicking another icon expands the sidebar
  to that section.
- No document open: Library/Outline/Health still render; Health shows “No document” and disables the
  view body (the sheet already handles the no-document state).
- Read mode: the bar is navigation only; Health view is read-only; no mutation from the view.

## 7. Tests

- Bar renders in both states with the same icon x; collapse/expand does not move the icons.
- Section switching, persistence, ARIA keyboard (Up/Down/Home/End), focus.
- Settings gear and its position; the footer no longer has the Settings label.
- Health view counts/filters/Locate/Open full health; badge label.
- Library/Outline content unchanged; the old top tabs removed; keyboard shortcuts unchanged.
- No page errors; screenshots expanded/collapsed, three sections, Health badge.

## 8. Risks

- The sidebar is a ratified shell (Batch A/C); this is a visible IA change and needs the product
  owner's visual pass.
- The Library/Outline tabs have a tested ARIA model; moving to a vertical tablist touches those tests.
- Width: the canvas loses 48 px; on 1280 windows the content area shrinks. Acceptable, but check the
  Page preview/rail and the Continuous canvas at 1280.
- The Health view must not duplicate the sheet actions; keep it read-only.

## 9. Slices

- **S1**: bar + Library/Outline + Settings; remove the top tabs; collapse; tests. Also the
  **visual token pass** from `docs/design/value-audit.md`: radii 4/8, popover gaps 4/8/12, docs
  180/640/264 alignment. The Continuous card padding and the Settings pane 536 stay separate
  decisions (measurement-affecting / layout pass).
- **S2**: Anchor Health view + badge + Locate + Open full health (after the Anchor Health v1 sheet).
- **S3**: future sections (Search, Topics, Data) as they become real.

## 10. Open decisions

1. Bar **48** (recommended) or 44 (header-aligned)?
2. Health icon **opens the view** (recommended) or the modal directly?
3. Collapse control: chevron at the bar top, or the active icon toggles the content (recommended:
   chevron, explicit)?
4. Do we add `⌥1/2/3` section shortcuts in S1 or leave the palette only?
5. Keep the Library/Outline names or rename to “Documents”/“Outline” in the bar tooltips?
