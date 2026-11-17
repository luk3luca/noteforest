# M2 review — code quality, tests, and cleanup

**Date:** 4 November 2026  
**Reviewer:** Sentinel (independent review)  
**Worktree:** `a builder worktree`  
**Branch:** `t3/m2-review-and-test-cleanup`  
**Base:** `4e54409` (`main`: docs: mark M2e merged and in product-owner review)  
**Scope:** M2a–M2e code and tests; docs consistency; test inventory; cleanup backlog.  
**Status:** review only — no product code, spec, UX, ADR, or plan changes.

## Verdict

**Request changes.** The architecture is sound and the happy-path evidence is strong:
typecheck is clean, 144/144 unit tests pass, 13/13 e2e tests pass, axe reports no
serious/critical violations, and the 300/1,000-block render numbers are within the
M2 target. I found one confirmed **S1** app-lifecycle bug and several **S2** gaps in
undo, save/close robustness, corrupt-document recovery, keyboard access, and the
empty-chapter invariant.

Do not start M3 span anchors/reference edges until the S1 and S2 findings are fixed
or explicitly accepted by the product owner. The M2e product-owner visual review is
still a separate human gate; this review does not replace it.

## Top 5 findings

| # | Severity | Finding | Evidence |
|---|---|---|---|
| 1 | **S1** | **The app cannot quit after its last window is closed.** Closing the window sets `allowClose = false`; a later `app.quit()` is cancelled by `before-quit`, which only acts when `mainWindow` is non-null. On macOS the process stays alive with zero windows; on Windows/Linux the `window-all-closed` quit path can hang the same way. Requires Force Quit. | `apps/desktop/src/main/index.ts:187-195,273-278`; reproduced with Playwright: close `BrowserWindow`, wait, `app.quit()` → no quit within 4 s, process alive |
| 2 | **S2** | **Undo is not one predictable stack.** Structural undo is selected only when `lastStructuralAt > lastTextAt`; after any text edit, `⌘Z` goes to ProseMirror forever, with no fallback when editor history is exhausted. `block.delete`/`branch.delete` return `inverse: null`; deleting an existing block/subtree and detaching an existing branch are therefore not undoable in the app. `block.move` child→top-level→child undo recreates a branch with a **new branch ID**. `branch.create` cross-chapter undo restores the target into the source chapter, not its original chapter. The 120 ms command dedupe also drops intentional repeated `⌘Z`/redo presses. | `apps/desktop/src/renderer/src/actions.ts:322-348`; `state/runtime.ts:193-204,1106-1157`; `packages/core/src/commands.ts:1026,1060-1067,1206-1210,1236-1245`; `App.tsx:90-96`; repros below |
| 3 | **S2** | **Save/close handshake can silently drop the last edits, and a failed save has no recovery path.** The renderer flush returns no success/failure; the 2.5 s timeout resolves as success; preload catches handler rejection and still sends `flush-done`; the close path proceeds. `saveNow` shows an error but does not retry, and external-modification failures leave the document unsavable with no reload/overwrite/backup action. | `main/index.ts:88-107,113`; `preload/index.ts:43-53`; `App.tsx:100-103`; `state/runtime.ts:258-281`; `packages/core/src/node/store.ts:329-363` |
| 4 | **S2** | **Corrupt, missing, or newer-schema documents cannot be opened read-only or recovered.** The library scan skips any folder whose `document.json` does not parse; `openStore` returns an error when the snapshot has no document; `openPath` only shows a toast. The read-only banner requires a parsed document, so users never see the reason or the existing backup/recovery API. This contradicts the shell behavior “missing/corrupt opens read-only with a clear message; never overwritten.” | `apps/desktop/src/main/library.ts:106-129,168-190`; `actions.ts:57-79`; `DocumentEditor.tsx:315-320`; `packages/core/src/node/recovery.ts` (unused by the app) |
| 5 | **S2** | **Keyboard focus is trapped in the editor.** `Tab`/`Shift-Tab` return `true` whenever the selection is not a node selection, including a plain caret in a paragraph, so focus cannot leave the editor with Tab. The card `+`/collapse buttons, status controls, and tab strip are then unreachable by keyboard from the editor; only `Esc` (blur) exits, and that is not surfaced in the UI. `Ctrl+Tab` tab cycling is dead code because `mod` already includes Ctrl. Axe does not detect focus traps. | `editor/keymap.ts:124-145`; `App.tsx:113-124`; `BlockViews.tsx:253-313` |

A sixth S2 (empty chapters) is listed in the S2 table because it is structural rather
than a top-five symptom.

## What is healthy

- **Core and persistence are the strongest part of the codebase.** Typed commands are
  pure, validate input and output, return created IDs and inverses, and are the only
  mutation path. Atomic save is fsync + rename with directory fsync; the safety backup
  is written before the new file; external modification is hash-checked; the
  single-writer lock has token ownership, heartbeat, and explicit stale handling at
  the core layer; corrupt/newer files are opened read-only by `openDocumentPackage`.
- **Electron hardening is mostly right:** `contextIsolation`, `sandbox`,
  `nodeIntegration: false`, CSP, denied navigation/window-open, denied permissions,
  and a narrow preload surface. The findings below are gaps, not a broken isolation
  model.
- **The desync work is real:** one serial queue per document, command-created block
  IDs, `addToHistory: false` structural transactions, reconciliation, and the rapid
  creation parity e2e are exactly the right shape. The serial-queue and adapter unit
  tests are focused.
- **Layout/routing is designed and tested:** fixed 6×6 arrowhead, 12 px minimum stem,
  shared trunk with T-junction, parent-relative placement, 16 edge-routing tests plus
  6 placement tests, and the routing lab. The 300/1,000-block performance gate is met.
- **No secrets, no telemetry, no network calls.** `npm audit --omit=dev` reports zero
  vulnerabilities.

## S1/S2 findings

### F1 — S1 — Quit hangs after the last window closes

**Location:** `apps/desktop/src/main/index.ts:187-195` and `:273-278`.

**Evidence:** `closed` sets `allowClose = false`. `before-quit` cancels the quit when
`allowClose` is false and calls `attemptClose` only if `mainWindow` is non-null. After
the window is gone, no branch can set `allowClose` back to true. Reproduced with the
built app (Playwright, temporary script outside the repo):

```text
ready
window closed, windows= 0
quit result: timeout   (no close within 4 s; process remained alive)
```

**Risk:** Normal macOS lifecycle requires Force Quit; Force Quit can discard the
in-memory canonical document and any unsaved backup rotation. This is a core app
path, so it is S1 regardless of frequency.

**Action:** In `before-quit`, when there is no live window, allow the quit (set the
flag and return) instead of cancelling. Do not reset `allowClose` in `closed` without
also handling a later quit. Add an e2e that closes the window, then quits, and
asserts exit. Effort: **1–2 h** including the test.

### F2 — S2 — Undo is separated, incomplete, and sometimes lossy

**Locations:** `actions.ts:322-348`, `runtime.ts:193-204,1106-1157`,
`packages/core/src/commands.ts:1026,1060-1067,1206-1210,1236-1245`,
`App.tsx:90-96`.

**Evidence:**

- `undoActive` chooses structural undo only when `lastStructuralAt > lastTextAt`.
  `lastTextAt` is refreshed on every editor update and is never reset. After a text
  edit, the structural stack is unreachable through `⌘Z` even after ProseMirror
  history is empty; there is no fallback.
- `block.create` has an inverse, but `block.delete` (`:1060-1067`) and
  `branch.delete` (`:1236-1245`) return `null`. Deleting an existing block or subtree,
  or detaching an existing branch, cannot be undone by the runtime’s stack. The m2e
  report calls this a known gap; it still contradicts spec §5.1/F11 and the M2 gate
  “undo is predictable”.
- `block.move` child→top-level→child undo loses the branch identity. Reproduced
  with the current core bundle: branch before `68fea61e…`, after undo
  `c39eb8f8…`, `same? false`. For M3, anchors and reference edges keyed by branch IDs
  will be silently detached by such an undo.
- `branch.create` from chapter B under a block in chapter A, then its inverse,
  returns the target to **A**, not B (`chapters [1,0]` after attach; `[2,0]` after
  inverse; target top-level in A). It also leaves B empty.
- `dispatch` drops any menu command repeated within 120 ms. This was intended to
  dedupe native-menu + renderer keydown delivery, but it also drops a second fast
  `⌘Z`, redo, zoom step, or close-tab.

**Risk:** A core acceptance criterion is unmet, destructive actions are not
recoverable, and M2 undo can break M3 anchor bindings.

**Action:** Define one undo policy and test it as a sequence, not only as two
isolated commands. Route to ProseMirror only when it actually has history, then fall
back to the app stack. Either add inverses for delete/detach or use a small snapshot
ring for destructive commands. Preserve branch IDs and original chapter placement in
move/branch inverses. Remove the time-based dedupe for undo/redo (or dedupe by
delivery source/event, not by action). Effort: **1.5–2 days** including tests.

### F3 — S2 — Corrupt/missing/newer documents are invisible, not read-only

**Locations:** `apps/desktop/src/main/library.ts:106-129,168-190`;
`renderer/src/actions.ts:57-79`; `DocumentEditor.tsx:315-320`.

**Evidence:** `scanLibrary` catches parse failure and `continue`s, so a corrupt
document disappears from the library. `openStore` returns
`{ error: 'The document could not be opened.' }` when `snapshot` is null; `openPath`
shows a toast and does not open a tab. `DocumentStore` has a read-only mode and
`recovery.ts` exposes `findNewestValidRecovery`/`restoreCandidateToPackage`, but no
renderer path uses them. `openDocument` also returns an error for newer schema and
missing files, so the `MissingDocument` component is only reachable for restored
session tabs, not for a fresh open.

**Risk:** A user cannot inspect, repair, or recover a damaged note; the existing
backup system is effectively unreachable. This is an explicit shell/spec behavior
gap and a real study-data risk.

**Action:** List unreadable packages with their reason instead of hiding them. Open a
read-only error surface that shows the path, parse/validation reason, backup list,
“Reveal in Finder”, and explicit “Restore newest valid backup”. Never overwrite until
the user confirms. Add an app-level test with a truncated `document.json` and a
newer-schema file. Effort: **1–1.5 days**.

### F4 — S2 — Flush/close can report success without proof; save failure has no recovery

**Locations:** `main/index.ts:88-107,109-169`; `preload/index.ts:43-53`;
`App.tsx:100-103`; `runtime.ts:258-281`; `store.ts:329-363`.

**Evidence:** `requestRendererFlush` resolves on a 2.5 s timeout and
`attemptClose` treats that exactly like an acknowledged flush. The preload wrapper
`.catch(() => undefined).finally(send flush-done)` acknowledges even when the renderer
handler failed. `onRequestFlush` uses `Promise.allSettled` and ignores rejected
document commits. `saveNow` then calls `store.save`; if it fails, the status bar
shows “Save failed” (tooltip carries the message) but the 800 ms autosave is not
rescheduled, and there is no “reload from disk / overwrite / save a copy / restore
backup” action. The `external-modification` case is permanently unsavable from the
UI until the tab is closed and reopened.

Separately, `saveNowInternal` sets `dirty = false`/`saved` after its awaited save;
edits arriving during the save are committed on the next 220 ms timer, so the status
can briefly claim “Saved” while a pending commit exists. The queued commit normally
wins before quit, but the status is misleading.

**Risk:** Last keystrokes can be lost on a slow/hung renderer; a failed save has no
recovery path; the user may believe a document is saved when it is not.

**Action:** Make flush return a typed result (`ok`, `error`, `timeout`) and never
close/quit on `timeout` without a user decision. Send the actual error back from
preload. On save failure, offer recovery actions and reschedule with backoff. Test a
read-only document, an externally modified file, and a forced flush failure. Effort:
**0.5–1 day**.

### F5 — S2 — Keyboard trap in the editor; card controls unreachable

**Locations:** `editor/keymap.ts:124-145`; `BlockViews.tsx:253-313`;
`App.tsx:113-124`.

**Evidence:** Both `Tab` handlers return `true` for `selection === null` or a missing
binding, which includes the normal caret-in-paragraph case. The browser therefore
never performs focus traversal. The `+`, collapse, drag, and branch-port controls are
real buttons, but a keyboard-only user cannot Tab to them from the editor; they must
know `⌃Enter`/`⌥Enter`/`⌘.` or press `Esc` first. The `Esc` exit is implemented
(`Escape: () => this.editor.commands.blur()`) but is not shown in the UI. `Ctrl+Tab`
cycling is unreachable because `const mod = event.metaKey || event.ctrlKey` makes the
inner `!mod` branch dead.

**Risk:** WCAG 2.1.2 keyboard trap; the shell is specified as keyboard-first, and
axe cannot detect this class of defect. The human VoiceOver/keyboard gate has not
been run.

**Action:** Return `false` when no structural action applies, so Tab moves focus out
of the editor; add a visible focus-order path for the card controls (or a documented
keyboard mode), fix/remove the `Ctrl+Tab` branch, and add an e2e that tabs from the
editor to the sidebar/tab bar/status and activates `+`/collapse without a mouse.
Effort: **0.5 day**.

### F6 — S2 — Empty chapters can be created and become unreachable in the canvas

**Locations:** `packages/core/src/commands.ts:904` (empty chapter allowed);
`:661-668` (`block.move` can remove the last top-level block); `adapter.ts:124-128`
(empty chapters omitted from the editor document); `extensions.ts:26-28`
(`chapter content: 'branch+'`); `runtime.ts:174-187` (only the first empty chapter is
seeded); `actions.ts:101-134` (chapter.create then block.create as two commands).

**Evidence:** With two chapters, one block each, `branch.create` moves the second
chapter’s block under the first: canonical chapters become `[1,0]`; the editor
document builder skips the empty chapter. The inverse brings the target back to the
first chapter (`[2,0]`), so the second chapter is still empty. The UI `Move to…`
dialog can produce the same state by moving the only top-level block of a chapter
under a block in another chapter. Before reload the empty `ChapterView` still renders
its add row; after reload it is dropped from the ProseMirror document, while the
sidebar still lists it with zero blocks. `ensureChaptersHaveBlocks` only fills the
first empty chapter.

**Risk:** Canonical/editor divergence, a stranded chapter that cannot receive a
top-level block from the canvas, and an invalid ProseMirror `branch+` chapter during
the incremental move transaction. This will become more visible in M3.

**Action:** Choose one invariant and enforce it: reject moving the last top-level
block out of a chapter; or auto-create a placeholder/delete the empty chapter as part
of the same command; or render empty chapters with a valid placeholder and add row.
Make `createChapter` atomic (or clean up on failure). Add a regression test for
move-last-block and for reload. Effort: **0.5–1 day**.

### F7 — S2 — The app auto-breaks stale locks without explicit confirmation

**Locations:** `apps/desktop/src/main/library.ts:180-183`; contrast
`packages/core/src/node/lock.ts:197-209,275-303`.

**Evidence:** `openStore` retries `openDocumentPackage(..., { breakStaleLock: true })`
automatically when the first result is `stale-lock`. The core contract and its tests
require explicit stale-lock recovery. A lock whose heartbeat is merely delayed (long
sleep, heavy load, network home directory) can be stolen, allowing two writers on the
same package.

**Risk:** Two writers can interleave saves and lose data. The single-instance app lock
and the usual local setup reduce the chance, but this is a data-integrity behavior,
not a visual edge case.

**Action:** Return read-only `stale-lock` with a clear banner and a “Take over lock”
action; keep the explicit core path. Add an app-level test for stale-lock open. Effort:
**0.5 day**.

### F8 — S2 — E2E suite misses its 60 s budget (96 s), mostly from fixed sleeps

**Location:** `tests/e2e/m2-editor.test.mjs` (1,540 lines, 13 tests).

**Evidence:** second run: 13/13 pass, **96.0 s** test time (first cold run 103.3 s;
`npm run e2e` wall ~104 s). 76 `page.waitForTimeout` calls total **44.5 s** of fixed
delay, including a 5.6 s session-autosave wait and 700 ms “layout” waits after every
structural action. The file hardcodes `artifacts/m2e-tmp`/`artifacts/m2e`, copies axe
into `out/renderer`, and calls macOS `sips` for 20 screenshots.

**Risk:** Slow feedback encourages merge-after-the-fact review; the budget in the
brief is missed; fixed sleeps are a flake source.

**Action:** Move the performance test and screenshot capture to a separate suite,
replace sleeps with condition waits (arrow count/rect stability/save state), expose a
session flush or short autosave interval under `NOTEFOREST_E2E`, and merge small
flows that already share the demo seed. Target ~50–60 s for the critical suite. Effort:
**0.5–1 day**.

## S3 findings

| ID | Area | Location | Finding / risk | Action | Effort |
|---|---|---|---|---|---|
| F9 | External links | `editor/extensions.ts:136-141`; `main/index.ts:71-79` | Links can be inserted but never opened: `openOnClick: false`, and the window-open handler denies everything. There is no `shell.openExternal` allowlist. | Decide the policy; open only `https:`, `http:`, `mailto:` through `shell.openExternal` after a user gesture; keep `javascript:`/`file:` blocked; add a test. | 2–4 h |
| F10 | IPC/path/CSP | `library.ts:67-71`; `main/index.ts:235-237`; `index.html:5-10`; `App.tsx:241-321` | `document:reveal` lacks the library check; `startsWith` validation does not resolve symlinks; CSP allows any `ws:` host and all `localhost:*` in production; `window.__noteforestTest`, `window.__nfPerf`, `debugSeed`, and `benchmarkFullReflow` ship unconditionally (seed IPC itself is guarded by env). | Validate reveal with `isInsideLibrary` + `realpath`; tighten production `connect-src`; gate debug/perf hooks behind dev/E2E; remove dead `onRequestFocusBlock`/`flush` menu plumbing. | 0.5 day |
| F11 | Data path/perf | `shared/api.ts:92-100`; `library.ts:238-246`; `runtime.ts:225-249,330-354` | Every 220 ms text commit sends a **full document** over IPC and calls `editor.getJSON()`/hashes every block; `recomputeHashes` stringifies every block on each structural command; `applyStructural` reconciles twice after a rebuild. 1,000-block initial render is 1.36 s; typing at 1,000 was not measured. | Return affected block content + revision (or a diff) from `block.editContent`; walk `blockBody` nodes instead of `getJSON()`; track dirty block IDs; index parent→children once per version; remove the duplicate reconcile. | 1–2 days (measure first) |
| F12 | Duplication/dead code | `lib/tree.ts` vs `packages/core/src/structure.ts`; `shell.ts:69,209-212`; `bindings.ts:13`; `useBlockRects.ts:140-148`; `EdgeLayer.tsx:197`; `actions.ts:703-712`; `ContextMenu.tsx:33-34`; `library.ts:238-246`; `App.tsx:113-124` | Renderer reimplements core structural helpers (drift risk for M3); `selectedBlockByDoc` is written but never read; unused exports/functions: `openBlockActions`, `useContentReady`, `EDGE_CONSTANTS`, `recordActiveScroll`, `applyDocumentCommand`, `removeTab`, `ConfirmChoice`, `onRequestFocusBlock`, `history.ts` (used only by tests), `packages/pdf/src/atomicFile.ts` (duplicate atomic write, unused). | Delete the dead exports and `selectedBlockByDoc`; import core structure helpers or keep one documented renderer selector layer; remove the duplicate atomic file; decide `history.ts` adopt-or-remove. | 0.5 day |
| F13 | Docs | `README.md:20-22,50`; `AGENTS.md:157,169`; `docs/plan.md:33,60,111,124`; `docs/ux-shell.md:97-98`; `docs/adr/0004-ui-shell-and-branch-editor.md` body; `docs/definition-of-done.md` phase note; `docs/reports/m2d-depth-columns.md` | README `npm run dev` does not exist at the root; links M2b/artifacts instead of M2e; stack still lists CodeMirror 6/React Flow (not dependencies). AGENTS says `apps/desktop` is “Spike 1: demo shell only” and core/api are “scaffolded later”. Plan still says M2b merged and has three “(current)” sections. `ux-shell.md:98` still says the editor uses depth columns. ADR body still says Source Serif/Cmd+Enter/Tab-create. DoD says spec v0.4.1. The m2d report lacks a “superseded by M2e/D23” banner. | One docs consistency task: update status/commands/stack, mark the old ADR/plan sections superseded, add the M2d banner, refresh DoD phase note. | 2–4 h |
| F14 | Stale Spike tooling/fixtures | `package.json:20-24`; `scripts/run-gates.mjs` (lines 88-110, 214-233); `fixtures/*.json`; `scripts/generate-fixtures.mjs` | `npm run gates` targets the removed Spike 1 demo API (`window.__noteforest.loadFixture/exportPdf/getPageViewGeometry`); README already says the harness is not part of the M2 gate, but the script is still exposed. The three inspected fixtures (`golden-eigenvalues`, `long-50-pages`, `scale-300`) fail current core validation: their anchors have no `selector` (`anchors.a1.selector must be an object`); the generator also omits `selector`. | Mark `gates`/`gates:summary` as Spike-only and remove from the default workflow, or rewrite/delete them; fix the fixture anchor shape before M3/M4; update the generator and add a fixture-validity test. | 0.5–1 day |
| F15 | Dependencies | `apps/desktop/package.json:20,30-33,41-42`; `package-lock.json` | Six unused direct dependencies: `@tiptap/extension-bubble-menu`, `class-variance-authority`, `clsx`, `highlight.js`, `tailwind-merge`, `tw-animate-css`. KaTeX is installed twice (direct `0.18.10`, transitive `0.18.11`); npm warns 0.18.11 was accidentally published with breaking changes and recommends 0.19.0. Root and `packages/pdf` both depend on `pdfjs-dist`; `@types/katex` is only needed if KaTeX is imported directly. | Remove unused deps; pin a single KaTeX version (evaluate 0.19.0 with the math extension) and dedupe; dedupe pdfjs; rebuild and record bundle size. | 2–4 h |
| F16 | Accessibility/coverage | `tests/e2e/m2-editor.test.mjs:583-640`; `StatusBar.tsx:50-55`; `ContextMenu.tsx:36-50`; `TabBar.tsx:66-78` | Axe runs only `wcag2a/aa/21a/21aa` and only fails on serious/critical; save-state changes are not a live region; context menu has no focus trap; tab close is `aria-hidden` + `tabIndex=-1` (Delete on the tab is the only close path). No keyboard-only/VoiceOver evidence. | Add `aria-live` for save state; trap focus in the context menu; expose an accessible close affordance; run axe with best-practice tags as a non-blocking report; schedule the manual VoiceOver/keyboard pass. | 0.5 day |
| F17 | E2E coverage gaps | `tests/e2e/m2-editor.test.mjs` | No app-level tests for: corrupt/missing/newer document, read-only lock banner, save failure/external modification, close/quit prompt, structural undo/redo, branch identity after move, empty chapter after reload, link/math dialogs, tree keyboard focus. | Add the highest-value five: corrupt read-only, save failure, quit/close prompt, undo sequence, empty chapter. Keep them small and in the critical suite where they guard data. | 0.5–1 day |
| F18 | Performance hygiene | `lib/perf.ts:10-20`; `App.tsx:230-232`; `state/session.ts`; `shell/Sidebar.tsx:175-355`; `DocumentEditor` mapping in `Workspace.tsx:80-92`; `useBlockRects.ts:86-115` | Perf arrays/`window.__nfPerf` always on; session writes every 5 s plus 600 ms debounce; recent manifest rewritten on every autosave; `recordScroll` never deletes closed docs; sidebar renders all 1,000 tree rows on each runtime `seq`; all open tabs keep full editors mounted; `observer.observe` is called for every card on every measure. | Gate perf instrumentation; session write only on change; recent manifest throttle; prune scroll map; memoize sidebar rows or subscribe to selected ID; consider unmounting inactive editors after flushing; observe once per card. | 0.5–1 day |
| F19 | Build/quality gates | `package.json` scripts; build output | Build succeeds but emits `MODULE_LEVEL_DIRECTIVE` warnings from `sonner`, `@tiptap/react`, `react-resizable-panels`; bundle is 3.49 MB JS (lowlight `common` registers many languages); no lint/format script despite DoD; no CI config; `engines` missing. | Decide whether dependency warnings are acceptable; prune lowlight languages to used set; add lint/format or explicitly scope them out; add CI budget check for `npm test`/`npm run e2e`. | 0.5–1 day |

## Repro notes for the S2 undo findings

These were run with a temporary script outside the repository, using the current
`packages/core` source bundled locally; no product files were modified.

```text
child -> top-level -> child:
  branch before 68fea61e-e6ec-4455-a20b-157e251f81fe
  after undo    c39eb8f8-a74c-43f4-9e52-80ddf550b0b8
  same? false

branch.create from chapter B under a block in chapter A, then inverse:
  chapters after attach  [1, 0]
  chapters after inverse [2, 0]
  target top-level in [A, B]? [true, false]
```

The first proves branch identity is not preserved by a move inverse; the second
proves cross-chapter placement is not restored.

## Test inventory

### Unit tests — `npm test`

**Result:** 144/144 passed, 14 files, **1.40 s** test time, 2.50 s wall including
Vitest startup. Target `< 3 s`: **met**.

| File | Tests | Duration | Class | Notes |
|---|---:|---:|---|---|
| `packages/core/test/storage.test.ts` | 17 | 1,213 ms | keep | Atomic failure, in-flight save, external modification, backup rotation/recovery, lock, 300-block save/reopen. Keep all; this is the data-safety gate. The 300-block case is 212 ms and stays under budget. |
| `packages/layout/test/layout.test.ts` | 7 | 75 ms | keep | M4 foundation; 300-block non-overlap. Fast enough to keep in unit. |
| `packages/layout/test/pagination.test.ts` | 7 | 39 ms | keep | Spike 1 pagination/table/anchor gates; M4 foundation. |
| `packages/core/test/model.test.ts` | 24 | 20 ms | keep | Factory, fractional order, validation invariants, unknown data. |
| `packages/core/test/commands.test.ts` | 29 | 18 ms | keep | Command contract, created IDs, cycles, inverse tests. Add the missing move/branch inverse cases. |
| `packages/core/test/serialize.test.ts` | 10 | 8 ms | keep | Canonical JSON, newer schema, round-trip. |
| `apps/desktop/test/edge-routing.test.ts` | 16 | 6 ms | keep | Fixed arrowhead, stem, trunk, wrap reference, defects. |
| `apps/desktop/test/placement.test.ts` | 6 | 4 ms | keep | Parent-relative placement/fit. |
| `apps/desktop/test/serial-queue.test.ts` | 3 | 3 ms | keep | Desync gate. |
| `apps/desktop/test/tree.test.ts` | 5 | 2 ms | keep | Reading order/collapse/ports. |
| `apps/desktop/test/geometry.test.ts` | 5 | 2 ms | merge candidate | Small; could merge into placement/edge-routing to reduce file count, but no runtime win. |
| `apps/desktop/test/adapter.test.ts` | 5 | 2 ms | keep | Core↔ProseMirror boundary. |
| `apps/desktop/test/backspace.test.ts` | 6 | 1 ms | keep | Non-destructive Backspace contract. |
| `apps/desktop/test/chapters.test.ts` | 4 | 1 ms | merge candidate | Pure helper; merge into tree tests if file count matters. |

**Do not remove:** `storage.test.ts`, `commands.test.ts`, `serial-queue.test.ts`,
`edge-routing.test.ts`, `placement.test.ts`, `adapter.test.ts`, `backspace.test.ts`,
`layout.test.ts`, `pagination.test.ts`. These cover persistence, desync, arrows,
layout, and keyboard contracts that are the M2 gates.

### E2E — `npm run e2e`

**Result:** 13/13 passed twice. **96.0 s** test time (second run), 103.3 s (first cold
run), ~104 s wall including build. Target `< 60 s`: **not met**.

| # | Test | Duration | Class | Cleanup |
|---:|---|---:|---|---|
| 1 | creates documents, edits blocks, branches, reparents, reorders and restores | 12.2 s | keep | Critical lifecycle + branch flow. Trim sleeps; do not delete. |
| 2 | keeps the arrow invariant for the demo tree and supports collapse | 2.9 s | keep | Critical arrows/collapse. Merge #9 into this flow to save a relaunch. |
| 3 | restores per-tab scroll and focus after relaunch | 9.1 s | keep | Session gate. Replace 5.6 s autosave wait with a flush/interval override. |
| 4 | opens the command palette, tree, and dialogs accessibly | 2.2 s | keep | Axe gate; add keyboard-only assertions. |
| 5 | measures the 300-block editor and the 1,000-block collapse report | 11.3 s | **move-to-nightly** | Performance report, not a correctness gate. `tests/perf/`. |
| 6 | serializes rapid structural creation and keeps canvas, sidebar and arrows in parity | 7.4 s | keep | The desync regression. Never remove. |
| 7 | applies the M2c keyboard, heading, chapter and landscape model | 5.5 s | keep | Keyboard gate. |
| 8 | places children parent-relative and scrolls horizontally for deep branches | 10.0 s | keep | Layout gate; move screenshots to visual suite. |
| 9 | swaps the add-child and collapse controls without changing card height | 3.6 s | merge | Merge with #2 (same demo seed/app launch). |
| 10 | zooms, fits width, and focuses a branch without touching the document | 9.3 s | keep | Navigation gate; move screenshots to visual suite. |
| 11 | keeps the trunk continuous and Backspace non-destructive | 6.0 s | keep | Split: trunk checks with #2, Backspace checks with #7 if that reduces launches. |
| 12 | adds top-level blocks to the selected chapter and chapters after the active one | 4.2 s | keep | Chapter authoring gate. |
| 13 | captures the required screenshots | 12.3 s | **move-to-nightly** | Visual evidence, not a pass/fail correctness gate. `tests/visual/`. |

**After cleanup:** moving #5 and #13 removes ~23.5 s; replacing fixed sleeps and
merging #9/#2/#11 should remove ~15–25 s more. The critical suite should land around
50–60 s. Keep the screenshots available for UI tasks via a separate command, not
deleted.

**What must not be moved/removed:** #1, #2, #3, #4, #6, #7, #8, #10, #11, #12;
unit storage/commands/serial-queue/edge-routing/placement/adapter/backspace; the
layout/paginator tests until M4 accepts the new page pipeline; the fixtures and
`docs/spikes/artifacts` evidence until M4; the M4 wrapped-router tests (currently
unused by the editor but deliberate); the hardening/validation/backup/lock tests.

### Missing tests to add (highest value)

1. Corrupt `document.json` → read-only recovery surface; newer schema → read-only.
2. Save failure (read-only file, external modification) and quit/close prompt.
3. Undo sequence: add child → type → `⌘Z` → structural undo still reachable; delete
   block → undo; detach branch → undo; move child to top level → undo preserves the
   branch ID.
4. Empty chapter: move the only block out, reload, add a top-level block back.
5. Keyboard: `Tab` exits the editor; a card `+`/collapse is reachable and activates.
6. Close the last window, then quit (the S1 regression).

## Cleanup backlog (ordered, Builder-executable)

Estimates are for one implementer including tests; they assume the current
single-Builder cadence.

### 1. Fix now (before M3)

| Order | Task | Findings | Scope | Effort |
|---:|---|---|---|---|
| 1 | Quit lifecycle | F1 | `before-quit`/`closed`; e2e close-window-then-quit | 1–2 h |
| 2 | Flush/close contract | F4 | typed flush result; no close on timeout; error recovery; tests | 4–8 h |
| 3 | Undo model | F2 | route/fallback; inverses or snapshot for destructive commands; branch identity/chapter placement; dedupe; tests | 1.5–2 d |
| 4 | Corrupt/read-only + recovery | F3 | library listing, error tab, backup restore dialog; tests | 1–1.5 d |
| 5 | Keyboard focus + card controls | F5, F16 | Tab exits, focus order, Ctrl+Tab, axe scope, keyboard e2e | 4–8 h |
| 6 | Empty-chapter invariant | F6 | command invariant + editor rendering + test | 4–8 h |
| 7 | Stale-lock consent | F7 | read-only banner + take-over action; app test | 4 h |
| 8 | E2E budget | F8 | split perf/visual, replace sleeps, stable waits, one suite per flow | 4–8 h |

### 2. Delete now (safe, small)

- `useContentReady` (`useBlockRects.ts:140-148`), `EDGE_CONSTANTS`
  (`EdgeLayer.tsx:197`), `recordActiveScroll` and `applyDocumentCommand`
  (`actions.ts:703-712`), `openBlockActions` (`bindings.ts:13` + assignment),
  `removeTab` (`shell.ts:76,142-149`), the no-op `current/snapshot` in
  `library.ts:238-246`, `ContextMenu.tsx:33-34`, `ConfirmChoice`, the dead
  `onRequestFocusBlock` bridge, and `packages/pdf/src/atomicFile.ts` if nothing in
  the PDF package uses it.
- `selectedBlockByDoc`/`setSelectedBlock` if no reader is added (currently write-only);
  prefer `runtime.selectedBlockId` as the single source.
- Unused direct dependencies from F15.
- Do **not** delete `history.ts` until the undo decision is made; it is currently
  dead in the app but used by core tests. Decide adopt-or-remove with F2.

### 3. Refactor / correctness follow-ups

- Single structural-helper layer: import `directChildBranches`, `primaryParentBranch`,
  `findTopLevelPlacement`, `subtreeBlockIds`, `chapterIdForBlock` from
  `packages/core/src/structure.ts` in the renderer, or document why the renderer
  needs a separate copy. (F12)
- Replace full-document IPC/`getJSON()`/hash-all with affected-block patches; index
  children per document version; remove the double reconcile. Measure at 300/1,000
  before and after. (F11)
- Save error recovery: external-modification dialog with “Reload from disk”, “Save a
  copy”, “Restore backup”, and “Overwrite” (explicit). (F4)
- External-link policy (`shell.openExternal` allowlist). (F9)
- IPC path validation (`realpath`, reveal check), production CSP, dev-only debug/perf
  hooks. (F10)
- Remove the dependency build warnings or record them as accepted. (F19)

### 4. Test cleanup

- Move e2e #5 to `tests/perf/m2-performance.test.mjs`; move #13 and the screenshot
  steps in #4/#8/#10 to `tests/visual/m2-screenshots.test.mjs`.
- Replace `waitForTimeout` with condition waits; remove the 5.6 s session wait by
  adding a test-only flush/interval, not by deleting restore coverage.
- Merge #9 into #2 and split #11’s trunk/Backspace coverage into #2/#7.
- Make `artifacts/` roots configurable (`NOTEFOREST_ARTIFACTS`) and guard/replace
  macOS-only `sips`.
- Add the five tests in “Missing tests” above; keep them in the critical suite when
  they guard data.
- Keep `npm test` under 3 s; if storage backup rotation grows, split only the slow
  cases, not the atomic/external/lock coverage.

### 5. Docs cleanup

- README: fix `npm run dev`; link M2e report/artifacts; remove CodeMirror/React Flow
  from the current stack paragraph; state the Spike harness status.
- AGENTS repo layout: `apps/desktop` is the editor shell, `packages/core` exists,
  `packages/api` is not scaffolded yet.
- Plan: update M2 status, remove the three “(current)” labels, refresh the M2 gate
  (undo is not fully met).
- `ux-shell.md:97-98`: replace depth columns with parent-relative placement (D23).
- ADR-0004 body: mark Source Serif, Cmd+Enter/Tab-create, and flex-wrap details as
  superseded by the addenda (or add a one-line “body superseded by addenda” banner).
- DoD/checklist: phase note v0.4.1 → v0.4.4; align the review status.
- `docs/reports/m2d-depth-columns.md`: add “Superseded by M2e (D23)” at the top.
- Fixtures: restore the `selector` object on anchors or regenerate them with the
  current schema; add a test that every fixture passes `parseDocumentJson`. (F14)

### 6. Dependency cleanup

- Remove the six unused deps; remove `@types/katex` if KaTeX is only used via CSS.
- Pin one KaTeX version; evaluate 0.19.0 against `@tiptap/extension-mathematics`.
- Deduplicate `pdfjs-dist` between root scripts and `packages/pdf`.
- Prune lowlight to the languages actually offered, or accept the 3.49 MB bundle and
  record it as a release concern.
- Re-run `npm ci`, typecheck, unit, and e2e after the prune.

## What must not be removed

- **Persistence/data safety:** atomic save tests, in-flight save, external
  modification, backup rotation/recovery, lock/stale-lock, read-only, typed failures.
- **Command model:** created-ID tests, cycle rejection, inverse tests, unknown-field
  preservation, serialization/newer-schema tests.
- **Desync gate:** rapid creation parity e2e and serial-queue tests.
- **Arrows/layout:** edge-routing, geometry, placement, trunk continuity, fixed
  arrowhead, Backspace keyboard contract, 300/1,000-block measurements.
- **Accessibility:** axe smoke, focus/zoom checks, React Aria shell, keyboard
  shortcuts; the manual VoiceOver/keyboard gate.
- **M4 foundation:** layout/paginator tests, fixtures, Spike 1 evidence, the wrapped
  below/bus router and its tests, `docs/design/edge-routing-lab.html`.
- **Security:** context isolation, sandbox, CSP, denied navigation/permissions,
  library path check, lock/backup logic.
- **Screenshots:** move the suite, do not delete it; screenshots are required UI
  evidence for the product owner.

## Process notes

**Current pattern.** M2d landed as a 1,812-line commit (including a 291-line report);
M2e then deleted the M2d depth-column code (`columns.ts`, `columns.test.ts`) and
landed 1,284 lines across 20 files. That is a full layout model built and reverted
within two milestones. The e2e file grew to 1,540 lines and 96 s, and M2e was merged
before this independent review. The Builder is doing too much per task, and review
happens too late to prevent rework.

**Recommendation.**

- **Task size:** one behavior per task, roughly ≤300–400 changed lines including
  tests. Stop for review after each; do not batch layout + shell + tests + report.
- **Module ownership:** core/persistence (freeze the command API and require inverse
  tests), editor runtime/reconciliation (queue, save, undo), pure layout/routing
  (geometry only, design lab before implementation), shell/a11y (keyboard/focus/axe),
  docs/test infrastructure. One owner per module avoids the runtime/actions hot-file
  collisions.
- **Gate order:** design/lab → screenshot or geometry approval → implementation →
  independent review → merge. The M2e routing lab is the good example; M2d→M2e is
  the counterexample.
- **Budgets:** enforce unit `<3 s` and critical e2e `<60 s` in the task brief; move
  perf/visual to on-demand/nightly suites.
- **Definition of ready:** every layout/visual task names the chosen variant and the
  screenshot states before code. Every persistence/undo task names the failure and
  inverse cases before code.

**YAGNI / Ponytail lens.** A dead-code/dependency pass would help most on unused
exports, debug hooks, stale Spike scripts, duplicate atomic write, unused deps, and
`selectedBlockByDoc`. It would hurt if applied to the M4 wrapped router, fixtures and
spike evidence, validation/backup/lock code, or the keyboard/accessibility paths —
those look like “unused” code until the next milestone, but they are the contract.
Do not run Ponytail here; use the lens as a review checklist, not a deletion mandate.

## Commands run

Environment: macOS, Node 22.23.1, worktree as above; `npm ci` from the lockfile.

| Command | Result | Duration |
|---|---|---|
| `npm ci` | 204 packages, 0 vulnerabilities | 2 s |
| `npm run typecheck` | clean (desktop node/web, core, layout, pdf) | 3.5 s |
| `npx vitest run --reporter=json` | 144/144 passed, 14 files | 1.40 s tests / 2.50 s wall |
| `npm run build` | succeeded; 3.49 MB JS, 97 kB CSS; dependency `use client` warnings | 0.65 s warm |
| `npm run e2e` (twice) | 13/13 passed both runs | 96.0 s / 103.3 s suite; ~104 s wall |
| `npm audit --omit=dev` | 0 vulnerabilities | — |
| `git ls-files` | 178 files, 6.3 MB tracked | — |
| Temporary core benchmark | 300 blocks: validate 0.33 ms, edit 1.13 ms; `buildEditorDocument` 5.6 ms (300) / 7.7 ms (1,000) | — |
| Temporary inverse repro | branch ID changed on move undo; cross-chapter inverse wrong | — |
| Temporary quit repro | quit did not complete after window close (4 s timeout) | — |

Not run: `npm run gates` / `gates:summary` (stale Spike 1 harness, static
inspection only); `npm run pdf:verify` / `pdf:raster`; interactive
`npm run start`/`npm run dev`; packaged/release build; Windows/Linux; real 1,000-block
typing benchmark; VoiceOver. No screen recording or Notability.

## Evidence and artifacts

- E2E generated 20 screenshots and `performance.json` under the gitignored
  `artifacts/m2e/` (2.6 MB): shell at 1440/1024, four-level chain, deep scroll,
  controls, collapse dot, arrows, trunk, focus, fit, zoom 200, empty, palette,
  selected path, two tabs, chapter inline, density.
- Current run performance: 300-block initial **310 ms**, 1,000-block initial
  **1,359 ms**, 799 visible cards after collapse; measure p95 2.6 ms.
- Axe: 0 serious/critical at shell, command palette, topic tree, and delete dialog;
  the 200% page-zoom check is a separate layout assertion, not an axe run.
- Screenshots were generated by the suite; I did **not** judge their visual quality.
  That remains the product owner’s gate.

## Remaining human gates

1. Product-owner visual review of M2e at 1440×900, 1024×768, and 200%, plus the
   routing-lab variants.
2. VoiceOver/keyboard-only pass (including the Tab-trap fix).
3. Subjective “calm, Obsidian-like, no AI slop” judgement.
4. Real 300/1,000-block typing and memory check on the target machine, if the product
   owner wants a number beyond the render measurement.
5. Screen recording / Notability — product owner only; not performed here.

## What I did not review

- M3 span anchors/reference-edge behavior (not implemented); the fixture anchor-shape
  drift is noted only as M3/M4 readiness.
- Page view, paginator/PDF visuals, `printToPDF`, and the Spike 1 gate re-run.
- External Agent API/MCP (not implemented).
- Packaged/signed build, Windows/Linux, mobile/iPad, sync, telemetry (none exists).
- Every CSS selector for dead rules; I checked the high-risk focus/outline and
  reduced-motion paths only.
- Full security penetration testing; the IPC/path/CSP notes are code-review findings.
- Manual visual judgement of the generated screenshots.
