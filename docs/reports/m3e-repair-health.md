# M3e — Broken/ambiguous anchors, health sheet, repair

**Role:** Builder  
**Milestone:** M3e  
**Status:** Implemented, targeted checks and the one full fast gate passed  
**Base:** current `main` (M3d2 merged)  
**Worktree:** see the Builder handoff (branch `t3/m3e-anchor-repair-health`)

## Summary

M3e adds the repair surface for broken and ambiguous anchors:

- a status-bar health chip with broken/ambiguous counts and a keyboard-reachable health sheet;
- filters for all / broken / ambiguous, with block, chapter, quote, context, state, reason, and
  branch count;
- navigation from a health row to the source block with the anchor and branch selected;
- the same sheet focused on one anchor when the block warning marker is clicked;
- candidate selection for ambiguous text/formula-term/code anchors;
- relink from the current editor selection for broken text/formula/code anchors;
- attach branches to the block, delete one branch, delete the anchor with an explicit branch
  policy, or keep it broken for the session;
- consistent Lost anchor / Ambiguous anchor copy and the existing whole-block fallback.

No core command shape changed: `anchor.repair`, `anchor.attachToBlock`, `anchor.delete`, and
`branch.delete` already preserve identity and generate one inverse. The new renderer paths only add
guards, selection mapping, and UI.

## Files changed

- `apps/desktop/src/renderer/src/lib/anchor-health.ts` (new) — pure health rows, filters, candidate
  view data, candidate → `anchor.repair` command conversion.
- `apps/desktop/src/renderer/src/state/runtime.ts` — repair, relink-from-selection, attach, delete
  anchor, delete one branch, and session-only keep-broken.
- `apps/desktop/src/renderer/src/state/shell.ts` — `anchor-health` dialog state.
- `apps/desktop/src/renderer/src/shell/StatusBar.tsx` — health chip.
- `apps/desktop/src/renderer/src/shell/Dialogs.tsx` — health sheet, filters, detail, candidates,
  confirmations.
- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx` — warning marker becomes a button
  that opens the focused health sheet; Lost anchor / Ambiguous copy and reason.
- `apps/desktop/src/renderer/src/styles.css` — health chip/sheet/rows/candidates.
- `packages/core/test/m3e-repair.test.ts` (new) — repair identity for text/formula-term/code,
  attach, delete branch, keep broken, undo/redo.
- `tests/ui/m3-repair.test.mjs` (new) — health list/filter/navigate, candidate repair, attach,
  delete branch, keep broken, copy/fallback, selection relink, screenshot.
- `package.json` — added the new UI suite to `test:ui` and `verify`.
- `docs/reports/m3e-repair-health.md` — this report.

## Health and repair flows

### Health chip and sheet

- The chip is hidden when the document has no broken or ambiguous anchors.
- It shows `N anchors need repair` and exposes `data-health-broken` / `data-health-ambiguous`.
- Opening is always explicit; no modal appears on load.
- Rows show state (Lost anchor / Ambiguous anchor), kind, quote, stored context, block title,
  chapter, reason, and branch count.
- Filters are `All`, `Broken`, and `Ambiguous`.
- A row click closes the sheet, focuses the source block, expands ancestors, and selects the anchor
  branch so the callout/target highlight is visible.
- A warning marker opens the same sheet directly on that anchor’s detail.
- The sheet uses React Aria’s dialog focus trap and native buttons for keyboard use.

### Repair actions

- **Candidate choice (ambiguous):** text, formula-term, and code candidates show ordered matches
  with context (formula occurrence, code line range, text position). Choosing one runs
  `anchor.repair` with the same anchor ID; branch IDs, labels, and targets are unchanged. One undo
  restores the previous selector.
- **Relink (broken text/formula/code):** “Relink to current selection” maps the editor’s current
  text/formula/code selection back through the existing anchor-selection bridge. Text selectors are
  derived from committed canonical content, then one `anchor.repair` keeps the anchor and branch.
- **Attach:** `anchor.attachToBlock` removes the anchor/binding and keeps every branch as a
  block-sourced branch. A confirmation lists the branch count; one undo restores anchored sources.
- **Delete one branch:** `branch.delete` with `targetHandling: promote` for a primary branch. The
  target and its subtree are never deleted; a primary target becomes a top-level block. Reference
  deletion leaves the primary home untouched. Confirmed and undoable.
- **Delete anchor:** explicit confirmation with the core choice: attach branches to the block or
  delete the branches and promote primary targets. Targets are never deleted.
- **Keep broken:** session-only dismissal; it runs no command, mutates nothing, and leaves the
  warning, health row, branch, and target intact.

### Copy and fallback

- Block warnings say **Lost anchor** for broken/block-missing and **Ambiguous anchor** for
  ambiguous, with a reason-specific tooltip and a direct health-sheet action.
- Callout badges keep the established **Lost anchor** / **Ambiguous** labels.
- The whole-block fallback is unchanged: broken/ambiguous callouts remain attached to the block,
  the target is visible, and no content is rewritten.

## Identity and undo evidence

`packages/core/test/m3e-repair.test.ts` adds six core cases:

- text `anchor.repair`: anchor ID, block ID, branch record, target content preserved; undo/redo
  exact.
- formula-term `anchor.repair`: occurrence 1 → occurrence 2; anchor/branch/target preserved;
  selector `latexStart` and `occurrenceHint` updated; undo/redo exact.
- code-range `anchor.repair`: quote/offsets updated; anchor/branch/target preserved; undo/redo
  exact.
- `anchor.attachToBlock` on a broken anchor: anchor gone, same branch ID now block-sourced, target
  byte-identical; inverse restores the broken anchor exactly.
- `branch.delete`: target block preserved, anchor stays idle, inverse restores the branch and the
  resolved state.
- keep broken: resolving does not mutate the document; undoing the text edit restores resolution.

The UI suite also asserts across a real app/save path that candidate repair and button actions keep
the same anchor/branch IDs and target blocks, and that `Meta+z` restores the prior selector, anchor,
or branch in one step.

## Tests and evidence

All commands run in the M3e worktree:

- `npm run typecheck` — pass (desktop node/web, core, layout, pdf).
- `npx vitest run packages/core/test/m3e-repair.test.ts` — 6/6 pass.
- `node --test tests/ui/m3-repair.test.mjs` — 4/4 pass (about 12.2 s total).
- `npm run test:ui` — all 10 UI files pass, including the new M3e file.
- `npm run verify:fast` — pass:
  - unit: 39 files, 451 tests, 2.00 s (was 445; +6 M3e core tests);
  - critical e2e: 21/21 pass, 53.2 s total (critical count unchanged).

UI cases:

1. health rows, counts, filters, screenshot, row navigation to the selected anchor branch.
2. ambiguous formula-term and code candidate choice with stable IDs and one undo each.
3. Lost anchor / Ambiguous copy, callout badges, target fallback, keep broken, attach, delete one
   branch, and undo without target deletion.
4. broken text relink from a real editor selection.

Screenshot: `artifacts/m3e/anchor-health-1440x900.png` (1440×900), health sheet with filters and five
broken/ambiguous rows behind the live document.

No new critical e2e was added; the critical suite stays at 21 tests.

## Risks and open questions

- **Repeated formula terms and code quotes stay ambiguous after choosing a candidate.** This is the
  existing exact-unique resolver contract: choosing a candidate updates the stored selector,
  occurrence/context, and offsets while preserving identity, but the resolver deliberately does not
  auto-resolve a repeated term/quote. The sheet states this explicitly. If product wants a
  confirmed occurrence to become “resolved”, that needs a selector/resolution decision, not an M3e
  implementation shortcut.
- **Idle anchor cleanup is not in this sheet.** The brief scopes health to broken/ambiguous and
  lists filters as all/broken/ambiguous. The design’s optional “All anchors includes idle + Remove
  anchor” surface remains a follow-up.
- **Image anchors remain out of scope** (M3c3b is blocked on the image pipeline). The generic health
  row/candidate code is kind-aware but image selection/repair is not exercised.
- Candidate repair keeps one undo entry through the existing structural stack; there is no new
  grouped command.
- The health sheet is a dialog, not a persistent inspector, consistent with ADR-0004/OD-10.

## Next step

**M3f** — identity sequences, split/merge with anchor migration, paste/duplicate handling, fixture
matrix, `buildExportPlan` exactly-once manifest, and the 1,000-anchor resolution performance check.
