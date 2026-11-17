# Post-A–F re-check follow-ups (F1–F4)

- **Builder:** Implementer / Builder
- **Date:** 14 November 2026
- **Base:** `f053245` (`main` head with this brief; includes the re-check `a3a6aa4` and the list fixes `c26c2ad`)
- **Worktree:** `a builder worktree`
- **Branch:** `t3/post-af-recheck-followups`
- **Commit:** one commit in this worktree (SHA in the handoff; not merged or pushed)
- **Brief:** `docs/tasks/post-af-followups.md`
- **Source review:** `docs/reviews/post-af-fixes-recheck.md` (F1 S3, F2 S3, F3 S3, F4 S4)
- **Status:** implemented; targeted unit/UI/e2e green, `verify:fast` exit 0. Full `npm run verify` is the Orchestrator's integration run.

---

## Summary

| Finding | Fix | Status |
|---|---|---|
| **F1** same-parent reorder of an anchored primary | The order key is computed **inside the anchor port** (source block + anchor, excluding the moving branch, renormalized on an exhausted/invalid key space), never against the parent's direct children. A sibling move whose target sits in another port is a typed `invalid-placement` rejection in core, and the Position menu disables Move up/down with the same reason. A same-parent move that cannot change the port order is rejected instead of reporting a success with no effect. | **PASS** |
| **F2** reparent→reference duplicate order key | The converted citation is re-keyed at the end of the destination **reference** port (`appendOrderKeyAtPort`) when the old anchored primary becomes a reference. | **PASS** |
| **F3** Page Edit formula `⌘↵` | `⌘↵` in the body-mounted panel commits the formula source and forwards the overlay commit once (`PAGE_EDIT_SHORTCUT_COMMIT_EVENT` on the overlay root), so one press commits the block once (one structural undo) and closes the overlay. Escape keeps the documented source-first behavior (source closes, overlay stays). | **PASS** |
| **F4** editor-surfaces focus assertion | The gutter helper now asserts the product focus (`document.activeElement.closest('.ProseMirror')`) with a condition wait. `.focus()` survives only as the documented hidden-window fallback, and only when `document.hasFocus()` is false. The comment is corrected; the Indent assertions are unchanged. | **PASS** |
| Stale comments | `apps/desktop/src/shared/view-state.ts` no longer says Page opens Read on a layout switch; the m4b1b1 Escape comment now matches the body-mounted panel. Historical reports/task briefs were not rewritten. | **PASS** |

No schema, `settingsVersion`, Page/PDF layout, export, or showcase change. No fixed sleeps or native dialogs were added. The existing Indent/menu/palette assertions were not weakened.

### 1. F1 — port-aware same-parent reorder

**Core** (`packages/core/src/commands/block.ts`, `applyBlockMove`):

- Before the anchored same-parent fast path, a sibling move checks the target's incoming primary port. When the target and the moving branch are children of the **same parent block** but in **different ports**, the command rejects with `invalid-placement` (`Move up/down cannot cross between an anchored callout and the parent’s direct children; use Move to… to change the parent`). This covers anchored↔direct and anchor-A↔anchor-B.
- The anchored same-parent fast path now computes its key among `portBranches(document, port, 'primary')` minus the moving branch, with `orderKeyForPortIndexInList` (which renormalizes that port when the neighbour keys are invalid or exhausted). A `child` placement on the same parent keeps the “append to the anchor port” meaning; a sibling placement inserts before/after the target inside the port.
- A move whose computed key equals the current key (no possible effect) is rejected (`the block is already in that position in its anchor port`) instead of returning success with a foreign key.

**Renderer** (`apps/desktop/src/renderer/src/lib/reorder.ts`, new):

- `siblingGroupIds` is the one reorder list: parent direct children, one anchor’s children, or the chapter’s top-level blocks. It never mixes ports.
- `reorderTarget` produces the neighbour or the disabled reason (`Already the first/last block in this group.`).
- `reorderPairReason` / `canReorderSibling` explain and guard a drag pair (cross-port, different parent, different chapter, missing block).
- `DocumentRuntime.reorderSibling` and `DocumentRuntime.moveBlockBeforeOrAfter` both use it; the Position menu entries and the editor’s `canReorder` drag cue use the same helpers. There is no second ordering mechanism (the palette has no Move up/down entries).

### 2. F2 — reparent→reference order key

`detachBlock` (anchored incoming edge) now computes `appendOrderKeyAtPort(document, port, 'reference', changes)` **before** switching the role, assigns the key together with the role, and marks one branch change. The old primary key is gone from the reference port, so a pre-existing reference at the same anchor cannot collide. The snapshot inverse still restores both records in one undo.

### 3. F3 — one ⌘↵ in the Page Edit formula panel

- `page/page-edit-state.ts` owns `PAGE_EDIT_SHORTCUT_COMMIT_EVENT` (the narrow bridge from body-mounted Page Edit chrome to the overlay commit).
- `formula-node-view.ts`: while the Page Edit panel is open, `⌘↵`/`Ctrl+↵` first commits the formula source (one ProseMirror transaction in the overlay buffer) and then dispatches the event on the captured overlay root; the panel is not an ancestor of the overlay’s key handler, so nothing else commits.
- `PageBlockEditor.tsx`: a root-level listener runs the same `commit('shortcut')` as its own key handler, so the block is written once through `block.editContent` (one structural undo) and the overlay closes. Escape is untouched: the source closes first, the overlay stays, the hint stays accurate for the source-first chain.
- The Continuous inline source keeps its old behavior (`⌘↵` commits only the source, which is the block’s own editor).

### 4. F4 — test evidence

`tests/ui/editor-surfaces.test.mjs` `selectBlock` now condition-waits for the editor focus the gutter pointerdown produces. The fallback focuses the editor only when `document.hasFocus()` is false (a hidden E2E window with nowhere to put focus) and fails the test when a focused window did not get the product focus. The comment states the contract instead of the old false claim.

---

## Regression evidence (fix removed, test run, fix restored)

| Check | Result |
|---|---|
| `packages/core/test/move-anchor-role.test.ts` against the base `packages/core/src/commands/block.ts` | **4 failures**: F1 order stayed `['id4','id5']` (expected `['id5','id4']`), the cross-port case succeeded, and F2 kept `'m'` for both the new reference and the existing one (`expected 'm' not to be 'm'`, `duplicate-branch-order`) |
| Same file with the fix | 9/9 pass |
| `m4b1b1-page-edit-overlay.test.mjs --test-name-pattern "one ⌘↵ inside the Page Edit formula panel"` with `pageOverlay` wiring disabled | **fails**: the overlay stays open after one `⌘↵` (`waitOverlayClosed` timeout) |
| Same case with the fix | passes |

The same-anchor UI case was also exercised through the real menu path (`Move up` enabled, swap visible in structure, one undo).

---

## Files changed

- `packages/core/src/commands/block.ts` — port-aware same-parent reorder, cross-port rejection, reference re-key on citation conversion.
- `packages/core/test/move-anchor-role.test.ts` — F1 reorder + cross-port rejection + F2 re-key tests; two accepted fixtures extended with a second same-anchor callout so their same-parent move stays a real reorder (assertions strengthened with the port order and `validateDocument` warnings).
- `apps/desktop/src/renderer/src/lib/reorder.ts` — new pure reorder-group/target/pair rules.
- `apps/desktop/src/renderer/src/state/runtime.ts` — `reorderSibling` and `moveBlockBeforeOrAfter` use the shared rules.
- `apps/desktop/src/renderer/src/editor/DocumentEditor.tsx` — drag `canReorder` uses the shared pair rule.
- `apps/desktop/src/renderer/src/actions.ts` — Position menu Move up/down disabled with the reason.
- `apps/desktop/src/renderer/src/editor/views/formula-node-view.ts` — `⌘↵` forwarding from the Page Edit panel; header comment.
- `apps/desktop/src/renderer/src/page/page-edit-state.ts` — `PAGE_EDIT_SHORTCUT_COMMIT_EVENT`.
- `apps/desktop/src/renderer/src/page/PageBlockEditor.tsx` — overlay root listener for the forwarded chord.
- `apps/desktop/src/shared/view-state.ts` — corrected mode-parity comments (no behavior change).
- `apps/desktop/test/reorder.test.ts` — new unit suite for the renderer reorder rules.
- `tests/ui/editor-surfaces.test.mjs` — F4 focus contract, new F1 anchored-reorder case.
- `tests/ui/m4b1b1-page-edit-overlay.test.mjs` — F3 `⌘↵` case, corrected Escape comment.
- `docs/reports/post-af-followups.md` — this report.

---

## Checks run

Environment: macOS 26.5.2, Apple M5 (10 cores), Node 22.23.1, npm 10.9.8; production Electron
build; E2E hidden; 1440×900.

| Check | Result | Timing |
|---|---|---|
| `npm ci --no-audit --no-fund` (fresh worktree) | 199 packages | 2 s |
| `npm run check:boundaries` | 232 files / 1,086 imports / 16 rules | 0.4 s |
| `npm run typecheck` | clean (desktop node + web, core, layout, pdf) | wall 5.26 s |
| `npx vitest run packages/core/test/move-anchor-role.test.ts` | 9/9 | tests 99 ms |
| `npx vitest run packages/core/test` | 28 files / 380 tests | tests 1.97 s |
| `npx vitest run apps/desktop/test/reorder.test.ts` | 5/5 | tests 94 ms |
| `npx vitest run` (full unit) | 137 files / 1,360 tests | tests 8.31 s |
| `npm run build` | success (renderer/main/preload) | ~0.25 s final stage |
| `node --test tests/ui/editor-surfaces.test.mjs` | 7/7 (F1 + F4 cases included) | suite 6.28 s, command 13.2 s |
| `node --test tests/ui/m4b1b1-page-edit-overlay.test.mjs` | 10/10 (F3 case included) | suite 8.14 s, command 16.3 s |
| `node --test tests/ui/special-text.test.mjs` | 9/9 (exact block-menu entry list unaffected) | suite 11.1 s, command 19.2 s |
| `npm run e2e` (critical suite) | 16/16 | suite 34.7 s, command 43.5 s |
| `npm run verify:fast` | **exit 0** | wall 54.4 s |
| Full `npm run verify` | **not run** (the Orchestrator's integration run at UI concurrency 4) | — |

### verify:fast

`check:boundaries` + `typecheck` + `npm test` (137 files / 1,360 tests, green) + `npm run e2e`
(16/16, suite 34.98 s, node command 43.1 s). Whole command: **exit 0, wall 54.42 s**.

No fixed sleeps were added. The new UI cases use condition waits only. No native dialog is opened.

---

## Intentional contract changes (existing assertions)

1. **A same-parent anchored move that cannot change the port order is rejected** (`invalid-placement`) instead of reporting success with a foreign key. Two accepted core tests used a single-callout same-parent move as a no-op; their fixtures now add a second callout from the same anchor so the move is a real reorder. Assertions were added (`anchorPortOrder`), not removed: role/anchor/undo are still asserted, plus the exact order and no `duplicate-branch-order`.
2. **Cross-port sibling moves are rejected in core** and disabled in the menu. The renderer previously allowed a direct child to swap with an anchored callout (and silently moved it to the end of the direct list); drag/reorder now returns a reason.
3. **The Move up/down menu entries can be disabled** with a reason (they were always enabled). The entry IDs and order are unchanged, so the existing menu-list assertions still hold.

No `validateDocument` error was introduced: `duplicate-branch-order` is a warning, and both fixed paths now keep one order key per port and role.

---

## Risks / open questions

- **Product copy for the no-op rejection**: “the block is already in that position in its anchor port” is also what a “Move to…” pick of the current parent shows for a callout that is already last. It is honest but new user-visible copy; the product owner may prefer a silent no-op there.
- **Drag across ports is now a rejection** (toast) rather than a snap to the end of the direct list. This matches the design (only sibling order changes, pages derive), but it is a behavior change for a gesture.
- **`⌘S` from the body-mounted formula panel** is unchanged: it is not handled by the panel and routes through the shell’s commit path, not this event. Not exercised by a new case.
- **F4 fallback**: a hidden E2E window that reports `document.hasFocus() === false` still lets the test focus the editor, so a product-focus regression is only caught in focused runs. The editor-surfaces suite passed on this run; whether it took the fallback is not recorded, so the assertion is strict whenever the window reports focus.
- **`appendOrderKeyAtPort` renormalization**: converting a citation may re-key other reference branches at that anchor when the reference port was not sane (legacy duplicates). They are reported as affected branches and the snapshot undo restores them.
- Not verified here: the full UI suite at concurrency 4, visual/perf suites, and the product-owner visual/VoiceOver pass over the Page formula panel and the menu reasons.

---

## Next step

The Orchestrator's full `npm run verify` at UI concurrency 4, then the targeted post-fix Sentinel re-check (F1–F4). The product-owner visual/VoiceOver pass over the Page formula panel and the new disabled/reason menu rows remains open.
