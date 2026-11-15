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
- **Icons 17 px** inside 28 px buttons with 8 px padding; active state = filled icon + `surface-2`
  background + `text-1`; **no accent stripe** (product-owner decision, 15 November 2026: the
  shell has no left/edge accent indicators); tooltips; the Health badge is a small square
  counter (radius 2, tabular number), **not a pill**.
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
- **Settings** keeps its divider above the gear in **both** states: expanded (the footer rule) and
  collapsed (the rail rule). The gear is the bar's last item; the sidebar footer row is removed.
- **Width**: `sidebarWidth` stays the **content** width (180–264). The rendered panel is
  `48 + content` (228–312); collapsed is 48. A persisted 264 must produce a 264 content column,
  never 216.
- The top segmented Library/Outline control is removed; the sidebar tab state persists as the
  **active section** in the same session store.

## 4. Health view

**S1 ships the bar entry only**: the Health icon opens the existing Document health sheet as a
bridge (no badge yet). S2 replaces that bridge with the in-sidebar view.

**S2 model (15 November 2026, supersedes the v1 sketch):** the Health section is the report —
issues in **expandable sections** (chevron, name, count), one row per issue. Clicking an issue opens
a **520 px repair modal in front**; the sidebar stays behind, so closing the modal never loses the
report. Confirm closes it, the row leaves the list and the toast carries Undo (no “next”). The v1
modal sheet is retired; the list + detail modal (660 px) is parked. Design:
`docs/design/document-health-sidebar.md`.

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

- **S1**: bar + Library/Outline + Health (bridge to the sheet) + Settings; remove the top tabs;
  collapse; tests. **Settings keeps its divider in both states.** **Library note vs `.md` icon
  semantics**: note = `NotebookText`, `.md` = `FileText` plus a `.md` suffix in `text-3`, never
  colour alone (`data-library-icon` for the test). The new chrome uses radii 4/8 only; the
  **global pill/token pass** (including reference chips) stays parked as its own batch. The
  Continuous card padding stays **10** and the Settings pane stays **536** (documented widths).
  No `⌥1/2/3` shortcuts in S1; the palette is the entry point.
- **S2**: **Document health** in the sidebar: sections, badge, search, Locate; the repair opens in
  a 520 px modal and Confirm closes it. The v1 sheet is retired. Design:
  `docs/design/document-health-sidebar.md`.
- **S3**: future sections (Search, Topics, Data) as they become real.

## 10. Decisions

Resolved with the product owner (14 November 2026):

1. Bar **48**; the numbers in §2 are the measured rationale.
2. Health icon **opens the view**; the view links to the full sheet.
3. Collapse control: explicit chevron at the bar top.
4. No `⌥1/2/3` shortcuts in S1; palette only.
5. Keep **Library** and **Outline** as the names.
6. No accent indicator on the active icon: filled icon + background (15 November 2026).
7. The Health badge is a square counter, not a pill (15 November 2026).
8. Settings keeps its divider in both expanded and collapsed states (15 November 2026).
9. S2 retires the modal health sheet: the repair lives in the widened sidebar
   (15 November 2026).

