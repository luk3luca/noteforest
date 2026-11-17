# PP1 — Page position control, and the lock race in `document-lifecycle` — implementation report

**Task:** `docs/tasks/page-polish.md`
**Design:** `docs/design/page-scroll.md` §4 (the approved pager shape)
**Role:** Implementer / Builder
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-fbc4ae21-913f829c59b954b2`
**Branch:** `t3/page-position-pager-lock-race` (from `main` at `e2398e5`, the brief commit)
**Head:** the single commit on this branch; its SHA is in the handoff message (a report cannot
contain the hash of the commit that introduces it)
**Verdict:** all seven acceptance criteria pass. One product defect was found behind the
`document-lifecycle` failure and fixed (see §1.3); no assertion was weakened.

---

## 1. Summary

### 1.1 The pager

The plain `3 / 61` label that opened a dialog is gone. The Toolbar now carries one cluster next to
the zoom:

```
[↑] [↓]  [ 3 ] / 61
```

- **Two 22 px icon buttons** (Chevron up/down at 14 px), no divider between them, gap 2 px — the
  find cluster's shape. `aria-label` `Previous page` / `Next page`; disabled on the first and last
  page and while the page model is still measuring. Up and down, not left and right: the surface
  scrolls vertically.
- **A 40 px bordered field** with tabular figures, holding the page under the viewport centre.
  Clicking it selects the content. Typing is filtered to digits (a paste keeps the digits). `↵`
  jumps, `Esc` restores the page you were on, blur commits like `↵`. Values outside `1..M` clamp
  (both directions), an empty field restores.
- **The label `/ 61`** in `--text-3`, tabular, after the field. A slash, never "of".
- **`role="group" aria-label="Page position"`**, the field `aria-label="Page"`, the total plain
  text (no `aria-live`): the number changes as you scroll, and announcing it would be noise.
- **Remove the dialog.** `PageJumpDialog.tsx` is deleted, the `page-jump` dialog state and the
  `Dialogs.tsx` route with it. Nothing in the shell opens a page dialog any more.
- **Same read, same write.** The page under the centre is read exactly as the old indicator did
  (`currentPage` in the view state) and every movement goes through `goToActivePage`: an open Page
  Edit overlay commits first and the surface owns the scroll. No new scroll logic, no loop: the
  control mirrors the store while it is not being typed in, and a scroll-derived store write never
  scrolls again.
- **The arrows follow the page you asked for.** A click on an arrow blurs the field first, so the
  pending typed page is committed by the blur; the arrow then steps from that request, not from the
  store value the jump has not updated yet (`requested` ref, cleared when the store lands elsewhere,
  e.g. on a scroll). Typing `2` and clicking Next lands on 3 — the double move (4 typed, Next → 2)
  is impossible. Rapid arrow clicks also accumulate instead of reading the same stale store value.

### 1.2 Keyboard

- `⌘↑` / `⌘↓` keep moving page starts through the shell channel (`stepActivePage`). The toolbar
  pager field is the **one documented text-input exception**: `⌘↑`/`⌘↓` inside it move the page
  instead of the caret, because the field only ever holds a page number and the user has just
  jumped there. Every other input, textarea and the Page Edit overlay keep the arrows for the caret.
- **`PageUp` / `PageDown` are untouched**: they are native scroll commands of the page scroll
  region and move one viewport. The page suite now asserts both explicitly (down and back up).

### 1.3 The `document-lifecycle` lock race — what it actually was

The brief's diagnosis (the app still holds the lock verdict) was only half of it. The probe below
was taken with a 25 s delay before `rm(liveLock)` so the failure reproduces every time:

```
PROBE before rm    saveState ["error"]
                   failure  [{ code: "unknown",
                               message: "Another window has this note open. Close it there and try again.",
                               attempt: 120 }]
                   draftId  ["18906ae8-…"]        tab ["draft:18906ae8-…"]
PROBE after retry  saveState ["error"]   (unchanged for 30 s)
                   failure  [{ … same failure, attempt: 120 }]
                   draftError [null]              draftId [null]
                   tab        ["…/materialize-library/untitled"]
```

The **materialization succeeded**: the draft is gone, the package exists, the tab path changed.
What stayed is the save failure recorded while the lock existed. Every content commit against the
draft target goes through `apply` → the main process's lazy materialization → the live lock, and
`DocumentSession.commitContent` records a failure per commit (`attempt: 120`). The backoff
(`2 s, 5 s, 15 s, stop`) was exhausted long before `rm(liveLock)`, so after the successful
materialization nothing scheduled another write: `saveState` stayed `error` with no pending work.
That is why raising `waitSaved` to 30 s could not help, and why the failure depended on how long
the typing/screenshot block took.

Fix, smallest and at the right layer: **a successful draft materialization drops a failure taken
against the draft target.**

- `SaveCoordinator.materializationSucceeded()` clears the stale verdict and, when edits are still
  pending, leaves the document `unsaved` and resumes the autosave. It never claims `saved` for
  content that has not been written, and it schedules nothing when nothing is pending.
- `DocumentRuntime.ensureMaterialized()` calls it when the materialization returns `ok` — the
  package was just written with the canonical content, so a lock/missing-library failure recorded
  against the draft is stale and the shell must not keep a save-failure banner for a written note.
  The automatic `writeDocument` path is untouched: it writes next and sets the state itself.

Test change (no assertion weakened):

- After `rm(liveLock)` the subtest clicks Retry and now **waits for the state the app reports** —
  `draftId === null`, `draftError === null`, no `draft:` tab — instead of relying on a duration,
  asserts the Retry affordance is gone, and only then keeps the original `waitTabPathChange`,
  `waitSaved`, package-count, editor-node, scroll, selection and undo assertions.
- It passes the subtest **three consecutive standalone runs** and inside the runner (§3).

---

## 2. Files changed

### Renderer — shell

- `apps/desktop/src/renderer/src/shell/PagePosition.tsx` — the pager cluster: arrows with end
  disabling, the typed field (digit filter, Enter/Escape/blur, clamps, restore), the `/ M` label,
  the `requested` step bookkeeping, and focus/selection handling. It is a `group`, not a button.
- `apps/desktop/src/renderer/src/shell/PageJumpDialog.tsx` — **removed** with the dialog.
- `apps/desktop/src/renderer/src/shell/Dialogs.tsx` — the `page-jump` route removed.
- `apps/desktop/src/renderer/src/state/shell.ts` — `DialogState` loses `page-jump`.
- `apps/desktop/src/renderer/src/shell/Toolbar.tsx` — doc comment only (pager, not indicator).
- `apps/desktop/src/renderer/src/App.tsx` — `⌘↑`/`⌘↓` allow the pager field (documented exception);
  everything else keeps the caret.
- `apps/desktop/src/renderer/src/styles.css` — toolbar scope only: `.nf-page-position` cluster
  (gap 2, 22 px arrows, 40 px bordered field, `/ M` in `--text-3`). Fixed 11 px sizes; a
  `nf-page-*` rule still never reads the shell UI scale (paper isolation guard stays green).

### Renderer — state (the lock-race fix)

- `apps/desktop/src/renderer/src/state/save-coordinator.ts` — `materializationSucceeded()`.
- `apps/desktop/src/renderer/src/state/runtime.ts` — `ensureMaterialized()` calls it on success.

### Tests

- `tests/ui/page-scroll.test.mjs` — the new pager test (structure, ARIA, no dialog, click-selects,
  digits only, `↵`, `Esc`, blur, clamp high/low, end disabling, arrows, scroll write-back with no
  model run, typed value + arrow steps once) and the four `artifacts/page-polish` screenshots; the
  keys test names the pager and asserts `PageUp` scrolls back; the old `3 / 61` text assertions read
  the field and the total.
- `tests/ui/document-lifecycle.test.mjs` — `waitDraftMaterialized()` (the observable wait) plus the
  "retry affordance is gone" assertion; the failing subtest keeps every original assertion.
- `tests/support/ui-session.mjs` — `gotoPage()` drives the pager field (`fill` + `↵`) instead of the
  dialog.
- `apps/desktop/test/save-coordinator.test.ts` — the stale failure is dropped and the autosave
  resumes; a success with nothing pending schedules no write.
- `apps/desktop/test/draft-runtime.test.ts` — a locked draft save is recorded, the retry materializes
  and clears it, and the next write ends `saved` (the exact UI sequence, without Electron).
- `tests/ui/ui-batch-a.test.mjs`, `tests/ui/v0-shell-frame.test.mjs` — the Toolbar assertion reads
  the pager (`data-page-position-page` + field value + `/ M`) instead of one text node. Stronger,
  not weaker: it checks the field and the label separately.
- `tests/visual/m4b1-page-view.test.mjs`, `tests/visual/m4b1b1-page-edit-overlay.test.mjs`,
  `tests/visual/r1b-page-density.test.mjs`, `tests/visual/r2a-page-arrows.test.mjs` — navigation
  uses the pager field (these are on-demand visual suites, not part of the gate).

### Docs

- `docs/reports/page-polish.md` — this report. No spec, UX, ADR or plan change; no new setting,
  schema or persisted value.

---

## 3. Checks run

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | PASS — desktop (node + web), core, layout, pdf |
| Page group | `node tests/ui/run.mjs --group page --concurrency 2` | PASS — **19/19**, 158.4 s; again 158.7 s on the final build |
| Page suite alone | `node --test tests/ui/page-scroll.test.mjs` | PASS — 8/8, 16.2 s |
| **`document-lifecycle` ×3** | `node --test tests/ui/document-lifecycle.test.mjs` | **PASS 9/9 three times**: 20.31 s, 20.21 s, 20.28 s |
| Shell group (runner path) | `node tests/ui/run.mjs --group shell` | PASS — **23/23**, 148.6 s; `document-lifecycle` ran serially after the pool (20.4 s), before `markdown-file-view` and `vault-library` |
| Unit (new/adjacent) | `npx vitest run save-coordinator draft-runtime appearance-css-guard copy-cd design-tokens-css` | PASS — 63 tests |
| **Fast gate** | `npm run verify:fast` | **PASS — exit 0**: boundaries 282 files, typecheck, **162 unit files / 1661 tests**, **e2e 16/16**, 45.8 s |

No full `npm run verify` (the Orchestrator owns it). All UI runs use the production build, hidden
windows, no native dialogs.

### Screenshots (artifacts, gitignored)

`artifacts/page-polish/` at 1440 × 900, written by the pager test:

- `pager-rest-1440x900.png` — the cluster at rest: `[↑] [↓] [1] / 5`, the up arrow disabled, the
  zoom stepper and the palette button beside it.
- `pager-focused-1440x900.png` — the field focused: accent ring, content selected.
- `pager-first-page-1440x900.png` — page 1 after the `0` clamp, Previous page disabled.
- `pager-last-page-1440x900.png` — the last page after the `999` clamp, Next page disabled.

---

## 4. Acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| The toolbar shows `[↑] [↓] [ 3 ] / 61` on the Page layout; the arrows move one page start and are disabled at the ends | **PASS** | `page-scroll` pager test: `role=group`, `aria-label="Page position"`, `input aria-label="Page"`, total `/ N`, `Prev` disabled at 1, `Next` disabled at M, Next/Prev click lands with the sheet top within 2 px; the first/last screenshots |
| Clicking the number selects it; typing `12` and `↵` reaches page 12; `Esc` leaves the page unchanged; `999` clamps to the last page; an empty value restores | **PASS** | Pager test: `selectionStart 0` / `selectionEnd = value.length`; digits-only filter (`1a2` → `12`); Enter lands on the page start; Escape/Escape-empty keep `data-current-page` and restore the field; `999` → last page, `0` → page 1 |
| `⌘↑`/`⌘↓` and `PageUp`/`PageDown` behave as specified, with `PageUp`/`PageDown` scrolling a viewport | **PASS** | Keys test: `⌘↓`/`⌘↑` land on page starts, `⌘↓` still works from the pager field after a typed jump; `PageDown` and `ArrowDown` scroll the region, `PageUp` scrolls it back; the page model does not run |
| Scrolling still updates the number, with no loop between the scroll and the control | **PASS** | Pager test scrolls the centre into page 3: `data-current-page` 3, field `3`, `data-model-runs` unchanged; PG1's seam-tie test still green |
| No jump dialog remains | **PASS** | `PageJumpDialog.tsx` deleted, `page-jump` gone from `DialogState`/`Dialogs.tsx`; the pager test asserts no `aria-haspopup` and zero `[data-page-jump-*]` nodes |
| `document-lifecycle` passes three consecutive standalone runs and inside the runner, with every assertion unchanged | **PASS** | Three standalone runs (9/9 each) and the shell runner (23/23, serial file 20.4 s); the original `waitSaved`, file, editor-node, scroll, selection, undo, recents and session assertions are untouched; the only new step is the observable materialization wait |
| No regression: seam, zoom states, mount window, Page Edit, find ring, print parity | **PASS** | Full page group 19/19 (`m4b1-page-view`, `page-scroll`, `m4b1b1-page-edit-overlay`, `r2*`, `m4c1`, `m4c2`, `m4c3` gate and packaged export, `m4d2`, `find-bar`, `editor-appearance`) |

---

## 5. Risks and notes

1. **The pager field is a text-input exception for `⌘↑`/`⌘↓`.** This preserves the old contract
   ("the movement keys keep working after a jump") without a blur that would drop focus to the
   body. If the product prefers the strict "text fields keep the caret" rule, the alternative is
   blur-on-Enter and the page suite would move focus to the surface before pressing the keys.
2. **A typed page plus an arrow commits once and steps once.** Typing `2` and clicking Next lands
   on 3, and rapid arrow clicks accumulate; the code documents why (`requested` ref). This is the
   only place where a click "applies" a pending typed value.
3. **The cluster is wider than the old 52 px label** (~112 px). The toolbar is a flex row; the
   `find-bar` minimum-window and cluster assertions are green, and nothing is clipped at the app
   minimum.
4. **Two shell suites and four visual suites were migrated** from the label text to the pager
   structure. None of them used the dialog; the migration is in the same commit and the shell group
   is green. The visual suites were migrated but **not run** (on demand by policy).
5. **The lock-race fix changes save bookkeeping.** `materializationSucceeded()` only drops a failure
   while the draft is dirty (a failure always implies dirty); it never marks a document `saved` with
   unwritten edits, and it schedules nothing when nothing is pending. Covered at the coordinator and
   runtime levels plus the 9-test lifecycle suite.
6. **The measuring state still reads `[–] / –`** — the field is disabled until the first page model
   publishes, as the old label was.
7. **Toolbar order is pager then zoom**, matching the PG1 report and the design's "next to the
   zoom". The screenshots show the final placement.

## 6. Next step

Targeted Sentinel review of this branch (pager component and CSS, dialog removal, the save-coordinator
change and its tests, the migrated assertions), then the product-owner visual/VoiceOver pass over the
pager at rest, focused, and at both ends. After that the remaining known issues in `docs/plan.md`.
