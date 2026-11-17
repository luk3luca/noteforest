# Health polish (S2.1) — implementation report

**Task:** `docs/tasks/health-polish.md`
**Design:** `docs/design/document-health-sidebar.md` §2–§6, lab section 3
**Worktree:** `a builder worktree`
**Date:** 15 November 2026

## Summary

Document health is now one surface with one action language.

- **Sidebar.** All four sections always render (`0` included, `Hidden` too); a search renders only the
  matching ones. Section rows are the existing 9.5 px uppercase label pattern (chevron + name +
  count). Issue rows are two lines at 40 px: the quote (12/500 `text-1`), then the state word in the
  severity colour, `·`, the block title, and the branch count with its word (`1 branch`) at the right
  when above zero. Selection is a filled row — no pill, no left accent. An open empty group says
  “No issues in this group”. The manual re-check is a 28 px icon button next to the search: it turns
  into a check for ~2 s, an `aria-live="polite"` region says “Checked”, and the bottom `Check again`
  text button and its section foot are gone.
- **Modal, 560 px.** The body is at most three blocks: context (severity word, the kind only for
  Formula/Code/Image, the quote, the block and — only when different — the chapter), the approved
  one-sentence problem line plus at most one line of guidance, and the decision (candidate rows or a
  target/chapter select, only when needed). Branches are one line each; per-branch removal stays a
  quiet text action on the row. Removed: `Stale bindings`, node paths, anchor/branch/target IDs,
  “Text anchor”, the multi-line explainers and `Keep as is` (policy entry, handler and UI).
- **Footer slots.** `Show in note` · `…` (rare and destructive) · `Close` · **primary**. The `…`
  disclosure is a small menu inside the modal (no new component, no nested overlay), keyboard
  reachable, and it closes on Esc without closing the modal. A category whose only fix is destructive
  keeps it as the primary in the danger style; `Unlinked mark` keeps a visible `Remove mark` next to
  `Close`. No action buttons in the body.
- **Confirm.** One stage with `Back` (left) + the confirm action (right), no `Show in note`/`Close`,
  Before/After plus one line (“What changes … What stays … One undo entry.”) and no IDs. The same
  stage is used by the destructive actions, with their own verb (`Delete chapter`, `Remove branch`, …)
  and their own one-liner.
- **Copy.** `Idle anchor` → **Anchor with no branches**, `Cycle` → **Loop**; the distinct verbs are
  kept; the chapter appears only when it differs from the block title.
- **Read mode.** Body visible, mutating slots (`…`, secondary, primary) disabled with one line of why;
  `Show in note` and `Close` active; a rejected command keeps the modal open with the reason inside it.

## Files changed

Renderer

- `apps/desktop/src/renderer/src/lib/document-health-actions.ts` — policy is now
  `{ primary, secondary, menu, guidance }`; `keep` removed; new presentation copy
  (`documentHealthStateText`, `documentHealthProblemLine`, `documentHealthGuidanceText`, the
  candidate/move/image/confirm lines, `documentHealthBranchCountText`).
- `apps/desktop/src/renderer/src/lib/document-health-sections.ts` — `groupDocumentHealthRows` returns
  all four groups (empty included); new `visibleDocumentHealthGroups(rows, searching)`. Row order,
  neighbour and first-repair helpers are unchanged, so tree selection is untouched.
- `apps/desktop/src/renderer/src/shell/HealthSection.tsx` — refresh button + checked feedback + live
  region, four always-rendered sections, uppercase labels, two-line 40 px rows, empty-group line.
- `apps/desktop/src/renderer/src/shell/HealthRepairDialog.tsx` — three-block body, footer slots,
  `…` menu, unified confirm stage, read-mode gating, no internal IDs.
- `apps/desktop/src/renderer/src/styles.css` — health sidebar/row/label/refresh rules, decision,
  branch row, footer menu, 560 px modal; removed the retired section/action/preview-meta rules.

Tests

- `apps/desktop/test/document-health-actions-plan.test.ts` — every category's primary, visible
  secondary and `…` composition; `keep` is gone; state renames; problem/guidance/confirm copy;
  branch-count wording.
- `apps/desktop/test/document-health-sections.test.ts` — four groups always (including an empty
  report), search filtering, stable row order and neighbours with empty groups.
- `tests/ui/document-health.test.mjs` — rewritten for the new surface: refresh + checked feedback,
  four sections with `0`, empty group, two-line row content/height/selection, the four approved
  modals, the `…` menu, guidance line, danger-only footer, no-action footer (hidden anchor), confirm
  Back/Confirm + no IDs, rejected command, read-only, Page locate, all-clear/no-document/badge/palette.
- `tests/ui/m3h3-live-health.test.mjs` — row/state/rename assertions and the keyboard path through
  the `…` menu (was a direct body button).
- `tests/ui/m3-repair.test.mjs` — `Keep as is` removed (closing is the no-op path), `attach` through
  the `…` menu, preview assertions re-pointed from the removed internal branch/target list to the
  confirm copy plus the existing structural branch assertions.
- `tests/ui/m3c3b2-image-anchors.test.mjs` — image anchors have no primary; both branch actions are
  in the `…` menu, and `Keep as is` is gone.

Docs

- `docs/reports/health-polish.md` (this report).

Artifacts (gitignored, on disk in the worktree): `artifacts/document-health/`

`sidebar-zero-sections`, `modal-ambiguous-anchor`, `modal-lost-anchor`, `modal-unlinked-mark`,
`modal-anchor-with-no-branches`, `modal-unused-anchor`, `modal-no-action`, `modal-menu`, `confirm`,
`read-only`, `all-clear`, `no-document`, `badge-nonzero`, `badge-zero` (all `-1440x900.png`).

## Checks (real timings, this machine)

| Check | Command | Result | Time |
|---|---|---|---|
| Targeted unit | `npx vitest run apps/desktop/test/document-health-*.test.ts` | 2 files / 20 tests pass | 0.06 s |
| Verify fast | `npm run verify:fast` | exit 0 | **58.2 s** wall |
| — boundaries | `node scripts/check-boundaries.mjs` | 259 files, 1248 imports, 16 rules | — |
| — typecheck | `npm run typecheck` | 4 projects clean | — |
| — unit | `npm test` | 150 files / 1489 tests pass | 6.25 s |
| — e2e | `npm run e2e` | 16/16 pass | 45.3 s |
| UI (health + anchors) | `node tests/ui/run.mjs --group anchors` (concurrency 4) | 14/14 pass | 57.2 s |
| UI (shell) | `npm run test:ui:shell` (concurrency 4) | 17/17 pass | 107.1 s |

0 pageErrors in every UI suite (each suite asserts the array is empty in `after`).

## Acceptance criteria

| Criterion | Verdict | Evidence |
|---|---|---|
| Refresh next to the search, tooltip/aria “Check again”, check for ~2 s, no bottom `Check again` | **PASS** | UI test 1: button 28 px, `aria-label`/`title`, `data-checked` true → false without fixed sleeps, live region “Checked”, `[data-health-check-again]` and `.nf-section-foot` count 0 |
| Four sections with `0`; a search hides empty ones; an open empty group says “No issues in this group” | **PASS** | Unit test (four groups always, search filtering); UI test 1 (counts `3/1/1/0`, empty-group line); `modal-no-action` screenshot shows `0` groups and the empty line |
| Section labels uppercase 9.5; two-line rows with quote, state, block; filled selection; no pill, no left accent | **PASS** | UI test 1: computed `9.5px`/`uppercase`/letter-spacing, per-line `.nf-health-row-*` assertions, 40 px height, filled selected row, `border-left: 0px` |
| Modal 560; body ≤ context + problem + decision; no stale bindings, node paths, IDs, “Text anchor”, multi-line guidance, `Keep as is` | **PASS** | UI test 2 (width 560, body substrings and UUID/ID regex, no body action buttons), unit test (`keep` absent) |
| Footer exactly `Show in note` · `…` · `Close` · primary (or Show in note + Close); no body actions; branch row has only a quiet remove | **PASS** | `footerLabels()` assertions per case (ambiguous/lost/no-branches/empty chapter/read-only), `[…, Close]` for the hidden anchor, image anchors have no primary |
| Confirm is Back + Confirm, no IDs, with the what-changes/what-stays line | **PASS** | UI test 2 and 3: footer `['Back','Confirm repair']` / `['Back','Delete anchor']`, copy assertion, UUID/ID negative matches |
| Four product-owner cases match lab section 3; the duplicated block · chapter line is gone | **PASS** | Screenshots for the four cases; dedupe asserted with a chapter renamed to the block title (`[data-health-where]` = the title once) |
| `npm run verify:fast` green; `npm run test:ui:shell` green; health suite covers the items; screenshots | **PASS** | Table above; screenshots listed above |
| No pageerror; no regression in library/outline/settings/Page | **PASS** | shell 17/17, anchors 14/14, 0 pageErrors |

## Open questions / risks

1. **Guidance-only has no reachable document state.** `Missing block`, `Missing target`, `Duplicate
   home` and `Loop` are defensive audit rows: the command layer refuses those structures and the
   loader rejects them on open (`document-health.ts` says so in the section comment). There is
   therefore no UI path to a “guidance-only” modal, so no `guidance-only` screenshot exists; the copy
   and the composition are covered by the unit plan test, and `modal-unlinked-mark` (guidance line)
   plus `modal-no-action` (footer = `Show in note` + `Close`) are the closest reachable evidence.
2. **All-clear stays one message.** A document with no issues keeps “No issues found” plus the
   counts and renders no groups, as design §2 lists `All clear` next to `No document` as a whole-surface
   state. The four-sections rule applies to the report state (any issue present). If the product owner
   wants the four `0` groups under the all-clear line too, it is a one-line change in `HealthSection`.
3. **Destructive confirm label.** The confirm stage has exactly two slots (`Back` + confirm), but a
   destructive step uses its own verb (`Delete chapter`, `Delete block`, `Remove branch`,
   `Delete anchor`, `Delete anchor and branches`, `Delete branch`), because the design's `Confirm
   repair` wording is written for the anchor preview. Say the word if every confirm should read
   `Confirm repair`.
4. **`Keep as is` runtime method.** `DocumentRuntime.keepAnchorBroken` is now unused (session-only,
   no command, no mutation). It was left in place because the brief forbids session changes; it can be
   removed in a follow-up.
5. **Two UI assertions were re-pointed, not weakened.** The old confirm stage listed anchors,
   branches and targets with their IDs; the design removes them. The same data-safety properties are
   now asserted from `structure()` (every branch ID survives the repair, both targets still exist) and
   from the confirm copy, instead of from the removed internal list.
6. **`…` menu placement.** It is a disclosure inside the modal (positioned above the trigger) rather
   than a portal overlay: the existing `ContextMenu` is a body portal and React Aria's dialog would
   treat a pointer down there as an outside interaction. No new component was needed; the menu traps
   arrows, closes on Esc/Tab/outside, and returns focus to the trigger.

## Next step

Product-owner visual pass over `artifacts/document-health/` (the four simplified modals, the confirm
and the sidebar at zero), then the orchestrator's full `npm run verify` at integration. If the
all-clear or the destructive confirm wording should match the other reading, both are single-file
changes.
