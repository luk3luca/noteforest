# M3 Sentinel review — functional closure, product-owner fixes, and design-system audit

- **Reviewer:** Sentinel (independent)
- **Date:** 6 November 2026
- **Worktree:** `/Users/luca/.local/share/opencode/worktree/7b776c/m3-sentinel-review`
- **Branch:** `main` at `bfea350` (detached review worktree; no commits, no merges)
- **Base:** `bfea350` (`merge: M3g6 active shared lead/trunk`)
- **Scope:** M3 acceptance (AC-03–07, 10, 12, 15–22, 54–58), the six product-owner review fixes
  (M3g1–M3g6), the design-token extraction audit, regressions, accessibility evidence, and test
  hygiene. No product code, tests, spec, UX, ADR, or plan changes.
- **Environment:** Apple M5, 24 GB, macOS 26.5.2 (25F84), Node 22.23.1, npm 10.9.8,
  Electron 45.2.1, Playwright 1.64.1, Vitest 5.1.0. Electron windows hidden except where noted.

## Verdict

**Request changes.** M3 is feature-complete for text, formula, and code anchors, reference edges,
repair, and split/merge, and the six product-owner layout fixes are largely reproduced. However,
four S2 code/UX issues block acceptance, and AC-21 is a separate gate-level issue:

1. **View-only placement clears the text undo history.** After a window resize or a content edit
   that flips a direct child from right to below, `⌘Z` no longer undoes the last text edit; it falls
   back to the structural stack and can remove an unrelated block. Reproduced at app level.
2. **AC-55 is not met.** Candidate selection and “Relink to current selection” mutate immediately;
   there is no before/after preview and no explicit Confirm step required by the ratified design.
3. **AC-06 is not met.** The delete confirmation lists descendants but not external reference
   parents/edges; the core removes those references silently.
4. **AC-17 is not met in the live editor.** Deleting anchored text updates the status-bar health
   chip, but the block warning and callout state stay one revision behind; after undo a stale
   “Lost anchor” warning remains until an unrelated click forces a render.

AC-21 (image anchors) is an unmet **Must** and is explicitly blocked on the image/asset pipeline.
M3 cannot be marked accepted against the stated gate without a recorded product-owner deferral, or
the image pipeline plus M3c3b must be built first. That is a product decision, not a Sentinel call.

Two product S3 issues remain: the shared-trunk active state lights up **both** the right and below
trunks when either group has a selected child, and there is no UI to remove an idle anchor. The
design-token and M3g4–M3g6 evidence findings are also S3, but are process/source-of-truth issues
rather than user-facing defects. No S1 was found. M4/PDF remain blocked until M3 is accepted.

## What I ran

| Check | Result |
|---|---|
| `npm ci` from the lockfile | 199 packages, clean install |
| `npm run typecheck` | pass (desktop node/web, core, layout, pdf) |
| `npm test` | **492/492**, 43 files, **2.07 s** test time |
| `npm run e2e:critical` | **21/21**, **45.44 s** suite, 53.58 s process |
| `npm run test:recovery:run` | **14/14**, **18.61 s** |
| `npm run test:ui` | **28/28**, 11 files, **40.6 s** of test bodies / ~2 min process |
| Full `npm run verify` as one command | **not run**; all of its components were run separately. The Orchestrator owns the single integration run. |
| `test:perf` / `test:visual` | not run (on demand, not the critical gate) |
| Axe | m2-shell scenarios only (shell, palette, tree, delete dialog); no M3 surface |

Independent app probes (temporary scripts outside the repository; no product files changed):

- typed text in a direct child, resized 1440 → 960 so the long child wrapped, then `⌘Z`;
- 1440/960 geometry with two callouts + two direct children, selecting a callout and then a direct
  child and reading both trunk classes;
- created a text anchor and typed before/inside the span;
- deleted the anchored text through the editor, waited for save, inspected the block warning,
  callout state, health chip, and undo;
- closed and reopened a saved document with callouts three times and read `--nf-lane-width` and
  every `--nf-callout-offset`;
- created a nested child of a **wrapped direct child** at 960 and measured the resulting rows.

## Product-owner-fix status

| Fix | Status | Evidence |
|---|---|---|
| M3g1 below-stack trunk inside parent, `trunkInset 12`, `trunkGap 8`, row indent 26 | **Met** | `edge-routing.test.ts`; `m3-anchor-callout.test.mjs:624-800,1103-1216`; measured trunk x = parent.left + 12 and start y = parent.bottom + 8 at 1440/960. |
| M3g1 idle anchors (no underline/dot/marker/callout; undo exact) | **Met visually** | `m3-anchor-callout.test.mjs:1625-1748`; deep-equal anchor/branch/content after undo. Health-chip cleanup of idle records is missing (S3-2). |
| M3g2 lane width 240–480; right group at `max(parent.right, lane.right)+24`; only excess pushes | **Met** | Measured 240 px lane for a 160 px parent, 460 px for the 460 px fixture, 404 px for the wide fixture; right group at +24. `m3-anchor-callout.test.mjs:1293-1471,1473-1623`. |
| M3g2 edge radius 2 px, no wide arcs | **Met** | Router tests parse every `Q` control point ≤ 4 px; `expectNoArc`; UI `assertNearRightAngles`. |
| M3g3 safe right capped by lane and 16 px before group; 160 px cap; wrap when the zone cannot fit 240 | **Met** | `placeCallout` / `calloutSafeRight`; 160 px and 404 px fixtures. Note: with the 24 px group gap the actual callout-to-group gap is ≥ 24 px, so `safeGap 16` is no longer the binding constraint (design note, not a defect). |
| M3g4 callout stacking / hit-test / lane recovery after reload | **Met** | `m3-anchor-callout.test.mjs:802-946`; my 3/3 quit-and-reopen probe kept lane 460 px and offsets 90/160 px with no full-canvas lane. |
| M3g5 10 px lead + 12 px stem; right trunk leaves parent horizontally | **Met** | `m3-anchor-callout.test.mjs:704-725`; 24 px gap budget; trunk starts at parent port. |
| M3g5 nested child of a callout stacks below, no outer-column overlap | **Met for callouts** | `m3-anchor-callout.test.mjs:1015-1101`; nested lane belongs to the callout and starts below it. |
| M3g5 nested child of a **wrapped direct row** stacks below | **Met in probe; no committed test** | At 960 a child of `probe-direct-2` landed in that row’s own lane at x = 52, below the wrapped row, with no overlap. The first placement pass after load can briefly put it right before the second pass forces it below (residual race). |
| M3g6 shared right lead/trunk active for any child in the group | **Partially met** | Selecting the second right child activates the full lead/trunk (`m3-anchor-callout.test.mjs:948-1013`), but selecting a **callout** child also activates the right trunk, and selecting a **direct** child also activates the below trunk (S3-1). |
| Edge gaps/row indents/trunk all move together; no card overflow | **Met** | Geometry assertions and `assertNoOverlap` at 1440/960; 160 px fixture rows stay inside the 240 px lane. |

## M3 acceptance criteria

Status legend: **Met** = behavior and evidence sufficient for the M3 scope; **Met (gap)** =
implementation present but a required app-level/evidence case is missing; **Not met** = behavior
contradicts the AC or is absent; **Partial** = part of the AC is present and part is blocked/deferred.

| AC | Status | Evidence / tests | Notes |
|---|---|---|---|
| **AC-03** one primary parent; second branch reference by default | **Met** | `packages/core/test/reference-edges.test.ts:100` (role-independent dedupe, no second home); `role-transitions.test.ts:168-446`; UI link/reference flows `tests/ui/m3-reference.test.mjs`. | Explicit make-home/move-here remain the only reparent paths. |
| **AC-04** primary cycle rejected; reference cycle allowed and no infinite recursion | **Met** | `reference-edges.test.ts:127`; cycle rejections in `role-transitions.test.ts:265,361`; `export-plan.test.ts:99` reference-cycle neutrality. | Traversal is primary-only. |
| **AC-05** shared child once, one home, see-also, deleting a reference leaves primary structure | **Met (M3 scope)** | `reference-edges.test.ts:155`; UI row-count/see-also/dashed-edge test `m3-reference.test.mjs:231-308`; `buildExportPlan` shared-child test `export-plan.test.ts:99`. | Reader/page/PDF occurrences are M4 renderers; M3 proves editor/outline/manifest once. |
| **AC-06** delete block: promote and subtree work; no dangling branch/anchor; **external references listed** | **Not met** | Core delete modes: `destructive-undo.test.ts:154-270`; delete-subtree with anchors/references. UI delete dialog `Dialogs.tsx:1213-1258` only shows descendants. Design requires listing external refs (`m3-anchors-references.md:875,1375`). | **S2-3.** Core removes every touching reference silently; the confirmation never names the external parents/edges. |
| **AC-07** reparent/outdent/reorder preserve subtree, anchors, outgoing branches; undo | **Met** | `move-undo.test.ts:184-350` (branch/chapter/order identity); e2e move/reparent/undo; move snapshots preserve anchor records. | Moving an anchored child intentionally removes its incoming anchored edge and makes it direct (design §identity table); outgoing anchors on the moved block survive. |
| **AC-10** anchored child callout below anchor, quote visible, deterministic order, adaptive wrap | **Met** | `m3-anchor-callout.test.mjs:624-800` callout-first order, quote chips, left-entry arms; `m3-anchor-outline.test.mjs` anchored-first outline; D3 order in `anchoredChildBranches`. | Pixel alignment best-effort; AC-52/M4. |
| **AC-12** See also / Referenced by visible/navigable; no duplicate content/outline rows | **Met** | `m3-reference.test.mjs:284-308` chips, dashed edge, no extra outline rows; click focuses target; cycle chips. | Chips are an absolute overlay; chip-overlay density remains a known follow-up. |
| **AC-15** multi-block selection rejected with a clear message; no partial anchor | **Met (gap)** | `anchor-selection.ts:210-212` returns `crosses-block`; `DocumentEditor.tsx:248-258` toasts the message; unit coverage for barrier/cell in `apps/desktop/test/anchor-selection.test.ts:77-109`. | No app-level test of a selection crossing a block boundary or of the error copy. Code path is present. |
| **AC-16** text anchor survives edits before/inside/after; highlight tracks | **Met (gap)** | Mark schema `inclusive:false`, one sorted mark; `anchors.test.ts` binding/contiguity; M3b1 e2e create/reload. My probe typed before and inside: mark stayed on the span and extended inside. | No committed before/inside/after e2e; “after” was not cleanly reproduced because the `End` probe left the caret inside the span. This is a test gap, not an observed failure. |
| **AC-17** deleting anchored text keeps branch/target, marks broken, offers repair | **Not met** | Core broken-state tests; health chip updates to broken. Live block warning/callout state does not update (S2-4). `m3-repair` uses prebuilt broken anchors, not an editor deletion. | Status-bar health chip still offers repair, but the anchor/callout itself shows no broken state; after undo a false “Lost anchor” warning appears. |
| **AC-18** split moves anchors, flags spanning anchors, merge moves anchors; identity/one undo | **Met** | `split-merge.test.ts:323-711` (before/after/span, branches, identity, cross-chapter rejection); app split/merge `m3f1-split-merge.test.mjs:93-235` (moved callout, merge back, one undo). | UI does not exercise a spanning anchor; core does. |
| **AC-19** code anchor survives edits outside range; removing quote broken; repair | **Met (gap)** | `anchors.test.ts:753-850` (offset shift, repeated quote, missing quote, language change); core repair `m3e-repair.test.ts:246`; UI create/reload `m3-code-anchor.test.mjs`. | No app-level code edit-outside/remove-quote + repair test; health sheet repairs an ambiguous code candidate. |
| **AC-20** formula term/quote stored; invalid LaTeX keeps data; visual association | **Met (gap)** | `anchors.test.ts:650-745` (term, whole, invalid source, invalid form); UI formula/term create/reload `m3-formula-anchor.test.mjs`, `m3-formula-term.test.mjs`. | Invalid-LaTeX UI error state is not app-tested; KaTeX uses `throwOnError:false`. |
| **AC-21** image region normalized, survives resize, broken on asset replacement, missing-image placeholder | **Not met** | Core image resolution matrix `anchors.test.ts:856-960` (resize, asset change, crop, missing asset, two images). No image insertion/asset rendering or image-anchor UI; no image fixture; `plan.md:277` records M3c3b blocked. | **Product decision required.** See “Product-owner decisions”. |
| **AC-22** health sheet lists broken/ambiguous; relink keeps IDs; repair never deletes target | **Met** | `m3-repair.test.mjs:325-584` health list/filters/candidate repair/attach/delete branch; IDs and targets asserted; core repair `m3e-repair.test.ts:103-347`. | Candidate/relink confirmation itself fails AC-55 (S2-2). |
| **AC-54** formula/code/image resolved/ambiguous/broken after edits and on load; broken never deletes branch/target | **Met (core; UI partial)** | `anchors.test.ts` formula/code/image matrices; reloads in UI code/formula tests; broken target survives health actions. | Image is core-only. Live inline warning freshness is stale for text (S2-4); formula/code likely share the same render path and are not separately probed. |
| **AC-55** ambiguous reattachment requires explicit confirmation with before/after; relink keeps IDs and undo | **Not met** | `Dialogs.tsx:788-814` candidate click applies immediately; `:816-829` relink applies immediately. Design `m3-anchors-references.md:1510-1526,1548-1550` requires preview then Confirm. UI test `m3-repair.test.mjs:410-440` asserts immediate apply. | IDs/undo do survive; the confirmation/preview requirement does not. **S2-2.** |
| **AC-56** broken/ambiguous branch exports exactly once with marker; M4 PDF evidence deferred | **Met (M3 manifest)** | `buildExportPlan` tests `export-plan.test.ts:53-236`: D3 order, exactly-once, shared child at primary home, reference neutrality, broken/ambiguous markers without duplicate targets, determinism, empty chapter. | M4 owns PDF marker/page evidence per OD-5. |
| **AC-57** fixture matrix covers formula-term edits, code edits inside/outside, image resize/replacement/missing | **Partial** | `fixtures.test.ts:118-186`; `m3-anchor-kinds.json` covers text, whole formula, formula term, code range, broken/ambiguous, references; unit tests cover code shifts and missing quote. | No image fixture; no formula-term edit fixture; the required image matrix is blocked with AC-21. |
| **AC-58** shared child one home; deleting primary parent/edge makes it top-level; make home/move here; outline once | **Met** | `reference-edges.test.ts:100,155`; `role-transitions.test.ts:168-446`; UI `m3-reference.test.mjs:611-793` (make home, move here, demote, stable IDs, one row). | Reference contexts never add a row. |

**AC summary:** 15 Met (including 4 with evidence gaps and 1 core-only for image), 1 Partial
(AC-57), 4 Not met (AC-06, AC-17, AC-21, AC-55). AC-21 is a gate-level product decision.

## New findings

Severity uses `docs/review-checklist.md` §9.1. There is no S1.

### S2-1 — View-only placement clears text history and routes undo to an unrelated structural edit

**Location:** `apps/desktop/src/renderer/src/state/runtime.ts:1557-1574` (`applyChildPlacement`),
`:1594` (`clearTextHistory`); trigger at
`apps/desktop/src/renderer/src/editor/useBelowStackPlacement.ts:106-122`.

**Reproduction (app-level, temporary probe):**

1. Seed the demo; create two direct children of “Take the symmetric matrix below”, one long enough
   to wrap at 960.
2. Type `XYZZY` into the short child and wait for save. State: `lastHistoryOperation = "text"`,
   `canUndoText = true`, `canUndoStructural = true`.
3. Resize 1440 → 960 so the long child moves from the right group to the below stack.
   `applyChildPlacement` rebuilds the ProseMirror document with `resetHistory: true`.
   State: `lastHistoryOperation = "text"`, **`canUndoText = false`**, `canUndoStructural = true`.
4. Press `⌘Z`. The text stays `RXYZZY`; the long child block is **removed** (blocks 9 → 8), and
   `lastHistoryOperation` becomes `"structural"`.

**Expected:** undo either reverts the last text edit or performs nothing. It must never undo an
unrelated structural action.

**Actual:** the view-only right/below projection discards the text stack. The unified route then
falls back to the structural stack because `lastHistoryOperation` is still `text`; the user loses
the block they created earlier while trying to undo typing. The same trigger can occur when a text
edit changes a child’s width enough to flip its placement, not only on resize.

**Direction:** do not reset text history for a view-only placement. If the DOM structure must be
replaced, preserve/remap the history, or explicitly prevent the fallback to structural undo when
the text stack was invalidated by layout. Add a regression test: type → flip placement → `⌘Z` must
not change block count.

### S2-2 — AC-55: candidate and relink apply immediately, with no before/after preview or Confirm

**Location:** `apps/desktop/src/renderer/src/shell/Dialogs.tsx:788-814` (candidate click calls
`repairCandidate`), `:816-829` (“Relink to current selection” calls
`runtime.repairAnchorFromSelection`). Design contract:
`docs/design/m3-anchors-references.md:1510-1526` (“Selecting a candidate previews the span;
Confirm applies”; relink shows old/new quote/context) and `:1548-1550`.

**Reproduction:** open Anchor health on an ambiguous text/formula/code anchor, click a candidate.
The dialog closes and the document mutates in one click. Select a new range and click “Relink to
current selection”; it mutates immediately. The detail view shows the old quote and candidate
contexts, but there is no explicit old-vs-new preview and no second confirmation.

**Expected:** explicit confirmation with a before/after preview; cancel leaves the document
unchanged. IDs and undo are already correct.

**Actual:** one-click apply; the UI test at `m3-repair.test.mjs:410-440` asserts this immediate
behavior, so the test locks in the non-conforming flow.

**Direction:** add a preview state (old/new quote/context; formula/code old/new source/occurrence;
image old/new region when images exist) and a Confirm action; candidate selection only previews.
Keep the existing `anchor.repair` one-undo path and ID assertions.

### S2-3 — AC-06: delete confirmation does not list external reference parents/edges

**Location:** `apps/desktop/src/renderer/src/shell/Dialogs.tsx:1213-1258` (only descendant count and
promote/subtree radio); core removal `packages/core/src/commands.ts:1853-1875` (delete subtree),
`:3292-3297` (single block). Design requires the confirmation to list external reference parents
(`m3-anchors-references.md:875`, `:1375`).

**Reproduction:** create a shared child with a reference from another block, then delete its
primary parent. The dialog says “This block has descendants” and offers promote/subtree; it never
names the block that references the child. Confirming removes the incoming reference edge.

**Expected:** list each external reference parent (source block/chapter, role) in the confirmation
before those edges are removed. This is the AC-06 safety requirement.

**Actual:** references are removed silently; the user cannot see which “See also” links will
disappear.

**Direction:** compute incoming reference branches for the block and for every subtree block when
mode is `delete-subtree`; render the source block/chapter and count in the dialog; only then apply
the existing core delete. Add an app test with a reference parent.

### S2-4 — AC-17: live broken-anchor state is one revision behind; undo leaves a false warning

**Location:** `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx:970-999` computes
`anchorWarnings` from `bindings.runtime.document` during a React render. The callout state comes
from `apps/desktop/src/renderer/src/lib/adapter.ts:205-215` / `:270-337`, built only when the
editor projection rebuilds. The idle-anchor pass in
`apps/desktop/src/renderer/src/editor/DocumentEditor.tsx:386-416` is revision-subscribed; the
warning/callout path is not.

**Reproduction (app-level, temporary probe):**

1. Create a text anchor for “symmetric” in the demo parent; wait for the callout.
2. Select the rendered anchor mark and press Backspace; wait for save.
3. Status bar: `1 anchor needs repair` (`data-health-broken="1"`). Block: **no**
   `[data-anchor-warning]`; callout: **no** `.nf-callout-state`. The callout still looks normal.
4. Click another block and back: the “Lost anchor” warning appears (the node view re-rendered and
   read the now-committed broken document).
5. Press `⌘Z`; the text returns and the status chip clears, but the **“Lost anchor” warning stays
   visible** until another click forces a render.

**Expected:** deleting the anchored text immediately marks the anchor broken at the block/callout
and offers repair; undo immediately clears the broken state.

**Actual:** the inline state lags by one revision and is inverted after undo. The global health chip
is correct, so repair is still reachable, but the local affordance contradicts the document and the
callout never shows its broken chip until a rebuild.

**Direction:** derive warning/callout state from a runtime-revision subscription (or rebuild the
affected node view on content commit) rather than only from render-time `runtime.document` reads;
ensure undo/redo clears the state. Add the AC-17 e2e the M3 design test strategy already names:
delete text → warning → repair → target still once.

### S2-5 — AC-21 image anchors are absent (gate-level product decision)

**Location:** `docs/plan.md:277` (M3c3b blocked on no image insertion/asset rendering);
`docs/reports/m3f2-final-gate.md:217-219`; core image selector/resolver only
(`packages/core/test/anchors.test.ts:856-960`); no image anchor UI or fixture.

**Reproduction:** there is no editor path to insert an image region/point anchor, no asset
pipeline, and no image fixture. The model can parse and resolve image selectors, but a user cannot
create or repair one.

**Expected:** AC-21 Must behavior: normalized region coordinates, display resize survival, broken
on asset replacement, placeholder for a missing image.

**Actual:** blocked. This is a scope/product decision, not a code bug to invent around.

**Direction:** either (a) build the image insertion/asset pipeline and M3c3b before M3 acceptance,
or (b) record an explicit product-owner deferral that moves AC-21 and the image rows of AC-57 out
of the M3 gate. The Sentinel cannot accept an unmet Must AC without that decision.

### S3-1 — Selecting a callout activates the right trunk (and selecting a direct child activates the below trunk)

**Location:** `apps/desktop/src/renderer/src/editor/edges/EdgeLayer.tsx:180-189`. `trunkActive`
checks whether **any** active child edge exists in the parent’s routed group, without filtering by
the trunk’s `placement`; `groupedEdges` contains both right and below edges.

**Reproduction:** build a parent with two callouts and two direct children. Select a callout child.
Both `.nf-edge-trunk[data-trunk-placement="right"]` and `[data-trunk-placement="below"]` get
`nf-edge-active`; the selected callout arm is active, the right arms are muted, but the right lead
still lights up. Select a direct child: both trunks are active again.

**Expected:** only the selected path’s trunk/lead is active; the other group is muted, consistent
with `docs/ux-shell.md:78` “the selected root→block path is 1.75 px accent”.

**Actual:** a callout selection highlights an unrelated right group, and vice versa; the selection
path is visually ambiguous.

**Direction:** filter active child edges by `trunk.placement` (right trunk only considers
`group.right`; below trunk only `group.below`) and add first-child/callout selections to the
existing active-state test.

### S3-2 — Idle anchors cannot be removed from the UI

**Location:** `apps/desktop/src/renderer/src/shell/Dialogs.tsx:553,630-645` health filters are
`all | broken | ambiguous`; idle rows are excluded. `runtime.deleteAnchor` exists
(`runtime.ts:1117-1132`) and is reachable only for a selected broken/ambiguous anchor with branches.
Spec v0.4.5 §8.2 (`spec.md:837`) and §8.3 (`:1284`) require an explicit **Remove anchor** for an
idle anchor; UX `:1216,1423` repeats it. The M3e report calls this surface optional and defers it.

**Reproduction:** delete the last branch of an anchor with “promote”; the anchor becomes idle and
invisible. The health chip disappears; there is no remaining action to delete the idle record or
its text binding.

**Expected:** “All anchors” includes idle anchors with a **Remove anchor** action, undoable, no
target deletion.

**Actual:** the record and binding persist with no UI cleanup path. This is a spec/UX gap, not an
AC in the M3 gate list; it should be scheduled or explicitly deferred.

**Direction:** extend the health data with idle anchors (clear status/label), show them only under
“All”, and call `anchor.delete` with no branches (or a dedicated idle removal) as one undo entry.

### S3-3 — The token module is not the single source of truth for CSS; two values already drift

**Location:** `apps/desktop/src/renderer/src/lib/design-tokens.ts` vs
`apps/desktop/src/renderer/src/styles.css`:
- `editorPaddingBottom: 96` (`design-tokens.ts:67`) vs CSS `40px 40px 88px`
  (`styles.css:1004`); the token is never read.
- `chapterGap: 32` (`design-tokens.ts:71`) vs CSS `.nf-chapter { margin-bottom: 28px }`
  (`styles.css:1409`); the token is never read.
- `edgeWidth: 1.25` / `edgeWidthActive: 1.75` (`design-tokens.ts:51-52`) vs hard-coded
  `stroke-width: 1.25` / `1.75` (`styles.css:2538,2546,2554`); the tokens are never read.
- `--nf-child-gap: 24px` (`styles.css:46`) duplicates `siblingGap: 24`; block bounds
  144/420 and 160/480 (`styles.css:1552-1562`) duplicate the token values; canvas max/padding
  (`styles.css:1002-1004`) duplicate the canvas tokens.
- `canvasMaxWidth`, `childRowGap`, `chapterGap`, `cardRadius`, `editorPaddingTop`,
  `editorPaddingBottom`, `edgeBusOffset`, `edgePortSpacing`, and `wrapIndent` are unused outside
  `design-tokens.ts`/`geometry.ts`/their value tests.

**Reproduction:** change `GEOMETRY.editorPaddingBottom`, `chapterGap`, or `edgeWidth`; the built CSS
does not change. Change `siblingGap`; CSS keeps `--nf-child-gap` at its root value unless someone
also edits `styles.css`. Unit tests that assert token values still pass, so the “single source”
claim is false.

**Expected:** one authority per rule; CSS consumes generated CSS variables or a guard test compares
the CSS custom properties with the TS tokens.

**Actual:** parallel declarations; two values already disagree. This is not a user-visible M3 bug
by itself, but it blocks the M6 settings promise (“settings change token values, not component
styles”) and makes future visual changes unsafe.

**Direction:** before M4/M6, generate `tokens.css` from the TS module (or set root variables from
it) and add a Vitest guard that parses `styles.css` and asserts the CSS variables match. Remove or
wire the dead tokens. **Do not silently pick 88 vs 96 or 28 vs 32**; that is a design/product
decision (see below).

### S3-4 — M3g4–M3g6 have no independent builder worktree or auditable screenshots

**Location:** `docs/reports/m3g4-callout-stacking-trunk-gap.md`,
`docs/reports/m3g5-branch-lead-nested-below.md`,
`docs/reports/m3g6-active-trunk-lead.md`; commits `f90e7de`, `7d68b0b`, `4b55624`. The reports omit
the `Worktree`/`Branch`/`Base` metadata used by every earlier M3 report. The g6 feature commit
`4b55624` is authored by **NoteForest Orchestrator**; the brief confirms g4–g6 were implemented on
`main` without a separate Builder worktree. The referenced `artifacts/m3g*/…png` files are
gitignored, so they are not committed review evidence; the UI suite regenerates some of them at test
time.

**Expected (AGENTS role contract):** Builder implements in a worktree and reports the path; the
Orchestrator integrates and does not implement product code; Sentinel reviews a diff with
reproducible visual evidence.

**Actual:** product code and tests were implemented and merged on `main` without an independent
builder branch; visual claims are not committed review evidence. The UI suite regenerated the
`m3g1`, `m3g3`, `m3g4`, and `m3g5` images during this review, but the g6 report's
`artifacts/m3g6/second-child-active-lead-1440x900.png` is referenced by no test and no `m3g6`
directory exists. I re-ran the UI geometry, reload, and active-state probes and visually inspected
the regenerated g1/g3/g4/g5 images; the g6 visual claim is unsupported by an artifact.

**Direction:** use a Builder worktree for the M3 fix pass; keep the review worktree independent;
make screenshots part of the committed evidence set or record that they are disposable test output.
For this review, treat the g4–g6 results as re-verified only where the committed tests/probes
reproduce, and record the process deviation in the milestone log. This is an S3 process finding,
not a product defect.

### S4-1 — Final docs still quote the superseded 16 px group gap

`docs/reports/m3g2-lane-tokens-edges.md:37` and
`docs/reports/m3g3-callout-safe-zone.md:44` still say `siblingGap`/`childGap` = 16 px;
`design-tokens.ts:28` and `docs/design-tokens.md:18` say 24 px after M3g5. The reports are
historical but are linked from the M3 task index without a “superseded” note. Add a final-status
pointer to `docs/design-tokens.md` or mark the tables “as of M3g2/M3g3”.

### S4-2 — Phase headers in DoD/checklist still say M3a is in progress

Before this review’s phase-note update, `docs/definition-of-done.md:10-20` said “M3a … in progress”
and “M3 implementation is in progress”; `docs/review-checklist.md:8-10` said “M3a implementation is
in progress”. The plan and AGENTS say M3 implementation is complete and acceptance is pending. This
review updates the two phase notes to the M3 review state (see “Process and evidence notes”); no
product decision is implied.

### S4-3 — M3 surfaces are not in the axe pass

`tests/ui/m2-shell.test.mjs:186-241` runs axe on the shell, command palette, topic tree, and delete
dialog only. The callout lane, anchor marker buttons, reference chips, and anchor health sheet are
M3 surfaces with new interactive elements and are not covered by an axe serious/critical assertion.
No violation was observed, but the required evidence is absent. Add these surfaces to the axe test;
VoiceOver remains the product-owner gate.

### S4-4 — Micro test-matrix gaps

- 160 px parent + **far-right** anchor is not tested; the 160 px fixture anchors “Narrow” at the
  start, while the far-right cap is tested only on a 404 px parent. The math degenerates to the
  26 px row origin for a 160 px parent (lane floor 240), so this is a coverage gap, not an observed
  defect.
- A max-width 480 px parent is not tested; 404 px is near-max only.
- The committed nested-callout test covers a callout parent only; my wrapped-direct probe passes,
  but the reload/first-pass race is not covered.
- The active-trunk test selects the second right child only; first-child and cross-group selections
  are not covered (the cross-group case is the S3-1 bug).
- Multiple callout lanes reload together are not covered by a committed test; my reload probe had
  one lane.
- AC-15/16/17/19/20 have no app-level edit/repair tests matching the design test strategy
  (`docs/design/m3-anchors-references.md:1718-1737`).

## Design-system audit

### Token extraction table

“Must-fix” means a single-source/consistency correction should land before M4/M6 settings work.
“Future” means a polish/scale token that does not block M3. “Ratify” marks a value choice that
belongs to the product owner/design, not the Sentinel.

| Proposed token | Current value(s) and location | Used by | Class |
|---|---|---|---|
| `--nf-row-indent` | 26 (`design-tokens.ts:16`); CSS fallback 26 (`styles.css:2411-2412`); set at runtime from `GEOMETRY.rowIndent` (`BlockViews.tsx:301`) | below rows | **Must-fix**: wire one CSS variable; keep the runtime value as its only source. |
| `--nf-trunk-inset` | 12 (`design-tokens.ts:18`); router uses `GEOMETRY.trunkInset`; no CSS | SVG below trunk | **Must-fix** (documentation/source guard); single TS source already. |
| `--nf-trunk-gap` | 8 (`design-tokens.ts:20`); router; UI test `BELOW_TRUNK_GAP = 8` | below trunk start | **Must-fix** (same). |
| `--nf-stem-min` | 12 (`design-tokens.ts:22`); router; tests `GEOMETRY_STEM_MIN = 12` | arrow stem | **Must-fix** (same); no CSS duplicate. |
| `--nf-child-gap` | 24 (`design-tokens.ts:28`); CSS root 24 (`styles.css:46`), fallback 24 (`:2269,2344`) | right group / M2 chain | **Must-fix**: CSS duplicates the token; a token change does not move CSS. |
| `--nf-card-gap` / `--nf-track-gap` | 16 (`styles.css:1470,2283`) vs `childRowGap: 16` (`design-tokens.ts:70`) | chapter blocks / right group rows | **Future**: name semantic row gaps; wire `childRowGap`. |
| `--nf-callout-gap` | 16 (`design-tokens.ts:29`); `placeCallout` | callout to anchor | **Must-fix** (source guard); TS only. |
| `--nf-callout-safe-gap` | 16 (`design-tokens.ts:42`); actual gap is ≥24 after `siblingGap` 24 | callout right group | **Must-fix/design note**: the token is no longer the binding constraint; decide whether it is a minimum (current) or a target. |
| `--nf-callout-max-anchor-offset` | 160 (`design-tokens.ts:41`); UI test | callout left cap | **Must-fix** (source guard); TS only. |
| `--nf-callout-lane-min/max` | 240/480 (`design-tokens.ts:32-33`); UI tests | callout lane | **Must-fix** (source guard); TS only. |
| `--nf-callout-row-gap` | 8 (`styles.css:2377`) | callout row spacing | **Future** (micro geometry). |
| `--nf-callout-lane-bottom` | 8 (`styles.css:2362`) | lane bottom clearance | **Future**. |
| `--nf-callout-row-pad-top` | 10 (`styles.css:2398`) | callout row / leader | **Future**. |
| `--nf-callout-dot-size` / `--nf-callout-dot-top` | 4×4, top 1 (`styles.css:2421-2424`) | anchor dot | **Future**. |
| `--nf-callout-leader-top` | 3 (`styles.css:2433`) | dotted leader | **Future**. |
| `--nf-callout-pill-radius` | 999 (`styles.css:2473,1892`) | quote/reference pills | **Future**: replace with a radius scale (`--nf-radius-pill`). |
| `--nf-card-padding` | 10 (`styles.css:1554`) | every card | **Must-fix** for M6 settings; no token. |
| `--nf-card-min/max` | child 144/420 (`styles.css:1552-1553`), top 160/480 (`:1561-1562`) vs `design-tokens.ts:60-63` | card bounds | **Must-fix**: CSS literals duplicate tokens; settings cannot change card bounds. |
| `--nf-canvas-max` | 1600 (`styles.css:1002`) vs `canvasMaxWidth: 1600` | editor canvas | **Must-fix**: duplicate; token unused. |
| `--nf-canvas-pad-x/top/bottom` | 40/40/88 (`styles.css:1004`); responsive 32/32/72 and 28/28/64 (`:3777,3783`) vs `editorPaddingX/Top/Bottom 40/40/96` | canvas | **Must-fix/ratify**: bottom 88 vs 96 and top/bottom unused; responsive values are new un-tokenized steps. |
| `--nf-chapter-gap` | 28 (`styles.css:1409`) vs `chapterGap: 32` | chapter spacing | **Must-fix/ratify**: actual drift; token unused. |
| `--nf-edge-width` / `--nf-edge-width-active` / `--nf-edge-width-muted` | 1.25/1.75/1 (`styles.css:2538,2546,2554,2559`) vs `edgeWidth/edgeWidthActive 1.25/1.75` | primary/reference edges | **Must-fix**: CSS hard-codes; tokens unused; muted width has no token. |
| `--nf-edge-arrow-length/half-width` | 6/3 (`design-tokens.ts:49-50`); router | arrowheads | **Must-fix** (source guard); no CSS. |
| `--nf-edge-lane-min/max`, `--nf-edge-bus-offset`, `--nf-edge-port-spacing`, `--nf-edge-min-gap` | 2/14/16/8/4 (`design-tokens.ts:54-58`) | router | **Future**: `busOffset`/`portSpacing` are unused after the below-stack router; remove or wire. |
| `--nf-block-gutter` / `--nf-gutter-size` | 16, left −16, top 8 (`styles.css:2100-2183`; marker offsets `BlockViews.tsx:842-850`) | card gutter/markers | **Future** (micro geometry). |
| `--nf-anchor-marker-size` | 16 (`styles.css:2114` etc.); missing marker fallback offsets 8/18 (`BlockViews.tsx:842-850`) | anchor buttons | **Future**. |
| `--nf-ref-chip-max` / `--nf-ref-chip-radius` | 174 px / 999 (`styles.css:1889,1892`) | reference chips | **Future** (chip-overlay polish). |
| `--nf-ref-chip-font` | 9.5/8.5 px (`styles.css:1896,1918`) | reference chips | **Future** (type scale). |
| `--nf-radius-control/block/overlay/pill` | 3/4/6/999 (`styles.css:43-45,2473`) vs `cardRadius: 4` | controls/cards/pills | **Future**: consolidate the radius scale; `cardRadius` is unused. |
| `--nf-type-body` | 13 px/1.45 (`styles.css:66-67`) | shell body | **Future**. |
| `--nf-type-prose` | 15.5 px/1.55 (`styles.css:1600-1601`) | block prose | **Future**. |
| `--nf-type-heading-1/2/3` | 20/18/16 (`styles.css:1958-1972`) | block prose headings | **Future**. |
| `--nf-type-chapter` | 20 px/1.3 (`styles.css:1435,1456`) | chapter title | **Future**; note 20 px equals H1. |
| `--nf-type-micro/caption/small` | 8.5/9.5/10/10.5/11/11.5/12/12.5 (`styles.css:1918,1896,2521,1422,2707,1158,1044,1250`) | chips/status/controls | **Future**: no scale; many near-duplicates. |
| `--nf-type-recovery-title` | 21 px/1.3 (`styles.css:1234-1236`) | recovery surface | **Future**. |
| `--nf-letter-spacing-label` | 0.03/0.04 em (`styles.css:1917,1424`) | uppercase labels | **Future**. |
| `--nf-color-accent-strong` | `#a9c3dc` (`styles.css:2919-2920`) | primary button | **Future/consistency**: derive from `--accent` or add a token. |
| `--nf-color-accent-alpha-*` | `rgba(155,183,212,.14/.28/.8/.9)` (`styles.css:1709-1755`) | anchor/marker/drop states | **Future/consistency**: hard-coded copies of `--accent`; use color-mix or alpha tokens. |
| `--nf-color-danger-soft` | `rgb(217 139 139 / .4/.12)` (`styles.css:2925,2930`) | danger button | **Future**. |
| `--nf-color-danger` fallback | `#e08a8a` (`styles.css:3620,3641`) vs declared `#d98b8b` (`:37`) | recovery/danger copy | **Must-fix (consistency)**: fallback disagrees with the theme value. |
| `--nf-shadow-popover/dialog/toast` | `0 8px 24px rgb(0 0 0/.35)` (`:2646,3687,3766`), `0 24px 64px rgb(0 0 0/.55)` (`:2954,3071`) | overlays | **Future**. |
| `--nf-z-edge/right-group/lane/card/chips/toolbar/menu/dialog` | 0/0/1/2/3/30/50/60 (`styles.css:2533,2322,2318,2313,1881,2647,2939,3678`); 2/3/4 marker layers (`:1702,1741,1787,1857,2114`) | stacking | **Must-fix for M4 overlays**; document the stack and tokenize. |
| `--nf-breakpoint-compact/medium/narrow` | 900/1100/820 (`styles.css:3775-3787`); JS 820 (`Workspace.tsx:38`) | canvas/sidebar | **Future**: 820 duplicated in JS and CSS; add one source. |
| `--nf-context-menu-width/row` | 224/28/12/8 (`ContextMenu.tsx:102-105`) | context menu | **Future** (shell spacing). |
| `--nf-sidebar-min/max` | 208/360 (`Workspace.tsx:119-120`), CSS 208 (`styles.css:417`) | sidebar | **Future**; JS/CSS duplicate. |
| `--nf-editor-min` | 480 (`Workspace.tsx:128`) | editor panel | **Future**. |
| `--nf-motion-duration` | 120 ms (`styles.css` transitions) plus `--motion` easing | all transitions | **Future**; duration is not tokenized. |

### Inconsistent rules and drift (not only code bugs)

1. **The token module and CSS are parallel sources.** Nine tokens/values are asserted in tests but
   never consumed by the UI (eight unused; `wrapIndent` is reserved for M4), and `edgeWidth`, card
   bounds, canvas bounds, and child gap are re-declared in CSS. This makes the “single source of
   truth” claim in `design-tokens.ts:1-12` and `docs/design-tokens.md:7-8` false today. It is an S3
   design-system issue and a prerequisite for M6 settings.
2. **Two values already disagree:** `editorPaddingBottom` 96 vs CSS 88; `chapterGap` 32 vs CSS 28.
   The product owner/design must choose the canonical values; this review does not.
3. **Callout safe-gap semantics:** after the 24 px group gap, `calloutSafeRight` is always capped by
   the lane, so the effective callout-to-group gap is ≥24 px and the 16 px `safeGap` token is not
   the binding constraint. The code/test still pass (the requirement is “at least 16”), but the
   design text and token name suggest a tighter target. Clarify the intent before M6 settings.
4. **Spacing scale is ad hoc:** 2/3/4/5/6/7/8/10/12/14/16/18/20/24/26/28/32 appear for comparable
   gaps and paddings. Some are semantic (trunk/row), many are visual drift (chip/control/dialog).
   A small scale (`space-1..8`) plus the geometry tokens would remove the one-off values.
5. **Type scale is ad hoc:** 8.5/9.5/10/10.5/11/11.5/12/12.5/13/15.5/18/20/21 are all in use; the
   same “caption” role uses 9.5, 10, and 10.5 in different components. A five-step scale
   (micro/caption/small/body/prose/title) is enough.
6. **Radius scale is ad hoc:** 3/4/6/999/50%; `cardRadius` exists but is not wired. Either use a
   four-step radius scale or document why pills/circles are separate.
7. **Z-index stack is undocumented:** M3’s 0/1/2 is documented in `docs/design-tokens.md`, but the
   shell uses 2/3/4/5/30/50/60 without names. An overlay change can easily collide.
8. **Breakpoints are duplicated:** 820 in `Workspace.tsx:38` and `styles.css:3787`; 1100/900 only in
   CSS. A single JS/CSS source or a documented contract is needed.
9. **Color drift:** `--danger` fallback `#e08a8a` differs from the declared `#d98b8b`; accent alpha
   overlays are literal `rgba(155,183,212,…)` rather than derived from `--accent`; `#a9c3dc` is a
   second accent. These are easy to normalize and are visible only in specific states.
10. **Report drift:** M3g2/M3g3 still state the 16 px group gap; M3g5/M3g6 changed it to 24. The
    final M3 docs should point to the current token table, and historical reports should say
    “superseded”.

## Regression and quality audit

- **M2/M3 critical flows:** critical e2e 21/21 covers create/edit/branch/reparent/reorder, collapse,
  arrows/trunk, keyboard, save/close/quit, recovery, and the M3 text-anchor flow. All pass.
- **Undo/redo:** core identity suites pass; the new placement rebuild regression is S2-1. Existing
  history-routing tests do not cover a view-only placement change.
- **Save/reload:** e2e save/close/quit and UI save/reload (anchors, references, callouts, split/merge)
  pass. My 3/3 callout reload probe kept lane width and offsets.
- **Split/merge:** core matrix and app split/merge pass; one undo restores the split state; the
  spanning anchor is core-tested, not app-tested.
- **Health sheet:** list/filter/navigate/repair/attach/delete branch/keep broken pass. The live
  deletion state is stale (S2-4), and idle removal is missing (S3-2).
- **No skipped/weakened tests:** no `.skip`, `.only`, `.todo`, retries, or removed critical tests.
  M3g5’s `m2-view` fixture extension preserves the Fit test’s purpose; the e2e focus wait replaces a
  synchronous read and strengthens the assertion; M3g6’s trunk assertions were changed to the new
  contract and still check the lead, arms, and muting.
- **No fixed sleeps in gate suites:** `waitForTimeout` appears only in the on-demand perf suite;
  M3 UI tests use `waitForFunction`/`waitLayout`/`waitForSelector`.
- **No native-dialog waits:** recovery uses the E2E dialog guard and explicit overrides; no test
  waits for a human.
- **No secrets/network/telemetry:** no fetch/WebSocket/telemetry in app or packages; lock tokens are
  random UUIDs stored locally; no remote bind.
- **Accessibility:** axe serious/critical zero on the four shell surfaces. M3 callout/marker/chip/
  health surfaces are not axe-tested (S4-3). Keyboard paths exist for marker/callout, health rows,
  reference chips, and split/merge; VoiceOver remains the product-owner gate.
- **Design consistency:** S3-1 (cross-group trunk), S3-3 (token drift), S4-1/S4-2 (docs). The
  product-owner visual rules (below stack, lane, safe zone, nested, lead/stem) otherwise match.

## Test inventory and timings

| Suite | Result | Suite/test time | Notes |
|---|---|---|---|
| Typecheck | pass | — | desktop node/web, core, layout, pdf |
| Unit | **492/492**, 43 files | **2.07 s** | includes 1,000-anchor perf guard |
| Critical e2e | **21/21** | **45.44 s** suite / 53.58 s process | under the 60 s suite budget |
| Recovery | **14/14** | **18.61 s** | backup/corrupt/stale-lock/empty-chapter |
| UI | **28/28**, 11 files | **40.6 s** of bodies / ~2 min process | per file: view 6.22, shell 3.38, callout 8.55, outline 1.29, formula 2.15, term 1.65, term-geometry 1.79, code 2.27, reference 7.49, repair 4.21, split-merge 1.65 |
| Perf | not run | — | on demand |
| Visual | not run | — | on demand, visible window |
| Full `verify` | not run as one command | — | components above all pass |

No skipped/only tests; no fixed sleeps in gate suites; no native-dialog waits. The UI suite uses 11
separate Electron launches, so the process wall time is much larger than the 40.6 s of test bodies.

## Residual gaps

- **Image anchors (AC-21/M3c3b):** blocked; core resolver only; no UI, asset pipeline, placeholder,
  or image fixture. Product decision required.
- **Paste/duplicate UI:** `planDuplicateSubtree` is a pure plan; no command envelope, clipboard,
  placement, or undo. Inline/atomic paste strips anchor IDs; block duplicate UI is a follow-up.
- **Chip overlay:** reference chips are absolutely positioned below the card; with several refs
  they can overlap the callout lane or nearby content. The block menu has the full list. Known
  polish, not M3-gated.
- **160 px cap:** a 160 px parent with a far-right anchor is not tested; the lane floor makes the
  safe zone fall back to the 26 px row origin, so the callout does not follow the anchor. A 480 px
  max-width parent is also untested (404 px is near-max).
- **Nested-callout coverage:** one-level callout child is committed; a child of a wrapped direct row
  passes my probe but has no committed test; deeper nesting and the first-pass reload race are not
  covered.
- **Lane attachment race:** g4’s retry and my 3/3 reload probe pass; the g4 report’s 5/5 manual
  reload evidence has no committed artifact; first-paint/transient frames are not captured.
- **Active-state edge cases:** second right child is tested; first child, callout-vs-direct cross
  group (S3-1), zoom/fit, and multi-parent paths are not.
- **Live formula/code broken state:** the text probe exposes a render-freshness bug (S2-4); formula
  and code likely share the same warning path but were not separately probed.
- **Idle anchor cleanup:** no All-anchors/Remove anchor UI (S3-2); the record is invisible but
  persists.
- **Design tokens:** CSS/token drift and unused tokens (S3-3); M6 settings cannot be implemented
  safely until this is resolved.
- **Axe/VoiceOver:** M3 surfaces are not in the axe pass; VoiceOver is the product-owner gate.

## What I did not verify

- Manual visual judgement and VoiceOver/keyboard-only acceptance; screen recordings belong to the
  product owner.
- The original M3g* screenshot set: the paths are gitignored; the UI suite regenerated g1/g3/g4/g5
  during this review, so those images are test output, not the builder’s original evidence. The g6
  screenshot does not exist at all (no test creates it).
- The packaged/signed build; Windows/Linux; iPad/Pencil.
- Page view, reader, paginator, PDF/`printToPDF`, and all M4 evidence (AC-56 PDF part).
- Image insertion/asset replacement/missing-image placeholder (no pipeline).
- A full combined `npm run verify`; I ran its components separately.
- Perf/visual suites and 1,000-block rendering; the unit 1,000-anchor resolver guard passes.
- Axe on M3 surfaces; only shell/palette/tree/delete-dialog axe is committed.
- Multiple independent callout lanes on reload; my probe had one lane.
- A clean 480 px max parent, 160 px parent + far-right anchor, deeper nested callouts, and the
  first-paint lane race.
- Formula/code live edit → warning freshness; only text was probed.

## Process and evidence notes

- **M3g4–M3g6 role deviation.** The reports use the “Builder” voice but omit worktree/branch/base;
  g6’s commit is authored by the Orchestrator, and the brief confirms these fixes were implemented
  on `main` without a separate Builder worktree. AGENTS §Team and roles says the Orchestrator does
  not implement product code. I reviewed them strictly and re-ran the relevant tests/probes; the
  code is not rejected merely for provenance, but the process is not the agreed one and the missing
  independent review may have contributed to S3-1 and the cross-group case slipping through.
- **Artifacts.** The reports reference `artifacts/m3g*/...png`; `artifacts/` is gitignored
  (`git check-ignore -v artifacts` → `.gitignore:40`). A fresh review worktree cannot audit the
  builder’s original images; the UI suite regenerates some at runtime, but they are not a durable
  review record.
- **Stale reports.** M3g2/M3g3 quote the 16 px group gap; M3g5/M3g6 use 24. The final M3 report
  should link the current token table and mark historical tables superseded. This is documentation
  drift, not a code defect.
- **Phase-note update.** This review updates the DoD/checklist phase notes from “M3a in progress” to
  the M3 review state; the gate remains blocked until the S2 findings and the image-anchor decision
  are resolved.

## Product-owner decisions needed

1. **Image anchors / AC-21.** Accept M3 with a **recorded deferral** of AC-21 and the image rows of
   AC-57 (move them to M4 or a dedicated M3c3b), or require the image insertion/asset pipeline and
   M3c3b before M3 acceptance. The Sentinel cannot grant this; it must be a product-owner decision
   recorded in the plan/spec delta. Even with a deferral, S2-1–S2-4 must be fixed.
2. **Canonical token values.** `editorPaddingBottom` is 96 in the token module and 88 in CSS;
   `chapterGap` is 32 in the token module and 28 in CSS. Which values are authoritative? I did not
   change either. Ratify the values, then wire CSS to the token source.
3. **Callout `safeGap` semantics.** After the 24 px group gap, the effective callout-to-group gap is
   ≥24 px and the 16 px token is not the binding constraint. Is the requirement “at least 16” (current
   behavior, no change) or “as close as 16” (the group gap or the token should change)? This is a
   design-value decision, not an implementation shortcut.
4. **Idle-anchor removal.** Add the spec/UX “All anchors → Remove anchor” surface in M3, or record
   an explicit deferral. The current M3e report calls it optional; spec v0.4.5 §8.2/§8.3 says it is
   required.
5. **Product-owner visual/VoiceOver pass.** Still pending; I did not substitute automated geometry
   for manual judgement.

## Suggested next step

The Orchestrator should open one focused M3 fix brief (Builder worktree) for S2-1–S2-4 and S3-1/S3-2,
with tests that fail on the current behavior:

1. type → flip right/below placement → `⌘Z` must not change block count;
2. candidate/relink preview → Confirm → one undo; cancel mutates nothing;
3. delete a shared child’s primary parent → dialog lists the external reference parent;
4. delete anchored text → immediate block warning/callout state → repair; undo clears it;
5. callout selection → only the below trunk active; direct selection → only the right trunk active.

Then decide image-anchor deferral and token values, run one full `npm run verify`, and re-run this
review. M4/PDF stay blocked until M3 is accepted.
