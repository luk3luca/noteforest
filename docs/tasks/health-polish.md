# Health polish — one surface, one action language

**Role:** Builder
**Milestone:** S2.1 (post-S2 product-owner review)
**Base:** HEAD of `main` (the docs commit that adds this brief)
**Worktree:** provided by the orchestrator harness; work only there
**Timebox:** 4 hours

## Context

S2 shipped the health sidebar and the repair modal, and the product-owner review found the surface
noisy and inconsistent: sections with zero issues disappear, the refresh reads as a field, rows do
not distinguish the issue from the canvas block, and the modal is documentation with the same
command in different places. The approved simplification is in
`docs/design/document-health-sidebar.md` §2–§6 and in the lab section 3
(`docs/design/document-health-ui-lab/`).

## Goal

Health becomes one surface with one action language: four sections always visible, rows that say
what is wrong and where, and a 560 px modal with three blocks at most and every action in a fixed
footer slot.

## In scope

### A · Sidebar

1. **Refresh next to the search** (chosen placement A): a 28 px icon button in the same row as the
   search field, with `aria-label`/tooltip “Check again”. On click the icon becomes a check for about
   two seconds and an `aria-live="polite"` region says “Checked”; then it returns. Remove the bottom
   `Check again` text button and its section foot.
2. **All four sections always render**, `0` included (including `Hidden` with `0`). During a search,
   only matching sections render. `Anchors to fix` is open by default.
3. **Section label**: 9.5 px, uppercase, 0.09em, `text-3` (the existing sidebar label pattern),
   chevron + name + count. Use it instead of the current 11.5 px sentence-case row.
4. **Row, two lines, 40 px**: line 1 the quote (12/500 `text-1`); line 2 the state word in the
   severity colour, `·`, the block title (`text-3`), branch count with its word at the right when
   above zero. Selection stays a filled row. No pill, no left accent stripe.
5. **Empty group** expanded: “No issues in this group”.
6. Missing block stays in `Anchors to fix`.

### B · Repair modal

7. Width **560** (`nf-dialog-modal-repair`).
8. **Body, three blocks maximum**:
   - context: severity icon + word; the kind only for Formula/Code/Image; the quote; the block title;
     the chapter only when different from the block (fix the duplicated “block · chapter” line);
   - problem: one sentence, using the approved lines in the design §5;
   - decision: candidate rows or a target select, only when needed; branches are one line when they
     exist.
9. **Remove from the modal**: `Stale bindings`, node paths, anchor/branch/target IDs, `Text anchor`,
   multi-line guidance, `Keep as is` (and its action handler/policy entry).
10. **Footer slots**: `Show in note` (left) · `…` (rare and destructive) · `Close` · **primary**
    (right). Fallbacks (`Link to current selection` when a candidate exists, `Keep branches, remove
    anchor…`) and destructive actions (`Delete anchor and branches…`, `Delete block…`, `Delete
    chapter…`) move into the `…` menu. No action buttons in the body.
11. The primary is the recommended action for the state: candidate selected or candidates available
    → `Preview repair`; no candidate → `Link to current selection`. Categories whose only fix is
    destructive keep it as the footer action with the danger style.
12. **Branch removal** stays a quiet text action on each branch row (lists can hold several), not a
    bordered button, not a menu item.
13. **Confirm step**: `Back` (left) + `Confirm repair` (right); no `Show in note`/`Close` in this
    step. Body: Before/After + one line “what changes / what stays”; no IDs.
14. **Read mode**: body visible, mutating actions disabled with one line of why; `Show in note` and
    `Close` active. A rejected command keeps the modal open with the reason inside it.

### C · Copy

15. Problem lines and one-line guidance exactly as in the design §5.
16. `Idle anchor` → **Anchor with no branches**; `Cycle` → **Loop**. Keep the distinct verbs
    `Remove mark`, `Remove anchor`, `Delete unused anchor`, `Delete anchor and branches…`.
17. The “where” line shows the chapter only when it differs from the block title; never duplicate the
    same title twice.

### D · Tests and evidence

18. Unit: `document-health-actions-plan.test.ts` (remove `keep`; assert every category's primary and
    menu composition), `document-health-sections.test.ts` (four groups always, empty groups, search
    filtering).
19. UI (`tests/ui/document-health.test.mjs`): refresh button + checked feedback; four sections with
    0; two-line row content; the four real cases (unlinked, lost, ambiguous, no-branches) with the
    simplified body and footer; guidance-only and danger-only; confirm Back/Confirm and no IDs;
    read-only; no-document; badge.
20. Screenshots under `artifacts/document-health/`: sidebar with zero sections, simplified modal for
    the four cases, confirm, guidance-only.

## Out of scope

- Audit categories, commands, session or schema changes.
- The app-wide dialog sweep (the other dialogs) and the list + detail modal.
- Reference chips, the lost-anchor capsule, the remaining `999px` capsules.
- The Page fit-sync race (`PageView.tsx:480`).
- Spec/UX/ADR/plan changes.

## Files

Read:
- `docs/design/document-health-sidebar.md` (§2–§6 are authoritative).
- `apps/desktop/src/renderer/src/shell/HealthSection.tsx`
- `apps/desktop/src/renderer/src/shell/HealthRepairDialog.tsx`
- `apps/desktop/src/renderer/src/lib/document-health-sections.ts`
- `apps/desktop/src/renderer/src/lib/document-health-actions.ts`
- `apps/desktop/src/renderer/src/lib/document-health.ts` (labels, reasons — do not change the audit)
- `apps/desktop/src/renderer/src/styles.css` (health sidebar + dialog blocks)
- `apps/desktop/test/document-health-sections.test.ts`,
  `apps/desktop/test/document-health-actions-plan.test.ts`
- `tests/ui/document-health.test.mjs`

Expected to touch: the five renderer files above, the two unit tests, the UI suite, `styles.css`,
`docs/reports/health-polish.md`.

## Acceptance criteria

- [ ] Refresh sits next to the search, has the tooltip/aria label, shows the check state for ~2 s,
      and no bottom `Check again` remains.
- [ ] Four sections render with `0`; a search hides empty ones; an open empty group shows
      “No issues in this group”.
- [ ] Section labels are uppercase 9.5; rows are two lines with quote, state and block; selection is
      a filled row; no pill and no left accent.
- [ ] The modal is 560; body has at most context + problem + decision; no stale bindings, node paths,
      IDs, “Text anchor”, multi-line guidance or `Keep as is`.
- [ ] Footer is exactly `Show in note` · `…` · `Close` · primary (or Show in note + Close for
      guidance-only); no body action buttons; the branch row has only a quiet remove.
- [ ] Confirm is Back + Confirm, no IDs, with the “what changes / what stays” line.
- [ ] The four product-owner cases match the approved lab section 3; the duplicated block · chapter
      line is gone.
- [ ] Tests: `npm run verify:fast` green; `npm run test:ui:shell` green; the health UI suite covers
      the items above; screenshots produced.
- [ ] No pageerror; no regression in library/outline/settings/Page.

## Tests and evidence

- Targeted: `npx vitest run apps/desktop/test/document-health-*.test.ts`,
  `npm run build && npm run test:ui:shell`.
- End of task: `npm run verify:fast`.
- Screenshots as in D20.
- No native dialogs in tests; no fixed sleeps; do not weaken assertions.

## Stop and ask

- if removing `keep` from the policy breaks a command or an existing test beyond the expected rename;
- if always rendering the four sections breaks the tree selection/neighbour logic;
- if the meta dedupe needs an audit change (it must not);
- if the footer menu cannot hold the destructive actions without a new menu component;
- on any spec/UX/ADR change.

## Report format

Summary, files changed, checks with timings, acceptance criteria pass/fail, open questions/risks,
next step. Write `docs/reports/health-polish.md`, commit once in the worktree, do not merge, and
report the worktree path and the commit hash.
