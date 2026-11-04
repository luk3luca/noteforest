# M2f — Stability fixes from Sentinel review

**Status:** Approved (4 November 2026)  
**Owner:** Builder (phased, one worktree per phase)  
**Source:** `docs/reviews/m2-review.md` (verdict: Request changes)  
**Base:** main after M2e + review  
**Out of scope:** M3 anchors/reference edges, page view, PDF, external API, font/size settings UI (M6)

## Why

Sentinel found one S1 lifecycle bug and S2 gaps in undo, flush/close, corrupt-document recovery, keyboard focus, empty chapters, stale locks, and a slow e2e suite. M3 does not start until these are fixed or explicitly waived.

M2f is split into short phases so each Builder run stays reviewable and under control. Each phase has its own brief/commit/report; do not batch phases.

## Phase 1 — F1 quit + F8 test infrastructure (start here)

### F1 — S1 quit lifecycle

- Fix `apps/desktop/src/main/index.ts`: closing the last window must not leave `allowClose` permanently false; `before-quit` with no live window must allow the quit.
- Keep the native save/don't-save/cancel prompt when a live window has unsaved changes.
- Do not reset a pending close flag in a way that re-arms the bug.
- Add an e2e: close the window, then `app.quit()`, assert the process exits within a short timeout.
- Add a unit/integration test if the lifecycle can be factored without Electron.

### F8 — Test inventory, speed, and duplicate runs

Current measured baseline: unit 144 tests / 1.4 s; e2e 13 tests / 96 s (104 s wall), 44.5 s of fixed `waitForTimeout`.

Required:

1. **Split suites**
   - Move e2e #5 (300/1,000-block performance) to `tests/perf/` and a `npm run test:perf` script; not part of the critical gate.
   - Move e2e #13 (screenshot capture) and screenshot steps in #4/#8/#10 to `tests/visual/` and `npm run test:visual`; not part of the critical gate.
   - Keep the critical e2e suite focused on behavior and data safety.
2. **Reduce fixed waits**
   - Replace `page.waitForTimeout` with condition waits (arrow count, save state, rect stability, tab/editor ready).
   - Add a test-only session flush or short autosave interval under `NOTEFOREST_E2E` to remove the 5.6 s session wait.
   - Merge e2e #9 into #2 (same demo seed) and split #11 between #2 (trunk) and #7 (Backspace) if it reduces launches.
   - Target: critical e2e < 60 s, unit < 3 s.
3. **Scripts and policy**
   - `verify:fast` = typecheck + unit + critical e2e.
   - `verify` = verify:fast + build.
   - `test:perf`, `test:visual` on demand/nightly.
   - Document the run policy: Builder runs targeted tests while fixing, then `verify:fast` once at handoff; Orchestrator runs `verify` once on integration; no repeated full suite per small fix.
4. **Test inventory decisions**
   - Keep all data-safety/desync/arrow/layout/keyboard/persistence tests.
   - Merge-only candidates if useful: `apps/desktop/test/geometry.test.ts` into placement/edge-routing; `chapters.test.ts` into tree. No runtime need; do it only if it reduces file sprawl without hiding failures.
   - Do not delete storage/commands/serial-queue/edge-routing/placement/adapter/backspace/layout/pagination tests; do not move the M4 router/fixtures/Spike evidence.
   - Add the missing high-value tests that belong to this phase: close-window-then-quit, flush/close failure (if F4 is not yet in this phase, add the scaffolding and mark the test pending).
5. **Artifacts**
   - Make artifact roots configurable (`NOTEFOREST_ARTIFACTS`); replace macOS-only `sips` if practical; screenshots remain available via `test:visual`.

### Phase 1 gates

- S1 quit fixed and e2e covers close-window-then-quit.
- Critical e2e < 60 s, unit < 3 s, no behavior coverage removed.
- `npm run typecheck`, `npm test`, `npm run e2e`, `npm run verify:fast` pass.
- Report test durations and the before/after inventory.
- No M3/page/PDF/Sentinel work.

## Phase 2 — F4 flush/close contract

- Typed flush result (`ok`, `error`, `timeout`); no close/quit on timeout without a user decision.
- Preload forwards real handler rejection; `onRequestFlush` does not ignore rejected commits.
- Save failure/external modification offers reload/overwrite/save-copy/backup recovery; autosave reschedules with backoff.
- `dirty`/save-state cannot claim Saved while a commit is pending.
- Tests: read-only doc, external modification, forced flush failure, quit prompt.

## Phase 3 — F2 undo model

- One predictable undo sequence with ProseMirror fallback; no `lastStructuralAt` trap.
- Inverses or snapshot ring for block delete/subtree and branch detach.
- Preserve branch IDs and original chapter placement in move/branch-create inverses.
- Remove time-based menu dedupe for undo/redo (dedupe by delivery source, not action).
- Tests: add child → type → undo → structural undo; delete → undo; detach → undo; move child→top→child preserves branch ID; cross-chapter create undo returns to origin.

## Phase 4 — F3 / F6 / F7 data safety

- F3: list corrupt/missing/newer packages with reason; open read-only surface; backup list + restore; never overwrite.
- F6: empty-chapter invariant (reject last-block move or auto-create placeholder/delete atomically); render valid chapter; reload test.
- F7: stale lock never auto-breaks; read-only banner + explicit “Take over lock”.
- Tests at app level.

## Phase 5 — F5/F16 keyboard + cleanup

- F5: Tab exits the editor when no structural action; card `+`/collapse reachable by keyboard; fix/remove `Ctrl+Tab`; add keyboard e2e.
- F16: save-state `aria-live`; context-menu focus trap; accessible tab-close affordance; axe best-practice report (non-blocking); manual VoiceOver pass.
- F12–F15/F19: dead code, unused deps, duplicate atomic file, fixture schema, docs consistency, dependency warnings/bundle, README/plan/ADR body cleanup.

## Global constraints

- Do not start M3/page/PDF.
- Do not remove data-safety/desync/arrow/layout/keyboard tests.
- Do not use screen recording/Notability.
- One worktree per phase; no subagents; commit/report; no merge.
- Each phase: typecheck, unit, critical e2e; report durations and known gaps.
- Ponytail: not installed; use a YAGNI lens only where safe; never remove security/validation/a11y tests.
