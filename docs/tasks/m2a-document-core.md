# M2a — Document core + local persistence

**Status:** Approved to start (3 November 2026)  
**Owner:** Builder (worktree)  
**Depends on:** spec v0.4.1 §4, §5, §10; ADR-0001  
**Out of scope:** UI, TipTap, shell, span anchors, reference edges, shared children, layout, page view, PDF, external API

## Scope update — primary branches in M2a (3 November 2026)

The product owner requires the first editor to show explicit arrows between blocks, so M2a
includes **basic primary block-level branches** (not only a linear block list):

- branch records: `id`, source block, target block, `role: "primary"`, fractional `order`,
  optional label;
- commands: create primary child from a block, create sibling, reparent/move within legal
  positions, reorder siblings, delete a primary edge (target becomes top-level or is deleted
  with an explicit choice), with inverse/undo;
- validation: no primary cycle, no two primary parents, no dangling target, chapter assignment
  stays consistent; reference edges and anchors remain unsupported/empty but schema-compatible;
- tests: create child → arrow data, reparent, reorder, delete edge, cycle rejection,
  one-primary-parent invariant, round-trip persistence of branches.

The block tree is stored as primary branch records (the canonical model in spec §4.5–4.6), not
as a second `parentId` field. Span anchors, reference edges, shared children, page view, and PDF
remain in M3/M4.

## Goal

Build the canonical document model and local persistence layer the editor shell will use. No UI. The deliverable is a tested TypeScript package (`packages/core`) and a small CLI/test harness.

## Scope

### Package `packages/core`

- Canonical types for the M2 subset:
  - `Document`: `schemaVersion`, `id`, `title`, `createdAt`, `updatedAt`, `revision`, `pageSetup`, `chapters`, `blocks`, `assets`, `anchors` (empty map in the M2 shell), `branches` (primary branch records; empty until a child block exists), `manualBreakBeforeBlockIds` (empty list in M2), `viewState` (optional), `extensions`.
  - `Chapter`: `id`, `title?`, ordered `topLevelBlockIds`.
  - `ContentBlock`: `id`, `label?`, `content` (TipTap/ProseMirror JSON subset), `border?`, timestamps, `extensions`.
  - `PageSetup`, `Asset`, `ViewState` as in the spec.
  - `Branch` (primary): `id`, `source`, `targetBlockId`, `role`, `order`, optional `label`.
- IDs: opaque, stable, never reused; generated with `crypto.randomUUID()` or a monotonic ULID-like helper (choose one, document it).
- Validation:
  - unique document/block/chapter IDs;
  - every top-level block appears exactly once in exactly one chapter;
  - every non-top-level block has exactly one parent in the same chapter;
  - no cycles in the block tree;
  - no dangling parent/child IDs;
  - unknown fields and unknown content nodes are preserved.
- Commands (pure, reversible where practical):
  - `document.create`, `document.rename`;
  - `chapter.create`, `chapter.rename`, `chapter.reorder`, `chapter.delete` (with explicit block handling);
  - `block.create` (top-level, child, sibling), `block.editContent`, `block.rename`, `block.delete` (promote children or delete subtree), `block.move` (reparent/reorder within legal positions);
  - `branch.create` (attach an existing root as a primary child), `branch.delete` (promote target or delete subtree, explicit), `branch.reorder`, `branch.relabel`;
  - one command result shape with affected IDs, new revision, and inverse where practical; undo/redo restores exact structure.
- Branch validation:
  - one incoming primary edge per block; acyclic; no dangling source/target; target/source blocks exist;
  - reference edges and anchor branches remain schema-compatible but are not created or edited in M2.
- Persistence (`packages/core/node` or a separate `storage` module; Node-only):
  - document package: `<library>/<slug>/document.json` + `assets/`;
  - atomic save: write temp, fsync if practical, rename; never leave a partial `document.json`;
  - backup rotation: at least 10 versions, plus a pre-migration backup hook;
  - `revision` increments once per committed save;
  - load validates and returns a typed result or a typed error; corrupt/newer schema opens read-only and is never overwritten;
  - a simple lock file per document (PID/host/session) for single-writer detection; concurrent reads allowed;
  - recent-documents manifest in app support (not in the document package).
- A tiny CLI or test harness to create, edit, save, reopen, and corrupt a document; no Electron.

### Tests

- Create → edit → save → reopen round-trip; content and structure preserved.
- Unknown fields and unknown content nodes survive a round-trip.
- Duplicate IDs, dangling parents, cycles, and a block in two chapters are rejected with typed errors.
- Deleting a block with children: promote vs subtree; no dangling references.
- Reorder/reparent changes order only, not IDs or content.
- Create primary child → arrow data; reparent; reorder siblings; delete primary edge; cycle rejection; one-primary-parent invariant; branch round-trip persistence.
- Atomic save: simulated failure leaves the previous file byte-identical; no temp files.
- Backup rotation; recovery from a corrupt newest file; newer schema is read-only.
- Lock: second writer is rejected/read-only; lock release on close; stale lock recovery is explicit.
- 300-block save/load performance is reported (no strict budget yet).

## Non-negotiable

- No UI or React in `packages/core`.
- Primary block-level branches are in M2; span anchors, reference edges, shared-child lifecycle, and branch-from-anchor are not. Keep the branch/anchor schema forward-compatible.
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
