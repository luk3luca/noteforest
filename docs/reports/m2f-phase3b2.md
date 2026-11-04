# M2f phase 3b2 — Move/branch-create identity and chapter preservation

**Status:** Complete (4 November 2026)  
**Owner:** Builder  
**Source:** `docs/tasks/m2f-phase3b2-move-identity.md`; `docs/reviews/m2-review.md` F2; `docs/tasks/m2f-stability-fixes.md` phase 3  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-5ade1bbb`  
**Branch:** `t3/m2f-3b2-move-undo-identity`  
**Base:** `8aa9904` (`main`: docs: start M2f phase 3b2 move identity)  
**Commits:** `8872133` (core + unit tests), `21b4c21` (desktop hooks + E2E), `de20c90` (snapshot hardening), plus this report

## What changed

`block.move` and `branch.create` no longer hand-write an inverse that a second
command invocation cannot reproduce. Both now get a targeted
`structure.restore` snapshot from the command layer:

- **`block.move`** (child→top, top→child, top→top, sibling moves): undo restores
  the incoming branch record verbatim — ID, source, target, role, order key,
  label and unknown fields — plus the exact chapter top-level lists. Redo is a
  diff of the undone state against the moved state, so it removes/creates the
  same branch ID and order key again.
- **`branch.create`** (including cross-chapter B→A): undo removes the created
  branch and restores the target's **original chapter and slot**, not the
  source chapter. Redo restores the same branch record and removes the target
  from that chapter again.
- **`block.delete` / `branch.delete`**: unchanged 3b1 semantics. Their snapshots
  keep the deterministic `redoCommand`, so redo re-applies the exact
  delete/detach.
- **Runtime**: no change. The phase 3a router still pushes `result.inverse` on
  the structural stack and uses `result.inverse` of the undo for redo. There is
  no second user-visible stack.

The snapshot never rewrites surviving block content. Text written between a
move and its undo survives, and block IDs/timestamps/unknown fields are
untouched.

## Inverse design

### `structure.restore` as a two-way structural delta

The 3b1 command was extended with optional removal lists and an optional
`redoCommand`:

```ts
interface StructureRestoreCommand {
  type: 'structure.restore';
  blocks: ContentBlock[];        // full records to restore
  branches: Branch[];            // full records to restore or overwrite by ID
  anchors: Anchor[];             // full records to restore
  chapters: Array<{ chapterId: string; topLevelBlockIds: string[] }>;
  removeBlocks?: string[];       // records present now but not in the target
  removeBranches?: string[];
  removeAnchors?: string[];
  manualBreakBeforeBlockIds?: string[];
  redoCommand?: DocumentCommand; // delete/detach only
}
```

`captureStructuralDelta(current, target)` computes exactly what must change to
turn `current` into `target`:

| Record | Captured when |
| --- | --- |
| Block | in `target` but missing from `current` → restore; in `current` but missing from `target` → remove |
| Branch | missing or any field differs → restore the full target record; missing from `target` → remove |
| Anchor | missing or changed → restore; missing from target → remove |
| Chapter | top-level list differs → write the exact target list |
| Manual breaks | list differs → write the exact target list |

Blocks that exist on both sides are never captured, which is what preserves
text typed in a surviving block. Branch records are compared with a
key-sorted canonical JSON so property order cannot produce false differences.

`executeCommand` now builds the inverse for `block.delete`, `branch.delete`,
`block.move`, `branch.create` and diffed restores from the post-state and
pre-state. Delete/detach attach `redoCommand = original command`; move and
branch-create snapshots omit it, so their inverse is itself a diff snapshot.
This makes undo/redo infinitely reversible without static recursion.

`restoreRecords` applies removals before restorations (a redo may reuse an ID
freed by the same snapshot), validates that removed blocks have all their
branches/anchors listed for removal, rejects restore/remove ID overlap, checks
branch endpoints after blocks are restored, and rejects duplicate records
instead of silently overwriting them. The only allowed overwrite is the same
branch record being repointed back (matching target and role); this covers both
`block.delete promote` and `block.move`.

### Scenario table

| Command | Undo snapshot | Redo snapshot |
| --- | --- | --- |
| Child → top level | Restore incoming branch (all fields) and exact chapter lists; no removals | Remove that branch; write the moved chapter lists |
| Top level → child, chapter B → A | Remove the new branch; restore chapter B's exact list | Restore the new branch record; write chapter B's moved list |
| Sibling move | Restore the moved branch's original order key | Restore the moved record |
| `branch.create` from B under a block in A | Remove the created branch; restore B's exact list | Restore the same branch record; write B's list without the target |
| `block.delete` / `branch.delete` | 3b1 exact record restore (unchanged) | Original delete/detach command (unchanged) |

## Before / after

| Area | Before 3b2 | After 3b2 |
| --- | --- | --- |
| Move child→top undo | New branch with a fresh ID; order key recomputed | Same branch ID/source/target/role/order/label/extensions; original chapter/slot |
| Move top→child undo | Slot restored, but redo created another new branch ID | Undo returns to B at the original slot; redo recreates the same branch ID and order |
| Sibling move undo | Relative order restored; literal order key recomputed | Exact original order key restored |
| Cross-chapter `branch.create` undo | Target promoted into the **source** chapter; target chapter left empty | Target returns to its original chapter and slot |
| Branch label / extensions / unknown fields | Lost when the branch was recreated | Restored verbatim from the snapshot |
| Redo after undo | Not exact (fresh IDs/order) | Exact structural state; repeated cycles neither duplicate nor lose records |
| Text in surviving blocks | Preserved by 3b1 targeted restore | Still preserved; snapshot names only structural records |
| Runtime stacks / routing | Phase 3a stack | Unchanged; new inverse is a normal command |
| Delete/detach | 3b1 exact restore + static redo | Unchanged |

## Tests added

### Core (`packages/core/test/move-undo.test.ts`, 9 tests)

- Child→top-level move: undo restores the same branch record and exact chapter
  slot; redo removes it; three undo/redo cycles are stable.
- Repeated child→top-level moves and undos keep the original branch ID.
- Top-level→child across chapters at slot 1: undo returns the block to chapter B
  at slot 1 and removes the new branch; redo recreates the same branch ID/order.
- Sibling move: the exact order key is restored and redo reproduces the moved
  order.
- Cross-chapter `branch.create`: undo returns the target to chapter B at its
  original slot; redo reattaches with the same branch ID and order; cycles.
- Explicit `branchId` on `branch.create` survives undo and redo.
- Text written after a move survives the undo; anchors, reference branches,
  labels and unknown fields are preserved.
- Text written in the attached target survives a cross-chapter attach undo.
- Undo of a redo of a move neither duplicates nor loses records.

The existing 10 destructive delete/detach tests remain unchanged and pass.

### E2E (`tests/e2e/m2-editor.test.mjs`, extended undo-routing flow)

One app launch now also covers:

- outdent child→top through the real context menu: incoming branch removed,
  arrows 3→2, then undo restores the **same** branch record/chapter/order and
  arrows 2→3; redo removes it again; sidebar/canvas/canonical parity;
- cross-chapter top-level→child through the real "Move to…" dialog: undo puts
  the block back in chapter 2 at slot 0 and removes the new branch; redo
  recreates the same branch ID and order;
- cross-chapter `branch.create`: undo returns the target to chapter 2 at slot 0
  (not the source chapter); redo reattaches with the same branch ID;
- two rapid outdents, two rapid undos, two rapid redos and two rapid undos: one
  step per press, identical canonical records at each endpoint;
- exact canonical-record comparisons (blocks, branches, chapters, anchors,
  manual breaks) at every undo/redo endpoint, not just counts.

`branch.create` has no UI in M2, so the test hook exposes
`__noteforestTest.applyStructural(command)` and applies the typed command
through the same runtime/IPC path. A second hook, `structure()`, returns the
active document's canonical structural records so exact comparisons do not wait
for the 800 ms autosave. Both are test-only hooks in the existing
`window.__noteforestTest` surface; no production behavior was added.

No data-safety test was removed, and no fixed sleep was added. The new flow uses
condition waits (`waitEdges`, `waitCanonicalBlockCount`, `waitEditorText`,
`waitSaved`, `waitHistoryState`, `waitForFunction`).

## Gate table

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | Pass — desktop node/web, core, layout, pdf |
| Unit | `npm test` | Pass — 213 tests / 22 files, 1.63 s |
| Core unit only | `npx vitest run packages/core` | Pass — 105 tests / 7 files |
| Critical e2e | `npm run e2e` | Pass — 26 tests, 55.29 s suite (< 60 s), 63.3 s wall incl. build; final confirmation 55.59 s |
| Undo-routing E2E | node test filtered | Pass — 6.86–7.13 s (was 4.83 s before 3b2; +~2.0–2.3 s for the new flows) |
| Fast verification | `npm run verify:fast` | Pass — exit 0, ~64 s wall |
| Data safety | — | No storage/command/serial-queue/desync/arrow/layout/keyboard test removed |
| Native dialogs | — | No native dialog added; E2E uses the existing guard and renderer dialogs only |
| Manual/screen recording | — | None; no screen recording or Notability |

The suite has about 4.3 s of headroom under the 60 s critical budget. The next
flow that does not belong to data safety should be split into a separate suite
rather than extending `m2-editor.test.mjs`.

## Files changed

- `packages/core/src/commands.ts` — two-way `structure.restore` snapshot,
  `captureStructuralDelta`, removal/validation rules, move and branch-create
  inverses.
- `packages/core/test/move-undo.test.ts` (new) — 9 exactness/safety tests.
- `apps/desktop/src/renderer/src/App.tsx` — test-only `applyStructural` and
  `structure` hooks.
- `apps/desktop/src/renderer/src/global.d.ts` — hook types.
- `tests/e2e/m2-editor.test.mjs` — move/branch-create undo/redo coverage,
  helpers and rapid sequence.
- `docs/reports/m2f-phase3b2.md` (this report).

## Known gaps

- **`branch.create` is API-only in M2.** The E2E exercises it through the real
  runtime and IPC command layer via a test hook, not a user affordance. The
  external API in a later milestone is the intended caller.
- **Chapter deletion is still not structurally undoable.** The snapshot cannot
  add or remove chapter records; `chapter.delete` keeps its existing behavior.
  That is outside phase 3b2.
- **A diffed snapshot returns no redo if the chapter set changed** between the
  command and a stale inverse (chapter counts differ). The runtime stack is LIFO
  and clears on reload, so this is not reachable through the UI; the restore
  itself still applies and only the redo entry is unavailable.
- **Stale snapshot application is not rejected** if unrelated later changes left
  the named IDs free. As in 3b1, snapshots are session-only and the runtime
  stack is LIFO; applying an old snapshot out of order would restore old
  structural records. There is no persisted command log yet.
- **Text typed before a structural undo/redo is cleared** when the editor is
  rebuilt (phase 3a behavior, unchanged).
- **Focus after undo** still uses the phase 3a nearest-surviving-block fallback,
  not necessarily the restored block.
- The snapshot payload is proportional to changed records only, not the whole
  document, but a very large subtree delete still carries one record per
  removed/changed entity. Commands are not persisted.
- **CLI/harness unaffected**; no persistence format change.
- F3 corrupt/read-only packages, F4, F5/F6/F7 keyboard/empty-chapter/stale-lock
  work, M3, page view and PDF are untouched.

## Commands run

Environment: macOS, Node 22.23.1, npm 10.9.8, worktree above, dependencies
installed from the lockfile with `npm ci`.

| Command | Result | Duration |
| --- | --- | --- |
| `npm ci` | clean install from lockfile | not timed |
| `npm run typecheck` | clean | ~5 s |
| `npm test` | 213/213 | 1.63 s tests |
| `npm run e2e` | 26/26 | 55.29 s suite / 63.3 s wall (final confirmation 55.59 s) |
| `npm run verify:fast` | pass, exit 0 | 1:03.7 wall |

Baseline before this change on the same machine: critical suite 53.30 s and
undo-routing test 4.83 s. Final: 55.29–55.59 s and 6.86–7.13 s.

Not run: `npm run test:perf`, `npm run test:visual`, packaged/release build,
Windows/Linux, real 1,000-block typing benchmark, VoiceOver. No screen
recording.

## Next step

F3/F6/F7 data safety (corrupt/read-only packages, empty chapters, stale locks)
and F5/F16 keyboard/focus cleanup before M3. Do not start M3 anchors/reference
edges until this phase and the remaining F2 items are accepted.
