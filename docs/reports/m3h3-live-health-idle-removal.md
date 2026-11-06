# M3h3 — live anchor health and idle-anchor removal

**Role:** Builder
**Milestone:** M3h — Sentinel review fixes
**Scope:** S2-4 and S3-2 only. No spec/UX/ADR/plan, repair-preview/delete-disclosure, token,
placement/undo, or image changes.

## Summary

- **S2-4.** A content commit now bumps the canonical runtime revision and notifies before the disk
  save. `BlockBodyView` subscribes to that revision, so deleting anchored text marks the anchor
  broken in the block warning, callout chip, and anchor marker without another click. Callout state
  is resolved from the canonical document instead of the stale node-view attribute. Undo clears the
  warning everywhere and redo restores it; formula/code anchors share the same path.
- **S3-2.** `buildAnchorHealthRows` now includes idle anchors. The **All anchors** filter lists them
  with a neutral “Idle anchor” status and the UX copy “This anchor has no branches.” An idle row
  offers **Remove anchor**; the runtime guards the path with `removeIdleAnchor`, which rejects any
  anchor with an outgoing branch. Removal deletes the record and content binding, never a target
  block, and is one structural undo entry.
- The health sheet stays keyboard reachable when the repair chip is hidden: a new **Anchor health…**
  command in the command palette opens it (⌘K, search, Enter). The new app test navigates the sheet
  and activates **Remove anchor** with Tab/Enter only.
- `anchor.delete` now coalesces adjacent text nodes after removing a binding. ProseMirror would
  otherwise coalesce them on the next content commit, changing the block after the command and
  invalidating the undo snapshot (“block changed after this command”).

## Files changed

- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx` — runtime-revision subscription;
  live block warning and callout state.
- `apps/desktop/src/renderer/src/state/runtime.ts` — version/notify on content commit; guarded
  `removeIdleAnchor`.
- `apps/desktop/src/renderer/src/lib/anchor-health.ts` — idle projection, summary count, UX reason
  wording.
- `apps/desktop/src/renderer/src/shell/Dialogs.tsx` — idle rows, Remove anchor, All anchors copy,
  idle-only description/details, undo toast.
- `apps/desktop/src/renderer/src/actions.ts` — Anchor health palette command.
- `apps/desktop/src/renderer/src/styles.css` — non-error idle state chip.
- `packages/core/src/commands.ts` — normalize adjacent text nodes when an anchor binding is removed.
- `packages/core/test/anchor-commands.test.ts` — idle removal leaves one coalesced text node.
- `apps/desktop/test/anchor-health.test.ts` — idle projection/filter/summary units.
- `apps/desktop/test/idle-anchor-removal.test.ts` (new) — live guard plus exact idle removal and undo.
- `tests/ui/m3h3-live-health.test.mjs` (new) — live delete warnings/undo/redo and keyboard idle
  removal.
- `package.json` — add the new UI file to `test:ui` and `verify`.

## Evidence

- `artifacts/m3h3/live-broken-warning-1440x900.png` — block **Lost anchor**, callout **Lost anchor**,
  and the status chip after deleting the anchored word with no extra click.
- `artifacts/m3h3/live-broken-repair-1440x900.png` — repair sheet reachable from the live warning.
- `artifacts/m3h3/idle-anchor-health-1440x900.png` — **All anchors** with the neutral idle row and
  **Remove anchor**.
- `artifacts/m3h3/idle-anchor-removed-1440x900.png` — after removal; the target remains.

## Checks

| Check | Result |
|---|---|
| `npm run typecheck` | pass (desktop node/web, core, layout, pdf) |
| targeted vitest: anchor health, idle removal, core anchor commands | 45/45 pass, 0.19 s |
| `npm test` | 505/505 pass, 47 files, 2.13 s |
| `node --test tests/ui/m3h3-live-health.test.mjs` | 2/2 pass, 11.4 s wall (suite 3.3 s after build) |
| `npm run test:ui` | 12/12 files pass, 139.4 s across files plus build |
| `npm run e2e:critical` | 21/21 pass, 53.8 s |
| `npm run verify:fast` | pass (typecheck + 505 unit + 21 critical e2e) |

The new app regressions fail on the pre-fix behavior: the live test times out waiting for the block
warning after deletion, and the idle test has no idle row or Remove action to reach.

## Risks / not verified

- Formula and code anchors share the same revision subscription and live callout derivation; only
  text deletion is exercised through the real editor in the new app test.
- The idle path is intentionally not a general “delete anchor” shortcut: a live anchor is rejected
  by `removeIdleAnchor` and the sheet only renders **Remove anchor** for idle rows.
- With zero broken/ambiguous anchors the status chip stays hidden per spec; idle removal is reached
  through the command palette. This adds a keyboard path without changing the chip rule.
- Removing an anchor binding now coalesces adjacent text nodes. This is VISUALLY and semantically
  neutral but changes the canonical node boundaries for the removed mark.
- Image anchors remain out of scope (no insertion/asset pipeline), unchanged by this task.
