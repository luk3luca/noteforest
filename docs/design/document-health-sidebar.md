# Document health — sidebar report and repair modal

**Status:** S2 merged at `f84a7fd`; S2.1 polish merged at `5c4eb2c`. Product-owner visual pass pending.
**Supersedes:** the modal sheet surface in `docs/design/anchor-health.md`; the audit and commands
there still hold.
**Lab:** `docs/design/document-health-ui-lab/` — section 3 is the approved simplified modal.

## 1. Model

- The activity bar's **Health** section is the report: grouped, expandable sections, one row per
  issue. There is no separate “health page”.
- Clicking an issue opens a **560 px repair modal in front**. The sidebar stays behind, so closing
  the modal never loses the report.
- **Confirm closes the modal.** The command runs, the row disappears, the toast carries Undo. No
  “next”: the sidebar is the queue.
- **Show in note** closes the modal and reveals the block/term (expand ancestors; in Page, go to the
  page). It never changes the layout.
- The palette entry, the status-bar chip and the block lost-anchor chip open the Health section;
  anchor-known entries select the row and open its modal.

## 2. Sidebar

Header: `Health`, summary `N to fix · M issues`. Then a row with the search field and the refresh
button (28 px, next to the field, not in the footer).

- **Refresh**: icon button, `aria-label`/tooltip “Check again”; on click the icon becomes a check for
  about two seconds and an `aria-live="polite"` message says “Checked”. The audit also re-runs on
  document changes; this is the manual re-check.
- **Sections**: all four are always visible, including `0`. During a search, only matching sections
  render. `Anchors to fix` is open by default.
- **Section label**: 9.5 px, uppercase, letter-spacing 0.09em, `text-3` (the existing sidebar label
  pattern), chevron, name, count.
- **Row**: two lines, 40 px. Line 1: the quote, 12/500, `text-1`. Line 2: the state word in the
  severity colour, `·`, the block title, `text-3`; branch count with its word at the right when
  above zero. Selection is a filled row; no pill, no left accent stripe.
- Empty group, when expanded: “No issues in this group”.
- Search filters rows across sections and auto-expands matching sections.
- Open sections and the selected row persist per session; only `sidebarTab` is written to the
  session file.
- No document: “Open a document to check its anchors.” All clear: “No issues found” plus the
  information counts **and the four sections with `0`** (the checklist is always visible). Read
  mode: rows open the modal read-only.
- Interaction: a `tree` (sections are expandable level-1 nodes, rows are level-2 leaves):
  Up/Down move, Left/Right collapse/expand, Enter opens the modal; focus returns to the row when the
  modal closes.

## 3. Modal (560 px)

Header: `Document health` kicker + the issue category + close X.

Body, **three blocks maximum**:

1. **Context**: severity icon + word (`Data risk` / `Needs repair` / `Information`); the kind only
   for Formula/Code/Image; the quote; the block title (the chapter only when different).
2. **Problem**: one sentence.
3. **Decision**: candidate rows or a target select, only when the issue needs one. Branches are one
   line (`1 branch · Target`) when they exist; the per-branch removal is a quiet text action on the
   row, because a list can hold several.

Never in the modal: `Stale bindings`, node paths, anchor/branch/target IDs, “Text anchor”, guidance
longer than one sentence.

Footer, fixed slots: `Show in note` (left) · `…` (rare and destructive) · `Close` · **primary**
(right). The primary is the recommended action for the current state (candidate selected → `Preview
repair`; no candidate → `Link to current selection`). Fallbacks and destructive actions live in the
`…` menu. `Keep as is` is removed: closing changes nothing.

Confirm state: `Back` (left) + `Confirm repair` (right); no `Show in note`/`Close` in this step.
Body: Before/After + one line “what changes / what stays”. No IDs.

Read mode: the body is visible, mutating actions are disabled with one line of why; `Show in note`
and `Close` stay active. A rejected command keeps the modal open and shows the reason inside it.

## 4. Plans by category

| Issue | Body | Footer |
|---|---|---|
| Lost anchor, with candidates | 2 candidate rows | Show in note · … · Close · Preview repair |
| Lost anchor, no candidates | problem + branch line | Show in note · … · Close · Link to current selection |
| Ambiguous anchor | 2 occurrence rows | Show in note · … · Close · Preview repair |
| Unlinked mark | problem | Show in note · Remove mark · Close · Recreate link from selection |
| Anchor with no branches | problem + target select | Show in note · … (Remove anchor) · Close · Add a branch… |
| Unused anchor | problem | Show in note · Close · Delete unused anchor (danger) |
| Missing target | problem + one guidance line | Show in note · Close · Remove branch… (danger) |
| Unreachable block | problem + chapter select | Show in note · … (Delete block…) · Close · Move to chapter… |
| Empty chapter | problem | Show in note · … (Delete chapter…) · Close · Add block |
| Missing block, Duplicate home, Loop | problem + one guidance line | Show in note · Close |
| Hidden anchor | problem | Show in note · Close |

Image anchors (Lost/Ambiguous): no primary; `…` holds Keep branches remove anchor…, Delete anchor and
branches…; the body adds one line that re-picking a region is a follow-up.

## 5. Copy

Problem lines (one sentence, used instead of the audit's technical reason):

| Category | Line |
|---|---|
| Lost anchor | This text is no longer in the block. |
| Ambiguous anchor | This text appears twice. |
| Unlinked mark | The highlight has no anchor behind it. |
| Missing block | The block that held this anchor was deleted. |
| Anchor with no branches | Nothing branches from this anchor. |
| Unused anchor | This anchor is not attached to any text. |
| Missing target | The branch points to a block that no longer exists. |
| Unreachable block | No chapter or branch reaches this block. |
| Duplicate home | Two primary branches point here; a block can have only one home. |
| Loop | Primary branches form a loop. |
| Empty chapter | This chapter has no blocks. |
| Hidden anchor | Its marker is hidden because a parent block is closed. |

Guidance (one line, only where the fix is outside the modal):

- Unlinked mark: “Recreate the link from a selection, or remove the mark.”
- Missing block: “No in-place repair: the block is gone. Remove the branch that points here.”
- Missing target: “Remove the branch, or restore a backup.”
- Duplicate home / Loop: “Fix the primary edges with the branch commands, or restore a backup.”
- Image anchor: “Re-picking an image region is coming later.”

Labels: `Idle anchor` → **Anchor with no branches**; `Cycle` → **Loop**. Keep `Remove mark`,
`Remove anchor`, `Delete unused anchor`, `Delete anchor and branches…` — different commands, same
placement and style. Chapter shown only when different from the block.

## 6. Geometry and tokens

Sidebar 264 default / 180 minimum. Section row 30, issue row 40 (two lines), control 28, modal 560.
Radius 4 on rows and controls, 8 on the modal. No pills, no left accent stripes.

## 7. Retired

The v1 wide sheet; `Stale bindings`; internal IDs and node paths in the modal; `Keep as is`; the
bottom `Check again` text button.

## 8. Parked

- List + detail modal at 660.
- Reference chips, the lost-anchor capsule and the remaining `999px` capsules.
- Audit v2 categories.
- The app-wide dialog sweep (`docs/design/dialogs.md`), separate from health.

## 9. Decisions (15 November 2026)

1. Refresh sits next to the search; the footer `Check again` is removed.
2. The four sections are always visible, `0` included.
3. Section = uppercase label; row = two lines with quote, state and block.
4. Modal body: three blocks maximum, no internal data.
5. Actions only in the footer; `…` for rare/destructive; one primary.
6. `Keep as is` removed.
7. Branch removal stays a quiet row action.
8. Confirm: `Back` + `Confirm repair` only.
9. `Anchor with no branches` and `Loop` replace `Idle anchor` and `Cycle`.
10. Missing block stays in `Anchors to fix`.
