# M3i2c — DocumentSession boundary

**Date:** 6 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-4b6ef29a`  
**Branch:** `t3/m3i2c-document-session`  
**Base:** `d56d2ab` (docs: merge M3i2b/M3i3 and start M3i2c)  
**Commit:** `71ab5a3` — `refactor: extract the canonical document session from the runtime`  
**Scope:** behavior-preserving runtime-boundary slice. No UI, schema, command, revision, undo order,
save, layout, token, dependency, IPC, or external API change. No merge or push.

## Summary

`DocumentSession` now owns the canonical document/revision, the per-document serial queue, structural
undo/redo plus `lastHistoryOperation`, typed command application and inverse acceptance, base-revision
ordering, content-commit bookkeeping, and the canonical version/notification hooks. `DocumentRuntime`
is the composition root over `DocumentSession`, `EditorProjection`, `SaveCoordinator`,
`DocumentGateway`, and the view/anchor services. The public runtime API is unchanged; `document`,
`lastHistoryOperation`, `canUndoStructural`, and `canRedoStructural` are now getters over the session.

The runtime keeps every editor/view concern: the TipTap projection, focus/caret, anchor selection and
repair, collapse/placement, health-derived UI state, the repair notice, and the fast DOM mutation paths
(`insertCreatedBlock`, `moveBlockNode*`, `removeBlockNodeInEditor`, `toggleCollapse`, `setBlockType`).
No UI copy, IPC, or command-layer code moved.

## Files

| File | Change |
|---|---|
| `apps/desktop/src/renderer/src/state/document-session.ts` | new — canonical session, ports, queue, history, command/content application |
| `apps/desktop/src/renderer/src/state/runtime.ts` | composition root; session delegation; 1,982 → 1,932 lines (`+101 / −150` in the diff) |
| `apps/desktop/test/document-session.test.ts` | new — 21 focused command/inverse/undo/redo/revision/content-commit tests |

No other production or test file changed.

## Session API

```ts
interface DocumentSessionPorts {
  readonly packagePath: string;
  readonly gateway: DocumentGateway;
  isEditable(): boolean;
  commitEditor(): Promise<boolean>;   // runtime commitContentInternal
  bumpVersion(): void;                // runtime.version += 1
  notify(): void;                     // runtime.notify()
  markContentCommitted(): void;       // SaveCoordinator
  noteStructuralChange(): void;       // SaveCoordinator
  recordFailure(code: SaveFailureCode, message: string): void;
  saveError(): string | null;
}

class DocumentSession {
  readonly queue: SerialQueue;
  get canonical(): Document;
  get revision(): number;
  get lastHistoryOperation(): 'text' | 'structural' | null;
  get canUndoStructural(): boolean;
  get canRedoStructural(): boolean;
  markTextHistory(): void;
  execute(command: DocumentCommand): Promise<ApplyResult>;
  apply(command: DocumentCommand): Promise<ApplyResult>;
  acceptStructural(document: Document, inverse: DocumentCommand | null | undefined): void;
  popUndo(): DocumentCommand | undefined;
  popRedo(): DocumentCommand | undefined;
  acceptUndo(document: Document, inverse: DocumentCommand | null | undefined): void;
  acceptRedo(document: Document, inverse: DocumentCommand | null | undefined): void;
  contentChanged(blockId: string, content: ContentNode): boolean;
  commitContent(changes: readonly ContentChange[]): Promise<boolean>;
  applyRevision(revision: number | undefined): void;
  reset(document: Document): void;
  replaceDocument(document: Document): void;  // benchmark/test hook only
}
```

Composition wiring in `DocumentRuntime`:

- `session = new DocumentSession(snapshot.document, ports)` first;
- `EditorProjection` reads the canonical document through `runtime.document` (the session getter);
- `SaveCoordinator` receives `session.queue` and `session.applyRevision`, so saves, commits, and
  commands still serialize on the one queue;
- `commitContentInternal` keeps the editor gate (`editable`, disposed, mounted editor, reconcile) and
  the `withBody` merge/diff, then hands already-merged `ContentChange`s to the session;
- undo/redo keep their exact sequence in the runtime: capture focus → pop → commit → apply → accept →
  resolve focus → rebuild/reconcile → notify → schedule save.

## Behavior-preservation evidence

- **Canonical document/revision:** the session stores exactly the `Document` objects the gateway
  returns; `applyRevision` applies the same `{ ...document, revision }` update on a successful write.
  `runtime.document` is a getter, so every UI/test read (`App.tsx`, `structuredClone`, e2e parity) sees
  the same object as before. No code wrote `runtime.document` externally (checked UI, unit, e2e).
- **Serial queue / base revision:** the runtime and `SaveCoordinator` share `session.queue`; every
  previous `this.queue.run` call site now runs on that same instance. `session.execute` performs the
  same read-only check, the same editor commit, the same `saveError` fallback, and only then forwards
  the typed command, so a command still reaches the store against the revision the renderer just
  produced.
- **Undo/redo identity:** `acceptStructural` stores the single inverse the core returned for the whole
  user action, clears redo, and sets `lastHistoryOperation = 'structural'`. Undo pushes the inverse
  returned by the undo command (the core's `structure.restore`, asserted by the new test), redo pushes
  the inverse back; a rejected inverse is still popped and dropped, never retried at the top of the
  stack. Composite `createChapterWithFirstBlock` still passes one `chapter.delete` inverse. The
  existing undo-stack suite and the e2e undo-routing test pass unchanged.
- **Content commit / live health (S2-4):** `session.commitContent` reproduces the original loop
  verbatim: per-block `block.editContent`, typed `read-only` vs `unknown` failure mapping, failure
  stops without `markContentCommitted`, a successful pass bumps the version once and notifies once
  before the disk save. Hashes are updated per accepted change; a gateway success without a document
  still marks content committed without a version bump/notify (the previous behavior is pinned by a
  test). M3h3 live-health UI test passes.
- **Save/autosave/flush/lock/recovery:** no change to `SaveCoordinator`, `DocumentGateway`,
  `packages/core`, `apps/desktop/src/main`, preload, or IPC. `saveNow`/`flush`/`commitPending`/
  `retrySave`/`saveCopy`/`overwriteExternal`/`restoreBackup` are untouched delegations; takeover and
  reload still clear timers, reset save state, reset canonical history, rebuild with
  `resetHistory: true`, and notify in the same order. Recovery suite and the failed-save e2e pass.
- **View/anchor/health/selection:** all remain in the runtime. `validateSelectedAnchor`,
  `keptBroken`, `selectedAnchor`, `collapsed`, `repairNotice`, `version` (including the view-only bumps
  from collapse/reveal) are unchanged. The only ordering nuance is that structural acceptance now
  bumps the version/save phase just before `validateSelectedAnchor` instead of just after; no
  notification listener reads the anchor selection, and the emitted `seq`/state values are identical.
- **M3h1 placement history:** untouched; the placement rebuild/replay still runs through
  `EditorProjection`, and `m3-anchor-callout-placement-undo` passes with `lastHistoryOperation`
  transitions unchanged.
- **Public runtime API:** no call site changed. `editor`, `document`, `title`, `editable`, `dirty`,
  `saveState`, `saveError`, `saveFailure`, `restore`, `seq`, `version`, `collapsed`,
  `selectedBlockId`, `selectedAnchor`, `lastHistoryOperation`, `canUndo*`, `canRedo*`, and every
  command/save method keep their signatures; `lastHistoryOperation` and `canUndo/RedoStructural` are
  getters backed by the session.
- **Boundaries:** no direct `window.noteforest` in the session (gateway only); the new test runs with
  no `window` global. No UI copy, dialogs, tokens, layout, or command-layer change; M3i4 untouched.

## Tests and timings

| Gate | Result |
|---|---|
| `npm run typecheck` | pass (desktop node + web, core, layout, pdf) |
| new session vitest | 21/21 pass, 0.11 s |
| targeted vitest (session, commands, undo, text history, save coordinator, projection, routing, gateway) | 12 files, 132/132 pass, 0.54 s |
| `npm test` | 55 files, 596/596 pass, 1.95 s (was 575; +21 new) |
| `npm run test:ui` | exit 0 — 15 files, 36/36 UI tests, 2:49.5 |
| `npm run e2e:critical` | 21/21 pass, 54.4 s standalone; 21/21 in `verify:fast`, 53.3 s |
| `npm run test:recovery:run` | 14/14 pass, 17.6 s |
| `npm run verify:fast` | exit 0 after commit `71ab5a3`, 60.2 s |

No fixed sleeps or native dialogs were added. Session tests use the in-memory gateway (real core
commands) and a scripted gateway for partial-failure ordering, not wall-clock waits.

## Risks and notes

- `DocumentSession.execute` documents (and relies on) the caller holding the queue; it is the same
  contract the private `runCommandInternal` had. Undo/redo deliberately keep their sequence in the
  runtime because focus capture must happen inside the queue before the inverse is applied.
- The session exposes `replaceDocument` only for the existing `benchmarkFullReflow` diagnostic hook,
  which swaps canonical structure without history/save bookkeeping by design. It is not a UI path.
- `contentChanged` reads the session's content hashes; the merge (`withBody`) stays in the runtime so
  the session has no editor/adapter dependency.
- Structural acceptance calls the save hook before the runtime validates the anchor selection. This
  does not change any emitted state or notification count; it is noted because it is the only reordered
  statement in the extraction.
- `DocumentSession` has no timer or dispose state; closing still goes through `SaveCoordinator`
  disposal and the existing queue, exactly as before.

## Not verified

- Full `npm run verify` — owned by the Orchestrator after integration.
- Visual-regression and performance suites, screenshots/VoiceOver — no UI, token, or layout change.
- Repeated e2e/UI runs or flake stress — one green pass per gate on the final commit.
- No merge, push, or review.
