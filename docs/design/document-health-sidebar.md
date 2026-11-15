# Document health — sidebar report and repair modal (S2)

**Status:** design for S2, after the S1 activity bar. No code.
**Date:** 15 November 2026.
**Supersedes:** the modal sheet surface in `docs/design/anchor-health.md`; the audit, commands and
copy rules there still hold.
**Lab:** `docs/design/document-health-ui-lab/` (single modal chosen, list + detail parked).

## 1. Model

- The activity bar's **Health** section is the report: grouped, expandable sections, one row per
  issue. There is no separate “health page”.
- Clicking an issue opens a **520 px repair modal in front**. The sidebar stays behind, so closing
  the modal never loses the report — this replaces the v1 sheet's “repair replaces the report”.
- **Confirm closes the modal.** The command runs, the row disappears from the list, the toast
  carries Undo. There is no “next”: the sidebar is the queue.
- **Show in note** closes the modal and reveals the block/term (expand ancestors; in Page, go to
  the page). It never changes the layout.
- The palette entry and the status-bar indicator stay; the palette opens the Health section.

## 2. Sidebar

Header: `Health`, summary `3 to fix · 7 issues`, then a search field. Footer: `Check again`.

Sections group by task, not by the audit's category names (proposed, awaiting confirmation):

| Section | Rows (audit category) | Default |
|---|---|---|
| Anchors to fix | broken, ambiguous, unlinked mark | open |
| Unused anchors | idle, unused anchor | closed |
| Structure | missing target, unreachable block, two primary parents, loop, empty chapter | closed |
| Hidden | marker hidden by a collapsed ancestor | closed |

- A section with zero rows is not rendered.
- The count is the number of rows; the summary is the needs-repair total.
- Row: the quote (truncated) plus the branch count when above zero. No per-row action, no severity
  pill: the section carries the meaning and the modal carries the severity word.
- Open sections persist per session. The selected row survives closing the modal.
- Search filters rows across sections and auto-expands the matching sections.
- No document: “Open a document to check its anchors.” All clear: “No issues found” plus the
  information counts. Read mode: the list is visible, rows open the modal read-only.

Interaction: the list is a `tree` with sections as expandable nodes and rows as leaves (same model
as the Outline): Up/Down move, Left/Right collapse/expand, Enter opens the modal; focus returns to
the row when the modal closes.

## 3. Modal (520 px)

- Header: `Document health` kicker + the issue category, close.
- Body: severity icon + word (Data risk / Needs repair / Information), kind (Text/Formula/Code/
  Image anchor), the quote, `block · chapter`, the reason.
- Matching locations (when the anchor resolves): candidate rows, one selected.
- Branches: role + target, with the per-branch delete where v1 allows it.
- Footer: `Show in note` (quiet) · `Close` · the primary action.
- Confirm state: Before/After, “one undo entry”, `Back` + `Confirm repair`. `Back` returns to the
  issue; `Esc` follows the same stack (confirm → issue → close); focus returns to the row.
- Read mode: the body is visible, mutating actions are disabled with one line of why; `Show in
  note` and `Close` stay active.
- A rejected command keeps the modal open and shows the reason inside it.

## 4. Actions by category (v1 coverage, no losses)

| Category | Primary | Secondary | Danger |
|---|---|---|---|
| Broken | choose a matching location; link to current selection | keep branches, remove anchor…; keep as is | delete anchor and branches… |
| Ambiguous | choose the right match | keep branches, remove anchor…; keep as is | delete anchor and branches… |
| Unlinked mark | recreate link from selection | remove mark | — |
| Anchors with no branches | add a branch… | remove anchor | — |
| Unused anchor | — | — | delete unused anchor |
| Missing target | — | show in note | remove branch… |
| Unreachable block | move to chapter… | show in note | delete block… |
| Two primary parents, loop | — | show in note | no auto-fix: guidance only |
| Empty chapter | add block | show in note | delete chapter… |
| Missing block | — | show in note | no in-place repair: guidance only |
| Hidden marker | show in note | — | — |

Image anchors keep the v1 note: re-picking a region is a follow-up; the branches, target and alt
text are kept.

## 5. Copy

- Severity: `Data risk`, `Needs repair`, `Information` (codes stay internal).
- `Strip ID` → `Remove mark`; `Attach branches to block…` → `Keep branches, remove anchor…`;
  `Recreate anchor from selection…` → `Recreate link from selection`; `Relink to current
  selection` → `Link to current selection`; `Repair` → `Preview repair` / `Confirm repair`;
  `Orphan reference` → `Unlinked mark`; `Orphan record` → `Unused anchor`; `Expand & locate` →
  `Show in note`.

## 6. Geometry and tokens

Sidebar 264 default / 180 minimum. Section row 30, error row 27, control 28, modal 520. Radius 4
on rows and controls, 8 on the modal. No pills, no left accent stripes: state is an icon plus a
word, selection is a filled row.

## 7. Retired in S2

The `DocumentHealthDialog` wide sheet (filters row, per-row Repair/Review buttons, detail replacing
the report). The audit (`lib/document-health.ts`), the repair commands and the anchor-health helpers
stay as they are.

## 8. Parked

- List + detail modal at 660: revisit only if repairing from the sidebar proves cramped.
- Reference chips, the lost-anchor capsule and the remaining `999px` capsules.
- Audit v2 categories (drift, duplicates, assets/cells, reference audit, library scan).

## 9. Open

- Confirm the four section names and the default open state.
