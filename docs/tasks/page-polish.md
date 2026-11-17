# PP1 — Page position control, and the lock race in `document-lifecycle`

**Role:** Builder
**Milestone:** Page polish
**Base:** `main` at launch (the docs commit that adds this brief).
**Worktree:** created by the Orchestrator, branch `t3/page-polish`.
**Timebox:** 2 hours.

## Context

Two known issues recorded on 17 November 2026 (`docs/plan.md`, "Known issues and follow-ups").

1. **The page position is a label, not a control.** PG1 shipped a plain `3 / 61` indicator that opens a
   dialog. The approved design (`docs/design/page-scroll.md` §4) is a pager: two arrows and a typable
   number. A reader navigating a 61-page note must not open a dialog to move one page.
2. **`document-lifecycle` fails intermittently.** The subtest "materializes on the first keystroke" writes
   a live lock, removes it, clicks Retry, and the save then fails with `saveState: 'error'`. Raising
   `waitSaved` to 30 s did not fix it: the app still sees the lock. It passes standalone and fails roughly
   one run in two to three.

## Goal

The toolbar carries a working pager (`[↑] [↓] [ 3 ] / 61`) that moves by page and accepts a typed page,
and `document-lifecycle` stops depending on timing.

## In scope

### 1. The pager

Replace the current indicator (and remove the jump dialog it opens) with one cluster in the toolbar, next
to the zoom:

```
[↑] [↓]  [ 3 ] / 61
```

- Two **22 px icon buttons** — up and down, no divider between them, the same way the find cluster has
  none. `aria-label` `Previous page` / `Next page`; **disabled on the first and last page**.
- A **bordered input**, ~40 px wide, tabular figures, holding the current page. Click selects the content.
  Typing accepts digits only; `↵` jumps; `Esc` restores the page you were on; blur commits like `↵`.
  Values outside `1..M` clamp, empty input restores.
- The label `/ 61` in `--text-3`, tabular, after the input. A slash, not "of": `of` belongs to the find
  count.
- **Up and down, not left and right**: the surface scrolls vertically.
- `⌘↑` / `⌘↓` keep working from the toolbar/global channel. **`PageUp` / `PageDown` must keep their
  ordinary meaning** (scroll one viewport) — do not hijack them.
- ARIA: the cluster is `role="group" aria-label="Page position"`; the input `aria-label="Page"`; the total
  is exposed as text, not as an `aria-live` region (the number changes as you scroll; announcing it every
  time would be noise).
- The control reads the page under the viewport centre exactly as the indicator does today, and writes it
  through the same `currentPage` path. No new scroll logic.

### 2. The `document-lifecycle` lock race

In the failing subtest, after `await rm(liveLock)` the test clicks `[data-draft-retry="true"]` and then
waits for the save. The app can still be holding the lock verdict it took while the file existed.

- Wait **until the app has noticed** the lock is gone before clicking Retry — poll the state the app
  exposes (the draft/blocked state, or the retry affordance), not a duration.
- Do not weaken the assertions: the save must still end `saved`, the file must still be written, and the
  rest of the subtest stays as it is.
- Prove it: run `node --test tests/ui/document-lifecycle.test.mjs` **three times in a row**, green each
  time, and then the full `--group shell` plus the serial file the way the runner does it.

## Out of scope

- The scroll behaviour, the seam, the zoom, the mount window, the Page Edit overlay, the page model.
- The find, the health, the library, the manual breaks.
- Any new setting, schema or persisted value.
- The other known issues in `docs/plan.md`.

## Files

Read: `docs/design/page-scroll.md` §4, `docs/reports/page-scroll.md`, `shell/PagePosition.tsx`,
`shell/PageJumpDialog.tsx`, `shell/Toolbar.tsx`, `page/use-page-status.ts`, `tests/ui/document-lifecycle.test.mjs`
(the failing subtest), `tests/support/harness.mjs`.

Expected to touch: `shell/PagePosition.tsx` (or its replacement), the jump dialog's removal, `Toolbar.tsx`,
`styles.css` (toolbar scope only), `tests/ui/page-scroll.test.mjs`, `tests/ui/document-lifecycle.test.mjs`,
`docs/reports/page-polish.md`.

## Acceptance criteria

- [ ] The toolbar shows `[↑] [↓] [ 3 ] / 61` on the Page layout; the arrows move one page start and are
      disabled at the ends.
- [ ] Clicking the number selects it; typing `12` and `↵` reaches page 12; `Esc` leaves the page unchanged;
      `999` clamps to the last page; an empty value restores.
- [ ] `⌘↑`/`⌘↓` and `PageUp`/`PageDown` behave as specified, with `PageUp`/`PageDown` scrolling a viewport.
- [ ] Scrolling still updates the number, with no loop between the scroll and the control.
- [ ] No jump dialog remains.
- [ ] `document-lifecycle` passes three consecutive standalone runs and inside the runner, with every
      assertion unchanged.
- [ ] No regression: seam, zoom states, mount window, Page Edit, find ring, print parity.

## Tests and evidence

- Targeted: `npx vitest run`, `node tests/ui/run.mjs --group page --concurrency 2`, and the three
  `document-lifecycle` runs.
- End of task: `npm run verify:fast`.
- Screenshots under `artifacts/page-polish/`: the cluster at rest, with the input focused, on page 1
  (prev disabled) and on the last page (next disabled).

## Stop and ask

- if the draft/blocked state is not observable from the test without a new test bridge;
- if `PageUp`/`PageDown` are already bound somewhere in Page;
- if removing the jump dialog breaks a suite outside the page group.

## Report format

Summary, files changed, checks with timings, pass/fail per criterion, risks, next step. One commit; do not
merge.
