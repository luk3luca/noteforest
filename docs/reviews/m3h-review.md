# M3h Sentinel re-review — closure of the M3 request-changes findings

- **Reviewer:** Sentinel (independent)
- **Date:** 6 November 2026
- **Worktree:** `a builder worktree` (branch `t3/m3h-sentinel-rereview`; base `83af327`; no commits, no merges)
- **Base:** `83af327` (`docs: merge M3h3 and start Sentinel re-review`), after M3h1/M3h2/M3h3
- **Scope:** closure of S2-1–S2-4, S3-1, S3-2, the S3-3/M3h4 token deferral, the AC-21 deferral, and regressions in the M2/M3 critical flows; no product code, tests, spec, UX, ADR, or plan changes.
- **Environment:** Apple M5, 24 GB, macOS 26.5.2 (25F84), Node 22.23.1, npm 10.9.8, Electron 45.2.1, Playwright 1.64.1, Vitest 5.1.0. Electron windows hidden for all automated runs.
- **Theme / view:** dark mode; editor shell, not page/PDF view.

## Verdict

**Accept with minor** (checklist wording: *Approve with nits*).

All four S2 findings from `docs/reviews/m3-review.md` are closed for their specified paths with app-level evidence, and both S3 product findings
(active trunks, idle-anchor removal) are closed. The AC-21/image-AC-57 deferral is recorded consistently in the
spec, plan, and AGENTS; the 88/28 token values and `callout.safeGap` 16 px minimum are recorded, and the token
single-source work remains explicitly planned as **M3h4**. No S1 or S2 issue was found in the M3h changes.

The remaining items are S3/S4: the M3h relink flow requires the selection before the modal sheet opens, the
S2-1 replay fallback still has a latent undo-routing edge case, the keyboard leaf-block delete path removes
external references with only the undo toast (an open product/UX decision), the AC-57 formula-term edit
fixture remains missing as an evidence gap carried from the original review, and documentation/process nits
remain. None of these contradicts the explicit confirmation paths in AC-55/AC-06/AC-17 as reviewed; S3-8 is
the one open decision that the product owner should confirm before final M3 sign-off.

**M3 may proceed to the product-owner VoiceOver/visual gate.** This re-review is not M3 acceptance; final
acceptance remains with the product owner after that gate. M4/PDF stay blocked until M3 is accepted, and the
image pipeline/M3c3b is still required before M4/PDF image acceptance.

## Per-finding closure

| Finding | Status | Evidence | Tests |
|---|---|---|---|
| **S2-1** placement undo clears text history | **Closed** | `applyChildPlacement` no longer resets text history; `captureTextHistory` walks the text stack, rebases every event through `blockBody` offsets, and replays one closed history entry per event (`state/text-history.ts:61-166`, `state/runtime.ts:1601-1728`). The UI test types in the child that stays right and in the child that the resize moves below, flips 1440 → 960, and asserts two text undos with a stable 11-block count before the structural undo removes the previously created long child (`tests/ui/m3-anchor-callout.test.mjs:1131-1213`). | `apps/desktop/test/text-history.test.ts`; `tests/ui/m3-anchor-callout.test.mjs:1131-1213` (passed). |
| **S2-2** AC-55 candidate/relink apply immediately | **Closed** | Candidate selection and relink now build the exact `anchor.repair` payload and open a before/after preview; nothing is applied until **Confirm repair** (`shell/Dialogs.tsx:607-660,835-948`; `lib/anchor-health.ts:522-541`; `state/runtime.ts:1038-1106`). Cancel and closing mutate nothing; Confirm applies one undoable repair; anchor/branch IDs and targets survive. The old one-click assertion is gone. | `tests/ui/m3-repair.test.mjs:419-490,653-687`; `apps/desktop/test/anchor-health.test.ts:101-258` (passed). |
| **S2-3** AC-06 delete does not list external references | **Closed for the confirmation path; S3-8 remains as a product question** | `externalReferenceParents` lists incoming reference edges from outside the deletion for promote and delete-subtree modes (source block, chapter, role, target); the dialog renders them before Delete (`lib/tree.ts:111-157`, `shell/Dialogs.tsx:1439-1520`). Cancel mutates nothing; Confirm uses the existing core delete and one undo restores the exact graph. The keyboard delete of a **leaf** block with external references still bypasses the dialog (S3-8); the approved UX currently says leaf deletes have no confirmation. | `tests/ui/m3-reference.test.mjs` (new delete-reference test); `apps/desktop/test/delete-references.test.ts` (passed); independent leaf probe described under S3-8. |
| **S2-4** AC-17 live broken state is one revision behind | **Closed** | A content commit bumps the canonical runtime revision and notifies before the disk save; `BlockBodyView` subscribes via `useSyncExternalStore` and derives warnings/callout state from the canonical document (`state/runtime.ts:494-523`; `editor/views/BlockViews.tsx:56-70,530,656-663,1010-1041`). The new app test deletes the anchored word through the real editor and observes the block warning, callout “Lost anchor”, and health chip without another click; undo clears all three and redo restores them. | `tests/ui/m3h3-live-health.test.mjs:146-275` (passed). Text is app-tested; formula/code share the same path but are not separately app-probed. |
| **S3-1** selecting a callout lights the right trunk (and vice versa) | **Closed** | Each trunk filters active children by `trunk.placement` (`editor/edges/EdgeLayer.tsx:184-192`). The UI test selects a callout (below active/right muted) and a direct child (right active/below muted); the second-right-child lead test still passes. | `tests/ui/m3-anchor-callout.test.mjs:948-1129` (passed). |
| **S3-2** idle anchors cannot be removed | **Closed** | Health rows include idle anchors only under **All anchors** with a neutral “Idle anchor” state; **Remove anchor** calls `removeIdleAnchor`, which rejects any anchor with outgoing branches, deletes the record/binding in one structural command, and never touches the target (`lib/anchor-health.ts:206-269`; `shell/Dialogs.tsx:665-680,767-777`; `state/runtime.ts:1153-1173`). One undo restores the record and exact binding. | `apps/desktop/test/anchor-health.test.ts:259-333`; `apps/desktop/test/idle-anchor-removal.test.ts:143-178`; `tests/ui/m3h3-live-health.test.mjs:277-411` (passed). |
| **S3-3** token module is not the CSS source of truth | **Open — explicitly planned M3h4** | `design-tokens.ts` still says `editorPaddingBottom: 96` and `chapterGap: 32`; CSS renders 88/28. The canonical values 88/28 are recorded in AGENTS, `docs/plan.md:295-298`, and `docs/design-tokens.md:95-98`, which assigns the single-source/CSS guard to **M3h4** before M4/M6 settings. No value was silently re-ratified. | Token value tests pass; no CSS-vs-token guard yet. Not an M3 acceptance blocker per the re-review brief. |
| **S3-4** M3g4–M3g6 process/provenance | **Closed as process; reporting nit remains** | The M3h fixes were implemented on separate branches/worktrees (`t3/placement-undo-active-trunks`, `t3/anchor-safety-repair-preview-delete-disclosure`, `t3/live-health-idle-removal`) and merged, restoring the Builder-worktree pattern. The three M3h reports still omit Worktree/Branch/Base metadata and their `artifacts/` screenshots are gitignored test output, so the provenance record remains weaker than the role contract. | `git worktree list`; commit graph; report review. |
| **S2-5 / AC-21** image anchors absent | **Deferred (recorded product-owner decision)** | Spec AC-21 now carries the 6 November M3 gate decision: AC-21 and the image rows of AC-57 are deferred to M3c3b; M3 may be accepted on text/formula/code anchors, reference edges, repair, and split/merge; the image pipeline is a prerequisite for the image part of M4/PDF acceptance (`docs/spec.md:2143-2147`). The plan and AGENTS repeat the decision (`docs/plan.md:295-298`; AGENTS “Current phase”). No M3h report claims image-anchor behavior; M3h2/M3h3 explicitly call images out of scope. | Core image resolver matrix only (`packages/core/test/anchors.test.ts:856-960`); no UI/asset pipeline. M3c3b remains blocked. |

### Carried S4 items from the original review

| Finding | Status | Note |
|---|---|---|
| **S4-1** stale 16 px group gap in historical reports | Open | `docs/reports/m3g2-lane-tokens-edges.md:37` and `docs/reports/m3g3-callout-safe-zone.md:44` still say 16 px without a “superseded by 24 px / design-tokens.md” pointer. |
| **S4-2** stale phase notes | Closed by this review | `docs/review-checklist.md` and `docs/definition-of-done.md` phase notes are updated to the M3h re-review state. |
| **S4-3** M3 surfaces absent from the axe pass | Open | The committed axe assertions still cover only the M2 shell/palette/tree/delete dialog. Callout lanes, anchor markers, reference chips, and the health sheet were not axe-checked in this pass; VoiceOver remains the product-owner gate. |
| **S4-4** micro test-matrix gaps | Partially closed | Cross-group trunk activation, delete-reference disclosure, live text-anchor health, and AC-17 live behavior are now covered. Still uncovered: 160 px parent + far-right anchor, 480 px max parent, reload race for a wrapped-direct child, multiple callout lanes on reload, formula/code live edit warnings, and app-level AC-15/16/19/20 flows. |

## New findings

There is no new S1 or S2 finding.

### S3-5 — Relink requires the selection before the modal health sheet opens

**Location:** `apps/desktop/src/renderer/src/shell/Dialogs.tsx:57-71` (the health sheet is a `ModalOverlay`/`Modal`), `:628-649` (`previewRelink` reads the current editor selection), `apps/desktop/src/renderer/src/state/runtime.ts:1063` (`branchSelectionAnchor(editor)`).

**Reproduction:** Open Anchor health from a broken-anchor warning without a prepared selection and press **Relink to current selection**. The sheet reports an error asking for a replacement range in the anchor’s own block, but the modal overlay prevents selecting text in the editor until the sheet is closed. The working path is: select the replacement range first, then open the sheet, then Relink.

**Expected (design §8.5):** choosing Relink enters a relink mode (the sheet closes or docks), the user selects, and the before/after preview follows. **Actual:** the preview and Confirm are correct, but the selection step happens before the sheet and is not guided. AC-55’s confirmation behavior is still met; this is a UX-flow follow-up, not a regression introduced by M3h2.

**Direction:** close/dock the sheet for selection, or add explicit “select in the block first, then reopen” copy and a shortcut back to the sheet. Keep the existing preview/Confirm command path.

### S3-6 — Replay-failure fallback can still route the next undo to the structural stack

**Location:** `apps/desktop/src/renderer/src/state/runtime.ts:1708-1719`; `apps/desktop/src/renderer/src/lib/history-routing.ts:42-58`.

**Reproduction (code path, not observed in the app):** if `captureTextHistory` or the replay throws (safety bound, an unexpected wrapper-level step, a mapping/application failure, or an expected-projection mismatch), the runtime restores the correct new projection and clears the text stack, but leaves `lastHistoryOperation` and the structural stack intact. The next `⌘Z` then falls back from text to structural and can undo an unrelated block—the original S2-1 failure mode, on the error path only. The committed UI test exercises the normal replay path, not this fallback.

**Expected:** an invalidated text stack should not silently route the next undo to a structural action. **Actual:** the normal path is fixed, but the fallback still permits it.

**Direction:** mark the text stack as invalidated and make the next undo a no-op (or a toast asking the user to retry) instead of falling back, or add a unit test proving the current text commands cannot reach the fallback. This is an S3 residual risk because no current UI text command produces wrapper-level steps; it is not a reason to block the M3h closure.

### S3-7 — AC-57 formula-term edit fixture is still absent

**Location:** `fixtures/m3-anchor-kinds.json` (formula-term creation/resolution only); `packages/core/test/fixtures.test.ts`; original AC-57 finding in `docs/reviews/m3-review.md`.

**Status:** the image rows of AC-57 are deferred with AC-21, but the formula-term **edit** row is not covered by a fixture or a table-driven core case that edits the formula around the term and re-resolves. Formula-term resolution itself is covered (`anchors.test.ts:670-695`), so this is an evidence gap rather than an observed behavior defect. The original review already recorded AC-57 as Partial; it is carried here for the remaining M3 gate record.

**Direction:** add the formula-term edit fixture/table case, or record an explicit deferral with the product owner alongside the image deferral. This does not block the M3h fix-pass closure; it should be resolved before final M3 sign-off or tracked as an M3h4/M4 fixture follow-up.

### S3-8 — Keyboard delete of a leaf block removes external references with only the undo toast

**Location:** `apps/desktop/src/renderer/src/actions.ts:164-171` (`requestBlockDelete` opens the dialog only when the block has direct children); `apps/desktop/src/renderer/src/editor/keymap.ts:204-214` (`Mod-Backspace`/`Delete`); `apps/desktop/src/renderer/src/state/runtime.ts:2251-2280` (core delete removes incoming references). The new disclosure lives only in the delete dialog (`shell/Dialogs.tsx:1439-1520`).

**Reproduction (independent probe, temporary script outside the repository):** seed the demo; create a leaf block with no children and a reference parent that points at it; select the leaf and press `⌘Backspace`. No `Delete block` dialog opens; the leaf and its incoming reference edge disappear in one undoable delete. The probe result: `dialogShown: false`, `targetExists: false`, `referenceExists: false`, source block kept.

**Expected:** AC-06 says external references are listed in the confirmation; the S2-3 brief says “Deleting a block/subtree lists external reference parents … before confirm.” **Actual:** the dialog path lists them, but the keyboard leaf path has no confirmation, so the external reference disappears with only the undo toast. The approved UX currently says “Delete one block without children: No; undo toast” (`docs/ux.md:1635`), so this is consistent with the existing UX table but in tension with the reference-disclosure intent.

**Direction:** decide whether a leaf block with `externalReferenceParents(...).length > 0` should open the delete dialog (or show the reference list in a confirmation) before the keyboard delete. If the no-confirmation rule is intentional, record that decision explicitly and consider naming the reference loss in the undo toast. This is a product/UX decision, not a reason to silently expand the dialog scope; I did not change it.

### S4-5 — The approved design package still lists AC-21 as M3 evidence

`docs/design/m3-anchors-references.md:1731` still lists AC-21 with “M3” and UI evidence, while the spec gate decision (`docs/spec.md:2143-2147`) defers it to M3c3b. Add a “superseded/deferred” pointer in the design AC table so the design package and the spec do not read as contradictory.

### S4-6 — M3h reports omit worktree/branch/base and durable screenshots

The three M3h reports name the role but not the worktree/branch/base metadata used by earlier M3 reports; `artifacts/` remains gitignored, so the screenshots I inspected are reproducible test output, not committed evidence. The process is otherwise improved (separate branches/worktrees were used for each fix). Record the paths and treat screenshots as disposable output explicitly.

## AC-21, tokens, and remaining gate items

- **AC-21 / image rows of AC-57:** deferred to M3c3b by the product owner; recorded in spec, plan, and AGENTS; no M3h claim of image-anchor delivery. The image insertion/asset pipeline is still a prerequisite for M4/PDF image acceptance.
- **Canonical shell tokens:** 88 px bottom padding and 28 px chapter gap are recorded as canonical in `docs/design-tokens.md:95-98`, `docs/plan.md:295-298`, and AGENTS. The TS module still carries 96/32; **M3h4** is explicitly responsible for making the TS module the single source and adding a CSS/token guard. Do not change either value in a component before then.
- **`callout.safeGap`:** recorded as a 16 px **minimum**; with the 24 px sibling gap the effective callout-to-group gap is ≥24 px (`docs/design-tokens.md:25`; `docs/plan.md:297-298`). The current code is consistent with “at least 16”.
- **S3-3 token drift:** remains open by design as M3h4 work; it is not an M3 acceptance blocker under the re-review brief and the plan records it explicitly.
- **Remaining M3 gate items:** product-owner VoiceOver/visual pass; product decision on S3-8 (keyboard leaf-block delete disclosure); AC-57 formula-term edit evidence (S3-7); axe coverage for M3 surfaces (S4-3); optional S3-5 relink-flow polish and S3-6 fallback guard. M3h4 remains before M4/M6 settings; M3c3b remains before image acceptance.

## Checks run

| Check | Result | Timing / notes |
|---|---|---|
| `npm ci` from the lockfile | 199 packages, 0 vulnerabilities | Clean review worktree install. |
| `npm run typecheck` | **pass** | desktop node/web, core, layout, pdf. |
| `npm test` | **505/505**, 47 files | **2.21 s** tests (unit budget <3 s). |
| `npm run e2e:critical` | **21/21** | **45.60 s** suite / 53.78 s process (budget <60 s suite). Includes text-anchor create/undo/reload. |
| `npm run test:recovery:run` | **14/14** | **18.35 s**; dialog guard exercised, no native-dialog waits. |
| Targeted UI: `m3-anchor-callout` | **12/12** | 17.42 s suite / 25.54 s process; includes S2-1 and S3-1. |
| Targeted UI: `m3-repair` | **4/4** | 4.45 s suite / 12.56 s process; includes S2-2 preview/cancel/confirm and one-undo formula/code repairs. |
| Targeted UI: `m3-reference` | **4/4** | 8.47 s suite / 16.61 s process; includes S2-3 disclosure/cancel/confirm/undo. |
| Targeted UI: `m3h3-live-health` | **2/2** | 3.14 s suite / 11.24 s process; includes S2-4 live text deletion/undo/redo and S3-2 idle removal. |
| Remaining UI files (`m2-view`, `m2-shell`, `m3-anchor-outline`, `m3-formula-anchor`, `m3-formula-term`, `m3-formula-term-geometry`, `m3-code-anchor`, `m3f1-split-merge`) | **11/11**, 8 files | 16.08 s combined; confirms shell/axe, save/reload, split/merge, formula, code, and outline regressions. |
| UI total | **33/33**, 12 files | ~50 s of suite/test bodies across the files run; process wall is higher because the suite launches a separate Electron window per file. |
| Full `npm run verify` as one command | **not run** | Its components were run separately above; the Orchestrator owns the single integration run. |
| Perf / visual suites | **not run** | On demand, not the critical gate. |
| Full app screenshot pass | **not run** | The UI tests regenerated the M3h evidence images; I inspected `selected-callout-trunks`, `anchor-repair-preview`, `delete-reference-disclosure`, `live-broken-warning`, `live-broken-repair`, `idle-anchor-health`, and `idle-anchor-removed`. |
| Independent leaf-delete probe | **reference removed, no dialog** | Temporary script outside the repo: leaf block + external reference, select leaf, `⌘Backspace` → `dialogShown: false`, target gone, reference gone, source kept. See S3-8. |

## What I did not verify

- Manual VoiceOver/keyboard-only acceptance and subjective visual judgement; screen recordings belong to the product owner.
- A full combined `npm run verify`; only its components were run separately.
- Perf/visual suites, 1,000-block UI rendering, and the cost of the new per-block runtime subscription at scale.
- Axe serious/critical assertions on M3 surfaces (callout lanes, markers, chips, health sheet); only the existing M2 shell axe pass ran.
- Live formula/code broken-warning freshness through a real editor deletion; text was probed and formula/code share the same code path, but the app-level case is not committed.
- The S2-1 replay-failure fallback (no current UI command reaches it) and redo preservation across a placement flip (still documented as unsupported).
- Text relink undo specifically; the formula/code candidate tests prove the same `anchor.repair`/structural undo path, and text relink tests IDs/targets/warning removal.
- Delete-subtree Confirm + undo in the UI; the UI test covers promote-mode confirm/undo and delete-subtree disclosure/cancel, while core delete-subtree undo is unit-tested.
- The idle-removal toast Undo action; the UI test uses `⌘Z` and the runtime unit test proves the structural inverse.
- Image-anchor insertion/asset rendering, M3c3b, AC-21 behavior, and the image rows of AC-57 (deferred).
- The AC-57 formula-term edit fixture (S3-7).
- Packaged/signed build, Windows/Linux, iPad/Pencil, page/reader view, paginator, PDF, and all M4 evidence.
- Multiple callout lanes on reload, 160 px far-right anchors, 480 px max parents, and the wrapped-direct reload race (unchanged from the original review).

## Process and evidence notes

- I reviewed the M3h1/M3h2/M3h3 diffs and reports, then re-ran the relevant unit, critical, recovery, and UI suites on the current base. The new app tests fail on the pre-fix behavior per the builder reports; the current runtime state assertions (`lastHistoryOperation`, `canUndoText`, `canUndoStructural`, canonical block count) are not mocked.
- The M3h UI reports quote 30/30 (M3h1) and 12/12 files (M3h3); the current suite is 33/33 across 12 files, matching the plan/AGENTS inventory.
- No `.skip`, `.only`, `.todo`, retries, or removed critical tests were found; `waitForTimeout` remains only in the on-demand perf suite; no test waits for a native dialog.
- The generated M3h screenshots I inspected match the claims: block warning + callout chip + health chip for the live text deletion; before/after repair preview with anchor/branch/target IDs; external-reference disclosure before Delete; callout-selected trunk state.
- The health sheet remains keyboard reachable with no broken/ambiguous anchors through the new **Anchor health…** palette command; the idle-removal UI test activates **Remove anchor** with Tab/Enter.
- The S2-1 fix keeps canonical content and block IDs untouched; the UI test asserts 11 blocks after both text undos and the canonical count, then the structural undo removes the previously created child.
- The independent leaf-delete probe used a temporary harness script outside the repository; no product files or tests were changed. It confirmed both the absence of the dialog and the removal of the incoming reference edge.

## Open questions / risks

1. **Leaf-block keyboard delete disclosure (S3-8).** Does the product owner want a reference-bearing leaf block to open the delete dialog (or show a reference list) before `⌘Backspace`, or does the existing “no confirmation for a leaf block; undo toast” rule stand? The current implementation follows the UX table but removes the “See also” edge with no disclosure.
2. **S2-1 replay-failure guard.** Should a future patch make the next undo a no-op when a placement rebuild had to discard the text history, instead of letting the unified route fall back to the structural stack?
3. **AC-57 formula-term edit fixture (S3-7).** Add the fixture/table case or record an explicit deferral; it is the remaining evidence gap in the AC-57 row after the image deferral.
4. **S3-3/M3h4.** The TS token module still says 96/32 while the rendered CSS is 88/28; the single-source guard must land before M4/M6 settings, as planned.
5. **S3-5 relink flow.** The confirmation behavior is correct, but selecting the replacement range before opening the modal sheet is not guided by the UI. This is a UX polish item, not an AC-55 failure.

## Product-owner gate

**M3 may proceed to the product-owner VoiceOver/visual gate** with this re-review record. The gate is the product owner’s judgement; this Sentinel review does not substitute automated geometry or axe for it. The S3-8 leaf-delete disclosure decision should be made as part of that gate or recorded as an explicit follow-up. Final M3 acceptance and the M4/PDF unblock should be recorded by the Orchestrator after that pass. Remaining known follow-ups before or alongside later milestones: M3h4 token single-source (88/28), M3c3b image pipeline, AC-57 formula-term edit evidence, axe coverage for M3 surfaces, and the S3-5/S3-6/S3-8 polish items.
