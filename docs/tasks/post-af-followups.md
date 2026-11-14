# Post-A–F re-check follow-ups (F1–F4)

**Role:** Implementer / Builder
**Phase:** 0d (after the post-A–F re-check)
**Base:** `main` at delegation (includes the re-check report `a3a6aa4` and the list fixes `c26c2ad`)
**Source:** `docs/reviews/post-af-fixes-recheck.md` — F1, F2, F3 (S3), F4 (S4)
**Worktree:** created by the delegate; one commit; no merge or push
**Timebox:** 1 day

## F1 — same-parent reorder of an anchored primary (S3)

Real app: two anchored primaries from one anchor (orders `m`, `t`); select the second and Position →
Move up. The command reports success, writes `m` for both, and the visible order falls back to branch
ID. The order is computed against the parent's direct children, not the anchor port.

- Compute the reorder key among the **same source + same anchor port** primary branches (excluding
  the moving branch), renormalizing when the key space is exhausted. The destination is the anchor
  port, not the parent's direct children.
- A sibling move whose target is in a **different port** (anchored vs direct) must not silently
  no-op: disable the menu entry with a reason or return a clear rejection.
- Add a core test with two same-anchor primaries: Move up actually swaps their order, no
  `duplicate-branch-order`, one undo, anchor unchanged.
- The menu, palette, keyboard and drag call the same path; no second mechanism.

## F2 — reparent→reference order key (S3)

When an anchored primary is reparented, the old primary edge becomes a reference with the **old
primary order key**; the reference port can already have the same key.

- Re-key the converted edge into the destination **reference port** (`orderBetween(last, null)` or the
  existing port-aware helper); unique order per port/role.
- Add a `validateDocument(...).warnings` assertion to the anchored reparent test; no duplicate order.
- The anchor, source, target and undo snapshot stay intact.

## F3 — Page Edit formula `⌘↵` (S3)

The Page Edit formula panel hint says “Esc or ⌘⏎ commits”, but `⌘↵` commits only the formula source;
a second press closes the overlay.

- Forward `⌘↵` from the body-mounted panel to the Page Edit overlay commit so **one** press commits
  the block once (one structural undo) and closes the overlay.
- Do not let the panel’s Escape propagation also commit a second time; keep the documented Esc
  behavior for the source (source first, then overlay) unless the UI hint is changed.
- Add a UI case for `⌘↵` in the Page Edit formula panel: one press, overlay closed, one undo entry,
  canonical content committed. Keep the existing Done/Enter case.

## F4 — test focus assertion/comment (S4)

`tests/ui/editor-surfaces.test.mjs` forces `element.focus()` with a comment claiming the gutter
handler does not focus the editor; in an active window the product does focus it, so a regression
could pass.

- Assert the product focus after the gutter pointerdown (`document.activeElement.closest('.ProseMirror')`)
  with a condition wait.
- Keep `.focus()` only as a documented hidden-window fallback if the flake persists; correct the
  comment. Do not weaken the Indent assertions.

## Stale comments

Update the comments/tests that still say “Page opens Read” or “Escape closes the overlay” where the
shipped behavior is mode-preserving and the panel is body-mounted. Do not rewrite historical reports.

## Out of scope

- Shortcut/block-focus redesign (separate future design).
- Table marker/code-color work (phase 1), Markdown file view, Document health, activity bar.
- Schema, settingsVersion, Page/PDF layout, export, showcase.

## Tests and evidence

- Targeted unit: core anchored move/reparent order + validateDocument warnings; runtime/menu states.
- Targeted UI: `editor-surfaces` (F1/F4), `m4b1b1-page-edit-overlay` (F3), list-fixes unaffected.
- One `npm run verify:fast`; no full verify (Orchestrator at UI concurrency 4).
- Report `docs/reports/post-af-followups.md`: per-finding summary, files, checks with timings,
  PASS/FAIL, risks, next step. One commit; worktree/branch/head.
