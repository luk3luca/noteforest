# M2a — Document core + local persistence

**Status:** Approved to start (3 November 2026)  
**Owner:** Builder (worktree)  
**Depends on:** spec v0.4.1 §4, §5, §10; ADR-0001  
**Out of scope:** UI, TipTap, shell, branches/anchors, layout, page view, PDF, external API

## Goal

Build the canonical document model and local persistence layer the editor shell will use. No UI. The deliverable is a tested TypeScript package (`packages/core`) and a small CLI/test harness.

## Scope

### Package `packages/core`

- Canonical types for the M2 subset:
  - `Document`: `schemaVersion`, `id`, `title`, `createdAt`, `updatedAt`, `revision`, `pageSetup`, `chapters`, `blocks`, `assets`, `anchors` (empty map), `branches` (empty map), `manualBreakBeforeBlockIds` (empty list in M2), `viewState` (optional), `extensions`.
  - `Chapter`: `id`, `title?`, ordered `topLevelBlockIds`.
  - `ContentBlock`: `id`, `label?`, `content` (TipTap/ProseMirror JSON subset), `border?`, timestamps, `extensions`.
  - `PageSetup`, `Asset`, `ViewState` as in the spec.
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
  - one command result shape with affected IDs and the new revision.
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
- Atomic save: simulated failure leaves the previous file byte-identical; no temp files.
- Backup rotation; recovery from a corrupt newest file; newer schema is read-only.
- Lock: second writer is rejected/read-only; lock release on close; stale lock recovery is explicit.
- 300-block save/load performance is reported (no strict budget yet).

## Non-negotiable

- No UI or React in `packages/core`.
- No branches/anchors logic in M2; keep the maps and types forward-compatible, but do not implement branch commands.
- No second source of truth; the package is the only mutation path.
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
