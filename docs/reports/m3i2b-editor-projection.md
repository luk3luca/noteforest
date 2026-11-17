# M3i2b — EditorProjection boundary

**Date:** 6 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `a builder worktree`  
**Branch:** `t3/m3i2b-editor-projection-extraction`  
**Base:** `343d676` (docs: merge M3i2a/M3i5a and start M3i2b/M3i3)  
**Commit:** `f3da144` — `refactor: extract the editor projection from the document runtime`  
**Scope:** behavior-preserving runtime-boundary slice. No UI, schema, command, revision, undo,
save, layout, token, dependency, or external API change. No merge or push.

## Summary

`EditorProjection` now owns the TipTap projection that used to live inside `DocumentRuntime`:

- build the TipTap document from canonical structure + the collapsed set + the measured
  right/below placement set;
- extract the edited block bodies from the buffer;
- replace the buffer (non-history, no update/save signal) and restore the block/caret;
- reconcile the buffer with canonical and report the repair notice;
- capture/replay the M3h1 text history across a view-only placement rebuild.

`DocumentRuntime` composes the projection and delegates to it. The public runtime API is unchanged:
`editor` is still `Editor | null` (now a getter), and `attachEditor`, `rebuildEditor`,
`reconcileEditor`, `applyChildPlacement`, `focusBlock`, `expandAncestors`, `caretLocation` keep their
signatures. The runtime keeps canonical content, revision, the serial queue, structural
undo/redo, anchor/selection state, the repair notice, and the fast DOM mutation paths
(`insertCreatedBlock`, `moveBlockNode*`, `removeBlockNodeInEditor`, `toggleCollapse`,
`expandAncestors`, `setBlockType`).

`DocumentGateway`/`SaveCoordinator` are untouched. Canonical document/undo/structural command
semantics were not moved (that stays M3i2c), and the projection never calls `window.noteforest`.

## Files

| File | Change |
|---|---|
| `apps/desktop/src/renderer/src/state/editor-projection.ts` | new — projection service, pure projection/reconcile/replay helpers, host ports |
| `apps/desktop/src/renderer/src/state/runtime.ts` | composes/delegates the projection; `editor` becomes a getter; projection internals removed (2,380 → 1,982 lines, `+36 / −434`) |
| `apps/desktop/test/editor-projection.test.ts` | new — 12 projection tests |

## Projection API

```ts
interface EditorProjectionHost {
  document(): Document;                 // canonical document, current revision
  collapsed(): ReadonlySet<string>;     // runtime-owned view state
  selectedBlockId(): string | null;     // fallback when the editor has no block selection
  reveal(blockId: string): void;        // runtime.expandAncestors
  setRepairNotice(message: string): void;
}

class EditorProjection {
  attach(editor: Editor | null): void;
  get attached(): Editor | null;
  build(): PMNode;
  extractBodies(): Map<string, BlockBody>;
  captureFocusContext(): FocusContext;
  resolveFocusContext(context: FocusContext): string | null;
  applyChildPlacement(belowChildIds: ReadonlySet<string>): void;
  rebuild(focusBlockId?: string | null, options?: RebuildOptions): void;
  reconcile(focusBlockId?: string | null): boolean;
  focusBlock(blockId: string, options?: { select?: boolean; scroll?: boolean; at?: 'start' | 'end' }): void;
}
```

Pure helpers are exported for focused tests: `auditBlockIds` (the reconcile decision),
`extractBlockBodies`, `projectWithEditorBodies`, `replaceEditorDocument`, `clearTextHistory`,
`replayTextHistory`. `EditorSurface` (`state()` + `dispatch()`) is the only editor facility the
replace/replay path drives; production passes the live TipTap editor, tests pass an
`EditorState`-backed surface so the whole replay (including the fallback) runs without a DOM.

The projection owns the below-stack placement set (previously a runtime field). Collapsed state,
selection, canonical content and the repair notice stay on the runtime and are read/written through
the host ports. No dependency was added.

## Behavior-preservation evidence

- **Build:** `build()` calls the same `buildEditorDocument(document, collapsed, belowChildIds)` with
  the same three inputs; chapter/collapse/callout-lane/`belowRow` attributes are asserted by the new
  tests and unchanged in the UI suite.
- **Extraction:** the commit path now uses `projection.extractBodies()`, which is the same
  `extractBlockContents` over the same ProseMirror JSON (`editor.state.doc` is what `editor.getJSON()`
  returns). Content, label, `withBody` merge and change hashing are unchanged.
- **Replace:** the same `replaceWith(0, doc.content.size, node.content)` transaction with
  `addToHistory: false` and `preventUpdate: true`; the new test asserts the metas and that the text
  undo depth is untouched.
- **Focus/caret:** `captureFocusContext`, `resolveFocusContext` and `restoreFocus` moved verbatim
  (same offset math, same ancestor/chapter/visible fallbacks, same `chain()` calls); the only change
  is that `focusBlock` calls `host.reveal` (runtime `expandAncestors`) instead of calling it
  directly. The new runtime test checks that focusing expands a collapsed ancestor with no editor
  mounted, as before.
- **Reconcile:** the ID-set comparison is the same rule, extracted as `auditBlockIds` (extra /
  missing / placeholder); the DOM diagnostics warning, the mismatch warning, the two repair-notice
  strings, the rebuild and the runtime `notify()` keep their original order. The runtime unit suite
  (save failure, empty chapters, undo stack, idle anchors) and the UI repair/callout suites pass.
- **M3h1 history replay:** capture → replace baseline → clear history → per-event mapping through
  `blockBody` offsets → `closeHistory` → dispatch → chapter-content verification → expected-projection
  fallback is byte-for-byte the previous algorithm, now driven through `EditorSurface`. The fallback
  path (unmappable step → rebuilt projection + empty text stack) is asserted by a new test, and the
  real placement/undo UI test (`m3-anchor-callout-placement-undo`) still passes.
- **Placement:** `applyChildPlacement` keeps the same set equality check, updates the set even with
  no editor, and never steals focus when the editor is idle (`isFocused` gate + `restore` only when
  focused).
- **Runtime/public API:** no call site changed except internal delegation. `runtime.editor` is a
  getter over the projection; `dispose()` detaches. `runtime.collapsed`, `version`, `seq`,
  `repairNotice`, `lastHistoryOperation`, structural undo/redo and save state are unchanged.
- **Boundaries:** no change to `packages/core`, `apps/desktop/src/main`, preload, IPC contracts,
  `DocumentGateway`, `SaveCoordinator`, `save-coordinator.ts`, `Dialogs.tsx`, UI copy or tokens.

## Tests and timings

| Gate | Result |
|---|---|
| `npm run typecheck` | pass (desktop node + web, core, layout, pdf) |
| new projection vitest | 12/12 pass, 0.31 s |
| targeted vitest (projection, text history, adapter, placement, undo, history routing) | 55/55 pass, 0.25 s |
| broader targeted vitest (+ save failure, empty chapters, idle anchors) | 62/62 pass, 0.57 s |
| `npm test` | 51 files, 551/551 pass, 1.77 s (was 539; +12 new) |
| targeted UI (callout placement-undo, stacking, layout) | 12/12 pass — 1/10.0 s, 5/12.6 s, 6/12.6 s |
| `npm run test:ui` | exit 0 — 15 files, 36/36 UI tests (≈166 s of per-file runs + build) |
| `npm run e2e:critical` | 21/21 pass, 53.2 s |
| `npm run verify:fast` | exit 0 after the final commit (typecheck, 551/551, 21/21 e2e, 53.1 s) |

No fixed sleeps or native dialogs were added. The projection tests use `EditorState` + a local
dispatch surface, not wall-clock waits.

## Risks and notes

- The projection test double implements only the members the tested paths use (`state`, `schema`,
  `view.dispatch`, `dom.querySelectorAll`, `isFocused`); focus itself stays covered by the UI suite.
- `EditorProjectionHost.reveal` calls back into `DocumentRuntime.expandAncestors`, which bumps
  `version` and notifies. This is the pre-existing focus-reveal behavior; the new runtime test pins
  it.
- The projection reads the canonical document through a getter on every build, so it always sees the
  runtime's current revision; there is no cached copy to invalidate.
- `rebuild()` still records a `reflow` perf sample around replace + history reset only, as before.
- The repair notice is now set through a host port (same order: notice → rebuild → notify), so the
  projection itself stays free of UI notice state.

## Not verified

- Full `npm run verify` — owned by the Orchestrator after integration.
- Recovery suite, visual-regression suite, and performance suite — no schema, save, layout, token or
  visual change in this slice.
- Screenshots/VoiceOver — not a UI change; the UI suite is the automated evidence.
- Repeated e2e runs / flake stress — one green pass per gate on the final commit.
- No merge, push, or review.
