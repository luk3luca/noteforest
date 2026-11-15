# S2 — Document health in the sidebar + repair modal (implemented)

**Role:** Builder
**Milestone:** S2 (after S1 activity bar)
**Date:** 15 November 2026
**Worktree:** `t3-9fc71314-d425ecb9d73f5152`
**Status:** implemented, verified, one commit, not merged

## Summary

Health is a third sidebar section and the v1 sheet is retired. The activity bar
now hosts **Library / Outline / Health** as one vertical tablist; the Health icon
carries a square needs-repair counter (hidden at 0), and its panel is the audit
report grouped into **Anchors to fix / Unused anchors / Structure / Hidden**
(Anchors to fix open by default, empty groups not rendered, session-persistent
open state, search that filters and auto-expands). Clicking a row opens one
**520 px repair modal** in front of the still-visible report. Confirm applies the
same one undoable command as v1, closes the modal, removes the row and shows the
Undo toast; `Back`/`Esc` walk confirm → issue → close and focus returns to the
row. The status-bar chips, the palette and the block lost-anchor chip all route
to the Health section (the chips and the block chip also select a row and open
its modal).

Part A restores the full-width Settings footer in the expanded card: a 1 px
divider and gear + `Settings` label under both columns. The collapsed 48 px bar
keeps its own divider + gear group, and the bar's group is not rendered while
expanded, so there is exactly one Settings button per state. The gear keeps the
same x and y across the collapse (measured 0 px delta).

## Part A — Settings footer

- The sidebar card is now a column: `.nf-sidebar-main` (bar + content row) then
  `.nf-sidebar-foot`. Expanded, the footer spans the whole card; collapsed, the
  card is exactly the bar and the bar's foot group renders.
- Footer geometry: 1 px `--border-1` divider, `padding: 6px 8px 8px`, a 28 px
  gear slot inset 2 px inside the 8 px padding. That puts the gear centre at
  x 24 and y `H - 22` — identical to the collapsed bar group.
- `⌘,`, the footer button class (`.nf-sidebar-settings`) and focus restore after
  closing Settings are unchanged.

## Part B — Health section

- `SidebarTab` is `'library' | 'outline' | 'health'`; the session reader in
  `main/library.ts` accepts `health` (unknown values still fall back to
  `library`) and the shell store normalizes the same way. `sidebarTab: 'health'`
  survives a relaunch (tested through `shell-session.json`).
- The list is one ARIA `tree`: section headers are level-1 treeitems with
  `aria-expanded`, rows are level-2 treeitems with `aria-selected`; Up/Down/
  Home/End move, Left/Right collapse/expand, Enter opens the modal. Rows are
  30 px headers and 27 px rows, no per-row action, no severity pill, no left
  accent stripe.
- Badge: `counts.needsRepair` in a 13 px square (`radius 2`, tabular number),
  `aria-label` “3 anchors need repair” / “1 anchor needs repair”, absent at 0.
- Summary `3 to fix · 5 issues` (needs-repair total · all rows). All clear shows
  `No issues found` plus the audit information counts; no document shows
  `Open a document to check its anchors.`
- One shared audit path: `shell/useDocumentHealth.ts` caches one report per
  runtime revision and feeds the badge, status bar, list and modal.

## Modal

- 520 px (`nf-dialog-modal-repair`), header kicker `Document health` + category
  + close, body severity word (`Data risk` / `Needs repair` / `Information`),
  kind, quote, `block · chapter`, reason, matching locations and branches,
  footer `Show in note` · `Close` · primary.
- Candidate selection then `Preview repair` shows Before/After with the exact
  command, “one undoable repair”, anchor/branch/target IDs; `Back` returns to
  the issue; `Esc` follows confirm → issue → close; focus returns to the row.
- Read mode keeps the body, `Show in note` and `Close`, disables every mutation
  with the reason, and dims disabled controls. A rejected command keeps the
  modal open and shows the message inside it.
- `Show in note` expands ancestors and selects the block/term in Continuous; in
  Page it goes to the containing page and never changes the layout (an
  unreachable block or an empty chapter has no derived page, so nothing moves).
- Undo toast on every successful repair; `Keep as is` is session-only and stays
  available in Read.

## v1 coverage (design §4)

`lib/document-health-actions.ts` is the single category → action policy, and
`apps/desktop/test/document-health-actions-plan.test.ts` asserts every row of
the table:

| Category | Primary | Body actions | Guidance |
|---|---|---|---|
| Broken / Ambiguous | Preview repair (candidates) or Link to current selection | Link to current selection (when candidates exist), Keep branches remove anchor…, Keep as is, Delete anchor and branches… | — |
| Unlinked mark | Recreate link from selection | Remove mark | stale-ID / selection note |
| Idle anchor | Add a branch… | Remove anchor | “This anchor has no branches.” |
| Unused anchor | — | Delete unused anchor | — |
| Missing target | — | Remove branch… | v1 note |
| Unreachable block | Move to chapter… | Delete block… | — |
| Two primary parents / loop | — | — | v1 no-auto-fix guidance |
| Empty chapter | Add block | Delete chapter… | — |
| Missing block | — | — | v1 refusal note |
| Hidden marker | — | — | — |
| Image anchor (live) | — | Keep branches remove anchor…, Keep as is, Delete anchor and branches… | v1 re-pick follow-up note |

`Show in note` is the frame's constant quiet footer action for every row.
The audit's names are unchanged except the two copy renames from §5
(`orphan-reference` → `Unlinked mark`, `orphan-record` → `Unused anchor`).

**Decision — Missing block:** the §2 section table omits `anchor-block-missing`
(“Missing block”). It is an anchor-attention row with no in-place fix but with
guidance, so it lives in **Anchors to fix**; no category, action or guidance was
dropped and the audit is untouched.

## Retirement

- `shell/DocumentHealthDialog.tsx` (sheet + no-document state) deleted.
- Dialog kind `anchor-health` deleted; `health-issue` replaces it.
- Old sheet CSS removed and replaced by the sidebar + 520 modal block.
- `lib/document-health.ts`, `lib/anchor-health.ts`, the repair commands and the
  audit are kept; no second audit implementation.

## Files changed

New:
- `apps/desktop/src/renderer/src/lib/document-health-sections.ts`
- `apps/desktop/src/renderer/src/lib/document-health-actions.ts`
- `apps/desktop/src/renderer/src/shell/HealthSection.tsx`
- `apps/desktop/src/renderer/src/shell/HealthRepairDialog.tsx`
- `apps/desktop/src/renderer/src/shell/health-focus.ts`
- `apps/desktop/src/renderer/src/shell/useDocumentHealth.ts`
- `apps/desktop/test/document-health-sections.test.ts`
- `apps/desktop/test/document-health-actions-plan.test.ts`
- `docs/reports/document-health-sidebar.md`

Modified:
- `apps/desktop/src/shared/api.ts`, `src/main/library.ts`, `state/shell.ts`
- `shell/Sidebar.tsx`, `shell/StatusBar.tsx`, `shell/Dialogs.tsx`, `actions.ts`,
  `editor/views/BlockViews.tsx`, `App.tsx` (test bridge exposes the health
  session state), `styles.css`
- `apps/desktop/src/renderer/src/lib/document-health.ts` (two copy labels)
- `apps/desktop/test/activity-bar.test.ts`, `session-sidebar.test.ts`
- `tests/support/ui-session.mjs`
- `tests/ui/document-health.test.mjs` (rewritten), `m3-repair.test.mjs`,
  `m3h3-live-health.test.mjs`, `m3c3b2-image-anchors.test.mjs`,
  `m3c3b3-image-integrity.test.mjs`, `library-surface.test.mjs`,
  `v0-shell-frame.test.mjs`, `settings-shell-layout.test.mjs`

Deleted:
- `apps/desktop/src/renderer/src/shell/DocumentHealthDialog.tsx`

## Checks (real timings)

| Command | Result | Time |
|---|---|---|
| `npm run verify:fast` | exit 0: boundaries, typecheck, 150 unit files / 1480 tests, e2e 16/16 | **58.6 s total** (unit ~6.2 s, e2e 45.5 s) |
| `npm run test:ui:shell` | **17/17** suites pass | 108.7 s suites, 109.4 s wall (with build) |
| `node tests/ui/run.mjs --concurrency 4` | **60/60** suites pass, 0 pageErrors | **277.9 s** |
| `node tests/ui/run.mjs --group anchors --concurrency 3` | 14/14 (includes the rewritten suite) | 67.3 s |
| `node tests/ui/run.mjs --group images --concurrency 2` | 4/4 (updated to the modal) | 45.0 s |
| `npx vitest run` | 150 files / 1480 tests | 6.2 s |

Screenshots in `artifacts/document-health/`:
`sections-1440x900.png`, `modal-1440x900.png`, `confirm-1440x900.png`,
`read-only-1440x900.png`, `all-clear-1440x900.png`, `no-document-1440x900.png`,
`badge-nonzero-1440x900.png`, `badge-zero-1440x900.png`.

## Acceptance criteria

| Criterion | Status |
|---|---|
| Expanded full-width Settings footer (divider + label), collapsed bar group, never two, stable icon x | **Pass** — measured in `settings-shell-layout` and `v0-shell-frame` |
| Health third tab with square counter (hidden at 0), accessible label, persisted `sidebarTab` | **Pass** |
| Sections as specified, empty hidden, Anchors to fix open, counts match, search filters/expands | **Pass** |
| Row opens the 520 modal with context; candidates select and preview; Before/After; Back/Esc order | **Pass** |
| Confirm: one undoable command, closes, row leaves, Undo toast, selection valid | **Pass** |
| Every v1 category/action reachable; Read mode disabled with reason; no document and all-clear | **Pass** (policy unit-tested for all 12 categories; UI covers the constructible ones) |
| Status bar, palette and block chip open Health; block chip selects and opens the issue | **Pass** |
| v1 sheet and dialog kind gone; no dead code, no duplicated audit | **Pass** |
| Tests: `verify:fast`, `test:ui:shell`, rewritten suite, screenshots | **Pass** |
| No pageerror; no library/outline/settings/Page regression | **Pass** (full UI 60/60) |

## Open questions / risks

1. **`anchor-block-missing` group** — placed in Anchors to fix because §2
   omitted it; product owner may prefer Structure. No behavior change.
2. **Status info chip** (idle/orphans/structure) has no single anchor, so it
   opens Health with Anchors to fix expanded; the repair chip selects the first
   repair row and opens its modal. The brief's “status chip” maps to the repair
   chip.
3. **Page Show in note** never changes the layout, so an unreachable block or an
   empty chapter has nothing to reveal in Page; the modal just closes. v1 used
   to switch to Continuous.
4. **Narrow window (<820 px)**: entry points expand `sidebarCollapsed`, but the
   Workspace-local narrow override may keep the rail. The modal still opens; the
   section may need one click on the bar. Not covered by a test.
5. **Open sections and selection are session-only** (in-memory, by design).
   Only `sidebarTab` is written to `shell-session.json`.
6. The audit report cache is keyed by `runtime.version` + asset index; the
   report is treated as immutable by all consumers.
7. The filters API in `lib/document-health.ts` remains (unit-tested) but the UI
   no longer renders a filter row, per the design.

## Next step

Orchestrator: integrate the single commit, run the full `npm run verify`, then
the targeted S2 Sentinel. Product owner: visual pass over the footer, the badge
and the 520 modal.
