# Document health v1 — implementation report

**Task:** `docs/tasks/document-health.md`
**Design:** `docs/design/anchor-health.md` (product name **Document health**, approved 14 November 2026)
**Role:** Implementer / Builder
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-3686c1b9-57fac57485bbbfea`
**Branch:** `t3/document-health-v1`
**Base:** `9ba0ac1` (`main` head at delegation; the brief and design are in this base)
**Head:** the single commit on this branch; its SHA is reported in the handoff message (a report
cannot contain the hash of the commit that introduces it)
**Verdict:** **PASS** for the v1 acceptance criteria, with the interpretation and risks below.

---

## 1. Summary

### Audit

- New pure module `apps/desktop/src/renderer/src/lib/document-health.ts`:
  `auditDocumentHealth(document, { assetAvailability?, collapsedBlockIds? })`.
- It reuses the core anchor resolver (`resolveDocumentAnchors`) and the core content reader
  (`buildBlockAnchorIndex`) instead of duplicating either. The resolver supplies state, reason, and
  candidates; the content reader supplies every anchor ID actually bound in content.
- Categories v1: anchors **broken, ambiguous, missing block (missing target), idle, orphan
  reference, orphan record, hidden (collapsed)**; structure **branch target missing, unreachable
  block, duplicate primary home, primary cycle, empty chapter**.
- Severity: **S1** missing block, branch target missing, unreachable block, duplicate primary home,
  primary cycle, orphan reference; **S2** broken, ambiguous, orphan record; **S3** idle, empty
  chapter, hidden. Rows sort S1 → S2 → S3.
- Counts and filters: **All / Needs repair / Broken / Ambiguous / Idle / Orphans / Structure /
  Hidden**; search matches block, chapter, quote/term, kind, reason, and IDs; the filter count source
  is the same report.
- Reachability is a closure from chapter roots over **primary and reference** edges. A reference
  target stays reachable without a primary home; a reference edge is never a second primary home.
- Collapsed hidden rows are view state: they exist only when `collapsedBlockIds` is passed and only
  for an otherwise healthy anchor with a live branch and a collapsed ancestor.
- **Classification rule for the broken-anchor contract (D5):** an unreferenced record **with a live
  branch** is **broken** (repair), not an orphan; the m3h3 flow that deletes the anchored word keeps
  its repair row. Only a branchless record with no content binding is an **orphan record** (cleanup).
  This keeps the existing "delete the anchored word → Repair, never idle Remove" behavior.
- Pure: no command is applied; a deep-equal before/after test proves the audit is read-only.

### Sheet

- The M3e sheet is now **Document health** (`shell/DocumentHealthDialog.tsx`), still opened through
  `dialog.kind: 'anchor-health'` for compatibility. The existing M3e detail (candidates, before/after
  preview, branch list, attach/delete/keep, Markdown/Read gating) is preserved.
- Header: counts with `data-health-count-*`, **Check again** (re-runs the synchronous audit), search,
  and the eight filter chips with counts.
- Rows: severity (S1/S2/S3 with a text label), state, kind, block + chapter, quote/context, branch
  count, reason. Informational rows are quieter. Row click = **Locate**.
- Locate: expands collapsed ancestors, focuses/selects the block and, when it has a branch, the
  anchor term. In **Page** it uses the mounted page model to set the containing page and selects the
  fragment; a block with no derived page (defensive unreachable state) falls back to Continuous. Empty
  chapters scroll to the chapter section.
- Actions v1 (every one is a typed command with undo; a rejected command keeps the sheet open and
  shows the core reason):
  - broken/ambiguous: Repair (candidate choice), Relink to current selection (Rerun), Attach branches
    to block, Delete branch, Keep;
  - idle: **Branch from anchor…** (reference edge to an existing block, one `branch.create`) and
    Remove anchor (one undo; no branch policy needed);
  - orphan reference: **Strip ID** (`block.editContent` with the ID removed) and **Recreate anchor
    from selection…** (`anchor.create` with the orphan ID; the core rejects a selection that would
    leave a second disconnected binding);
  - orphan record: **Delete record** (`anchor.delete` via the guarded idle-removal path);
  - missing target (branch): **Remove branch…** (confirmed; `branch.delete`);
  - orphan block: **Move to chapter…** (`block.move`) and **Delete block…** (confirmed;
    `block.delete` with `delete-subtree`);
  - empty chapter: **Add block** (`block.create`) and **Delete chapter…** (confirmed;
    `chapter.delete` with `reject-if-not-empty`);
  - duplicate primary home / cycle: reason plus the explicit "no automatic/bulk fix" note; no
    destructive action.
- Read mode may open, search, filter, review, and Locate; every mutating action is disabled with the
  shared reason.
- **No-document state:** the palette entry is no longer document-gated; without a document the sheet
  shows "Open a document to check its anchors and structure.".
- Palette: **Check document health…** (same command id `anchor-health`).
- Status bar: the existing warning chip still counts broken/ambiguous; a new muted indicator shows
  **idle / orphans / structure** (e.g. `1 idle · 1 orphan · 1 structure`), opens the sheet filtered on
  the first non-zero group, and never includes hidden rows.

### Things deliberately absent (v1 boundary)

- **Relink…** for a missing branch target and general **move block** are v2 per the brief's
  out-of-scope list and the design's v2 slice; the v1 missing-target row removes the dangling branch
  and the unreachable-block row moves inside the v1-specific action (`block.move`) / deletes.
- Drift, duplicate anchors, asset/cell checks, reference-edge audit, library-wide scan, activity-bar
  Health view, vault/find bar, manual breaks, and any schema/settingsVersion/Page/PDF/export/showcase
  change are untouched.
- Several structure states (missing branch target, unreachable block, duplicate primary home, cycle)
  are refused by the document validator on open. The audit still names them defensively (pure tests
  construct them); their action buttons run the typed command and surface the core rejection reason
  instead of rewriting invalid data or pretending the document opened. Relinking a missing target is
  intentionally not offered (v2; there is also no relink command in core).

---

## 2. Files

**Added**

- `apps/desktop/src/renderer/src/lib/document-health.ts` — pure audit, filters, counts, search.
- `apps/desktop/src/renderer/src/shell/DocumentHealthDialog.tsx` — sheet, no-document state, actions.
- `apps/desktop/src/renderer/src/shell/DialogFrame.tsx` — the shared modal frame (moved out of
  `Dialogs.tsx` so the health sheet and all existing dialogs use one frame).
- `apps/desktop/test/document-health.test.ts` — 10 pure tests (all categories, counts, sorting,
  hidden/collapse, broken-vs-orphan, reference reachability, image asset availability, filters/search,
  read-only/deterministic, 300/1,000-block timing).
- `apps/desktop/test/document-health-actions.test.ts` — 2 runtime tests (strip guard + exact undo;
  empty-chapter guard + undo).
- `tests/ui/document-health.test.mjs` — 4 UI flows (mixed sheet/filters/search/Locate/empty state, idle
  branch/remove with undo, orphan strip/recreate + empty chapter add/delete with undo, Page Locate +
  Read gating + no-document state).

**Changed**

- `apps/desktop/src/renderer/src/lib/anchor-health.ts` — exported the shared anchor row helpers
  (`anchorHealthBranches`, `anchorHealthBranchViews`, `anchorHealthBlockTitle`,
  `anchorHealthChapterTitle`, `anchorHealthContextFields`); existing behavior unchanged.
- `apps/desktop/src/renderer/src/shell/Dialogs.tsx` — removed the in-file `Frame` and the old
  `AnchorHealthDialog`; renders `DocumentHealthDialog` / `DocumentHealthEmptyDialog`.
- `apps/desktop/src/renderer/src/shell/StatusBar.tsx` — one audit feeds the warning chip and the new
  muted info indicator.
- `apps/desktop/src/renderer/src/actions.ts` — palette entry renamed to "Check document health…" and
  no longer document-gated.
- `apps/desktop/src/renderer/src/state/shell.ts` — `anchor-health` dialog accepts an optional
  `DocumentHealthFilter`.
- `apps/desktop/src/renderer/src/state/runtime.ts` — `stripOrphanAnchor`, `recreateOrphanAnchor`,
  `deleteHealthBranch`, `deleteEmptyChapter` (each one typed command / undo entry; no new core
  command, no validation bypass).
- `apps/desktop/src/renderer/src/styles.css` — health toolbar/severity/info-row/state styles and the
  muted status indicator.
- `tests/ui/m3h3-live-health.test.mjs` — palette search updated to the new user-visible label.
- `tests/ui/suites.mjs` — new suite registered in `FILES` and the `anchors` group.

No schema, settings, Page/PDF, export, or showcase file changed.

---

## 3. Checks run

| Check | Command | Result | Timing |
|---|---|---|---|
| Boundaries | `npm run check:boundaries` | PASS, 253 files / 1,222 imports / 16 rules | < 1 s |
| Typecheck | `npm run typecheck` (all workspaces) | PASS | ~8 s |
| Unit | `npm test` | **PASS 147 files / 1,457 tests** | 5.96 s tests |
| Full fast gate | `npm run verify:fast` | **PASS** (boundaries, typecheck, unit, critical e2e) | 58.0 s wall; critical e2e 16 tests, 45.1 s suite |
| UI — anchors group (incl. new suite) | `node tests/ui/run.mjs --group anchors --concurrency 2` | **PASS 14/14** | 97.4 s |
| UI — new suite alone | `node --test tests/ui/document-health.test.mjs` | **PASS 4/4** | 14.1 s (first cold run 92.9 s incl. Electron download) |
| UI — shell regression | `node --test tests/ui/v0-shell-frame.test.mjs tests/ui/ui-overlay-command-gate.test.mjs` | **PASS 15/15** | 19.8 s |
| UI — read/status/shell regression | `node --test tests/ui/m4b1a2-read-mode-gating.test.mjs tests/ui/ui-document-status.test.mjs tests/ui/m2-shell.test.mjs` | **PASS 11/11** | 17.4 s |
| Audit timing | unit test, synthetic documents | 300 blocks **0.6 ms**, 1,000 blocks **2.9 ms** (synchronous, one worker) | recorded in test output |

Targeted UI ran at concurrency 2 (≤ 3). No full `verify` was run; the Orchestrator runs it at 4.
No fixed sleeps, no native dialogs, no weakened assertions.

Acceptance checklist:

- [x] v1 categories reported with counts/severity, resolver reused (not duplicated).
- [x] Filters/Locate/actions work; every action is typed + undoable; no auto-fix.
- [x] Status-bar indicator and palette entry; Read mode cannot mutate.
- [x] v1 scope only; v2/v3 absent (relink/move/search v2, library scan v3).
- [x] No schema/settingsVersion/Page/PDF/export/showcase change; existing assertions preserved
      (m3e/m3h3/m3h5 suites green; only the palette label assertion was updated to the new copy).

---

## 4. Evidence

Screenshots (all 1440 × 900, CSS pixels, hidden-window harness):

- `artifacts/document-health/sheet-mixed-1440x900.png` — mixed states: orphan reference (S1), broken,
  ambiguous, idle, empty chapter; counts, search, filters.
- `artifacts/document-health/locate-broken-1440x900.png` — Locate from the sheet: block and anchor
  term selected in Continuous.
- `artifacts/document-health/structure-row-1440x900.png` — empty-chapter structural row with
  Add block / Delete chapter.
- `artifacts/document-health/status-bar-idle-1440x900.png` — muted `1 idle` status indicator.
- `artifacts/document-health/idle-detail-1440x900.png` — idle detail with Branch from anchor target
  chooser and Remove anchor.
- `artifacts/document-health/page-locate-1440x900.png` — Page Locate: jumped to page 2 and selected
  Block 16.
- `artifacts/document-health/read-mode-1440x900.png` — Read mode with disabled mutation actions and
  the read-only note.
- `artifacts/document-health/no-document-1440x900.png` — Document health no-document state.

Timing method: the pure audit test calls `performance.now()` around `auditDocumentHealth` for a
synthetic 300/1,000-block document with one idle anchor every tenth block; numbers are a single
warm run on the dev machine, not a p95 benchmark.

---

## 5. Risks and open questions

1. **Defensive structure rows can never open in the current product path.** The validator refuses a
   missing branch target, an unreachable block, duplicate primary homes, and cycles, and the loader
   refuses such a package. The pure audit and UI rows are therefore defense-in-depth; their typed
   actions will be rejected by the command layer and the sheet shows the reason. This is intentional
   ("rejected action keeps the sheet open with the reason") but means no end-to-end repair is possible
   for those states without a future recovery/import path.
2. **Relink… is absent.** The brief's action list names it for a missing target, while its own
   out-of-scope list puts relink in v2 and core has no branch relink command. v1 removes the dangling
   branch instead; the row explains that relinking is planned for v2. If the product owner wants it
   in v1, a `branch.relink` command plus a validation policy for damaged input is a separate task.
3. **Empty chapters are usually repaired before the sheet exists.** `ensureChaptersHaveBlocks` fills
   legacy empty chapters on open, so the empty-chapter row appears only for chapters created after
   open (or when that repair did not run). That is the existing product behavior; the row's actions
   are still covered.
4. **Page Locate is page-level, not term-level.** The Page layout renders static fragments; Locate
   jumps to the containing page and selects the block, but cannot highlight an anchor term inside the
   static page. Continuous Locate selects block + anchor term.
5. **Status-bar emphasis.** Orphan references are S1 in the sheet but appear in the muted
   idle/orphan/structure indicator, per the brief's "muted indicator" wording and the existing
   "broken/ambiguous only" warning chip. If S1 orphans should join the alarm chip, that is a small
   product decision for the Orchestrator.
6. **Resolved-but-unmarked live records are not flagged.** A record with a live branch whose selector
   still resolves by quote (no content mark) is a weak/resolved anchor, not an orphan record and not
   broken; drift is v2. This preserves the existing M3e contract.
7. `data-health-anchor` includes hidden rows (they are real anchor rows); the anchor count in existing
   tests stays 5 because those fixtures have no collapsed ancestors.

## 6. Next step

Run the targeted Sentinel review against the brief and the design, then the Orchestrator's full
`verify` at UI concurrency 4. The product-owner visual/VoiceOver pass should include: mixed sheet,
Page Locate, Read mode, and the two status indicators.
