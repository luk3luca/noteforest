# M3h1 — placement undo history and per-group active trunks

**Date:** 6 November 2026  
**Builder:** implementation sub-agent  
**Scope:** S2-1 and S3-1 from `docs/reviews/m3-review.md`. No dialog, token, image,
idle-anchor, spec, UX, ADR, or plan changes.

## Summary

1. **S2-1 — view-only placement no longer clears text undo.** A right↔below change still
   rebuilds the editor projection, but the rebuild now captures the ProseMirror text history,
   starts from the oldest captured document, and replays every event through a `blockBody`
   offset map. Each original history event is closed into its own history entry, so one
   `⌘Z` still undoes one text event and the next `⌘Z` reaches the structural stack. Canonical
   content, block IDs, placement fields and revision are untouched.
2. **S3-1 — each trunk owns only its placement group.** The right trunk now considers only
   `placement: "right"` active children, and the below trunk only `placement: "below"` children.
   Selecting a callout activates the below trunk and mutes the right group; selecting a direct
   child activates the right trunk and mutes the below group. The existing second-right-child
   lead behavior is unchanged.

## Files changed

| File | Change |
|---|---|
| `apps/desktop/src/renderer/src/state/runtime.ts` | Rebuild path preserves text history via capture/replay; projection and document-replace helpers extracted; `applyChildPlacement` no longer calls `resetHistory`. |
| `apps/desktop/src/renderer/src/state/text-history.ts` | New pure helper: capture text events with undo/redo probes, map positions by `blockBody` identity, map each event's steps. |
| `apps/desktop/src/renderer/src/editor/edges/EdgeLayer.tsx` | `trunkActive` filters active child edges by `trunk.placement`. |
| `apps/desktop/test/text-history.test.ts` | Unit regressions: capture/replay, moved edited block, unmoved block while a sibling moves, two-event undo order and block-count stability. |
| `tests/ui/m3-anchor-callout.test.mjs` | UI regressions: callout vs direct-child trunk activation; type in the child that stays right and in the child that the resize moves below → resize → two `⌘Z` press undo both text events with a stable block count, then the next `⌘Z` undoes the structural creation. Screenshot of the callout-active trunk state. |
| `docs/reports/m3h1-placement-undo-active-trunks.md` | This report. |

## How the history replay works

- `captureTextHistory` runs `undo` down to the oldest text state, then `redo` back to the
  present on local `EditorState` copies; the live editor, selection and history plugin are
  unchanged.
- The rebuild starts from the oldest captured document projected with the **new** below set.
  `createBlockPositionMapper` maps every position through the same `blockBody` (block ID +
  offset), so a moved block keeps its text offsets even when its wrapper position changes.
- Every replayed event is dispatched as one transaction with `addToHistory` and
  `closeHistory`, preserving one undo entry per original event.
- After replay the chapter content is compared with the expected projection (StarterKit's
  trailing node is ignored). Any mapping/application failure falls back to the previous
  rebuild with an empty text stack, never a partially replayed document.

## Checks

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| Targeted vitest: text history, adapter, edge routing, placement, undo stack, history routing | 71/71 pass, 0.27 s |
| `npm test` | 495/495 pass, 44 files, 1.78 s |
| `node --test tests/ui/m3-anchor-callout.test.mjs` | 12/12 pass, 18.7 s |
| `npm run test:ui` | 30/30 pass, 11 files, 126.7 s total |
| `npm run e2e:critical` | 21/21 pass, suite 45.2 s |
| `npm run verify:fast` | pass (typecheck + 495 unit + 21 critical e2e) |

Screenshot:

- `artifacts/m3h1/selected-callout-trunks-1440x900.png` — callout selected, right group
  muted, below trunk active.

## Risks and follow-ups

- **History replay cost:** every placement flip with a non-empty text stack replays each text
  event synchronously. Normal documents have shallow text history; a very long text session
  crossing the wrap threshold pays more. The replay is skipped when the text stack is empty.
- **Redo stack:** a placement flip still clears a pending text redo stack (the previous
  behavior cleared both stacks). The reviewed requirement covers undo; redo preservation is a
  possible follow-up.
- **Caret after undo:** replay does not restore the original selection bookmark; undo restores
  text content and block count, but the caret may move to the replayed event boundary.
- **Wrapper-only text events:** if a future text operation ever produces a step outside
  `blockBody` content, the replay falls back to the old rebuild (empty text stack) and logs a
  warning. No current text command does this.
- **Matrix not re-run visually:** the callout-active screenshot covers S3-1; the direct-child
  active state is asserted by classes but not separately screenshotted.
