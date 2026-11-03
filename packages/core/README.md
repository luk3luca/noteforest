# @noteforest/core

Canonical NoteForest document model, typed commands, and local persistence for
M2. No UI, React, TipTap, layout, page view, or PDF.

## Entrypoints

| Import | Contents | Environment |
|---|---|---|
| `@noteforest/core` | types, factories, validation, serialization, commands, undo history, fractional order keys | pure TypeScript (no Node, DOM, or filesystem) |
| `@noteforest/core/node` | document package store, atomic writes, backups, single-writer lock, recent manifest, recovery | Node only |

`src/index.ts` never imports Node built-ins. The Node layer imports the pure
model, not the other way around.

## Model

Canonical types follow `docs/spec.md` §4:

- `Document`: `schemaVersion`, `id`, `title`, timestamps, `revision`,
  `pageSetup`, `manualBreakBeforeBlockIds`, `chapters`, `blocks`, `anchors`,
  `branches`, `assets`, optional `viewState`, optional `extensions`.
- `Chapter`: `id`, optional `title`, ordered `topLevelBlockIds`.
- `ContentBlock`: `id`, optional `label`, `content` (structured JSON body),
  optional `border`, timestamps, extensions.
- `PageSetup`: A4 portrait/landscape and millimetre margins (20 mm default).
- `Asset`, `Anchor`, `Branch`, `ViewState` as in the spec.

Unknown fields at every level and unknown content nodes/marks are preserved;
the parsed JSON object is used directly instead of being projected onto a
closed shape. `parseDocumentJson` validates but never strips unknown data.

### Block tree = primary branches

The block tree is represented by canonical **primary branch records**, not by a
second `parentId` field:

```json
{
  "id": "branch-id",
  "source": { "blockId": "parent-id" },
  "targetBlockId": "child-id",
  "role": "primary",
  "order": "m"
}
```

Every non-root block has exactly one incoming primary branch; roots are listed
exactly once in one chapter's `topLevelBlockIds`. Reference branches and anchor
branches are accepted on load (forward compatibility) but have no commands in
M2. `order` keys are base-36 fractional strings, unique within a source port and
role; insertion does not renumber siblings.

IDs are UUID v4 strings from the platform Web Crypto API (`crypto.randomUUID`),
opaque and never reused. Tests inject deterministic ID factories.

## Commands

All mutations go through `executeCommand(document, command, options)` or
`DocumentStore.apply(command)`. Commands are pure: the input document is not
mutated. A success carries the new document, revision, affected IDs, warnings,
and an inverse command where practical.

| Command | Notes |
|---|---|
| `document.create`, `document.rename` | create returns revision 0 |
| `chapter.create`, `chapter.rename`, `chapter.reorder` | chapter order |
| `chapter.delete` | explicit `blockHandling`: reject, move to another chapter, or delete blocks |
| `block.create` | placement: top-level, child, or sibling; creates primary branches |
| `block.editContent`, `block.rename` | replace content / set or clear label |
| `block.delete` | `promote` (default-safe) or `delete-subtree` |
| `block.move` | reparent, reorder, or move to top level; rejects cycles |
| `branch.create` | attach an existing root as a primary child of a block |
| `branch.delete` | target becomes top-level, or delete its subtree (explicit) |
| `branch.reorder`, `branch.relabel` | sibling arrow order and optional label |

Every command validates its preconditions, applies to a deep clone, and
re-validates the resulting document. A failed command changes nothing.

**Revision:** commands increment `document.revision` once per committed
transaction (spec §4.2); a save persists the current revision and never lets it
decrease. An unchanged save is a no-op and does not advance revision.

`DocumentHistory` provides session-only snapshot undo/redo. It is exact for
destructive commands (including branch IDs) and is not persisted.

## Persistence (Node)

```text
<library>/<slug>/
  document.json
  assets/
```

- Atomic save: temp file in the package directory → write → fsync → rename over
  `document.json`; directory fsync is best effort. On an in-process failure the
  temp file is removed and the previous file is byte-identical.
- Backups live outside the package in
  `<appSupport>/backups/<package-path-hash>/`:
  - one autosave snapshot before each successful save (default 20, minimum 10);
  - one daily snapshot, 7 days;
  - manual and pre-migration snapshots (`store.createBackup('manual' | 'pre-migration')`),
    pre-migration retained 7 days.
- Single-writer lock in `<appSupport>/locks/<package-path-hash>.lock`, naming
  PID, host, session, token, and heartbeat. Concurrent readers take no lock.
  A stale lock (dead PID on the same host, or heartbeat older than the TTL) is
  never stolen automatically: pass `breakStaleLock: true` explicitly.
- Corrupt, invalid, newer-schema, or locked documents open read-only with a
  typed error and are never overwritten. A newer schema is never downgraded.
- External modification is detected by SHA-256 of the on-disk bytes before each
  save. Saving over it requires `{ overwriteExternal: true }`.
- Recent documents are stored atomically in
  `<appSupport>/recent-documents.json` (outside the document package).

### Recovery

`inspectRecoveryCandidates(packagePath)` lists orphan temp files, backups, and
the canonical file with validity, revision, block count, and title.
`findNewestValidRecovery` returns the newest valid temp/backup;
`restoreCandidateToPackage` writes a new copy and refuses to overwrite an
existing `document.json` unless `{ overwrite: true }`. Pass
`assetsSourcePackagePath` to copy content-addressed assets into the restored
copy.

## Usage

```ts
import { createDocumentPackage, openDocumentPackage } from '@noteforest/core/node';

const created = await createDocumentPackage('/Users/me/Notes', { title: 'Algebra' });
if (!created.ok) throw new Error(created.error.message);
const { store } = created;

const block = store.apply({
  type: 'block.create',
  label: 'Eigenvalues',
  placement: { kind: 'top-level', chapterId: store.document!.chapters[0]!.id },
});
if (!block.ok) throw new Error(block.message);

await store.save();
await store.close();

const reopened = await openDocumentPackage(created.packagePath, { mode: 'read' });
console.log(reopened.document?.title);
```

## Tests and harness

```bash
npm test -w @noteforest/core          # 78 tests (vitest)
npm run typecheck -w @noteforest/core
npm run harness -w @noteforest/core   # builds dist/ and runs the demo

# Or after building:
node packages/core/dist/harness/run.js --keep
```

The harness demonstrates create → edit → save → reopen, prints the persisted
primary arrow, corrupts `document.json`, shows the read-only typed error, and
restores the newest valid backup into a new package copy.

## M2 scope

Primary branch tree commands and validation are in scope. Span anchors,
reference-edge commands, shared children, page view, layout, and PDF are out of
scope (M3/M4). `anchors` and reference branches are preserved on load and round
trip; they are not edited.
