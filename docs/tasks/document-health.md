# Phase 3 — Document health v1

**Role:** Implementer / Builder
**Phase:** 4 (post-A–F; after the vault library)
**Base:** `main` at delegation
**Worktree:** created by the delegate; one commit; no merge or push
**Design:** `docs/design/anchor-health.md` (product name **Document health**, approved 14 November 2026)
**Timebox:** 2 days

## Scope

Extend the existing anchor-health sheet into **Document health**: a read-only audit of anchors and
structure, with repair actions through the typed command layer. It is not a second source of truth;
it reuses the anchor resolver and the branch graph.

### Audit model

- Pure function over the open document plus optional asset availability and collapsed view state.
- Categories v1:
  - anchors: broken, ambiguous, missing target, idle, orphan reference, orphan record;
  - structure: orphan block (unreachable from a chapter), branch target missing, duplicate primary
    home, cycle, empty chapter;
  - hidden — collapsed (information).
- Severity: S1 data-loss risk first, S2 needs repair, S3 information (idle/hidden).
- Counts and filters: All / Needs repair / Broken / Ambiguous / Idle / Orphans / Structure / Hidden.
- Reuse `resolveDocumentAnchors`; do not duplicate resolver logic. Reachability is a closure from
  chapter top-level ids and branch targets.
- Audit on open; **Check again** manual; no scan per keystroke; 300/1,000 blocks within budget.
- Read-only until an action; no auto-fix.

### UI

- Extend the existing sheet (`Dialogs.tsx` anchor-health surface), not a new permanent panel.
- Header: counts + Check again; filter chips with counts; search by block/chapter/quote/kind.
- Rows: severity, state, kind, block + chapter, quote/term, branch count, reason; informational rows
  are quieter. Click = **Locate** (expand ancestors, select block/term, scroll; Page jumps to the
  containing page).
- Actions v1:
  - broken: Repair (candidates), Attach to block, Delete branch, Keep;
  - ambiguous: choose candidate, Rerun from selection;
  - missing target: Relink…, Remove branch;
  - idle: Branch from anchor…, Remove anchor (confirm when branches exist);
  - orphan reference: Strip id, Recreate anchor from selection;
  - orphan record: Delete record;
  - orphan block: Move to chapter…, Delete block… (confirmed);
  - empty chapter: Add block, Delete chapter… (confirmed);
  - duplicate primary / cycle: show the reason and the safe action supported by core; no destructive
    bulk fix.
- Every action is a typed command with undo; a rejected action leaves the sheet open with the reason.
- Status bar: keep the existing needs-repair chip for broken/ambiguous; add a muted
  idle/orphan/structure indicator, clickable to the sheet filtered.
- Palette: “Check document health…”.
- Empty state: “No document issues need repair” + informational counts.
- Read mode: sheet may open and Locate, but no mutation.

### Out of scope

- Drift, duplicate anchors, asset/cell checks, reference-edge audit, relink/move/search (v2).
- Library-wide scan (v3).
- Activity-bar Health view (phase 4 S2); this sheet ships first.
- Any new schema or settings field.

## Files

`apps/desktop/src/renderer/src/lib/anchor-health.ts` (extend or add `document-health.ts`),
`shell/Dialogs.tsx` (sheet), `shell/StatusBar.tsx`, `actions.ts`/`CommandPalette.tsx`,
`editor/views/BlockViews.tsx` if Locate needs a hook, `styles.css`, tests. Reuse existing repair
commands; add a command only if a v1 action has no typed command.

## Tests

- Pure fixtures: healthy, broken, ambiguous, idle, orphan reference/record, missing target, orphan
  block/unreachable, duplicate primary, cycle, empty chapter, collapsed, image missing.
- UI: counts/filters, Locate in Continuous and Page, idle remove/branch, orphan strip,
  missing-target relink/remove, orphan block move/delete, empty chapter add/delete, no mutation on
  open, Read-mode gating, status-bar indicator, palette entry.
- Existing M3e sheet actions remain green.
- 300/1,000-block audit timing; no fixed sleeps; no native dialogs.

## Acceptance

- [ ] Audit reports the v1 categories with counts/severity and no resolver duplication.
- [ ] Sheet filters/Locate/actions work; every action is undoable; no auto-fix.
- [ ] Status bar and palette entry; Read mode cannot mutate.
- [ ] v1 scope only; v2/v3 explicitly absent.
- [ ] No schema/settingsVersion/Page/PDF/export/showcase change; existing assertions not weakened.

## Evidence and report

- `docs/reports/document-health.md`: scope, files, checks with timings, PASS/FAIL, risks, next.
- Screenshots: sheet with mixed states, Locate, structural row, status bar.
- One commit; worktree/branch/head. Do not run the full verify; the Orchestrator runs it at 4.
