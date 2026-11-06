# M3c3b2 — image region and point anchors

**Role:** Implementer / Builder  
**Milestone:** M3c3b — deferred image anchors (AC-21)  
**Base:** current `main` after M3c3b1 (`b13d97c` / merge `6e50141`)  
**Worktree:** isolated builder worktree prepared by orchestrator v2  
**Scope:** image anchors only. No PDF/page view, no crop editor, no new dependencies.

## Context

Read `AGENTS.md`, spec §8.10/§15 (AC-21, AC-54, AC-57), UX image-region flow, design §6.1
image section, `packages/core/src/anchors.ts` image selector/resolver, and the M3c3b1 image node view.
The canonical image node already carries `assetId`, optional alt/width/height, and `anchorIds`.
Image selector/binding shapes already exist and validate.

## Required work

### 1. Region and point authoring
- Select an image block; offer **Add region…** (block menu/selection surface) and a clear way to
  create a point anchor (e.g. `⌥`-drag or “Add point…”).
- Drag a rectangle over the rendered image; on release choose **Branch from region** (default) or
  **Cancel**. A point uses a zero-size rect with `point: true` and a larger UI hit area.
- Create the anchor, `anchorIds` binding, branch, and new target through the existing
  `branch.createFromSelection` command with `kind: 'image'`; one undo removes the branch, target,
  anchor, and marker. Reuse the existing callout lane and outline wiring.
- Allow multiple regions on one image; each anchor/marker has its own ID. The region exists only as
  the source of a branch (cancel creates nothing).
- Region markers are numbered/labeled, keyboard reachable, and clicking one selects/navigates to its
  branch. The callout quote chip shows the image alt/label and region/point kind.

### 2. Normalized geometry
- Store `rect` normalized 0–1 to intrinsic image dimensions; `crop` is the full-image rect when no
  crop exists. Never store display pixels.
- Region must survive display resize and editor width changes; verify at 1440 and 960.
- Reject empty/invalid regions; point rect has width/height 0 and `point: true` exactly.
- Keep `anchorIds` sorted/deterministic and remove empty arrays.

### 3. Broken/missing behavior
- Replacing the image asset or removing it must mark the anchor broken, never delete the branch,
  target, or alt text; missing image shows the c3b1 placeholder. Add a **Replace image…** action if
  needed to exercise asset replacement through the UI; otherwise add an app-level command path and
  document the missing UI.
- The health sheet shows the image anchor reason (asset changed/missing/crop changed as applicable),
  preserves the branch, and keeps the existing attach-to-block/delete/keep-broken recovery paths.
  Full “re-pick a new region” repair can be a follow-up if not feasible in this slice; state it
  explicitly.
- Save/reload preserves anchors/markers and broken state; undo/redo restores exactly.

### 4. Tests and evidence
- Core tests for image binding/selector creation and normalized rect/point validation as needed.
- App/UI: create region → marker/callout → branch; second region; point anchor; resize 1440→960;
  save/reload; cancel; undo/redo; missing/replaced asset broken state; health sheet reason.
- Screenshots: region marker/callout, point anchor, missing/broken image anchor.
- No native-dialog waits; use the E2E guard; no fixed sleeps.

## Guardrails

- No new runtime dependency; no schema version bump beyond the existing image fields/`anchorIds`.
- No PDF, page view, crop UI, or M4 work.
- Do not delete branches/targets on asset loss; never auto-reattach a changed asset.
- Do not change text/formula/code anchor behavior.

## Gates

`npm run check:boundaries`, `npm run typecheck`, targeted vitest, `npm test`, `npm run test:ui`,
`npm run e2e:critical`, `npm run test:recovery:run`, `npm run verify:fast`.
The Orchestrator runs one full `npm run verify` after integration.

## Deliverable

Report: worktree path, branch, base, commit, files, selector/binding shape, authoring flow,
normalized geometry, broken-state behavior, tests/timings, screenshots, risks, not verified. Do not
merge or push. Stop and ask if a crop/asset-replacement or repair decision needs a product decision.
