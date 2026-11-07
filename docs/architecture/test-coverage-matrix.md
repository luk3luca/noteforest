# Test coverage matrix — M2/M3 behaviors

**Status:** M3i5b, 6 November 2026. Authoritative reference for test-level ownership and for
the M3i5b e2e trim. Counts and removed scenarios are recorded in
`docs/architecture/test-suite-audit.md`.

## How to read this

Every behavior has one **authoritative** level that proves it; other levels are integration
evidence and may assert a subset. Delete or weaken a test only when its behavior and its unique
app-boundary path are covered at the authoritative level and by the remaining integration tests.

| Level | Location | What it proves |
|---|---|---|
| Unit | `packages/*/test`, `apps/desktop/test` (Vitest) | Command/undo/identity invariants, pure geometry, store/save state machines, IPC contracts |
| UI | `tests/ui` (Electron + real renderer) | Operator flow, rendering, selection, health/repair dialogs, geometry in the DOM |
| E2E | `tests/e2e/m2-editor.test.mjs` (critical gate) | Lifecycle, persistence, real app boundary, save/reload/quit |
| Recovery | `tests/recovery` | Corrupt/missing/newer packages, backups, stale locks, empty chapters |
| On demand | `tests/visual`, `tests/perf`, spike scripts | Screenshots, performance, PDF pipeline; not part of `verify` |

## M2 shell and editor

| Behavior | Authoritative level | Authoritative test | Other evidence |
|---|---|---|---|
| Create, edit, branch, reparent, reorder, reopen a document | E2E | `m2-editor.test.mjs` — `creates documents, edits blocks, branches, reparents, reorders and restores` | Unit `commands.test.ts` (create/edit/move/reorder), `commands-invariants.test.ts`, `document-session.test.ts` |
| Demo tree: arrows, collapse, trunk, controls, Backspace is non-destructive | E2E | `m2-editor.test.mjs` — `keeps the demo tree arrows, collapse, controls, trunk and Backspace non-destructive` | Unit `backspace.test.ts`, `tree.test.ts`, `edge-routing.test.ts`; UI `m3-anchor-callout-stacking` |
| Keyboard reachability: editor, card controls, context menu, tabs | E2E | `m2-editor.test.mjs` — `keeps the editor, card controls, context menu, and tabs keyboard reachable` | UI `m2-shell.test.mjs` — `opens the command palette, tree, and dialogs accessibly`; axe pass |
| Rapid structural commands serialize; canvas/sidebar/arrows stay in parity | E2E | `m2-editor.test.mjs` — `serializes rapid structural creation and keeps canvas, sidebar and arrows in parity` | Unit `serial-queue.test.ts`, `adapter.test.ts`, `editor-projection.test.ts` |
| Undo/redo routes across text and structural history | E2E | `m2-editor.test.mjs` — `routes undo and redo across text and structural history without dropping presses` | Unit `history-routing.test.ts`, `undo-stack.test.ts`, `document-session.test.ts`, `text-history.test.ts`; UI `m3-anchor-callout-placement-undo` — `preserves the text undo stack when a resize flips a child below` |
| M2c keyboard, heading, chapter and landscape model | E2E | `m2-editor.test.mjs` — `applies the M2c keyboard, heading, chapter and landscape model` | Unit `chapters.test.ts`, `model.test.ts` (landscape page setup) |
| Add top-level blocks to the selected chapter; insert a chapter after the active one | E2E | `m2-editor.test.mjs` — `adds top-level blocks to the selected chapter and chapters after the active one` | Unit `chapters.test.ts` — `inserts immediately after the active chapter`; `empty-chapters.test.ts` |
| Per-tab scroll and focus restored after relaunch | UI | `m2-shell.test.mjs` — `restores per-tab scroll and focus after relaunch` | Unit `document-session.test.ts` |
| E2E window stays hidden without stealing focus | UI | `m2-shell.test.mjs` — `keeps the E2E window hidden so tests never steal focus` | E2E suite configuration (`NOTEFOREST_E2E`) |
| Zoom, Fit width, focus a branch without mutating the document | UI | `m2-view.test.mjs` — `zooms, fits width, and focuses a branch without touching the document` | Unit `placement.test.ts` — `clamps Fit width zoom and ignores invalid sizes` |
| Editor geometry follows the design-token single source | Unit | `design-tokens-css.test.ts` — `keeps the ratified shell and layout values`, `publishes the documented CSS variables from the token module`, `does not declare a CSS value that the token module owns` | UI `m2-view.test.mjs` — `keeps the editor geometry on the design-token variables` |
| Parent-relative child placement: right when it fits, below with indent otherwise | Unit | `placement.test.ts` — `starts a child group after its parent card plus the gap`, `wraps only the direct children that do not fit, in branch order`; `geometry.test.ts` — `classifies a child to the right of its parent`, `classifies a child below its parent` | UI `m3-anchor-callout-layout`, `m3-anchor-callout-stacking`; layout `layout.test.ts` |
| Arrow/trunk routing, stems, sharp right angles, overlap flags | Unit | `edge-routing.test.ts` — `keeps the shared trunk continuous from the parent port (2 children)`, `renders rounded orthogonal paths only`, `flags overlapping cards instead of hiding a layout defect` | UI callout layout/stacking files |
| Reference arrows route distinctly and do not affect layout | Unit | `reference-routing.test.ts` — `routes a right-hand reference from the source right edge to the target left edge`, `separates a two-way reference pair by lane without changing its endpoints`; `layout.test.ts` — `does not move geometry, pages, continuations, or primary edges when reference edges are added` | — |
| Outline order and collapse counts | UI | `m3-anchor-outline.test.mjs` — `shows anchored outline rows, cycles markers, and keeps callouts in the hidden count` | Unit `tree.test.ts` — `builds chapters with depth-first block order`, `marks anchored primary edges as callouts before direct edges` |

## Persistence, save state, and lifecycle

| Behavior | Authoritative level | Authoritative test | Other evidence |
|---|---|---|---|
| Editor buffer projection and canonical parity after every edit | Unit | `editor-projection.test.ts` — `builds from canonical structure, collapse, and measured placement`, `detects extra and missing block IDs against canonical` | E2E parity test; `adapter.test.ts` |
| Autosave debounce, in-flight edits, and save-state truthfulness | Unit | `save-coordinator.test.ts` — `commits on the idle debounce and autosaves once after quiet typing`, `never claims Saved for an edit that lands while the write is in flight`; `save-failure.test.ts` — `says Saved only when nothing is pending` | — |
| Save-failure backoff 2 s / 5 s / 15 s, then stop | Unit | `save-failure.test.ts` — `preserves the typed code and backs off 2 s / 5 s / 15 s, then stops`; `save-coordinator.test.ts` — `backs off 2 s, 5 s, then 15 s and stops automatic retries` | E2E permission failure test asserts the attempt counter |
| Explicit Retry keeps the reason and restarts the schedule | Unit | `save-failure.test.ts` — `an explicit Retry restarts the sequence without hiding the reason`; `save-coordinator.test.ts` — `restarts the backoff on explicit Retry while keeping the failure visible` | E2E `surfaces a permission save failure and recovers with Retry` |
| Permission save failure: banner, action set, no overwrite, retry saves | E2E | `m2-editor.test.mjs` — `surfaces a permission save failure and recovers with Retry` | Unit `save-failure.test.ts` — `offers overwrite only for external modification`, `gives every code a distinct headline and hint`; `flush.test.ts` — `blocks on a dirty read-only document and names the reason` |
| Save copy of unsaved content; original untouched; copy opens | E2E | `m2-editor.test.mjs` — `saves a copy of the unsaved content and leaves the original untouched` | Unit `save-failure.test.ts` — `accepts only paths inside the configured library`; `save-coordinator.test.ts` — `clears the failure after a successful copy and re-enables autosave`; core `copy.test.ts` |
| Reload after external modification: cancel keeps the failure, confirm replaces local text, never write | E2E | `m2-editor.test.mjs` — `reloads externally changed content only after confirmation` | Unit `save-coordinator.test.ts` — `drops failures and timers when a reload or takeover replaces the document`; core `repository.test.ts` — `detects an external modification and refuses to overwrite it` |
| Overwrite after external modification; Cancel is the default; new baseline | Unit | `save-failure.test.ts` — `overwrites through the save IPC after external modification and clears the failure`, `names the path and defaults the overwrite confirmation to Cancel`; `storage.test.ts` — `refuses to overwrite externally changed bytes unless forced` (post-overwrite next save) | On-demand visual `m2-screenshots.test.mjs` — `captures the external-modification banner and overwrite confirmation` (real banner + dialog + Cancel) |
| Close flush saves pending edits and restores after relaunch | E2E | `m2-editor.test.mjs` — `saves pending edits on close and restores them after relaunch` | Unit `flush.test.ts` — `skips a clean read-only document and still saves the session`; `lifecycle.test.ts` — `proceeds when the renderer confirmed the flush` |
| Quit flush saves pending edits and restores after relaunch | E2E | `m2-editor.test.mjs` — `saves pending edits on quit and restores them after relaunch` | Unit `lifecycle.test.ts` — `allows a quit after the close handshake completed` |
| Close flush timeout blocks the window; Retry closes it | E2E | `m2-editor.test.mjs` — `keeps the window open on a flush timeout and closes after Retry` | Unit `lifecycle.test.ts` — `blocks a live window when the flush timed out`; `flush.test.ts` — `blocks when committing an editable document throws` |
| Quit flush error blocks the app; Cancel keeps it open | E2E | `m2-editor.test.mjs` — `surfaces a flush error on quit and keeps the app open until Cancel` | Unit `lifecycle.test.ts` — `blocks a live window when the renderer reported an error`, `never turns a malformed or missing result into ok`; `flush.test.ts` — `aggregates every blocking document before failing` |
| Quit is allowed after the last window is closed | E2E | `m2-editor.test.mjs` — `quits after the last window is closed` | Unit `lifecycle.test.ts` — `allows a quit when the last window is already gone`, `allows quit with no live window even after a failed flush` |
| Failed-save close/quit is blocked by the flush state | Unit | `flush.test.ts` — `blocks when an editable document is in a failed-save state`; `lifecycle.test.ts` — `keeps guarding a live window that has not allowed the close yet` | E2E flush timeout/error tests exercise the same dialog loop |
| Native dialogs never block in E2E; guard defaults to Cancel | Unit | `dialog-guard.test.ts` — `never opens a native message box; defaults to cancel`, `honours an explicit cancelId and records a sync call`, `cancels native save/open dialogs instead of blocking` | The guard is installed for every E2E run; the recovery suite asserts `__nfDialogCalls` stays empty (`m2f-recovery.test.mjs` — `quits a read-only stale-lock document without a dialog or a package write`); remaining E2E tests override it explicitly when they need a controlled dialog |
| Corrupt/missing/newer document opens a recovery surface, not an editor | Recovery | `m2f-recovery.test.mjs` — `lists a truncated document with a reason and opens a read-only recovery surface`, `opens a newer-schema document read-only with no downgrade or overwrite controls`, `shows Remove tab and Retry for a missing session package` | Unit `recovery-library.test.ts`, `recovery-view.test.ts` |
| Backup restore creates a copy and never overwrites the damaged file | Recovery | `m2f-backup-restore.test.mjs` — `lists valid backups newest first and restores one as a new copy`; `m2f-recovery.test.mjs` — `restores the newest valid backup as a new copy and leaves the original damaged file untouched` | Unit `backup-restore.test.ts`, `storage.test.ts` |
| Stale lock: read-only, consent, explicit takeover, no silent break | Recovery | `m2f-recovery.test.mjs` — `opens a stale lock read-only, keeps it on Cancel, and takes over only on the action`, `quits a read-only stale-lock document without a dialog or a package write` | Unit `recovery-library.test.ts`, `storage.test.ts` — `requires explicit stale-lock recovery` |
| Empty chapter invariant and legacy empty-chapter recovery | Recovery + Unit | `m2f-recovery.test.mjs` — `renders a legacy empty chapter after reload and recovers it with Add top-level block`, `rejects move, branch, and delete operations that would leave a chapter empty`; `empty-chapters.test.ts` | Desktop `empty-chapters.test.ts`, `chapters.test.ts` |

## M3 anchors, repair, and references

| Behavior | Authoritative level | Authoritative test | Other evidence |
|---|---|---|---|
| Text anchor create, exact binding, undo/redo | Unit | `anchor-commands.test.ts` — `binds text, creates the record, and reports only the new anchor ID`, `undo removes binding and record exactly; redo restores the same anchor` | E2E text-anchor flow; UI `m3-anchor-callout-stacking` |
| Text anchor from a selection creates block + branch as one undo | Unit | `selection-command.test.ts` — `creates the anchor, child block and primary branch as one command`, `has one exact inverse and redo restores the same IDs` | E2E `creates a text-anchored child, undoes once, and reloads with the anchor intact`; UI `m3-anchor-callout-*` |
| Text anchor reuse instead of duplicate; toolbar path | E2E | `m2-editor.test.mjs` — `creates a text-anchored child, undoes once, and reloads with the anchor intact` | Unit `anchor-commands.test.ts` — `rejects an exact duplicate binding unless reuse is explicit`; UI callout stacking |
| Text anchor broken by deletion, live warning, repair, undo/redo | UI | `m3h3-live-health.test.mjs` — `marks a deleted text anchor broken live, repairs, and clears on undo/redo` | Unit `m3e-repair.test.ts`; `anchors.test.ts` — `reports broken when the stored quote is absent` |
| Ambiguous text candidates require context; hints rank only | Unit | `anchors.test.ts` — `resolves a unique quote fallback and marks repeated quotes ambiguous`, `uses exact prefix and suffix to resolve exactly one repeated quote` | UI `m3-repair` ambiguity listing |
| Whole-formula anchor create/reuse/undo | UI | `m3-formula-anchor.test.mjs` — `branches from a block formula, undoes once, reuses the anchor, and reloads` | Unit `anchors.test.ts` — `resolves a whole-formula node binding`; `selection-command.test.ts` |
| Formula-term anchor create, ambiguity, reload | UI | `m3-formula-term.test.mjs` — `branches from a term, undoes once, shows repeated terms ambiguous, and reloads` | Unit `anchors.test.ts` — `resolves a unique term and breaks a missing term`, `marks repeated terms ambiguous even with an occurrence hint`; `selection-command.test.ts` |
| Formula-term marker/leader geometry and fallback | UI | `m3-formula-term-geometry.test.mjs` — `puts the term marker and leader on the KaTeX term and falls back for a repeated term` | Unit `formula-term-geometry.test.ts` |
| Formula-term edit around the term re-resolves unique/ambiguous/broken and preserves identity (AC-57) | Unit | `fixtures.test.ts` — `re-resolves a term after edits around it and keeps the anchor, branch, and target` (fixture `m3-formula-term-edit.json`) | — |
| Code range anchor create, ambiguity, reload | UI | `m3-code-anchor.test.mjs` — `branches from a code range, undoes once, warns on repeated quotes, and reloads` | Unit `anchors.test.ts` — `keeps offsets as hints when the code shifts`, `marks repeated quotes ambiguous even when the offset hint points at one`; `code-anchor-geometry.test.ts` |
| Image anchors (AC-21, image rows of AC-57) | UI | `m3c3b2-image-anchors.test.mjs` — `creates regions and a point, keeps markers/callouts through resize and reload, undo/redo exactly`, `breaks image anchors on asset replacement without deleting branches, targets, or alt, and refuses a referenced asset removal`; `m3c3b3-image-integrity.test.mjs` | Unit `anchors.test.ts` — `resolves an exact image node binding and ignores display resize`, `breaks asset changes, crop changes, and missing assets without reattaching`; `asset-gc.test.ts` |
| Image insert, canonical asset record, paste/drop, placeholder | UI | `m3c3b1-image.test.mjs` — `inserts, renders, persists, and reloads an image; missing assets show a placeholder`, `imports a dropped image through the paste/drop path without a native dialog` | Unit `asset-store.test.ts`, `image-projection.test.ts`; E2E image flow |
| Image asset integrity: file missing, hash mismatch, legacy src | UI | `m3c3b3-image-integrity.test.mjs` | Unit `asset-store.test.ts` — availability; `asset-integrity.test.ts`, `asset-protocol.test.ts` |
| Multi-image blocks: block-menu and inline actions target the selected image node | UI | `m3c3b4-image-lifecycle.test.mjs` — `targets the selected image in a two-image block from the block menu and the inline image menu` | Unit `image-projection.test.ts` — `finds every image with its canonical path for per-image menus` |
| Image marker numbering is contiguous after idle anchors are hidden | UI | `m3c3b4-image-lifecycle.test.mjs` — `numbers visible image markers contiguously after an idle anchor is hidden` | `m3c3b2-image-anchors.test.mjs` marker flows |
| Cross-document image paste copies bytes/records; unknown source is a labeled placeholder with no assetId | UI | `m3c3b4-image-lifecycle.test.mjs` — `pastes images in the same document and copies asset bytes across documents without a dangling id` | Unit `image-projection.test.ts` — `marks a pasted image from another package as a pending placeholder without its assetId`, `keeps a durable cross-document placeholder label without an assetId` |
| `asset.remove` refuses live image node/anchor references; GC plan keeps backup-only references | Unit | `asset-gc.test.ts` — `refuses an asset named by an image node...`, `refuses an asset named only by an image anchor selector`, `reclaims only records with no live node or anchor and no retained backup`, `retains asset ids referenced only by a backup...` | UI `m3c3b4-image-lifecycle` and `m3c3b2` refusal paths |
| Anchor health sheet: rows, filters, navigate to block | UI | `m3-repair.test.mjs` — `lists health rows, filters by state, and navigates to the anchor block` | Unit `anchor-health.test.ts` — `shows the old and new formula term source and occurrence`, `lists idle anchors only under All...` |
| Repair ambiguous formula/code with before/after preview and one undo | UI | `m3-repair.test.mjs` — `repairs ambiguous formula and code candidates with stable IDs and one undo` | Unit `m3e-repair.test.ts` — `repairs a formula-term occurrence without changing anchor, branch, or target identity`, `repairs a code range...` |
| Broken anchor: keep, attach to block, delete one branch, never delete target | UI | `m3-repair.test.mjs` — `keeps copy/fallback states, keeps broken, attaches, and deletes one branch without deleting targets` | Unit `m3e-repair.test.ts` — `attaches a broken anchor’s branches to the block and undoes exactly`, `deletes one anchored branch, keeps the target, and undoes exactly` |
| Relink a broken text anchor from the editor selection | UI | `m3-repair.test.mjs` — `relinks a broken text anchor from the editor selection` | Unit `m3e-repair.test.ts` — `repairs a text anchor without changing anchor, branch, or target identity` |
| Idle anchor removal is explicit and undoable | UI | `m3h3-live-health.test.mjs` — `removes an idle anchor from All anchors by keyboard, with one exact undo` | Unit `idle-anchor-removal.test.ts` |
| Broken/ambiguous anchor still exports its branch exactly once | Unit | `export-plan.test.ts` — `adds broken/ambiguous markers without duplicating their target blocks`; `pagination.test.ts` — `keeps broken and ambiguous anchor branches exported once` | UI repair marker rendering |
| Reference edge create, chips, dashed edge, remove only the edge | UI | `m3-reference.test.mjs` — `links a shared block as a reference, shows chips and a dashed edge, and removes only the edge` | Unit `reference-edges.test.ts` — `creates a non-structural edge without touching chapters, blocks, or primary order`, `deleting a reference removes only the edge...` |
| Anchored reference keeps the callout and its anchor | UI | `m3-reference.test.mjs` — `links an anchor as a reference from the anchor menu and keeps the primary callout` | Unit `reference-edges.test.ts` — `anchored references keep the anchor, never create a callout...` |
| Make home / move here / demote keep IDs and undo exactly | UI | `m3-reference.test.mjs` — `makes home, moves here, and demotes with stable IDs, exact undo, and updated chips` | Unit `role-transitions.test.ts` |
| Delete disclosure lists external references before confirm | UI | `m3-reference.test.mjs` — `lists external references in the delete confirmation and mutates only on confirm` | Unit `delete-references.test.ts` — `lists only external references to the deleted block in promote mode` |
| Keyboard leaf delete discloses external references; fast path stays | UI | `m3h5-leaf-delete.test.mjs` — `discloses external references before a keyboard leaf delete, cancels cleanly, and undoes exactly`, `keeps the fast path for a leaf without external references` | Unit `delete-references.test.ts` — `requires confirmation for a leaf with an external reference` |
| Split/merge an anchored block; anchors migrate and undo exactly | UI | `m3f1-split-merge.test.mjs` — `splits and merges an anchored block from the menu, moves the callout, and undoes` | Unit `split-merge.test.ts`; `fixtures.test.ts` — `plans split and merge anchors from the split/merge fixture` |
| Anchored callout lane and stacking geometry | UI | `m3-anchor-callout-layout.test.mjs` — `keeps direct children right while every below-stack arrow enters from the left at 1440`, `caps a far-right anchor at the safe zone without overflow`; `m3-anchor-callout-stacking.test.mjs` — `paints a new anchor child above an existing direct child and re-aligns after reopen` | Unit `geometry.test.ts`, `placement.test.ts`; layout `layout.test.ts` — `aligns anchored callouts to the anchor left edge and below the anchor` |
| Selected callout highlights only its trunk; markers removed on delete | UI | `m3-anchor-callout-stacking.test.mjs` — `lights only the trunk for the selected child group`, `removes every marker when an anchored target is deleted, and undo restores it exactly` | Unit `edge-routing.test.ts`, `tree.test.ts` |

## Layout, pagination, PDF, and performance (M2 foundation, M4 target)

| Behavior | Authoritative level | Authoritative test | Other evidence |
|---|---|---|---|
| 300-block adaptive layout with no overlaps | Unit | `layout.test.ts` — `lays out 300 blocks without overlaps and deterministically` | On-demand perf `m2-performance.test.mjs` |
| Anchored callouts below the anchor; reference edges do not move geometry | Unit | `layout.test.ts` — `aligns anchored callouts to the anchor left edge and below the anchor`, `does not move geometry, pages, continuations, or primary edges when reference edges are added` | UI callout layout |
| A4 landscape/portrait content geometry | Unit | `layout.test.ts` — `uses A4 portrait and landscape content geometry`; `model.test.ts` — `creates a valid A4 landscape document with one chapter and revision 0` | UI `m2-editor` landscape case |
| Paginator: 50+ pages, atomic segments, safe breaks, defects | Unit | `pagination.test.ts` — `produces at least 50 A4 pages for F2 and keeps every segment atomic`, `splits F1 at code lines and honors the manual break before B4`, `reports the F6 too-tall row as a blocking defect without splitting it` | Spike gate scripts (on demand) |
| PDF print pipeline (real text, page count parity) | On demand | `scripts/run-gates.mjs` / `scripts/verify-pdf.mjs` (Spike 1, historical); M4 acceptance | — |
| 300-block editor performance / 1,000-block collapse report | On demand | `m2-performance.test.mjs` — `measures the 300-block editor and the 1,000-block collapse report` | — |
| Screenshot evidence for visual rules that cannot be asserted semantically | On demand | `m2-screenshots.test.mjs` — `captures the shell and tree screenshots`, `captures the save-failure recovery surface`, `captures the external-modification banner and overwrite confirmation`, `captures the corrupt-package recovery surface` | Product-owner visual/VoiceOver gate |

## E2E trim record (M3i5b)

Removed from `tests/e2e/m2-editor.test.mjs` after the matrix above proved the same user-visible
behavior and app-boundary path elsewhere. No product code, UI, schema, command, or save path
changed.

| Removed E2E test | Same behavior covered by | App-boundary evidence that remains |
|---|---|---|
| `reloads from disk only after confirmation and discards local changes` (permission reload) | `reloads externally changed content only after confirmation` (reload confirmation, Cancel guard, local text discarded, disk not written); `save-failure.test.ts` for the permission code and failure state | The remaining reload test drives the real banner, dialog, IPC, and file read after an external modification, and now also asserts the Cancel branch (local text and banner stay, external file untouched) before confirming. |
| `overwrites an external modification only after a Cancel-default confirmation` | `save-failure.test.ts` — `overwrites through the save IPC after external modification and clears the failure`, `names the path and defaults the overwrite confirmation to Cancel`; `storage.test.ts` — `refuses to overwrite externally changed bytes unless forced` (next save after overwrite) | On-demand visual `m2-screenshots.test.mjs` — `captures the external-modification banner and overwrite confirmation` (real banner, dialog, Cancel). |
| `saves a copy after external modification without touching the external file` | `saves a copy of the unsaved content and leaves the original untouched` (same save-copy action, dialog, tab activation, identity checks); `save-failure.test.ts` — `offers overwrite only for external modification` | The remaining save-copy test runs the real save dialog IPC and checks the original bytes; the failure code only selects the banner that triggers the same action. |
| `dismisses a failed-save quit through the E2E dialog guard` | `dialog-guard.test.ts` — `never opens a native message box; defaults to cancel`, `honours an explicit cancelId and records a sync call`; `surfaces a flush error on quit and keeps the app open until Cancel` for the quit-blocked behavior | The guard is installed for every E2E run and is asserted by the unit suite; the explicit quit dialog path stays in `surfaces a flush error on quit...`. |
| `blocks closing on a failed save and keeps the content until Retry succeeds` | `surfaces a permission save failure and recovers with Retry` (banner, retry, content saved); `keeps the window open on a flush timeout and closes after Retry` (close blocked, Retry closes); `saves pending edits on close and restores them after relaunch` (content after relaunch); `flush.test.ts` — `blocks when an editable document is in a failed-save state` | The two remaining close-path E2E tests cover the real dialog loop and relaunch persistence; the failed-save state at close is the unit-tested flush decision, and the banner/retry app path stays in the permission test. |

**Candidates evaluated and deliberately kept**

- `saves pending edits on close...` and `saves pending edits on quit...` — close and quit are
  distinct lifecycle entries (`close` event vs `before-quit`). The matrix does not prove them
  redundant; both stay.
- `keeps the window open on a flush timeout...` and `surfaces a flush error on quit...` — the
  two flush-failure E2E tests cover different flush results (`timeout` vs `error`), different
  lifecycle entries (`close` vs `quit`), and different user responses (Retry closes vs Cancel
  keeps the app). Unit `lifecycle.test.ts` covers both decisions, but neither E2E owns a
  duplicate app path, so both stay.
- `creates a text-anchored child, undoes once, and reloads with the anchor intact` — the only
  app-level text-anchor create/reuse/undo/reload path; stays.

## Known gaps (tracked, not hidden by this matrix)

- **Image anchors and image rows of AC-57** are covered by `m3c3b2`/`m3c3b3`/`m3c3b4`;
  crop editing and region re-pick repair remain follow-ups (M4+), not a test gap.
- **Automatic asset GC scheduling** is not implemented: the reference guard, deterministic
  `planAssetGc`, and backup-retention scan are unit-tested, but when a GC pass runs (after backup
  and grace period) is a product decision. `asset.remove` is never called automatically.
- **S3-5** relink selection flow is not guided by the modal sheet; the command path is covered
  but the UX-flow polish is open.
- **S3-6** replay-failure fallback is unit-only risk; no current UI text command reaches it.
- **S3-8** keyboard delete of a leaf with external references is covered by `m3h5-leaf-delete`;
  the product decision on the disclosure is recorded in the M3h review.
- **Axe serious/critical assertions on M3 surfaces** (callout lanes, markers, health sheet) are
  not in the current UI suite; only the M2 shell axe pass exists.
- **Perf and visual suites** are on demand and are not part of `verify`; they are evidence, not
  a gate.
- **Overwrite confirmation:** after the M3i5b trim, the critical e2e no longer clicks the
  overwrite dialog. Its app-level evidence is the on-demand visual suite
  (`captures the external-modification banner and overwrite confirmation`); unit tests cover the
  overwrite IPC, the default-Cancel copy, and the post-overwrite save baseline. If the visual
  suite is retired, restore one critical overwrite path.
