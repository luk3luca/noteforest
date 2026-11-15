# Document health UI lab — sidebar report, modal repair

Self-contained HTML mock for the Document health surface. Open `index.html` in a
browser; nothing here is application code.

## Model

- **The sidebar is the report.** Issues are grouped in expandable sections; an
  error row carries the quote and the branch count, nothing else. Empty sections
  do not render.
- **Clicking an issue opens the repair in a modal in front.** The modal carries
  the context (quote, block, reason), the choices (matching locations, branches)
  and the action bar. The sidebar stays behind, so closing the modal never loses
  the report.
- **Confirm closes the modal.** The row leaves the sidebar, the toast carries
  Undo. No “next” inside the modal.

## Two modal shapes in the lab

1. **One issue, 520 px (recommended).** No duplicated list: the sidebar behind is
   the list. Smaller surface, less of the note covered.
2. **List + detail, 660 px.** The same functions in one surface (problems left,
   repair right). It repeats the sidebar list, so it only pays off when the
   sidebar is collapsed or the window is narrow.

## Open decisions

1. Modal shape: one issue or list + detail.
2. Sidebar groups: Anchors to fix / Unused anchors / Structure / Hidden, with
   “Anchors to fix” open by default.

## Parked

Reference chips, the lost-anchor capsule and the remaining `999px` capsules are
a separate pass. This lab stops at health.
