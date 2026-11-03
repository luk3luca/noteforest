# M2a — Document core + primary branches

**Status:** Complete (3 November 2026); see `docs/reports/m2a-document-core.md`  
**Owner:** Builder (worktree)  
**Depends on:** spec v0.4.1 §4, §5, §10; ADR-0001  
**Out of scope:** UI, TipTap, shell, span anchors, reference edges/shared children, layout, page view, PDF, external API

## Scope update — primary branches in M2a (3 November 2026)

The product owner requires the first editor to show explicit arrows between blocks, so M2a includes **basic primary block-level branches** (not only a linear block list):

- branch records: `id`, source block, target block, `role: "primary"`, fractional `order`, optional label;
- commands: create primary child from a block, create sibling, reparent/move within legal positions, reorder siblings, delete a primary edge (target becomes top-level or is deleted with an explicit choice), with inverse/undo;
- validation: no primary cycle, no two primary parents, no dangling target, chapter assignment stays consistent; reference edges and anchors remain unsupported/empty but schema-compatible;
- tests: create child → arrow data, reparent, reorder, delete edge, cycle rejection, one-primary-parent invariant, round-trip persistence of branches.

The block tree is stored as primary branch records (the canonical model in spec §4.5–4.6), not as a second `parentId` field. Span anchors, reference edges, shared children, page view, and PDF remain in M3/M4.

## Goal

Build the canonical document model and local persistence layer the editor shell will use. The deliverable is a tested TypeScript package (`packages/core`) and a small CLI/test harness.

## Scope

### Package `packages/core`

- Canonical types for the M2 subset:
  - `Document`: `schemaVersion`, `id`, `title`, `createdAt`, `updatedAt`, `revision`, `pageSetup`, `chapters`, `blocks`, `assets`, `anchors` (empty in the M2 shell), `branches` (primary branch records), `manualBreakBeforeBlockIds` (empty in M2), `viewState` (optional), `extensions`.
  - `Chapter`: `id`, `title?`, ordered `topLevelBlockIds`.
  - `ContentBlock`: `id`, `label?`, `content` (ProseMirror-shaped JSON subset with `children`), `border?`, timestamps, `extensions`.
  - `Branch`: `id`, `sourceBlockId`, `targetBlockId`, `role: 'primary'`, fractional `order`, optional `label`, `extensions`. Reference edges are not implemented.
  - `PageSetup`, `Asset`, `ViewState` as in the spec.
- IDs: opaque, stable, never reused; UUID v4 via `crypto.randomUUID()` with injectable factories in tests.
- Validation:
  - unique document/block/chapter/branch IDs;
  - every top-level block appears exactly once in exactly one chapter and has no primary incoming branch;
  - every non-top-level block has exactly one primary incoming branch in the same chapter;
  - no cycles in the primary tree;
  - no dangling parent/child or branch source/target IDs;
  - branch order is a deterministic fractional order per source;
  - unknown fields and unknown content nodes are preserved.
- Commands (pure, reversible where practical):
  - `document.create`, `document.rename`;
  - `chapter.create`, `chapter.rename`, `chapter.reorder`, `chapter.delete` (reject-if-not-empty, move-to-chapter, or delete-blocks);
  - `block.create` (top-level, child, sibling before/after), `block.editContent`, `block.rename`, `block.delete` (promote children or delete subtree), `block.move` (reparent/reorder within legal positions);
  - `branch.create` (attach an existing root as a primary child), `branch.delete` (promote target or delete subtree, explicit), `branch.reorder`, `branch.relabel`;
  - one command result shape with affected IDs, new revision, inverse, and warnings where practical.
- Revision semantics: commands increment `revision` once per committed transaction; save persists it and never moves it backwards. An unchanged save is a no-op. Undo/redo advance revision monotonically.
- Persistence (`packages/core/node`; Node built-ins only):
  - document package: `<library>/<slug>/document.json` + `assets/`;
  - atomic save: temp → write → fsync → rename → best-effort directory fsync; never leave a partial `document.json`;
  - backups outside the package in app support, keyed by package-path hash: autosave (default 20, min 10), daily snapshots (7), pre-migration (7 days);
  - corrupt/invalid/newer-schema/locked documents open read-only with typed errors and are never overwritten; newer schema is never downgraded;
  - external modification detected by SHA-256; overwrite requires an explicit flag;
  - single-writer lock file (PID/host/session/token/heartbeat); readers never lock; stale recovery is explicit;
  - recent-documents manifest in app support, atomic and deduplicated;
  - recovery inspection lists orphan temps, backups, and canonical file with validity/revision/block count; restore writes a new copy unless overwrite is explicit.
- A CLI harness (`packages/core/harness/run.ts`) demonstrates create → edit → save → reopen → corrupt recovery.

### Tests

- Create → edit → save → reopen round-trip; content and structure preserved.
- Unknown fields and unknown content nodes survive a round-trip.
- Duplicate IDs, dangling parents/targets, cycles, a block in two chapters, and multiple primary parents are rejected with typed errors.
- Deleting a block with children: promote vs subtree; no dangling references.
- Reorder/reparent changes order only, not IDs or content.
- Create primary child → arrow data; reparent; reorder siblings; delete primary edge; cycle rejection; one-primary-parent invariant; branch round-trip persistence.
- Atomic save: simulated failure leaves the previous file byte-identical; no temp files.
- Backup rotation ≥10; recovery from a corrupt newest file; newer schema read-only.
- Lock: second writer rejected/read-only; concurrent reads; release; stale recovery explicit.
- 300-block save/load performance reported (no strict budget).
- No UI/React/TipTap/layout/PDF imports in `packages/core`.

## Non-negotiable

- No UI or React in `packages/core`.
- Primary block-level branches are in M2; span anchors, reference edges, shared-child lifecycle, and branch-from-anchor are not. Keep the schema forward-compatible.
- No second source of truth: the block tree is primary branch records; commands are the only mutation path.
- Do not edit `docs/spec.md`, UX, ADRs, or plan. Record findings in the report.
- Do not add runtime dependencies without Orchestrator approval; prefer Node built-ins. Test-only dependencies are fine.
- Work in a worktree; commit in small steps; do not merge.

## Deliverables

- `packages/core` source + tests + README (short).
- A test harness/CLI example.
- `docs/reports/m2a-document-core.md` with: what was built, test results, performance numbers, findings, and open questions.
- Report the worktree path, branch, commits, commands run, and any spec ambiguity.

## Acceptance

- `npm test` (or the package test command) passes.
- All invariants above are tested, including failure paths.
- The harness demonstrates a real save/reopen and a corrupt-file recovery.
- No UI or PDF work is included.
